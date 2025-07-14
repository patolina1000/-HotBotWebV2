(function() {
  const utmKeys = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content'
  ];

  // Salva parâmetros da URL no localStorage
  try {
    const params = new URLSearchParams(window.location.search);
    utmKeys.forEach(key => {
      const value = params.get(key);
      if (value !== null) {
        localStorage.setItem(key, value);
      }
    });
  } catch (e) {
    console.error('Erro ao capturar UTMs', e);
  }

  function getUtmData() {
    const data = {};
    utmKeys.forEach(k => {
      const v = localStorage.getItem(k);
      if (v) data[k] = v;
    });
    return data;
  }

  const originalFetch = window.fetch;
  window.fetch = function(resource, options = {}) {
    try {
      const opts = options || {};
      const method = String(opts.method || 'GET').toUpperCase();
      if (method === 'POST') {
        const headers = opts.headers instanceof Headers
          ? opts.headers
          : new Headers(opts.headers || {});
        const contentType = headers.get('Content-Type') || headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          let bodyObj = {};
          if (opts.body) {
            try {
              bodyObj = typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body;
            } catch (e) {
              console.warn('Não foi possível ler body JSON para anexar UTMs');
            }
          }
          opts.body = JSON.stringify(Object.assign({}, bodyObj, getUtmData()));
          headers.set('Content-Type', 'application/json');
          opts.headers = headers;
        }
      }
      return originalFetch(resource, opts);
    } catch (err) {
      console.error('Erro ao processar fetch com UTMs', err);
      return originalFetch(resource, options);
    }
  };
})();
