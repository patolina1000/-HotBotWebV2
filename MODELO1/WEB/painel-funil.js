document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('carregar-funil');
    const tokenInput = document.getElementById('token-acesso');
    const inicioInput = document.getElementById('data-inicio');
    const fimInput = document.getElementById('data-fim');
    let chart = null;

    // Define datas padrão (últimos 7 dias)
    const hoje = new Date();
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(hoje.getDate() - 7);
    inicioInput.value = seteDiasAtras.toISOString().split('T')[0];
    fimInput.value = hoje.toISOString().split('T')[0];
    tokenInput.value = localStorage.getItem('dashboard_token_funil') || '';

    btn.addEventListener('click', carregarDados);

    async function carregarDados() {
        const token = tokenInput.value;
        if (!token) { alert('Por favor, insira o token de acesso.'); return; }
        localStorage.setItem('dashboard_token_funil', token);

        document.getElementById('loading').style.display = 'block';
        document.getElementById('dashboard-content').style.display = 'none';

        const params = new URLSearchParams({
            token: token,
            inicio: inicioInput.value,
            fim: fimInput.value,
            agrupamento: document.getElementById('agrupamento').value
        });

        try {
            const response = await fetch(`/api/funnel/data?${params}`);
            if (!response.ok) throw new Error(`Erro ${response.status}: ${await response.text()}`);
            
            const data = await response.json();
            
            atualizarContadores(data.counts);
            atualizarTaxas(data.counts);
            atualizarGrafico(data.series);

            document.getElementById('loading').style.display = 'none';
            document.getElementById('dashboard-content').style.display = 'block';
        } catch (error) {
            console.error('Erro ao carregar dados do funil:', error);
            alert('Falha ao carregar dados: ' + error.message);
            document.getElementById('loading').style.display = 'none';
        }
    }

    function atualizarContadores(counts) {
        document.getElementById('welcome').textContent = counts.welcome || 0;
        document.getElementById('cta-click').textContent = counts.cta_click || 0;
        document.getElementById('bot-start').textContent = counts.bot_start || 0;
        document.getElementById('pix-generated').textContent = counts.pix_generated || 0;
        document.getElementById('purchase').textContent = counts.purchase || 0;
    }

    function calcularTaxa(numerador, denominador) {
        numerador = parseInt(numerador) || 0;
        denominador = parseInt(denominador) || 0;
        if (denominador === 0) return '0.00%';
        return ((numerador / denominador) * 100).toFixed(2) + '%';
    }

    function atualizarTaxas(c) {
        document.getElementById('rate-welcome-click').textContent = calcularTaxa(c.cta_click, c.welcome);
        document.getElementById('rate-click-bot').textContent = calcularTaxa(c.bot_start, c.cta_click);
        document.getElementById('rate-bot-pix').textContent = calcularTaxa(c.pix_generated, c.bot_start);
        document.getElementById('rate-pix-compra').textContent = calcularTaxa(c.purchase, c.pix_generated);
        document.getElementById('rate-welcome-compra').textContent = calcularTaxa(c.purchase, c.welcome);
    }
    
    function atualizarGrafico(series) {
        const ctx = document.getElementById('funil-chart').getContext('2d');
        if (chart) chart.destroy();

        const labels = [...new Set(series.map(item => item.time_bucket.split('T')[0]))].sort();
        
        const datasets = {
            welcome: { label: 'Welcome', data: [], borderColor: '#4e9af1', tension: 0.1 },
            cta_click: { label: 'CTA Click', data: [], borderColor: '#f1c40f', tension: 0.1 },
            bot_start: { label: 'Entraram no Bot', data: [], borderColor: '#e67e22', tension: 0.1 },
            pix_generated: { label: 'PIX Gerado', data: [], borderColor: '#e74c3c', tension: 0.1 },
            purchase: { label: 'Compraram', data: [], borderColor: '#2ecc71', tension: 0.1 }
        };

        labels.forEach(label => {
            for (const key in datasets) {
                const item = series.find(s => s.time_bucket.startsWith(label) && s.event_name === key);
                datasets[key].data.push(item ? parseInt(item.count) : 0);
            }
        });

        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: Object.values(datasets)
            },
            options: {
                scales: {
                    x: { ticks: { color: '#e0e0e0' }, grid: { color: '#444' } },
                    y: { beginAtZero: true, ticks: { color: '#e0e0e0' }, grid: { color: '#444' } }
                },
                plugins: { legend: { labels: { color: '#e0e0e0' } } }
            }
        });
    }
});

// Função auxiliar utilizada no painel de testes para gerar uma cobrança
// e associá-la a uma sessão única do funil. Essa função deve ser chamada
// a partir dos botões da tabela de testes, enviando também os parâmetros
// necessários para criar a cobrança.
async function gerarCobranca(button, telegram_id, plano, valor, trackingData) {
    // Pega a referência à linha (<tr>) onde o botão foi clicado
    const row = button.closest('tr');

    // Cria um identificador único baseado no timestamp atual
    const funnel_session_id = 'funil_session_' + Date.now();

    // Salva o identificador na linha da tabela para rastreamento posterior
    row.dataset.sessionId = funnel_session_id;

    // Envia a requisição para gerar a cobrança incluindo o novo campo
    return fetch('/api/gerar-cobranca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            telegram_id,
            plano,
            valor,
            trackingData,
            funnel_session_id
        })
    });
}

// Expõe a função globalmente para ser utilizada diretamente no HTML
window.gerarCobranca = gerarCobranca;
