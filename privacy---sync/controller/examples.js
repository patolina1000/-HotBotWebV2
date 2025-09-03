/**
 * ========================================
 * EXEMPLOS PRÁTICOS - CONTROLLER DE PAGAMENTOS
 * ========================================
 * 
 * Este arquivo contém exemplos práticos de como usar o Controller de Pagamentos.
 * Você pode executar estes exemplos diretamente ou usar como referência.
 */

const { getPaymentController } = require('./index');

// Obter instância do controller
const controller = getPaymentController();

/**
 * ============================
 * EXEMPLO 1: PAGAMENTO SIMPLES
 * ============================
 */
async function exemploPaymentSimples() {
    console.log('\n🟡 === EXEMPLO 1: PAGAMENTO SIMPLES ===');
    
    try {
        const paymentData = {
            amount: 10.50,
            description: 'Exemplo de pagamento PIX',
            external_id: `exemplo_${Date.now()}`
        };

        console.log('📋 Dados do pagamento:', paymentData);
        
        const payment = await controller.createPixPayment(paymentData);
        
        console.log('✅ Pagamento criado com sucesso!');
        console.log('💰 ID do pagamento:', payment.id);
        console.log('🏦 Gateway usado:', controller.getGatewayInfo().gateway);
        
        return payment;
        
    } catch (error) {
        console.error('❌ Erro no exemplo 1:', error.message);
        throw error;
    }
}

/**
 * ============================
 * EXEMPLO 2: CONSULTAR STATUS
 * ============================
 */
async function exemploConsultarStatus(paymentId) {
    console.log('\n🟡 === EXEMPLO 2: CONSULTAR STATUS ===');
    
    try {
        console.log(`🔍 Consultando pagamento: ${paymentId}`);
        
        const status = await controller.getPaymentStatus(paymentId);
        
        console.log('✅ Status consultado com sucesso!');
        console.log('📊 Status atual:', status.status);
        console.log('💰 Valor:', status.amount || status.value);
        
        return status;
        
    } catch (error) {
        console.error('❌ Erro no exemplo 2:', error.message);
        throw error;
    }
}

/**
 * ============================
 * EXEMPLO 3: INFORMAÇÕES DO GATEWAY
 * ============================
 */
function exemploInformacoesGateway() {
    console.log('\n🟡 === EXEMPLO 3: INFORMAÇÕES DO GATEWAY ===');
    
    try {
        const info = controller.getGatewayInfo();
        
        console.log('✅ Informações obtidas:');
        console.log('🏦 Gateway ativo:', info.gateway.toUpperCase());
        console.log('🌍 Ambiente:', info.environment.toUpperCase());
        console.log('🔗 URL da API:', info.api_base_url);
        console.log('📡 Webhook URL:', info.webhook_url);
        
        return info;
        
    } catch (error) {
        console.error('❌ Erro no exemplo 3:', error.message);
        throw error;
    }
}

/**
 * ============================
 * EXEMPLO 4: TESTAR CONECTIVIDADE
 * ============================
 */
