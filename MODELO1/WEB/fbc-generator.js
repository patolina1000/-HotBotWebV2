(function() {
  /**
   * Gera o valor do cookie _fbc a partir do parâmetro fbclid e
   * persiste no localStorage e em document.cookie por 90 dias.
   * Nada é sobrescrito caso o valor já exista em algum lugar.
   */
  try {
    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get('fbclid');
    if (!fbclid) return;

    // Verifica se já existe valor salvo no localStorage ou nos cookies
  const hasStored = !!localStorage.getItem('fbc');
  const hasCookie = document.cookie.split('; ').some(c => c.startsWith('_fbc='));
  if (hasStored || hasCookie) return;

    const ts = Math.floor(Date.now() / 1000);
    const value = `fb.1.${ts}.${fbclid}`;

  function getRootDomain() {
    const host = location.hostname;
    const parts = host.split('.');
    if (parts.length >= 2) return '.' + parts.slice(-2).join('.');
    return host;
  }

  localStorage.setItem('fbc', value);
  let cookie = `_fbc=${encodeURIComponent(value)}; domain=${getRootDomain()}; path=/; max-age=7776000; samesite=Lax`;
  if (location.protocol === 'https:') cookie += '; secure';
  document.cookie = cookie;
  } catch (e) {
    console.error('fbc-generator error', e);
  }
})();
