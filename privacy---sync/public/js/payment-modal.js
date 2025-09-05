/**
 * MODAL DE PAGAMENTO
 * Exibe tela de pagamento conforme design das imagens
 */

class PaymentModal {
    constructor() {
        this.modal = null;
        this.overlay = null;
        this.isOpen = false;
        this.currentTransaction = null;
        this.statusCheckInterval = null;
        this.init();
    }

    init() {
        this.createModalHTML();
        this.bindEvents();
    }

    createModalHTML() {
        // Criar overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'payment-modal-overlay';
        this.overlay.id = 'paymentModalOverlay';

        // Criar modal
        this.modal = document.createElement('div');
        this.modal.className = 'payment-modal';
        this.modal.id = 'paymentModal';

        this.modal.innerHTML = `
            <div class="payment-modal-header">
                <button class="payment-modal-close" id="paymentModalClose">
                    ×
                </button>
                <div class="payment-profile">
                    <div class="payment-profile-avatar">
                        <img src="/images/perfil.jpg" alt="Perfil">
                    </div>
                    <div class="payment-profile-info">
                        <h3 class="model-name" data-config="model.name">Hadrielle Maria</h3>
                        <p class="model-handle" data-config="model.handle">@hadriiimaria_</p>
                    </div>
                </div>
            </div>
            
            <div class="payment-modal-body">
                <div class="payment-benefits">
                    <h4>Benefícios Exclusivos</h4>
                    <ul class="payment-benefits-list">
                        <li>Acesso ao conteúdo</li>
                        <li>Chat exclusivo com o criador</li>
                        <li>Cancele a qualquer hora</li>
                    </ul>
                </div>
                
                <div class="payment-plan">
                    <p class="payment-plan-label">Formas de pagamento</p>
                    <p class="payment-plan-duration">Valor</p>
                    <p class="payment-plan-price" id="paymentPlanPrice">R$ 0,00</p>
                </div>
                
                <div class="payment-qr-container" id="paymentQRContainer">
                    <div class="payment-qr-code" id="paymentQRCode">
                        <!-- QR Code será inserido aqui -->
                    </div>
                </div>

                <div class="payment-pix">
                    <p class="payment-pix-label">CHAVE PIX</p>
                    <div class="payment-pix-code" id="paymentPixCode">
                        Gerando código PIX...
                    </div>
                    <button class="payment-copy-button" id="paymentCopyButton">
                        COPIAR CHAVE PIX
                    </button>
                </div>
                
                <div class="payment-status" id="paymentStatus" style="display: none;">
                    <p class="payment-status-text"></p>
                </div>
            </div>
        `;

        this.overlay.appendChild(this.modal);
        document.body.appendChild(this.overlay);
    }

    bindEvents() {
        // Fechar modal
        const closeBtn = document.getElementById('paymentModalClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Fechar clicando no overlay
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });

