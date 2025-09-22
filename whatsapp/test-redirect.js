// Teste simples para verificar se o JavaScript está funcionando
console.log('🧪 [TEST] Script de teste carregado!');
console.log('🧪 [TEST] Timestamp:', new Date().toISOString());
console.log('🧪 [TEST] User Agent:', navigator.userAgent);
console.log('🧪 [TEST] URL atual:', window.location.href);
console.log('🧪 [TEST] DOM pronto:', document.readyState);

// Teste de função simples
function testFunction() {
    console.log('🧪 [TEST] Função de teste executada!');
    return 'teste ok';
}

// Executar teste imediatamente
testFunction();

// Teste com setTimeout
setTimeout(() => {
    console.log('🧪 [TEST] setTimeout executado após 1 segundo');
}, 1000);

// Teste de localStorage
try {
    localStorage.setItem('test', 'ok');
    console.log('🧪 [TEST] localStorage funcionando:', localStorage.getItem('test'));
} catch (error) {
    console.error('🧪 [TEST] Erro no localStorage:', error);
}

console.log('🧪 [TEST] Script de teste concluído!');
