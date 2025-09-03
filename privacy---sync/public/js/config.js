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
    // 🔥 ESTRUTURA HÍBRIDA: Suporta tanto planos (bot) quanto plans (privacy)
    window.SYNCPAY_CONFIG.plans = cfg.plans || {};
    window.SYNCPAY_CONFIG.planos = cfg.planos || [];
    window.SYNCPAY_CONFIG.downsells = cfg.downsells || [];
    window.PUSHINPAY_CONFIG = cfg.pushinpay || {};

    console.log('✅ [CONFIG] SYNCPAY_CONFIG configurado:', {
      client_id: !!window.SYNCPAY_CONFIG.client_id,
      client_secret: !!window.SYNCPAY_CONFIG.client_secret,
      plans: Object.keys(window.SYNCPAY_CONFIG.plans),
      planos: window.SYNCPAY_CONFIG.planos.length,
      downsells: window.SYNCPAY_CONFIG.downsells.length
    });

    // Verificar se as credenciais foram carregadas
    if (!window.SYNCPAY_CONFIG.client_id || !window.SYNCPAY_CONFIG.client_secret) {
      console.error('❌ [CONFIG] Credenciais SYNCPAY não configuradas!');
      console.error('client_id:', window.SYNCPAY_CONFIG.client_id || 'undefined');
      console.error('client_secret:', window.SYNCPAY_CONFIG.client_secret || 'undefined');
      console.error('🔧 Verifique se as variáveis SYNCPAY_CLIENT_ID e SYNCPAY_CLIENT_SECRET estão definidas no Render.com');
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
          priceLabel: 'R$ 19,98',
          price: 19.98,
          amount: 19.98,
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

    // 🔥 FUNÇÕES AUXILIARES IGUAL AO BOT
    window.obterPlanoPorId = function(id) {
      // Procura nos planos principais
      let plano = window.SYNCPAY_CONFIG.planos.find(p => p.id === id);
      if (plano) return plano;
      
      // Procura nos planos de downsells (igual ao bot)
      for (const downsell of window.SYNCPAY_CONFIG.downsells) {
        plano = downsell.planos.find(p => p.id === id);
        if (plano) return plano;
      }
      
      return null;
    };

    window.obterDownsellPorId = function(id) {
      return window.SYNCPAY_CONFIG.downsells.find(ds => ds.id === id);
    };

    window.formatarValorCentavos = function(valor) {
      const numerico = parseFloat(valor);
      if (isNaN(numerico)) return 0;
      return Math.round((numerico + Number.EPSILON) * 100);
    };

    window.gerarMenuPlanos = function() {
      return {
        texto: 'Escolha uma oferta abaixo:',
        opcoes: window.SYNCPAY_CONFIG.planos.map(plano => ({
          texto: `${plano.emoji} ${plano.nome} - ${plano.priceLabel}`,
          callback: plano.id
        }))
      };
    };

    window.obterNomeOferta = function(plano) {
      let nomeOferta = 'Oferta Desconhecida';
      
      if (plano) {
        // Buscar o plano na configuração
        const planoEncontrado = window.SYNCPAY_CONFIG.planos.find(p => p.id === plano || p.nome === plano);
        if (planoEncontrado) {
          nomeOferta = planoEncontrado.nome;
        } else {
          // Buscar nos downsells
          for (const ds of window.SYNCPAY_CONFIG.downsells) {
            const p = ds.planos.find(pl => pl.id === plano || pl.nome === plano);
            if (p) {
              nomeOferta = p.nome;
              break;
            }
          }
        }
      }
      
      return nomeOferta;
    };
    document.querySelectorAll('[data-config="model.handle"]').forEach(el => el.textContent = cfg.model.handle);
    document.querySelectorAll('[data-config="model.bio"]').forEach(el => el.textContent = cfg.model.bio);

    if (cfg.plans) {
      Object.keys(cfg.plans).forEach(key => {
        const plan = cfg.plans[key];
        // Garantir que o price seja um número
        if (plan.price && typeof plan.price === 'string') {
          plan.price = parseFloat(plan.price);
        }
        const labelEl = document.querySelector(`[data-config="plans.${key}.label"]`);
        const priceEl = document.querySelector(`[data-config="plans.${key}.priceLabel"]`);
        if (labelEl) labelEl.textContent = plan.label;
        if (priceEl) priceEl.textContent = plan.priceLabel;
      });
      console.log('✅ [CONFIG] Planos processados e valores convertidos para números');
    }
    
    console.log('🎉 [CONFIG] Configurações aplicadas com sucesso!');
    
  } catch (err) {
    console.error('❌ [CONFIG] Erro ao carregar configurações:', err);
  }
})();
