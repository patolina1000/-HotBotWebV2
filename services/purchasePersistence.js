const sqlite = require('../database/sqlite');

let hasFunnelEventsTable = null;
let ensuredPurchaseContextTable = false;
let ensuredSqliteTable = false;

async function checkFunnelEventsTable(pool) {
  if (!pool) {
    hasFunnelEventsTable = false;
    return false;
  }

  if (hasFunnelEventsTable !== null) {
    return hasFunnelEventsTable;
  }

  try {
    const { rows } = await pool.query(`
      SELECT column_name
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'funnel_events'
    `);

    if (!rows || rows.length === 0) {
      hasFunnelEventsTable = false;
      return hasFunnelEventsTable;
    }

    const columnNames = rows.map(row => row.column_name);
    const requiredColumns = ['event_name', 'event_id', 'transaction_id', 'price_cents', 'meta'];
    const missing = requiredColumns.filter(column => !columnNames.includes(column));

    if (missing.length > 0) {
      console.warn('[DB] funnel_events indisponível para purchase_context, colunas ausentes', { missing });
      hasFunnelEventsTable = false;
      return hasFunnelEventsTable;
    }

    hasFunnelEventsTable = true;
  } catch (error) {
    console.warn(`[DB] falha ao verificar public.funnel_events err=${error.message}`);
    hasFunnelEventsTable = false;
  }

  return hasFunnelEventsTable;
}

async function ensurePostgresPurchaseContext(pool) {
  if (ensuredPurchaseContextTable || !pool) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_context (
      id BIGSERIAL PRIMARY KEY,
      occurred_at TIMESTAMPTZ DEFAULT NOW(),
      event_name TEXT,
      event_id TEXT UNIQUE,
      transaction_id TEXT,
      price_cents INTEGER,
      meta JSONB
    )
  `);

  await pool.query(
    `ALTER TABLE purchase_context ADD COLUMN IF NOT EXISTS event_name TEXT`
  );

  ensuredPurchaseContextTable = true;
}

function ensureSqlitePurchaseContext(db) {
  if (!db || ensuredSqliteTable) {
    return;
  }

  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'purchase_context'`)
    .get();

  if (!tableExists) {
    db.prepare(`
      CREATE TABLE purchase_context (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        event_name TEXT,
        event_id TEXT UNIQUE,
        transaction_id TEXT,
        price_cents INTEGER,
        meta TEXT
      )
    `).run();
  } else {
    const columns = db.prepare(`PRAGMA table_info(purchase_context)`).all();
    const hasEventName = columns.some(column => column.name === 'event_name');
    if (!hasEventName) {
      db.prepare(`ALTER TABLE purchase_context ADD COLUMN event_name TEXT`).run();
    }
  }

  ensuredSqliteTable = true;
}

function buildMetaPayload(event = {}) {
  const {
    utms = {},
    fbp = null,
    fbc = null,
    client_ip_address = null,
    client_user_agent = null,
    event_source_url = null,
    advanced_matching = {},
    contents = [],
    content_ids = [],
    content_type = null,
    content_name = null
  } = event || {};

  return {
    utms,
    fbp,
    fbc,
    client_ip_address,
    client_user_agent,
    event_source_url,
    advanced_matching,
    contents: Array.isArray(contents) ? contents : [],
    content_ids: Array.isArray(content_ids) ? content_ids : [],
    content_type: content_type || null,
    content_name: content_name || null
  };
}

async function savePurchaseContext({ pool = null, sqliteDb = null, event = {} } = {}) {
  const eventId = event?.event_id || null;
  if (!eventId) {
    return false;
  }

  const eventName = event?.event_name || 'purchase';

  const record = {
    event_name: typeof eventName === 'string' ? eventName : 'purchase',
    transaction_id: event?.transaction_id || null,
    price_cents: Number.isFinite(event?.price_cents) ? Math.trunc(event.price_cents) : null,
    event_id: eventId,
    meta: buildMetaPayload(event)
  };

  // Tentar salvar em Postgres primeiro
  if (pool) {
    try {
      const funnelExists = await checkFunnelEventsTable(pool);
      if (!funnelExists) {
        await ensurePostgresPurchaseContext(pool);
      }

      const targetTable = funnelExists ? 'public.funnel_events' : 'purchase_context';
      const query = `
        INSERT INTO ${targetTable} (event_name, transaction_id, price_cents, event_id, meta)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (event_id) DO NOTHING
      `;
      const values = [
        record.event_name,
        record.transaction_id,
        record.price_cents,
        record.event_id,
        JSON.stringify(record.meta)
      ];
      const result = await pool.query(query, values);

      if (result.rowCount > 0) {
        console.log('[DB] saved purchase', {
          event_id: record.event_id,
          transaction_id: record.transaction_id,
          price_cents: record.price_cents
        });
        return true;
      }

      console.log('[DB] purchase já existente', {
        event_id: record.event_id,
        transaction_id: record.transaction_id
      });
      return false;
    } catch (error) {
      console.error(`[DB] erro ao salvar purchase no Postgres err=${error.stack || error.message}`);
    }
  }

  const database = sqliteDb || (typeof sqlite?.get === 'function' ? sqlite.get() : null);
  if (database) {
    try {
      ensureSqlitePurchaseContext(database);
      const stmt = database.prepare(`
        INSERT OR IGNORE INTO purchase_context (event_name, transaction_id, price_cents, event_id, meta)
        VALUES (?, ?, ?, ?, ?)
      `);
      const info = stmt.run(
        record.event_name,
        record.transaction_id,
        record.price_cents,
        record.event_id,
        JSON.stringify(record.meta)
      );

      if (info.changes > 0) {
        console.log('[DB] saved purchase', {
          event_id: record.event_id,
          transaction_id: record.transaction_id,
          price_cents: record.price_cents
        });
        return true;
      }

      console.log('[DB] purchase já existente', {
        event_id: record.event_id,
        transaction_id: record.transaction_id
      });
    } catch (error) {
      console.error(`[DB] erro ao salvar purchase no SQLite err=${error.stack || error.message}`);
    }
  }

  return false;
}

module.exports = {
  savePurchaseContext
};
