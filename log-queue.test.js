describe('log queue', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllTimers();
    delete process.env.LOG_RETRY_MAX;
    delete process.env.LOG_CIRCUIT_COOLDOWN_MS;
  });

  test('processes db and http logs asynchronously', async () => {
    jest.useRealTimers();
    jest.doMock('./src/infra/destinations/db-log', () => jest.fn(async () => {}));
    jest.doMock('./src/infra/destinations/http-log', () => jest.fn(async () => {}));
    const { enqueueLog, flush } = require('./src/infra/log-queue');
    const dbLog = require('./src/infra/destinations/db-log');
    const httpLog = require('./src/infra/destinations/http-log');

    enqueueLog({ type: 'db', payload: { a: 1 } });
    enqueueLog({ type: 'http', payload: { url: 'http://example.com', data: { b: 2 } } });
    await flush(1000);
    expect(dbLog).toHaveBeenCalled();
    expect(httpLog).toHaveBeenCalled();
  });

  test('breaker opens and closes', async () => {
    jest.useRealTimers();
    process.env.LOG_RETRY_MAX = '0';
    process.env.LOG_CIRCUIT_COOLDOWN_MS = '100';
    jest.doMock('./src/infra/destinations/db-log', () => jest.fn(async () => { throw new Error('fail'); }));
    const { enqueueLog, flush, getMetrics } = require('./src/infra/log-queue');
    const dbLog = require('./src/infra/destinations/db-log');

    enqueueLog({ type: 'db', payload: {} });
    await flush(50);
    expect(dbLog).toHaveBeenCalledTimes(1);
    expect(getMetrics().circuit_open).toBe(true);

    dbLog.mockResolvedValueOnce();
    enqueueLog({ type: 'db', payload: {} });
    await new Promise(res => setTimeout(res, 110));
    await flush(50);
    expect(dbLog).toHaveBeenCalledTimes(2);
    expect(getMetrics().circuit_open).toBe(false);
  });

  test('flush respects timeout', async () => {
    jest.useRealTimers();
    jest.doMock('./src/infra/destinations/db-log', () => jest.fn(() => new Promise(res => setTimeout(res, 100))));
    const { enqueueLog, flush } = require('./src/infra/log-queue');

    const start = Date.now();
    enqueueLog({ type: 'db', payload: {} });
    await flush(10);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(10);
    expect(elapsed).toBeLessThan(100);
    await new Promise(res => setTimeout(res, 110));
  });
});
