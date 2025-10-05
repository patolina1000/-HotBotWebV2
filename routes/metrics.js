const express = require('express');
const funnelMetrics = require('../services/funnelMetrics');
const { panelLimiter, requirePanelToken } = require('../middleware/panelAccess');

const router = express.Router();

router.use(panelLimiter);
router.use(requirePanelToken);

router.use((req, res, next) => {
  const requestId = req.requestId || null;
  const tokenHash = res.locals.panelTokenHash || 'unknown';
  console.log('[panel-access] metrics', {
    req_id: requestId,
    token_hash: tokenHash,
    path: req.path
  });
  next();
});

router.get('/events/daily', async (req, res) => {
  const daysParam = req.query.days;

  try {
    const data = await funnelMetrics.getDailyCounters(daysParam);
    return res.json({ ok: true, data });
  } catch (error) {
    const requestId = req.requestId || null;
    console.warn('[metrics] daily erro', { req_id: requestId, error: error.message });
    return res.status(503).json({ ok: false, error: 'metrics_unavailable' });
  }
});

router.get('/events/today', async (req, res) => {
  try {
    const data = await funnelMetrics.getTodayCounters();
    return res.json({ ok: true, data });
  } catch (error) {
    const requestId = req.requestId || null;
    console.warn('[metrics] today erro', { req_id: requestId, error: error.message });
    return res.status(503).json({ ok: false, error: 'metrics_unavailable' });
  }
});

module.exports = router;
