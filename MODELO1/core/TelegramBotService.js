const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const { DateTime } = require('luxon');
const GerenciadorMidia = require('../BOT/utils/midia');
const { sendFacebookEvent } = require('../../services/facebook');

// Fila global para controlar a geração de cobranças e evitar erros 429
const cobrancaQueue = [];
let processingCobrancaQueue = false;

async function processCobrancaQueue() {
  if (processingCobrancaQueue) return;
  processingCobrancaQueue = true;
  try {
    while (cobrancaQueue.length > 0) {
      const task = cobrancaQueue.shift();
      try {
        await task();
      } catch (err) {
        console.error('Erro ao processar fila de cobrança:', err.message);
      }
      await new Promise(r => setTimeout(r, 200));
    }
  } finally {
    // Garante desbloqueio em caso de erro
    processingCobrancaQueue = false;
  }
}


class TelegramBotService {
  constructor(options = {}) {
    this.token = options.token;
    this.baseUrl = options.baseUrl;
    this.frontendUrl = options.frontendUrl || options.baseUrl;
    this.config = options.config || {};
    this.postgres = options.postgres;
    this.sqlite = options.sqlite;
    this.botId = options.bot_id || 'bot';
    let grupo = 'G1';
    if (this.token === process.env.TELEGRAM_TOKEN_BOT2) grupo = 'G2';
    this.grupo = grupo;
    this.pgPool = this.postgres ? this.postgres.createPool() : null;
    if (this.pgPool) {
      this.postgres.limparDownsellsAntigos(this.pgPool);
      setInterval(() => this.postgres.limparDownsellsAntigos(this.pgPool), 60 * 60 * 1000);
    }
    this.processingDownsells = new Map();
    // Registrar arquivos de mídia de downsell ausentes já reportados
    this.loggedMissingDownsellFiles = new Set();
    this.bot = null;
    this.db = null;
    this.gerenciadorMidia = new GerenciadorMidia();
    this.agendarMensagensPeriodicas();
  }

  iniciar() {
    if (!this.token) {
      console.error(`[${this.botId}] TELEGRAM_TOKEN não definido`);
      return;
    }
    if (!this.baseUrl) {
      console.error(`[${this.botId}] BASE_URL não definida`);
    }
    this.db = this.sqlite ? this.sqlite.initialize() : null;

    console.log(`\n[${this.botId}] 🔍 Verificando integridade das mídias...`);
    const integridade = this.gerenciadorMidia.verificarIntegridade();
    console.log(`[${this.botId}] ✅ Sistema de mídias inicializado (${integridade.porcentagem}% das mídias disponíveis)\n`);

    this.bot = new TelegramBot(this.token, { polling: false });
    if (this.baseUrl) {
      const webhookUrl = `${this.baseUrl}/${this.botId}/webhook`;
      this.bot.setWebHook(webhookUrl)
        .then(() => console.log(`[${this.botId}] ✅ Webhook configurado: ${webhookUrl}`))
        .catch(err => console.error(`[${this.botId}] ❌ Erro ao configurar webhook:`, err));
    }

    this.registrarComandos();
    console.log(`[${this.botId}] ✅ Bot iniciado`);
  }

