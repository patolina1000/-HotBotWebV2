// Dashboard WhatsApp - Frontend JavaScript

class WhatsAppDashboard {
    constructor() {
        this.init();
    }

    init() {
        this.loadStatus();
        this.setupEventListeners();
        
        // Recarrega os dados a cada 30 segundos
        setInterval(() => {
            this.loadStatus();
        }, 30000);
    }

    setupEventListeners() {
        const form = document.getElementById('zapForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveConfiguration();
        });
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
        // Atualiza o próximo zap
        const nextZap = data.ultimo_zap_usado === 'zap1' ? 'Zap2' : 'Zap1';
        document.getElementById('nextZap').textContent = nextZap;
        
        // Atualiza os contadores de leads
        document.getElementById('leadsZap1').textContent = data.leads_zap1 || 0;
        document.getElementById('leadsZap2').textContent = data.leads_zap2 || 0;
        
        // Atualiza os campos do formulário
        document.getElementById('zap1_numero').value = data.zap1_numero || '';
        document.getElementById('zap2_numero').value = data.zap2_numero || '';
    }

    async saveConfiguration() {
        const saveBtn = document.getElementById('saveBtn');
        const loading = document.getElementById('loading');
        const message = document.getElementById('message');
        
        // Valida os campos
        const zap1 = document.getElementById('zap1_numero').value.trim();
        const zap2 = document.getElementById('zap2_numero').value.trim();
        
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
        saveBtn.disabled = true;
        loading.style.display = 'block';
        message.style.display = 'none';
        
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
            saveBtn.disabled = false;
            loading.style.display = 'none';
        }
    }

    showMessage(text, type) {
        const message = document.getElementById('message');
        message.textContent = text;
        message.className = `message ${type}`;
        message.style.display = 'block';
        
        // Esconde a mensagem após 5 segundos
        setTimeout(() => {
            message.style.display = 'none';
        }, 5000);
    }
}

// Inicializa o dashboard quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
    new WhatsAppDashboard();
});
