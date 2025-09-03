/**
 * SCRIPT DE TESTE PARA POPUP PIX
 * Use para testar o funcionamento do popup sem fazer transações reais
 */

// Função para testar o popup com dados simulados
function testPixPopup() {
    console.log('🧪 Iniciando teste do popup PIX...');
    
    const testData = {
        pix_code: '00020126580014BR.GOV.BCB.PIX0136123e4567-e12b-12d1-a456-426614174000520400005303986540519.905802BR5913STELLA BEGHINI6009SAO PAULO61080540900062070503***6304ABCD',
        amount: 19.90,
        id: 'test-transaction-' + Date.now()
    };
    
    // Testar popup alternativo
    if (window.showPixPopup) {
        console.log('✅ Usando popup alternativo');
        window.showPixPopup(testData);
    } else if (window.showPaymentModal) {
        console.log('✅ Usando modal de pagamento principal');
        window.showPaymentModal({
            pix_qr_code: testData.pix_code,
            pix_copy_paste: testData.pix_code,
            amount: testData.amount,
            identifier: testData.id,
            status: 'pending'
        });
    } else {
        console.error('❌ Nenhum sistema de popup disponível');
        alert('Teste: PIX gerado! Código: ' + testData.pix_code.substring(0, 50) + '...');
    }
}

// Função para testar os botões de assinatura
function testSubscriptionButtons() {
    console.log('🧪 Testando botões de assinatura...');
    
    // Simular clique no botão de 1 mês
    const btn1mes = document.getElementById('btn-1-mes');
    if (btn1mes) {
        console.log('✅ Botão 1 mês encontrado');
        // btn1mes.click(); // Descomente para testar automaticamente
    } else {
        console.error('❌ Botão 1 mês não encontrado');
    }
    
    // Verificar outros botões
    const btn3meses = document.getElementById('btn-3-meses');
    const btn6meses = document.getElementById('btn-6-meses');
    
    console.log('✅ Botão 3 meses:', btn3meses ? 'Encontrado' : '❌ Não encontrado');
    console.log('✅ Botão 6 meses:', btn6meses ? 'Encontrado' : '❌ Não encontrado');
}

// Função para verificar a configuração
function checkConfiguration() {
    console.log('🔍 Verificando configuração...');
    
    if (window.SYNCPAY_CONFIG) {
        console.log('✅ SYNCPAY_CONFIG:', {
            client_id: !!window.SYNCPAY_CONFIG.client_id,
            client_secret: !!window.SYNCPAY_CONFIG.client_secret,
            plans: !!window.SYNCPAY_CONFIG.plans
        });
        
        if (window.SYNCPAY_CONFIG.plans) {
            console.log('📋 Planos configurados:', window.SYNCPAY_CONFIG.plans);
        }
    } else {
        console.error('❌ SYNCPAY_CONFIG não encontrado');
    }
}

// Executar testes automaticamente após carregamento
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        console.log('🚀 Executando testes automáticos...');
        checkConfiguration();
        testSubscriptionButtons();
        
        // Adicionar botão de teste na página (apenas para debug)
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            const testButton = document.createElement('button');
            testButton.textContent = '🧪 Testar Popup PIX';
            testButton.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 20px;
                z-index: 9999;
                padding: 10px 15px;
                background: linear-gradient(45deg, #17a2b8, #138496);
                color: white;
                border: none;
                border-radius: 20px;
                font-weight: 500;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                font-size: 12px;
            `;
            testButton.onclick = testPixPopup;
            document.body.appendChild(testButton);
        }
        
    }, 3000);
});

console.log('🧪 Script de teste carregado');