  normalizeTelegramId(id) {
    if (id === null || id === undefined) return null;
    const parsed = parseInt(id.toString(), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  async cancelarDownsellPorBloqueio(chatId) {
    console.warn(`⚠️ Usuário bloqueou o bot, cancelando downsell para chatId: ${chatId}`);
    if (!this.pgPool) return;
    try {
      await this.postgres.executeQuery(this.pgPool, 'DELETE FROM downsell_progress WHERE telegram_id = $1', [chatId]);
    } catch (err) {
      console.error(`[${this.botId}] Erro ao remover downsell de ${chatId}:`, err.message);
    }
  }

  async processarImagem(imageBuffer) {
    let sharp;
    try {
      sharp = require('sharp');
    } catch (e) {
      sharp = null;
    }
    if (!sharp) return imageBuffer;
    try {
      return await sharp(imageBuffer)
        .extend({ top: 40, bottom: 40, left: 40, right: 40, background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toBuffer();
    } catch (err) {
      console.warn(`[${this.botId}] Erro ao processar imagem:`, err.message);
      return imageBuffer;
    }
  }

  async enviarMidiaComFallback(chatId, tipo, caminho, opcoes = {}) {
    if (!caminho) return false;
    try {
      if (caminho.startsWith('http')) {
        switch (tipo) {
          case 'photo':
            await this.bot.sendPhoto(chatId, caminho, opcoes); break;
          case 'video':
            await this.bot.sendVideo(chatId, caminho, opcoes); break;
          case 'audio':
            await this.bot.sendVoice(chatId, caminho, opcoes); break;
          default:
            return false;
        }
        return true;
      }
      const abs = path.resolve(path.join(__dirname, '..', 'BOT'), caminho);
      if (!fs.existsSync(abs)) {
        const downsellPath = path.join('midia', 'downsells') + path.sep;
        if (abs.includes(downsellPath)) {
          if (!this.loggedMissingDownsellFiles.has(abs)) {
            this.loggedMissingDownsellFiles.add(abs);
            console.warn(`[${this.botId}] Arquivo não encontrado ${abs}`);
          }
        } else {
          console.warn(`[${this.botId}] Arquivo não encontrado ${abs}`);
        }
        return false;
      }
      const stream = fs.createReadStream(abs);
      switch (tipo) {
        case 'photo':
          await this.bot.sendPhoto(chatId, stream, opcoes); break;
        case 'video':
          await this.bot.sendVideo(chatId, stream, opcoes); break;
        case 'audio':
          await this.bot.sendVoice(chatId, stream, opcoes); break;
        default:
          return false;
      }
      return true;
    } catch (err) {
      if (err.response?.statusCode === 403 || err.message?.includes('bot was blocked by the user')) {
        err.blockedByUser = true;
        throw err;
      }
      console.error(`[${this.botId}] Erro ao enviar mídia ${tipo}:`, err.message);
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
      await this.enviarMidiaComFallback(chatId, tipo, caminho);
    }
  }

  async _executarGerarCobranca(req, res) {
    // Proteção contra payloads vazios
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Payload inválido' });
    }
    const {
      plano,
      valor,
      utm_source,
      utm_campaign,
      utm_medium,
      utm_term,
      utm_content,
      fbp,
      fbc,
      event_source_url,
      telegram_id
    } = req.body;
    if (!plano || !valor) {
      return res.status(400).json({ error: 'Parâmetros inválidos: plano e valor são obrigatórios.' });
    }
    const valorCentavos = this.config.formatarValorCentavos(valor);
    if (isNaN(valorCentavos) || valorCentavos < 50) {
      return res.status(400).json({ error: 'Valor mínimo é R$0,50.' });
    }
    try {
      const response = await axios.post('https://api.pushinpay.com.br/api/pix/cashIn', {
        value: valorCentavos,
        webhook_url: `${this.baseUrl}/webhook/pushinpay`
      }, {
        headers: {
          Authorization: `Bearer ${process.env.PUSHINPAY_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      });
      const { qr_code_base64, qr_code, id } = response.data;
      const normalizedId = id.toLowerCase();
      const pix_copia_cola = qr_code;
      const ipCriacao = req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;
      const uaCriacao = req.get('user-agent');
      // Timestamp usado também no evento de compra
      const eventTime = Math.floor(DateTime.now().setZone('America/Sao_Paulo').toSeconds());
      if (this.db) {
        this.db.prepare(`
          INSERT INTO tokens (token, valor, status, telegram_id, utm_source, utm_campaign, utm_medium, utm_term, utm_content, fbp, fbc, ip_criacao, user_agent_criacao, bot_id, event_time)
          VALUES (?, ?, 'pendente', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(normalizedId, valorCentavos, telegram_id, utm_source, utm_campaign, utm_medium, utm_term, utm_content, fbp, fbc, ipCriacao, uaCriacao, this.botId, eventTime);
      }
      if (this.pgPool) {
        try {
          await this.postgres.executeQuery(
            this.pgPool,
            `INSERT INTO tokens (token, valor, bot_id, usado, utm_source, utm_campaign, utm_medium, utm_term, utm_content, fbp, fbc, ip_criacao, user_agent_criacao, status, event_time)
             VALUES ($1,$2,$3,FALSE,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pendente',$13)
             ON CONFLICT (token) DO NOTHING`,
            [normalizedId, valorCentavos / 100, this.botId, utm_source, utm_campaign, utm_medium, utm_term, utm_content, fbp, fbc, ipCriacao, uaCriacao, eventTime]
          );
        } catch (pgErr) {
          console.error(`[${this.botId}] Erro ao salvar token no PostgreSQL:`, pgErr.message);
        }
      }

      await sendFacebookEvent({
        event_name: 'InitiateCheckout',
        event_time: eventTime,
        value: valorCentavos / 100,
        currency: 'BRL',
        event_source_url: event_source_url || req.get('referer'),
        fbp,
        fbc,
        ip: ipCriacao,
        userAgent: uaCriacao,
        custom_data: {
          utm_source,
          utm_medium,
          utm_campaign,
          utm_term,
          utm_content
        }
      });
      return res.json({ qr_code_base64, qr_code, pix_copia_cola: pix_copia_cola || qr_code, transacao_id: normalizedId });
    } catch (err) {
      if (err.response?.status === 429) {
        console.warn(`[${this.botId}] Erro 429 na geração de cobrança`);
        return res.status(429).json({ error: '⚠️ Erro 429: Limite de requisições atingido.' });
      }
      console.error(`[${this.botId}] Erro ao gerar cobrança:`, err.response?.data || err.message);
      return res.status(500).json({ error: 'Erro ao gerar cobrança na API PushinPay.', detalhes: err.response?.data || err.message });
    }
  }

  gerarCobranca(req, res) {
    cobrancaQueue.push(() => this._executarGerarCobranca(req, res));
    processCobrancaQueue();
  }

  async webhookPushinPay(req, res) {
    try {
      // Proteção contra payloads vazios
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).send('Payload inválido');
      }

      // Segurança simples no webhook
      if (process.env.WEBHOOK_SECRET) {
        const auth = req.headers['authorization'];
        if (auth !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
          return res.sendStatus(403);
        }
      }

      const payload = req.body;
      const { id, status } = payload || {};
      const normalizedId = id ? id.toLowerCase() : null;
      if (!normalizedId || status !== 'paid') return res.sendStatus(200);
      const row = this.db ? this.db.prepare('SELECT * FROM tokens WHERE token = ?').get(normalizedId) : null;
      if (!row) return res.status(400).send('Transação não encontrada');
      // Evita processamento duplicado em caso de retries
      if (row.status === 'valido') return res.status(200).send('Pagamento já processado');
      const novoToken = uuidv4().toLowerCase();
      if (this.db) {
        this.db.prepare(`
          UPDATE tokens SET token_uuid = ?, status = 'valido', criado_em = ?, event_time = event_time WHERE token = ?
        `).run(novoToken, DateTime.now().setZone('America/Sao_Paulo').toISO(), normalizedId);
      }
      if (this.pgPool) {
        try {
          await this.postgres.executeQuery(
            this.pgPool,
            `UPDATE tokens SET token_uuid = $1, status = 'valido' WHERE token = $2`,
            [novoToken, normalizedId]
          );
          console.log(`✅ Token ${normalizedId} atualizado com sucesso no PostgreSQL`);
        } catch (pgErr) {
          console.error(`❌ Falha ao atualizar token ${normalizedId} no PostgreSQL:`, pgErr.message);
        }
      }
      if (row.telegram_id && this.pgPool) {
        const tgId = this.normalizeTelegramId(row.telegram_id);
        if (tgId !== null) {
          await this.postgres.executeQuery(this.pgPool, 'UPDATE downsell_progress SET pagou = 1 WHERE telegram_id = $1', [tgId]);
        }
      }
      if (row.telegram_id && this.bot) {
        const valorReais = (row.valor / 100).toFixed(2);
        const linkComToken = `${this.frontendUrl}/obrigado.html?token=${novoToken}&valor=${valorReais}&${this.grupo}`;
        await this.bot.sendMessage(row.telegram_id, `🎉 <b>Pagamento aprovado!</b>\n\n💰 Valor: R$ ${valorReais}\n🔗 Acesse seu conteúdo: ${linkComToken}`, { parse_mode: 'HTML' });
      }

      await sendFacebookEvent({
        event_name: 'Purchase',
        event_time: row.event_time,
        value: (row.valor || 0) / 100,
        currency: 'BRL',
        event_source_url: `${this.frontendUrl}/obrigado.html`,
        fbp: row.fbp,
        fbc: row.fbc,
        ip: row.ip_criacao,
        userAgent: row.user_agent_criacao,
        custom_data: {
          utm_source: row.utm_source,
          utm_medium: row.utm_medium,
          utm_campaign: row.utm_campaign,
          utm_term: row.utm_term,
          utm_content: row.utm_content
        }
      });

      return res.sendStatus(200);
    } catch (err) {
      console.error(`[${this.botId}] Erro no webhook:`, err.message);
      return res.sendStatus(500);
    }
  }

  agendarMensagensPeriodicas() {
    const mensagens = this.config.mensagensPeriodicas;
    if (!Array.isArray(mensagens) || mensagens.length === 0) return;
    const mapa = new Map();
    for (const msg of mensagens) {
      if (msg.horario) mapa.set(msg.horario, msg);
    }
    for (const msg of mensagens) {
      let texto = msg.texto;
      let midia = msg.midia;
      if (msg.copiarDe && mapa.get(msg.copiarDe)) {
        const base = mapa.get(msg.copiarDe);
        texto = base.texto;
        midia = base.midia;
      }
      if (!texto) continue;
      const dt = DateTime.fromFormat(msg.horario, 'HH:mm', { zone: 'America/Sao_Paulo' });
      if (!dt.isValid) continue;
      const hora = dt.hour;
      const minuto = dt.minute;
      const cronExp = `0 ${minuto} ${hora} * * *`;
      cron.schedule(cronExp, () => {
        if (!this.bot) return;
        this.enviarMensagemPeriodica(texto, midia).catch(err =>
          console.error(`[${this.botId}] Erro em mensagem periódica:`, err.message)
        );
      }, { timezone: 'America/Sao_Paulo' });
    }
  }

  async enviarMensagemPeriodica(texto, midia) {
    const ids = new Set();
    if (this.pgPool) {
      try {
        const res = await this.postgres.executeQuery(this.pgPool, 'SELECT telegram_id FROM downsell_progress WHERE pagou = 0');
        res.rows.forEach(r => ids.add(r.telegram_id));
      } catch (err) {
        console.error(`[${this.botId}] Erro ao buscar usuários PG:`, err.message);
      }
    }
    if (this.db) {
      try {
        const table = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='downsell_progress'").all();
        if (table.length > 0) {
          const rows = this.db.prepare('SELECT telegram_id FROM downsell_progress WHERE pagou = 0').all();
          rows.forEach(r => ids.add(r.telegram_id));
        }
      } catch (err) {
        console.error(`[${this.botId}] Erro ao buscar usuários SQLite:`, err.message);
      }
    }
    for (const chatId of ids) {
      try {
        if (midia) {
          await this.enviarMidiaComFallback(chatId, 'video', midia);
        }
        await this.bot.sendMessage(chatId, texto, { parse_mode: 'HTML' });
        await this.bot.sendMessage(chatId, this.config.inicio.menuInicial.texto, {
          reply_markup: { inline_keyboard: this.config.inicio.menuInicial.opcoes.map(o => [{ text: o.texto, callback_data: o.callback }]) }
        });
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`[${this.botId}] Erro ao enviar periódica para ${chatId}:`, err.message);
      }
    }
  }

  registrarComandos() {
    if (!this.bot) return;

    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      await this.enviarMidiasHierarquicamente(chatId, this.config.midias.inicial);
      await this.bot.sendMessage(chatId, this.config.inicio.textoInicial, { parse_mode: 'HTML' });
      await this.bot.sendMessage(chatId, this.config.inicio.menuInicial.texto, {
        reply_markup: {
          inline_keyboard: this.config.inicio.menuInicial.opcoes.map(o => [{ text: o.texto, callback_data: o.callback }])
        }
      });
      if (this.pgPool) {
        const existeRes = await this.postgres.executeQuery(this.pgPool, 'SELECT telegram_id FROM downsell_progress WHERE telegram_id = $1', [chatId]);
        if (existeRes.rows.length === 0) {
          await this.postgres.executeQuery(this.pgPool, 'INSERT INTO downsell_progress (telegram_id, index_downsell, last_sent_at) VALUES ($1,$2,NULL)', [chatId, 0]);
        }
      }
    });

    this.bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const data = query.data;
      if (data === 'mostrar_planos') {
        const botoesPlanos = this.config.planos.map(pl => ([{ text: `${pl.emoji} ${pl.nome} — por R$${pl.valor.toFixed(2)}`, callback_data: pl.id }]));
        return this.bot.sendMessage(chatId, '💖 Escolha seu plano abaixo:', { reply_markup: { inline_keyboard: botoesPlanos } });
      }
      if (data === 'ver_previas') {
        return this.bot.sendMessage(chatId, `🙈 <b>Prévias:</b>\n\n💗 Acesse nosso canal:\n👉 ${this.config.canalPrevias}`, { parse_mode: 'HTML' });
      }
      if (data.startsWith('verificar_pagamento_')) {
        const transacaoId = data.replace('verificar_pagamento_', '');
        const tokenRow = this.db ? this.db.prepare('SELECT token_uuid, status, valor, telegram_id FROM tokens WHERE token = ? LIMIT 1').get(transacaoId) : null;
        if (!tokenRow) return this.bot.sendMessage(chatId, '❌ Pagamento não encontrado.');
        if (tokenRow.status !== 'valido' || !tokenRow.token_uuid) return this.bot.sendMessage(chatId, this.config.pagamento.pendente);
        if (this.pgPool) {
          const tgId = this.normalizeTelegramId(chatId);
          if (tgId !== null) {
            await this.postgres.executeQuery(this.pgPool, 'UPDATE downsell_progress SET pagou = 1 WHERE telegram_id = $1', [tgId]);
          }
        }
        const valorReais = (tokenRow.valor / 100).toFixed(2);
        const linkComToken = `${this.frontendUrl}/obrigado.html?token=${tokenRow.token_uuid}&valor=${valorReais}&${this.grupo}`;
        await this.bot.sendMessage(chatId, this.config.pagamento.aprovado);
        await this.bot.sendMessage(chatId, `<b>🎉 Pagamento aprovado!</b>\n\n🔗 Acesse: ${linkComToken}`, { parse_mode: 'HTML' });
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
      const resposta = await axios.post(`${this.baseUrl}/api/gerar-cobranca`, {
        telegram_id: chatId,
        plano: plano.nome,
        valor: plano.valor,
        utm_source: 'telegram',
        utm_campaign: 'bot_principal',
        utm_medium: 'telegram_bot',
        bot_id: this.botId
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
        await this.bot.sendPhoto(chatId, buffer, {
          caption: legenda,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '✅ Verificar Status', callback_data: `verificar_pagamento_${transacao_id}` }]] }
        });
      } else {
        await this.bot.sendMessage(chatId, legenda, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '✅ Verificar Status', callback_data: `verificar_pagamento_${transacao_id}` }]] }
        });
      }
    });

    this.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id;
      if (!this.pgPool) return;
      const usuarioRes = await this.postgres.executeQuery(this.pgPool, 'SELECT index_downsell, pagou FROM downsell_progress WHERE telegram_id = $1', [chatId]);
      const usuario = usuarioRes.rows[0];
      if (!usuario) return this.bot.sendMessage(chatId, '❌ Usuário não encontrado. Use /start primeiro.');
      const statusPagamento = usuario.pagou === 1 ? 'JÁ PAGOU ✅' : 'NÃO PAGOU ❌';
      const totalDownsells = this.config.downsells.length;
      const mensagem = `📊 <b>SEU STATUS:</b>\n\n💰 <b>Pagamento:</b> ${statusPagamento}\n📈 <b>Downsell atual:</b> ${usuario.index_downsell}/${totalDownsells}\n🔄 <b>Próximo downsell:</b> ${usuario.index_downsell >= totalDownsells ? 'Finalizado' : 'Em breve'}\n\n${usuario.pagou === 0 ? '💡 <i>Você receberá ofertas especiais automaticamente!</i>' : '🎉 <i>Obrigado pela sua compra!</i>'}`.trim();
      await this.bot.sendMessage(chatId, mensagem, { parse_mode: 'HTML' });
    });

    this.bot.onText(/\/resert/, async (msg) => {
      const chatId = msg.chat.id;
      if (!this.pgPool) return;
      const usuarioRes = await this.postgres.executeQuery(this.pgPool, 'SELECT telegram_id FROM downsell_progress WHERE telegram_id = $1', [chatId]);
      const usuario = usuarioRes.rows[0];
      if (!usuario) return this.bot.sendMessage(chatId, '❌ Usuário não encontrado. Use /start primeiro.');
      await this.postgres.executeQuery(this.pgPool, 'UPDATE downsell_progress SET pagou = 0, index_downsell = 0, last_sent_at = NULL WHERE telegram_id = $1', [chatId]);
      await this.bot.sendMessage(chatId, `🔄 <b>Funil reiniciado com sucesso!</b>\n\n✅ Status de pagamento resetado\n✅ Downsells reiniciados\n📬 Você voltará a receber ofertas automaticamente\n\n💡 <i>Use /status para verificar seu novo status</i>`, { parse_mode: 'HTML' });
    });
  }

  async enviarDownsell(chatId) {
    if (!this.pgPool) return;
    const progressoRes = await this.postgres.executeQuery(this.pgPool, 'SELECT index_downsell FROM downsell_progress WHERE telegram_id = $1', [chatId]);
    const progresso = progressoRes.rows[0] || { index_downsell: 0 };
    const idx = progresso.index_downsell;
    const lista = this.config.downsells;
    if (idx >= lista.length) return;
    const downsell = lista[idx];
    try {
      await this.enviarMidiasHierarquicamente(chatId, this.config.midias.downsells[downsell.id] || {});
      let replyMarkup = null;
      if (downsell.planos && downsell.planos.length > 0) {
        const botoes = downsell.planos.map(p => [{ text: `${p.emoji} ${p.nome} — R$${p.valorComDesconto.toFixed(2)}`, callback_data: p.id }]);
        replyMarkup = { inline_keyboard: botoes };
      }
      await this.bot.sendMessage(chatId, downsell.texto, { parse_mode: 'HTML', reply_markup: replyMarkup });
      await this.postgres.executeQuery(this.pgPool, 'UPDATE downsell_progress SET index_downsell = $1, last_sent_at = NOW() WHERE telegram_id = $2', [idx + 1, chatId]);
      if (idx + 1 < lista.length) {
        setTimeout(() => this.enviarDownsell(chatId).catch(err => console.error('Erro no próximo downsell:', err.message)), 20 * 60 * 1000);
      }
    } catch (err) {
      if (err.blockedByUser || err.response?.statusCode === 403 || err.message?.includes('bot was blocked by the user')) {
        await this.cancelarDownsellPorBloqueio(chatId);
        return;
      }
      console.error(`[${this.botId}] Erro ao enviar downsell para ${chatId}:`, err.message);
    }
  }

  async enviarDownsells(targetId = null) {
    if (!this.pgPool) return;
    const flagKey = targetId || 'GLOBAL';
    if (this.processingDownsells.get(flagKey)) return;
    this.processingDownsells.set(flagKey, true);
    try {
      let usuariosRes;
      if (targetId) {
        usuariosRes = await this.postgres.executeQuery(this.pgPool, 'SELECT telegram_id, index_downsell, last_sent_at FROM downsell_progress WHERE pagou = 0 AND telegram_id = $1', [targetId]);
      } else {
        usuariosRes = await this.postgres.executeQuery(this.pgPool, 'SELECT telegram_id, index_downsell, last_sent_at FROM downsell_progress WHERE pagou = 0');
      }
      const usuarios = usuariosRes.rows;
      for (const usuario of usuarios) {
        const { telegram_id, index_downsell, last_sent_at } = usuario;
        if (index_downsell >= this.config.downsells.length) continue;
        if (last_sent_at) {
          const diff = DateTime.now().toMillis() - DateTime.fromISO(last_sent_at).toMillis();
          if (diff < 20 * 60 * 1000) continue;
        }
        const downsell = this.config.downsells[index_downsell];
        try {
          await this.enviarMidiasHierarquicamente(telegram_id, this.config.midias.downsells[downsell.id] || {});
          let replyMarkup = null;
          if (downsell.planos && downsell.planos.length > 0) {
            const botoes = downsell.planos.map(plano => [{ text: `${plano.emoji} ${plano.nome} — R$${plano.valorComDesconto.toFixed(2)}`, callback_data: plano.id }]);
            replyMarkup = { inline_keyboard: botoes };
          }
          await this.bot.sendMessage(telegram_id, downsell.texto, { parse_mode: 'HTML', reply_markup: replyMarkup });
          await this.postgres.executeQuery(this.pgPool, 'UPDATE downsell_progress SET index_downsell = $1, last_sent_at = NOW() WHERE telegram_id = $2', [index_downsell + 1, telegram_id]);
        } catch (err) {
          if (err.blockedByUser || err.response?.statusCode === 403 || err.message?.includes('bot was blocked by the user')) {
            await this.cancelarDownsellPorBloqueio(telegram_id);
            continue;
          }
          console.error(`[${this.botId}] Erro ao enviar downsell para ${telegram_id}:`, err.message);
          continue;
        }
        await new Promise(r => setTimeout(r, 5000));
      }
    } catch (err) {
      console.error(`[${this.botId}] Erro geral na função enviarDownsells:`, err.message);
    } finally {
      this.processingDownsells.delete(flagKey);
    }
  }
}

module.exports = TelegramBotService;
