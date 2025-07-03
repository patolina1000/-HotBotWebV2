require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Database = require('better-sqlite3');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Só importar sharp se necessário e tratar erros
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  console.warn('⚠️ Sharp não disponível, usando fallback para imagens');
  sharp = null;
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PUSHINPAY_TOKEN = process.env.PUSHINPAY_TOKEN;
const BASE_URL = process.env.BASE_URL;
const FRONTEND_URL = process.env.FRONTEND_URL || BASE_URL;

// Verificar variáveis essenciais
if (!TELEGRAM_TOKEN) {
  console.error('❌ TELEGRAM_TOKEN não definido!');
  process.exit(1);
}

if (!PUSHINPAY_TOKEN) {
  console.error('❌ PUSHINPAY_TOKEN não definido!');
  process.exit(1);
}

if (!BASE_URL) {
  console.error('❌ BASE_URL não definido!');
  process.exit(1);
}

// Inicializar bot com tratamento de erro
let bot;
try {
  bot = new TelegramBot(TELEGRAM_TOKEN);
  
  // Configurar webhook apenas se BASE_URL estiver definido
  if (BASE_URL) {
    bot.setWebHook(`${BASE_URL}/bot${TELEGRAM_TOKEN}`);
    console.log('✅ Webhook configurado');
  }
} catch (error) {
  console.error('❌ Erro ao inicializar bot:', error);
  process.exit(1);
}

// Configurar banco de dados com tratamento de erro
let db;
try {
  db = new Database('./pagamentos.db');
  
  // Criar tabelas
  db.prepare(`
    CREATE TABLE IF NOT EXISTS downsell_progress (
      telegram_id TEXT PRIMARY KEY,
      index_downsell INTEGER,
      pagou INTEGER DEFAULT 0
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS tokens (
      token TEXT PRIMARY KEY,
      telegram_id TEXT,
      valor INTEGER,
      utm_source TEXT,
      utm_campaign TEXT,
      utm_medium TEXT,
      status TEXT DEFAULT 'pendente',
      token_uuid TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Verificar e adicionar colunas
  const colunas = db.prepare("PRAGMA table_info(tokens)").all();
  const temColunaTokenUuid = colunas.some(col => col.name === 'token_uuid');
  
  if (!temColunaTokenUuid) {
    db.prepare("ALTER TABLE tokens ADD COLUMN token_uuid TEXT").run();
  }

  const colunasDownsell = db.prepare("PRAGMA table_info(downsell_progress)").all();
  const temColunaPagou = colunasDownsell.some(col => col.name === 'pagou');

  if (!temColunaPagou) {
    db.prepare("ALTER TABLE downsell_progress ADD COLUMN pagou INTEGER DEFAULT 0").run();
  }

  console.log('✅ Banco de dados configurado');
} catch (error) {
  console.error('❌ Erro ao configurar banco:', error);
  process.exit(1);
}

// Importar config com tratamento de erro
let config;
try {
  config = require('./config');
} catch (error) {
  console.error('❌ Erro ao carregar config:', error);
  // Usar config padrão mínimo
  config = {
    formatarValorCentavos: (valor) => Math.round(parseFloat(valor) * 100),
    inicio: {
      tipoMidia: 'texto',
      textoInicial: 'Olá! Bem-vindo ao bot.',
      menuInicial: {
        texto: 'Escolha uma opção:',
        opcoes: [
          { texto: 'Ver Planos', callback: 'mostrar_planos' },
          { texto: 'Prévias', callback: 'ver_previas' }
        ]
      }
    },
    planos: [
      { id: 'plano1', nome: 'Plano Básico', emoji: '💎', valor: 10.00 }
    ],
    downsells: [],
    canalPrevias: '@seucanal',
    pagamento: {
      pendente: '⏳ Pagamento pendente. Verifique novamente.',
      aprovado: '✅ Pagamento aprovado!'
    },
    mensagemPix: (nome, valor, pixCopia) => `
💎 <b>${nome}</b>
💰 Valor: R$ ${valor.toFixed(2)}

📋 <b>PIX Copia e Cola:</b>
<code>${pixCopia}</code>

⏰ <b>Importante:</b> Após o pagamento, clique em "Verificar Status" para liberar o acesso.
    `
  };
}

// Função para processar imagem com fallback
async function processarImagem(imageBuffer) {
  if (!sharp) {
    // Sem sharp, retornar buffer original
    return imageBuffer;
  }
  
  try {
    return await sharp(imageBuffer)
      .extend({ 
        top: 40, 
        bottom: 40, 
        left: 40, 
        right: 40, 
        background: { r: 255, g: 255, b: 255, alpha: 1 } 
      })
      .png()
      .toBuffer();
  } catch (error) {
    console.warn('⚠️ Erro ao processar imagem, usando original:', error.message);
    return imageBuffer;
  }
}

// Endpoint para gerar cobrança
module.exports.gerarCobranca = async (req, res) => {
  const { plano, valor, utm_source, utm_campaign, utm_medium, telegram_id } = req.body;
    
  if (!plano || !valor) {
    return res.status(400).json({ error: 'Parâmetros inválidos: plano e valor são obrigatórios.' });
  }

  const valorCentavos = config.formatarValorCentavos(valor);
  if (isNaN(valorCentavos) || valorCentavos < 50) {
    return res.status(400).json({ error: 'Valor mínimo é R$0,50.' });
  }

  try {
    const response = await axios.post(
      'https://api.pushinpay.com.br/api/pix/cashIn',
      {
        value: valorCentavos,
        webhook_url: `${BASE_URL}/webhook/pushinpay`
      },
      {
        headers: {
          Authorization: `Bearer ${PUSHINPAY_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      }
    );
    
    const { qr_code_base64, qr_code, id } = response.data;
    const normalizedId = id.toLowerCase();
    const pix_copia_cola = qr_code;
    
    console.log(`✅ Token ${normalizedId} salvo no banco com valor ${valorCentavos}`);

    db.prepare(`
      INSERT INTO tokens (token, valor, status, telegram_id, utm_source, utm_campaign, utm_medium)
      VALUES (?, ?, 'pendente', ?, ?, ?, ?)
    `).run(normalizedId, valorCentavos, telegram_id, utm_source, utm_campaign, utm_medium);

    res.json({
      qr_code_base64,
      qr_code,
      pix_copia_cola: pix_copia_cola || qr_code,
      transacao_id: normalizedId
    });
  } catch (error) {
    console.error("❌ Erro ao gerar cobrança:", error.response?.data || error.message);
    res.status(500).json({
      error: 'Erro ao gerar cobrança na API PushinPay.',
      detalhes: error.response?.data || error.message
    });
  }
};