async function exemploTestarConectividade() {
    console.log('\n🟡 === EXEMPLO 4: TESTAR CONECTIVIDADE ===');
    
    try {
        console.log('🔍 Testando conectividade...');
        
        const result = await controller.testConnection();
        
        if (result.success) {
            console.log('✅ Conectividade OK!');
            console.log('📝 Mensagem:', result.message);
        } else {
            console.log('❌ Falha na conectividade');
            console.log('📝 Mensagem:', result.message);
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Erro no exemplo 4:', error.message);
        throw error;
    }
}

/**
 * ============================
 * EXEMPLO 5: PAGAMENTO COMPLETO
 * ============================
 */
async function exemploPaymentCompleto() {
    console.log('\n🟡 === EXEMPLO 5: PAGAMENTO COMPLETO ===');
    
    try {
        const paymentData = {
            amount: 25.00,
            description: 'Compra online - Produto XYZ',
            external_id: `pedido_${Date.now()}`,
            customer: {
                name: 'João Silva',
                email: 'joao@email.com',
                document: '12345678901'
            }
        };

        console.log('📋 Criando pagamento completo...');
        
        const payment = await controller.createPixPayment(paymentData);
        
        console.log('✅ Pagamento criado!');
        console.log('💰 ID:', payment.id);
        console.log('💵 Valor:', payment.amount || payment.value);
        console.log('📱 QR Code:', payment.qr_code ? 'Disponível' : 'Não disponível');
        
        // Simular consulta de status após alguns segundos
        console.log('⏳ Aguardando 3 segundos para consultar status...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const status = await controller.getPaymentStatus(payment.id);
        console.log('📊 Status atual:', status.status);
        
        return { payment, status };
        
    } catch (error) {
        console.error('❌ Erro no exemplo 5:', error.message);
        throw error;
    }
}

/**
 * ============================
 * EXEMPLO 6: MONITORAMENTO DE PAGAMENTO
 * ============================
 */
async function exemploMonitorarPagamento(paymentId, maxTentativas = 5) {
    console.log('\n🟡 === EXEMPLO 6: MONITORAMENTO DE PAGAMENTO ===');
    
    try {
        console.log(`🔍 Monitorando pagamento: ${paymentId}`);
        console.log(`⏱️  Máximo de tentativas: ${maxTentativas}`);
        
        let tentativas = 0;
        
        const monitor = setInterval(async () => {
            try {
                tentativas++;
                console.log(`\n📡 Tentativa ${tentativas}/${maxTentativas}`);
                
                const status = await controller.getPaymentStatus(paymentId);
                console.log(`📊 Status: ${status.status}`);
                
                // Verificar se foi pago
                if (status.status === 'paid' || status.status === 'approved') {
                    console.log('🎉 PAGAMENTO APROVADO!');
                    clearInterval(monitor);
                    return;
                }
                
                // Verificar se foi cancelado/expirado
                if (status.status === 'cancelled' || status.status === 'expired') {
                    console.log('❌ PAGAMENTO CANCELADO/EXPIRADO');
                    clearInterval(monitor);
                    return;
                }
                
                // Verificar limite de tentativas
                if (tentativas >= maxTentativas) {
                    console.log('⏰ Limite de tentativas atingido');
                    clearInterval(monitor);
                    return;
                }
                
            } catch (error) {
                console.error(`❌ Erro na tentativa ${tentativas}:`, error.message);
                
                if (tentativas >= maxTentativas) {
                    clearInterval(monitor);
                }
            }
        }, 5000); // Verificar a cada 5 segundos
        
        console.log('✅ Monitoramento iniciado (verificando a cada 5 segundos)');
        
    } catch (error) {
        console.error('❌ Erro no exemplo 6:', error.message);
        throw error;
    }
}

/**
 * ============================
 * EXEMPLO 7: RENOVAR TOKEN
 * ============================
 */
async function exemploRenovarToken() {
    console.log('\n🟡 === EXEMPLO 7: RENOVAR TOKEN ===');
    
    try {
        console.log('🔄 Renovando token...');
        
        const token = await controller.refreshToken();
        
        console.log('✅ Token renovado com sucesso!');
        console.log('🔑 Novo token obtido');
        
        return token;
        
    } catch (error) {
        console.error('❌ Erro no exemplo 7:', error.message);
        throw error;
    }
}

/**
 * ============================
 * EXECUTAR TODOS OS EXEMPLOS
 * ============================
 */
async function executarTodosExemplos() {
    console.log('\n🚀 === EXECUTANDO TODOS OS EXEMPLOS ===');
    
    try {
        // Exemplo 3: Informações (não precisa de API)
        exemploInformacoesGateway();
        
        // Exemplo 4: Testar conectividade
        await exemploTestarConectividade();
        
        // Exemplo 1: Pagamento simples
        const payment = await exemploPaymentSimples();
        
        // Exemplo 2: Consultar status
        await exemploConsultarStatus(payment.id);
        
        // Exemplo 5: Pagamento completo
        await exemploPaymentCompleto();
        
        // Exemplo 7: Renovar token
        await exemploRenovarToken();
        
        console.log('\n✅ === TODOS OS EXEMPLOS EXECUTADOS ===');
        
    } catch (error) {
        console.error('\n❌ === ERRO GERAL ===');
        console.error('Erro:', error.message);
    }
}

/**
 * ============================
 * EXPORTS PARA USO EXTERNO
 * ============================
 */
module.exports = {
    exemploPaymentSimples,
    exemploConsultarStatus,
    exemploInformacoesGateway,
    exemploTestarConectividade,
    exemploPaymentCompleto,
    exemploMonitorarPagamento,
    exemploRenovarToken,
    executarTodosExemplos
};

/**
 * ============================
 * EXECUÇÃO DIRETA
 * ============================
 */
if (require.main === module) {
    console.log('🎮 CONTROLLER DE PAGAMENTOS - EXEMPLOS PRÁTICOS');
    console.log('===============================================');
    
    // Executar todos os exemplos se o arquivo for executado diretamente
    executarTodosExemplos().catch(error => {
        console.error('❌ Erro fatal:', error.message);
        process.exit(1);
    });
}