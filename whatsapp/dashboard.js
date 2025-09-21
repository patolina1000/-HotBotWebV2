// Dashboard WhatsApp - Frontend JavaScript

class WhatsAppDashboard {
    constructor() {
        this.adminSecret = null;
        this.init();
    }

    init() {
        this.adminSecret = this.getStoredAdminSecret();
        this.setupEventListeners();

        const loadAllData = () => {
            this.loadStatus();
            this.loadTokenStats();
            this.loadTokenList();
        };

        // Aguarda um pouco para garantir que o DOM esteja pronto
        setTimeout(() => {
            loadAllData();
        }, 100);

        // Recarrega os dados a cada 30 segundos
        setInterval(() => {
            loadAllData();
        }, 30000);

        // Carrega estatísticas e histórico de tokens imediatamente
        this.loadTokenStats();
        this.loadTokenList();
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

        // Event listener para o botão de teste de eventos
        const testEventBtn = document.getElementById('testEventBtn');
        if (testEventBtn) {
            testEventBtn.addEventListener('click', () => {
                this.testWhatsAppEvent();
            });
        }

        const clearTokensBtn = document.getElementById('clearWhatsAppTokensBtn');
        if (clearTokensBtn) {
            clearTokensBtn.addEventListener('click', () => {
                this.clearWhatsAppTokens();
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

    formatCurrency(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) {
            return 'R$ 0,00';
        }

        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
        }).format(number);
    }

    formatPhone(telefone) {
        if (!telefone) {
            return '-';
        }

        const digits = String(telefone).replace(/\D/g, '');
        if (!digits) {
            return '-';
        }

        if (digits.length === 11) {
            return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
        }

        if (digits.length === 10) {
            return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
        }

        if (digits.length > 2) {
            return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
        }

        return telefone;
    }

    formatDateTime(value) {
        if (!value) {
            return null;
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return null;
        }

        try {
            return new Intl.DateTimeFormat('pt-BR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            }).format(date);
        } catch (error) {
            return date.toLocaleString('pt-BR');
        }
    }

    getStatusInfo(token) {
        const statusRaw = typeof token?.status === 'string' ? token.status.trim().toLowerCase() : '';
        const usado = token?.usado === true;

        if (usado || statusRaw === 'usado' || statusRaw === 'utilizado') {
            return { className: 'usado', label: 'Usado' };
        }

        if (statusRaw === 'expirado') {
            return { className: 'expirado', label: 'Expirado' };
        }

        if (statusRaw === 'cancelado') {
            return { className: 'cancelado', label: 'Cancelado' };
        }

        if (statusRaw === 'pendente') {
            return { className: 'pendente', label: 'Pendente' };
        }

        if (statusRaw === 'valido' || statusRaw === 'disponivel' || statusRaw === 'disponível') {
            return { className: 'pendente', label: 'Disponível' };
        }

        return { className: 'pendente', label: 'Disponível' };
    }

    updateLatestTokenDetails(token) {
        const card = document.getElementById('latestTokenCard');
        const valueEl = document.getElementById('latestTokenValue');
        const nameEl = document.getElementById('latestTokenName');
        const phoneEl = document.getElementById('latestTokenPhone');
        const codeEl = document.getElementById('latestTokenCode');
        const statusEl = document.getElementById('latestTokenStatus');
        const updatedAtEl = document.getElementById('latestTokenUpdatedAt');

        if (!valueEl || !nameEl || !phoneEl || !codeEl || !statusEl) {
            return;
        }

        if (!token) {
            valueEl.textContent = '—';
            nameEl.textContent = '—';
            phoneEl.textContent = '—';
            codeEl.textContent = '—';
            statusEl.textContent = '—';
            if (updatedAtEl) {
                updatedAtEl.textContent = 'Sem registros';
            }
            if (card) {
                card.classList.add('empty');
            }

            const generatedValue = document.getElementById('generatedValue');
            if (generatedValue) generatedValue.textContent = '';
            const generatedName = document.getElementById('generatedName');
            if (generatedName) generatedName.textContent = '';
            const generatedPhone = document.getElementById('generatedPhone');
            if (generatedPhone) generatedPhone.textContent = '';
            const generatedToken = document.getElementById('generatedToken');
            if (generatedToken) generatedToken.textContent = '';
            return;
        }

        if (card) {
            card.classList.remove('empty');
        }

        valueEl.textContent = this.formatCurrency(token.valor);
        nameEl.textContent = token.nome || '-';
        phoneEl.textContent = this.formatPhone(token.telefone);
        codeEl.textContent = token.token || '-';

        statusEl.innerHTML = '';
        const statusInfo = this.getStatusInfo(token);
        const statusSpan = document.createElement('span');
        statusSpan.className = `status-pill ${statusInfo.className}`;
        statusSpan.textContent = statusInfo.label;
        statusEl.appendChild(statusSpan);

        if (updatedAtEl) {
            const updatedAt = token.data_uso || token.data_criacao;
            const formatted = this.formatDateTime(updatedAt);
            updatedAtEl.textContent = formatted ? `Atualizado: ${formatted}` : 'Atualização indisponível';
        }

        const generatedValue = document.getElementById('generatedValue');
        if (generatedValue) generatedValue.textContent = this.formatCurrency(token.valor);
        const generatedName = document.getElementById('generatedName');
        if (generatedName) generatedName.textContent = token.nome || '';
        const generatedPhone = document.getElementById('generatedPhone');
        if (generatedPhone) generatedPhone.textContent = this.formatPhone(token.telefone);
        const generatedToken = document.getElementById('generatedToken');
        if (generatedToken) generatedToken.textContent = token.token || '';
    }

    async loadTokenList() {
        const tbody = document.getElementById('tokenListBody');
        if (!tbody) {
            return;
        }

        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="token-table-empty">Carregando tokens...</td>
            </tr>
        `;

        try {
            const response = await fetch('/api/whatsapp/tokens?limit=50');
            if (!response.ok) {
                throw new Error('Erro ao carregar tokens');
            }

            const data = await response.json();
            if (data.sucesso) {
                const tokens = Array.isArray(data.tokens) ? data.tokens : [];
                this.renderTokenList(tokens);

                if (tokens.length > 0) {
                    this.updateLatestTokenDetails(tokens[0]);
                }
            } else {
                this.renderTokenList([], data.erro || 'Nenhum token encontrado');
            }
        } catch (error) {
            console.error('Erro ao carregar lista de tokens:', error);
            this.renderTokenList([], 'Erro ao carregar tokens');
        }
    }

    renderTokenList(tokens, emptyMessage = 'Nenhum token encontrado') {
        const tbody = document.getElementById('tokenListBody');
        if (!tbody) {
            return;
        }

        tbody.innerHTML = '';

        if (!Array.isArray(tokens) || tokens.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 5;
            cell.className = 'token-table-empty';
            cell.textContent = emptyMessage;
            row.appendChild(cell);
            tbody.appendChild(row);
            return;
        }

        tokens.forEach((token) => {
            const row = document.createElement('tr');

            const valorCell = document.createElement('td');
            valorCell.textContent = token.valor === null || token.valor === undefined
                ? '—'
                : this.formatCurrency(token.valor);
            row.appendChild(valorCell);

            const nomeCell = document.createElement('td');
            nomeCell.textContent = token.nome || '-';
            row.appendChild(nomeCell);

            const telefoneCell = document.createElement('td');
            telefoneCell.textContent = this.formatPhone(token.telefone);
            row.appendChild(telefoneCell);

            const tokenCell = document.createElement('td');
            tokenCell.className = 'token-code';
            tokenCell.textContent = token.token || '-';
            row.appendChild(tokenCell);

            const statusCell = document.createElement('td');
            const statusInfo = this.getStatusInfo(token);
            const statusSpan = document.createElement('span');
            statusSpan.className = `status-pill ${statusInfo.className}`;
            statusSpan.textContent = statusInfo.label;
            statusCell.appendChild(statusSpan);
            row.appendChild(statusCell);

            tbody.appendChild(row);
        });
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
                this.updateLatestTokenDetails(data.ultimo_token || null);
            }
        } catch (error) {
            console.error('Erro ao carregar estatísticas de tokens:', error);
        }
    }

    async clearWhatsAppTokens() {
        if (!confirm('Tem certeza que deseja apagar todos os tokens de WhatsApp?')) {
            return;
        }

        const executeRequest = async () => {
            const headers = { Accept: 'application/json' };

            if (this.adminSecret) {
                headers['Authorization'] = `Bearer ${this.adminSecret}`;
            }

            return fetch('/api/whatsapp/limpar-tokens', {
                method: 'DELETE',
                headers
            });
        };

        try {
            if (!this.adminSecret) {
                this.adminSecret = this.getStoredAdminSecret();
            }

            let response = await executeRequest();

            if (response.status === 401 || response.status === 403) {
                const providedSecret = typeof window !== 'undefined' && typeof window.prompt === 'function'
                    ? window.prompt('Informe o ADMIN_SECRET para apagar os tokens:')
                    : null;

                const sanitizedSecret = providedSecret ? providedSecret.trim() : '';

                if (!sanitizedSecret) {
                    this.showTokenMessage('Operação cancelada: credenciais não fornecidas.', 'error', 'clearTokensMessage');
                    return;
                }

                this.setAdminSecret(sanitizedSecret);
                response = await executeRequest();

                if (response.status === 401 || response.status === 403) {
                    this.setAdminSecret(null);
                    this.showTokenMessage('Não autorizado: verifique o ADMIN_SECRET', 'error', 'clearTokensMessage');
                    return;
                }
            }

            const result = await response.json().catch(() => null);

            if (!response.ok || !result?.sucesso) {
                const errorMessage = result?.erro || 'Erro ao apagar tokens de WhatsApp';
                throw new Error(errorMessage);
            }

            this.showTokenMessage('Todos os tokens do WhatsApp foram apagados com sucesso', 'success', 'clearTokensMessage');
            this.loadTokenStats();
            this.loadTokenList();
        } catch (error) {
            console.error('Erro ao apagar tokens de WhatsApp:', error);
            this.showTokenMessage(error.message || 'Erro ao apagar tokens de WhatsApp', 'error', 'clearTokensMessage');
        }
    }

    updateTokenStats(stats) {
        if (!stats) {
            return;
        }

        const totalTokensEl = document.getElementById('totalTokens');
        const tokensUsadosEl = document.getElementById('tokensUsados');
        const valorTotalEl = document.getElementById('valorTotal');
        const tokensHojeEl = document.getElementById('tokensHoje');

        if (totalTokensEl) totalTokensEl.textContent = stats.total_tokens || 0;
        if (tokensUsadosEl) tokensUsadosEl.textContent = stats.tokens_usados || 0;
        const valorTotal = Number(stats.valor_total);
        if (valorTotalEl) valorTotalEl.textContent = this.formatCurrency(Number.isFinite(valorTotal) ? valorTotal : 0);
        if (tokensHojeEl) tokensHojeEl.textContent = stats.tokens_hoje || 0;
    }

    async generateToken() {
        const tokenBtn = document.getElementById('tokenBtn');
        const tokenLoading = document.getElementById('tokenLoading');
        const tokenMessage = document.getElementById('tokenMessage');
        const tokenResult = document.getElementById('tokenResult');
        
        // Valida os campos
        const valorEl = document.getElementById('tokenValor');
        const nomeEl = document.getElementById('tokenNome');
        const telefoneEl = document.getElementById('tokenTelefone');

        if (!valorEl || !nomeEl || !telefoneEl) {
            this.showTokenMessage('Campos do formulário não encontrados', 'error');
            return;
        }

        const valor = parseFloat(valorEl.value);
        const nome = nomeEl.value.trim();
        const telefone = telefoneEl.value.trim();

        if (isNaN(valor) || valor <= 0) {
            this.showTokenMessage('Por favor, insira um valor válido', 'error');
            return;
        }

        if (!nome) {
            this.showTokenMessage('Por favor, informe o nome', 'error');
            return;
        }

        if (!telefone) {
            this.showTokenMessage('Por favor, informe o telefone', 'error');
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
                    nome: nome,
                    telefone: telefone
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
                nomeEl.value = '';
                telefoneEl.value = '';

                // Recarrega as estatísticas
                this.loadTokenStats();
                this.loadTokenList();
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

        if (generatedUrl) {
            generatedUrl.value = result.url;
        }

        this.updateLatestTokenDetails(result);

        if (tokenResult) {
            tokenResult.style.display = 'block';
        }
    }

    showTokenMessage(text, type, elementId = 'tokenMessage') {
        const message = document.getElementById(elementId);
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

    getStoredAdminSecret() {
        if (typeof window === 'undefined') {
            return null;
        }

        if (typeof window.ADMIN_SECRET === 'string' && window.ADMIN_SECRET.trim()) {
            return window.ADMIN_SECRET.trim();
        }

        try {
            if (!window.localStorage) {
                return null;
            }

            const stored = window.localStorage.getItem('adminSecret');
            return stored && stored.trim() ? stored.trim() : null;
        } catch (error) {
            console.warn('Não foi possível acessar o localStorage para adminSecret:', error);
            return null;
        }
    }

    setAdminSecret(secret) {
        const sanitized = typeof secret === 'string' ? secret.trim() : '';
        this.adminSecret = sanitized || null;

        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                if (this.adminSecret) {
                    window.localStorage.setItem('adminSecret', this.adminSecret);
                } else {
                    window.localStorage.removeItem('adminSecret');
                }
            } catch (error) {
                console.warn('Não foi possível atualizar o adminSecret no localStorage:', error);
            }
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

    async testWhatsAppEvent() {
        const testEventBtn = document.getElementById('testEventBtn');
        const testResult = document.getElementById('testResult');
        const testResultContent = document.getElementById('testResultContent');

        if (!testEventBtn || !testResult || !testResultContent) {
            console.error('Elementos de teste não encontrados');
            return;
        }

        // Desabilita o botão durante o teste
        testEventBtn.disabled = true;
        testEventBtn.textContent = '⏳ Testando...';

        try {
            // Verifica se o WhatsApp tracking está disponível
            if (typeof window.whatsappTracking === 'undefined') {
                throw new Error('WhatsApp tracking não está carregado');
            }

            // Executa o teste
            const success = await window.whatsappTracking.testEvent();

            if (success) {
                testResultContent.innerHTML = `
                    <div style="color: #28a745;">
                        <p>✅ <strong>Evento de teste enviado com sucesso!</strong></p>
                        <p>Código: <code>TEST50600</code></p>
                        <p>Verifique o Facebook Events Manager para confirmar o recebimento.</p>
                    </div>
                `;
                testResult.style.borderColor = '#28a745';
            } else {
                throw new Error('Falha ao enviar evento de teste');
            }
        } catch (error) {
            testResultContent.innerHTML = `
                <div style="color: #dc3545;">
                    <p>❌ <strong>Erro no teste:</strong></p>
                    <p>${error.message}</p>
                    <p>Verifique se o pixel do WhatsApp está configurado corretamente.</p>
                </div>
            `;
            testResult.style.borderColor = '#dc3545';
        } finally {
            // Reabilita o botão
            testEventBtn.disabled = false;
            testEventBtn.textContent = '🚀 Enviar Evento de Teste';
            
            // Mostra o resultado
            testResult.style.display = 'block';
        }
    }
}

// Inicializa o dashboard quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
    new WhatsAppDashboard();
});
