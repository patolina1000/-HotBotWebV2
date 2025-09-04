/**
 * POPUP PIX ALTERNATIVO
 * Sistema de popup robusto que não depende de bibliotecas externas
 * Implementação alternativa caso o SweetAlert falhe
 */

class PixPopupAlternative {
    constructor() {
        this.isOpen = false;
        this.currentData = null;
        // Manter referência do handler para poder remover o listener
        this.handleKeyDownBound = this.handleKeyDown.bind(this);
        this.init();
    }

    init() {
        // Adicionar estilos CSS dinamicamente
        this.addStyles();
    }

    addStyles() {
        // Verificar se os estilos já foram adicionados
        if (document.getElementById('pix-popup-styles')) {
            return;
        }

        const styles = document.createElement('style');
        styles.id = 'pix-popup-styles';
        styles.textContent = `
            .pix-popup-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                box-sizing: border-box;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
            }

            .pix-popup-overlay.show {
                opacity: 1;
                visibility: visible;
            }

            .pix-popup {
                background: white;
                border-radius: 20px;
                padding: 0;
                max-width: 500px;
                width: 90%;
                max-height: 90vh;
                overflow-y: auto;
                transform: scale(0.8);
                transition: transform 0.3s ease;
                color: #333;
                position: relative;
                margin: auto;
                box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4);
            }

            /* Tamanho maior apenas para PC/Desktop */
            @media (min-width: 769px) {
                .pix-popup {
                    max-width: 550px;
                    width: 80%;
                }
            }

            .pix-popup-overlay.show .pix-popup {
                transform: scale(1);
            }

            .pix-popup-header {
                background-image: url('/images/banner.jpg');
                background-size: cover;
                background-position: center;
                padding: 20px;
                border-radius: 20px 20px 0 0;
                position: relative;
                height: 140px;
                display: flex;
                align-items: flex-end;
            }

            .pix-popup-header::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.6) 100%);
                border-radius: 20px 20px 0 0;
            }

            .pix-popup-close {
                position: absolute;
                top: 15px;
                right: 15px;
                background: rgba(255, 255, 255, 0.9);
                border: none;
                color: #333;
                font-size: 18px;
                cursor: pointer;
                width: 35px;
                height: 35px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: all 0.2s;
                z-index: 2;
            }

            .pix-popup-close:hover {
                background: white;
                transform: scale(1.1);
            }

            .pix-popup-profile {
                display: flex;
                align-items: center;
                gap: 15px;
                margin-right: 40px;
                position: relative;
                z-index: 1;
            }

            .pix-popup-avatar {
                width: 70px;
                height: 70px;
                border-radius: 50%;
                overflow: hidden;
                border: 4px solid white;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            }

            .pix-popup-avatar img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .pix-popup-info h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 700;
                color: white;
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
            }

            .pix-popup-info p {
                margin: 2px 0 0 0;
                color: rgba(255, 255, 255, 0.9);
                font-size: 14px;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
            }

            .pix-popup-body {
                padding: 25px;
            }

            .pix-popup-benefits {
                margin-bottom: 20px;
            }

            .pix-popup-benefits h4 {
                color: #333;
                margin: 0 0 8px 0;
                font-size: 18px;
                font-weight: 600;
                text-align: left;
            }

            .pix-popup-benefits ul {
                list-style: none;
                padding: 0;
                margin: 0;
            }

            .pix-popup-benefits li {
                padding: 1px 0;
                padding-left: 25px;
                position: relative;
                font-size: 16px;
                color: #666;
                line-height: 1.2;
            }

            .pix-popup-benefits li:before {
                content: '✓';
                position: absolute;
                left: 0;
                color: #F58170;
                font-weight: bold;
                font-size: 16px;
            }

            .pix-popup-plan {
                text-align: left;
                margin-bottom: 25px;
                padding: 20px;
                background: #f8f9fa;
                border-radius: 15px;
            }

            .pix-popup-plan-label {
                color: #333;
                font-size: 16px;
                font-weight: 600;
                margin: 0 0 5px 0;
                text-transform: none;
                letter-spacing: normal;
            }

            .pix-popup-plan-duration {
                color: #666;
                font-size: 14px;
                margin: 0 0 10px 0;
            }

            .pix-popup-plan-price {
                color: #333;
                font-size: 14px;
                font-weight: 700;
                margin: 0;
            }

            .pix-popup-pix {
                margin-bottom: 20px;
            }

            .pix-popup-pix-label {
                color: #333;
                font-size: 14px;
                font-weight: 600;
                margin: 0 0 15px 0;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                text-align: left;
            }

            .pix-popup-pix-code {
                background: #f8f9fa;
                border: 2px solid #eee;
                border-radius: 10px;
                padding: 15px;
                margin-bottom: 15px;
                font-family: 'Courier New', monospace;
                font-size: 16.8px;
                word-break: break-all;
                color: #666;
                line-height: 1.4;
            }

            .pix-popup-copy-button {
                width: 100%;
                background: linear-gradient(45deg, #F58170, #F9AF77);
                color: white;
                border: none;
                padding: 15px;
                border-radius: 10px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 14px;
                letter-spacing: 0.5px;
            }

            .pix-popup-copy-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(245, 129, 112, 0.4);
            }

            .pix-popup-copy-button:active {
                transform: translateY(0);
            }

            .pix-popup-qr-container {
                text-align: center;
                margin: 20px 0;
                padding: 20px;
                background: white;
                border: 2px solid #eee;
                border-radius: 15px;
                box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            }

            .pix-popup-qr-code {
                display: inline-block;
                padding: 15px;
                background: white;
                border-radius: 10px;
            }

            .pix-popup-status {
                text-align: center;
                padding: 15px;
                border-radius: 10px;
                background: rgba(23, 162, 184, 0.1);
                border: 1px solid rgba(23, 162, 184, 0.3);
            }

            .pix-popup-status.success {
                background: rgba(40, 167, 69, 0.1);
                border-color: rgba(40, 167, 69, 0.3);
            }

            .pix-popup-status.error {
                background: rgba(220, 53, 69, 0.1);
                border-color: rgba(220, 53, 69, 0.3);
            }

            .pix-popup-status-text {
                margin: 0;
                font-size: 14px;
                color: #17a2b8;
            }

            .pix-popup-status.success .pix-popup-status-text {
                color: #28a745;
            }

            .pix-popup-status.error .pix-popup-status-text {
                color: #dc3545;
            }

            @media (max-width: 768px) {
                .pix-popup {
                    width: 95%;
                    margin: 20px;
                }
                
                .pix-popup-header {
                    height: 100px;
                    padding: 15px;
                }
                
                .pix-popup-avatar {
                    width: 50px;
                    height: 50px;
                }
                
                .pix-popup-info h3 {
                    font-size: 16px;
                }
                
                .pix-popup-body {
                    padding: 20px;
                }

                .pix-popup-plan-price {
                    font-size: 12px;
                }

                .pix-popup-qr-container {
                    display: none;
                }
            }

            @media (max-width: 480px) {
                .pix-popup {
                    width: 98%;
                    margin: 10px;
                }
                
                .pix-popup-header {
                    height: 80px;
                    padding: 10px;
                }
                
                .pix-popup-profile {
                    gap: 10px;
                }
                
                .pix-popup-avatar {
                    width: 45px;
                    height: 45px;
                }
                
                .pix-popup-info h3 {
                    font-size: 15px;
                }

                .pix-popup-body {
                    padding: 15px;
                }
            }
        `;

        document.head.appendChild(styles);
    }

