(async function(){
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    window.APP_CONFIG = cfg;
    window.SYNCPAY_CONFIG = window.SYNCPAY_CONFIG || {};
    window.SYNCPAY_CONFIG.client_id = cfg.syncpay?.clientId;
    window.SYNCPAY_CONFIG.client_secret = cfg.syncpay?.clientSecret;
    window.SYNCPAY_CONFIG.plans = cfg.plans || {};
    window.PUSHINPAY_CONFIG = cfg.pushinpay || {};
    
    // Debug log to verify configuration
    console.log('✅ SYNC_PAY_CONFIG: OK');
    console.log('📋 Configuração carregada:', {
      client_id: !!window.SYNCPAY_CONFIG.client_id,
      client_secret: !!window.SYNCPAY_CONFIG.client_secret,
      plans: Object.keys(window.SYNCPAY_CONFIG.plans || {})
    });

    document.title = `Privacy | Checkout ${cfg.model.name}`;
    document.querySelectorAll('[data-config="model.name"]').forEach(el => el.textContent = cfg.model.name);
    document.querySelectorAll('[data-config="model.handle"]').forEach(el => el.textContent = cfg.model.handle);
    document.querySelectorAll('[data-config="model.bio"]').forEach(el => el.textContent = cfg.model.bio);

    if (cfg.plans) {
      Object.keys(cfg.plans).forEach(key => {
        const plan = cfg.plans[key];
        const labelEl = document.querySelector(`[data-config="plans.${key}.label"]`);
        const priceEl = document.querySelector(`[data-config="plans.${key}.priceLabel"]`);
        if (labelEl) labelEl.textContent = plan.label;
        if (priceEl) priceEl.textContent = plan.priceLabel;
      });
    }
  } catch (err) {
    console.error('Erro ao carregar configurações', err);
  }
})();
