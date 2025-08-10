(function(){
  'use strict';

  const PANEL_TOKEN_KEY = 'PANEL_TOKEN';

  // DOM helpers
  const $ = (id) => document.getElementById(id);
  const statusEl = () => $('statusText');

  function setStatus(message, isError=false){
    const el = statusEl();
    if(!el) return;
    el.textContent = message;
    if(isError){ el.classList.add('error'); } else { el.classList.remove('error'); }
  }

  function toDatetimeLocalString(date){
    const pad = (n) => String(n).padStart(2,'0');
    const y = date.getFullYear();
    const m = pad(date.getMonth()+1);
    const d = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    return `${y}-${m}-${d}T${hh}:${mm}`;
  }

  function parseDatetimeLocal(value){
    // value like YYYY-MM-DDTHH:mm (no timezone) treated as local
    if(!value) return null;
    const [datePart,timePart] = value.split('T');
    if(!datePart || !timePart) return null;
    const [y,m,d] = datePart.split('-').map(Number);
    const [hh,mm] = timePart.split(':').map(Number);
    return new Date(y, (m-1), d, hh||0, mm||0, 0, 0);
  }

  function formatNumber(n){
    return new Intl.NumberFormat('pt-BR').format(n ?? 0);
  }

  function formatPercent(v){
    if(v == null || Number.isNaN(v)) return '–';
    return `${(v*100).toFixed(1)}%`;
  }

  function daysBetweenInclusive(start, end){
    const dates = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while(cursor <= last){
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate()+1);
    }
    return dates;
  }

  function buildZeroSeriesForPeriod(startDate, endDate){
    const days = daysBetweenInclusive(startDate, endDate).map(d=>{
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,'0');
      const dd = String(d.getDate()).padStart(2,'0');
      return `${y}-${m}-${dd}`;
    });
    const zeros = new Array(days.length).fill(0);
    return { days, welcome: zeros.slice(), cta_click: zeros.slice(), bot_start: zeros.slice(), pix_created: zeros.slice(), purchase: zeros.slice() };
  }

  // ===================
  // Mock/Test Data (cards/rates/series)
  // ===================
  function generateTestSeries(startDate, endDate){
    const days = daysBetweenInclusive(startDate, endDate);
    const asISODate = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,'0');
      const dd = String(d.getDate()).padStart(2,'0');
      return `${y}-${m}-${dd}`;
    };

    const base = 1200 + Math.round(Math.random()*600);
    let trend = (Math.random()*0.2 - 0.1);

    const welcome = [];
    const cta_click = [];
    const bot_start = [];
    const pix_created = [];
    const purchase = [];
    const labels = [];

    days.forEach((d, idx) => {
      const dayFactor = 1 + trend*idx;
      const w = Math.max(50, Math.round(base * dayFactor * (0.9 + Math.random()*0.2)));
      const clickRate = 0.55 + (Math.random()*0.1 - 0.05);
      const botRate   = 0.65 + (Math.random()*0.1 - 0.05);
      const pixRate   = 0.45 + (Math.random()*0.1 - 0.05);
      const buyRate   = 0.35 + (Math.random()*0.08 - 0.04);
      const c = Math.round(w * clickRate);
      const b = Math.round(c * botRate);
      const p = Math.round(b * pixRate);
      const buy = Math.round(p * buyRate);

      labels.push(asISODate(d));
      welcome.push(w);
      cta_click.push(c);
      bot_start.push(b);
      pix_created.push(p);
      purchase.push(buy);
    });

    const cards = {
      welcome: welcome.reduce((a,b)=>a+b,0),
      cta_click: cta_click.reduce((a,b)=>a+b,0),
      bot_start: bot_start.reduce((a,b)=>a+b,0),
      pix_created: pix_created.reduce((a,b)=>a+b,0),
      purchase: purchase.reduce((a,b)=>a+b,0)
    };
    const rates = {
      welcome_to_click: cards.welcome > 0 ? cards.cta_click / cards.welcome : null,
      click_to_bot:     cards.cta_click > 0 ? cards.bot_start / cards.cta_click : null,
      bot_to_pix:       cards.bot_start > 0 ? cards.pix_created / cards.bot_start : null,
      pix_to_purchase:  cards.pix_created > 0 ? cards.purchase / cards.pix_created : null,
      welcome_to_purchase: cards.welcome > 0 ? cards.purchase / cards.welcome : null
    };
    return {
      cards,
      rates,
      series: { days: labels, welcome, cta_click, bot_start, pix_created, purchase }
    };
  }

  // ===================
  // Normalization helpers
  // ===================
  function normalizeResponseToSeries(resp){
    // Support either {cards,rates,series:{days,...}} or legacy array of points [{timestamp,welcome,click,bot,pix,purchase}]
    if(resp && resp.series && Array.isArray(resp.series.days)){
      const s = resp.series;
      const days = s.days.slice();
      return {
        days,
        welcome: (s.welcome || new Array(days.length).fill(0)).slice(),
        cta_click: (s.cta_click || s.click || new Array(days.length).fill(0)).slice(),
        bot_start: (s.bot_start || s.bot || new Array(days.length).fill(0)).slice(),
        pix_created: (s.pix_created || s.pix || new Array(days.length).fill(0)).slice(),
        purchase: (s.purchase || new Array(days.length).fill(0)).slice()
      };
    }
    if(Array.isArray(resp)){
      // Legacy points array
      const sorted = resp.slice().sort((a,b)=> new Date(a.timestamp) - new Date(b.timestamp));
      const byDay = new Map();
      sorted.forEach(p => {
        const d = new Date(p.timestamp);
        const day = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const cur = byDay.get(day) || {welcome:0, cta_click:0, bot_start:0, pix_created:0, purchase:0};
        cur.welcome += Number(p.welcome)||0;
        cur.cta_click += Number(p.cta_click ?? p.click) || 0;
        cur.bot_start += Number(p.bot_start ?? p.bot) || 0;
        cur.pix_created += Number(p.pix_created ?? p.pix) || 0;
        cur.purchase += Number(p.purchase)||0;
        byDay.set(day, cur);
      });
      const days = Array.from(byDay.keys()).sort();
      return {
        days,
        welcome: days.map(d => byDay.get(d).welcome),
        cta_click: days.map(d => byDay.get(d).cta_click),
        bot_start: days.map(d => byDay.get(d).bot_start),
        pix_created: days.map(d => byDay.get(d).pix_created),
        purchase: days.map(d => byDay.get(d).purchase)
      };
    }
    // Fallback empty
    return { days: [], welcome: [], cta_click: [], bot_start: [], pix_created: [], purchase: [] };
  }

  function computeCardsFromSeries(series){
    const sum = (arr) => arr.reduce((a,b)=>a+(Number(b)||0),0);
    return {
      welcome: sum(series.welcome),
      cta_click: sum(series.cta_click),
      bot_start: sum(series.bot_start),
      pix_created: sum(series.pix_created),
      purchase: sum(series.purchase)
    };
  }

  function computeRatesFromCards(cards){
    const safe = (n,d) => (d>0 ? n/d : null);
    return {
      welcome_to_click: safe(cards.cta_click, cards.welcome),
      click_to_bot:     safe(cards.bot_start, cards.cta_click),
      bot_to_pix:       safe(cards.pix_created, cards.bot_start),
      pix_to_purchase:  safe(cards.purchase, cards.pix_created),
      welcome_to_purchase: safe(cards.purchase, cards.welcome)
    };
  }

  function updateKpisFromCards(cards){
    $('kpiWelcome').textContent = formatNumber(cards.welcome);
    $('kpiClick').textContent   = formatNumber(cards.cta_click);
    $('kpiBot').textContent     = formatNumber(cards.bot_start);
    $('kpiPix').textContent     = formatNumber(cards.pix_created);
    $('kpiBuy').textContent     = formatNumber(cards.purchase);
  }

  function updateRatesFromRates(rates){
    $('rateWelcomeClick').textContent = formatPercent(rates.welcome_to_click);
    $('rateClickBot').textContent     = formatPercent(rates.click_to_bot);
    $('rateBotPix').textContent       = formatPercent(rates.bot_to_pix);
    $('ratePixBuy').textContent       = formatPercent(rates.pix_to_purchase);
    $('rateWelcomeBuy').textContent   = formatPercent(rates.welcome_to_purchase);
  }

  let chartRef = null;
  function ensureChart(){
    const ctx = $('funnelChart').getContext('2d');
    if(chartRef){ return chartRef; }
    chartRef = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#c9d1d9' } },
          tooltip: { mode: 'index', intersect: false }
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: {
          x: {
            ticks: { color: '#9aa4b2' },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y: {
            ticks: { color: '#9aa4b2' },
            grid: { color: 'rgba(255,255,255,0.06)' }
          }
        }
      }
    });
    return chartRef;
  }

  function updateChartFromSeries(series){
    const chart = ensureChart();
    const labels = series.days.slice();
    const dataset = (label, data, color) => ({
      label, data: data.map(v => Number(v)||0), borderColor: color, backgroundColor: color, tension: 0.25, fill: false
    });
    chart.data.labels = labels;
    chart.data.datasets = [
      dataset('Welcome', series.welcome, '#5aa9e6'),
      dataset('CTA Click', series.cta_click, '#f2c14e'),
      dataset('Entraram no Bot', series.bot_start, '#8bd450'),
      dataset('PIX Gerado', series.pix_created, '#ef8354'),
      dataset('Compraram', series.purchase, '#c678dd')
    ];
    chart.update();
  }

  function download(filename, content, type){
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function exportJson(resp){
    download('funil.json', JSON.stringify(resp, null, 2), 'application/json');
  }

  function exportCsvFromSeries(series){
    // Columns: day,welcome,cta_click,bot_start,pix_created,purchase
    const header = ['day','welcome','cta_click','bot_start','pix_created','purchase'];
    const lines = [header.join(',')];
    for(let i=0;i<series.days.length;i++){
      const row = [
        series.days[i],
        series.welcome[i] ?? 0,
        series.cta_click[i] ?? 0,
        series.bot_start[i] ?? 0,
        series.pix_created[i] ?? 0,
        series.purchase[i] ?? 0
      ];
      lines.push(row.join(','));
    }
    download('funil.csv', lines.join('\n'), 'text/csv');
  }

  // ===================
  // API layer with AbortController
  // ===================
  let currentController = null;
  let lastResponse = null; // raw API response
  let lastSeries = { days: [], welcome: [], cta_click: [], bot_start: [], pix_created: [], purchase: [] };

  async function callFunnelApi({ token, startDate, endDate, groupBy='daily', test=false, signal }){
    const params = new URLSearchParams();
    params.set('start', startDate.toISOString());
    params.set('end', endDate.toISOString());
    params.set('groupBy', groupBy);
    if(test) params.set('test', '1');

    const res = await fetch(`/api/funnel?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      signal
    });

    if(res.status === 401 || res.status === 403){
      // Avoid exposing details; keep UI stable
      throw Object.assign(new Error('Acesso não autorizado'), { code: res.status });
    }

    if(!res.ok){
      const text = await res.text().catch(()=> '');
      const msg = text && text.length < 140 ? text : `Erro ${res.status}`;
      throw new Error(msg);
    }
    const data = await res.json();
    return data;
  }

  async function loadData({ useTest, token, startDate, endDate, groupBy }){
    // Cancel previous
    if(currentController){ try{ currentController.abort(); }catch(_){} }
    currentController = new AbortController();

    if(useTest){
      // Try backend test endpoint first; if fails (404/network), fallback to local mock
      try{
        const resp = await callFunnelApi({ token, startDate, endDate, groupBy, test: true, signal: currentController.signal });
        return resp;
      }catch(err){
        // If unauthorized with test flag, ignore token requirement and use local mocks
        return generateTestSeries(startDate, endDate);
      }
    }

    // Real data
    return await callFunnelApi({ token, startDate, endDate, groupBy, test: false, signal: currentController.signal });
  }

  // ===================
  // Main handler
  // ===================
  function setButtonLoading(loading){
    const btn = $('loadButton');
    if(!btn) return;
    if(loading){
      btn.disabled = true;
      btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
      btn.textContent = 'Carregando… ⏳';
    } else {
      btn.disabled = false;
      if(btn.dataset.originalText){ btn.textContent = btn.dataset.originalText; delete btn.dataset.originalText; }
    }
  }

  async function handleLoad(){
    try{
      setStatus('Carregando…');
      setButtonLoading(true);

      const token = $('tokenInput').value.trim();
      const start = parseDatetimeLocal($('startInput').value);
      const end   = parseDatetimeLocal($('endInput').value);
      const grouping = $('groupingSelect').value || 'daily';
      const useTest = $('testdataCheckbox').checked;

      if(!start || !end){
        throw new Error('Informe datas válidas');
      }
      if(end < start){
        throw new Error('Data fim não pode ser menor que início');
      }
      if(!useTest && !token){
        throw new Error('Informe o token ou marque "Usar dados de teste"');
      }

      const resp = await loadData({ useTest, token, startDate: start, endDate: end, groupBy: grouping });

      // Normalize
      let series = normalizeResponseToSeries(resp);
      // If response empty, build zero series for selected period
      if(!series.days || series.days.length === 0){
        series = buildZeroSeriesForPeriod(start, end);
      }

      // Cards and rates
      const cards = resp && resp.cards ? resp.cards : computeCardsFromSeries(series);
      const rates = resp && resp.rates ? resp.rates : computeRatesFromCards(cards);

      // Update UI
      updateKpisFromCards(cards);
      updateRatesFromRates(rates);
      updateChartFromSeries(series);

      // Save last
      lastResponse = resp;
      lastSeries = series;
      window.__FUNNEL_LAST_RESPONSE__ = resp;
      window.__FUNNEL_SERIES__ = series;
      setStatus('Pronto');
    }catch(err){
      // Never log token. Keep message short.
      const message = (err && err.message) ? err.message : 'Erro ao carregar';
      setStatus(message, true);
      // Keep last chart as-is intentionally
    }finally{
      setButtonLoading(false);
    }
  }

  function init(){
    // Wire up elements
    $('loadButton').addEventListener('click', (e)=>{ e.preventDefault(); handleLoad(); });
    $('exportJsonBtn').addEventListener('click', ()=>{
      const resp = window.__FUNNEL_LAST_RESPONSE__ || lastResponse;
      if(!resp){ setStatus('Nada para exportar', true); return; }
      exportJson(resp);
    });
    $('exportCsvBtn').addEventListener('click', ()=>{
      const series = window.__FUNNEL_SERIES__ || lastSeries;
      if(!series || !series.days || !series.days.length){ setStatus('Nada para exportar', true); return; }
      exportCsvFromSeries(series);
    });

    // Token persistence (sessionStorage)
    const savedToken = sessionStorage.getItem(PANEL_TOKEN_KEY) || '';
    $('tokenInput').value = savedToken;
    $('tokenInput').addEventListener('input', (e)=>{
      const v = e.target.value || '';
      sessionStorage.setItem(PANEL_TOKEN_KEY, v);
    });

    // Defaults: start = now - 7d at current hh:mm; end = now (rounded to minute)
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0, 0);
    const start = new Date(end); start.setDate(end.getDate()-7);
    $('startInput').value = toDatetimeLocalString(start);
    $('endInput').value   = toDatetimeLocalString(end);

    // If token saved, prefer real data and autoload. Otherwise default to test data checked
    if(savedToken){
      $('testdataCheckbox').checked = false;
      // Pre-init empty chart to avoid layout shift
      ensureChart();
      // Auto load
      handleLoad();
    } else {
      $('testdataCheckbox').checked = true;
      ensureChart();
    }

    // Expose QA helper
    window.runFunnelQuickQA = async function(){
      try{
        console.log('[QA] Iniciando testes rápidos do funil…');
        const startVal = $('startInput').value; const endVal = $('endInput').value;
        const startDate = parseDatetimeLocal(startVal); const endDate = parseDatetimeLocal(endVal);

        // Teste 1: resposta vazia -> série de zeros com labels do período e cards 0
        const zeroSeries = buildZeroSeriesForPeriod(startDate, endDate);
        console.assert(zeroSeries.days.length > 0, 'Zero series deve ter labels');
        const cardsFromZero = computeCardsFromSeries(zeroSeries);
        console.assert(cardsFromZero.welcome === 0 && cardsFromZero.cta_click === 0 && cardsFromZero.bot_start === 0 && cardsFromZero.pix_created === 0 && cardsFromZero.purchase === 0, 'Cards devem ser 0 quando série é zerada');

        // Preparar gráfico com dados de teste
        const testData = generateTestSeries(startDate, endDate);
        const s = normalizeResponseToSeries(testData);
        updateChartFromSeries(s);
        const chartBeforeLabels = (chartRef && chartRef.data && chartRef.data.labels) ? chartRef.data.labels.slice() : [];

        // Teste 2: API cair (network error) mantém último gráfico e mostra erro
        const originalFetch = window.fetch;
        window.fetch = () => Promise.reject(new Error('NetworkError QA'));
        // Garantir token vazio e usar dados reais para acionar erro
        $('testdataCheckbox').checked = false;
        $('tokenInput').value = 'token-qa'; // ainda assim fetch falhará
        await handleLoad();
        const chartAfterLabels = (chartRef && chartRef.data && chartRef.data.labels) ? chartRef.data.labels.slice() : [];
        console.assert(Array.isArray(chartBeforeLabels) && chartBeforeLabels.length === chartAfterLabels.length, 'Gráfico deve permanecer igual após erro de rede');
        console.assert(statusEl().classList.contains('error'), 'Status deve indicar erro');
        window.fetch = originalFetch;

        // Teste 3: "Usar dados de teste" renderiza sem token
        $('testdataCheckbox').checked = true;
        $('tokenInput').value = '';
        // Simular indisponibilidade da API de teste para cair no mock local
        const originalFetch2 = window.fetch;
        window.fetch = () => Promise.reject(new Error('NetworkError QA testdata'));
        await handleLoad();
        const seriesRendered = window.__FUNNEL_SERIES__;
        console.assert(seriesRendered && seriesRendered.days && seriesRendered.days.length > 0, 'Dados de teste devem renderizar sem token');
        window.fetch = originalFetch2;

        console.log('[QA] ✅ Testes rápidos concluídos');
      }catch(e){
        console.error('[QA] ❌ Falha nos testes rápidos:', e);
      }
    };
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();