    show(data) {
        if (!data) {
            console.error('Dados do PIX são obrigatórios');
            return;
        }

        this.currentData = data;
        this.createModal(data);
        this.isOpen = true;
    }

    createModal(data) {
        // Remover modal anterior se existir
        this.close();

        // Criar overlay
        const overlay = document.createElement('div');
        overlay.className = 'pix-popup-overlay';
        overlay.id = 'pixPopupOverlay';

        // Criar modal
        const modal = document.createElement('div');
        modal.className = 'pix-popup';
        modal.id = 'pixPopup';

        const pixCode = data.pix_code || data.pix_qr_code || data.pix_copy_paste || 'Código não disponível';
        const amount = data.amount || 0;
        const formattedPrice = this.formatCurrency(amount);

        modal.innerHTML = `
            <div class="pix-popup-header">
                <button class="pix-popup-close" onclick="window.PixPopupAlternative.close()">
                    ×
                </button>
                <div class="pix-popup-profile">
                    <div class="pix-popup-avatar">
                        <img src="/images/perfil.jpg" alt="Perfil" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMzAiIGZpbGw9IiNGNTgxNzAiLz4KPHN2ZyB4PSIxNSIgeT0iMTUiIHdpZHRoPSIzMCIgaGVpZ2h0PSIzMCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJ3aGl0ZSI+CjxwYXRoIGQ9Ik0xMiAyQzEzLjEgMiAxNCAyLjkgMTQgNEMxNCA1LjEgMTMuMSA2IDEyIDZDMTAuOSA2IDEwIDUuMSAxMCA0QzEwIDIuOSAxMC45IDIgMTIgMlpNMjEgOVYyMkgxNVYxM0g5VjIySDNWOUgwVjdIMjRWOUgyMVoiLz4KPHN2Zz4KPC9zdmc+'">
                    </div>
                    <div class="pix-popup-info">
                        <h3 class="model-name" data-config="model.name">Hadrielle Maria</h3>
                        <p class="model-handle" data-config="model.handle">@hadriiimaria_</p>
                    </div>
                </div>
            </div>
            
            <div class="pix-popup-body">
                <div class="pix-popup-benefits">
                    <h4>Benefícios Exclusivos</h4>
                    <ul>
                        <li>Acesso ao conteúdo</li>
                        <li>Chat exclusivo com o criador</li>
                        <li>Cancele a qualquer hora</li>
                    </ul>
                </div>
                
                <div class="pix-popup-plan">
                    <p class="pix-popup-plan-label">Formas de pagamento</p>
                    <p class="pix-popup-plan-duration">Valor</p>
                    <p class="pix-popup-plan-price">${formattedPrice}</p>
                </div>
                
                <div class="pix-popup-pix">
                    <p class="pix-popup-pix-label">CHAVE PIX</p>
                    <div class="pix-popup-pix-code" id="pixPopupCode">
                        ${pixCode}
                    </div>
                    <button class="pix-popup-copy-button" onclick="window.PixPopupAlternative.copyPixCode()">
                        COPIAR CHAVE PIX
                    </button>
                </div>
                
                <div class="pix-popup-qr-container" id="pixPopupQRContainer">
                    <div class="pix-popup-qr-code" id="pixPopupQRCode"></div>
                </div>

                <div class="pix-popup-status" id="pixPopupStatus" style="display: none;">
                    <p class="pix-popup-status-text"></p>
                </div>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Mostrar modal com animação
        setTimeout(() => {
            overlay.classList.add('show');
        }, 50);

        // Gerar QR Code se possível
        if (typeof QRCode !== 'undefined' && pixCode !== 'Código não disponível') {
            this.generateQRCode(pixCode);
        }

        // Fechar clicando no overlay
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.close();
            }
        });

        // Fechar com ESC
        document.addEventListener('keydown', this.handleKeyDownBound);
    }

    handleKeyDown(e) {
        if (e.key === 'Escape' && this.isOpen) {
            this.close();
        }
    }

    async generateQRCode(pixCode) {
        try {
            const qrContainer = document.getElementById('pixPopupQRContainer');
            const qrCodeElement = document.getElementById('pixPopupQRCode');

            if (!qrCodeElement) {
                console.warn('⚠️ Elemento QR Code não encontrado');
                return;
            }

            const isMobile = window.innerWidth <= 768;
            if (qrContainer) {
                if (isMobile) {
                    qrContainer.style.display = 'none';
                    return;
                }
                qrContainer.style.display = 'block';
            }

            // Limpar QR Code anterior
            qrCodeElement.innerHTML = '';

            const size = 210; // 30% menor que o original

            // Sempre usar APIs externas para maior confiabilidade
            console.log('🔄 Gerando QR Code com APIs externas para maior confiabilidade');
            this.generateFallbackQR(pixCode, qrCodeElement, size);
        } catch (error) {
            console.error('❌ Erro ao gerar QR Code:', error);
            const qrContainer = document.getElementById('pixPopupQRContainer');
            if (qrContainer) {
                qrContainer.style.display = 'none';
            }
        }
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
        const pixCodeElement = document.getElementById('pixPopupCode');
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
        const copyBtn = document.querySelector('.pix-popup-copy-button');
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

    close() {
        const overlay = document.getElementById('pixPopupOverlay');
        if (overlay) {
            overlay.classList.remove('show');
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 300);
        }
        
        this.isOpen = false;
        document.removeEventListener('keydown', this.handleKeyDownBound);
    }

    formatCurrency(amount) {
        // Converter string com vírgula para número
        let value = typeof amount === 'string'
            ? parseFloat(amount.replace(',', '.'))
            : amount;

        if (isNaN(value)) value = 0;

        // Se for inteiro, assume que está em centavos
        if (Number.isInteger(value)) {
            value = value / 100;
        }

        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    }
}

// Instância global
window.PixPopupAlternative = new PixPopupAlternative();

// Função global para mostrar o popup
window.showPixPopup = function(data) {
    window.PixPopupAlternative.show(data);
};

console.log('🎨 PixPopupAlternative carregado e disponível globalmente');