        // Copiar chave PIX
        const copyBtn = document.getElementById('paymentCopyButton');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyPixCode());
        }

        // Fechar com ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    async show(transactionData) {
        if (!transactionData) {
            console.error('Dados da transação são obrigatórios');
            return;
        }

        // 🔍 DEBUG: Log detalhado dos dados recebidos
        console.log('🚀 [PAYMENT-MODAL] Modal sendo aberto com dados:', {
            transactionData: transactionData,
            hasData: !!transactionData.data,
            dataKeys: transactionData.data ? Object.keys(transactionData.data) : 'N/A',
            success: transactionData.success,
            gateway: transactionData.gateway,
            qr_code_image_data: transactionData.data ? (transactionData.data.qr_code_image ? 'PRESENTE' : 'AUSENTE') : 'N/A',
            qr_code_image_root: transactionData.qr_code_image ? 'PRESENTE' : 'AUSENTE',
            allKeys: Object.keys(transactionData)
        });

        this.currentTransaction = transactionData;
        // 🔥 NOVO: Armazenar valor da transação para uso no redirecionamento
        this.amount = transactionData.amount;
        this.currentPlan = transactionData.plan || null;
        
        this.updateModalContent(transactionData);
        
        // Mostrar modal
        this.overlay.classList.add('show');
        this.isOpen = true;
        
        // Gerar QR Code se houver dados PIX
        // 🔥 CORREÇÃO: PushinPay retorna dados dentro de 'data'
        const data = transactionData.data || transactionData;
        const pixCode = data.pix_qr_code || data.pix_copy_paste || data.pix_code || data.qr_code || 
                       transactionData.pix_qr_code || transactionData.pix_copy_paste || transactionData.pix_code || transactionData.qr_code;
        
        console.log('🔍 [PAYMENT-MODAL] Dados recebidos:', {
            transactionData: transactionData,
            data: data,
            pixCode: pixCode ? pixCode.substring(0, 50) + '...' : 'NÃO ENCONTRADO'
        });
        
        if (pixCode) {
            console.log('✅ [PAYMENT-MODAL] PIX Code encontrado, gerando QR Code');
            await this.generateQRCode(pixCode);
        } else {
            console.warn('⚠️ [PAYMENT-MODAL] PIX Code não encontrado nos dados recebidos');
        }

        // Iniciar verificação de status
        this.startStatusCheck();
    }

    updateModalContent(data) {
        // 🔥 CORREÇÃO: Buscar dados em todos os níveis possíveis
        let pixCode = '';
        let amount = null;
        
        // Buscar PIX code
        if (data.data && data.data.pix_code) {
            pixCode = data.data.pix_code;
        } else if (data.pix_code) {
            pixCode = data.pix_code;
        } else if (data.data && data.data.qr_code) {
            pixCode = data.data.qr_code;
        } else if (data.qr_code) {
            pixCode = data.qr_code;
        } else if (data.data && data.data.pix_qr_code) {
            pixCode = data.data.pix_qr_code;
        } else if (data.pix_qr_code) {
            pixCode = data.pix_qr_code;
        } else if (data.data && data.data.pix_copy_paste) {
            pixCode = data.data.pix_copy_paste;
        } else if (data.pix_copy_paste) {
            pixCode = data.pix_copy_paste;
        } else {
            pixCode = 'Código PIX será gerado em breve...';
        }
        
        // Buscar amount
        if (data.amount) {
            amount = data.amount;
        } else if (data.data && data.data.amount) {
            amount = data.data.amount;
        } else if (data.value) {
            amount = data.value;
        } else if (data.data && data.data.value) {
            amount = data.data.value;
        }
        
        console.log('🔍 [PAYMENT-MODAL] updateModalContent - dados processados:', {
            pixCode: pixCode ? pixCode.substring(0, 50) + '...' : 'N/A',
            amount: amount,
            dataKeys: Object.keys(data),
            hasDataProperty: !!data.data
        });
        
        // Atualizar preço
        const priceElement = document.getElementById('paymentPlanPrice');
        if (priceElement && amount) {
            const formattedPrice = this.formatCurrency(amount);
            priceElement.textContent = formattedPrice;
        }

        // Atualizar código PIX
        const pixCodeElement = document.getElementById('paymentPixCode');
        if (pixCodeElement) {

            // Garantir que o código PIX esteja em uma única linha
            pixCode = pixCode.replace(/\r?\n|\r/g, '').trim();
            pixCodeElement.textContent = pixCode;

            // Habilitar/desabilitar botão de copiar
            const copyBtn = document.getElementById('paymentCopyButton');
            if (copyBtn) {
                copyBtn.disabled = !pixCode || pixCode.includes('será gerado');
            }
        }

        // Atualizar status sem mensagem inicial
        this.updateStatus('pending', '');
        
        console.log('Modal atualizado com dados:', data);
    }

    async generateQRCode(pixCode) {
        try {
            const qrContainer = document.getElementById('paymentQRContainer');
            const qrCodeElement = document.getElementById('paymentQRCode');

            if (!qrCodeElement) {
                console.warn('⚠️ Elemento QR Code não encontrado');
                return;
            }

            const isMobile = window.innerWidth <= 768;
            const allowMobileQR = window.APP_CONFIG ? window.APP_CONFIG.generateQRCodeOnMobile : true; // 🔥 HABILITADO por padrão
            if (qrContainer) {
                if (isMobile && !allowMobileQR) {
                    console.log('📱 [PAYMENT-MODAL] QR Code desabilitado no mobile');
                    qrContainer.style.display = 'none';
                    return;
                } else {
                    console.log('📱 [PAYMENT-MODAL] QR Code habilitado para este dispositivo');
                    qrContainer.style.display = 'block';
                }
            }

            // Limpar QR Code anterior
            qrCodeElement.innerHTML = '';

            const size = 210; // 30% menor que o tamanho original

            // Aguardar QRCode estar pronto se necessário
            await this.waitForQRCode();

            // 🔥 CORREÇÃO: Verificar QR Code image em todos os níveis possíveis
            const transaction = this.currentTransaction;
            let qrCodeImage = null;
            
            // 🔍 LOG DETALHADO: Mostrar TODA a estrutura de dados
            console.log('🔍 [PAYMENT-MODAL] ANÁLISE COMPLETA DOS DADOS:');
            console.log('  - transaction:', transaction);
            console.log('  - transaction.data:', transaction.data);
            console.log('  - transaction keys:', Object.keys(transaction));
            if (transaction.data) {
                console.log('  - transaction.data keys:', Object.keys(transaction.data));
            }
            
            // Tentar encontrar qr_code_image em diferentes estruturas
            if (transaction.data && transaction.data.qr_code_image) {
                qrCodeImage = transaction.data.qr_code_image;
                console.log('✅ [PAYMENT-MODAL] QR Code encontrado em transaction.data.qr_code_image');
                console.log('  - Tamanho:', qrCodeImage.length, 'caracteres');
                console.log('  - Primeiros 100 chars:', qrCodeImage.substring(0, 100));
            } else if (transaction.qr_code_image) {
                qrCodeImage = transaction.qr_code_image;
                console.log('✅ [PAYMENT-MODAL] QR Code encontrado em transaction.qr_code_image');
                console.log('  - Tamanho:', qrCodeImage.length, 'caracteres');
                console.log('  - Primeiros 100 chars:', qrCodeImage.substring(0, 100));
            } else if (transaction.data && transaction.data.qr_code_base64) {
                qrCodeImage = transaction.data.qr_code_base64;
                console.log('✅ [PAYMENT-MODAL] QR Code encontrado em transaction.data.qr_code_base64');
                console.log('  - Tamanho:', qrCodeImage.length, 'caracteres');
                console.log('  - Primeiros 100 chars:', qrCodeImage.substring(0, 100));
            } else if (transaction.qr_code_base64) {
                qrCodeImage = transaction.qr_code_base64;
                console.log('✅ [PAYMENT-MODAL] QR Code encontrado em transaction.qr_code_base64');
                console.log('  - Tamanho:', qrCodeImage.length, 'caracteres');
                console.log('  - Primeiros 100 chars:', qrCodeImage.substring(0, 100));
            } else {
                console.warn('⚠️ [PAYMENT-MODAL] QR Code image NÃO encontrado em nenhum local esperado');
                console.log('  - Campos disponíveis em transaction:', Object.keys(transaction));
                if (transaction.data) {
                    console.log('  - Campos disponíveis em transaction.data:', Object.keys(transaction.data));
                }
            }
            
            // 🔍 DEBUG: Log completo da estrutura de dados
            console.log('🔍 [PAYMENT-MODAL] Estrutura completa dos dados recebidos:', {
                currentTransaction: transaction,
                hasTransactionData: !!transaction.data,
                transactionKeys: Object.keys(transaction),
                dataKeys: transaction.data ? Object.keys(transaction.data) : 'N/A',
                qrCodeImage: qrCodeImage ? 'ENCONTRADO (' + qrCodeImage.length + ' chars)' : 'NÃO ENCONTRADO'
            });
            
            if (qrCodeImage) {
                console.log('✅ [PAYMENT-MODAL] QR Code image encontrado! Iniciando exibição...');
                
                // 🔄 Método 1: Tentar exibir imagem diretamente
                this.displayQRCodeImage(qrCodeImage, qrCodeElement, size);
                return;
            } else {
                console.warn('⚠️ [PAYMENT-MODAL] QR Code image NÃO encontrado nos dados');
                console.log('🔄 [PAYMENT-MODAL] Tentando gerar QR Code com código PIX');
            }

            // Tentar usar QRCode.js primeiro, depois fallback para APIs externas
            this.generateQRWithLibrary(pixCode, qrCodeElement, size);
        } catch (error) {
            console.error('❌ Erro ao gerar QR Code:', error);
            // Fallback em caso de erro
            this.generateFallbackQR(pixCode, document.getElementById('paymentQRCode'), 210);
        }
    }

    displayQRCodeImage(qrCodeImage, qrCodeElement, size) {
        console.log('🖼️ [PAYMENT-MODAL] Iniciando displayQRCodeImage');
        console.log('  - Tamanho da imagem:', qrCodeImage.length, 'caracteres');
        console.log('  - Elemento destino:', qrCodeElement);
        console.log('  - Tamanho desejado:', size);
        
        // Verificar formato da imagem
        let imageSrc = '';
        if (qrCodeImage.startsWith('data:image/')) {
            imageSrc = qrCodeImage;
            console.log('✅ [PAYMENT-MODAL] Imagem já tem prefixo data:image/');
        } else {
            imageSrc = `data:image/png;base64,${qrCodeImage}`;
            console.log('✅ [PAYMENT-MODAL] Adicionando prefixo data:image/png;base64,');
        }
        
        console.log('  - URL final da imagem:', imageSrc.substring(0, 100) + '...');
        
        // 🔄 Método 1: Elemento IMG simples
        console.log('🔄 [PAYMENT-MODAL] Tentando método 1: Elemento IMG');
        const img = document.createElement('img');
        img.src = imageSrc;
        img.alt = 'QR Code PIX';
        img.style.cssText = `
            max-width: ${size}px;
            height: auto;
            border: 2px solid #ddd;
            border-radius: 8px;
            display: block;
            margin: 0 auto;
        `;
        
        let imageLoaded = false;
        
        img.onload = () => {
            if (!imageLoaded) {
                imageLoaded = true;
                console.log('✅ [PAYMENT-MODAL] Método 1 SUCESSO: Imagem carregada');
                console.log('  - Dimensões naturais:', img.naturalWidth, 'x', img.naturalHeight);
                qrCodeElement.innerHTML = '';
                qrCodeElement.appendChild(img);
            }
        };
        
        img.onerror = (error) => {
            if (!imageLoaded) {
                console.error('❌ [PAYMENT-MODAL] Método 1 FALHOU:', error);
                console.log('🔄 [PAYMENT-MODAL] Tentando método 2: Canvas');
                this.displayQRCodeWithCanvas(imageSrc, qrCodeElement, size);
            }
        };
        
        // Timeout de segurança
        setTimeout(() => {
            if (!imageLoaded) {
                console.warn('⏰ [PAYMENT-MODAL] Timeout do método 1, tentando método 2');
                this.displayQRCodeWithCanvas(imageSrc, qrCodeElement, size);
            }
        }, 3000);
    }

    displayQRCodeWithCanvas(imageSrc, qrCodeElement, size) {
        console.log('🎨 [PAYMENT-MODAL] Tentando método 2: Canvas');
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        canvas.style.cssText = `
            max-width: ${size}px;
            height: auto;
            border: 2px solid #ddd;
            border-radius: 8px;
            display: block;
            margin: 0 auto;
        `;
        
        img.onload = () => {
            console.log('✅ [PAYMENT-MODAL] Método 2 SUCESSO: Imagem carregada no canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            qrCodeElement.innerHTML = '';
            qrCodeElement.appendChild(canvas);
        };
        
        img.onerror = (error) => {
            console.error('❌ [PAYMENT-MODAL] Método 2 FALHOU:', error);
            console.log('🔄 [PAYMENT-MODAL] Tentando método 3: Fallback com texto');
            this.displayQRCodeFallback(qrCodeElement);
        };
        
        img.src = imageSrc;
    }

    displayQRCodeFallback(qrCodeElement) {
        console.log('📝 [PAYMENT-MODAL] Método 3: Fallback com texto');
        qrCodeElement.innerHTML = `
            <div style="
                text-align: center; 
                color: #666; 
                padding: 20px;
                border: 2px dashed #ddd;
                border-radius: 8px;
                background: #f9f9f9;
            ">
                <p style="margin: 0; font-size: 14px;">QR Code não pôde ser exibido</p>
                <p style="margin: 5px 0 0 0; font-size: 12px;">Use o código PIX abaixo para pagamento</p>
            </div>
        `;
    }

    async generateQRWithLibrary(pixCode, qrCodeElement, size) {
        console.log('🔍 [PAYMENT-MODAL] Verificando QRCode.js (método do amigo):');
        console.log('  - typeof QRCode:', typeof QRCode);
        console.log('  - pixCode:', pixCode ? pixCode.substring(0, 50) + '...' : 'N/A');
        
        if (typeof QRCode !== 'undefined') {
            console.log('✅ [PAYMENT-MODAL] QRCode.js disponível! Usando método direto...');
            try {
                // 🔥 MÉTODO DO SEU AMIGO: QRCode.toCanvas DIRETO no elemento DOM
                await QRCode.toCanvas(qrCodeElement, pixCode, {
                    width: size,
                    height: size,
                    margin: 2,
                    color: {
                        dark: '#333333',
                        light: '#FFFFFF'
                    }
                });
                console.log('✅ [PAYMENT-MODAL] QR Code gerado com QRCode.js (método direto)');
                return;
            } catch (error) {
                console.error('❌ [PAYMENT-MODAL] Erro com QRCode.js:', error);
            }
        } else {
            console.warn('⚠️ [PAYMENT-MODAL] QRCode.js NÃO DISPONÍVEL');
        }
        
        // Fallback para API externa (método do amigo)
        console.log('🔄 [PAYMENT-MODAL] Usando fallback simples...');
        const img = document.createElement('img');
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(pixCode)}`;
        img.alt = 'QR Code PIX';
        img.style.maxWidth = `${size}px`;
        img.style.height = 'auto';
        img.style.border = '2px solid #ddd';
        img.style.borderRadius = '8px';
        
        img.onload = () => {
            console.log('✅ [PAYMENT-MODAL] QR Code gerado com API fallback');
        };
        
        img.onerror = () => {
            console.error('❌ [PAYMENT-MODAL] Falha total na geração de QR Code');
            qrCodeElement.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">QR Code indisponível<br><small>Use o código PIX abaixo</small></div>';
        };
        
        qrCodeElement.appendChild(img);
    }

    async waitForQRCode() {
        return new Promise((resolve) => {
            if (typeof QRCode !== 'undefined') {
                resolve();
                return;
            }

            // Aguardar evento de QRCode pronto
            const handleQRCodeReady = () => {
                window.removeEventListener('qrcode-ready', handleQRCodeReady);
                resolve();
            };

            window.addEventListener('qrcode-ready', handleQRCodeReady);

            // Timeout de segurança
            setTimeout(() => {
                window.removeEventListener('qrcode-ready', handleQRCodeReady);
                resolve();
            }, 5000);
        });
    }

    generateFallbackQR(pixCode, qrCodeElement, size) {
        if (!qrCodeElement) return;
        
        qrCodeElement.innerHTML = '';
        
        // Tentar múltiplas APIs de QR code para maior confiabilidade
        const qrApis = [
            `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(pixCode)}&format=png&ecc=M`,
            `https://quickchart.io/qr?text=${encodeURIComponent(pixCode)}&size=${size}&format=png`,
            `https://chart.googleapis.com/chart?chs=${size}x${size}&cht=qr&chl=${encodeURIComponent(pixCode)}&choe=UTF-8`,
            `https://api.qrcode-monkey.com/qr/custom?data=${encodeURIComponent(pixCode)}&size=${size}&file=png`,
            `https://qr-generator.qrcode.studio/qr/create?size=${size}&data=${encodeURIComponent(pixCode)}`
        ];
        
        let currentApiIndex = 0;
        
        const tryLoadQR = () => {
            if (currentApiIndex >= qrApis.length) {
                console.error('❌ Todas as APIs de QR code falharam');
                qrCodeElement.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">QR Code indisponível<br><small>Use o código PIX abaixo</small></div>';
                return;
            }
            
            const img = document.createElement('img');
            img.src = qrApis[currentApiIndex];
            img.alt = 'QR Code PIX';
            img.style.maxWidth = `${size}px`;
            img.style.height = 'auto';
            img.style.border = '2px solid #ddd';
            img.style.borderRadius = '8px';
            
            img.onload = () => {
                console.log(`✅ QR Code gerado com API fallback ${currentApiIndex + 1}`);
                qrCodeElement.appendChild(img);
            };
            
            img.onerror = () => {
                console.warn(`⚠️ API ${currentApiIndex + 1} falhou, tentando próxima...`);
                currentApiIndex++;
                tryLoadQR();
            };
        };
        
        tryLoadQR();
    }

    copyPixCode() {
        const pixCodeElement = document.getElementById('paymentPixCode');
        if (pixCodeElement) {
            const pixCode = pixCodeElement.textContent.trim();

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(pixCode).then(() => {
                    this.showCopyFeedback();
                }).catch(err => {
                    console.error('Erro ao copiar:', err);
                    this.fallbackCopy(pixCode);
                });
            } else {
                this.fallbackCopy(pixCode);
            }
        }
    }

    fallbackCopy(text) {
        // Método alternativo para copiar
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            document.execCommand('copy');
            this.showCopyFeedback();
        } catch (err) {
            console.error('Erro ao copiar:', err);
            alert('Código PIX: ' + text);
        }

        document.body.removeChild(textArea);
    }

    showCopyFeedback() {
        const copyBtn = document.getElementById('paymentCopyButton');
        if (copyBtn) {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'COPIADO!';
            copyBtn.style.background = 'linear-gradient(45deg, #28a745, #20c997)';

            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.style.background = 'linear-gradient(45deg, #F58170, #F9AF77)';
            }, 2000);
        }

        this.showMiniToast('Código PIX copiado!');
    }

    showMiniToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(-100%);
            background: linear-gradient(45deg, #28a745, #20c997);
            color: white;
            padding: 10px 20px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10001;
            transition: transform 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        toast.textContent = message;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(0)';
        }, 100);

        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(-100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 2000);
    }

    updateStatus(status, message) {
        const statusElement = document.getElementById('paymentStatus');
        const statusText = document.querySelector('.payment-status-text');

        if (statusElement && statusText) {
            // Remover classes de status anteriores
            statusElement.classList.remove('success', 'error');

            // Controlar visibilidade conforme mensagem
            statusElement.style.display = message ? 'block' : 'none';

            // Adicionar nova classe de status
            if (status === 'success') {
                statusElement.classList.add('success');
            } else if (status === 'error') {
                statusElement.classList.add('error');
            }

            statusText.textContent = message;
        }
    }

    startStatusCheck() {
        if (!this.currentTransaction) {
            return;
        }

        const transactionId = this.currentTransaction.id || this.currentTransaction.identifier || this.currentTransaction.payment_id;
        if (!transactionId) {
            return;
        }

        // Verificar status a cada 5 segundos
        this.statusCheckInterval = setInterval(async () => {
            try {
                const status = await this.checkTransactionStatus(transactionId);

                if (status) {
                    if (status.status === 'paid' || status.status === 'completed') {
                        this.updateStatus('success', 'Pagamento confirmado! ✓');
                        this.stopStatusCheck();

                        // Fechar modal e redirecionar após 3 segundos
                        setTimeout(() => {
                            this.close();
                            this.showToast('Pagamento realizado com sucesso!', 'success');
                            const redirectUrl = (window.APP_CONFIG && window.APP_CONFIG.redirectUrl) || '/compra-aprovada';
                            
                            // 🔥 NOVO: Preservar click_id, valor da compra e parâmetros de tracking durante redirecionamento
                            let finalRedirectUrl = redirectUrl;
                            
                            // Capturar click_id da URL atual
                            const urlParams = new URLSearchParams(window.location.search);
                            const clickId = urlParams.get('click_id') || urlParams.get('kwai_click_id');
                            
                            // 🔥 NOVO: Capturar valor da compra atual
                            const currentAmount = this.amount || this.currentPlan?.valor || 19.98;
                            
                            if (clickId) {
                                console.log('🎯 [PAYMENT-MODAL] Preservando click_id durante redirecionamento:', clickId);
                                
                                // Adicionar click_id à URL de redirecionamento
                                const separator = finalRedirectUrl.includes('?') ? '&' : '?';
                                finalRedirectUrl = `${finalRedirectUrl}${separator}click_id=${encodeURIComponent(clickId)}`;
                                
                                // 🔥 NOVO: Adicionar valor da compra à URL
                                finalRedirectUrl += `&value=${encodeURIComponent(currentAmount)}`;
                                
                                // Preservar outros parâmetros de tracking importantes
                                const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
                                trackingParams.forEach(param => {
                                    const value = urlParams.get(param);
                                    if (value) {
                                        finalRedirectUrl += `&${param}=${encodeURIComponent(value)}`;
                                    }
                                });
                            } else {
                                // 🔥 NOVO: Mesmo sem click_id, incluir valor da compra
                                const separator = finalRedirectUrl.includes('?') ? '&' : '?';
                                finalRedirectUrl = `${finalRedirectUrl}${separator}value=${encodeURIComponent(currentAmount)}`;
                            }
                            
                            // 🔥 NOVO: Log para debug da configuração
                            console.log('🎯 [PAYMENT-MODAL] Configuração de redirecionamento:', {
                              hasAppConfig: !!window.APP_CONFIG,
                              appConfigRedirectUrl: window.APP_CONFIG?.redirectUrl,
                              baseRedirectUrl: redirectUrl,
                              clickId: clickId,
                              finalRedirectUrl: finalRedirectUrl
                            });
                            
                            window.location.href = finalRedirectUrl;
                        }, 3000);

                    } else if (status.status === 'expired' || status.status === 'cancelled') {
                        this.updateStatus('error', 'Pagamento expirado ou cancelado');
                        this.stopStatusCheck();
                    }
                }
            } catch (error) {
                console.error('Erro ao verificar status:', error);
            }
        }, 5000);
    }

    async checkTransactionStatus(transactionId) {
        if (!transactionId) {
            return null;
        }

        try {
            const response = await fetch(`/api/payments/${transactionId}/status`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const result = await response.json();
            const data = result.data ? (result.data.data || result.data) : null;
            return data;
        } catch (error) {
            console.error('Erro ao consultar status da transação:', error);
            return null;
        }
    }

    stopStatusCheck() {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
            this.statusCheckInterval = null;
        }
    }

    close() {
        if (this.overlay) {
            this.overlay.classList.remove('show');
        }
        this.isOpen = false;
        this.stopStatusCheck();
    }

    formatCurrency(amount) {
        // Aceitar números em string com vírgula
        let value = typeof amount === 'string'
            ? parseFloat(amount.replace(',', '.'))
            : amount;

        if (isNaN(value)) value = 0;

        // Se o valor possui casas decimais, assume que já está em reais
        // Caso contrário, trata como centavos
        if (Number.isInteger(value)) {
            value = value / 100;
        }

        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    }

    showToast(message, type = 'info') {
        // Usar SweetAlert se disponível
        if (typeof swal !== 'undefined') {
            try {
                swal({
                    title: message,
                    icon: type === 'success' ? 'success' : type === 'error' ? 'error' : 'info',
                    timer: 3000,
                    buttons: false
                }).then((result) => {
                    // Verificar se result existe antes de tentar acessar propriedades
                    if (result && typeof result === 'object' && 'value' in result) {
                        // Processar resultado se necessário
                        console.log('Toast result:', result.value);
                    } else {
                        // SweetAlert pode retornar undefined em alguns casos
                        console.log('Toast completed without result value');
                    }
                }).catch((error) => {
                    // Capturar erros do SweetAlert
                    console.warn('SweetAlert toast error:', error);
                });
            } catch (error) {
                console.warn('Erro ao inicializar SweetAlert:', error);
                // Fallback para toast nativo
                this.showNativeToast(message, type);
            }
        } else {
            // Fallback para toast nativo
            this.showNativeToast(message, type);
        }
    }

    showNativeToast(message, type = 'info') {
        // Criar toast nativo como alternativa
        const toast = document.createElement('div');
        toast.className = `payment-toast payment-toast-${type}`;
        toast.innerHTML = `
            <div class="payment-toast-content">
                <span class="payment-toast-icon">
                    ${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}
                </span>
                <span class="payment-toast-message">${message}</span>
            </div>
        `;
        
        // Adicionar estilos inline
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transform: translateX(100%);
            transition: transform 0.3s ease;
            max-width: 300px;
            background: ${type === 'success' ? 'linear-gradient(45deg, #28a745, #20c997)' : 
                       type === 'error' ? 'linear-gradient(45deg, #dc3545, #c82333)' : 
                       'linear-gradient(45deg, #17a2b8, #138496)'};
        `;
        
        document.body.appendChild(toast);
        
        // Animar entrada
        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
        }, 100);
        
        // Remover após 3 segundos
        setTimeout(() => {
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }
}

// Instância global do modal de pagamento
window.PaymentModal = new PaymentModal();

// 🔧 DEBUG: Função para testar QRCode.js no console
window.testQRCode = function() {
    console.log('🧪 [DEBUG] Testando QRCode.js...');
    console.log('  - typeof QRCode:', typeof QRCode);
    console.log('  - QRCode disponível:', typeof QRCode !== 'undefined');
    
    if (typeof QRCode !== 'undefined') {
        console.log('  - QRCode.toCanvas:', typeof QRCode.toCanvas);
        console.log('  - QRCode.toDataURL:', typeof QRCode.toDataURL);
        
        // Teste prático
        const testDiv = document.createElement('div');
        testDiv.id = 'qr-test';
        testDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            background: white;
            border: 2px solid #333;
            padding: 10px;
            border-radius: 8px;
        `;
        
        const canvas = document.createElement('canvas');
        testDiv.appendChild(canvas);
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Fechar';
        closeBtn.onclick = () => testDiv.remove();
        testDiv.appendChild(closeBtn);
        
        document.body.appendChild(testDiv);
        
        QRCode.toCanvas(canvas, 'Teste QRCode.js', { width: 150, margin: 1 })
            .then(() => {
                console.log('✅ [DEBUG] QRCode.js funcionando perfeitamente!');
            })
            .catch(error => {
                console.error('❌ [DEBUG] QRCode.js com erro:', error);
            });
    } else {
        console.error('❌ [DEBUG] QRCode.js não está carregado!');
    }
};

