(function (window) {
  const GEO_ENDPOINT = '/api/geo';
  let geoDataCache = null;
  let geoRequestPromise = null;

  function normalizeGeoResponse(raw) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const city = raw.city || null;
    const region = raw.region || null;
    const country = raw.country || null;
    const postal = raw.postal || null;
    const ip = raw.ip || null;

    if (![city, region, country, postal, ip].some(Boolean)) {
      return null;
    }

    return {
      city,
      region,
      regionName: region,
      country,
      countryCode: country,
      postal,
      postalCode: postal,
      zip: postal,
      ip,
      query: ip,
    };
  }

  async function requestGeoData() {
    if (geoDataCache) {
      return geoDataCache;
    }

    if (geoRequestPromise) {
      return geoRequestPromise;
    }

    geoRequestPromise = (async () => {
      try {
        const response = await fetch(GEO_ENDPOINT, {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        const normalized = normalizeGeoResponse(payload);

        if (normalized) {
          geoDataCache = normalized;
          console.info('[geo] dados de geolocalização recebidos');
        } else {
          console.info('[geo] dados de geolocalização indisponíveis');
        }

        return normalized;
      } catch (error) {
        const message = error && error.message ? error.message : error;
        console.warn('[geo] falha ao obter geolocalização', message);
        return null;
      } finally {
        geoRequestPromise = null;
      }
    })();

    return geoRequestPromise;
  }

  async function detectCityAndUpdate(target, options = {}) {
    const element = typeof target === 'string' ? document.getElementById(target) : target;

    if (!element) {
      console.warn('[geo] elemento alvo não encontrado');
      return null;
    }

    const {
      loadingText = 'Detectando...',
      fallbackText = loadingText,
    } = options;

    element.textContent = loadingText;

    try {
      const geoData = await requestGeoData();

      if (geoData && geoData.city) {
        element.textContent = geoData.city;
        console.info('[geo] cidade detectada');
      } else {
        element.textContent = fallbackText;
      }

      return geoData;
    } catch (error) {
      const message = error && error.message ? error.message : error;
      console.warn('[geo] erro ao atualizar cidade', message);
      element.textContent = fallbackText;
      return null;
    }
  }

  window.detectCityAndUpdate = detectCityAndUpdate;
  window.requestGeoData = requestGeoData;
})(window);
