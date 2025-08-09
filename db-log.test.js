jest.setTimeout(30000);

describe('db-log destination', () => {
  const loggerPath = require.resolve('./src/infra/logger');
  const bootstrapPath = require.resolve('./bootstrap');

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('silently ignores missing bootstrap', async () => {
    const logger = { error: jest.fn() };
    jest.doMock(loggerPath, () => logger);
    jest.doMock(bootstrapPath, () => { throw new Error('MODULE_NOT_FOUND'); });
    const dbLog = require('./src/infra/destinations/db-log');
    await expect(dbLog({ foo: 'bar' })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  test('inserts payload when pool available', async () => {
    const mockQuery = jest.fn().mockResolvedValue({});
    const mockPool = { query: mockQuery };
    const logger = { error: jest.fn() };
    jest.doMock(loggerPath, () => logger);
    jest.doMock(bootstrapPath, () => ({ getDatabasePool: () => mockPool }));
    const dbLog = require('./src/infra/destinations/db-log');
    const payload = { hello: 'world' };
    await expect(dbLog(payload)).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledWith('INSERT INTO logs(data) VALUES ($1)', [JSON.stringify(payload)]);
  });
});
