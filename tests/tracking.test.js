const fs = require('fs');
const axios = require('axios');
require('dotenv').config();
process.env.FB_PIXEL_ID = 'PIXEL_TEST';
process.env.FB_PIXEL_TOKEN = 'TOKEN_TEST';
const { sendFacebookEvent, generateEventId } = require('../services/facebook');
const { extractHashedUserData } = require('../services/userData');

jest.mock('axios');

beforeEach(() => {
  axios.post.mockReset();
  process.env.FB_PIXEL_ID = 'PIXEL_TEST';
  process.env.FB_PIXEL_TOKEN = 'TOKEN_TEST';
});

afterEach(() => {
  delete process.env.FB_PIXEL_ID;
  delete process.env.FB_PIXEL_TOKEN;
});

test('generateEventId uses token for Purchase events', () => {
  const id = generateEventId('Purchase', 'tok123');
  expect(id).toBe('tok123');
});

test('obrigado.html sends Purchase with token as eventID', () => {
  const html = fs.readFileSync('MODELO1/WEB/obrigado.html', 'utf8');
  expect(html).toMatch(/eventID\s*:\s*token/);
});

test('obrigado.html accepts t query alias', () => {
  const html = fs.readFileSync('MODELO1/WEB/obrigado.html', 'utf8');
  expect(html).toMatch(/urlParams\.get\('token'\)\s*\|\|\s*urlParams\.get\('t'\)/);
});

test('sendFacebookEvent forwards valid fbp and fbc', async () => {
  axios.post.mockResolvedValue({ data: { success: true } });

  await sendFacebookEvent({
    event_name: 'Purchase',
    event_id: 'tok',
    fbp: 'fbp123',
    fbc: 'fb.1.1700000000.abc',
    value: 1
  });

  const payload = axios.post.mock.calls[0][1];
  const userData = payload.data[0].user_data;
  expect(userData.fbp).toBe('fbp123');
  expect(userData.fbc).toBe('fb.1.1700000000.abc');
});

test('sendFacebookEvent omits invalid user data', async () => {
  axios.post.mockResolvedValue({ data: {} });

  await sendFacebookEvent({
    event_name: 'Purchase',
    event_id: 'tok2',
    fbp: '',
    fbc: 'invalid',
    client_ip_address: '127.0.0.1',
    client_user_agent: 'axios/1.0',
    value: 2
  });

  const payload = axios.post.mock.calls[0][1];
  const userData = payload.data[0].user_data;
  expect(userData.fbp).toBeUndefined();
  expect(userData.fbc).toBeUndefined();
  expect(userData.client_ip_address).toBeUndefined();
});

test('extractHashedUserData ignores invalid inputs', () => {
  const result = extractHashedUserData('{bad}', '123');
  expect(result).toEqual({});
});

test('sendFacebookEvent envia payload completo e correto', async () => {
  axios.post.mockResolvedValue({ data: { success: true } });

  const token = 'tokXYZ';

  await sendFacebookEvent({
    event_name: 'Purchase',
    event_id: token,
    fbp: 'fbp123',
    fbc: 'fbc456',
    value: 1,
    currency: 'BRL',
    event_time: Math.floor(Date.now() / 1000)
  });

  const payload = axios.post.mock.calls[0][1];
  const data = payload.data[0];

  expect(data.event_name).toBe('Purchase');
  expect(data.custom_data.value).toBe(1);
  expect(data.custom_data.currency).toBe('BRL');
  expect(typeof data.event_time).toBe('number');
  expect(data.event_id).toBe(token);
  expect(data.action_source).toBe('website');
});

test('sendFacebookEvent inclui codigo de teste quando FORCE_FB_TEST_MODE=1', async () => {
  axios.post.mockResolvedValue({ data: {} });
  const prevCode = process.env.FB_TEST_EVENT_CODE;
  const prevEnv = process.env.NODE_ENV;
  const prevForce = process.env.FORCE_FB_TEST_MODE;
  process.env.FB_TEST_EVENT_CODE = 'CODE123';
  process.env.NODE_ENV = 'production';
  process.env.FORCE_FB_TEST_MODE = '1';

  await sendFacebookEvent({ event_name: 'Purchase', event_id: 'tokp', value: 3 });

  const payload = axios.post.mock.calls[0][1];
  expect(payload.test_event_code).toBe('CODE123');

  process.env.NODE_ENV = prevEnv;
  if (prevCode === undefined) {
    delete process.env.FB_TEST_EVENT_CODE;
  } else {
    process.env.FB_TEST_EVENT_CODE = prevCode;
  }
  if (prevForce === undefined) {
    delete process.env.FORCE_FB_TEST_MODE;
  } else {
    process.env.FORCE_FB_TEST_MODE = prevForce;
  }
});

test('sendFacebookEvent omite codigo de teste em producao sem flag', async () => {
  axios.post.mockResolvedValue({ data: {} });
  const prevCode = process.env.FB_TEST_EVENT_CODE;
  const prevEnv = process.env.NODE_ENV;
  delete process.env.FORCE_FB_TEST_MODE;
  process.env.FB_TEST_EVENT_CODE = 'CODE999';
  process.env.NODE_ENV = 'production';

  await sendFacebookEvent({ event_name: 'Purchase', event_id: 'tokp2', value: 3 });

  const payload = axios.post.mock.calls[0][1];
  expect(payload.test_event_code).toBeUndefined();

  process.env.NODE_ENV = prevEnv;
  if (prevCode === undefined) {
    delete process.env.FB_TEST_EVENT_CODE;
  } else {
    process.env.FB_TEST_EVENT_CODE = prevCode;
  }
});

test('sendFacebookEvent prioriza argumento test_event_code sobre variavel', async () => {
  axios.post.mockResolvedValue({ data: {} });
  const prevCode = process.env.FB_TEST_EVENT_CODE;
  process.env.FB_TEST_EVENT_CODE = 'ENV123';

  await sendFacebookEvent({
    event_name: 'Purchase',
    event_id: 'toka',
    value: 4,
    test_event_code: 'ARG456'
  });

  const payload = axios.post.mock.calls[0][1];
  expect(payload.test_event_code).toBe('ARG456');
  if (prevCode === undefined) {
    delete process.env.FB_TEST_EVENT_CODE;
  } else {
    process.env.FB_TEST_EVENT_CODE = prevCode;
  }
});

test('sendFacebookEvent omite test_event_code quando nao definido', async () => {
  axios.post.mockResolvedValue({ data: {} });
  const prevCode = process.env.FB_TEST_EVENT_CODE;
  delete process.env.FB_TEST_EVENT_CODE;

  await sendFacebookEvent({ event_name: 'Purchase', event_id: 'tokn', value: 5 });

  const payload = axios.post.mock.calls[0][1];
  expect(payload.test_event_code).toBeUndefined();
  if (prevCode !== undefined) {
    process.env.FB_TEST_EVENT_CODE = prevCode;
  }
});
