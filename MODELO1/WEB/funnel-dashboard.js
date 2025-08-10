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

  function generateTestData(startDate, endDate){
    const points = [];
    const base = 1200 + Math.round(Math.random()*600);
    const days = daysBetweenInclusive(startDate, endDate);
    let trend = (Math.random()*0.2 - 0.1); // small trend

    days.forEach((d, idx) => {
      const dayFactor = 1 + trend*idx;
      const welcome = Math.max(50, Math.round(base * dayFactor * (0.9 + Math.random()*0.2)));
      const clickRate = 0.55 + (Math.random()*0.1 - 0.05);
      const botRate   = 0.65 + (Math.random()*0.1 - 0.05);
      const pixRate   = 0.45 + (Math.random()*0.1 - 0.05);
      const buyRate   = 0.35 + (Math.random()*0.08 - 0.04);
      const click = Math.round(welcome * clickRate);
      const bot   = Math.round(click   * botRate);
      const pix   = Math.round(bot     * pixRate);
      const buy   = Math.round(pix     * buyRate);
      const atNoon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
      points.push({
        timestamp: atNoon.toISOString(),
        welcome, click, bot, pix, purchase: buy
      });
    });
    return points;
  }

  async function fetchRealData(token, startDate, endDate, grouping){
    // Placeholder: expects a global window.FUNNEL_API_ENDPOINT returning array of points
    if(!window.FUNNEL_API_ENDPOINT){
      throw new Error('Endpoint não configurado (window.FUNNEL_API_ENDPOINT)');
    }
    const params = new URLSearchParams({
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      group: grouping
    });
    const res = await fetch(`${window.FUNNEL_API_ENDPOINT}?${params.toString()}`,{
      headers:{
        'Authorization': `Bearer ${token}`,
        'Accept':'application/json'
      }
    });
    if(!res.ok){
      const text = await res.text().catch(()=> '');
      const msg = `Erro ${res.status}${text?`: ${text}`:''}`;
      throw new Error(msg);
    }
    const data = await res.json();
    // Expect format [{timestamp, welcome, click, bot, pix, purchase}]
    return Array.isArray(data) ? data : [];
  }

  function computeTotals(points){
    return points.reduce((acc,p)=>{
      acc.welcome += p.welcome||0;
      acc.click   += p.click||0;
      acc.bot     += p.bot||0;
      acc.pix     += p.pix||0;
      acc.purchase+= p.purchase||0;
      return acc;
    },{welcome:0, click:0, bot:0, pix:0, purchase:0});
  }

  function computeRates(t){
    const safeRate = (num, den) => (den>0 ? (num/den) : null);
    return {
      welcomeClick: safeRate(t.click, t.welcome),
      clickBot:     safeRate(t.bot, t.click),
      botPix:       safeRate(t.pix, t.bot),
      pixBuy:       safeRate(t.purchase, t.pix),
      welcomeBuy:   safeRate(t.purchase, t.welcome)
    };
  }

  function updateKpis(totals){
    $('kpiWelcome').textContent = formatNumber(totals.welcome);
    $('kpiClick').textContent   = formatNumber(totals.click);
    $('kpiBot').textContent     = formatNumber(totals.bot);
    $('kpiPix').textContent     = formatNumber(totals.pix);
    $('kpiBuy').textContent     = formatNumber(totals.purchase);
  }

  function updateRates(rates){
    $('rateWelcomeClick').textContent = formatPercent(rates.welcomeClick);
    $('rateClickBot').textContent     = formatPercent(rates.clickBot);
    $('rateBotPix').textContent       = formatPercent(rates.botPix);
    $('ratePixBuy').textContent       = formatPercent(rates.pixBuy);
    $('rateWelcomeBuy').textContent   = formatPercent(rates.welcomeBuy);
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

  function updateChart(points){
    const chart = ensureChart();
    const labels = points.map(p => new Date(p.timestamp)).map(d => {
      const day = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
      return day;
    });
    const dataset = (label, key, color) => ({
      label, data: points.map(p => p[key]||0), borderColor: color, backgroundColor: color, tension: 0.25, fill: false
    });
    chart.data.labels = labels;
    chart.data.datasets = [
      dataset('Welcome','welcome','#5aa9e6'),
      dataset('CTA Click','click','#f2c14e'),
      dataset('Entraram no Bot','bot','#8bd450'),
      dataset('PIX Gerado','pix','#ef8354'),
      dataset('Compraram','purchase','#c678dd')
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

  function exportJson(points){
    download('funnel-data.json', JSON.stringify(points, null, 2), 'application/json');
  }

  function exportCsv(points){
    const header = ['timestamp','welcome','click','bot','pix','purchase'];
    const rows = points.map(p => [p.timestamp, p.welcome, p.click, p.bot, p.pix, p.purchase]);
    const lines = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    download('funnel-data.csv', lines, 'text/csv');
  }

  async function handleLoad(){
    try{
      setStatus('Carregando…');
      const token = $('tokenInput').value.trim();
      const start = parseDatetimeLocal($('startInput').value);
      const end   = parseDatetimeLocal($('endInput').value);
      const grouping = $('groupingSelect').value;
      const useTest = $('testdataCheckbox').checked;

      if(!start || !end || end < start){
        throw new Error('Intervalo de datas inválido');
      }

      if(!useTest && !token){
        throw new Error('Informe o token ou marque "Usar dados de teste"');
      }

      let points = [];
      if(useTest){
        points = generateTestData(start, end);
      } else {
        points = await fetchRealData(token, start, end, grouping);
      }

      // Normalize and sort by timestamp
      points = points.map(p => ({
        timestamp: p.timestamp,
        welcome: Number(p.welcome)||0,
        click: Number(p.click)||0,
        bot: Number(p.bot)||0,
        pix: Number(p.pix)||0,
        purchase: Number(p.purchase)||0
      })).sort((a,b)=> new Date(a.timestamp) - new Date(b.timestamp));

      const totals = computeTotals(points);
      const rates = computeRates(totals);

      updateKpis(totals);
      updateRates(rates);
      updateChart(points);

      // stash current points for export
      window.__FUNNEL_POINTS__ = points;
      setStatus('Pronto');
    }catch(err){
      console.error(err);
      setStatus(err.message || 'Erro ao carregar', true);
    }
  }

  function init(){
    // Wire up elements
    $('loadButton').addEventListener('click', (e)=>{ e.preventDefault(); handleLoad(); });
    $('exportJsonBtn').addEventListener('click', ()=>{
      const pts = window.__FUNNEL_POINTS__ || [];
      if(!pts.length){ setStatus('Nada para exportar', true); return; }
      exportJson(pts);
    });
    $('exportCsvBtn').addEventListener('click', ()=>{
      const pts = window.__FUNNEL_POINTS__ || [];
      if(!pts.length){ setStatus('Nada para exportar', true); return; }
      exportCsv(pts);
    });

    // Token persistence (sessionStorage)
    const savedToken = sessionStorage.getItem(PANEL_TOKEN_KEY) || '';
    $('tokenInput').value = savedToken;
    $('tokenInput').addEventListener('input', (e)=>{
      const v = e.target.value || '';
      sessionStorage.setItem(PANEL_TOKEN_KEY, v);
    });

    // Defaults: last 7 days
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0, 0);
    const start = new Date(end); start.setDate(end.getDate()-6); start.setHours(0,0,0,0);
    $('startInput').value = toDatetimeLocalString(start);
    $('endInput').value   = toDatetimeLocalString(end);

    // Default to test data checked for easier first run
    $('testdataCheckbox').checked = true;

    // Pre-init empty chart
    ensureChart();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();