(function () {
  const DEFAULT_LINK = '';
  const REDIRECT_DELAY = 4000;
  const MAX_PIXEL_ATTEMPTS = 5;
  const PIXEL_RETRY_DELAY = 250;
  const EXTERNAL_ID_STORAGE_KEY = 'external_id_hash';
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const START_PAYLOAD_MAX_LENGTH = 64;
  const PAYLOAD_FALLBACK_ENDPOINT = '/api/gerar-payload';
  const PAYLOAD_FALLBACK_RETRY_DELAY = 200;

  let pixelReadyPromise = null;
  let userDataCache = null;
  let pageViewSent = false;
  let viewContentSent = false;
  let redirectEventSent = false;
  let geoDataCache = null;

  function readFromStorages(keys) {
    const storages = [];

    try {
      if (window.localStorage) {
        storages.push(window.localStorage);
      }
    } catch (error) {
      console.warn('Não foi possível acessar o localStorage.', error);
    }

    try {
      if (window.sessionStorage) {
        storages.push(window.sessionStorage);
      }
    } catch (error) {
      console.warn('Não foi possível acessar o sessionStorage.', error);
    }

    for (const storage of storages) {
      if (!storage) {
        continue;
      }

      for (const key of keys) {
        try {
          const value = storage.getItem(key);

          if (value) {
            return value;
          }
        } catch (error) {
          console.warn('Não foi possível ler valor do storage.', error);
        }
      }
    }

    return null;
  }

  function getStoredUtms() {
    const utmData = {};

    try {
      if (window.UTMTracking && typeof window.UTMTracking.get === 'function') {
        const stored = window.UTMTracking.get() || {};

        UTM_KEYS.forEach((key) => {
          if (stored && typeof stored === 'object' && stored[key]) {
            utmData[key] = stored[key];
          }
        });
      }
    } catch (error) {
      console.warn('Não foi possível recuperar UTMs via UTMTracking.', error);
    }

    try {
      if (window.localStorage) {
        UTM_KEYS.forEach((key) => {
          if (!utmData[key]) {
            const value = window.localStorage.getItem(key);

            if (value) {
              utmData[key] = value;
            }
          }
        });
      }
    } catch (error) {
      console.warn('Não foi possível recuperar UTMs do localStorage.', error);
    }

    return utmData;
  }

  function getRawFbp() {
    const cookieValue = getCookie('_fbp');

    if (cookieValue) {
      return cookieValue;
    }

    const storedValue = readFromStorages(['captured_fbp', 'fbp']);

    return storedValue || null;
  }

  function getRawFbc() {
    const cookieValue = getCookie('_fbc');

    if (cookieValue) {
      return cookieValue;
    }

    const storedValue = readFromStorages(['captured_fbc', 'fbc']);

    if (storedValue) {
      return storedValue;
    }

    const urlValue = parseFbcFromUrl();

    if (urlValue) {
      return urlValue;
    }

    try {
      if (window.fbclidHandler && typeof window.fbclidHandler.obterFbc === 'function') {
        const handlerValue = window.fbclidHandler.obterFbc();

        if (handlerValue) {
          return handlerValue;
        }
      }
    } catch (error) {
      console.warn('Não foi possível obter o _fbc via fbclidHandler.', error);
    }

    return null;
  }

  function encodePayloadToBase64(jsonString) {
    if (typeof window === 'undefined' || typeof window.btoa !== 'function') {
      return { base64: '', byteLength: 0 };
    }

    try {
      if (typeof TextEncoder !== 'undefined') {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(jsonString);
        let binary = '';
        const chunkSize = 0x8000;

        for (let index = 0; index < bytes.length; index += chunkSize) {
          const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
          binary += String.fromCharCode.apply(null, Array.from(chunk));
        }

        return {
          base64: window.btoa(binary),
          byteLength: bytes.length,
        };
      }

      const encoded = unescape(encodeURIComponent(jsonString));

      return {
        base64: window.btoa(encoded),
        byteLength: encoded.length,
      };
    } catch (error) {
      console.warn('Não foi possível converter o payload para Base64.', error);
      return { base64: '', byteLength: 0 };
    }
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

  function isHex64(value) {
    return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
  }

  function generateUuidV4() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }

    const buffer = new Uint8Array(16);

    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      window.crypto.getRandomValues(buffer);
    } else {
      for (let index = 0; index < buffer.length; index++) {
        buffer[index] = Math.floor(Math.random() * 256);
      }
    }

    buffer[6] = (buffer[6] & 0x0f) | 0x40;
    buffer[8] = (buffer[8] & 0x3f) | 0x80;

    const hex = Array.from(buffer, (value) => value.toString(16).padStart(2, '0'));
    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10, 16).join('')
    ].join('-');
  }

  function readExternalIdFromStorage() {
    try {
      if (window.localStorage) {
        return window.localStorage.getItem(EXTERNAL_ID_STORAGE_KEY);
      }
    } catch (error) {
      console.warn('Não foi possível ler o external_id_hash do localStorage.', error);
    }

    return null;
  }

  function readLegacyExternalId() {
    let legacyValue = null;

    try {
      if (window.localStorage) {
        legacyValue = window.localStorage.getItem('external_id');
      }
    } catch (error) {
      console.warn('Não foi possível ler o external_id legado do localStorage.', error);
    }

    if (!legacyValue) {
      legacyValue = getCookie('external_id');
    }

    return legacyValue;
  }

  function saveExternalId(hash) {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(EXTERNAL_ID_STORAGE_KEY, hash);
      }
    } catch (error) {
      console.warn('Não foi possível gravar o external_id_hash no localStorage.', error);
    }
  }

  let externalIdPromise = null;
  let externalIdReadyLogged = false;

  function setExternalIdReady(hash) {
    if (!isHex64(hash)) {
      return;
    }

    window.__EXTERNAL_ID__ = hash;

    if (!externalIdReadyLogged) {
      console.info('[TRACK] external_id ready:', hash);
      externalIdReadyLogged = true;
    }
  }

  function getExternalId() {
    if (!externalIdPromise) {
      externalIdPromise = (async () => {
        const storedHash = readExternalIdFromStorage();

        if (isHex64(storedHash)) {
          console.info('[TRACK] external_id loaded:', storedHash);
          setExternalIdReady(storedHash);
          return storedHash;
        }

        const legacyValue = readLegacyExternalId();

        if (isHex64(legacyValue)) {
          saveExternalId(legacyValue);
          console.info('[TRACK] external_id loaded:', legacyValue);
          setExternalIdReady(legacyValue);
          return legacyValue;
        }

        const uuid = generateUuidV4();
        const hash = await sha256(uuid);

        if (isHex64(hash)) {
          saveExternalId(hash);
          console.info('[TRACK] external_id created:', hash);
          setExternalIdReady(hash);
          return hash;
        }

        return null;
      })();
    }

    return externalIdPromise;
  }

  getExternalId();

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
        sha256(geoData.postal || geoData.zip || geoData.postalCode),
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

      const geoIp = geoData.ip || geoData.query;
      if (geoIp) {
        userData.client_ip_address = geoIp;
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

    const externalIdHash = window.__EXTERNAL_ID__;

    if (isHex64(externalIdHash)) {
      userData.external_id = externalIdHash;
    } else if (isHex64(externalId)) {
      userData.external_id = externalId;
      setExternalIdReady(externalId);
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
    const baseLinkFromServer = typeof window.BOT1_LINK_FROM_SERVER === 'string'
      ? window.BOT1_LINK_FROM_SERVER.trim()
      : '';
    const baseLink = baseLinkFromServer || DEFAULT_LINK;
    if (!baseLink) {
      console.warn('BOT1 link não configurado.');
      return;
    }
    const redirectBaseLink = baseLink.split('?')[0] || baseLink;
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

      await getExternalId();

      if (isHex64(window.__EXTERNAL_ID__)) {
        if (!userDataCache || userDataCache.external_id !== window.__EXTERNAL_ID__) {
          userDataCache = { ...(userDataCache || {}), external_id: window.__EXTERNAL_ID__ };
        }
      }

      const utms = getStoredUtms();
      const customData = {};

      UTM_KEYS.forEach((key) => {
        if (utms[key]) {
          customData[key] = utms[key];
        }
      });

      const leadPayload = {};

      if (Object.keys(customData).length > 0) {
        leadPayload.custom_data = customData;
      }

      if (userDataCache && Object.keys(userDataCache).length > 0) {
        leadPayload.user_data = userDataCache;
      }

      const utmDataPayload = {};
      UTM_KEYS.forEach((key) => {
        utmDataPayload[key] = utms[key] || null;
      });

      let zipHash = null;

      if (geoDataCache) {
        const postalCode = geoDataCache.postal || geoDataCache.zip || geoDataCache.postalCode;
        if (postalCode) {
          zipHash = await sha256(postalCode);
        }
      }

      const landingUrl = typeof window !== 'undefined' && window.location ? window.location.href : null;
      const clientIpAddress = geoDataCache ? (geoDataCache.ip || geoDataCache.query || null) : null;
      const payloadObject = {
        external_id: isHex64(window.__EXTERNAL_ID__) ? window.__EXTERNAL_ID__ : null,
        fbp: getRawFbp(),
        fbc: getRawFbc(),
        zip: zipHash,
        utm_data: utmDataPayload,
        client_ip_address: clientIpAddress,
        client_user_agent: navigator && navigator.userAgent ? navigator.userAgent : null,
        event_source_url: landingUrl,
        landing_url: landingUrl,
      };

      const { base64: base64Payload, byteLength: payloadByteLength } = encodePayloadToBase64(JSON.stringify(payloadObject));
      const base64Length = base64Payload ? base64Payload.length : 0;

      const fallbackRequestPayload = {
        utm_source: utmDataPayload.utm_source || null,
        utm_medium: utmDataPayload.utm_medium || null,
        utm_campaign: utmDataPayload.utm_campaign || null,
        utm_term: utmDataPayload.utm_term || null,
        utm_content: utmDataPayload.utm_content || null,
        fbp: payloadObject.fbp || null,
        fbc: payloadObject.fbc || null,
        ip: payloadObject.client_ip_address || null,
        user_agent: payloadObject.client_user_agent || null,
      };

      let finalStartParam = base64Payload || '';
      let fallbackPayloadId = null;

      if (base64Length > START_PAYLOAD_MAX_LENGTH) {
        const requestPayloadId = async () => {
          const response = await fetch(PAYLOAD_FALLBACK_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(fallbackRequestPayload),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();

          if (!data || !data.payload_id) {
            throw new Error('Resposta inválida do endpoint /api/gerar-payload');
          }

          return data.payload_id;
        };

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            fallbackPayloadId = await requestPayloadId();
            break;
          } catch (error) {
            console.warn(`[FALLBACK] tentativa ${attempt} falhou ao gerar payload_id`, error);
            if (attempt < 2) {
              await waitFor(PAYLOAD_FALLBACK_RETRY_DELAY);
            }
          }
        }

        if (fallbackPayloadId) {
          finalStartParam = fallbackPayloadId;
          console.info(`[FALLBACK] usando payload_id=${fallbackPayloadId}`);
        } else {
          console.warn('[FALLBACK] todas as tentativas falharam, usando payload Base64 mesmo assim');
        }
      } else {
        console.info(`[START] usando payload Base64 com length=${base64Length}`);
      }

      const finalUrl = `${redirectBaseLink}?start=${encodeURIComponent(finalStartParam)}`;

      console.info('[TRACK] Lead about to redirect');
      await trackMetaEvent('Lead', leadPayload);
      console.info(`[TRACK] start payload bytes=${payloadByteLength}`);
      console.info(`[TRACK] final redirect URL built (source=${fallbackPayloadId ? 'payload_id' : 'base64'})`);

      window.location.href = finalUrl;
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

      geoDataCache = geoData;

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
