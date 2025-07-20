// Test Dashboard Endpoint
require('dotenv').config();
const http = require('http');

async function testDashboardEndpoint() {
    console.log('🧪 TESTANDO ENDPOINT DO DASHBOARD\n');
    
    const port = process.env.PORT || 3000;
    const token = process.env.PANEL_ACCESS_TOKEN || 'admin123';
    const host = 'localhost';
    
    console.log('📋 Configurações:');
    console.log(`   Host: ${host}`);
    console.log(`   Port: ${port}`);
    console.log(`   Token: ${token}`);
    
    // Test 1: Sem token
    console.log('\n🔍 Teste 1: Requisição sem token');
    try {
        await testRequest(host, port, '');
    } catch (error) {
        console.log(`   ✅ Esperado: ${error.message}`);
    }
    
    // Test 2: Com token inválido
    console.log('\n🔍 Teste 2: Requisição com token inválido');
    try {
        await testRequest(host, port, 'token_invalido');
    } catch (error) {
        console.log(`   ✅ Esperado: ${error.message}`);
    }
    
    // Test 3: Com token válido
    console.log('\n🔍 Teste 3: Requisição com token válido');
    try {
        const data = await testRequest(host, port, token);
        console.log('   ✅ Sucesso! Dados recebidos:');
        console.log('   📊 Estrutura da resposta:');
        console.log(`      - Faturamento Diário: ${data.faturamentoDiario?.length || 0} registros`);
        console.log(`      - UTM Source: ${data.utmSource?.length || 0} registros`);
        console.log(`      - Campanhas: ${data.campanhas?.length || 0} registros`);
        
        if (data.faturamentoDiario?.[0]) {
            console.log('   📈 Exemplo de faturamento:', JSON.stringify(data.faturamentoDiario[0], null, 2));
        }
    } catch (error) {
        console.log(`   ❌ Erro: ${error.message}`);
    }
    
    // Test 4: Com parâmetros de data
    console.log('\n🔍 Teste 4: Requisição com filtro de data');
    try {
        const data = await testRequest(host, port, token, '2024-01-01', '2024-12-31');
        console.log('   ✅ Sucesso com filtro de data!');
        console.log(`      - Registros encontrados: ${data.faturamentoDiario?.length || 0}`);
    } catch (error) {
        console.log(`   ❌ Erro: ${error.message}`);
    }
    
    console.log('\n✅ TESTES CONCLUÍDOS!');
}

function testRequest(host, port, token, inicio = null, fim = null) {
    return new Promise((resolve, reject) => {
        let path = `/api/dashboard-data?token=${encodeURIComponent(token)}`;
        
        if (inicio && fim) {
            path += `&inicio=${inicio}&fim=${fim}`;
        }
        
        const options = {
            hostname: host,
            port: port,
            path: path,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(jsonData);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${jsonData.error || 'Erro desconhecido'}`));
                    }
                } catch (error) {
                    reject(new Error(`Erro ao parsear resposta: ${data}`));
                }
            });
        });
        
        req.on('error', (error) => {
            reject(new Error(`Erro de conexão: ${error.message}`));
        });
        
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Timeout - servidor pode não estar rodando'));
        });
        
        req.end();
    });
}

// Executar teste se for chamado diretamente
if (require.main === module) {
    testDashboardEndpoint().catch(console.error);
}

module.exports = { testDashboardEndpoint };