/**
 * 🧪 SCRIPT DE DEBUG: Teste Específico de Deduplicação Facebook
 * 
 * Este script testa especificamente os problemas de deduplicação identificados
 */

const { sendFacebookEvent, generateEventId, getEnhancedDedupKey } = require('./services/facebook');

// Simular dados do log fornecido
const DADOS_TESTE = {
  token: '81c9272c-b7d2-4d2f-9fdc-a8eea481b9aa',
  valor: 9.9,
  fbp: 'fb.1.1753064579939.14232814846948583',
  fbc: 'fb.1.1753064579948.PAZXh0bgNhZW0CMTEAAaeOse3KyzGNnxM3EtlkNg0Gjosgjfx0PhdMXKnfRUDB2q5DBWCFLjCERbBZCA_aem_awVzi1fX0QFnqHcva8zQAQ',
  ip: '179.48.14.255',
  user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 Instagram 381.1.2.26.83 (iPhone12,1; iOS 18_5; pt_BR; pt; scale=2.00; 828x1792; 737297623; IABMV/1)',
  event_time_capi: 1753149458,
  event_time_pixel: Math.floor(Date.now() / 1000)
};

console.log('🧪 TESTE DE DEDUPLICAÇÃO FACEBOOK PIXEL + CAPI');
console.log('='.repeat(60));

// 1. Testar geração de event_id
console.log('\n1️⃣ TESTE: Geração de event_id');
console.log('-'.repeat(30));

const eventIdCapi = generateEventId('Purchase', DADOS_TESTE.token, DADOS_TESTE.event_time_capi);
const eventIdPixel = DADOS_TESTE.token; // Como definido no frontend

console.log(`CAPI event_id:  ${eventIdCapi}`);
console.log(`Pixel event_id: ${eventIdPixel}`);
console.log(`✅ IDs iguais: ${eventIdCapi === eventIdPixel ? 'SIM' : 'NÃO'}`);

// 2. Testar chaves de deduplicação
console.log('\n2️⃣ TESTE: Chaves de deduplicação');
console.log('-'.repeat(30));

// Simular normalização de timestamp (janelas de 30s)
const normalizedTimeCapi = Math.floor(DADOS_TESTE.event_time_capi / 30) * 30;
const normalizedTimePixel = Math.floor(DADOS_TESTE.event_time_pixel / 30) * 30;

console.log(`CAPI timestamp: ${DADOS_TESTE.event_time_capi} → normalizado: ${normalizedTimeCapi}`);
console.log(`Pixel timestamp: ${DADOS_TESTE.event_time_pixel} → normalizado: ${normalizedTimePixel}`);

const dedupKeyCapi = getEnhancedDedupKey({
  event_name: 'Purchase',
  event_time: DADOS_TESTE.event_time_capi,
  event_id: eventIdCapi,
  fbp: DADOS_TESTE.fbp,
  fbc: DADOS_TESTE.fbc
});

const dedupKeyPixel = getEnhancedDedupKey({
  event_name: 'Purchase', 
  event_time: DADOS_TESTE.event_time_pixel,
  event_id: eventIdPixel,
  fbp: DADOS_TESTE.fbp,
  fbc: DADOS_TESTE.fbc
});

console.log(`CAPI dedupKey:  ${dedupKeyCapi.substring(0, 80)}...`);
console.log(`Pixel dedupKey: ${dedupKeyPixel.substring(0, 80)}...`);
console.log(`✅ Chaves iguais: ${dedupKeyCapi === dedupKeyPixel ? 'SIM' : 'NÃO'}`);

// 3. Testar URLs
console.log('\n3️⃣ TESTE: event_source_url');
console.log('-'.repeat(30));

const urlCapi = `https://ohvips.xyz/obrigado.html?token=${DADOS_TESTE.token}&valor=${DADOS_TESTE.valor}`;
const urlPixel = `https://ohvips.xyz/obrigado.html?token=${DADOS_TESTE.token}&valor=${DADOS_TESTE.valor}&G1`; // Exemplo do log

console.log(`CAPI URL:  ${urlCapi}`);
console.log(`Pixel URL: ${urlPixel}`);
console.log(`✅ URLs iguais: ${urlCapi === urlPixel ? 'SIM' : 'NÃO'}`);

// 4. Diagnóstico final
console.log('\n4️⃣ DIAGNÓSTICO FINAL');
console.log('-'.repeat(30));

const problemasEncontrados = [];

if (eventIdCapi !== eventIdPixel) {
  problemasEncontrados.push('❌ event_id diferentes');
}

if (dedupKeyCapi !== dedupKeyPixel) {
  problemasEncontrados.push('❌ Chaves de deduplicação diferentes');
}

if (urlCapi !== urlPixel) {
  problemasEncontrados.push('⚠️ event_source_url diferentes (pode afetar deduplicação)');
}

const diffTimestamp = Math.abs(DADOS_TESTE.event_time_capi - DADOS_TESTE.event_time_pixel);
if (diffTimestamp > 300) { // 5 minutos
  problemasEncontrados.push('⚠️ Diferença de timestamp muito grande (>5min)');
}

if (problemasEncontrados.length === 0) {
  console.log('✅ DEDUPLICAÇÃO DEVE FUNCIONAR');
  console.log('   Todos os parâmetros estão consistentes');
} else {
  console.log('❌ PROBLEMAS ENCONTRADOS:');
  problemasEncontrados.forEach(problema => {
    console.log(`   ${problema}`);
  });
}

// 5. Recomendações
console.log('\n5️⃣ RECOMENDAÇÕES');
console.log('-'.repeat(30));

console.log('1. ✅ Pixel deve incluir event_source_url:');
console.log('   dados.event_source_url = window.location.href;');

console.log('2. ✅ CAPI deve usar URL completa:');
console.log('   event_source_url: `https://ohvips.xyz/obrigado.html?token=${token}&valor=${valor}`;');

console.log('3. ✅ Verificar se FB_PIXEL_ID é o mesmo:');
console.log('   - Frontend: window.fbConfig.FB_PIXEL_ID');
console.log('   - Backend: process.env.FB_PIXEL_ID');

console.log('4. ✅ Monitorar logs de deduplicação:');
console.log('   - Procurar por "🔍 DEDUP DEBUG"');
console.log('   - Procurar por "🔄 Evento duplicado detectado"');

console.log('\n🔚 Teste concluído. Execute este script após implementar as correções.');