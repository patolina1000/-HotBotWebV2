(function (window) {
  const PRIMARY_ENDPOINT = "https://pro.ip-api.com/json/?key=R1a8D9VJfrqTqpY&fields=status,country,countryCode,region,regionName,city,query";

  async function requestGeoData() {
    const response = await fetch(PRIMARY_ENDPOINT);
    const data = await response.json();

    if (data && data.status === "success") {
      return data;
    }

    return null;
  }

  async function detectCityAndUpdate(target, options = {}) {
    const element = typeof target === "string" ? document.getElementById(target) : target;

    if (!element) {
      console.warn("detectCityAndUpdate: elemento não encontrado", target);
      return null;
    }

    const {
      loadingText = "Detectando...",
      fallbackText = loadingText,
    } = options;

    element.textContent = loadingText;

    try {
      const geoData = await requestGeoData();

      if (geoData && geoData.city) {
        element.textContent = geoData.city;
        console.log('GeoData detectado:', geoData);
        return geoData;
      }

      element.textContent = fallbackText;
      console.log('Fallback: GeoData não detectado ou status != success');
      return null;
    } catch (error) {
      console.log("Fallback: Erro na API de geolocalização", error);
      element.textContent = fallbackText;
      return null;
    }
  }

  window.detectCityAndUpdate = detectCityAndUpdate;
})(window);
