(function() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get('fbclid');
    if (!fbclid) return;
    const ts = Math.floor(Date.now() / 1000);
    const value = `fb.1.${ts}.${fbclid}`;
    localStorage.setItem('fbc', value);
    document.cookie = `_fbc=${encodeURIComponent(value)}; path=/; max-age=63072000`;
  } catch (e) {
    console.error('fbc-generator error', e);
  }
})();
