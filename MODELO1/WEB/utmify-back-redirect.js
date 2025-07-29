(function() {
  const utmKeys = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
  const params = new URLSearchParams(window.location.search);
  utmKeys.forEach(k => {
    const val = params.get(k) || localStorage.getItem(k);
    if (val) {
      localStorage.setItem(k, val);
    }
  });
  const query = utmKeys.map(k => {
    const v = localStorage.getItem(k);
    return v ? `${k}=${encodeURIComponent(v)}` : null;
  }).filter(Boolean).join('&');
  const redirectUrl = `${window.location.pathname}${query ? '?' + query : ''}`;
  window.history.pushState({}, '', window.location.href);
  window.addEventListener('popstate', function() {
    window.location.replace(redirectUrl);
  });
})();
