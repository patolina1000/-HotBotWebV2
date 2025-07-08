// TelegramBotService - módulo modularizado para bot do Telegram

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const schedule = require('node-schedule');
const postgres = require('./database');

let sharp;
try {
  sharp = require('sharp');
} catch (err) {
  sharp = null;
}

function normalizeTelegramId(id) {
  if (id === null || id === undefined) return null;
  const parsed = parseInt(id.toString(), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

class TelegramBotService {
  constructor(telegramToken, config, baseUrl, db, pgPool, botId) {
    this.telegramToken = telegramToken;
    this.botToken = telegramToken;
    this.config = config || {};
    this.baseUrl = baseUrl;
    this.frontendUrl = baseUrl;
    this.botId = botId || 'default';
    this.db = db;
    this.pgPool = pgPool;
    this.processingDownsells = new Map();

    console.log(`[${this.botId}] Inicializando TelegramBotService`);

    if (!telegramToken) {
      console.error(`[${this.botId}] telegramToken não fornecido`);
      return;
    }

    try {
      this.bot = new TelegramBot(telegramToken, { polling: false });
      console.log(`[${this.botId}] Instância TelegramBot criada`);
    } catch (err) {
      console.error(`[${this.botId}] Erro ao criar instância TelegramBot:`, err);
    }

    if (!this.bot) {
      console.error(`[${this.botId}] this.bot está indefinido`);
    }

    if (this.bot) {
      const origProcessUpdate = this.bot.processUpdate.bind(this.bot);
      this.bot.processUpdate = (update) => {
        const snippet = JSON.stringify(update).slice(0, 200);
        console.log(`[${this.botId}] processUpdate chamado:`, snippet);
        return origProcessUpdate(update);
      };

      ['sendMessage', 'sendPhoto', 'sendVideo', 'sendVoice'].forEach(m => {
        const original = this.bot[m].bind(this.bot);
        this.bot[m] = async (...args) => {
          const target = args[0];
          const info = m === 'sendMessage' ? args[1] : args[1];
          console.log(`[${this.botId}] Enviando ${m} para ${target}:`, typeof info === 'string' ? info.slice(0, 200) : '');
          try {
            return await original(...args);
          } catch (e) {
            console.error(`[${this.botId}] Erro ao enviar ${m}:`, e.message);
            throw e;
          }
        };
      });
    }

    if (baseUrl) {
      const webhookPath = `/webhook/${this.botId}/${telegramToken}`;
      const webhookUrl = `${baseUrl}${webhookPath}`;
      console.log(`[${this.botId}] Configurando webhook em ${webhookUrl}`);
      (async () => {
        try {
          await axios.get(`https://api.telegram.org/bot${this.botToken}/deleteWebhook`);
          console.log(`[${this.botId}] Webhook antigo deletado`);
        } catch (e) {
          console.warn(`[${this.botId}] ⚠️ Não foi possível remover webhook antigo:`, e.message);
        }
        this.bot
          .setWebHook(webhookUrl)
          .then(() => console.log(`[${this.botId}] ✅ Webhook configurado com sucesso: ${webhookUrl}`))
          .catch(err => console.error(`[${this.botId}] ❌ Erro ao configurar webhook:`, err.message));
      })();
    }

    this.setupListeners();
    this.startarMensagensPeriodicas();
  }

  async processarImagem(imageBuffer) {
    if (!sharp) return imageBuffer;
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
    } catch (err) {
      console.warn('⚠️ Erro ao processar imagem, usando original:', err.message);
      return imageBuffer;
    }
  }

  async enviarMidiaComFallback(chatId, tipoMidia, caminhoMidia, opcoes = {}) {
    if (!caminhoMidia) return false;
    try {
      console.log(`[${this.botId}] Enviando ${tipoMidia} para ${chatId} via ${caminhoMidia}`);
      if (caminhoMidia.startsWith('http')) {
        switch (tipoMidia) {
          case 'photo':
            await this.bot.sendPhoto(chatId, caminhoMidia, opcoes);
            break;
          case 'video':
            await this.bot.sendVideo(chatId, caminhoMidia, opcoes);
            break;
          case 'audio':
            await this.bot.sendVoice(chatId, caminhoMidia, opcoes);
            break;
          default:
            return false;
        }
        return true;
      }

      const abs = path.resolve(__dirname, caminhoMidia);
      if (!fs.existsSync(abs)) return false;
      console.log(`[${this.botId}] Carregando arquivo local ${abs}`);
      const stream = fs.createReadStream(abs);
      switch (tipoMidia) {
        case 'photo':
          await this.bot.sendPhoto(chatId, stream, opcoes);
          break;
        case 'video':
          await this.bot.sendVideo(chatId, stream, opcoes);
          break;
        case 'audio':
          await this.bot.sendVoice(chatId, stream, opcoes);
          break;
        default:
          return false;
      }
      return true;
    } catch (err) {
      console.error(`❌ Erro ao enviar mídia ${tipoMidia}:`, err.message);
      return false;
    }
  }

  async enviarMidiasHierarquicamente(chatId, midias) {
    if (!midias) return;
    const ordem = ['audio', 'video', 'photo'];
    for (const tipo of ordem) {
      let caminho = null;
      if (tipo === 'photo') {
        caminho = midias.foto || midias.imagem;
      } else {
        caminho = midias[tipo];
      }
      if (!caminho) continue;
      console.log(`[${this.botId}] Preparando envio de ${tipo} para ${chatId} - ${caminho}`);
      if (!caminho.startsWith('http')) {
        const abs = path.resolve(__dirname, caminho);
        if (!fs.existsSync(abs)) continue;
      }
      await this.enviarMidiaComFallback(chatId, tipo, caminho);
    }
  }

  async gerarCobranca(req, res) {
    const { plano, valor, utm_source, utm_campaign, utm_medium, telegram_id } = req.body;
    console.log(`[${this.botId}] Gerar cobrança: plano=${plano}, valor=${valor}, telegram_id=${telegram_id}`);
    if (!plano || !valor) {
      return res.status(400).json({ error: 'Parâmetros inválidos: plano e valor são obrigatórios.' });
    }

    const valorCentavos = this.config.formatarValorCentavos(valor);
    if (isNaN(valorCentavos) || valorCentavos < 50) {
      return res.status(400).json({ error: 'Valor mínimo é R$0,50.' });
    }

    try {
      const response = await axios.post(
        'https://api.pushinpay.com.br/api/pix/cashIn',
        {
          value: valorCentavos,
          webhook_url: `${this.baseUrl}/webhook/pushinpay?bot_id=${this.botId}`
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.pushinpayToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          }
        }
      );

      const { qr_code_base64, qr_code, id } = response.data;
      const normalizedId = id.toLowerCase();
      const pix_copia_cola = qr_code;

      let saved = false;
      if (this.pgPool) {
        try {
          await postgres.executeQuery(
            this.pgPool,
            `INSERT INTO pending_tokens (token, valor, status, telegram_id, utm_source, utm_campaign, utm_medium, bot_id)
             VALUES ($1, $2, 'pendente', $3, $4, $5, $6, $7)`,
            [normalizedId, valorCentavos, telegram_id, utm_source, utm_campaign, utm_medium, this.botId]
          );
          saved = true;
        } catch (pgErr) {
          console.error('❌ Erro ao salvar token no PostgreSQL:', pgErr.message);
        }
      }
      if (this.db && !saved) {
        try {
          this.db.prepare(`INSERT INTO tokens (token, valor, status, telegram_id, utm_source, utm_campaign, utm_medium, bot_id)
             VALUES (?, ?, 'pendente', ?, ?, ?, ?, ?)` ).run(normalizedId, valorCentavos, telegram_id, utm_source, utm_campaign, utm_medium, this.botId);
          saved = true;
        } catch (sqlErr) {
          console.error('❌ Erro ao salvar token no SQLite:', sqlErr.message);
        }
      }
      if (!saved) {
        console.warn('⚠️ Token não pôde ser salvo em nenhum banco');
      }

      res.json({
        qr_code_base64,
        qr_code,
        pix_copia_cola: pix_copia_cola || qr_code,
        transacao_id: normalizedId
      });
    } catch (err) {
      console.error('❌ Erro ao gerar cobrança:', err.response?.data || err.message);
      res.status(500).json({
        error: 'Erro ao gerar cobrança na API PushinPay.',
        detalhes: err.response?.data || err.message
      });
    }
  }

  async webhookPushinPay(req, res) {
    try {
      const payload = req.body || {};
      console.log(`[${this.botId}] Webhook PushinPay recebido:`, JSON.stringify(payload).slice(0, 200));
      const { id, status } = payload;
      const normalizedId = id ? id.toLowerCase() : null;
      if (!normalizedId || status !== 'paid') return res.sendStatus(200);

      let row = null;
      if (this.pgPool) {
        try {
          const res = await postgres.executeQuery(this.pgPool, 'SELECT * FROM pending_tokens WHERE token = $1', [normalizedId]);
          if (res.rows.length > 0) row = res.rows[0];
        } catch (pgErr) {
          console.error('❌ Erro ao buscar token no PostgreSQL:', pgErr.message);
        }
      }
      if (!row && this.db) {
        try {
          row = this.db.prepare('SELECT * FROM tokens WHERE token = ?').get(normalizedId);
        } catch (sqlErr) {
          console.error('❌ Erro ao buscar token no SQLite:', sqlErr.message);
        }
      }
      if (!row) return res.status(400).send('Transação não encontrada');

      const novoToken = uuidv4();
      
      if (this.pgPool) {
        try {
          await postgres.executeQuery(
            this.pgPool,
            "UPDATE pending_tokens SET token_uuid = $1, status = 'valido' WHERE token = $2",
            [novoToken, normalizedId]
          );
        } catch (pgErr) {
          console.error('❌ Erro ao atualizar token no PostgreSQL:', pgErr.message);
        }
      }
      if (this.db) {
        try {
          this.db.prepare(`UPDATE tokens SET token_uuid = ?, status = 'valido', criado_em = CURRENT_TIMESTAMP WHERE token = ?`).run(novoToken, normalizedId);
        } catch (sqlErr) {
          console.error('❌ Erro ao atualizar token no SQLite:', sqlErr.message);
        }
      }

      try {
        await postgres.executeQuery(
          this.pgPool,
          'INSERT INTO tokens (token, valor, bot_id) VALUES ($1, $2, $3)',
          [novoToken, (row.valor || 0) / 100, this.botId]
        );
      } catch (pgErr) {
        console.error('❌ Erro ao registrar token no PostgreSQL:', pgErr.message);
      }

      if (row.telegram_id) {
        const tgId = normalizeTelegramId(row.telegram_id);
        if (tgId !== null) {
          try {
            await postgres.executeQuery(
              this.pgPool,
              'UPDATE downsell_progress SET pagou = 1 WHERE telegram_id = $1',
              [tgId]
            );
          } catch (pgErr) {
            console.error('❌ Erro ao atualizar status de pagamento no PostgreSQL:', pgErr.message);
          }
        }

        const valorReais = (row.valor / 100).toFixed(2);
        const linkComToken = `${this.frontendUrl}/obrigado.html?token=${novoToken}&valor=${valorReais}&bot_id=${this.botId}`;
        await this.bot.sendMessage(
          row.telegram_id,
          `🎉 <b>Pagamento aprovado!</b>\n\n💰 Valor: R$ ${valorReais}\n🔗 Acesse seu conteúdo: ${linkComToken}`,
          { parse_mode: 'HTML' }
        );
      }

      res.sendStatus(200);
    } catch (err) {
      console.error('❌ Erro no webhook:', err.message);
      res.sendStatus(500);
    }
  }

  async enviarMensagemPeriodica(telegramId, msgCfg = {}) {
    if (!this.bot) return false;
    const texto = msgCfg.texto || '';
    const opcoes = { parse_mode: 'HTML' };
    if (msgCfg.botoes) {
      opcoes.reply_markup = { inline_keyboard: msgCfg.botoes };
    }
    try {
      if (msgCfg.midia && (msgCfg.midia.video || msgCfg.midia.foto)) {
        const tipo = msgCfg.midia.video ? 'video' : 'photo';
        const caminho = msgCfg.midia.video || msgCfg.midia.foto;
        console.log(`[${this.botId}] Envio periódico de ${tipo} para ${telegramId}: ${caminho}`);
        const enviado = await this.enviarMidiaComFallback(telegramId, tipo, caminho, { ...opcoes, caption: texto });
        if (enviado) return true;
      }
      if (texto) {
        console.log(`[${this.botId}] Envio periódico de texto para ${telegramId}: ${texto.slice(0, 200)}`);
        await this.bot.sendMessage(telegramId, texto, opcoes);
      }
      return true;
    } catch (err) {
      if (err.response && (err.response.statusCode === 403 || err.response.statusCode === 400)) {
        console.log(`🚫 Usuário bloqueou o bot ou não pode receber mensagens: ${telegramId}`);
      } else {
        console.error(`❌ Erro ao enviar mensagem periódica para ${telegramId}:`, err.message);
      }
      return false;
    }
  }

  async obterUsuariosParaMensagem() {
    const ids = new Set();
    if (this.pgPool) {
      try {
        const res = await postgres.executeQuery(this.pgPool, 'SELECT telegram_id FROM usuarios');
        res.rows.forEach(r => { if (r.telegram_id) ids.add(String(r.telegram_id)); });
      } catch (e) {
        console.error('❌ Erro ao buscar usuários no PostgreSQL:', e.message);
      }
    }
    if (this.db) {
      try {
        const rows = this.db.prepare('SELECT DISTINCT telegram_id FROM tokens WHERE telegram_id IS NOT NULL').all();
        rows.forEach(r => ids.add(String(r.telegram_id)));
      } catch (e) {
        console.error('❌ Erro ao buscar usuários em tokens:', e.message);
      }
    }
    return Array.from(ids);
  }

  startarMensagensPeriodicas() {
    if (!Array.isArray(this.config.mensagensPeriodicas)) return;

    this.config.mensagensPeriodicas.forEach(m => {
      if (!m.hora) return;
      const [h, min] = m.hora.split(':');
      const cron = `${parseInt(min || 0, 10)} ${parseInt(h, 10)} * * *`;
      schedule.scheduleJob({ rule: cron, tz: 'America/Sao_Paulo' }, async () => {
        console.log(`[${this.botId}] Disparando mensagens periódicas para regra ${cron}`);
        const usuarios = await this.obterUsuariosParaMensagem();
        for (const id of usuarios) {
          await this.enviarMensagemPeriodica(id, m);
          await new Promise(res => setTimeout(res, 1000));
        }
      });
    });
  }

  async enviarDownsell(chatId) {
    try {
      console.log(`[${this.botId}] Enviando downsell para ${chatId}`);
      const progressoRes = await postgres.executeQuery(
        this.pgPool,
        'SELECT index_downsell FROM downsell_progress WHERE telegram_id = $1',
        [chatId]
      );
      const progresso = progressoRes.rows[0] || { index_downsell: 0 };
      const idx = progresso.index_downsell;
      const lista = this.config.downsells;
      if (idx >= lista.length) return;
      const downsell = lista[idx];
      console.log(`[${this.botId}] Downsell ${downsell.id} para ${chatId}`);
      await this.enviarMidiasHierarquicamente(chatId, this.config.midias.downsells[downsell.id] || {});
      let replyMarkup = null;
      if (downsell.planos && downsell.planos.length > 0) {
        const botoes = downsell.planos.map(p => [{ text: `${p.emoji} ${p.nome} — R$${p.valorComDesconto.toFixed(2)}`, callback_data: p.id }]);
        replyMarkup = { inline_keyboard: botoes };
      }
      await this.bot.sendMessage(chatId, downsell.texto, { parse_mode: 'HTML', reply_markup: replyMarkup });
      await postgres.executeQuery(
        this.pgPool,
        'UPDATE downsell_progress SET index_downsell = $1, last_sent_at = NOW() WHERE telegram_id = $2',
        [idx + 1, chatId]
      );
      if (idx + 1 < lista.length) {
        setTimeout(() => {
          this.enviarDownsell(chatId).catch(err => console.error('❌ Erro no próximo downsell:', err.message));
        }, 5 * 60 * 1000);
      }
    } catch (err) {
      console.error('❌ Erro na função enviarDownsell:', err.message);
    }
  }

  async enviarDownsells(targetId = null) {
    const flagKey = targetId || 'GLOBAL';
    if (this.processingDownsells.get(flagKey)) return;
    this.processingDownsells.set(flagKey, true);
    try {
      console.log(`[${this.botId}] Iniciando envio de downsells${targetId ? ' para '+targetId : ''}`);
      let usuariosRes;
      if (targetId) {
        usuariosRes = await postgres.executeQuery(
          this.pgPool,
          'SELECT telegram_id, index_downsell, last_sent_at FROM downsell_progress WHERE pagou = 0 AND telegram_id = $1',
          [targetId]
        );
      } else {
        usuariosRes = await postgres.executeQuery(
          this.pgPool,
          'SELECT telegram_id, index_downsell, last_sent_at FROM downsell_progress WHERE pagou = 0'
        );
      }
      const usuarios = usuariosRes.rows;
      for (const usuario of usuarios) {
        const { telegram_id, index_downsell, last_sent_at } = usuario;
        if (index_downsell >= this.config.downsells.length) continue;
        if (last_sent_at) {
          const diff = Date.now() - new Date(last_sent_at).getTime();
          if (diff < 5 * 60 * 1000) continue;
        }
        const downsell = this.config.downsells[index_downsell];
        if (!downsell) continue;
        try {
          console.log(`[${this.botId}] Enviando downsell ${downsell.id} para ${telegram_id}`);
          await this.enviarMidiasHierarquicamente(telegram_id, this.config.midias.downsells[downsell.id] || {});
          let replyMarkup = null;
          if (downsell.planos && downsell.planos.length > 0) {
            const botoes = downsell.planos.map(pl => [{ text: `${pl.emoji} ${pl.nome} — R$${pl.valorComDesconto.toFixed(2)}`, callback_data: pl.id }]);
            replyMarkup = { inline_keyboard: botoes };
          }
          await this.bot.sendMessage(telegram_id, downsell.texto, { parse_mode: 'HTML', reply_markup: replyMarkup });
          await postgres.executeQuery(
            this.pgPool,
            'UPDATE downsell_progress SET index_downsell = $1, last_sent_at = NOW() WHERE telegram_id = $2',
            [index_downsell + 1, telegram_id]
          );
          await new Promise(res => setTimeout(res, 5000));
        } catch (err) {
          console.error(`❌ Erro ao enviar downsell para ${telegram_id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('❌ Erro geral na função enviarDownsells:', err.message);
    } finally {
      this.processingDownsells.delete(flagKey);
    }
  }

  setupListeners() {
    if (!this.bot) return;
    console.log(`[${this.botId}] Registrando listeners do bot`);
    const bot = this.bot;

    bot.onText(/\/start/, async msg => {
      const chatId = msg.chat.id;
      console.log(`[${this.botId}] Comando /start recebido de ${chatId}`);
      try {
        await this.enviarMidiasHierarquicamente(chatId, this.config.midias.inicial);
        await bot.sendMessage(chatId, this.config.inicio.textoInicial, { parse_mode: 'HTML' });
        await bot.sendMessage(chatId, this.config.inicio.menuInicial.texto, {
          reply_markup: {
            inline_keyboard: this.config.inicio.menuInicial.opcoes.map(op => [{ text: op.texto, callback_data: op.callback }])
          }
        });
        try {
          const existeRes = await postgres.executeQuery(
            this.pgPool,
            'SELECT telegram_id FROM downsell_progress WHERE telegram_id = $1',
            [chatId]
          );
          if (existeRes.rows.length === 0) {
            await postgres.executeQuery(
              this.pgPool,
              'INSERT INTO downsell_progress (telegram_id, index_downsell, last_sent_at) VALUES ($1, $2, NULL)',
              [chatId, 0]
            );
          }

          await postgres.executeQuery(
            this.pgPool,
            'INSERT INTO usuarios (telegram_id) VALUES ($1) ON CONFLICT (telegram_id) DO NOTHING',
            [chatId]
          );
        } catch (pgErr) {
          console.error('❌ Erro ao registrar usuário no PostgreSQL:', pgErr.message);
        }
      } catch (error) {
        console.error('❌ Erro no comando /start:', error);
        try {
          await bot.sendMessage(chatId, this.config.erros?.erroGenerico || '❌ Ocorreu um erro. Tente novamente.');
        } catch (e) {
          console.error('❌ Erro ao enviar mensagem de erro:', e);
        }
      }
    });

    bot.onText(/\/status/, async msg => {
      const chatId = msg.chat.id;
      console.log(`[${this.botId}] Comando /status de ${chatId}`);
      try {
        const usuarioRes = await postgres.executeQuery(
          this.pgPool,
          'SELECT index_downsell, pagou FROM downsell_progress WHERE telegram_id = $1',
          [chatId]
        );
        const usuario = usuarioRes.rows[0];
        if (!usuario) {
          await bot.sendMessage(chatId, '❌ Usuário não encontrado. Use /start primeiro.');
          return;
        }
        const statusPagamento = usuario.pagou === 1 ? 'JÁ PAGOU ✅' : 'NÃO PAGOU ❌';
        const totalDownsells = this.config.downsells.length;
        const mensagem = `📊 <b>SEU STATUS:</b>\n\n💰 <b>Pagamento:</b> ${statusPagamento}\n📈 <b>Downsell atual:</b> ${usuario.index_downsell}/${totalDownsells}\n🔄 <b>Próximo downsell:</b> ${usuario.index_downsell >= totalDownsells ? 'Finalizado' : 'Em breve'}\n\n${usuario.pagou === 0 ? '💡 <i>Você receberá ofertas especiais automaticamente!</i>' : '🎉 <i>Obrigado pela sua compra!</i>'}`.trim();
        await bot.sendMessage(chatId, mensagem, { parse_mode: 'HTML' });
      } catch (err) {
        console.error('❌ Erro no comando /status:', err.message);
        await bot.sendMessage(chatId, '❌ Erro ao verificar status. Tente novamente.');
      }
    });

    bot.onText(/\/resert/, async msg => {
      const chatId = msg.chat.id;
      console.log(`[${this.botId}] Comando /resert de ${chatId}`);
      try {
        const usuarioRes = await postgres.executeQuery(
          this.pgPool,
          'SELECT telegram_id FROM downsell_progress WHERE telegram_id = $1',
          [chatId]
        );
        const usuario = usuarioRes.rows[0];
        if (!usuario) {
          await bot.sendMessage(chatId, '❌ Usuário não encontrado. Use /start primeiro.');
          return;
        }
        try {
          await postgres.executeQuery(
            this.pgPool,
            'UPDATE downsell_progress SET pagou = 0, index_downsell = 0, last_sent_at = NULL WHERE telegram_id = $1',
            [chatId]
          );
        } catch (pgErr) {
          console.error('❌ Erro ao resetar funil no PostgreSQL:', pgErr.message);
        }
        await bot.sendMessage(
          chatId,
          `🔄 <b>Funil reiniciado com sucesso!</b>\n\n✅ Status de pagamento resetado\n✅ Downsells reiniciados\n📬 Você voltará a receber ofertas automaticamente\n\n💡 <i>Use /status para verificar seu novo status</i>`,
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error('❌ Erro no comando /resert:', err.message);
        await bot.sendMessage(chatId, '❌ Erro ao reiniciar funil. Tente novamente.');
      }
    });

    bot.on('callback_query', async query => {
      const chatId = query.message.chat.id;
      const data = query.data;
      console.log(`[${this.botId}] callback_query ${data} de ${chatId}`);
      try {
        if (data === 'mostrar_planos') {
          const botoesPlanos = this.config.planos.map(plano => [{ text: `${plano.emoji} ${plano.nome} — por R$${plano.valor.toFixed(2)}`, callback_data: plano.id }]);
          return bot.sendMessage(chatId, '💖 Escolha seu plano abaixo:', { reply_markup: { inline_keyboard: botoesPlanos } });
        }
        if (data === 'ver_previas') {
          return bot.sendMessage(chatId, `🙈 <b>Prévias:</b>\n\n💗 Acesse nosso canal:\n👉 ${this.config.canalPrevias}`, { parse_mode: 'HTML' });
        }
        if (data.startsWith('verificar_pagamento_')) {
          const transacaoId = data.replace('verificar_pagamento_', '');
          let tokenRow = null;
          if (this.pgPool) {
            try {
              const r = await postgres.executeQuery(this.pgPool, 'SELECT token_uuid, status, valor, telegram_id FROM pending_tokens WHERE token = $1', [transacaoId]);
              if (r.rows.length > 0) tokenRow = r.rows[0];
            } catch (pgErr) {
              console.error('❌ Erro ao buscar token no PostgreSQL:', pgErr.message);
            }
          }
          if (!tokenRow && this.db) {
            try {
              tokenRow = this.db.prepare('SELECT token_uuid, status, valor, telegram_id FROM tokens WHERE token = ? LIMIT 1').get(transacaoId);
            } catch (sqlErr) {
              console.error('❌ Erro ao buscar token no SQLite:', sqlErr.message);
            }
          }
          if (!tokenRow) return bot.sendMessage(chatId, '❌ Pagamento não encontrado.');
          if (tokenRow.status !== 'valido' || !tokenRow.token_uuid) return bot.sendMessage(chatId, this.config.pagamento.pendente);
          try {
            const tgId = normalizeTelegramId(chatId);
            if (tgId !== null) {
              await postgres.executeQuery(this.pgPool, 'UPDATE downsell_progress SET pagou = 1 WHERE telegram_id = $1', [tgId]);
            }
          } catch (pgErr) {
            console.error('❌ Erro ao atualizar pagamento no PostgreSQL:', pgErr.message);
          }
          const valorReais = (tokenRow.valor / 100).toFixed(2);
          const linkComToken = `${this.frontendUrl}/obrigado.html?token=${tokenRow.token_uuid}&valor=${valorReais}&bot_id=${this.botId}`;
          await bot.sendMessage(chatId, this.config.pagamento.aprovado);
          await bot.sendMessage(chatId, `<b>🎉 Pagamento aprovado!</b>\n\n🔗 Acesse: ${linkComToken}`, { parse_mode: 'HTML' });
          return;
        }
        let plano = this.config.planos.find(p => p.id === data);
        if (!plano) {
          for (const ds of this.config.downsells) {
            const p = ds.planos.find(pl => pl.id === data);
            if (p) {
              plano = { ...p, valor: p.valorComDesconto };
              break;
            }
          }
        }
        if (!plano) return;
        if (!plano.valor && plano.valorComDesconto) plano.valor = plano.valorComDesconto;
        const resposta = await axios.post(`${this.baseUrl}/api/gerar-cobranca`, {
          telegram_id: chatId,
          plano: plano.nome,
          valor: plano.valor,
          bot_id: this.botId,
          utm_source: 'telegram',
          utm_campaign: 'bot_principal',
          utm_medium: 'telegram_bot'
        });
        const { qr_code_base64, pix_copia_cola, transacao_id } = resposta.data;
        let buffer;
        if (qr_code_base64) {
          const base64Image = qr_code_base64.replace(/^data:image\/png;base64,/, '');
          const imageBuffer = Buffer.from(base64Image, 'base64');
          buffer = await this.processarImagem(imageBuffer);
        }
        const legenda = this.config.mensagemPix(plano.nome, plano.valor, pix_copia_cola);
        if (buffer) {
          await bot.sendPhoto(chatId, buffer, {
            caption: legenda,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '✅ Verificar Status', callback_data: `verificar_pagamento_${transacao_id}` }]] }
          });
        } else {
          await bot.sendMessage(chatId, legenda, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '✅ Verificar Status', callback_data: `verificar_pagamento_${transacao_id}` }]] }
          });
        }
      } catch (err) {
        console.error('❌ Erro ao processar callback:', err);
        try {
          await bot.sendMessage(chatId, this.config.erros?.erroGenerico || '❌ Ocorreu um erro. Tente novamente.');
        } catch (e) {
          console.error('❌ Erro ao enviar mensagem de erro:', e);
        }
      }
    });
  }
}

module.exports = TelegramBotService;
