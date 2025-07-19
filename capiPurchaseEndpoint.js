const { sendFacebookEvent } = require('./services/facebook');

function createCapiPurchaseHandler(getPool) {
  return async function capiPurchase(req, res) {
    const { token, value, fbp, fbc } = req.body || {};

    if (!token) {
      return res.status(400).json({ success: false });
    }

    const pool = typeof getPool === 'function' ? getPool() : getPool;
    if (!pool) {
      return res.status(500).json({ success: false });
    }

    try {
      const result = await pool.query(
        'SELECT valor, status, usado, event_time FROM tokens WHERE token = $1',
        [token]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ success: false });
      }

      const tokenData = result.rows[0];
      if (tokenData.status !== 'valido' || tokenData.usado) {
        return res.status(400).json({ success: false });
      }

      const valorFinal =
        typeof value === 'number' ? value : parseFloat(tokenData.valor);
      const eventTime = tokenData.event_time || Math.floor(Date.now() / 1000);

      const fbResult = await sendFacebookEvent({
        event_name: 'Purchase',
        event_time: eventTime,
        event_id: token,
        action_source: 'website',
        value: valorFinal,
        currency: 'BRL',
        fbp,
        fbc
      });

      if (fbResult.success) {
        await pool.query(
          "UPDATE tokens SET status = 'expirado', usado = TRUE, data_uso = CURRENT_TIMESTAMP WHERE token = $1",
          [token]
        );
        return res.json({ success: true });
      }

      return res.status(500).json({ success: false });
    } catch (err) {
      console.error('Erro no capi-purchase handler:', err.message);
      res.status(500).json({ success: false });
    }
  };
}

module.exports = createCapiPurchaseHandler;