// Webhook do PushinPay
module.exports.webhookPushinPay = async (req, res) => {
  try {
    console.log('📨 Webhook recebido:', req.body);

    const payload = req.body;
    const { id, status } = payload || {};
    
    const normalizedId = id ? id.toLowerCase() : null;
    
    if (!normalizedId || status !== 'paid') return res.sendStatus(200);

    const row = db.prepare('SELECT * FROM tokens WHERE token = ?').get(normalizedId);

    if (!row) {
      console.log('❌ Token não encontrado no banco:', normalizedId);
      return res.status(400).send('Transação não encontrada');
    }

    const novoToken = uuidv4();
    
    db.prepare(`
      UPDATE tokens
      SET token_uuid = ?, 
          status = 'valido', 
          criado_em = CURRENT_TIMESTAMP
      WHERE token = ?
    `).run(novoToken, normalizedId);

    if (row.telegram_id) {
      db.prepare(`
        UPDATE downsell_progress 
        SET pagou = 1 
        WHERE telegram_id = ?
      `).run(row.telegram_id);
      
      console.log(`✅ Usuário ${row.telegram_id} marcado como "pagou"`);
    }

    if (row.telegram_id && bot) {
      const valorReais = (row.valor / 100).toFixed(2);
      const linkComToken = `${FRONTEND_URL}/obrigado.html?token=${novoToken}&valor=${valorReais}`;
      
      await bot.sendMessage(row.telegram_id, 
        `🎉 <b>Pagamento aprovado!</b>\n\n💰 Valor: R$ ${valorReais}\n🔗 Acesse seu conteúdo: ${linkComToken}`, 
        { parse_mode: 'HTML' }
      );
    }
    
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Erro no webhook:', err.message);
    res.sendStatus(500);
  }
};

