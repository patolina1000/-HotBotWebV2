/**
 * 🔍 VALIDAÇÃO DO META PIXEL
 * 
 * Script de diagnóstico para verificar se o Meta Pixel está configurado corretamente
 * e se não há duplicações.
 * 
 * Uso: Incluir este script em qualquer página para diagnóstico
 * <script src="/js/pixelValidation.js"></script>
 */

(function() {
  'use strict';

  console.log('🔍 [PIXEL VALIDATION] Iniciando diagnóstico...');

  // Aguardar 2 segundos para garantir que tudo foi carregado
  setTimeout(function() {
    const results = {
      timestamp: new Date().toISOString(),
      checks: []
    };

    // CHECK 1: Verificar quantos scripts fbevents.js existem
    const fbeventsScripts = document.querySelectorAll('script[src*="fbevents.js"]');
    const fbeventsCount = fbeventsScripts.length;
    results.checks.push({
      name: 'Scripts fbevents.js',
      status: fbeventsCount === 1 ? 'PASS' : 'FAIL',
      value: fbeventsCount,
      expected: 1,
      details: Array.from(fbeventsScripts).map(s => s.src)
    });

    // CHECK 2: Verificar se fbq existe
    const fbqExists = typeof window.fbq === 'function';
    results.checks.push({
      name: 'fbq disponível',
      status: fbqExists ? 'PASS' : 'FAIL',
      value: fbqExists
    });

    // CHECK 3: Verificar versão do fbq
    if (fbqExists) {
      const version = window.fbq.version || 'unknown';
      results.checks.push({
        name: 'Versão do fbq',
        status: version === '2.0' ? 'PASS' : 'WARN',
        value: version,
        expected: '2.0'
      });
    }

    // CHECK 4: Verificar se __PIXEL_INIT__ está definido
    const pixelInit = window.__PIXEL_INIT__ === true;
    results.checks.push({
      name: 'window.__PIXEL_INIT__',
      status: pixelInit ? 'PASS' : 'WARN',
      value: pixelInit,
      details: 'Indica se o pixel foi inicializado pelo sistema centralizado'
    });

    // CHECK 5: Verificar FB_PIXEL_ID
    const pixelId = window.ENV?.FB_PIXEL_ID || window.__FB_PIXEL_ID__ || window.__PIXEL_CONFIG?.FB_PIXEL_ID;
    results.checks.push({
      name: 'Pixel ID configurado',
      status: pixelId ? 'PASS' : 'FAIL',
      value: pixelId ? `${pixelId.substring(0, 4)}...${pixelId.substring(pixelId.length - 4)}` : 'não encontrado'
    });

    // CHECK 6: Verificar cookies _fbp e _fbc
    const getCookie = (name) => {
      const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    };

    const fbp = getCookie('_fbp');
    const fbc = getCookie('_fbc');
    
    results.checks.push({
      name: 'Cookie _fbp',
      status: fbp ? 'PASS' : 'INFO',
      value: fbp ? 'presente' : 'ausente'
    });

    results.checks.push({
      name: 'Cookie _fbc',
      status: fbc ? 'PASS' : 'INFO',
      value: fbc ? 'presente' : 'ausente (normal se não houver fbclid)'
    });

    // CHECK 7: Verificar se ensureFacebookPixel está disponível
    const ensureFbPixelExists = typeof window.ensureFacebookPixel === 'function';
    results.checks.push({
      name: 'ensureFacebookPixel disponível',
      status: ensureFbPixelExists ? 'PASS' : 'WARN',
      value: ensureFbPixelExists
    });

    // Gerar relatório
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('🔍 RELATÓRIO DE VALIDAÇÃO DO META PIXEL');
    console.log('═══════════════════════════════════════════════');
    console.log('');

    let allPassed = true;
    results.checks.forEach(check => {
      const icon = check.status === 'PASS' ? '✅' : check.status === 'FAIL' ? '❌' : '⚠️';
      console.log(`${icon} ${check.name}: ${check.value}`);
      if (check.expected) {
        console.log(`   Esperado: ${check.expected}`);
      }
      if (check.details) {
        console.log(`   Detalhes:`, check.details);
      }
      if (check.status === 'FAIL') {
        allPassed = false;
      }
    });

    console.log('');
    console.log('═══════════════════════════════════════════════');
    
    if (allPassed && fbeventsCount === 1) {
      console.log('✅ VALIDAÇÃO COMPLETA: Pixel configurado corretamente!');
    } else {
      console.warn('⚠️ ATENÇÃO: Alguns checks falharam. Revise os detalhes acima.');
    }
    
    console.log('═══════════════════════════════════════════════');
    console.log('');

    // Disponibilizar resultados globalmente para debug
    window.__PIXEL_VALIDATION_RESULTS__ = results;
    console.log('💡 Resultados disponíveis em: window.__PIXEL_VALIDATION_RESULTS__');

  }, 2000);

})();
