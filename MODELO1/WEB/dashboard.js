// Dashboard de Eventos - JavaScript
class Dashboard {
    constructor() {
        this.currentPage = 1;
        this.eventsPerPage = 50;
        this.faturamentoChart = null;
        this.utmSourceChart = null;
        this.token = '';
        
        this.init();
    }
    
    init() {
        // Definir datas padrão (últimos 7 dias)
        const hoje = new Date();
        const seteDiasAtras = new Date(hoje);
        seteDiasAtras.setDate(hoje.getDate() - 7);
        
        document.getElementById('fim').value = hoje.toISOString().split('T')[0];
        document.getElementById('inicio').value = seteDiasAtras.toISOString().split('T')[0];
        
        // Verificar se há token no localStorage
        const savedToken = localStorage.getItem('dashboard_token');
        if (savedToken) {
            document.getElementById('token').value = savedToken;
            this.token = savedToken;
            this.loadDashboard();
        }
        
        // Event listeners
        document.getElementById('token').addEventListener('input', (e) => {
            this.token = e.target.value;
            localStorage.setItem('dashboard_token', this.token);
        });
        
        // Enter key nos campos de filtro
        document.querySelectorAll('.filter-group input, .filter-group select').forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.loadDashboard();
                }
            });
        });
    }
    
    async loadDashboard() {
        if (!this.token) {
            this.showError('Token de acesso obrigatório');
            return;
        }
        
        this.showLoading();
        
        try {
            // Carregar dados dos eventos e gráficos em paralelo
            const [eventsData, dashboardData] = await Promise.all([
                this.loadEvents(),
                this.loadDashboardData()
            ]);
            
            if (eventsData && dashboardData) {
                this.updateStats(eventsData.estatisticas);
                this.updateCharts(dashboardData);
                this.updateEventsTable(eventsData.eventos);
                this.hideLoading();
            }
            
        } catch (error) {
            console.error('Erro ao carregar dashboard:', error);
            this.showError('Erro ao carregar dados: ' + error.message);
        }
    }
    
    async loadEvents(page = 1) {
        const params = new URLSearchParams({
            token: this.token,
            limit: this.eventsPerPage,
            offset: (page - 1) * this.eventsPerPage
        });
        
        // Adicionar filtros se preenchidos
        const evento = document.getElementById('evento').value;
        const inicio = document.getElementById('inicio').value;
        const fim = document.getElementById('fim').value;
        const utm_campaign = document.getElementById('utm_campaign').value;
        
        if (evento) params.append('evento', evento);
        if (inicio) params.append('inicio', inicio);
        if (fim) params.append('fim', fim);
        if (utm_campaign) params.append('utm_campaign', utm_campaign);
        
        const response = await fetch(`/api/eventos?${params}`);
        
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Token de acesso inválido');
            }
            throw new Error('Erro na API: ' + response.statusText);
        }
        
        return await response.json();
    }
    
    async loadDashboardData() {
        const params = new URLSearchParams({
            token: this.token
        });
        
        const inicio = document.getElementById('inicio').value;
        const fim = document.getElementById('fim').value;
        
        if (inicio) params.append('inicio', inicio);
        if (fim) params.append('fim', fim);
        
        console.log('🔄 Carregando dados do dashboard:', { token: this.token, inicio, fim });
        
        try {
            const response = await fetch(`/api/dashboard-data?${params}`);
            
            if (!response.ok) {
                let errorMessage = 'Erro ao carregar dados dos gráficos';
                let fallbackData = null;
                
                try {
                    const errorData = await response.json();
                    
                    // Se há dados de fallback no erro, usá-los
                    if (errorData.fallbackData) {
                        console.warn('⚠️ Usando dados de fallback devido ao erro:', errorData.error);
                        fallbackData = errorData.fallbackData;
                    }
                    
                    if (response.status === 401) {
                        errorMessage = 'Token de acesso inválido. Verifique suas credenciais.';
                    } else if (response.status === 500) {
                        errorMessage = `Erro no servidor: ${errorData.details || 'Problema na conexão com banco de dados'}`;
                        
                        // Para erros 500, sempre tentar usar fallback se disponível
                        if (fallbackData) {
                            console.log('📊 Exibindo dados de fallback para manter gráficos funcionais');
                            this.showWarningMessage(`${errorMessage} - Exibindo dados simulados`);
                            return fallbackData;
                        }
                    } else {
                        errorMessage = errorData.error || errorMessage;
                    }
                } catch (e) {
                    // Se não conseguir parsear JSON, usar mensagem padrão
                    errorMessage = `Erro HTTP ${response.status}: ${response.statusText}`;
                }
                
                console.error('❌ Erro na requisição:', { status: response.status, statusText: response.statusText });
                
                // Se temos dados de fallback, usá-los em vez de lançar erro
                if (fallbackData) {
                    this.showWarningMessage(errorMessage + ' - Exibindo dados de exemplo');
                    return fallbackData;
                }
                
                throw new Error(errorMessage);
            }
            
            const data = await response.json();
            console.log('✅ Dados carregados:', data);
            
            // Verificar se houve erro interno mas dados de fallback foram retornados
            if (data.metadata?.errorOccurred) {
                this.showWarningMessage('⚠️ Dados simulados exibidos devido a erro interno no servidor');
            } else {
                // Limpar mensagens de aviso se tudo deu certo
                this.clearWarningMessage();
            }
            
            return data;
            
        } catch (fetchError) {
            console.error('❌ Erro de rede ou conexão:', fetchError);
            
            // Dados de fallback para quando não conseguir nem fazer a requisição
            const emergencyFallback = {
                faturamentoDiario: [{
                    data: new Date().toISOString().split('T')[0],
                    faturamento: 0,
                    vendas: 0,
                    addtocart: 0,
                    initiatecheckout: 0
                }],
                utmSource: [{
                    utm_source: 'Direto',
                    vendas: 0,
                    addtocart: 0,
                    initiatecheckout: 0,
                    total_eventos: 0
                }],
                campanhas: [{
                    campanha: 'Sem Campanha',
                    vendas: 0,
                    addtocart: 0,
                    initiatecheckout: 0,
                    faturamento: 0,
                    total_eventos: 0
                }]
            };
            
            this.showWarningMessage('Erro de conexão - Exibindo dados de exemplo. Verifique sua conexão e tente novamente.');
            return emergencyFallback;
        }
    }
    
    showWarningMessage(message) {
        // Remover mensagem anterior se existir
        this.clearWarningMessage();
        
        const warningDiv = document.createElement('div');
        warningDiv.id = 'dashboard-warning';
        warningDiv.className = 'warning-message';
        warningDiv.style.cssText = `
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
            padding: 12px;
            margin: 10px 0;
            border-radius: 8px;
            font-size: 14px;
            text-align: center;
        `;
        warningDiv.innerHTML = `⚠️ ${message}`;
        
        const container = document.querySelector('.dashboard-container') || document.body;
        container.insertBefore(warningDiv, container.firstChild);
    }
    
    clearWarningMessage() {
        const existingWarning = document.getElementById('dashboard-warning');
        if (existingWarning) {
            existingWarning.remove();
        }
    }
    
    updateStats(stats) {
        const statsGrid = document.getElementById('statsGrid');
        
        const faturamentoTotal = parseFloat(stats.faturamento_total) || 0;
        const totalPurchases = parseInt(stats.total_purchases) || 0;
        const totalAddToCart = parseInt(stats.total_addtocart) || 0;
        const totalInitiateCheckout = parseInt(stats.total_initiatecheckout) || 0;
        const totalEventos = parseInt(stats.total_eventos) || 0;
        const fontesUnicas = parseInt(stats.fontes_unicas) || 0;
        
        statsGrid.innerHTML = `
            <div class="stat-card">
                <h3>R$ ${faturamentoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                <p>💰 Faturamento Total</p>
            </div>
            <div class="stat-card">
                <h3>${totalPurchases}</h3>
                <p>🛒 Vendas (Purchase)</p>
            </div>
            <div class="stat-card">
                <h3>${totalAddToCart}</h3>
                <p>🛍️ Add to Cart</p>
            </div>
            <div class="stat-card">
                <h3>${totalInitiateCheckout}</h3>
                <p>🚀 Initiate Checkout</p>
            </div>
            <div class="stat-card">
                <h3>${totalEventos}</h3>
                <p>📊 Total de Eventos</p>
            </div>
            <div class="stat-card">
                <h3>${fontesUnicas}</h3>
                <p>🎯 Fontes UTM Únicas</p>
            </div>
        `;
    }
    
    updateCharts(data) {
        // Gráfico de faturamento diário
        this.updateFaturamentoChart(data.faturamentoDiario);
        
        // Gráfico de distribuição por UTM Source
        this.updateUtmSourceChart(data.utmSource);
    }
    
    updateFaturamentoChart(data) {
        const ctx = document.getElementById('faturamentoChart').getContext('2d');
        
        if (this.faturamentoChart) {
            this.faturamentoChart.destroy();
        }
        
        const labels = data.map(item => {
            const date = new Date(item.data);
            return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        });
        
        const faturamentoData = data.map(item => parseFloat(item.faturamento) || 0);
        const vendasData = data.map(item => parseInt(item.vendas) || 0);
        const addToCartData = data.map(item => parseInt(item.addtocart) || 0);
        const initiateCheckoutData = data.map(item => parseInt(item.initiatecheckout) || 0);
        
        this.faturamentoChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Faturamento (R$)',
                        data: faturamentoData,
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Vendas (Purchase)',
                        data: vendasData,
                        borderColor: '#764ba2',
                        backgroundColor: 'rgba(118, 75, 162, 0.1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        yAxisID: 'y1'
                    },
                    {
                        label: 'Add to Cart',
                        data: addToCartData,
                        borderColor: '#f093fb',
                        backgroundColor: 'rgba(240, 147, 251, 0.1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        yAxisID: 'y1'
                    },
                    {
                        label: 'Initiate Checkout',
                        data: initiateCheckoutData,
                        borderColor: '#43e97b',
                        backgroundColor: 'rgba(67, 233, 123, 0.1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Data'
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Faturamento (R$)'
                        },
                        ticks: {
                            callback: function(value) {
                                return 'R$ ' + value.toLocaleString('pt-BR');
                            }
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Número de Vendas'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (context.datasetIndex === 0) {
                                    return `Faturamento: R$ ${context.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                                } else {
                                    return `Vendas: ${context.parsed.y}`;
                                }
                            }
                        }
                    }
                }
            }
        });
    }
    
    updateUtmSourceChart(data) {
        const ctx = document.getElementById('utmSourceChart').getContext('2d');
        
        if (this.utmSourceChart) {
            this.utmSourceChart.destroy();
        }
        
        // Filtrar apenas fontes com eventos
        const filteredData = data.filter(item => parseInt(item.total_eventos) > 0);
        
        const labels = filteredData.map(item => item.utm_source || 'Direto');
        const totalEventos = filteredData.map(item => parseInt(item.total_eventos) || 0);
        
        // Cores vibrantes para o gráfico
        const colors = [
            '#667eea', '#764ba2', '#f093fb', '#f5576c', 
            '#4facfe', '#00f2fe', '#43e97b', '#38f9d7',
            '#ffecd2', '#fcb69f', '#a8edea', '#fed6e3'
        ];
        
        this.utmSourceChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: totalEventos,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = totalEventos.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                const item = filteredData[context.dataIndex];
                                return [
                                    `${context.label}: ${context.parsed} eventos (${percentage}%)`,
                                    `Vendas: ${item.vendas || 0}`,
                                    `AddToCart: ${item.addtocart || 0}`,
                                    `InitiateCheckout: ${item.initiatecheckout || 0}`
                                ];
                            }
                        }
                    }
                }
            }
        });
    }
    
    updateEventsTable(eventos) {
        const tbody = document.getElementById('eventsTableBody');
        
        if (!eventos || eventos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #666;">Nenhum evento encontrado</td></tr>';
            return;
        }
        
        tbody.innerHTML = eventos.map(evento => {
            // ✅ CORREÇÃO: Usar data_evento ao invés de data_hora
            const dataEvento = evento.data_evento ? new Date(evento.data_evento).toLocaleString('pt-BR') : 'Data inválida';
            const valor = evento.valor ? `R$ ${parseFloat(evento.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-';
            const tokenAbrev = evento.token ? evento.token.substring(0, 8) + '...' : '-';
            
            // ✅ CORREÇÃO: Usar status_envio do backend ao invés de calcular manualmente
            let statusHtml = '';
            if (evento.status_envio === 'enviado') {
                statusHtml = `<span class="status-badge status-success">Enviado</span>`;
            } else {
                statusHtml = `<span class="status-badge status-pending">Pendente</span>`;
            }
            
            // ✅ CORREÇÃO: Tratar UTM campos como null/undefined adequadamente
            const utmSource = evento.utm_source === null ? 'unknown' : (evento.utm_source || '-');
            const utmMedium = evento.utm_medium === null ? 'unknown' : (evento.utm_medium || '-');
            const utmCampaign = evento.utm_campaign === null ? 'unknown' : (evento.utm_campaign || '-');
            
            return `
                <tr>
                    <td>${dataEvento}</td>
                    <td><strong>${evento.tipo_evento}</strong></td>
                    <td>${valor}</td>
                    <td><code>${tokenAbrev}</code></td>
                    <td>${utmSource}</td>
                    <td>${utmMedium}</td>
                    <td>${utmCampaign}</td>
                    <td>${evento.telegram_id || '-'}</td>
                    <td>${statusHtml}</td>
                </tr>
            `;
        }).join('');
    }
    
    showLoading() {
        document.getElementById('loadingIndicator').style.display = 'block';
        document.getElementById('errorMessage').style.display = 'none';
        document.getElementById('tableWrapper').style.display = 'none';
    }
    
    hideLoading() {
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('tableWrapper').style.display = 'block';
    }
    
    showError(message) {
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('tableWrapper').style.display = 'none';
        document.getElementById('errorMessage').style.display = 'block';
        document.getElementById('errorMessage').textContent = message;
    }
}

// Inicializar dashboard quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new Dashboard();
});

// Função global para o botão
function loadDashboard() {
    window.dashboard.loadDashboard();
}