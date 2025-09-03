/**
 * AuthProxyClient.js - Cliente de autenticação para API SyncPay
 * Gerencia autenticação e tokens de acesso via proxy backend
 */

(function() {
    'use strict';

    let isAuthenticating = false; // Flag para evitar requisições simultâneas

    // Função principal de autenticação
    function authenticateSyncPay() {
        // Evitar múltiplas requisições simultâneas
        if (isAuthenticating) {
            console.log('⏳ Autenticação já em andamento, aguardando...');
            return;
        }

        isAuthenticating = true;
        console.log('🔐 Iniciando autenticação SyncPay...');

        // 1. Validar se as credenciais existem
        if (!window.SYNCPAY_CONFIG) {
            alert('❌ ERRO: Configuração SYNCPAY_CONFIG não encontrada!');
            console.error('SYNCPAY_CONFIG não está definida');
            isAuthenticating = false;
            return;
        }

        const { client_id, client_secret } = window.SYNCPAY_CONFIG;

        if (!client_id || !client_secret) {
            console.error('❌ ERRO: Credenciais SyncPay não configuradas');
            console.error('client_id:', client_id ? 'DEFINIDO' : 'NÃO DEFINIDO');
            console.error('client_secret:', client_secret ? 'DEFINIDO' : 'NÃO DEFINIDO');
            alert('❌ ERRO: client_id ou client_secret não configurados!\n\nVerifique as variáveis de ambiente no Render.com');
            isAuthenticating = false;
            return;
        }

        console.log('✅ Credenciais validadas com sucesso');

        // 2. Preparar dados da requisição
        const authData = {
            client_id: client_id,
            client_secret: client_secret,
            '01K1259MAXE0TNRXV2C2WQN2MV': 'auth_request_' + Date.now() // Campo obrigatório com timestamp
        };

        console.log('📤 Enviando requisição de autenticação via proxy...');

        // 3. Fazer requisição POST para o proxy backend (evita CORS)
        fetch('/api/auth-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(authData)
        })
        .then(response => {
            console.log('📥 Resposta recebida:', response.status, response.statusText);
            
            if (!response.ok) {
                return response.json().then(errorData => {
                    throw new Error(`HTTP ${response.status}: ${errorData.message || response.statusText}`);
                });
            }
            
            return response.json();
        })
        .then(data => {
            console.log('✅ Autenticação bem-sucedida:', data);
            
            // 4. Salvar access_token no sessionStorage
            if (data.access_token) {
                sessionStorage.setItem('access_token', data.access_token);
                sessionStorage.setItem('token_expires_at', data.expires_at);
                console.log('💾 Token salvo no sessionStorage');
                console.log('⏰ Token expira em:', new Date(data.expires_at).toLocaleString());
                
                // alert('✅ Autenticação realizada com sucesso!\n\nToken de acesso salvo.'); // COMENTADO - removido aviso de autenticação
            } else {
                throw new Error('Token de acesso não encontrado na resposta');
            }
        })
        .catch(error => {
            console.error('❌ Erro na autenticação:', error);
            alert('❌ ERRO na autenticação:\n\n' + error.message);
        })
        .finally(() => {
            isAuthenticating = false; // Reset da flag
        });
    }

    // Função para verificar se já existe um token válido
    function checkExistingToken() {
        const existingToken = sessionStorage.getItem('access_token');
        const expiresAt = sessionStorage.getItem('token_expires_at');
        
        if (existingToken && expiresAt) {
            const now = new Date();
            const expiryDate = new Date(expiresAt);
            
            // Verificar se o token ainda é válido (com margem de 5 minutos)
            if (now < expiryDate - (5 * 60 * 1000)) {
                console.log('🔍 Token válido encontrado no sessionStorage');
                console.log('⏰ Token expira em:', expiryDate.toLocaleString());
                return existingToken;
            } else {
                console.log('⚠️ Token expirado, removendo...');
                clearAuthToken();
            }
        }
        return null;
    }

    // Função para limpar token (logout)
    function clearAuthToken() {
        sessionStorage.removeItem('access_token');
        sessionStorage.removeItem('token_expires_at');
        console.log('🗑️ Token removido do sessionStorage');
    }

    // Função para obter token atual
    function getCurrentToken() {
        const token = sessionStorage.getItem('access_token');
        const expiresAt = sessionStorage.getItem('token_expires_at');
        
        if (token && expiresAt) {
            const now = new Date();
            const expiryDate = new Date(expiresAt);
            
            if (now < expiryDate - (5 * 60 * 1000)) {
                return token;
            } else {
                clearAuthToken();
            }
        }
        return null;
    }

    // Função para verificar se está autenticado
    function isAuthenticated() {
        return !!getCurrentToken();
    }

    // Função para renovar token se necessário
    function refreshTokenIfNeeded() {
        const token = getCurrentToken();
        if (!token) {
            console.log('🔐 Token não encontrado, iniciando autenticação...');
            authenticateSyncPay();
        }
    }

    // Auto-inicialização quando o DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            console.log('🚀 AuthProxyClient carregado e pronto');
            
            // Verificar se já existe um token válido
            const existingToken = checkExistingToken();
            if (!existingToken) {
                console.log('🔐 Nenhum token válido encontrado, iniciando autenticação...');
                // Aguardar um pouco para garantir que tudo está carregado
                setTimeout(authenticateSyncPay, 1000);
            } else {
                console.log('✅ Token válido encontrado, autenticação não necessária');
            }
        });
    } else {
        // DOM já está pronto
        console.log('🚀 AuthProxyClient carregado (DOM já pronto)');
        
        const existingToken = checkExistingToken();
        if (!existingToken) {
            setTimeout(authenticateSyncPay, 1000);
        }
    }

    // Expor funções para uso global
    window.AuthProxyClient = {
        authenticate: authenticateSyncPay,
        checkToken: checkExistingToken,
        clearToken: clearAuthToken,
        getToken: getCurrentToken,
        isAuthenticated: isAuthenticated,
        refreshToken: refreshTokenIfNeeded
    };

    console.log('🔧 AuthProxyClient inicializado e disponível globalmente');

})();
