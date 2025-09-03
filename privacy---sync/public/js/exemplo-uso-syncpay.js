/**
 * Exemplo de Uso - Integração SyncPayments
 * Demonstra como usar todas as funcionalidades implementadas
 */

(function() {
    'use strict';

    // Aguardar carregamento da integração
    document.addEventListener('DOMContentLoaded', function() {
        console.log('🚀 Exemplo de uso SyncPayments carregado');
        
        // Verificar se a integração está disponível
        if (!window.SyncPayIntegration) {
            console.error('❌ SyncPayIntegration não encontrada!');
            return;
        }

        // Criar interface de exemplo - COMENTADO PARA PRODUÇÃO
        // criarInterfaceExemplo();
    });

    // INTERFACE DE TESTE COMENTADA PARA PRODUÇÃO
    /*
    function criarInterfaceExemplo() {
        const container = document.createElement('div');
        container.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                width: 400px;
                background: white;
                border: 2px solid #007bff;
                border-radius: 10px;
                padding: 20px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                z-index: 10000;
                font-family: Arial, sans-serif;
            ">
                <h3 style="margin: 0 0 15px 0; color: #007bff;">🧪 Teste SyncPayments</h3>
                
                <div style="margin-bottom: 15px;">
                    <button id="btnAuth" style="
                        background: #28a745;
                        color: white;
                        border: none;
                        padding: 8px 15px;
                        border-radius: 5px;
                        cursor: pointer;
                        margin-right: 10px;
                    ">🔐 Autenticar</button>
                    
                    <button id="btnBalance" style="
                        background: #17a2b8;
                        color: white;
                        border: none;
                        padding: 8px 15px;
                        border-radius: 5px;
                        cursor: pointer;
                        margin-right: 10px;
                    ">💰 Consultar Saldo</button>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <button id="btnCashIn" style="
                        background: #ffc107;
                        color: #212529;
                        border: none;
                        padding: 8px 15px;
                        border-radius: 5px;
                        cursor: pointer;
                        margin-right: 10px;
                    ">💳 Criar Cash-in</button>
                    
                    <button id="btnStatus" style="
                        background: #6f42c1;
                        color: white;
                        border: none;
                        padding: 8px 15px;
                        border-radius: 5px;
                        cursor: pointer;
                    ">🔍 Consultar Status</button>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <button id="btnExemplo" style="
                        background: #dc3545;
                        color: white;
                        border: none;
                        padding: 8px 15px;
                        border-radius: 5px;
                        cursor: pointer;
                        width: 100%;
                    ">🎯 Executar Exemplo Completo</button>
                </div>
                
                <div id="resultado" style="
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                    border-radius: 5px;
                    padding: 10px;
                    max-height: 200px;
                    overflow-y: auto;
                    font-size: 12px;
                    white-space: pre-wrap;
                ">Clique em um botão para testar...</div>
                
                <div style="margin-top: 10px; text-align: center;">
                    <button id="btnFechar" style="
                        background: #6c757d;
                        color: white;
                        border: none;
                        padding: 5px 10px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 12px;
                    ">❌ Fechar</button>
                </div>
            </div>
        `;

        document.body.appendChild(container);

        // Adicionar event listeners
        document.getElementById('btnAuth').addEventListener('click', testarAutenticacao);
        document.getElementById('btnBalance').addEventListener('click', testarSaldo);
        document.getElementById('btnCashIn').addEventListener('click', testarCashIn);
        document.getElementById('btnStatus').addEventListener('click', testarStatus);
        document.getElementById('btnExemplo').addEventListener('click', executarExemploCompleto);
        document.getElementById('btnFechar').addEventListener('click', () => container.remove());
    }
    */

    function logResultado(mensagem, dados = null) {
        const resultado = document.getElementById('resultado');
        const timestamp = new Date().toLocaleTimeString('pt-BR');
        let texto = `[${timestamp}] ${mensagem}\n`;
        
        if (dados) {
            texto += JSON.stringify(dados, null, 2) + '\n';
        }
        
        resultado.textContent = texto + '\n' + resultado.textContent;
    }

    async function testarAutenticacao() {
        try {
            logResultado('🔐 Iniciando teste de autenticação...');
            
            const token = await window.SyncPayIntegration.getAuthToken();
            
            logResultado('✅ Autenticação bem-sucedida!', {
                token: token.substring(0, 20) + '...',
                tokenCompleto: token
            });
            
        } catch (error) {
            logResultado('❌ Erro na autenticação:', {
                message: error.message,
                stack: error.stack
            });
        }
    }

    async function testarSaldo() {
        try {
            logResultado('💰 Iniciando consulta de saldo...');
            
            const saldo = await window.SyncPayIntegration.getBalance();
            
            logResultado('✅ Saldo consultado com sucesso!', saldo);
            
        } catch (error) {
            logResultado('❌ Erro ao consultar saldo:', {
                message: error.message,
                stack: error.stack
            });
        }
    }

    async function testarCashIn() {
        try {
            logResultado('💳 Iniciando criação de cash-in...');
            
            const dadosCashIn = {
                amount: 10.00, // Valor pequeno para teste
                description: 'Teste de integração - Cash-in',
                client: {
                    name: 'João Silva Teste',
                    cpf: '12345678901',
                    email: 'joao.teste@exemplo.com',
                    phone: '11987654321'
                },
                split: [
                    { percentage: 100, user_id: '708ddc0b-357d-4548-b158-615684caa616' }
                ]
            };
            
            const resultado = await window.SyncPayIntegration.createCashIn(dadosCashIn);
            
            logResultado('✅ Cash-in criado com sucesso!', resultado);
            
            // Salvar identifier para consulta posterior
            if (resultado.identifier) {
                window.lastTransactionId = resultado.identifier;
                logResultado('💾 Identifier salvo para consulta posterior:', {
                    identifier: resultado.identifier
                });
            }
            
            // Mostrar modal de pagamento automaticamente
            if (window.showPaymentModal && resultado) {
                setTimeout(() => {
                    window.showPaymentModal({
                        ...resultado,
                        amount: dadosCashIn.amount
                    });
                }, 1000);
            }
            
        } catch (error) {
            logResultado('❌ Erro ao criar cash-in:', {
                message: error.message,
                stack: error.stack
            });
        }
    }

    async function testarStatus() {
        try {
            if (!window.lastTransactionId) {
                logResultado('⚠️ Nenhuma transação criada ainda. Crie um cash-in primeiro.');
                return;
            }
            
            logResultado('🔍 Consultando status da transação...', {
                identifier: window.lastTransactionId
            });
            
            const status = await window.SyncPayIntegration.getTransactionStatus(window.lastTransactionId);
            
            logResultado('✅ Status consultado com sucesso!', status);
            
        } catch (error) {
            logResultado('❌ Erro ao consultar status:', {
                message: error.message,
                stack: error.stack
            });
        }
    }

    async function executarExemploCompleto() {
        try {
            logResultado('🎯 Iniciando exemplo completo...');
            
            // 1. Autenticação
            logResultado('1️⃣ Etapa 1: Autenticação');
            const token = await window.SyncPayIntegration.getAuthToken();
            logResultado('✅ Autenticação OK', { token: token.substring(0, 20) + '...' });
            
            // 2. Consultar saldo
            logResultado('2️⃣ Etapa 2: Consulta de saldo');
            const saldo = await window.SyncPayIntegration.getBalance();
            logResultado('✅ Saldo consultado', saldo);
            
            // 3. Criar cash-in
            logResultado('3️⃣ Etapa 3: Criação de cash-in');
            const dadosCashIn = {
                amount: 5.00, // Valor mínimo para teste
                description: 'Exemplo completo - Teste de integração',
                client: {
                    name: 'Maria Silva Teste',
                    cpf: '98765432100',
                    email: 'maria.teste@exemplo.com',
                    phone: '11876543210'
                },
                split: [
                    { percentage: 100, user_id: '708ddc0b-357d-4548-b158-615684caa616' }
                ]
            };
            
            const cashInResult = await window.SyncPayIntegration.createCashIn(dadosCashIn);
            logResultado('✅ Cash-in criado', cashInResult);
            
            // 4. Consultar status
            if (cashInResult.identifier) {
                logResultado('4️⃣ Etapa 4: Consulta de status');
                window.lastTransactionId = cashInResult.identifier;
                
                const status = await window.SyncPayIntegration.getTransactionStatus(cashInResult.identifier);
                logResultado('✅ Status consultado', status);
            }
            
            logResultado('🎉 Exemplo completo executado com sucesso!');
            
        } catch (error) {
            logResultado('❌ Erro no exemplo completo:', {
                message: error.message,
                stack: error.stack
            });
        }
    }

    // Expor funções para uso global
    window.ExemploSyncPay = {
        testarAutenticacao,
        testarSaldo,
        testarCashIn,
        testarStatus,
        executarExemploCompleto
    };

    // console.log('🧪 Exemplo de uso SyncPayments carregado e disponível globalmente');

})();