// Função para abrir o modal de pagamento
window.showPaymentModal = function(transactionData) {
    if (window.PaymentModal) {
        window.PaymentModal.show(transactionData);
    } else {
        console.error('PaymentModal não está disponível');
    }
};

// Integração com SyncPay - aguardar carregamento completo
document.addEventListener('DOMContentLoaded', function() {
    // Aguardar um pouco para garantir que SyncPayIntegration foi carregado
    setTimeout(() => {
        if (window.SyncPayIntegration) {
            // Sobrescrever a função createCashIn para mostrar o modal
            const originalCreateCashIn = window.SyncPayIntegration.createCashIn;
            
            if (originalCreateCashIn) {
                window.SyncPayIntegration.createCashIn = async function(cashInData) {
                    try {
                        const result = await originalCreateCashIn.call(this, cashInData);
                        
                        // Mostrar modal de pagamento após sucesso
                        if (result && (result.pix_qr_code || result.pix_copy_paste)) {
                            setTimeout(() => {
                                window.showPaymentModal({
                                    ...result,
                                    amount: cashInData.amount
                                });
                            }, 500);
                        }
                        
                        return result;
                    } catch (error) {
                        console.error('Erro no cash-in:', error);
                        throw error;
                    }
                };
            }
        }
    }, 1000);
});