(function (window, document) {
  'use strict';

  var COOKIE_NAME = '_fbc';
  var STORAGE_KEYS = ['fbc', 'captured_fbc'];
  var FBC_REGEX = /^fb\.1\.\d{13}\.[\w-]+$/;
  var MAX_AGE_DAYS = 90;

  function readCookie(name) {
    try {
      var match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()\[\]\\\/\+^]/g, '\\$&') + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    } catch (error) {
      console.warn('[fbclid-handler] Não foi possível ler o cookie', error);
      return null;
    }
  }

  function writeCookie(name, value, days) {
    try {
      var expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
      var parts = [name + '=' + encodeURIComponent(value), 'expires=' + expires, 'path=/', 'SameSite=Lax'];

      if (window.location && window.location.protocol === 'https:') {
        parts.push('Secure');
      }

      document.cookie = parts.join('; ');
    } catch (error) {
      console.warn('[fbclid-handler] Não foi possível gravar o cookie', error);
    }
  }

  function safeStorages() {
    var storages = [];

    try {
      if (window.localStorage) {
        storages.push(window.localStorage);
      }
    } catch (error) {
      console.warn('[fbclid-handler] localStorage indisponível', error);
    }

    try {
      if (window.sessionStorage) {
        storages.push(window.sessionStorage);
      }
    } catch (error) {
      console.warn('[fbclid-handler] sessionStorage indisponível', error);
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
          if (value) {
            return value;
          }
        } catch (error) {
          console.warn('[fbclid-handler] Não foi possível ler o storage', error);
        }
      }
    }

    return null;
  }

  function saveToStorages(value) {
    var storages = safeStorages();

    for (var i = 0; i < storages.length; i++) {
      var storage = storages[i];

      for (var j = 0; j < STORAGE_KEYS.length; j++) {
        try {
          storage.setItem(STORAGE_KEYS[j], value);
        } catch (error) {
          console.warn('[fbclid-handler] Não foi possível salvar no storage', error);
        }
      }
    }
  }

  function getFbclidFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      var value = params.get('fbclid');
      return value && value.trim() ? value.trim() : null;
    } catch (error) {
      console.warn('[fbclid-handler] Não foi possível ler fbclid da URL', error);
      return null;
    }
  }

  function buildFbc(fbclid) {
    return 'fb.1.' + Date.now() + '.' + fbclid;
  }

  function getStoredFbc() {
    var cookieValue = readCookie(COOKIE_NAME);
    if (cookieValue && FBC_REGEX.test(cookieValue)) {
      return cookieValue;
    }

    var storedValue = readFromStorages(STORAGE_KEYS);
    if (storedValue && FBC_REGEX.test(storedValue)) {
      return storedValue;
    }

    return null;
  }

  function ensureFbc() {
    var existingFbc = getStoredFbc();
    if (existingFbc) {
      return existingFbc;
    }

    var fbclid = getFbclidFromUrl();
    if (!fbclid) {
      return null;
    }

    var newFbc = buildFbc(fbclid);
    writeCookie(COOKIE_NAME, newFbc, MAX_AGE_DAYS);
    saveToStorages(newFbc);
    return newFbc;
  }

  function obterFbc() {
    return getStoredFbc() || ensureFbc();
  }

  ensureFbc();

  window.fbclidHandler = window.fbclidHandler || {};
  window.fbclidHandler.obterFbc = obterFbc;
  window.fbclidHandler.processar = ensureFbc;
})(window, document);
