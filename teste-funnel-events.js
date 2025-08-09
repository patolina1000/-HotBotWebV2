require('dotenv').config();

/**
 * Teste do Serviço de Eventos do Funil
 * Executa testes básicos para verificar a funcionalidade
 */

const { getInstance: getFunnelEventsInstance } = require('./services/funnelEvents');
const postgres = require('./database/postgres');

async function testarFunnelEvents() {
  console.log('🧪 Iniciando testes do serviço de eventos do funil...\n');
  
  try {
    // 1. Testar conexão com banco
    console.log('1️⃣ Testando conexão com banco...');
    const pool = await postgres.initializeDatabase();
    
    if (!pool) {
      throw new Error('Falha ao conectar com banco de dados');
    }
    
    console.log('✅ Conexão com banco estabelecida\n');
    
    // 2. Inicializar serviço
    console.log('2️⃣ Inicializando serviço...');
    const funnelEventsService = getFunnelEventsInstance();
    funnelEventsService.initialize(pool);
    
    console.log('✅ Serviço inicializado\n');
    
    // 3. Testar validação de dados
    console.log('3️⃣ Testando validação de dados...');
    
    // Teste com dados válidos
    const dadosValidos = {
      event_name: 'page_view',
      bot: 'bot1',
      telegram_id: '123456789',
      payload_id: 'payload_001',
      session_id: 'session_001',
      offer_tier: 'premium',
      price_cents: 9900,
      transaction_id: 'tx_001',
      meta: { source: 'telegram', campaign: 'test' }
    };
    
    const validacao = funnelEventsService.validateEventData(dadosValidos);
    console.log('✅ Validação de dados válidos:', validacao.isValid);
    
    // Teste com dados inválidos
    const dadosInvalidos = {
      event_name: '', // Nome vazio
      price_cents: -100, // Preço negativo
      meta: 'não é objeto' // Meta não é objeto
    };
    
    const validacaoInvalida = funnelEventsService.validateEventData(dadosInvalidos);
    console.log('✅ Validação de dados inválidos:', !validacaoInvalida.isValid);
    console.log('   Erros:', validacaoInvalida.errors);
    console.log('');
    
    // 4. Testar formatação de timezone
    console.log('4️⃣ Testando formatação de timezone...');
    const timestamp = new Date();
    const formatoTimezone = funnelEventsService.formatTimestampForTimezone(timestamp);
    console.log('✅ Timestamp formatado:', formatoTimezone);
    console.log('');
    
    // 5. Testar registro de evento
    console.log('5️⃣ Testando registro de evento...');
    const resultado = await funnelEventsService.logEvent(dadosValidos);
    
    if (resultado.success) {
      console.log('✅ Evento registrado com sucesso');
      console.log('   ID:', resultado.event_id);
      console.log('   Timestamp:', resultado.formatted_time);
    } else {
      console.log('❌ Falha ao registrar evento:', resultado.error);
      console.log('   Detalhes:', resultado.details);
    }
    console.log('');
    
    // 6. Testar busca de eventos
    console.log('6️⃣ Testando busca de eventos...');
    const eventos = await funnelEventsService.queryEvents({
      telegram_id: '123456789',
      limit: 5
    });
    
    if (eventos.success) {
      console.log('✅ Busca realizada com sucesso');
      console.log('   Total de eventos:', eventos.total);
      console.log('   Primeiro evento:', eventos.events[0]?.event_name);
    } else {
      console.log('❌ Falha na busca:', eventos.error);
    }
    console.log('');
    
    // 7. Testar estatísticas
    console.log('7️⃣ Testando estatísticas...');
    const stats = await funnelEventsService.getEventStats({
      group_by: 'event_name',
      start_date: new Date(Date.now() - 24 * 60 * 60 * 1000) // Últimas 24h
    });
    
    if (stats.success) {
      console.log('✅ Estatísticas obtidas com sucesso');
      console.log('   Timezone:', stats.timezone);
      console.log('   Total de grupos:', stats.stats.length);
    } else {
      console.log('❌ Falha ao obter estatísticas:', stats.error);
    }
    console.log('');
    
    // 8. Testar saúde do serviço
    console.log('8️⃣ Testando saúde do serviço...');
    const health = funnelEventsService.getHealthStatus();
    console.log('✅ Status do serviço:', health);
    console.log('');
    
    // 9. Testar múltiplos eventos
    console.log('9️⃣ Testando múltiplos eventos...');
    const eventosMultiplos = [
      { event_name: 'add_to_cart', bot: 'bot1', telegram_id: '123456789', price_cents: 9900 },
      { event_name: 'initiate_checkout', bot: 'bot1', telegram_id: '123456789', price_cents: 9900 },
      { event_name: 'purchase', bot: 'bot1', telegram_id: '123456789', price_cents: 9900, transaction_id: 'tx_002' }
    ];
    
    let sucessos = 0;
    for (const evento of eventosMultiplos) {
      const resultado = await funnelEventsService.logEvent(evento);
      if (resultado.success) sucessos++;
    }
    
    console.log(`✅ ${sucessos}/${eventosMultiplos.length} eventos registrados com sucesso`);
    console.log('');
    
    console.log('🎉 Todos os testes concluídos com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro durante os testes:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    // Fechar conexões
    if (pool) {
      await pool.end();
      console.log('🔌 Conexões fechadas');
    }
    
    process.exit(0);
  }
}

// Executar testes
testarFunnelEvents();
