const db = require('./database/postgres');

async function main() {
  const daysArg = parseInt(process.argv[2], 10);
  const days = isNaN(daysArg) ? 7 : daysArg;

  const pool = db.pool || (typeof db.createPool === 'function' ? db.createPool() : db);
  const client = await pool.connect();

  try {
    console.log(`\n📅 Período analisado: últimos ${days} dias`);

    // Contagem bruta de eventos
    const rawQuery = `
      SELECT lower(event_name) AS event_name, COUNT(*) AS total
      FROM funnel_events
      WHERE occurred_at >= NOW() - ($1 * INTERVAL '1 day')
      GROUP BY 1
      ORDER BY 2 DESC;
    `;
    const rawResult = await client.query(rawQuery, [days]);
    console.log('\n📊 Contagem bruta de funnel_events');
    console.table(rawResult.rows);

    // Contagem canônica usando mapeamento
    const canonicalQuery = `
      SELECT
        CASE
          WHEN lower(event_name) IN ('welcome','view','viewcontent','welcome_view') THEN 'welcome'
          WHEN lower(event_name) IN ('cta_click','click','cta','offer_shown')       THEN 'cta_click'
          WHEN lower(event_name) IN ('bot_start','start','start_bot','bot_enter')   THEN 'bot_start'
          WHEN lower(event_name) IN ('pix_created','pix','cashin','pix_cashin')     THEN 'pix_created'
          WHEN lower(event_name) IN ('purchase','paid','payment_approved')          THEN 'purchase'
          ELSE NULL
        END AS canonical,
        COUNT(*) AS total
      FROM funnel_events
      WHERE occurred_at >= NOW() - ($1 * INTERVAL '1 day')
      GROUP BY 1
      ORDER BY 2 DESC;
    `;
    const canonicalResult = await client.query(canonicalQuery, [days]);
    console.log('\n📊 Contagem canônica de funnel_events');
    console.table(canonicalResult.rows);

    // Lista de canônicos ausentes
    const canonicalNames = ['welcome','cta_click','bot_start','pix_created','purchase'];
    const existing = new Map(canonicalResult.rows.map(r => [r.canonical, parseInt(r.total, 10)]));
    const missing = canonicalNames.filter(name => !existing.has(name) || existing.get(name) === 0);
    console.log('\n🚫 Canônicos ausentes no período');
    console.table(missing.map(name => ({ canonical: name })));

    // Total de linhas em funnel_counters
    const countersQuery = `
      SELECT COUNT(*) AS total
      FROM funnel_counters
      WHERE day >= NOW() - ($1 * INTERVAL '1 day');
    `;
    const countersResult = await client.query(countersQuery, [days]);
    console.log('\n📈 Linhas em funnel_counters no período:', countersResult.rows[0].total);
  } catch (err) {
    console.error('❌ Erro no diagnóstico do funil:', err);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

main();
