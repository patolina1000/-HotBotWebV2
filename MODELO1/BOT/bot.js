require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const Database = require('better-sqlite3');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const postgres = require('../../postgres.js');

// Reutilizar o pool global do módulo postgres
const pgPool = postgres.createPool();


// Importar gerenciador de mídias
const GerenciadorMidia = require('./utils/midia');

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

// Inicializar gerenciador de mídias
const gerenciadorMidia = new GerenciadorMidia();

// Verificar integridade das mídias na inicialização
console.log('\n🔍 Verificando integridade das mídias...');
const integridade = gerenciadorMidia.verificarIntegridade();
console.log(`✅ Sistema de mídias inicializado (${integridade.porcentagem}% das mídias disponíveis)\n`);

// Inicializar bot com tratamento de erro
let bot;
try {
  // Não usar polling no OnRender, apenas webhook
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
  
  // Configurar webhook
  if (BASE_URL) {
    const webhookUrl = `${BASE_URL}/bot${TELEGRAM_TOKEN}`;
    bot.setWebHook(webhookUrl).then(() => {
      console.log('✅ Webhook configurado:', webhookUrl);
    }).catch(err => {
      console.error('❌ Erro ao configurar webhook:', err);
    });
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

// Função para enviar mídia com fallback
async function enviarMidiaComFallback(chatId, tipoMidia, caminhoMidia, opcoes = {}) {
  if (!caminhoMidia) {
    console.warn('⚠️ Caminho de mídia não fornecido');
    return false;
  }

  try {
    console.log(`📤 Tentando enviar ${tipoMidia}: ${caminhoMidia}`);

    // Se for URL, enviar diretamente
    if (caminhoMidia.startsWith('http')) {
      switch (tipoMidia) {
        case 'photo':
          await bot.sendPhoto(chatId, caminhoMidia, opcoes);
          break;
        case 'video':
          await bot.sendVideo(chatId, caminhoMidia, opcoes);
          break;
        case 'audio':
          await bot.sendAudio(chatId, caminhoMidia, opcoes);
          break;
        default:
          console.warn(`⚠️ Tipo de mídia não suportado: ${tipoMidia}`);
          return false;
      }
      return true;
    }

    // Se for arquivo local, verificar se existe
    const caminhoAbsoluto = path.resolve(__dirname, caminhoMidia);
    
    if (!fs.existsSync(caminhoAbsoluto)) {
      console.warn(`⚠️ Arquivo de mídia não encontrado: ${caminhoAbsoluto}`);
      return false;
    }

    // Criar stream do arquivo
    const stream = fs.createReadStream(caminhoAbsoluto);
    
    switch (tipoMidia) {
      case 'photo':
        await bot.sendPhoto(chatId, stream, opcoes);
        break;
      case 'video':
        await bot.sendVideo(chatId, stream, opcoes);
        break;
      case 'audio':
        await bot.sendAudio(chatId, stream, opcoes);
        break;
      default:
        console.warn(`⚠️ Tipo de mídia não suportado: ${tipoMidia}`);
        return false;
    }

    console.log(`✅ Mídia ${tipoMidia} enviada com sucesso`);
    return true;

  } catch (error) {
    console.error(`❌ Erro ao enviar mídia ${tipoMidia}:`, error.message);
    return false;
  }
}

// Função para gerar cobrança
const gerarCobranca = async (req, res) => {
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
const webhookPushinPay = async (req, res) => {
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
// Salvar token também no PostgreSQL para o sistema web
        try {
      await postgres.executeQuery(
        pgPool,
        'INSERT INTO tokens (token, valor) VALUES ($1, $2)',
        [novoToken, (row.valor || 0) / 100]
      );
      console.log('✅ Token registrado no PostgreSQL:', novoToken);
    } catch (pgErr) {
      console.error('❌ Erro ao registrar token no PostgreSQL:', pgErr.message);
    }

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
      console.log(`📱 Comando /start recebido de ${chatId}`);
      
      // Obter a melhor mídia disponível para o início
      const melhorMidia = gerenciadorMidia.obterMelhorMidia('inicial');
      
      if (melhorMidia) {
        console.log(`📤 Enviando mídia inicial: ${melhorMidia.tipo} - ${melhorMidia.caminho}`);
        
        const sucesso = await enviarMidiaComFallback(
          chatId, 
          melhorMidia.tipoTelegram, 
          melhorMidia.caminho
        );
        
        if (!sucesso) {
          console.warn('⚠️ Falha ao enviar mídia inicial, continuando apenas com texto');
        }
      } else {
        console.warn('⚠️ Nenhuma mídia inicial disponível');
      }

      // Enviar texto inicial
      await bot.sendMessage(chatId, config.inicio.textoInicial, { parse_mode: 'HTML' });

      // Enviar menu inicial
      await bot.sendMessage(chatId, config.inicio.menuInicial.texto, {
        reply_markup: {
          inline_keyboard: config.inicio.menuInicial.opcoes.map(opcao => [{
            text: opcao.texto,
            callback_data: opcao.callback
          }])
        }
      });

      // Registrar usuário no banco
      const existe = db.prepare('SELECT * FROM downsell_progress WHERE telegram_id = ?').get(chatId);
      if (!existe) {
        db.prepare('INSERT INTO downsell_progress (telegram_id, index_downsell) VALUES (?, ?)').run(chatId, 0);
      }
      
      console.log(`✅ Resposta enviada para ${chatId}`);
    } catch (error) {
      console.error('❌ Erro no comando /start:', error);
      
      // Enviar mensagem de erro amigável
      try {
        await bot.sendMessage(chatId, config.erros?.erroGenerico || '❌ Ocorreu um erro. Tente novamente.');
      } catch (e) {
        console.error('❌ Erro ao enviar mensagem de erro:', e);
      }
    }
  });

  // Tratamento dos botões
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    
    try {
      console.log(`🔘 Callback recebido: ${data} de ${chatId}`);
      
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
      
      try {
        await bot.sendMessage(chatId, config.erros?.erroGenerico || '❌ Ocorreu um erro. Tente novamente.');
      } catch (e) {
        console.error('❌ Erro ao enviar mensagem de erro:', e);
      }
    }
  });
}

