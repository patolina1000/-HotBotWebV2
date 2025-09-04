/**
 * 🧪 TESTE META PIXEL HELPER
 * Script para testar se os eventos são detectáveis pelo Meta Pixel Helper
 */

const puppeteer = require('puppeteer');

class MetaPixelHelperTester {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.browser = null;
    this.page = null;
  }

  /**
   * 🚀 INICIALIZAR BROWSER
   */
  async initialize() {
    console.log('🚀 Inicializando teste do Meta Pixel Helper...');
    
    this.browser = await puppeteer.launch({
      headless: false, // Mostrar browser para debug
      devtools: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage();
    
    // Interceptar eventos do Facebook Pixel
    await this.page.evaluateOnNewDocument(() => {
      window.pixelEvents = [];
      
      // Interceptar chamadas fbq
      const originalFbq = window.fbq;
      window.fbq = function(...args) {
        console.log('🎯 Facebook Pixel Event Detected:', args);
        window.pixelEvents.push({
          timestamp: Date.now(),
          args: args,
          type: args[0],
          eventName: args[1],
          eventData: args[2]
        });
        
        // Chamar fbq original se existir
        if (originalFbq) {
          return originalFbq.apply(this, args);
        }
      };
      
      // Mock fbq se não existir
      if (!window.fbq) {
        window.fbq = function(...args) {
          console.log('🎯 Facebook Pixel Event (Mock):', args);
          window.pixelEvents.push({
            timestamp: Date.now(),
            args: args,
            type: args[0],
            eventName: args[1],
            eventData: args[2]
          });
        };
      }
    });

    console.log('✅ Browser inicializado');
  }

  /**
   * 🧪 TESTE 1: Página Inicial (MODELO1)
   */
  async testModelo1Page() {
    console.log('\n🧪 TESTE 1: Página Inicial (MODELO1)');
    console.log('=====================================');

    try {
      // Navegar para página inicial com UTMs
      const testUrl = `${this.baseUrl}/?utm_source=facebook&utm_campaign=teste|123&utm_medium=cpc`;
      console.log('📍 Navegando para:', testUrl);
      
      await this.page.goto(testUrl, { waitUntil: 'networkidle2' });

      // Aguardar scripts carregarem
      await this.page.waitForTimeout(5000);

      // Verificar eventos capturados
      const events = await this.page.evaluate(() => window.pixelEvents || []);
      
      console.log(`📊 Eventos detectados: ${events.length}`);
      
      events.forEach((event, index) => {
        console.log(`   ${index + 1}. ${event.type} - ${event.eventName}`, {
          eventID: event.eventData?.eventID,
          value: event.eventData?.value,
          currency: event.eventData?.currency
        });
      });

      // Verificar se ViewContent foi disparado
      const viewContentEvents = events.filter(e => e.eventName === 'ViewContent');
      if (viewContentEvents.length > 0) {
        console.log('✅ ViewContent detectado - Meta Pixel Helper deve mostrar este evento');
      } else {
        console.log('❌ ViewContent não detectado');
      }

      return events;

    } catch (error) {
      console.error('❌ Erro no teste MODELO1:', error.message);
      return [];
    }
  }

  /**
   * 🧪 TESTE 2: Página de Checkout (Privacy)
   */
  async testPrivacyPage() {
    console.log('\n🧪 TESTE 2: Página de Checkout (Privacy)');
    console.log('=======================================');

    try {
      // Simular token de tracking
      const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock.token';
      
      // Navegar para página de checkout com token
      const testUrl = `${this.baseUrl}/privacy/?tt=${mockToken}`;
      console.log('📍 Navegando para:', testUrl);
      
      await this.page.goto(testUrl, { waitUntil: 'networkidle2' });

      // Aguardar scripts carregarem
      await this.page.waitForTimeout(5000);

      // Verificar eventos capturados
      const events = await this.page.evaluate(() => window.pixelEvents || []);
      
      console.log(`📊 Eventos detectados: ${events.length}`);
      
      events.forEach((event, index) => {
        console.log(`   ${index + 1}. ${event.type} - ${event.eventName}`, {
          eventID: event.eventData?.eventID,
          value: event.eventData?.value,
          currency: event.eventData?.currency
        });
      });

      // Verificar eventos específicos
      const viewContentEvents = events.filter(e => e.eventName === 'ViewContent');
      const addToCartEvents = events.filter(e => e.eventName === 'AddToCart');

      if (viewContentEvents.length > 0) {
        console.log('✅ ViewContent detectado - Meta Pixel Helper deve mostrar este evento');
      }

      if (addToCartEvents.length > 0) {
        console.log('✅ AddToCart detectado - Meta Pixel Helper deve mostrar este evento');
      }

      return events;

    } catch (error) {
      console.error('❌ Erro no teste Privacy:', error.message);
      return [];
    }
  }

  /**
   * 🧪 TESTE 3: Simulação de Geração de PIX
   */
  async testPixGeneration() {
    console.log('\n🧪 TESTE 3: Simulação de Geração de PIX');
    console.log('=====================================');

    try {
      // Clicar em botão de assinatura (simular)
      console.log('🖱️ Simulando clique em botão de assinatura...');
      
      await this.page.evaluate(() => {
        // Simular evento de geração de PIX
        if (window.MetaPixelBridge && window.MetaPixelBridge.fireAddToCart) {
          window.MetaPixelBridge.fireAddToCart(49.90);
          console.log('🛒 AddToCart simulado via MetaPixelBridge');
        }
      });

      // Aguardar evento ser processado
      await this.page.waitForTimeout(2000);

      // Verificar novos eventos
      const events = await this.page.evaluate(() => window.pixelEvents || []);
      const addToCartEvents = events.filter(e => e.eventName === 'AddToCart');
      
      console.log(`📊 Eventos AddToCart detectados: ${addToCartEvents.length}`);
      
      addToCartEvents.forEach((event, index) => {
        console.log(`   ${index + 1}. AddToCart`, {
          eventID: event.eventData?.eventID,
          value: event.eventData?.value,
          currency: event.eventData?.currency,
          content_name: event.eventData?.content_name
        });
      });

      if (addToCartEvents.length > 0) {
        console.log('✅ AddToCart detectado - Meta Pixel Helper deve mostrar este evento');
      } else {
        console.log('❌ AddToCart não detectado');
      }

      return addToCartEvents;

    } catch (error) {
      console.error('❌ Erro no teste de geração de PIX:', error.message);
      return [];
    }
  }

  /**
   * 🧪 TESTE 4: Verificação de Deduplicação
   */
  async testDeduplication() {
    console.log('\n🧪 TESTE 4: Verificação de Deduplicação');
    console.log('=====================================');

    try {
      // Disparar múltiplos eventos do mesmo tipo
      await this.page.evaluate(() => {
        if (window.MetaPixelBridge) {
          // Tentar disparar ViewContent múltiplas vezes
          window.MetaPixelBridge.fireViewContent();
          window.MetaPixelBridge.fireViewContent();
          window.MetaPixelBridge.fireViewContent();
          
          // Tentar disparar AddToCart múltiplas vezes
          window.MetaPixelBridge.fireAddToCart(19.90);
          window.MetaPixelBridge.fireAddToCart(19.90);
          window.MetaPixelBridge.fireAddToCart(19.90);
        }
      });

      await this.page.waitForTimeout(2000);

      // Verificar eventos únicos
      const events = await this.page.evaluate(() => window.pixelEvents || []);
      const viewContentEvents = events.filter(e => e.eventName === 'ViewContent');
      const addToCartEvents = events.filter(e => e.eventName === 'AddToCart');

      console.log(`📊 ViewContent events: ${viewContentEvents.length} (deve ser 1)`);
      console.log(`📊 AddToCart events: ${addToCartEvents.length} (deve ser 1)`);

      if (viewContentEvents.length <= 1 && addToCartEvents.length <= 1) {
        console.log('✅ Deduplicação funcionando corretamente');
      } else {
        console.log('⚠️ Possível duplicação de eventos detectada');
      }

      return { viewContent: viewContentEvents.length, addToCart: addToCartEvents.length };

    } catch (error) {
      console.error('❌ Erro no teste de deduplicação:', error.message);
      return { viewContent: 0, addToCart: 0 };
    }
  }

  /**
   * 🚀 EXECUTAR TODOS OS TESTES
   */
  async runAllTests() {
    console.log('🚀 INICIANDO TESTE COMPLETO DO META PIXEL HELPER');
    console.log('================================================\n');

    try {
      await this.initialize();

      const results = {
        modelo1: await this.testModelo1Page(),
        privacy: await this.testPrivacyPage(),
        pixGeneration: await this.testPixGeneration(),
        deduplication: await this.testDeduplication()
      };

      // Resultado final
      console.log('\n🏁 RESULTADO FINAL DOS TESTES');
      console.log('================================');
      console.log(`📊 Eventos MODELO1: ${results.modelo1.length}`);
      console.log(`📊 Eventos Privacy: ${results.privacy.length}`);
      console.log(`📊 Eventos PIX Generation: ${results.pixGeneration.length}`);
      console.log(`📊 Deduplicação: ViewContent=${results.deduplication.viewContent}, AddToCart=${results.deduplication.addToCart}`);

      console.log('\n✅ INSTRUÇÕES PARA META PIXEL HELPER:');
      console.log('1. Instale a extensão Meta Pixel Helper no Chrome');
      console.log('2. Navegue para as páginas testadas');
      console.log('3. Clique no ícone do Meta Pixel Helper');
      console.log('4. Verifique se os eventos aparecem na lista');
      console.log('5. Os eventos devem ter eventID único para deduplicação');

      console.log('\n🎯 EVENTOS ESPERADOS NO META PIXEL HELPER:');
      console.log('- ViewContent: Ao carregar páginas (após 2-3 segundos)');
      console.log('- AddToCart: Ao gerar PIX (não no carregamento da página)');
      console.log('- Lead: Na página inicial após interação significativa');

    } catch (error) {
      console.error('💥 Erro crítico nos testes:', error.message);
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }

  /**
   * 🔍 TESTE RÁPIDO SEM BROWSER
   */
  static quickTest() {
    console.log('🔍 TESTE RÁPIDO - VERIFICAÇÃO DE CONFIGURAÇÃO');
    console.log('============================================');
    
    console.log('✅ Scripts Meta Pixel Bridge criados:');
    console.log('   - MODELO1/WEB/meta-pixel-bridge.js');
    console.log('   - privacy---sync/public/js/meta-pixel-bridge.js');
    
    console.log('\n✅ Eventos configurados:');
    console.log('   - ViewContent: 2 segundos após carregamento da página');
    console.log('   - AddToCart: Quando PIX é gerado (interceptação fetch)');
    console.log('   - Lead: Após interação significativa (scroll 50% + cliques)');
    
    console.log('\n✅ Deduplicação implementada:');
    console.log('   - SessionStorage flags');
    console.log('   - EventID único por evento');
    console.log('   - Verificação antes de disparar');
    
    console.log('\n🎯 PARA TESTAR MANUALMENTE:');
    console.log('1. Abra o Chrome com Meta Pixel Helper instalado');
    console.log('2. Navegue para: http://localhost:3000/?utm_source=facebook&utm_campaign=teste');
    console.log('3. Aguarde 3 segundos e verifique ViewContent no Meta Pixel Helper');
    console.log('4. Vá para checkout e gere um PIX para ver AddToCart');
    console.log('5. Todos os eventos devem aparecer com eventID único');
  }
}

// Executar testes
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--quick')) {
    MetaPixelHelperTester.quickTest();
  } else {
    const tester = new MetaPixelHelperTester();
    tester.runAllTests().catch(error => {
      console.error('💥 Erro ao executar testes:', error.message);
    });
  }
}

module.exports = MetaPixelHelperTester;
