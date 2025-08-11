const columnsSql = `
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='funnel_events'
ORDER BY ordinal_position;`;

const indexesSql = `
SELECT i.relname AS index_name, ix.indisunique, ix.indisvalid, ix.indisready,
       pg_get_indexdef(ix.indexrelid) AS index_def
FROM pg_index ix
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='public' AND t.relname='funnel_events'
ORDER BY i.relname;`;

const triggersSql = `
SELECT t.tgname, p.oid AS proc_oid, p.proname, pg_get_triggerdef(t.oid) AS trigger_def
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid='public.funnel_events'::regclass AND NOT t.tgisinternal
ORDER BY t.tgname;`;

async function loadFunctionSrc(client, oid) {
  const { rows } = await client.query('SELECT pg_get_functiondef($1::oid) AS src', [oid]);
  return rows[0] ? rows[0].src : '';
}

function analyzeTriggers(triggers, colMap, client) {
  return Promise.all(triggers.map(async trig => {
    const src = await loadFunctionSrc(client, trig.proc_oid);
    const lines = src.split('\n').slice(0, 3);
    const newRefs = Array.from(src.matchAll(/NEW\.([a-zA-Z0-9_]+)/g)).map(m => m[1]);
    const missing = newRefs.filter(c => !colMap[c]);
    const suspicious = newRefs.includes('ip') || missing.length > 0;
    return {
      trigger_name: trig.tgname,
      function_name: trig.proname,
      oid: trig.proc_oid,
      trigger_def: trig.trigger_def,
      src_first_lines: lines,
      suspicious,
      missing_columns: missing
    };
  }));
}

async function ensureFunnelEventsReady(pool) {
  const client = await pool.connect();
  try {
    // Columns
    const { rows: columns } = await client.query(columnsSql);
    const colMap = Object.fromEntries(columns.map(c => [c.column_name, c]));
    const col = colMap.event_id;
    if (!col || col.data_type !== 'text' || col.is_nullable !== 'NO') {
      console.error('FATAL: coluna event_id inválida em public.funnel_events');
      throw new Error('funnel_events.event_id inválido');
    }
    console.log('DB_SANITY: funnel_events.event_id OK');

    // Indexes
    let { rows: indexes } = await client.query(indexesSql);
    let ux = indexes.find(i => i.index_name === 'ux_funnel_events_event_id');
    if (!ux || !(ux.indisunique && ux.indisvalid && ux.indisready)) {
      try {
        await client.query('CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ux_funnel_events_event_id ON public.funnel_events(event_id)');
      } catch (err) {
        console.warn('⚠️ Falha ao criar índice CONCURRENTLY:', err.message);
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS ux_funnel_events_event_id ON public.funnel_events(event_id)');
      }
      ({ rows: indexes } = await client.query(indexesSql));
      ux = indexes.find(i => i.index_name === 'ux_funnel_events_event_id');
      if (!ux || !(ux.indisunique && ux.indisvalid && ux.indisready)) {
        console.error('FATAL: índice único ux_funnel_events_event_id inválido');
        throw new Error('ux_funnel_events_event_id inválido');
      }
    }
    console.log(`DB_SANITY: ux_funnel_events_event_id { indisunique:${ux.indisunique}, indisvalid:${ux.indisvalid}, indisready:${ux.indisready} }`);

    // Triggers
    const { rows: trigRows } = await client.query(triggersSql);
    const triggers = await analyzeTriggers(trigRows, colMap, client);
    const bad = triggers.find(t => t.suspicious);
    if (bad) {
      console.error(`FATAL: trigger suspeito ${bad.trigger_name} (${bad.function_name}) oid ${bad.oid}\n${bad.src_first_lines.join('\n')}\nSugerido: DROP TRIGGER ${bad.trigger_name} ON public.funnel_events; DROP FUNCTION ${bad.function_name}();`);
      throw new Error('trigger inválido detectado');
    }

    return { columns, indexes, triggers, ok: true };
  } finally {
    client.release();
  }
}

async function inspectFunnelEvents(pool) {
  const client = await pool.connect();
  try {
    const { rows: columns } = await client.query(columnsSql);
    const colMap = Object.fromEntries(columns.map(c => [c.column_name, c]));
    const { rows: indexes } = await client.query(indexesSql);
    const { rows: trigRows } = await client.query(triggersSql);
    const triggers = await analyzeTriggers(trigRows, colMap, client);
    const ux = indexes.find(i => i.index_name === 'ux_funnel_events_event_id');
    const ok = colMap.event_id && colMap.event_id.data_type === 'text' && colMap.event_id.is_nullable === 'NO' && ux && ux.indisunique && ux.indisvalid && ux.indisready && !triggers.some(t => t.suspicious);
    return { columns, indexes, triggers, ok };
  } finally {
    client.release();
  }
}

module.exports = { ensureFunnelEventsReady, inspectFunnelEvents };
