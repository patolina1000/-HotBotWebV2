const postgres = require('../database/postgres');

const KNOWN_EVENTS = new Set([
  'lead_sent',
  'lead_fail',
  'ic_sent',
  'ic_fail',
  'purchase_sent',
  'purchase_dup',
  'purchase_fail',
  'utmify_sent',
  'utmify_fail',
  'utmify_retry'
]);

let pool = null;
let tablesReady = true;

function initialize(dbPool) {
  pool = dbPool;
}

function getPool() {
  if (pool) {
    return pool;
  }
  return postgres.getPool();
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return null;
  }

  const sanitized = {};
  Object.entries(meta).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }
    if (typeof value === 'boolean') {
      sanitized[key] = value;
      return;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      sanitized[key] = value;
      return;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed && trimmed.length <= 64) {
        sanitized[key] = trimmed;
      }
    }
  });

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

async function recordEvent(eventName, options = {}) {
  const db = getPool();
  if (!db) {
    return { recorded: false, reason: 'pool_unavailable' };
  }

  const safeEvent = KNOWN_EVENTS.has(eventName) ? eventName : String(eventName || 'unknown');
  const telegramId = options.telegramId ? Number(options.telegramId) || null : null;
  const token = options.token ? String(options.token) : null;
  const meta = sanitizeMeta(options.meta);

  const occurredAt = options.occurredAt instanceof Date ? options.occurredAt : new Date();
  const eventDate = occurredAt.toISOString().slice(0, 10);

  try {
    await db.query(
      `INSERT INTO funnel_events (event_name, telegram_id, token, meta, occurred_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [safeEvent, telegramId, token, meta, occurredAt]
    );

    await db.query(
      `INSERT INTO funnel_counters (event_date, event_name, total)
       VALUES ($1, $2, 1)
       ON CONFLICT (event_date, event_name)
       DO UPDATE SET total = funnel_counters.total + 1`,
      [eventDate, safeEvent]
    );

    tablesReady = true;
    return { recorded: true };
  } catch (error) {
    if (tablesReady) {
      console.warn('[funnel-metrics] falha ao registrar evento', {
        event: safeEvent,
        reason: error.message
      });
    }
    tablesReady = false;
    return { recorded: false, reason: error.message };
  }
}

function mergeDailyRows(rows) {
  const grouped = new Map();

  rows.forEach(row => {
    const dateKey = row.event_date.toISOString().slice(0, 10);
    const current = grouped.get(dateKey) || { date: dateKey };
    current[row.event_name] = Number(row.total) || 0;
    grouped.set(dateKey, current);
  });

  return Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function getDailyCounters(days = 14) {
  const db = getPool();
  if (!db) {
    throw new Error('pool_unavailable');
  }

  const parsed = Number.parseInt(days, 10);
  const clamped = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 90) : 14;

  const { rows } = await db.query(
    `SELECT event_date, event_name, total
       FROM funnel_counters
      WHERE event_date >= (CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day')
      ORDER BY event_date ASC, event_name ASC`,
    [clamped]
  );

  return mergeDailyRows(rows);
}

async function getTodayCounters() {
  const db = getPool();
  if (!db) {
    throw new Error('pool_unavailable');
  }

  const { rows } = await db.query(
    `SELECT event_date, event_name, total
       FROM funnel_counters
      WHERE event_date = CURRENT_DATE`
  );

  const [today] = mergeDailyRows(rows);
  return today || { date: new Date().toISOString().slice(0, 10) };
}

async function cleanupOldEvents({ olderThanDays = 30 } = {}) {
  const db = getPool();
  if (!db) {
    return { deleted: 0 };
  }

  const days = Number.parseInt(olderThanDays, 10);
  if (!Number.isFinite(days) || days <= 0) {
    return { deleted: 0 };
  }

  const result = await db.query(
    `DELETE FROM funnel_events WHERE occurred_at < NOW() - ($1::int * INTERVAL '1 day')`,
    [days]
  );

  return { deleted: result.rowCount || 0 };
}

async function ensureIndexes() {
  const db = getPool();
  if (!db) {
    return;
  }

  await db.query(`CREATE INDEX IF NOT EXISTS idx_funnel_events_occurred_at ON funnel_events (occurred_at)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_funnel_events_event_name ON funnel_events (event_name)`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_funnel_counters_event_date_name ON funnel_counters (event_date, event_name)`
  );
}

module.exports = {
  initialize,
  recordEvent,
  getDailyCounters,
  getTodayCounters,
  cleanupOldEvents,
  ensureIndexes
};
