(function () {
  const DEFAULT_LINK = 'https://t.me/bot1';
  const REDIRECT_DELAY = 4000;
  const MAX_PIXEL_ATTEMPTS = 5;
  const PIXEL_RETRY_DELAY = 250;

  let pixelReadyPromise = null;
  let userDataCache = null;
  let pageViewSent = false;
  let viewContentSent = false;
  let redirectEventSent = false;

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

  function waitFor(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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

  function getCookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.$?*|{}()\[\]\\\/\+^]/g, '\\$&')}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  }

  function persistExternalId(value) {
    try {
      setCookie('external_id', value, 30);
    } catch (error) {
      console.warn('Não foi possível gravar o cookie external_id.', error);
    }

    try {
      if (window.localStorage) {
        window.localStorage.setItem('external_id', value);
      }
    } catch (error) {
      console.warn('Não foi possível gravar o external_id no localStorage.', error);
    }
  }

  function readStoredExternalId() {
    const cookieValue = getCookie('external_id');

    if (cookieValue) {
      return cookieValue;
    }

    try {
      if (window.localStorage) {
        const stored = window.localStorage.getItem('external_id');
        if (stored) {
          return stored;
        }
      }
    } catch (error) {
      console.warn('Não foi possível ler o external_id do localStorage.', error);
    }

    return null;
  }

  async function getExternalId() {
    const storedValue = readStoredExternalId();

    if (storedValue) {
      if (/^[a-f0-9]{64}$/i.test(storedValue)) {
        persistExternalId(storedValue);
        return storedValue;
      }

      const hashedStored = await sha256(storedValue);

      if (hashedStored) {
        persistExternalId(hashedStored);
        return hashedStored;
      }
    }

    const seed = `${createRandomSeed()}-${Date.now()}`;
    const hashedSeed = await sha256(seed);

    if (hashedSeed) {
      persistExternalId(hashedSeed);
      return hashedSeed;
    }

    return null;
  }

  function parseFbcFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('_fbc') || null;
    } catch (error) {
      console.warn('Não foi possível extrair o parâmetro _fbc da URL.', error);
      return null;
    }
  }

  function getFbpFromCookie() {
    return getCookie('_fbp');
  }

  async function buildUserData(geoData) {
    const userData = {};

    if (navigator && navigator.userAgent) {
      userData.client_user_agent = navigator.userAgent;
    }

    if (geoData && typeof geoData === 'object') {
      const [cityHash, stateHash, countryHash, zipHash] = await Promise.all([
        sha256(geoData.city),
        sha256(geoData.regionName || geoData.region),
        sha256(geoData.countryCode || geoData.country),
        sha256(geoData.zip || geoData.postal || geoData.postalCode),
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

      if (zipHash) {
        userData.zp = zipHash;
      }

      if (geoData.query) {
        userData.client_ip_address = geoData.query;
      }
    }

    const [externalId, fbcValue, fbpValue] = await Promise.all([
      getExternalId(),
      (async () => {
        const value = parseFbcFromUrl();
        return value ? sha256(value) : null;
      })(),
      (async () => {
        const value = getFbpFromCookie();
        return value ? sha256(value) : null;
      })(),
    ]);

    if (externalId) {
      userData.external_id = externalId;
    }

    if (fbcValue) {
      userData.fbc = fbcValue;
    }

    if (fbpValue) {
      userData.fbp = fbpValue;
    }

    return userData;
  }

  function ensurePixelReady() {
    if (!pixelReadyPromise) {
      pixelReadyPromise = (async () => {
        for (let attempt = 1; attempt <= MAX_PIXEL_ATTEMPTS; attempt++) {
          try {
            if (window.__fbPixelConfigPromise && typeof window.__fbPixelConfigPromise.then === 'function') {
              await window.__fbPixelConfigPromise;
            }
          } catch (error) {
            console.warn('Não foi possível inicializar o Meta Pixel.', error);
          }

          if (typeof window.fbq === 'function' && window.__FB_PIXEL_ID__) {
            return true;
          }

          if (attempt < MAX_PIXEL_ATTEMPTS) {
            await waitFor(PIXEL_RETRY_DELAY);
          }
        }

        console.warn('Meta Pixel não disponível após múltiplas tentativas.');
        return false;
      })();
    }

    return pixelReadyPromise;
  }

  async function trackMetaEvent(eventName, payload = null) {
    const ready = await ensurePixelReady();

    if (!ready) {
      return false;
    }

    const pixelFn = window.fbq;

    if (typeof pixelFn !== 'function') {
      return false;
    }

    try {
      if (payload && Object.keys(payload).length > 0) {
        pixelFn('track', eventName, payload);
      } else {
        pixelFn('track', eventName);
      }

      return true;
    } catch (error) {
      console.warn(`Não foi possível enviar o evento ${eventName} para o Meta Pixel.`, error);
      return false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const baseLink = window.BOT1_LINK_FROM_SERVER || DEFAULT_LINK;
    const targetUrl = buildTargetUrl(baseLink, window.location.search);
    const countdownEl = document.getElementById('countdown');
    const progressBar = document.getElementById('progress-bar');
    const loadTimestamp = Date.now();

    updateCountdown(countdownEl, REDIRECT_DELAY);
    animateProgress(progressBar, countdownEl, REDIRECT_DELAY);

    const viewContentPayload = { content_type: 'product' };

    const sendViewContent = async () => {
      if (viewContentSent) {
        return;
      }

      viewContentSent = true;
      const payload = { ...viewContentPayload };

      if (userDataCache && Object.keys(userDataCache).length > 0) {
        payload.user_data = userDataCache;
      }

      await trackMetaEvent('ViewContent', payload);
    };

    const triggerRedirect = async () => {
      if (redirectEventSent) {
        return;
      }

      redirectEventSent = true;

      await sendViewContent();

      const redirectPayload = {};

      if (userDataCache && Object.keys(userDataCache).length > 0) {
        redirectPayload.user_data = userDataCache;
      }

      await trackMetaEvent('RedirectInitiated', redirectPayload);
      window.location.href = targetUrl;
    };

    window.setTimeout(() => {
      triggerRedirect();
    }, REDIRECT_DELAY);

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

      userDataCache = await buildUserData(geoData);

      const pageViewPayload = {};

      if (userDataCache && Object.keys(userDataCache).length > 0) {
        pageViewPayload.user_data = userDataCache;
      }

      if (!pageViewSent) {
        pageViewSent = true;
        await trackMetaEvent('PageView', pageViewPayload);
      }

      const elapsed = Date.now() - loadTimestamp;
      const remainingDelay = Math.max(REDIRECT_DELAY - elapsed, 0);

      if (remainingDelay > PIXEL_RETRY_DELAY) {
        window.setTimeout(() => {
          sendViewContent();
        }, Math.max(0, remainingDelay - PIXEL_RETRY_DELAY));
      } else {
        await sendViewContent();
      }
    })();
  });
})();
