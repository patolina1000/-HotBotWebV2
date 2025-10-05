const express = require('express');
const funnelMetrics = require('../services/funnelMetrics');
const { panelLimiter, requirePanelToken } = require('../middleware/panelAccess');

const router = express.Router();

router.use(panelLimiter);
router.use(requirePanelToken);

router.get('/events/daily', async (req, res) => {
  const daysParam = req.query.days;

  try {
    const data = await funnelMetrics.getDailyCounters(daysParam);
    return res.json({ ok: true, data });
  } catch (error) {
    console.warn('[metrics] daily erro', { error: error.message });
    return res.status(503).json({ ok: false, error: 'metrics_unavailable' });
  }
});

router.get('/events/today', async (req, res) => {
  try {
    const data = await funnelMetrics.getTodayCounters();
    return res.json({ ok: true, data });
  } catch (error) {
    console.warn('[metrics] today erro', { error: error.message });
    return res.status(503).json({ ok: false, error: 'metrics_unavailable' });
  }
});

module.exports = router;
