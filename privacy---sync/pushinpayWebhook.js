/**
 * Webhook Handler para PushinPay
 * ATUALIZADO: Agora redireciona para a implementação estável do bot
 * 🔥 NOVO: Integração com Kwai Event API para tracking
 */

const express = require('express');
const KwaiEventAPI = require('./services/kwaiEventAPI');

class PushinPayWebhookHandler {
    constructor(botWebhookHandler = null) {
        this.botWebhookHandler = botWebhookHandler;
        console.log('🔔 PushinPay Webhook Handler inicializado (integração bot)');
    }

    /**
     * Processar webhook da PushinPay
     * ATUALIZADO: Redireciona para implementação estável do bot se disponível
     */
    async handleWebhook(req, res) {
        try {
            console.log('🔔 Webhook PushinPay recebido (privacy)');
            console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
            console.log('📦 Body:', JSON.stringify(req.body, null, 2));

            // Se há integração com bot disponível, usar ela
            if (this.botWebhookHandler && typeof this.botWebhookHandler === 'function') {
                console.log('🔄 Redirecionando webhook para implementação estável do bot');
                return this.botWebhookHandler(req, res);
            }

            // Fallback: processamento local (mantido para compatibilidade)
            const webhookData = req.body;

            // Validar estrutura do webhook
            if (!webhookData || !webhookData.id) {
                console.error('❌ Webhook inválido - sem ID da transação');
                return res.status(400).json({ 
                    error: 'Webhook inválido',
                    message: 'ID da transação não encontrado'
                });
            }

            // Processar webhook baseado no status (agora assíncrono)
            await this.processWebhookByStatus(webhookData);

            // Confirmar recebimento (importante para evitar reenvios)
            res.status(200).json({ 
                success: true,
                message: 'Webhook processado com sucesso',
                transaction_id: webhookData.id,
                source: 'privacy-fallback'
            });

        } catch (error) {
            console.error('❌ Erro ao processar webhook PushinPay:', error.message);
            res.status(500).json({ 
                error: 'Erro interno',
                message: 'Falha ao processar webhook'
            });
        }
    }

    /**
     * Processar webhook baseado no status da transação
     */
    async processWebhookByStatus(webhookData) {
        const { id, status, value, payer_name, payer_national_registration, end_to_end_id } = webhookData;

        console.log(`📊 Processando webhook para transação ${id} com status: ${status}`);

        switch (status) {
            case 'created':
                await this.handleCreatedStatus(webhookData);
                break;
            
            case 'paid':
                await this.handlePaidStatus(webhookData);
                break;
            
            case 'expired':
                await this.handleExpiredStatus(webhookData);
                break;
            
            default:
                console.warn(`⚠️ Status desconhecido recebido: ${status}`);
                this.handleUnknownStatus(webhookData);
        }
    }

    /**
     * Processar status 'created'
     */
    async handleCreatedStatus(webhookData) {
        console.log('✅ PIX criado:', {
            id: webhookData.id,
            value: webhookData.value,
            qr_code: webhookData.qr_code ? 'Presente' : 'Ausente'
        });

        // 🔥 NOVO: Tracking Kwai Event API - EVENT_ADD_TO_CART
        try {
            const kwaiService = new KwaiEventAPI();
            if (kwaiService.isConfigured()) {
                // Tentar obter click_id do webhook ou usar ID da transação como fallback
                const clickId = webhookData.click_id || webhookData.kwai_click_id || webhookData.id;
                
                if (clickId) {
                    console.log(`🎯 [KWAI] Enviando EVENT_ADD_TO_CART para transação ${webhookData.id}`);
                    await kwaiService.sendAddToCart(clickId, webhookData.value, {
                        contentName: `Privacy - PIX ${webhookData.id}`,
                        contentId: webhookData.id,
                        contentCategory: 'Privacy - PIX',
                        transaction_id: webhookData.id
                    });
                } else {
                    console.warn('⚠️ [KWAI] Click ID não disponível para tracking');
                }
            } else {
                console.log('ℹ️ [KWAI] Serviço não configurado, pulando tracking');
            }
        } catch (error) {
            console.error('❌ [KWAI] Erro ao enviar evento ADD_TO_CART:', error.message);
        }

        // Aqui você pode:
        // - Atualizar banco de dados local
        // - Notificar o usuário que o PIX foi criado
        // - Enviar email/SMS com QR Code
        // - Log para auditoria
    }

