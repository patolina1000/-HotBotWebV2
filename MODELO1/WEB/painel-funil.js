document.addEventListener('DOMContentLoaded', () => {
  async function carregarDados() {
    try {
      const response = await fetch('/api/funnel/stats');
      if (!response.ok) {
        throw new Error(`Erro ${response.status}: ${await response.text()}`);
      }
      const data = await response.json();
      const counts = {
        welcome: data.welcome || 0,
        cta_click: data.cta_click || 0,
        pix_generated: data.pix_generated || 0,
        purchase: data.pix_paid || data.purchase || 0
      };

      atualizarContadores(counts);
      atualizarTaxas(counts);
    } catch (error) {
      console.error('Erro ao carregar dados do funil:', error);
    }
  }

  function atualizarContadores(c) {
    document.getElementById('welcome').textContent = c.welcome;
    document.getElementById('cta_click').textContent = c.cta_click;
    document.getElementById('pix_generated').textContent = c.pix_generated;
    document.getElementById('purchase').textContent = c.purchase;
  }

  function calcularTaxa(numerador, denominador) {
    numerador = parseInt(numerador) || 0;
    denominador = parseInt(denominador) || 0;
    if (denominador === 0) return '0.00%';
    return ((numerador / denominador) * 100).toFixed(2) + '%';
  }

  function atualizarTaxas(c) {
    document.getElementById('rate-welcome-click').textContent = calcularTaxa(c.cta_click, c.welcome);
    document.getElementById('rate-click-pix').textContent = calcularTaxa(c.pix_generated, c.cta_click);
    document.getElementById('rate-pix-compra').textContent = calcularTaxa(c.purchase, c.pix_generated);
    document.getElementById('rate-welcome-compra').textContent = calcularTaxa(c.purchase, c.welcome);
  }

  carregarDados();
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

