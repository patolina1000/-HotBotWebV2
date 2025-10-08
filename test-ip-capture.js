#!/usr/bin/env node

/**
 * Script de Teste: Validação da Captura de IPs Públicos
 * 
 * Este script testa a função isPrivateIP() para garantir que está
 * filtrando corretamente IPs privados e aceitando IPs públicos.
 * 
 * Uso: node test-ip-capture.js
 */

/**
 * Verifica se um IP é privado (RFC 1918, loopback, etc.)
 */
function isPrivateIP(ip) {
  if (!ip || typeof ip !== 'string') {
    return true;
  }

  const cleanIp = ip.replace(/^::ffff:/, '');
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  
  if (!ipv4Pattern.test(cleanIp)) {
    if (cleanIp === '::1' || cleanIp === 'localhost') {
      return true;
    }
    // Para IPv6 público válido, aceitar como público
    // Para IPs malformados ou inválidos, rejeitar como privado
    const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    if (ipv6Pattern.test(cleanIp)) {
      return false;
    }
    return true;
  }

  const parts = cleanIp.split('.').map(Number);
  if (parts.some(part => part < 0 || part > 255 || isNaN(part))) {
    return true;
  }

  const [a, b] = parts;

  // RFC 1918 ranges + loopback + link-local
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (cleanIp === '0.0.0.0' || cleanIp === 'localhost') return true;

  return false;
}

// Casos de teste
const testCases = [
  // IPs Privados (devem retornar true)
  { ip: '10.0.0.1', expected: true, description: 'RFC 1918 - 10.x.x.x' },
  { ip: '10.229.77.1', expected: true, description: 'RFC 1918 - 10.229.77.1 (problema original)' },
  { ip: '172.16.0.1', expected: true, description: 'RFC 1918 - 172.16.x.x' },
  { ip: '172.31.255.254', expected: true, description: 'RFC 1918 - 172.31.x.x' },
  { ip: '192.168.0.1', expected: true, description: 'RFC 1918 - 192.168.x.x' },
  { ip: '192.168.1.100', expected: true, description: 'RFC 1918 - 192.168.1.100' },
  { ip: '127.0.0.1', expected: true, description: 'Loopback' },
  { ip: '169.254.1.1', expected: true, description: 'Link-local' },
  { ip: '0.0.0.0', expected: true, description: 'Unspecified' },
  { ip: 'localhost', expected: true, description: 'Localhost string' },
  { ip: '::1', expected: true, description: 'IPv6 loopback' },
  { ip: '::ffff:127.0.0.1', expected: true, description: 'IPv6-mapped loopback' },
  { ip: '::ffff:10.0.0.1', expected: true, description: 'IPv6-mapped private' },
  
  // IPs Públicos (devem retornar false)
  { ip: '8.8.8.8', expected: false, description: 'Google DNS (público)' },
  { ip: '1.1.1.1', expected: false, description: 'Cloudflare DNS (público)' },
  { ip: '203.0.113.45', expected: false, description: 'TEST-NET-3 (exemplo de documentação, mas formato público)' },
  { ip: '198.51.100.42', expected: false, description: 'TEST-NET-2 (exemplo de documentação, mas formato público)' },
  { ip: '151.101.1.140', expected: false, description: 'Fastly CDN (público)' },
  { ip: '104.26.10.75', expected: false, description: 'Cloudflare (público)' },
  { ip: '172.15.0.1', expected: false, description: 'Público (172.15 está fora da faixa 172.16-31)' },
  { ip: '172.32.0.1', expected: false, description: 'Público (172.32 está fora da faixa 172.16-31)' },
  { ip: '11.0.0.1', expected: false, description: 'Público (fora da faixa 10.x)' },
  { ip: '192.167.0.1', expected: false, description: 'Público (fora da faixa 192.168)' },
  
  // IPs Inválidos (devem retornar true)
  { ip: null, expected: true, description: 'null' },
  { ip: undefined, expected: true, description: 'undefined' },
  { ip: '', expected: true, description: 'String vazia' },
  { ip: '256.0.0.1', expected: true, description: 'Octeto inválido (> 255)' },
  { ip: '1.2.3', expected: true, description: 'Formato inválido (3 octetos)' },
  { ip: 'abc.def.ghi.jkl', expected: true, description: 'Formato inválido (não numérico)' },
];

// Executar testes
console.log('🧪 TESTE DE VALIDAÇÃO: Filtragem de IPs Privados\n');
console.log('═'.repeat(80));

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  const result = isPrivateIP(testCase.ip);
  const success = result === testCase.expected;
  
  if (success) {
    passed++;
    console.log(`✅ Teste ${index + 1}: ${testCase.description}`);
    console.log(`   IP: "${testCase.ip}" → ${result ? 'PRIVADO' : 'PÚBLICO'} (esperado: ${testCase.expected ? 'PRIVADO' : 'PÚBLICO'})`);
  } else {
    failed++;
    console.log(`❌ Teste ${index + 1}: ${testCase.description}`);
    console.log(`   IP: "${testCase.ip}" → ${result ? 'PRIVADO' : 'PÚBLICO'} (esperado: ${testCase.expected ? 'PRIVADO' : 'PÚBLICO'})`);
    console.log(`   ⚠️  FALHOU!`);
  }
  console.log('');
});

console.log('═'.repeat(80));
console.log(`\n📊 RESULTADO: ${passed} aprovados, ${failed} falharam (${testCases.length} total)`);

if (failed === 0) {
  console.log('\n✅ TODOS OS TESTES PASSARAM! A função isPrivateIP() está funcionando corretamente.\n');
  process.exit(0);
} else {
  console.log(`\n❌ ${failed} TESTE(S) FALHARAM! Revisar a implementação.\n`);
  process.exit(1);
}