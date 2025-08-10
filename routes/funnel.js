const express = require('express');
const router = express.Router();
const db = require('../database/postgres'); // deve exportar { pool } ou query()

// Reutiliza o mesmo esquema de auth dos endpoints de logs: Bearer PANEL_ACCESS_TOKEN
function requirePanelToken(req, res, next){
  try{
    const hdr = req.headers['authorization'] || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
    const expected = process.env.PANEL_ACCESS_TOKEN || '';
    if(!expected){
      console.warn('[API_FUNNEL] PANEL_ACCESS_TOKEN não definido no ambiente');
      return res.status(500).json({ error: 'Token do painel não configurado' });
    }
    if(!token) return res.status(401).json({ error: 'Não autorizado' });
    if(token !== expected) return res.status(403).json({ error: 'Acesso negado' });
    return next();
  }catch(err){
    return res.status(500).json({ error: 'Auth error' });
  }
}

// Helpers
const TZ = 'America/Recife';
function parseISOorNull(v){
  const d = v ? new Date(v) : null;
  return (d && !isNaN(d)) ? d : null;
}
function dateToISO(d){ return d.toISOString(); }
function daysBetween(start, end){
  const out = [];
  const c = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while(c <= last){
    out.push(new Date(c));
    c.setUTCDate(c.getUTCDate()+1);
  }
  return out;
}

function buildEmptySeries(days){
  const labels = days.map(d => d.toISOString().slice(0,10));
  const base = { days: labels, welcome: [], cta_click: [], bot_start: [], pix_created: [], purchase: [] };
  labels.forEach(()=> {
    base.welcome.push(0); base.cta_click.push(0); base.bot_start.push(0); base.pix_created.push(0); base.purchase.push(0);
  });
  return base;
}

function computeCards(series){
  const sum = arr => arr.reduce((a,b)=>a+(Number(b)||0),0);
  return {
    welcome:    sum(series.welcome),
    cta_click:  sum(series.cta_click),
    bot_start:  sum(series.bot_start),
    pix_created:sum(series.pix_created),
    purchase:   sum(series.purchase),
  };
}
function computeRates(cards){
  const safe = (n,d)=> d>0 ? (n/d) : null;
  return {
    welcome_to_click:    safe(cards.cta_click,  cards.welcome),
    click_to_bot:        safe(cards.bot_start,  cards.cta_click),
    bot_to_pix:          safe(cards.pix_created,cards.bot_start),
    pix_to_purchase:     safe(cards.purchase,   cards.pix_created),
    welcome_to_purchase: safe(cards.purchase,   cards.welcome),
  };
}

// =====================
// GET /api/funnel
// =====================
router.get('/funnel', requirePanelToken, async (req, res) => {
  const t0 = Date.now();
  try{
    const { start, end, groupBy = 'daily', test } = req.query;
    const startDate = parseISOorNull(start);
    const endDate   = parseISOorNull(end);
    if(!startDate || !endDate) return res.status(400).json({ error: 'Parâmetros start/end inválidos' });
    if(endDate < startDate)    return res.status(400).json({ error: 'Data fim < início' });

    // Test mode (não acessa DB)
    if(String(test) === '1'){
      const ds = daysBetween(startDate, endDate);
      const series = buildEmptySeries(ds);
      // gera números determinísticos leves
      ds.forEach((d, i) => {
        const base = 800 + (i*17);
        const w = base;
        const c = Math.round(w * 0.55);
        const b = Math.round(c * 0.65);
        const p = Math.round(b * 0.45);
        const u = Math.round(p * 0.35);
        series.welcome[i]=w; series.cta_click[i]=c; series.bot_start[i]=b; series.pix_created[i]=p; series.purchase[i]=u;
      });
      const cards = computeCards(series);
      const rates = computeRates(cards);
      return res.json({ cards, rates, series });
    }

    // Real mode
    const pool = db.getPool();
    const client = await pool.connect();
    try{
      // 1) Tenta pelos counters
      console.info('[FUNNEL_API] using counters SQL');
      const q1 = `
        SELECT day::date AS day, metric, SUM(total)::int AS total
        FROM public.funnel_counters
        WHERE day BETWEEN $1::date AND $2::date
          AND metric IN ('welcome','cta_click','bot_start','pix_created','purchase')
        GROUP BY 1,2
        ORDER BY 1,2;
      `;
      const r1 = await client.query(q1, [ startDate.toISOString().slice(0,10), endDate.toISOString().slice(0,10) ]);

      let rows = r1.rows;
      // 2) Fallback para events (caso counters estejam vazios)
      if(rows.length === 0){
        console.info('[FUNNEL_API] using events fallback SQL');
        const q2 = `
          SELECT (occurred_at AT TIME ZONE 'America/Recife')::date AS day,
                 event_name AS metric,
                 COUNT(*)::int AS total
          FROM public.funnel_events
          WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
            AND event_name IN ('welcome','cta_click','bot_start','pix_created','purchase')
          GROUP BY 1,2
          ORDER BY 1,2;
        `;
        rows = (await client.query(q2, [ startDate.toISOString(), endDate.toISOString() ])).rows;
      }

      console.info('[FUNNEL_API] rows=', rows.length);

      // Monta série alinhada por dia
      const days = daysBetween(startDate, endDate).map(d => d.toISOString().slice(0,10));
      const idx = new Map(days.map((d,i)=>[d,i]));
      const series = buildEmptySeries(days.map(d => new Date(d)));

      for(const r of rows){
        const i = idx.get(String(r.day));
        if(i == null) continue;
        switch(r.metric){
          case 'welcome':     series.welcome[i]     = r.total; break;
          case 'cta_click':   series.cta_click[i]   = r.total; break;
          case 'bot_start':   series.bot_start[i]   = r.total; break;
          case 'pix_created': series.pix_created[i] = r.total; break;
          case 'purchase':    series.purchase[i]    = r.total; break;
        }
      }

      const cards = computeCards(series);
      const rates = computeRates(cards);
      console.info('[API_FUNNEL]', { ms: Date.now()-t0, start: startDate.toISOString(), end: endDate.toISOString(), rows: rows.length });
      return res.json({ cards, rates, series });
    } finally {
      client.release();
    }
  }catch(err){
    console.error('[API_FUNNEL_ERR]', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;