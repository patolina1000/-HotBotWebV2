// Dashboard WhatsApp - Frontend JavaScript

class WhatsAppDashboard {
    constructor() {
        this.init();
    }

    init() {
        this.setupEventListeners();
        
        // Aguarda um pouco para garantir que o DOM esteja pronto
        setTimeout(() => {
            this.loadStatus();
        }, 100);
        
        // Recarrega os dados a cada 30 segundos
        setInterval(() => {
            this.loadStatus();
        }, 30000);

        // Carrega estatísticas de tokens
        this.loadTokenStats();
    }

    setupEventListeners() {
        const form = document.getElementById('zapForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveConfiguration();
            });
        }

        // Event listeners para os botões de toggle zap
        const btnToggleZap1 = document.getElementById('btnToggleZap1');
        if (btnToggleZap1) {
            btnToggleZap1.addEventListener('click', () => {
                this.toggleZap('zap1');
            });
        }

        const btnToggleZap2 = document.getElementById('btnToggleZap2');
        if (btnToggleZap2) {
            btnToggleZap2.addEventListener('click', () => {
                this.toggleZap('zap2');
            });
        }

        // Event listeners para tokens
        const tokenForm = document.getElementById('tokenForm');
        if (tokenForm) {
            tokenForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.generateToken();
            });
        }

        const copyUrlBtn = document.getElementById('copyUrlBtn');
        if (copyUrlBtn) {
            copyUrlBtn.addEventListener('click', () => {
                this.copyUrl();
            });
        }
    }

    async loadStatus() {
        try {
            const response = await fetch('/api/status');
            if (!response.ok) {
                throw new Error('Erro ao carregar status');
            }
            
            const data = await response.json();
            this.updateUI(data);
        } catch (error) {
            console.error('Erro ao carregar status:', error);
            this.showMessage('Erro ao carregar dados do servidor', 'error');
        }
    }

    updateUI(data) {
        // Atualiza o próximo zap com o número real
        const nextZap = data.ultimo_zap_usado === 'zap1' ? data.zap2_numero : data.zap1_numero;
        const nextZapElement = document.getElementById('nextZap');
        if (nextZapElement) {
            nextZapElement.textContent = nextZap || 'Carregando...';
        }
        
        // Atualiza os títulos dos cards com os números reais
        const titleZap1Element = document.getElementById('titleZap1');
        if (titleZap1Element) {
            titleZap1Element.textContent = `Leads do número: ${data.zap1_numero || 'Carregando...'}`;
        }
        
        const titleZap2Element = document.getElementById('titleZap2');
        if (titleZap2Element) {
            titleZap2Element.textContent = `Leads do número: ${data.zap2_numero || 'Carregando...'}`;
        }
        
        // Atualiza os contadores de leads
        const leadsZap1Element = document.getElementById('leadsZap1');
        if (leadsZap1Element) {
            leadsZap1Element.textContent = data.leads_zap1 || 0;
        }
        
        const leadsZap2Element = document.getElementById('leadsZap2');
        if (leadsZap2Element) {
            leadsZap2Element.textContent = data.leads_zap2 || 0;
        }
        
        // Atualiza os campos do formulário
        const zap1Element = document.getElementById('zap1_numero');
        if (zap1Element) {
            zap1Element.value = data.zap1_numero || '';
        }
        
        const zap2Element = document.getElementById('zap2_numero');
        if (zap2Element) {
            zap2Element.value = data.zap2_numero || '';
        }
        
        // Atualiza o histórico
        this.updateHistorico(data.historico || []);

        // Atualiza o status dos zaps
        this.updateZapStatus(data);
    }

    async saveConfiguration() {
        const saveBtn = document.getElementById('saveBtn');
        const loading = document.getElementById('loading');
        const message = document.getElementById('message');
        
        // Valida os campos
        const zap1Element = document.getElementById('zap1_numero');
        const zap2Element = document.getElementById('zap2_numero');
        
        if (!zap1Element || !zap2Element) {
            this.showMessage('Elementos do formulário não encontrados', 'error');
            return;
        }
        
        const zap1 = zap1Element.value.trim();
        const zap2 = zap2Element.value.trim();
        
        if (!zap1 || !zap2) {
            this.showMessage('Por favor, preencha todos os campos', 'error');
            return;
        }
        
        // Valida formato dos números (deve ter pelo menos 10 dígitos)
        if (zap1.length < 10 || zap2.length < 10) {
            this.showMessage('Os números devem ter pelo menos 10 dígitos', 'error');
            return;
        }
        
        // Mostra loading
        if (saveBtn) saveBtn.disabled = true;
        if (loading) loading.style.display = 'block';
        if (message) message.style.display = 'none';
        
        try {
            const response = await fetch('/api/atualizar-zaps', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    zap1_numero: zap1,
                    zap2_numero: zap2
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Erro ao salvar configurações');
            }
            
            const result = await response.json();
            this.showMessage('Configurações salvas com sucesso!', 'success');
            
            // Recarrega os dados após salvar
            setTimeout(() => {
                this.loadStatus();
            }, 1000);
            
        } catch (error) {
            console.error('Erro ao salvar:', error);
            this.showMessage(error.message || 'Erro ao salvar configurações', 'error');
        } finally {
            // Esconde loading
            if (saveBtn) saveBtn.disabled = false;
            if (loading) loading.style.display = 'none';
        }
    }

    updateHistorico(historico) {
        const tbody = document.getElementById('historicoTableBody');
        if (!tbody) return;
        
        // Limpa o conteúdo atual
        tbody.innerHTML = '';
        
        if (!historico || historico.length === 0) {
            // Mostra mensagem de "nenhum histórico"
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="3" class="no-data">Nenhum histórico disponível</td>';
            tbody.appendChild(row);
            return;
        }
        
        // Adiciona cada item do histórico
        historico.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.numero || 'N/A'}</td>
                <td>${item.tipo || 'N/A'}</td>
                <td>${item.leads || 0}</td>
            `;
            tbody.appendChild(row);
        });
    }

    updateZapStatus(data) {
        // Atualiza status do Zap1
        const statusBadgeZap1 = document.getElementById('statusBadgeZap1');
        const btnToggleZap1 = document.getElementById('btnToggleZap1');
        const formGroupZap1 = document.getElementById('formGroupZap1');
        const inputZap1 = document.getElementById('zap1_numero');

        if (statusBadgeZap1 && btnToggleZap1 && formGroupZap1 && inputZap1) {
            const isAtivo = data.ativo_zap1 !== false;
            
            if (isAtivo) {
                // Zap ativo
                statusBadgeZap1.className = 'status-badge ativo';
                statusBadgeZap1.innerHTML = '<span class="status-icon">✅</span><span>Ativo</span>';
                btnToggleZap1.className = 'btn-toggle desativar';
                btnToggleZap1.textContent = 'Desativar';
                formGroupZap1.classList.remove('disabled');
                inputZap1.disabled = false;
            } else {
                // Zap inativo
                statusBadgeZap1.className = 'status-badge inativo';
                statusBadgeZap1.innerHTML = '<span class="status-icon">❌</span><span>Fechado</span>';
                btnToggleZap1.className = 'btn-toggle ativar';
                btnToggleZap1.textContent = 'Ativar';
                formGroupZap1.classList.add('disabled');
                inputZap1.disabled = true;
            }
        }

        // Atualiza status do Zap2
        const statusBadgeZap2 = document.getElementById('statusBadgeZap2');
        const btnToggleZap2 = document.getElementById('btnToggleZap2');
        const formGroupZap2 = document.getElementById('formGroupZap2');
        const inputZap2 = document.getElementById('zap2_numero');

        if (statusBadgeZap2 && btnToggleZap2 && formGroupZap2 && inputZap2) {
            const isAtivo = data.ativo_zap2 !== false;
            
            if (isAtivo) {
                // Zap ativo
                statusBadgeZap2.className = 'status-badge ativo';
                statusBadgeZap2.innerHTML = '<span class="status-icon">✅</span><span>Ativo</span>';
                btnToggleZap2.className = 'btn-toggle desativar';
                btnToggleZap2.textContent = 'Desativar';
                formGroupZap2.classList.remove('disabled');
                inputZap2.disabled = false;
            } else {
                // Zap inativo
                statusBadgeZap2.className = 'status-badge inativo';
                statusBadgeZap2.innerHTML = '<span class="status-icon">❌</span><span>Fechado</span>';
                btnToggleZap2.className = 'btn-toggle ativar';
                btnToggleZap2.textContent = 'Ativar';
                formGroupZap2.classList.add('disabled');
                inputZap2.disabled = true;
            }
        }
    }

    async toggleZap(zapNumber) {
        // Determina a ação baseada no estado atual
        const statusBadge = document.getElementById(`statusBadge${zapNumber.charAt(0).toUpperCase() + zapNumber.slice(1)}`);
        const isAtivo = statusBadge && statusBadge.classList.contains('ativo');
        const action = isAtivo ? 'desativar' : 'ativar';
        
        if (!confirm(`Tem certeza que deseja ${action} o ${zapNumber.toUpperCase()}?`)) {
            return;
        }

        try {
            const response = await fetch('/api/toggle-zap', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    zap: zapNumber
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erro ao ${action} zap`);
            }

            const result = await response.json();
            this.showMessage(result.message || `${zapNumber.toUpperCase()} ${action === 'ativar' ? 'ativado' : 'desativado'} com sucesso!`, 'success');
            
            // Recarrega os dados após toggle
            setTimeout(() => {
                this.loadStatus();
            }, 1000);

        } catch (error) {
            console.error(`Erro ao ${action} zap:`, error);
            this.showMessage(error.message || `Erro ao ${action} zap`, 'error');
        }
    }

    showMessage(text, type) {
        const message = document.getElementById('message');
        if (message) {
            message.textContent = text;
            message.className = `message ${type}`;
            message.style.display = 'block';
            
            // Esconde a mensagem após 5 segundos
            setTimeout(() => {
                if (message) {
                    message.style.display = 'none';
                }
            }, 5000);
        }
    }

    // ====== MÉTODOS PARA TOKENS ======

    async loadTokenStats() {
        try {
            const response = await fetch('/api/whatsapp/estatisticas');
            if (!response.ok) {
                throw new Error('Erro ao carregar estatísticas de tokens');
            }
            
            const data = await response.json();
            if (data.sucesso) {
                this.updateTokenStats(data.estatisticas);
            }
        } catch (error) {
            console.error('Erro ao carregar estatísticas de tokens:', error);
        }
    }

    updateTokenStats(stats) {
        const totalTokensEl = document.getElementById('totalTokens');
        const tokensUsadosEl = document.getElementById('tokensUsados');
        const valorTotalEl = document.getElementById('valorTotal');
        const tokensHojeEl = document.getElementById('tokensHoje');

        if (totalTokensEl) totalTokensEl.textContent = stats.total_tokens || 0;
        if (tokensUsadosEl) tokensUsadosEl.textContent = stats.tokens_usados || 0;
        if (valorTotalEl) valorTotalEl.textContent = `R$ ${(stats.valor_total || 0).toFixed(2).replace('.', ',')}`;
        if (tokensHojeEl) tokensHojeEl.textContent = stats.tokens_hoje || 0;
    }

    async generateToken() {
        const tokenBtn = document.getElementById('tokenBtn');
        const tokenLoading = document.getElementById('tokenLoading');
        const tokenMessage = document.getElementById('tokenMessage');
        const tokenResult = document.getElementById('tokenResult');
        
        // Valida os campos
        const valorEl = document.getElementById('tokenValor');
        const descricaoEl = document.getElementById('tokenDescricao');
        
        if (!valorEl) {
            this.showTokenMessage('Campo de valor não encontrado', 'error');
            return;
        }
        
        const valor = parseFloat(valorEl.value);
        const descricao = descricaoEl ? descricaoEl.value.trim() : '';
        
        if (isNaN(valor) || valor <= 0) {
            this.showTokenMessage('Por favor, insira um valor válido', 'error');
            return;
        }
        
        // Mostra loading
        if (tokenBtn) tokenBtn.disabled = true;
        if (tokenLoading) tokenLoading.style.display = 'block';
        if (tokenMessage) tokenMessage.style.display = 'none';
        if (tokenResult) tokenResult.style.display = 'none';
        
        try {
            const response = await fetch('/api/whatsapp/gerar-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    valor: valor,
                    descricao: descricao
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.erro || 'Erro ao gerar token');
            }
            
            const result = await response.json();
            
            if (result.sucesso) {
                // Mostra o resultado
                this.showTokenResult(result);
                this.showTokenMessage('Token gerado com sucesso!', 'success');
                
                // Limpa o formulário
                valorEl.value = '';
                if (descricaoEl) descricaoEl.value = '';
                
                // Recarrega as estatísticas
                this.loadTokenStats();
            } else {
                throw new Error(result.erro || 'Erro ao gerar token');
            }
            
        } catch (error) {
            console.error('Erro ao gerar token:', error);
            this.showTokenMessage(error.message || 'Erro ao gerar token', 'error');
        } finally {
            // Esconde loading
            if (tokenBtn) tokenBtn.disabled = false;
            if (tokenLoading) tokenLoading.style.display = 'none';
        }
    }

    showTokenResult(result) {
        const tokenResult = document.getElementById('tokenResult');
        const generatedUrl = document.getElementById('generatedUrl');
        const generatedToken = document.getElementById('generatedToken');

        if (tokenResult && generatedUrl && generatedToken) {
            generatedUrl.value = result.url;
            generatedToken.textContent = result.token;
            tokenResult.style.display = 'block';
        }
    }

    showTokenMessage(text, type) {
        const message = document.getElementById('tokenMessage');
        if (message) {
            message.textContent = text;
            message.className = `message ${type}`;
            message.style.display = 'block';
            
            // Esconde a mensagem após 5 segundos
            setTimeout(() => {
                if (message) {
                    message.style.display = 'none';
                }
            }, 5000);
        }
    }

    copyUrl() {
        const urlInput = document.getElementById('generatedUrl');
        if (urlInput) {
            urlInput.select();
            urlInput.setSelectionRange(0, 99999); // Para mobile
            
            try {
                document.execCommand('copy');
                this.showTokenMessage('URL copiada para a área de transferência!', 'success');
            } catch (err) {
                // Fallback para navegadores modernos
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(urlInput.value).then(() => {
                        this.showTokenMessage('URL copiada para a área de transferência!', 'success');
                    }).catch(() => {
                        this.showTokenMessage('Erro ao copiar URL', 'error');
                    });
                } else {
                    this.showTokenMessage('Erro ao copiar URL', 'error');
                }
            }
        }
    }
}

// Inicializa o dashboard quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
    new WhatsAppDashboard();
});
