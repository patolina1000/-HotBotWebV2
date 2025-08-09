const logger = require('./logger');

const max = parseInt(process.env.LOG_QUEUE_MAX || '1000', 10);
const retryMax = parseInt(process.env.LOG_RETRY_MAX || '5', 10);
const circuitCooldown = parseInt(process.env.LOG_CIRCUIT_COOLDOWN_MS || '10000', 10);
const httpTimeout = parseInt(process.env.LOG_HTTP_TIMEOUT_MS || '1500', 10);

let queue = [];
let processing = false;
let accepting = true;
let stats = { dropped: 0, retries: 0, circuitOpenUntil: 0 };

function enqueueLog(task) {
  if (!accepting) return false;
  if (queue.length >= max) {
    queue.shift();
    stats.dropped++;
  }
  queue.push({ ...task, attempt: 0 });
  run();
  return true;
}

function run() {
  if (processing) return;
  processing = true;
  setImmediate(processQueue);
}

async function processQueue() {
  if (stats.circuitOpenUntil > Date.now()) {
    const wait = stats.circuitOpenUntil - Date.now();
    processing = false;
    setTimeout(run, wait);
    return;
  }
  const item = queue.shift();
  if (!item) {
    processing = false;
    return;
  }
  try {
    if (item.type === 'db') {
      const db = require('./destinations/db-log');
      await db(item.payload);
    } else if (item.type === 'http') {
      const http = require('./destinations/http-log');
      await http(item.payload, { timeout: httpTimeout });
    }
  } catch (err) {
    item.attempt++;
    stats.retries++;
    if (item.attempt > retryMax) {
      stats.circuitOpenUntil = Date.now() + circuitCooldown;
      logger.error({ err }, 'log worker circuit open');
    } else {
      const delay = Math.min(1000 * Math.pow(2, item.attempt), circuitCooldown);
      setTimeout(() => {
        queue.push(item);
        run();
      }, delay + Math.floor(Math.random() * 100));
    }
  } finally {
    if (queue.length) setImmediate(processQueue);
    else processing = false;
  }
}

function stopIntake() { accepting = false; }

function flush(timeout = 3000) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeout;
    (function wait() {
      if (!processing && queue.length === 0) return resolve();
      if (Date.now() > deadline) return resolve();
      setTimeout(wait, 50);
    })();
  });
}

function getMetrics() {
  return {
    size: queue.length,
    dropped: stats.dropped,
    retries: stats.retries,
    circuit_open: stats.circuitOpenUntil > Date.now()
  };
}

module.exports = { enqueueLog, stopIntake, flush, getMetrics };
