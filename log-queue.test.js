const { enqueueLog, flush } = require('./src/infra/log-queue');

jest.mock('./src/infra/destinations/db-log', () => jest.fn(async () => {}));
const dbLog = require('./src/infra/destinations/db-log');

jest.mock('./src/infra/destinations/http-log', () => jest.fn(async () => {}));
const httpLog = require('./src/infra/destinations/http-log');

test('processes db and http logs asynchronously', async () => {
  enqueueLog({ type: 'db', payload: { a: 1 } });
  enqueueLog({ type: 'http', payload: { url: 'http://example.com', data: { b: 2 } } });
  await flush(1000);
  expect(dbLog).toHaveBeenCalled();
  expect(httpLog).toHaveBeenCalled();
});
