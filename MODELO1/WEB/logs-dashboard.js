// Sistema de Logs Dashboard - JavaScript
class LogsDashboard {
    constructor() {
        this.currentPage = 1;
        this.logsPerPage = 50;
        this.logLevelChart = null;
        this.timelineChart = null;
        this.token = '';
        this.autoRefreshInterval = null;
        this.lastLogCount = 0;
        this.currentFilters = {};
        
        this.init();
    }
    
    init() {
        // Definir datas padrão (últimas 24 horas)
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        
        document.getElementById('dateTo').value = this.formatDateTimeLocal(now);
        document.getElementById('dateFrom').value = this.formatDateTimeLocal(oneDayAgo);
        
        // Verificar se há token no localStorage
        const savedToken = localStorage.getItem('logs_dashboard_token');
        if (savedToken) {
            document.getElementById('token').value = savedToken;
            this.token = savedToken;
            this.loadLogs();
        }
        
        // Event listeners
        document.getElementById('token').addEventListener('input', (e) => {
            this.token = e.target.value;
            localStorage.setItem('logs_dashboard_token', this.token);
        });
        
        // Auto refresh
        document.getElementById('autoRefresh').addEventListener('change', (e) => {
            if (e.target.checked) {
                this.startAutoRefresh();
            } else {
                this.stopAutoRefresh();
            }
        });
        
        // Enter key nos campos de filtro
        document.querySelectorAll('.filter-group input, .filter-group select').forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.loadLogs();
                }
            });
        });
        
        // Inicializar ícones Lucide
        lucide.createIcons();
    }
    
    formatDateTimeLocal(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
    
    async loadLogs(page = 1) {
        if (!this.token) {
            this.showError('Token de acesso obrigatório');
            return;
        }
        
        this.showLoading();
        this.currentPage = page;
        
        try {
            // Carregar dados dos logs e estatísticas em paralelo
            const [logsData, statsData] = await Promise.all([
                this.fetchLogs(page),
                this.fetchLogStats()
            ]);
            
            if (logsData && statsData) {
                this.updateKPIs(statsData);
                this.updateCharts(statsData);
                this.updateLogsTable(logsData.logs);
                this.updatePagination(logsData.total, page);
                this.hideLoading();
                
                // Verificar se há novos logs
                if (logsData.total > this.lastLogCount && this.lastLogCount > 0) {
                    this.showNewLogsIndicator();
                }
                this.lastLogCount = logsData.total;
            }
            
        } catch (error) {
            console.error('Erro ao carregar logs:', error.message);
            this.showError('Erro ao carregar dados: ' + error.message);
        }
    }
    
    async fetchLogs(page = 1) {
        const params = new URLSearchParams({
            token: this.token,
            limit: this.logsPerPage,
            offset: (page - 1) * this.logsPerPage
        });
        
        // Adicionar filtros
        const filters = this.getCurrentFilters();
        Object.keys(filters).forEach(key => {
            if (filters[key]) {
                params.append(key, filters[key]);
            }
        });
        
        const response = await fetch(`/api/logs?${params}`);
        
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Token de acesso inválido');
            }
            throw new Error('Erro na API: ' + response.statusText);
        }
        
        return await response.json();
    }
    
    async fetchLogStats() {
        const params = new URLSearchParams({
            token: this.token
        });
        
        // Adicionar filtros de data para estatísticas
        const dateFrom = document.getElementById('dateFrom').value;
        const dateTo = document.getElementById('dateTo').value;
        
        if (dateFrom) params.append('dateFrom', dateFrom);
        if (dateTo) params.append('dateTo', dateTo);
        
        const response = await fetch(`/api/logs/stats?${params}`);
        
        if (!response.ok) {
            throw new Error('Erro ao carregar estatísticas: ' + response.statusText);
        }
        
        return await response.json();
    }
    
    getCurrentFilters() {
        return {
            dateFrom: document.getElementById('dateFrom').value,
            dateTo: document.getElementById('dateTo').value,
            level: document.getElementById('logLevel').value,
            service: document.getElementById('service').value,
            keyword: document.getElementById('keyword').value
        };
    }
    
    updateKPIs(stats) {
        const kpiGrid = document.getElementById('kpiGrid');
        
        const totalLogs = stats.totalLogs || 0;
        const errorCount = stats.errorCount || 0;
        const warningCount = stats.warningCount || 0;
        const activeServices = stats.activeServices || 0;
        const lastError = stats.lastError || null;
        const avgResponseTime = stats.avgResponseTime || 0;
        
        kpiGrid.innerHTML = `
            <div class="kpi-card">
                <h3>${totalLogs.toLocaleString()}</h3>
                <p>Total de Logs</p>
                <div class="trend up">+${stats.logsIncrease || 0}% vs período anterior</div>
            </div>
            <div class="kpi-card">
                <h3>${errorCount}</h3>
                <p>Erros</p>
                <div class="trend ${stats.errorTrend === 'up' ? 'up' : 'down'}">
                    ${stats.errorTrend === 'up' ? '+' : '-'}${stats.errorChange || 0}% vs período anterior
                </div>
            </div>
            <div class="kpi-card">
                <h3>${warningCount}</h3>
                <p>Warnings</p>
                <div class="trend ${stats.warningTrend === 'up' ? 'up' : 'down'}">
                    ${stats.warningTrend === 'up' ? '+' : '-'}${stats.warningChange || 0}% vs período anterior
                </div>
            </div>
            <div class="kpi-card">
                <h3>${activeServices}</h3>
                <p>Serviços Ativos</p>
            </div>
            <div class="kpi-card">
                <h3>${lastError ? this.formatTimeAgo(lastError.timestamp) : 'N/A'}</h3>
                <p>Último Erro</p>
                ${lastError ? `<small style="color: var(--text-muted);">${lastError.message.substring(0, 50)}...</small>` : ''}
            </div>
            <div class="kpi-card">
                <h3>${avgResponseTime.toFixed(2)}ms</h3>
                <p>Tempo Médio de Resposta</p>
            </div>
        `;
    }
    
    updateCharts(stats) {
        this.updateLogLevelChart(stats.levelDistribution);
        this.updateTimelineChart(stats.timelineData);
    }
    
    updateLogLevelChart(data) {
        const ctx = document.getElementById('logLevelChart').getContext('2d');
        
        if (this.logLevelChart) {
            this.logLevelChart.destroy();
        }
        
        const labels = Object.keys(data || {});
        const values = Object.values(data || {});
        
        const colors = {
            'ERROR': '#ef4444',
            'WARN': '#f59e0b',
            'INFO': '#3b82f6',
            'DEBUG': '#6b7280',
            'SUCCESS': '#10b981'
        };
        
        this.logLevelChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: labels.map(label => colors[label] || '#6b7280'),
                    borderWidth: 2,
                    borderColor: 'rgba(255, 255, 255, 0.1)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#ffffff',
                            padding: 20,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return `${context.label}: ${context.parsed} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
    
    updateTimelineChart(data) {
        const ctx = document.getElementById('timelineChart').getContext('2d');
        
        if (this.timelineChart) {
            this.timelineChart.destroy();
        }
        
        const labels = data.map(item => {
            const date = new Date(item.timestamp);
            return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        });
        
        const errorData = data.map(item => item.errors || 0);
        const warningData = data.map(item => item.warnings || 0);
        const infoData = data.map(item => item.info || 0);
        
        this.timelineChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Erros',
                        data: errorData,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Warnings',
                        data: warningData,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Info',
                        data: infoData,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Hora',
                            color: '#ffffff'
                        },
                        ticks: {
                            color: '#ffffff'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Quantidade',
                            color: '#ffffff'
                        },
                        ticks: {
                            color: '#ffffff'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: '#ffffff'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff'
                    }
                }
            }
        });
    }
    
    updateLogsTable(logs) {
        const tbody = document.getElementById('logsTableBody');
        
        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-secondary);">Nenhum log encontrado</td></tr>';
            return;
        }
        
        tbody.innerHTML = logs.map(log => {
            const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : 'Data inválida';
            const levelClass = `level-${log.level.toLowerCase()}`;
            const messagePreview = log.message ? (log.message.length > 100 ? log.message.substring(0, 100) + '...' : log.message) : '-';
            const ipAddress = log.ip || '-';
            const userAgent = log.userAgent ? (log.userAgent.length > 50 ? log.userAgent.substring(0, 50) + '...' : log.userAgent) : '-';
            
            return `
                <tr>
                    <td>${timestamp}</td>
                    <td><span class="log-level ${levelClass}">${log.level}</span></td>
                    <td>${log.service || '-'}</td>
                    <td class="message-cell" title="${log.message || ''}">${messagePreview}</td>
                    <td>${log.source || '-'}</td>
                    <td>${ipAddress}</td>
                    <td title="${log.userAgent || ''}">${userAgent}</td>
                    <td>
                        <button class="btn btn-secondary" onclick="viewLogDetails('${log.id}')" style="padding: 4px 8px; font-size: 0.8rem;">
                            <i data-lucide="eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        // Re-inicializar ícones Lucide
        lucide.createIcons();
    }
    
    updatePagination(total, currentPage) {
        const pagination = document.getElementById('pagination');
        const totalPages = Math.ceil(total / this.logsPerPage);
        
        if (totalPages <= 1) {
            pagination.style.display = 'none';
            return;
        }
        
        pagination.style.display = 'flex';
        
        let paginationHTML = '';
        
        // Botão anterior
        if (currentPage > 1) {
            paginationHTML += `<button class="page-btn" onclick="loadLogs(${currentPage - 1})">Anterior</button>`;
        }
        
        // Páginas
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            const activeClass = i === currentPage ? 'active' : '';
            paginationHTML += `<button class="page-btn ${activeClass}" onclick="loadLogs(${i})">${i}</button>`;
        }
        
        // Botão próximo
        if (currentPage < totalPages) {
            paginationHTML += `<button class="page-btn" onclick="loadLogs(${currentPage + 1})">Próximo</button>`;
        }
        
        pagination.innerHTML = paginationHTML;
    }
    
    startAutoRefresh() {
        this.stopAutoRefresh(); // Parar intervalo anterior se existir
        this.autoRefreshInterval = setInterval(() => {
            this.loadLogs(this.currentPage);
        }, 5000);
    }
    
    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }
    
    showNewLogsIndicator() {
        const indicator = document.getElementById('newLogsIndicator');
        indicator.style.display = 'inline-block';
        
        // Remover após 5 segundos
        setTimeout(() => {
            indicator.style.display = 'none';
        }, 5000);
    }
    
    formatTimeAgo(timestamp) {
        const now = new Date();
        const logTime = new Date(timestamp);
        const diffMs = now - logTime;
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffMinutes < 1) return 'Agora';
        if (diffMinutes < 60) return `${diffMinutes}m atrás`;
        if (diffHours < 24) return `${diffHours}h atrás`;
        return `${diffDays}d atrás`;
    }
    
    showLoading() {
        document.getElementById('loadingIndicator').style.display = 'block';
        document.getElementById('errorMessage').style.display = 'none';
        document.getElementById('warningMessage').style.display = 'none';
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
    
    showWarning(message) {
        document.getElementById('warningMessage').style.display = 'block';
        document.getElementById('warningMessage').textContent = message;
    }
    
    clearWarning() {
        document.getElementById('warningMessage').style.display = 'none';
    }
}