    /**
     * Processar status 'paid'
     */
    async handlePaidStatus(webhookData) {
        console.log('💰 PIX pago:', {
            id: webhookData.id,
            value: webhookData.value,
            payer_name: webhookData.payer_name,
            payer_document: webhookData.payer_national_registration,
            end_to_end_id: webhookData.end_to_end_id
        });

        // 🔥 NOVO: Tracking Kwai Event API - EVENT_PURCHASE
        try {
            const kwaiService = new KwaiEventAPI();
            if (kwaiService.isConfigured()) {
                // Tentar obter click_id do webhook ou usar ID da transação como fallback
                const clickId = webhookData.click_id || webhookData.kwai_click_id || webhookData.id;
                
                if (clickId) {
                    console.log(`🎯 [KWAI] Enviando EVENT_PURCHASE para transação ${webhookData.id}`);
                    await kwaiService.sendPurchase(clickId, webhookData.value, {
                        contentName: `Privacy - PIX ${webhookData.id}`,
                        contentId: webhookData.id,
                        contentCategory: 'Privacy - PIX',
                        transaction_id: webhookData.id,
                        payer_name: webhookData.payer_name,
                        end_to_end_id: webhookData.end_to_end_id
                    });
                } else {
                    console.warn('⚠️ [KWAI] Click ID não disponível para tracking');
                }
            } else {
                console.log('ℹ️ [KWAI] Serviço não configurado, pulando tracking');
            }
        } catch (error) {
            console.error('❌ [KWAI] Erro ao enviar evento PURCHASE:', error.message);
        }

        // 🔥 NOVO: Redirecionar usuário para página de sucesso
        // Como o webhook é chamado pelo servidor PushinPay, não podemos redirecionar diretamente
        // Mas podemos armazenar a informação de que o pagamento foi aprovado
        // e criar um sistema de verificação na página principal
        
        console.log('✅ [REDIRECT] Pagamento aprovado - usuário deve ser redirecionado para /compra-aprovada');
        
        // Aqui você pode:
        // - Confirmar pagamento no sistema
        // - Liberar produto/serviço
        // - Enviar confirmação ao cliente
        // - Processar split_rules se houver
        // - Atualizar estoque
        // - Enviar nota fiscal
    }

    /**
     * Processar status 'expired'
     */
    handleExpiredStatus(webhookData) {
        console.log('⏰ PIX expirado:', {
            id: webhookData.id,
            value: webhookData.value
        });

        // Aqui você pode:
        // - Marcar transação como expirada
        // - Notificar cliente sobre expiração
        // - Liberar estoque reservado
        // - Log para relatórios
    }

    /**
     * Processar status desconhecido
     */
    handleUnknownStatus(webhookData) {
        console.log('❓ Status desconhecido:', {
            id: webhookData.id,
            status: webhookData.status,
            data: webhookData
        });

        // Log para investigação
    }

    /**
     * Middleware para validar webhook (opcional)
     * A PushinPay permite headers customizados para autenticação
     */
    validateWebhook(req, res, next) {
        // Implementar validação se necessário
        // Exemplo: verificar header customizado configurado no painel PushinPay
        
        const customHeader = req.headers['x-pushinpay-signature'];
        if (customHeader) {
            // Validar assinatura customizada
            console.log('🔐 Header customizado detectado:', customHeader);
        }

        next();
    }

    /**
     * Configurar rotas do webhook
     */
    setupRoutes(app) {
        // Rota principal do webhook
        app.post('/webhook/pushinpay', 
            this.validateWebhook.bind(this),
            this.handleWebhook.bind(this)
        );

        console.log('🛣️ Rota do webhook PushinPay configurada: POST /webhook/pushinpay');
    }

    /**
     * Testar webhook com dados simulados
     */
    testWebhook() {
        console.log('🧪 Testando webhook PushinPay com dados simulados');

        const mockWebhookData = {
            id: "9c29870c-9f69-4bb6-90d3-2dce9453bb45",
            qr_code: "00020101021226770014BR.GOV.BCB.PIX2555api...",
            status: "paid",
            value: 1000,
            webhook_url: "http://localhost:3000/webhook/pushinpay",
            qr_code_base64: "data:image/png;base64,iVBORw0KGgoAA.....",
            webhook: null,
            split_rules: [],
            end_to_end_id: "E12345678202412071234567890123456",
            payer_name: "João da Silva",
            payer_national_registration: "12345678901"
        };

        this.processWebhookByStatus(mockWebhookData);
    }
}

module.exports = PushinPayWebhookHandler;