console.log('✅ Bot configurado e rodando');



// Função para enviar downsells automaticamente
async function enviarDownsells() {
  try {
    console.log('🔄 Executando envio de downsells...');
    
    // Buscar todos os usuários que ainda não pagaram
    const usuarios = db.prepare(`
      SELECT telegram_id, index_downsell 
      FROM downsell_progress 
      WHERE pagou = 0
    `).all();
    
    console.log(`📊 Encontrados ${usuarios.length} usuários para processar`);
    
    for (const usuario of usuarios) {
      const { telegram_id, index_downsell } = usuario;
      
      // Verificar se ainda há downsells para enviar
      if (index_downsell >= config.downsells.length) {
        console.log(`⏭️ Usuário ${telegram_id} já recebeu todos os downsells`);
        continue;
      }
      
      const downsell = config.downsells[index_downsell];
      
      if (!downsell) {
        console.log(`⚠️ Downsell não encontrado para índice ${index_downsell}`);
        continue;
      }
      
      try {
        console.log(`📤 Enviando downsell ${index_downsell} para usuário ${telegram_id}`);
        
        // Obter a melhor mídia disponível para este downsell
        const melhorMidia = gerenciadorMidia.obterMelhorMidia('downsell', downsell.id);
        
        // Enviar mídia se disponível
        if (melhorMidia) {
          const sucesso = await enviarMidiaComFallback(
            telegram_id,
            melhorMidia.tipoTelegram,
            melhorMidia.caminho
          );
          
          if (!sucesso) {
            console.warn(`⚠️ Falha ao enviar mídia para usuário ${telegram_id}`);
          }
        }
        
        // Preparar botões inline se existirem
        let replyMarkup = null;
        if (downsell.planos && downsell.planos.length > 0) {
          const botoes = downsell.planos.map(plano => [{
            text: `${plano.emoji} ${plano.nome} — R$${plano.valorComDesconto.toFixed(2)}`,
            callback_data: plano.id
          }]);
          
          replyMarkup = { inline_keyboard: botoes };
        }
        
        // Enviar texto do downsell
        await bot.sendMessage(telegram_id, downsell.texto, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup
        });
        
        // Atualizar índice do downsell no banco
        db.prepare(`
          UPDATE downsell_progress 
          SET index_downsell = ? 
          WHERE telegram_id = ?
        `).run(index_downsell + 1, telegram_id);
        
        console.log(`✅ Downsell enviado com sucesso para ${telegram_id}`);
        
        // Pequena pausa entre envios para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Erro ao enviar downsell para ${telegram_id}:`, error.message);
      }
    }
    
    console.log('✅ Ciclo de downsells concluído');
    
  } catch (error) {
    console.error('❌ Erro geral na função enviarDownsells:', error.message);
  }
}

