  require('dotenv').config();
  const TelegramBot = require('node-telegram-bot-api');
  const axios = require('axios');
  const express = require('express');
  const bodyParser = require('body-parser');
  const cors = require('cors');
  const sharp = require('sharp');
  const config = require('./config');
  const Database = require('better-sqlite3');
  const fs = require('fs');

  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  const PUSHINPAY_TOKEN = process.env.PUSHINPAY_TOKEN;
  const BASE_URL = process.env.BASE_URL;

  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  const bot = new TelegramBot(TELEGRAM_TOKEN);
  bot.setWebHook(`${BASE_URL}/bot${TELEGRAM_TOKEN}`);

  app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });


  const db = new Database('./pagamentos.db');
  db.prepare(`
    CREATE TABLE IF NOT EXISTS downsell_progress (
      telegram_id TEXT PRIMARY KEY,
      index_downsell INTEGER
    )
  `).run();

  // Criação da tabela, caso não exista
  db.prepare(`
    CREATE TABLE IF NOT EXISTS tokens (
      token TEXT PRIMARY KEY,
      telegram_id TEXT,
      valor INTEGER,
      utm_source TEXT,
      utm_campaign TEXT,
      utm_medium TEXT,
      status TEXT DEFAULT 'pendente',
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Adição da coluna token_uuid se não existir
  const colunas = db.prepare("PRAGMA table_info(tokens)").all();
  const temColunaTokenUuid = colunas.some(col => col.name === 'token_uuid');

  if (!temColunaTokenUuid) {
    db.prepare("ALTER TABLE tokens ADD COLUMN token_uuid TEXT").run();
  }



  app.post('/api/gerar-cobranca', async (req, res) => {
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
    
    // ✅ CORREÇÃO: Normalizar ID para minúsculo
    const { qr_code_base64, qr_code, id } = response.data;
    const normalizedId = id.toLowerCase(); // 🔧 CONVERSÃO AQUI
    const pix_copia_cola = qr_code;
    
    console.log(`✅ Token ${normalizedId} salvo no banco com valor ${valorCentavos}`);

    // ✅ Salva com ID normalizado
    db.prepare(`
      INSERT INTO tokens (token, valor, status, telegram_id, utm_source, utm_campaign, utm_medium)
      VALUES (?, ?, 'pendente', ?, ?, ?, ?)
    `).run(normalizedId, valorCentavos, telegram_id, utm_source, utm_campaign, utm_medium);

    res.json({
      qr_code_base64,
      qr_code,
      pix_copia_cola: pix_copia_cola || qr_code,
      transacao_id: normalizedId // 🔧 RETORNA O ID NORMALIZADO
    });
  } catch (error) {
    console.error("❌ Erro ao gerar cobrança:", error.response?.data || error.message);
    res.status(500).json({
      error: 'Erro ao gerar cobrança na API PushinPay.',
      detalhes: error.response?.data || error.message
    });
  }
});



  const { v4: uuidv4 } = require('uuid'); // no topo do arquivo
  app.get('/verify-token', (req, res) => {
  const { token } = req.query;
  const row = db.prepare('SELECT * FROM tokens WHERE token_uuid = ? AND status = "valido"').get(token);
  res.status(row ? 200 : 404).json(row ? { valid: true } : { valid: false });
});

 app.post('/webhook/pushinpay', async (req, res) => {
  try {
    console.log('📨 Webhook recebido:', req.body);

    const payload = req.body;
    const { id, status } = payload || {};
    
    // 🔧 NORMALIZAR ID AQUI TAMBÉM
    const normalizedId = id ? id.toLowerCase() : null;
    
    console.log('🔍 ID original recebido:', id);
    console.log('🔍 ID normalizado:', normalizedId);
    console.log('📌 Status recebido:', status);

    if (!normalizedId || status !== 'paid') return res.sendStatus(200);

    // 🔧 BUSCAR COM ID NORMALIZADO
    const row = db.prepare('SELECT * FROM tokens WHERE token = ?').get(normalizedId);
    console.log('📦 Token encontrado:', row);

    if (!row) {
      console.log('❌ Token não encontrado no banco:', normalizedId);
      return res.status(400).send('Transação não encontrada');
    }

    const novoToken = uuidv4();
    
    // ✅ Atualizar token
    db.prepare(`
      UPDATE tokens
      SET token_uuid = ?, 
          status = 'valido', 
          criado_em = CURRENT_TIMESTAMP
      WHERE token = ?
    `).run(novoToken, normalizedId);

    console.log(`✅ Token atualizado para: ${novoToken}`);
    
    // 🔧 ENVIAR MENSAGEM DE SUCESSO NO TELEGRAM
    if (row.telegram_id) {
      const valorReais = (row.valor / 100).toFixed(2);
      const linkComToken = `${BASE_URL}/obrigado.html?token=${novoToken}&valor=${valorReais}`;
      
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
});

      // ✅ Coloque isso no final, fora de qualquer rota:
      app.listen(PORT, () => {
        console.log(`🚀 Servidor rodando na porta ${PORT}`);
  });


  // Comando /start
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    if (config.inicio.tipoMidia === 'imagem') {
      await bot.sendPhoto(chatId, config.inicio.midia);
    } else {
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
  });

  // Tratamento dos botões
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'mostrar_planos') {
      const botoesPlanos = config.planos.map(plano => ([{
        text: `${plano.emoji} ${plano.nome} — por R$${plano.valor.toFixed(2)}`,
        callback_data: plano.id
      }]));
      return bot.sendMessage(chatId, '💖 Escolha seu plano abaixo, titio:', {
        reply_markup: { inline_keyboard: botoesPlanos }
      });
    }

    if (data === 'ver_previas') {
      return bot.sendMessage(chatId, `🙈 <b>Pronto pra espiar?</b>\n\n💗 Entra no meu canal exclusivo de prévias grátis:\n👉 ${config.canalPrevias}\n\nLá dentro tem umas coisinhas que vão deixar o titio querendo mais... 😏`, {
        parse_mode: 'HTML'
      });
    }

if (data.startsWith('verificar_pagamento_')) {
  const transacaoId = data.replace('verificar_pagamento_', '');

  const tokenRow = db.prepare(`
    SELECT token_uuid, status, valor FROM tokens
    WHERE token = ?
    LIMIT 1
  `).get(transacaoId);

  if (!tokenRow) {
    return bot.sendMessage(chatId, '❌ Pagamento não encontrado.');
  }

  if (tokenRow.status !== 'valido' || !tokenRow.token_uuid) {
    return bot.sendMessage(chatId, config.pagamento.pendente);
  }

  // ✅ NOVA VERSÃO: Inclui o parâmetro valor no link
  const valorReais = (tokenRow.valor / 100).toFixed(2);
  const linkComToken = `https://seudominio.com/obrigado.html?token=${tokenRow.token_uuid}&valor=${valorReais}`;
  
  await bot.sendMessage(chatId, config.pagamento.aprovado);
  await bot.sendMessage(chatId, `<b>🎉 Pagamento aprovado!</b>\n\n🔗 Acesse seu conteúdo: ${linkComToken}`, {
    parse_mode: 'HTML'
  });

  return;
  }

    if (data.startsWith('comprar_')) {
      const partes = data.split('_');
      const downsellId = partes[1];
      const planoId = partes.slice(2).join('_');
      const etapa = config.downsells.find(ds => ds.id === downsellId);
      if (!etapa) return;
      const plano = etapa.planos.find(p => p.id === planoId);
      if (!plano) return;

      try {
        const resposta = await axios.post(`${BASE_URL}/api/gerar-cobranca`, {
            telegram_id: chatId,
            plano: plano.nome,
            valor: plano.valorComDesconto,
            utm_source: 'telegram',
            utm_campaign: 'downsell',
            utm_medium: 'telegram_bot'
          });

        const { qr_code_base64, pix_copia_cola, transacao_id } = resposta.data;
        const base64Image = qr_code_base64.replace(/^data:image\/png;base64,/, '');
        const imageBuffer = Buffer.from(base64Image, 'base64');
        const buffer = await sharp(imageBuffer)
          .extend({ top: 40, bottom: 40, left: 40, right: 40, background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .png()
          .toBuffer();

        const legenda = config.mensagemPix(plano.nome, plano.valorComDesconto, pix_copia_cola);

        await bot.sendPhoto(chatId, buffer, {
          caption: legenda,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Verificar Status do Pagamento', callback_data: `verificar_pagamento_${transacao_id}` }]
            ]
          }
        });

      } catch (err) {
        console.error('Erro ao gerar cobrança:', err.response?.data || err.message);
        bot.sendMessage(chatId, '❌ Ocorreu um erro ao gerar o PIX. Tente novamente mais tarde.');
      }
      return;
    }

    const plano = config.planos.find(p => p.id === data);
    if (!plano) return;

    try {
      const resposta = await axios.post(`${BASE_URL}/api/gerar-cobranca`, {
        telegram_id: chatId,
        plano: plano.nome,
        valor: plano.valor,
        utm_source: 'telegram',
        utm_campaign: 'bot_principal',
        utm_medium: 'telegram_bot'
      });

      const { qr_code_base64, pix_copia_cola, transacao_id } = resposta.data;
      const base64Image = qr_code_base64.replace(/^data:image\/png;base64,/, '');
      const imageBuffer = Buffer.from(base64Image, 'base64');
      const buffer = await sharp(imageBuffer)
        .extend({ top: 40, bottom: 40, left: 40, right: 40, background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toBuffer();

      const legenda = config.mensagemPix(plano.nome, plano.valor, pix_copia_cola);
      await bot.sendPhoto(chatId, buffer, {
      caption: legenda,
      parse_mode: 'HTML',
      reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Verificar Status do Pagamento', callback_data: `verificar_pagamento_${transacao_id}` }]
      ]
    }
  });


    } catch (err) {
      console.error('Erro ao gerar cobrança:', err.response?.data || err.message);
      bot.sendMessage(chatId, '❌ Ocorreu um erro ao gerar o PIX. Tente novamente mais tarde.');
    }
  });

  // Envio automático dos downsells
  const enviarDownsells = async () => {
    const usuarios = db.prepare('SELECT telegram_id, index_downsell FROM downsell_progress').all();

    for (const usuario of usuarios) {
      const chatId = usuario.telegram_id;
      const indexAtual = usuario.index_downsell;
      const downsell = config.downsells[indexAtual];
      if (!downsell) continue;

      try {
        const botoes = downsell.planos.map(plano => [{
          text: `${plano.emoji} ${plano.nome} por R$${plano.valorComDesconto.toFixed(2)} (${Math.round(100 - (plano.valorComDesconto * 100 / plano.valorOriginal))}% OFF)`,
          callback_data: `comprar_${downsell.id}_${plano.id}`
        }]);

        if (fs.existsSync(downsell.midia)) {
          if (downsell.midia.endsWith('.mp4')) {
            await bot.sendVideo(chatId, downsell.midia, {
              caption: downsell.texto,
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: botoes }
            });
          } else {
            await bot.sendPhoto(chatId, downsell.midia, {
              caption: downsell.texto,
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: botoes }
            });
          }
        } else {
          console.warn(`⚠️ Mídia não encontrada: ${downsell.midia}`);
          await bot.sendMessage(chatId, downsell.texto, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: botoes }
          });
        }

        db.prepare('UPDATE downsell_progress SET index_downsell = ? WHERE telegram_id = ?')
          .run(indexAtual + 1, chatId);
      } catch (err) {
        console.error(`Erro ao enviar downsell para ${chatId}:`, err.message);
      }
    }
  };

  setInterval(() => {
    enviarDownsells();
  }, 60 * 1000);