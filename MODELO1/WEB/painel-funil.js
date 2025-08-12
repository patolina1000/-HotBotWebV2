document.addEventListener('DOMContentLoaded', () => {
  const btnCarregar = document.getElementById('carregar-funil');

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
    document.getElementById('cta-click').textContent = c.cta_click;
    document.getElementById('pix-generated').textContent = c.pix_generated;
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

  if (btnCarregar) {
    btnCarregar.addEventListener('click', carregarDados);
  }

  carregarDados();
});
