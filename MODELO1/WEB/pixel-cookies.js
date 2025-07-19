(function() {
  function getCookie(name) {
    return document.cookie
      .split('; ')
      .find(row => row.startsWith(name + '='))
      ?.split('=')[1];
  }

  function getRootDomain() {
    const host = location.hostname;
    const parts = host.split('.');
    if (parts.length >= 2) {
      return '.' + parts.slice(-2).join('.');
    }
    return host;
  }

  function setRootCookie(name, value, maxAgeSeconds) {
    let cookie = `${name}=${encodeURIComponent(value)}; domain=${getRootDomain()}; path=/; samesite=Lax`;
    if (location.protocol === 'https:') cookie += '; secure';
    if (typeof maxAgeSeconds === 'number') cookie += `; max-age=${maxAgeSeconds}`;
    document.cookie = cookie;
  }

  function ensurePixelCookies() {
    let fbp = getCookie('_fbp');
    if (!fbp) {
      fbp = `FB.1.${Date.now()}.${Math.random().toString(36).substring(2, 10)}`;
    }
    setRootCookie('_fbp', fbp, 7776000);
    try { localStorage.setItem('fbp', fbp); } catch (e) {}

    let fbc = getCookie('_fbc');
    if (!fbc) {
      const fbclid = new URLSearchParams(location.search).get('fbclid');
      const base = fbclid || Math.random().toString(36).substring(2, 10);
      fbc = `FB.1.${Math.floor(Date.now() / 1000)}.${base}`;
    }
    setRootCookie('_fbc', fbc, 7776000);
    try { localStorage.setItem('fbc', fbc); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    window.addEventListener('load', ensurePixelCookies);
  } else {
    ensurePixelCookies();
  }
})();