// Comando /status
if (bot) {
  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const usuario = db.prepare(`
        SELECT index_downsell, pagou 
        FROM downsell_progress 
        WHERE telegram_id = ?
      `).get(chatId);
      
      if (!usuario) {
        await bot.sendMessage(chatId, '❌ Usuário não encontrado. Use /start primeiro.');
        return;
      }
      
      const statusPagamento = usuario.pagou === 1 ? 'JÁ PAGOU ✅' : 'NÃO PAGOU ❌';
      const totalDownsells = config.downsells.length;
      
      const mensagem = `
📊 <b>SEU STATUS:</b>

💰 <b>Pagamento:</b> ${statusPagamento}
📈 <b>Downsell atual:</b> ${usuario.index_downsell}/${totalDownsells}
🔄 <b>Próximo downsell:</b> ${usuario.index_downsell >= totalDownsells ? 'Finalizado' : 'Em breve'}

${usuario.pagou === 0 ? '💡 <i>Você receberá ofertas especiais automaticamente!</i>' : '🎉 <i>Obrigado pela sua compra!</i>'}
      `.trim();
      
      await bot.sendMessage(chatId, mensagem, { parse_mode: 'HTML' });
      
    } catch (error) {
      console.error('❌ Erro no comando /status:', error.message);
      await bot.sendMessage(chatId, '❌ Erro ao verificar status. Tente novamente.');
    }
  });
}

// Comando /resert (reiniciar funil)
if (bot) {
  bot.onText(/\/resert/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      // Verificar se o usuário existe
      const usuario = db.prepare(`
        SELECT telegram_id 
        FROM downsell_progress 
        WHERE telegram_id = ?
      `).get(chatId);
      
      if (!usuario) {
        await bot.sendMessage(chatId, '❌ Usuário não encontrado. Use /start primeiro.');
        return;
      }
      
      // Resetar o funil
      db.prepare(`
        UPDATE downsell_progress 
        SET pagou = 0, index_downsell = 0 
        WHERE telegram_id = ?
      `).run(chatId);
      
      await bot.sendMessage(chatId, `
🔄 <b>Funil reiniciado com sucesso!</b>

✅ Status de pagamento resetado
✅ Downsells reiniciados
📬 Você voltará a receber ofertas automaticamente

💡 <i>Use /status para verificar seu novo status</i>
      `.trim(), { parse_mode: 'HTML' });
      
      console.log(`🔄 Funil reiniciado para usuário ${chatId}`);
      
    } catch (error) {
      console.error('❌ Erro no comando /resert:', error.message);
      await bot.sendMessage(chatId, '❌ Erro ao reiniciar funil. Tente novamente.');
    }
  });
}

// Configurar execução automática dos downsells a cada 10 minutos
if (bot) {
  console.log('⏰ Configurando envio automático de downsells (10 minutos)...');
  
  // Executar pela primeira vez após 10 minutos da inicialização
  setTimeout(() => {
    enviarDownsells();
  }, 600000);
  
  // Configurar intervalo de 10 minutos (600000 ms)
  setInterval(() => {
    enviarDownsells();
  }, 600000);
  
  console.log('✅ Sistema de downsells automático ativado!');
}

// Exportar função para uso manual se necessário
module.exports = {
  ...module.exports,
  enviarDownsells
};