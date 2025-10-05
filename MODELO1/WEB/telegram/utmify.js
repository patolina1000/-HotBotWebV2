(function (window) {
  'use strict';

  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var memoryStore = {};

  function assignUtms(target, source, overwrite) {
    if (!source) {
      return target;
    }

    for (var i = 0; i < UTM_KEYS.length; i++) {
      var key = UTM_KEYS[i];
      var value = source[key];

      if (!value) {
        continue;
      }

      if (!overwrite && target[key]) {
        continue;
      }

      target[key] = value;
    }

    return target;
  }

  function safeStorages() {
    var storages = [];

    try {
      if (window.localStorage) {
        storages.push(window.localStorage);
      }
    } catch (error) {
      console.warn('[UTMify] localStorage indisponível', error);
    }

    try {
      if (window.sessionStorage) {
        storages.push(window.sessionStorage);
      }
    } catch (error) {
      console.warn('[UTMify] sessionStorage indisponível', error);
    }

    return storages;
  }

  function decodeValue(value) {
    if (typeof value !== 'string') {
      return null;
    }

    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  function loadFromStorages() {
    var storages = safeStorages();
    var result = {};

    for (var i = 0; i < storages.length; i++) {
      var storage = storages[i];

      for (var j = 0; j < UTM_KEYS.length; j++) {
        var key = UTM_KEYS[j];

        if (result[key]) {
          continue;
        }

        try {
          var value = storage.getItem(key);
          if (typeof value === 'string' && value) {
            result[key] = value;
          }
        } catch (error) {
          console.warn('[UTMify] Não foi possível ler o storage', error);
        }
      }
    }

    return result;
  }

  function persistUtms(utms) {
    if (!utms) {
      return;
    }

    var storages = safeStorages();

    for (var i = 0; i < storages.length; i++) {
      var storage = storages[i];

      for (var j = 0; j < UTM_KEYS.length; j++) {
        var key = UTM_KEYS[j];
        var value = utms[key];

        if (!value) {
          continue;
        }

        try {
          storage.setItem(key, value);
        } catch (error) {
          console.warn('[UTMify] Não foi possível salvar no storage', error);
        }
      }
    }
  }

  function captureFromUrl() {
    var params;

    try {
      params = new URLSearchParams(window.location.search || '');
    } catch (error) {
      console.warn('[UTMify] Não foi possível processar a URL', error);
      return {};
    }

    var captured = {};

    for (var i = 0; i < UTM_KEYS.length; i++) {
      var key = UTM_KEYS[i];
      var rawValue = params.get(key);

      if (typeof rawValue === 'string' && rawValue.trim()) {
        var decoded = decodeValue(rawValue.trim());
        captured[key] = decoded || rawValue.trim();
      }
    }

    return captured;
  }

  function capture() {
    var captured = captureFromUrl();

    if (Object.keys(captured).length > 0) {
      assignUtms(memoryStore, captured, true);
      persistUtms(memoryStore);
    }

    return get();
  }

  function set(values) {
    if (!values || typeof values !== 'object') {
      return get();
    }

    assignUtms(memoryStore, values, true);
    persistUtms(memoryStore);
    return get();
  }

  function get() {
    var combined = {};

    assignUtms(combined, memoryStore, true);
    assignUtms(combined, loadFromStorages(), false);

    return combined;
  }

  memoryStore = assignUtms(memoryStore, loadFromStorages(), true);
  memoryStore = assignUtms(memoryStore, captureFromUrl(), true);
  persistUtms(memoryStore);

  window.UTMTracking = window.UTMTracking || {};
  window.UTMTracking.capture = capture;
  window.UTMTracking.set = set;
  window.UTMTracking.get = get;
})(window);
