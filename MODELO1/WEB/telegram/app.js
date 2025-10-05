(function () {
  const DEFAULT_LINK = 'https://t.me/bot1';
  const REDIRECT_DELAY = 4000;

  function buildTargetUrl(baseLink, searchParams) {
    const params = new URLSearchParams(searchParams);
    let startValue = '';

    if (params.has('payload_id')) {
      startValue = params.get('payload_id') || '';
    } else if (params.has('start')) {
      startValue = params.get('start') || '';
    }

    let target = baseLink || DEFAULT_LINK;

    if (startValue) {
      const separator = target.includes('?') ? '&' : '?';
      target += `${separator}start=${encodeURIComponent(startValue)}`;
    }

    return target;
  }

  function updateCountdown(element, milliseconds) {
    if (!element) return;
    const seconds = Math.ceil(Math.max(milliseconds, 0) / 1000);
    element.textContent = `Redirecionando em ${seconds} segundos...`;
  }

  function animateProgress(barElement, countdownElement, duration) {
    if (!barElement) return;

    let startTimestamp = null;

    const step = (timestamp) => {
      if (startTimestamp === null) {
        startTimestamp = timestamp;
      }

      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);

      barElement.style.width = `${progress * 100}%`;
      updateCountdown(countdownElement, duration - elapsed);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }

  function createRandomSeed() {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const randomValues = new Uint32Array(4);
      window.crypto.getRandomValues(randomValues);
      return Array.from(randomValues)
        .map((value) => value.toString(36))
        .join('');
    }

    return `${Math.random()}`.slice(2);
  }

  async function sha256(value) {
    if (value === undefined || value === null) {
      return null;
    }

    if (!window.crypto || !window.crypto.subtle || typeof TextEncoder === 'undefined') {
      console.warn('Web Crypto API indisponível: dados não serão hashados.');
      return null;
    }

    const normalized = String(value).toLowerCase().trim();

    if (!normalized) {
      return null;
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);

    try {
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.warn('Não foi possível calcular o hash SHA-256.', error);
      return null;
    }
  }

  async function buildUserData(geoData) {
    const userData = {};

    if (navigator && navigator.userAgent) {
      userData.client_user_agent = navigator.userAgent;
    }

    if (geoData && typeof geoData === 'object') {
      const [cityHash, stateHash, countryHash] = await Promise.all([
        sha256(geoData.city),
        sha256(geoData.regionName || geoData.region),
        sha256(geoData.countryCode || geoData.country),
      ]);

      if (cityHash) {
        userData.ct = cityHash;
      }

      if (stateHash) {
        userData.st = stateHash;
      }

      if (countryHash) {
        userData.country = countryHash;
      }

      if (geoData.query) {
        userData.client_ip_address = geoData.query;
      }
    }

    const externalId = await sha256(`${Date.now()}-${createRandomSeed()}`);

    if (externalId) {
      userData.external_id = externalId;
    }

    return userData;
  }

  async function ensurePixelReady() {
    try {
      if (window.__fbPixelConfigPromise && typeof window.__fbPixelConfigPromise.then === 'function') {
        await window.__fbPixelConfigPromise;
      }
    } catch (error) {
      console.warn('Não foi possível inicializar o Meta Pixel.', error);
    }

    const pixelFn = window.fbq;

    if (typeof pixelFn === 'function' && window.__FB_PIXEL_ID__) {
      return true;
    }

    console.warn('Meta Pixel não disponível ou Pixel ID ausente.');
    return false;
  }

  function trackMetaEvent(eventName, payload = null) {
    const pixelFn = window.fbq;

    if (typeof pixelFn !== 'function') {
      return;
    }

    try {
      if (payload && Object.keys(payload).length > 0) {
        pixelFn('track', eventName, payload);
      } else {
        pixelFn('track', eventName);
      }
    } catch (error) {
      console.warn(`Não foi possível enviar o evento ${eventName} para o Meta Pixel.`, error);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const baseLink = window.BOT1_LINK_FROM_SERVER || DEFAULT_LINK;
    const targetUrl = buildTargetUrl(baseLink, window.location.search);
    const countdownEl = document.getElementById('countdown');
    const progressBar = document.getElementById('progress-bar');
    const loadTimestamp = Date.now();

    let viewContentPayload = { content_type: 'product' };
    let viewContentTriggered = false;

    const triggerViewContent = () => {
      if (viewContentTriggered) {
        return;
      }

      if (typeof window.fbq !== 'function') {
        window.setTimeout(triggerViewContent, 250);
        return;
      }

      viewContentTriggered = true;
      trackMetaEvent('ViewContent', viewContentPayload);
    };

    const redirectToTarget = () => {
      triggerViewContent();
      window.location.href = targetUrl;
    };

    updateCountdown(countdownEl, REDIRECT_DELAY);
    animateProgress(progressBar, countdownEl, REDIRECT_DELAY);

    window.setTimeout(redirectToTarget, REDIRECT_DELAY);

    (async () => {
      let geoResponse = null;

      if (typeof window.detectCityAndUpdate === 'function') {
        try {
          geoResponse = await window.detectCityAndUpdate('city', {
            loadingText: 'Detectando...',
            fallbackText: 'Detectando...'
          });
        } catch (error) {
          console.warn('Não foi possível obter os dados de geolocalização.', error);
        }
      }

      const geoData = geoResponse && typeof geoResponse === 'object'
        ? geoResponse
        : geoResponse
          ? { city: geoResponse }
          : null;

      const userData = await buildUserData(geoData);
      const pixelReady = await ensurePixelReady();

      if (!pixelReady) {
        return;
      }

      const pageViewPayload = {};

      if (Object.keys(userData).length > 0) {
        pageViewPayload.user_data = userData;
        viewContentPayload.user_data = userData;
      }

      trackMetaEvent('PageView', pageViewPayload);

      const elapsed = Date.now() - loadTimestamp;
      const remainingDelay = Math.max(REDIRECT_DELAY - elapsed, 0);

      window.setTimeout(triggerViewContent, remainingDelay);
    })();
  });
})();
