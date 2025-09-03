(async function(){
  try {
    console.log('🔧 [CONFIG] Carregando configurações do servidor...');
    const res = await fetch('/api/config');
    const cfg = await res.json();
    
    console.log('📋 [CONFIG] Configurações recebidas:', cfg);
    
    window.APP_CONFIG = cfg;
    window.SYNCPAY_CONFIG = window.SYNCPAY_CONFIG || {};
    window.SYNCPAY_CONFIG.client_id = cfg.syncpay?.clientId;
    window.SYNCPAY_CONFIG.client_secret = cfg.syncpay?.clientSecret;
    window.SYNCPAY_CONFIG.plans = cfg.plans || {};
    window.PUSHINPAY_CONFIG = cfg.pushinpay || {};

    console.log('✅ [CONFIG] SYNCPAY_CONFIG configurado:', {
      client_id: !!window.SYNCPAY_CONFIG.client_id,
      client_secret: !!window.SYNCPAY_CONFIG.client_secret,
      plans: Object.keys(window.SYNCPAY_CONFIG.plans)
    });

    // Verificar se as credenciais foram carregadas
    if (!window.SYNCPAY_CONFIG.client_id || !window.SYNCPAY_CONFIG.client_secret) {
      console.warn('⚠️ [CONFIG] Credenciais SYNCPAY não configuradas - usando valores demo');
      console.log('client_id:', window.SYNCPAY_CONFIG.client_id ? 'DEFINIDO' : 'NÃO DEFINIDO');
      console.log('client_secret:', window.SYNCPAY_CONFIG.client_secret ? 'DEFINIDO' : 'NÃO DEFINIDO');
    } else {
      console.log('✅ [CONFIG] Credenciais SYNCPAY carregadas com sucesso');
    }

    // Verificar se os planos foram carregados
    if (!window.SYNCPAY_CONFIG.plans || Object.keys(window.SYNCPAY_CONFIG.plans).length === 0) {
      console.error('❌ [CONFIG] Planos não carregados!');
      console.error('Plans:', window.SYNCPAY_CONFIG.plans);
      
      // Aplicar planos de fallback com validação
      window.SYNCPAY_CONFIG.plans = {
        monthly: {
          buttonId: 'btn-1-mes',
          label: '1 mês',
          priceLabel: 'R$ 19,90',
          price: 19.90,
          amount: 19.90,
          description: 'Assinatura mensal'
        },
        quarterly: {
          buttonId: 'btn-3-meses',
          label: '3 meses',
          priceLabel: 'R$ 59,70',
          price: 59.70,
          amount: 59.70,
          description: 'Assinatura trimestral'
        },
        semestrial: {
          buttonId: 'btn-6-meses',
          label: '6 meses',
          priceLabel: 'R$ 119,40',
          price: 119.40,
          amount: 119.40,
          description: 'Assinatura semestral'
        }
      };
      console.log('🔧 [CONFIG] Planos de fallback aplicados com valores validados');
      
      // Atualizar elementos da página com os planos de fallback
      Object.keys(window.SYNCPAY_CONFIG.plans).forEach(key => {
        const plan = window.SYNCPAY_CONFIG.plans[key];
        const labelEl = document.querySelector(`[data-config="plans.${key}.label"]`);
        const priceEl = document.querySelector(`[data-config="plans.${key}.priceLabel"]`);
        if (labelEl) labelEl.textContent = plan.label;
        if (priceEl) priceEl.textContent = plan.priceLabel;
      });
    } else {
      console.log('✅ [CONFIG] Planos carregados:', Object.keys(window.SYNCPAY_CONFIG.plans));
    }

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
    
    console.log('🎉 [CONFIG] Configurações aplicadas com sucesso!');
    
  } catch (err) {
    console.error('❌ [CONFIG] Erro ao carregar configurações:', err);
  }
})();
