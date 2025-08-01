/**
 * teste-utm-processing.js - Teste do processamento de UTMs e fbclid
 * 
 * Este script testa a função processUTM e a extração de fbclid
 */

// Função processUTM copiada do server.js
function processUTM(utmValue) {
  if (!utmValue) return { name: null, id: null };
  
  try {
    const decoded = decodeURIComponent(utmValue);
    const parts = decoded.split('|');
    
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const id = parts[1].trim();
      
      // Validar se o ID é numérico
      if (name && id && /^\d+$/.test(id)) {
        console.log(`✅ UTM processado: "${utmValue}" → nome: "${name}", id: "${id}"`);
        return { name, id };
      }
    }
    
    // Se não tem formato nome|id, retorna apenas o nome
    console.log(`ℹ️ UTM sem formato nome|id: "${utmValue}"`);
    return { name: decoded, id: null };
    
  } catch (error) {
    console.error(`❌ Erro ao processar UTM "${utmValue}":`, error.message);
    return { name: utmValue, id: null };
  }
}

// Função para extrair fbclid do _fbc
function extractFbclid(fbc) {
  if (!fbc) return null;
  
  const fbcMatch = fbc.match(/^fb\.1\.\d+\.(.+)$/);
  if (fbcMatch) {
    const fbclid = fbcMatch[1];
    console.log(`✅ fbclid extraído do _fbc: ${fbclid}`);
    return fbclid;
  }
  
  console.log(`ℹ️ _fbc sem formato válido: ${fbc}`);
  return null;
}

// Testes
console.log('🧪 TESTE: Processamento de UTMs e fbclid');
console.log('=' .repeat(50));

// Teste 1: UTMs com formato nome|id
console.log('\n📋 TESTE 1: UTMs com formato nome|id');
const testUTMs = [
  'Conjunto_Teste%7C987654321',
  'Campanha_Teste%7C123456789',
  'Anuncio_Teste%7C555666777',
  'Termo_Teste%7C111222333'
];

testUTMs.forEach(utm => {
  const result = processUTM(utm);
  console.log(`Input: "${utm}"`);
  console.log(`Output:`, result);
  console.log('---');
});

// Teste 2: UTMs sem formato nome|id
console.log('\n📋 TESTE 2: UTMs sem formato nome|id');
const testUTMsSimple = [
  'instagram',
  'bio',
  'bio-instagram',
  'facebook',
  'ads'
];

testUTMsSimple.forEach(utm => {
  const result = processUTM(utm);
  console.log(`Input: "${utm}"`);
  console.log(`Output:`, result);
  console.log('---');
});

// Teste 3: Extração de fbclid
console.log('\n📋 TESTE 3: Extração de fbclid');
const testFbc = [
  'fb.1.1703149930.IwABC123456789',
  'fb.1.1703149930.abc123def456',
  'fb.1.1703149930.invalid_format',
  'invalid_fbc_format'
];

testFbc.forEach(fbc => {
  const fbclid = extractFbclid(fbc);
  console.log(`Input: "${fbc}"`);
  console.log(`Output: "${fbclid}"`);
  console.log('---');
});

// Teste 4: Simulação de payload completo
console.log('\n📋 TESTE 4: Simulação de payload completo');
const mockToken = {
  utm_source: 'Conjunto_Teste%7C987654321',
  utm_medium: 'Campanha_Teste%7C123456789',
  utm_campaign: 'Anuncio_Teste%7C555666777',
  utm_content: 'Termo_Teste%7C111222333',
  utm_term: 'palavra_chave',
  fbc: 'fb.1.1703149930.IwABC123456789'
};

const utmSource = processUTM(mockToken.utm_source);
const utmMedium = processUTM(mockToken.utm_medium);
const utmCampaign = processUTM(mockToken.utm_campaign);
const utmContent = processUTM(mockToken.utm_content);
const utmTerm = processUTM(mockToken.utm_term);
const fbclid = extractFbclid(mockToken.fbc);

const customData = {
  utm_source: utmSource.name,
  utm_source_id: utmSource.id,
  utm_medium: utmMedium.name,
  utm_medium_id: utmMedium.id,
  utm_campaign: utmCampaign.name,
  utm_campaign_id: utmCampaign.id,
  utm_content: utmContent.name,
  utm_content_id: utmContent.id,
  utm_term: utmTerm.name,
  utm_term_id: utmTerm.id,
  fbclid: fbclid
};

console.log('📊 Payload custom_data simulado:');
console.log(JSON.stringify(customData, null, 2));

console.log('\n✅ Testes concluídos!'); 