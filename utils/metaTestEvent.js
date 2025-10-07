function getMetaTestEventCode(config) {
  if (process.env.TEST_EVENT_CODE) {
    return { code: process.env.TEST_EVENT_CODE, source: 'env' };
  }

  if (process.env.FB_TEST_EVENT_CODE) {
    return { code: process.env.FB_TEST_EVENT_CODE, source: 'env' };
  }

  if (process.env.META_TEST_EVENT_CODE) {
    return { code: process.env.META_TEST_EVENT_CODE, source: 'env' };
  }

  if (config?.facebook?.test_event_code) {
    return { code: config.facebook.test_event_code, source: 'config' };
  }

  return { code: null, source: null };
}

module.exports = { getMetaTestEventCode };