// Comando /start
if (bot) {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      if (config.inicio.tipoMidia === 'imagem' && config.inicio.midia) {
        await bot.sendPhoto(chatId, config.inicio.midia);
      } else if (config.inicio.tipoMidia === 'video' && config.inicio.midia) {
        await bot.sendVideo(chatId, config.inicio.midia);
      }

      if (config.inicio.audio) {
        await bot.sendVoice(chatId, config.inicio.audio);
      }

      await bot.sendMessage(chatId, config.inicio.textoInicial, { parse_mode: 'HTML' });

      await bot.sendMessage(chatId, config.inicio.menuInicial.texto, {
        reply_markup: {
          inline_keyboard: config.inicio.menuInicial.opcoes.map(opcao => [{
            text: opcao.texto,
            callback_data: opcao.callback
          }])
        }
      });

      const existe = db.prepare('SELECT * FROM downsell_progress WHERE telegram_id = ?').get(chatId);
      if (!existe) {
        db.prepare('INSERT INTO downsell_progress (telegram_id, index_downsell) VALUES (?, ?)').run(chatId, 0);
      }
    } catch (error) {
      console.error('❌ Erro no comando /start:', error);
    }
  });

  // Tratamento dos botões
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    
    try {
      if (data === 'mostrar_planos') {
        const botoesPlanos = config.planos.map(plano => ([{
          text: `${plano.emoji} ${plano.nome} — por R$${plano.valor.toFixed(2)}`,
          callback_data: plano.id
        }]));
        return bot.sendMessage(chatId, '💖 Escolha seu plano abaixo:', {
          reply_markup: { inline_keyboard: botoesPlanos }
        });
      }

      if (data === 'ver_previas') {
        return bot.sendMessage(chatId, `🙈 <b>Prévias:</b>\n\n💗 Acesse nosso canal:\n👉 ${config.canalPrevias}`, {
          parse_mode: 'HTML'
        });
      }

      // Verificar pagamento
      if (data.startsWith('verificar_pagamento_')) {
        const transacaoId = data.replace('verificar_pagamento_', '');

        const tokenRow = db.prepare(`
          SELECT token_uuid, status, valor, telegram_id FROM tokens
          WHERE token = ?
          LIMIT 1
        `).get(transacaoId);

        if (!tokenRow) {
          return bot.sendMessage(chatId, '❌ Pagamento não encontrado.');
        }

        if (tokenRow.status !== 'valido' || !tokenRow.token_uuid) {
          return bot.sendMessage(chatId, config.pagamento.pendente);
        }

        db.prepare(`
          UPDATE downsell_progress 
          SET pagou = 1 
          WHERE telegram_id = ?
        `).run(chatId);

        const valorReais = (tokenRow.valor / 100).toFixed(2);
        const linkComToken = `${FRONTEND_URL}/obrigado.html?token=${tokenRow.token_uuid}&valor=${valorReais}`;
        
        await bot.sendMessage(chatId, config.pagamento.aprovado);
        await bot.sendMessage(chatId, `<b>🎉 Pagamento aprovado!</b>\n\n🔗 Acesse: ${linkComToken}`, {
          parse_mode: 'HTML'
        });

        return;
      }

      // Processar compra de plano
      const plano = config.planos.find(p => p.id === data);
      if (plano) {
        const resposta = await axios.post(`${BASE_URL}/api/gerar-cobranca`, {
          telegram_id: chatId,
          plano: plano.nome,
          valor: plano.valor,
          utm_source: 'telegram',
          utm_campaign: 'bot_principal',
          utm_medium: 'telegram_bot'
        });

        const { qr_code_base64, pix_copia_cola, transacao_id } = resposta.data;
        
        let buffer;
        if (qr_code_base64) {
          const base64Image = qr_code_base64.replace(/^data:image\/png;base64,/, '');
          const imageBuffer = Buffer.from(base64Image, 'base64');
          buffer = await processarImagem(imageBuffer);
        }

        const legenda = config.mensagemPix(plano.nome, plano.valor, pix_copia_cola);
        
        if (buffer) {
          await bot.sendPhoto(chatId, buffer, {
            caption: legenda,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Verificar Status', callback_data: `verificar_pagamento_${transacao_id}` }]
              ]
            }
          });
        } else {
          await bot.sendMessage(chatId, legenda, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Verificar Status', callback_data: `verificar_pagamento_${transacao_id}` }]
              ]
            }
          });
        }
      }
    } catch (error) {
      console.error('❌ Erro ao processar callback:', error);
      bot.sendMessage(chatId, '❌ Ocorreu um erro. Tente novamente.');
    }
  });
}

console.log('✅ Bot configurado e rodando');