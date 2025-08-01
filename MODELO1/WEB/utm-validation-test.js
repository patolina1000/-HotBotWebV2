/**
 * Script de Validação UTM
 * Testa especificamente a decodificação de caracteres especiais
 * e a validação do formato nome|id
 */
(function() {
    'use strict';
    
    const DEBUG_MODE = true;
    
    function log(message, data = null) {
        if (DEBUG_MODE) {
            console.log(`[UTM-VALIDATION] ${message}`, data || '');
        }
    }
    
    // Teste de decodificação
    function testDecoding() {
        log('=== TESTE DE DECODIFICAÇÃO ===');
        
        const testCases = [
            // Pipe codificado
            { input: 'Teste%7C1234', expected: 'Teste|1234', description: 'Pipe codificado (%7C)' },
            { input: 'Campanha%7C5678', expected: 'Campanha|5678', description: 'Campanha com pipe codificado' },
            
            // Pipe normal
            { input: 'Teste|1234', expected: 'Teste|1234', description: 'Pipe normal' },
            { input: 'Campanha|5678', expected: 'Campanha|5678', description: 'Campanha com pipe normal' },
            
            // Outros caracteres especiais
            { input: 'Campanha%20Teste%7C1234', expected: 'Campanha Teste|1234', description: 'Espaço + pipe codificado' },
            { input: 'Conjunto%26Teste%7C5678', expected: 'Conjunto&Teste|5678', description: 'Ampersand + pipe codificado' },
            
            // Casos edge
            { input: '', expected: null, description: 'String vazia' },
            { input: null, expected: null, description: 'Null' },
            { input: undefined, expected: null, description: 'Undefined' },
            { input: 'SemPipe', expected: 'SemPipe', description: 'Sem pipe' }
        ];
        
        let passed = 0;
        let failed = 0;
        
        testCases.forEach((testCase, index) => {
            try {
                const result = decodeURIComponent(testCase.input || '');
                const success = result === testCase.expected;
                
                if (success) {
                    log(`✅ Teste ${index + 1} PASSOU: ${testCase.description}`);
                    log(`   Input: "${testCase.input}" → Output: "${result}"`);
                    passed++;
                } else {
                    log(`❌ Teste ${index + 1} FALHOU: ${testCase.description}`);
                    log(`   Input: "${testCase.input}" → Output: "${result}" (esperado: "${testCase.expected}")`);
                    failed++;
                }
            } catch (error) {
                log(`❌ Teste ${index + 1} ERRO: ${testCase.description}`);
                log(`   Input: "${testCase.input}" → Erro: ${error.message}`);
                failed++;
            }
        });
        
        log(`=== RESULTADO DECODIFICAÇÃO: ${passed} passaram, ${failed} falharam ===`);
        return { passed, failed, total: testCases.length };
    }
    
    // Teste de parsing nome|id
    function testParsing() {
        log('=== TESTE DE PARSING NOME|ID ===');
        
        const testCases = [
            // Casos válidos
            { input: 'Campanha|123456789', expected: { name: 'Campanha', id: '123456789', isValid: true }, description: 'Formato válido' },
            { input: 'Conjunto_Teste|987654321', expected: { name: 'Conjunto_Teste', id: '987654321', isValid: true }, description: 'Nome com underscore' },
            { input: 'Anuncio Teste|456789123', expected: { name: 'Anuncio Teste', id: '456789123', isValid: true }, description: 'Nome com espaço' },
            
            // Casos inválidos
            { input: 'SemPipe', expected: { name: 'SemPipe', id: null, isValid: false }, description: 'Sem pipe' },
            { input: 'Campanha|', expected: { name: 'Campanha', id: '', isValid: false }, description: 'Pipe sem ID' },
            { input: '|123456', expected: { name: '', id: '123456', isValid: false }, description: 'Pipe sem nome' },
            { input: 'Campanha|abc123', expected: { name: 'Campanha', id: 'abc123', isValid: false }, description: 'ID não numérico' },
            { input: 'Campanha|123|456', expected: { name: 'Campanha', id: '123', isValid: false }, description: 'Múltiplos pipes' },
            
            // Casos edge
            { input: '', expected: { name: '', id: null, isValid: false }, description: 'String vazia' },
            { input: null, expected: { name: null, id: null, isValid: false }, description: 'Null' }
        ];
        
        let passed = 0;
        let failed = 0;
        
        testCases.forEach((testCase, index) => {
            try {
                const result = parseUTMValue(testCase.input);
                const success = JSON.stringify(result) === JSON.stringify(testCase.expected);
                
                if (success) {
                    log(`✅ Teste ${index + 1} PASSOU: ${testCase.description}`);
                    log(`   Input: "${testCase.input}" → Output:`, result);
                    passed++;
                } else {
                    log(`❌ Teste ${index + 1} FALHOU: ${testCase.description}`);
                    log(`   Input: "${testCase.input}" → Output:`, result);
                    log(`   Esperado:`, testCase.expected);
                    failed++;
                }
            } catch (error) {
                log(`❌ Teste ${index + 1} ERRO: ${testCase.description}`);
                log(`   Input: "${testCase.input}" → Erro: ${error.message}`);
                failed++;
            }
        });
        
        log(`=== RESULTADO PARSING: ${passed} passaram, ${failed} falharam ===`);
        return { passed, failed, total: testCases.length };
    }
    
    // Função de parsing (mesma do script principal)
    function parseUTMValue(value) {
        if (!value || typeof value !== 'string') return null;
        
        const parts = value.split('|');
        if (parts.length === 2) {
            const [name, id] = parts;
            const isValid = name && id && /^\d+$/.test(id.trim());
            
            return {
                original: value,
                name: name.trim(),
                id: id.trim(),
                isValid: isValid
            };
        } else {
            return {
                original: value,
                name: value,
                id: null,
                isValid: false
            };
        }
    }
    
    // Teste de URL real
    function testRealURL() {
        log('=== TESTE DE URL REAL ===');
        
        const currentUrl = window.location.href;
        const searchParams = window.location.search;
        
        log(`URL Atual: ${currentUrl}`);
        log(`Query Params: ${searchParams}`);
        
        if (searchParams) {
            const params = new URLSearchParams(searchParams);
            const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
            
            utmKeys.forEach(key => {
                const rawValue = params.get(key);
                if (rawValue) {
                    log(`UTM ${key}:`);
                    log(`  Raw: "${rawValue}"`);
                    
                    try {
                        const decoded = decodeURIComponent(rawValue);
                        log(`  Decoded: "${decoded}"`);
                        
                        const parsed = parseUTMValue(decoded);
                        log(`  Parsed:`, parsed);
                        
                        if (parsed && parsed.isValid) {
                            log(`  ✅ VÁLIDO: ${parsed.name} (ID: ${parsed.id})`);
                        } else {
                            log(`  ⚠️ INVÁLIDO: não segue formato nome|id`);
                        }
                    } catch (error) {
                        log(`  ❌ ERRO na decodificação: ${error.message}`);
                    }
                }
            });
        } else {
            log('Nenhum parâmetro UTM encontrado na URL atual');
        }
    }
    
    // Teste de localStorage
    function testLocalStorage() {
        log('=== TESTE DE LOCALSTORAGE ===');
        
        const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
        
        utmKeys.forEach(key => {
            const value = localStorage.getItem(key);
            if (value) {
                log(`UTM salvo ${key}: "${value}"`);
                
                try {
                    const parsed = parseUTMValue(value);
                    log(`  Parsed:`, parsed);
                } catch (error) {
                    log(`  ❌ Erro ao fazer parse: ${error.message}`);
                }
            } else {
                log(`UTM ${key}: não encontrado no localStorage`);
            }
        });
    }
    
    // Executar todos os testes
    function runAllTests() {
        log('🧪 INICIANDO TESTES DE VALIDAÇÃO UTM');
        
        const decodingResult = testDecoding();
        const parsingResult = testParsing();
        testRealURL();
        testLocalStorage();
        
        const totalPassed = decodingResult.passed + parsingResult.passed;
        const totalFailed = decodingResult.failed + parsingResult.failed;
        const totalTests = decodingResult.total + parsingResult.total;
        
        log(`=== RESULTADO FINAL: ${totalPassed} passaram, ${totalFailed} falharam de ${totalTests} testes ===`);
        
        if (totalFailed === 0) {
            log('🎉 TODOS OS TESTES PASSARAM!');
        } else {
            log('⚠️ ALGUNS TESTES FALHARAM. Verifique os logs acima.');
        }
    }
    
    // Executar quando DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runAllTests);
    } else {
        runAllTests();
    }
    
    // Expor função globalmente
    window.UTMValidation = {
        testDecoding,
        testParsing,
        testRealURL,
        testLocalStorage,
        runAllTests
    };
    
})(); 