// Funções globais
function loadLogs(page = 1) {
    window.logsDashboard.loadLogs(page);
}

function clearFilters() {
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    document.getElementById('logLevel').value = '';
    document.getElementById('service').value = '';
    document.getElementById('keyword').value = '';
    
    // Definir datas padrão (últimas 24 horas)
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    
    document.getElementById('dateTo').value = window.logsDashboard.formatDateTimeLocal(now);
    document.getElementById('dateFrom').value = window.logsDashboard.formatDateTimeLocal(oneDayAgo);
    
    loadLogs();
}

function exportLogs(format) {
    if (!window.logsDashboard.token) {
        alert('Token de acesso obrigatório para exportar logs');
        return;
    }
    
    const filters = window.logsDashboard.getCurrentFilters();
    const params = new URLSearchParams({
        token: window.logsDashboard.token,
        format: format,
        ...filters
    });
    
    // Criar link de download
    const link = document.createElement('a');
    link.href = `/api/logs/export?${params}`;
    link.download = `logs-${new Date().toISOString().split('T')[0]}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function viewLogDetails(logId) {
    // Implementar modal ou página de detalhes do log
    alert(`Detalhes do log ${logId} - Funcionalidade em desenvolvimento`);
}

// Inicializar dashboard quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    window.logsDashboard = new LogsDashboard();
});

// Limpar intervalo quando a página for fechada
window.addEventListener('beforeunload', () => {
    if (window.logsDashboard) {
        window.logsDashboard.stopAutoRefresh();
    }
});