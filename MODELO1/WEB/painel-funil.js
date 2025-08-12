document.addEventListener('DOMContentLoaded', () => {
  const btnCarregar = document.getElementById('carregar-funil');

  async function carregarDados() {
    // Obter os valores dos campos do formulário
    const token = document.getElementById('token-acesso').value;
    const inicio = document.getElementById('data-inicio').value;
    const fim = document.getElementById('data-fim').value;
    const agrupamento = document.getElementById('agrupamento').value;

    // Validar se os campos essenciais estão preenchidos
    if (!token || !inicio || !fim) {
      alert('Por favor, preencha o Token de Acesso e as datas.');
      return;
    }

    // Mostrar indicador de carregamento
    document.getElementById('loading').style.display = 'block';
    document.getElementById('dashboard-content').style.display = 'none';

    try {
      // Construir a URL com os parâmetros de consulta
      const params = new URLSearchParams({
        token: token,
        inicio: inicio,
        fim: fim,
        agrupamento: agrupamento
      });

      const response = await fetch(`/api/funnel/data?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(`Erro ${response.status}: ${errorData.error || response.statusText}`);
      }

      const data = await response.json();

      // Usar os dados recebidos da API
      const counts = data.counts || {};
      const series = data.series || [];

      atualizarContadores(counts);
      atualizarTaxas(counts);
      // Você precisará de uma função para renderizar o gráfico com os dados de 'series'
      // renderizarGrafico(series);

      // Mostrar o conteúdo do dashboard
      document.getElementById('dashboard-content').style.display = 'block';

    } catch (error) {
      console.error('Erro ao carregar dados do funil:', error);
      alert(`Falha ao carregar dados: ${error.message}`);
    } finally {
      // Esconder indicador de carregamento
      document.getElementById('loading').style.display = 'none';
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
