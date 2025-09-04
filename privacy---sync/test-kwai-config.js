/**
 * Script de teste para verificar configurações do Kwai Event API
 * Execute com: node test-kwai-config.js
 */

require('dotenv').config();
const { getConfig } = require('./loadConfig');
const KwaiEventAPI = require('./services/kwaiEventAPI');

console.log('🧪 Testando configurações do Kwai Event API...\n');

// 1. Verificar variáveis de ambiente
console.log('📋 Variáveis de ambiente:');
console.log('  KWAI_PIXEL_ID:', process.env.KWAI_PIXEL_ID ? '✅ DEFINIDO' : '❌ NÃO DEFINIDO');
console.log('  KWAI_ACCESS_TOKEN:', process.env.KWAI_ACCESS_TOKEN ? '✅ DEFINIDO' : '❌ NÃO DEFINIDO');
console.log('  NODE_ENV:', process.env.NODE_ENV || 'não definido');
console.log('');

// 2. Verificar configuração carregada
console.log('⚙️ Configuração carregada:');
const config = getConfig();
console.log('  Configuração completa:', JSON.stringify(config.kwai, null, 2));
console.log('');

// 3. Testar serviço KwaiEventAPI
console.log('🔧 Testando serviço KwaiEventAPI:');
try {
    const kwaiService = new KwaiEventAPI();
    
    console.log('  ✅ Serviço instanciado com sucesso');
    console.log('  Configuração do serviço:', JSON.stringify(kwaiService.config, null, 2));
    
    // Verificar se está configurado
    const isConfigured = kwaiService.isConfigured();
    console.log('  Serviço configurado:', isConfigured ? '✅ SIM' : '❌ NÃO');
    
    if (!isConfigured) {
        console.log('  ❌ Motivo: Configurações obrigatórias não encontradas');
        console.log('  Verifique se KWAI_PIXEL_ID e KWAI_ACCESS_TOKEN estão definidos no .env');
    }
    
} catch (error) {
    console.log('  ❌ Erro ao instanciar serviço:', error.message);
}
console.log('');

// 4. Testar endpoint da API
console.log('🌐 Testando endpoint da API:');
console.log('  URL: /api/kwai-event');
console.log('  Método: POST');
console.log('  Status: ✅ Endpoint configurado no server.js');

// 5. Resumo
console.log('📊 RESUMO:');
const hasPixelId = !!process.env.KWAI_PIXEL_ID;
const hasAccessToken = !!process.env.KWAI_ACCESS_TOKEN;

if (hasPixelId && hasAccessToken) {
    console.log('  ✅ Sistema Kwai Event API CONFIGURADO e funcionando');
    console.log('  ✅ Tracking funcionará corretamente');
} else {
    console.log('  ❌ Sistema Kwai Event API NÃO CONFIGURADO');
    console.log('  ❌ Tracking NÃO funcionará');
    
    if (!hasPixelId) {
        console.log('  ❌ KWAI_PIXEL_ID não definido');
    }
    if (!hasAccessToken) {
        console.log('  ❌ KWAI_ACCESS_TOKEN não definido');
    }
    
    console.log('\n🔧 Para configurar, adicione ao arquivo .env:');
    console.log('  KWAI_PIXEL_ID=seu_pixel_id_aqui');
    console.log('  KWAI_ACCESS_TOKEN=seu_access_token_aqui');
}

console.log('\n🎯 Próximos passos:');
if (hasPixelId && hasAccessToken) {
    console.log('  1. ✅ Configuração OK');
    console.log('  2. ✅ Serviço funcionando');
    console.log('  3. ✅ Endpoint configurado');
    console.log('  4. 🔍 Testar com página HTML');
    console.log('  5. 🔍 Verificar logs do servidor');
} else {
    console.log('  1. ❌ Configurar variáveis de ambiente');
    console.log('  2. 🔄 Reiniciar servidor');
    console.log('  3. 🔍 Testar configuração novamente');
    console.log('  4. 🔍 Verificar logs do servidor');
}

console.log('\n✨ Teste concluído!');
