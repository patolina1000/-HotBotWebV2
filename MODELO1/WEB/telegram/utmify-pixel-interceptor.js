(function (window) {
  'use strict';

  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var HEX64_REGEX = /^[a-f0-9]{64}$/i;
  var DEV_HOST_REGEX = /(localhost|127\.0\.0\.1|\.local|\.test|dev)/i;
  var isDev = false;

  try {
    isDev = DEV_HOST_REGEX.test(window.location && window.location.hostname);
  } catch (error) {
    isDev = false;
  }

  function logEnrichment(eventName, flags) {
    if (!isDev) {
      return;
    }

    try {
      console.info(
        '[PIXEL-INT] enrich ' + eventName +
          ' utms=' + flags.utms +
          ' user_data.ext=' + flags.external +
          ' fbp=' + flags.fbp +
          ' fbc=' + flags.fbc
      );
    } catch (error) {
      /* noop */
    }
  }

  function safeStorages() {
    var storages = [];

    try {
      if (window.localStorage) {
        storages.push(window.localStorage);
      }
    } catch (error) {
      console.warn('[PIXEL-INT] localStorage indisponível', error);
    }

    try {
      if (window.sessionStorage) {
        storages.push(window.sessionStorage);
      }
    } catch (error) {
      console.warn('[PIXEL-INT] sessionStorage indisponível', error);
    }

    return storages;
  }

  function readFromStorages(keys) {
    var storages = safeStorages();

    for (var i = 0; i < storages.length; i++) {
      var storage = storages[i];

      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];

        try {
          var value = storage.getItem(key);
          if (typeof value === 'string' && value) {
            return value;
          }
        } catch (error) {
          console.warn('[PIXEL-INT] Não foi possível ler o storage', error);
        }
      }
    }

    return null;
  }

  function getCookie(name) {
    try {
      var match = document.cookie.match(
        new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()\[\]\\\/\+^]/g, '\\$&') + '=([^;]*)')
      );
      return match ? decodeURIComponent(match[1]) : null;
    } catch (error) {
      console.warn('[PIXEL-INT] Não foi possível ler o cookie ' + name, error);
      return null;
    }
  }

  function getExternalId() {
    try {
      var value = window.__EXTERNAL_ID__;
      return HEX64_REGEX.test(value) ? value : null;
    } catch (error) {
      return null;
    }
  }

  function getFbp() {
    var cookieValue = getCookie('_fbp');
    if (cookieValue) {
      return cookieValue;
    }

    return readFromStorages(['captured_fbp', 'fbp']);
  }

  function getFbc() {
    var cookieValue = getCookie('_fbc');
    if (cookieValue) {
      return cookieValue;
    }

    var storedValue = readFromStorages(['captured_fbc', 'fbc']);
    if (storedValue) {
      return storedValue;
    }

    try {
      if (window.fbclidHandler && typeof window.fbclidHandler.obterFbc === 'function') {
        return window.fbclidHandler.obterFbc();
      }
    } catch (error) {
      console.warn('[PIXEL-INT] Não foi possível obter _fbc via fbclidHandler', error);
    }

    return null;
  }

  function getUtms() {
    var utms = {};

    try {
      if (window.UTMTracking && typeof window.UTMTracking.get === 'function') {
        var trackerValues = window.UTMTracking.get() || {};

        for (var i = 0; i < UTM_KEYS.length; i++) {
          var key = UTM_KEYS[i];
          var value = trackerValues[key];

          if (typeof value === 'string' && value) {
            utms[key] = value;
          }
        }
      }
    } catch (error) {
      console.warn('[PIXEL-INT] Não foi possível obter UTMs via UTMTracking', error);
    }

    for (var j = 0; j < UTM_KEYS.length; j++) {
      var utmKey = UTM_KEYS[j];

      if (!utms[utmKey]) {
        var storedValue = readFromStorages([utmKey]);
        if (storedValue) {
          utms[utmKey] = storedValue;
        }
      }
    }

    return utms;
  }

  function enrichPayload(eventName, payload) {
    if (!eventName || !payload || typeof payload !== 'object') {
      return { utms: false, external: false, fbp: false, fbc: false };
    }

    var utms = getUtms();
    var utmAdded = false;
    var hadCustomData = !!payload.custom_data && typeof payload.custom_data === 'object';
    var customData = hadCustomData ? payload.custom_data : {};

    for (var i = 0; i < UTM_KEYS.length; i++) {
      var key = UTM_KEYS[i];
      var value = utms[key];

      if (!value) {
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(customData, key)) {
        continue;
      }

      customData[key] = value;
      utmAdded = true;
    }

    if (utmAdded || hadCustomData) {
      payload.custom_data = customData;
    }

    var hadUserData = !!payload.user_data && typeof payload.user_data === 'object';
    var userData = hadUserData ? payload.user_data : {};
    var externalAdded = false;
    var fbpAdded = false;
    var fbcAdded = false;

    var externalId = getExternalId();
    if (externalId && !Object.prototype.hasOwnProperty.call(userData, 'external_id')) {
      userData.external_id = externalId;
      externalAdded = true;
    }

    var fbp = getFbp();
    if (fbp && !Object.prototype.hasOwnProperty.call(userData, 'fbp')) {
      userData.fbp = fbp;
      fbpAdded = true;
    }

    var fbc = getFbc();
    if (fbc && !Object.prototype.hasOwnProperty.call(userData, 'fbc')) {
      userData.fbc = fbc;
      fbcAdded = true;
    }

    if (externalAdded || fbpAdded || fbcAdded || hadUserData) {
      payload.user_data = userData;
    }

    return {
      utms: utmAdded,
      external: externalAdded,
      fbp: fbpAdded,
      fbc: fbcAdded
    };
  }

  function invokeWithEnrichment(invoker, context, argsLike) {
    var args = Array.prototype.slice.call(argsLike);

    if (args.length > 0 && args[0] === 'track') {
      var eventName = args.length > 1 ? args[1] : null;
      if (typeof eventName === 'string' && eventName) {
        var originalPayload = args.length > 2 ? args[2] : undefined;
        var hadOriginalPayload = !!originalPayload && typeof originalPayload === 'object';
        var payload = hadOriginalPayload ? originalPayload : {};

        if (!hadOriginalPayload) {
          if (args.length > 2) {
            args[2] = payload;
          } else {
            args.push(payload);
          }
        }

        var flags = enrichPayload(eventName, payload);
        var somethingAdded = flags.utms || flags.external || flags.fbp || flags.fbc;

        if (!hadOriginalPayload && !somethingAdded && Object.keys(payload).length === 0) {
          args.splice(2, 1);
        }

        logEnrichment(eventName, flags);
      }
    }

    return invoker.apply(context, args);
  }

  function installInterceptor() {
    var currentFbq = window.fbq;

    if (typeof currentFbq !== 'function') {
      return false;
    }

    if (currentFbq.__utmifyInterceptorInstalled) {
      return true;
    }

    var originalFbq = currentFbq;

    function interceptedFbq() {
      return invokeWithEnrichment(originalFbq, this, arguments);
    }

    interceptedFbq.__utmifyInterceptorInstalled = true;

    interceptedFbq.callMethod = function () {
      var invoker = typeof originalFbq.callMethod === 'function' ? originalFbq.callMethod : originalFbq;
      return invokeWithEnrichment(invoker, originalFbq, arguments);
    };

    interceptedFbq.queue = originalFbq.queue;
    interceptedFbq.loaded = originalFbq.loaded;
    interceptedFbq.version = originalFbq.version;
    interceptedFbq.push = interceptedFbq;

    try {
      for (var prop in originalFbq) {
        if (Object.prototype.hasOwnProperty.call(originalFbq, prop)) {
          if (prop === 'push' || prop === 'callMethod') {
            continue;
          }
          interceptedFbq[prop] = originalFbq[prop];
        }
      }
    } catch (error) {
      /* noop */
    }

    window.fbq = interceptedFbq;
    originalFbq.__utmifyInterceptorInstalled = true;

    return true;
  }

  if (!installInterceptor()) {
    var attempts = 0;
    var maxAttempts = 40;
    var interval = window.setInterval(function () {
      attempts += 1;
      if (installInterceptor() || attempts >= maxAttempts) {
        window.clearInterval(interval);
      }
    }, 50);
  }
})(window);
