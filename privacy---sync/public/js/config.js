// Configurações do Privacy Sync - Frontend
// Este arquivo carrega as configurações das variáveis de ambiente do Render via API

(async function(){
  try {
    console.log('🔧 [CONFIG] Carregando configurações das variáveis do Render...');
    
    // Carregar configurações do servidor (que pega as variáveis do Render)
    let cfg;
    try {
      const res = await fetch('/api/config');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      cfg = await res.json();
      console.log('📋 [CONFIG] Configurações recebidas do Render via servidor:', cfg);
    } catch (fetchError) {
      console.warn('⚠️ [CONFIG] Falha ao carregar do Render via servidor, usando configurações padrão:', fetchError);
      
      // Configurações padrão caso não consiga carregar do servidor
      cfg = {
        gateway: 'pushinpay',
        environment: 'production',
        generateQRCodeOnMobile: true,
        
        syncpay: {
          clientId: '8d7dccf5-dd11-4026-987e-24451d53f49e',
          clientSecret: '6da3c453-35df-4a2a-a0a1-2f4e9a27b128'
        },
        
        pushinpay: {
          token: '36250|MPvURHE0gE6lqsPN0PtwDOUVISoLjSyvqYUvuDPi47f09b29'
        },
        
        webhook: {
          baseUrl: 'https://privacy-sync.vercel.app',
          secret: ''
        },
        
        model: {
          name: 'Hadrielle Maria',
          handle: '@hadriiimaria_',
          bio: 'Tenho 22 aninhos... 😇 carinha de santinha e a bunda mais grande e gulosa 🍑 que você já viu.\nPeito no ponto 🍒 e corpo de cavala, feito pra você meter com força e gozar sorrindo 😈.\nAqui eu me esfrego, me abro, gozo alto 💦 e ainda te chamo de safado olhando nos teus olhos 👀.\nDe ladinho, de quatro, com o dedo na bunda 👉🍑 e a boceta escorrendo tesão 🔥.\nGravo vídeo com gozada real 🎥💦, sem fingimento, só putaria crua e molhada.\nFaço avaliação de rola 🍆, vídeo sob medida e cumpro teus fetiches no talo 🎁😋.\nSe não vier me ver ABERTINHA 👀💋, vai bater punheta arrependido depois 🖐️💦.'
        },
        
        // 🔥 ESTRUTURA DE PLANOS IGUAL AO BOT (mantendo planos atuais do privacy)
        planos: [
          {
            id: 'monthly',
            nome: '1 mês',
            emoji: '🥉',
            valor: 19.90,
            descricao: 'Assinatura mensal',
            buttonId: 'btn-1-mes',
            priceLabel: 'R$ 19,90'
          },
          {
            id: 'quarterly',
            nome: '3 meses (30% de desconto)',
            emoji: '🥈',
            valor: 41.90,
            descricao: 'Assinatura trimestral com desconto',
            buttonId: 'btn-3-meses',
            priceLabel: 'R$ 41,90'
          },
          {
            id: 'semestrial',
            nome: '6 meses (50% de desconto)',
            emoji: '🥇',
            valor: 59.90,
            descricao: 'Assinatura semestral com desconto',
            buttonId: 'btn-6-meses',
            priceLabel: 'R$ 59,90'
          }
        ],

        // 🔥 DOWNSELLS (mesmo conceito do bot, mas vazio por enquanto)
        downsells: [],

        // 🔥 MANTER COMPATIBILIDADE COM ESTRUTURA ANTIGA (FALLBACK)
        plans: {
          monthly: {
            buttonId: 'btn-1-mes',
            label: '1 mês',
            priceLabel: 'R$ 19,90',
            price: 19.90,
            description: 'Assinatura mensal'
          },
          quarterly: {
            buttonId: 'btn-3-meses',
            label: '3 meses (30% de desconto)',
            priceLabel: 'R$ 41,90',
            price: 41.90,
            description: 'Assinatura trimestral com desconto'
          },
          semestrial: {
            buttonId: 'btn-6-meses',
            label: '6 meses (50% de desconto)',
            priceLabel: 'R$ 59,90',
            price: 59.90,
            description: 'Assinatura semestral com desconto'
          }
        },
        
        redirectUrl: '/compra-aprovada',
        generateQRCodeOnMobile: true
      };
    }
    
    // Configurar variáveis globais
    window.APP_CONFIG = cfg;
    
    // 🔥 NOVO: Log para verificar configuração
    console.log('✅ [CONFIG] APP_CONFIG configurado:', {
      redirectUrl: window.APP_CONFIG.redirectUrl,
      model: window.APP_CONFIG.model?.name,
      plans: Object.keys(window.APP_CONFIG.plans || {}),
      planos: window.APP_CONFIG.planos?.length || 0
    });
    
    window.SYNCPAY_CONFIG = window.SYNCPAY_CONFIG || {};
    // 🔥 CREDENCIAIS HARDCODED - FODA-SE A SEGURANÇA!
    window.SYNCPAY_CONFIG.client_id = '8d7dccf5-dd11-4026-987e-24451d53f49e';
    window.SYNCPAY_CONFIG.client_secret = '6da3c453-35df-4a2a-a0a1-2f4e9a27b128';
    // 🔥 ESTRUTURA HÍBRIDA: Suporta tanto planos (bot) quanto plans (privacy)
    window.SYNCPAY_CONFIG.plans = cfg.plans || {};
    window.SYNCPAY_CONFIG.planos = cfg.planos || [];
    window.SYNCPAY_CONFIG.downsells = cfg.downsells || [];
    // 🔥 PUSHINPAY TOKEN HARDCODED TAMBÉM!
    window.PUSHINPAY_CONFIG = {
      token: '36250|MPvURHE0gE6lqsPN0PtwDOUVISoLjSyvqYUvuDPi47f09b29'
    };

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
      console.error('🔧 Verifique se as variáveis SYNCPAY_CLIENT_ID e SYNCPAY_CLIENT_SECRET estão definidas no servidor');
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
          label: '3 meses (30% de desconto)',
          priceLabel: 'R$ 41,90',
          price: 41.90,
          amount: 41.90,
          description: 'Assinatura trimestral com desconto'
        },
        semestrial: {
          buttonId: 'btn-6-meses',
          label: '6 meses (50% de desconto)',
          priceLabel: 'R$ 59,90',
          price: 59.90,
          amount: 59.90,
          description: 'Assinatura semestral com desconto'
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

    // Atualizar título da página e informações do modelo
    if (cfg.model) {
      document.title = `Privacy | Checkout - ${cfg.model.name}`;
      document.querySelectorAll('[data-config="model.name"]').forEach(el => el.textContent = cfg.model.name);
      document.querySelectorAll('[data-config="model.handle"]').forEach(el => el.textContent = cfg.model.handle);
      document.querySelectorAll('[data-config="model.bio"]').forEach(el => el.textContent = cfg.model.bio);
    }

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

    // Atualizar elementos da página com planos
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
    
    // Em caso de erro total, aplicar configurações mínimas
    window.SYNCPAY_CONFIG = window.SYNCPAY_CONFIG || {};
    window.SYNCPAY_CONFIG.plans = {
      monthly: {
        buttonId: 'btn-1-mes',
        label: '1 mês',
        priceLabel: 'R$ 19,90',
        price: 19.98,
        amount: 19.98,
        description: 'Assinatura mensal'
      }
    };
    window.SYNCPAY_CONFIG.planos = [];
    window.SYNCPAY_CONFIG.downsells = [];
    console.log('🔧 [CONFIG] Configurações mínimas aplicadas devido ao erro');
  }
})();