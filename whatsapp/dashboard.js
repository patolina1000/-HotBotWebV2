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
    }

    setupEventListeners() {
        const form = document.getElementById('zapForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveConfiguration();
            });
        }

        // Event listeners para os botões de fechar zap
        const btnCloseZap1 = document.getElementById('btnCloseZap1');
        if (btnCloseZap1) {
            btnCloseZap1.addEventListener('click', () => {
                this.closeZap('zap1');
            });
        }

        const btnCloseZap2 = document.getElementById('btnCloseZap2');
        if (btnCloseZap2) {
            btnCloseZap2.addEventListener('click', () => {
                this.closeZap('zap2');
            });
        }

        // Event listeners para os botões de reabrir zap
        const btnOpenZap1 = document.getElementById('btnOpenZap1');
        if (btnOpenZap1) {
            btnOpenZap1.addEventListener('click', () => {
                this.openZap('zap1');
            });
        }

        const btnOpenZap2 = document.getElementById('btnOpenZap2');
        if (btnOpenZap2) {
            btnOpenZap2.addEventListener('click', () => {
                this.openZap('zap2');
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
        const statusZap1 = document.getElementById('statusZap1');
        const statusTextZap1 = document.getElementById('statusTextZap1');
        const btnCloseZap1 = document.getElementById('btnCloseZap1');
        const btnOpenZap1 = document.getElementById('btnOpenZap1');
        const formGroupZap1 = document.getElementById('formGroupZap1');
        const inputZap1 = document.getElementById('zap1_numero');

        if (statusZap1 && statusTextZap1 && btnCloseZap1 && btnOpenZap1 && formGroupZap1 && inputZap1) {
            const isAtivo = data.ativo_zap1 !== false;
            
            if (isAtivo) {
                statusZap1.className = 'status-indicator ativo';
                statusTextZap1.textContent = 'Zap1 - Ativo';
                btnCloseZap1.disabled = false;
                btnCloseZap1.style.display = 'flex';
                btnOpenZap1.style.display = 'none';
                formGroupZap1.classList.remove('disabled');
                inputZap1.disabled = false;
            } else {
                statusZap1.className = 'status-indicator inativo';
                statusTextZap1.textContent = 'Zap1 - Fechado';
                btnCloseZap1.style.display = 'none';
                btnOpenZap1.style.display = 'flex';
                formGroupZap1.classList.add('disabled');
                inputZap1.disabled = true;
            }
        }

        // Atualiza status do Zap2
        const statusZap2 = document.getElementById('statusZap2');
        const statusTextZap2 = document.getElementById('statusTextZap2');
        const btnCloseZap2 = document.getElementById('btnCloseZap2');
        const btnOpenZap2 = document.getElementById('btnOpenZap2');
        const formGroupZap2 = document.getElementById('formGroupZap2');
        const inputZap2 = document.getElementById('zap2_numero');

        if (statusZap2 && statusTextZap2 && btnCloseZap2 && btnOpenZap2 && formGroupZap2 && inputZap2) {
            const isAtivo = data.ativo_zap2 !== false;
            
            if (isAtivo) {
                statusZap2.className = 'status-indicator ativo';
                statusTextZap2.textContent = 'Zap2 - Ativo';
                btnCloseZap2.disabled = false;
                btnCloseZap2.style.display = 'flex';
                btnOpenZap2.style.display = 'none';
                formGroupZap2.classList.remove('disabled');
                inputZap2.disabled = false;
            } else {
                statusZap2.className = 'status-indicator inativo';
                statusTextZap2.textContent = 'Zap2 - Fechado';
                btnCloseZap2.style.display = 'none';
                btnOpenZap2.style.display = 'flex';
                formGroupZap2.classList.add('disabled');
                inputZap2.disabled = true;
            }
        }
    }

    async closeZap(zapNumber) {
        if (!confirm(`Tem certeza que deseja fechar o ${zapNumber.toUpperCase()}?`)) {
            return;
        }

        try {
            const response = await fetch('/api/fechar-zap', {
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
                throw new Error(errorData.error || 'Erro ao fechar zap');
            }

            this.showMessage(`${zapNumber.toUpperCase()} fechado com sucesso!`, 'success');
            
            // Recarrega os dados após fechar
            setTimeout(() => {
                this.loadStatus();
            }, 1000);

        } catch (error) {
            console.error('Erro ao fechar zap:', error);
            this.showMessage(error.message || 'Erro ao fechar zap', 'error');
        }
    }

    async openZap(zapNumber) {
        if (!confirm(`Tem certeza que deseja reabrir o ${zapNumber.toUpperCase()}?`)) {
            return;
        }

        try {
            const response = await fetch('/api/abrir-zap', {
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
                throw new Error(errorData.error || 'Erro ao reabrir zap');
            }

            this.showMessage(`${zapNumber.toUpperCase()} reaberto com sucesso!`, 'success');
            
            // Recarrega os dados após reabrir
            setTimeout(() => {
                this.loadStatus();
            }, 1000);

        } catch (error) {
            console.error('Erro ao reabrir zap:', error);
            this.showMessage(error.message || 'Erro ao reabrir zap', 'error');
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
}

// Inicializa o dashboard quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
    new WhatsAppDashboard();
});
