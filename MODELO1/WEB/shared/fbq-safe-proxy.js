// [FIX-PIXEL-CONFLICT] fbq Safe Proxy + Enricher Registry (idempotente)
;(function () {
  'use strict';
  if (window.__FBQ_SAFE_PROXY_INSTALLED__) return;
  window.__FBQ_SAFE_PROXY_INSTALLED__ = true;

  const DEBUG = Boolean(window.DEBUG_FB_ENRICHERS || /[?&]fbq_debug=1\b/.test(location.search));

  function captureStack(label) {
    try { throw new Error(label); } catch (err) { return err.stack; }
  }

  function safeClone(value, seen) {
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (_) {}
    }
    if (value === null || typeof value !== 'object') return value;
    if (value instanceof Date) return new Date(value.getTime());
    if (value instanceof RegExp) return new RegExp(value.source, value.flags);
    seen = seen || new WeakMap();
    if (seen.has(value)) return seen.get(value);
    if (Array.isArray(value)) {
      var arr = [];
      seen.set(value, arr);
      for (var i = 0; i < value.length; i++) {
        arr[i] = safeClone(value[i], seen);
      }
      return arr;
    }
    var out = {};
    seen.set(value, out);
    for (var key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        out[key] = safeClone(value[key], seen);
      }
    }
    return out;
  }

  function containsPixelIdInSetUserData(args) {
    if (!Array.isArray(args)) return false;
    if (args[0] !== 'set' || args[1] !== 'userData') return false;
    if (args.length < 3) return false;
    var userData = args[2];
    return !!(userData && typeof userData === 'object' && !Array.isArray(userData) && Object.prototype.hasOwnProperty.call(userData, 'pixel_id'));
  }

  function containsPixelIdInInit(args) {
    if (!Array.isArray(args)) return false;
    if (args[0] !== 'init') return false;
    if (args.length < 3) return false;
    var advancedMatching = args[2];
    return !!(advancedMatching && typeof advancedMatching === 'object' && !Array.isArray(advancedMatching) && Object.prototype.hasOwnProperty.call(advancedMatching, 'pixel_id'));
  }

  function stripPixelIdEverywhere(args) {
    if (!Array.isArray(args)) return args;
    if (args[0] === 'set' && args[1] === 'userData' && args.length >= 3) {
      var userData = args[2];
      if (userData && typeof userData === 'object' && !Array.isArray(userData) && Object.prototype.hasOwnProperty.call(userData, 'pixel_id')) {
        try { delete userData.pixel_id; } catch (_) { userData.pixel_id = undefined; }
      }
    }
    if (args[0] === 'init' && args.length >= 3) {
      var advancedMatching = args[2];
      if (advancedMatching && typeof advancedMatching === 'object' && !Array.isArray(advancedMatching) && Object.prototype.hasOwnProperty.call(advancedMatching, 'pixel_id')) {
        try { delete advancedMatching.pixel_id; } catch (_) { advancedMatching.pixel_id = undefined; }
      }
    }
    return args;
  }

  function computeDiff(before, after) {
    var changes = [];

    function joinPath(path, key, isIndex) {
      if (!path) return isIndex ? '[' + key + ']' : key;
      return isIndex ? path + '[' + key + ']' : path + '.' + key;
    }

    function diffRec(b, a, path) {
      if (b === a) return;
      var bIsObj = b && typeof b === 'object';
      var aIsObj = a && typeof a === 'object';
      if (!bIsObj || !aIsObj) {
        if (b !== a) {
          changes.push({ path: path || '(root)', before: b, after: a });
        }
        return;
      }
      if (Array.isArray(b) || Array.isArray(a)) {
        var bArr = Array.isArray(b) ? b : [];
        var aArr = Array.isArray(a) ? a : [];
        var max = Math.max(bArr.length, aArr.length);
        for (var i = 0; i < max; i++) {
          diffRec(bArr[i], aArr[i], joinPath(path, i, true));
        }
        return;
      }
      var seenKeys = {};
      if (bIsObj) {
        for (var key in b) {
          if (Object.prototype.hasOwnProperty.call(b, key)) {
            seenKeys[key] = true;
          }
        }
      }
      if (aIsObj) {
        for (var key2 in a) {
          if (Object.prototype.hasOwnProperty.call(a, key2)) {
            seenKeys[key2] = true;
          }
        }
      }
      for (var prop in seenKeys) {
        diffRec(b ? b[prop] : undefined, a ? a[prop] : undefined, joinPath(path, prop, false));
      }
    }

    diffRec(before, after, '');
    return changes;
  }

  // Helper global: fbq pronto de verdade (lib real carregada)
  window.__fbqReady = function () {
    return typeof window.fbq === 'function' && typeof window.fbq.callMethod === 'function';
  };

  var enrichers = [];
  var ENRICHER_REGISTRY = window.__ENRICHER_REGISTRY__ = window.__ENRICHER_REGISTRY__ || [];
  var enricherIdCounter = ENRICHER_REGISTRY.length;

  window.__FBQ_SAFE_PROXY_REGISTER = function (fn, label) {
    if (typeof fn !== 'function') return;
    var script = (document && document.currentScript && document.currentScript.src) || null;
    var registeredAtStack = captureStack('register');
    var id = 'enricher#' + (++enricherIdCounter);
    var meta = { id: id, label: label || fn.name || 'anonymous', script: script, registeredAtStack: registeredAtStack };

    function fnWrapped(args) {
      var before = DEBUG ? safeClone(args) : null;
      var result;
      try {
        result = fn(args);
      } catch (err) {
        if (DEBUG) {
          console.error('[FBQ-ENRICHER] erro durante execução', { meta: meta, error: err });
        }
      }
      var outputArgs = Array.isArray(result) ? result : args;
      var after = DEBUG ? safeClone(outputArgs) : null;

      if (DEBUG && before && after) {
        var hadBefore = containsPixelIdInSetUserData(before) || containsPixelIdInInit(before);
        var hasAfter = containsPixelIdInSetUserData(after) || containsPixelIdInInit(after);
        if (!hadBefore && hasAfter) {
          console.group('[FBQ-ENRICHER] pixel_id ADICIONADO');
          console.log('meta:', meta);
          console.log('before:', before);
          console.log('after:', after);
          console.log('stack (chamada):', captureStack('call'));
          console.groupEnd();
        }
      }

      return result;
    }

    var registryEntry = {
      id: meta.id,
      label: meta.label,
      script: meta.script,
      registeredAtStack: meta.registeredAtStack,
      fnWrapped: fnWrapped
    };

    if (DEBUG) {
      console.group('[FBQ-ENRICHER] registered');
      console.log('meta:', meta);
      console.log('stack (registro):', registeredAtStack);
      console.groupEnd();
    }

    fnWrapped.__ENRICHER_ENTRY__ = registryEntry;
    enrichers.push(fnWrapped);
    ENRICHER_REGISTRY.push(registryEntry);
  };

  function cloneShallow(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    var out = {};
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    return out;
  }

  // Garantia: NUNCA mandar pixel_id para userData e NUNCA usar 4º argumento
  function sanitizeUserData(input, originalArgs) {
    // Garante objeto plano; ignora arrays/strings/null/etc.
    var o = (input && typeof input === 'object' && !Array.isArray(input)) ? cloneShallow(input) : {};
    // Remove pixel_id no clone
    if ('pixel_id' in o) { try { delete o.pixel_id; } catch (_) { o.pixel_id = undefined; } }
    // Defesa extra: tenta remover pixel_id também do objeto original passado à call
    try {
      if (originalArgs && originalArgs.length >= 3) {
        var ref = originalArgs[2];
        if (ref && typeof ref === 'object' && !Array.isArray(ref) && 'pixel_id' in ref) {
          delete ref.pixel_id;
        }
      }
    } catch (_) {}
    return o;
  }

  function applyWithSanitize(target, thisArg, args) {
    try {
      var a = Array.prototype.slice.call(args);
      if (DEBUG) {
        console.groupCollapsed('[FBQ-SAFE] args (pre-enrichers)');
        console.log(safeClone(a));
        console.groupEnd();
      }
      if (DEBUG && a[0] === 'set' && a[1] === 'userData') {
        console.group('[FBQ-SAFE] pre-sanitize check (set userData)');
        console.log('original args:', safeClone(args), 'len=', args.length);
        if (args.length > 3) {
          console.error('[FBQ-SAFE] 4º argumento detectado em set userData', { fourth: args[3] });
          console.trace('[FBQ-SAFE] set userData extra-arg stack');
        }
        console.groupEnd();
      }
      for (var i = 0; i < enrichers.length; i++) {
        var enricherFn = enrichers[i];
        var beforeEnricher = DEBUG ? safeClone(a) : null;
        var maybe;
        try {
          maybe = enricherFn(a);
        } catch (err) {
          if (DEBUG) {
            console.error('[FBQ-ENRICHER] exceção não capturada', { error: err });
          }
        }
        if (Array.isArray(maybe)) a = maybe;
        if (DEBUG) {
          var afterEnricher = safeClone(a);
          var diff = computeDiff(beforeEnricher, afterEnricher);
          var entry = enricherFn.__ENRICHER_ENTRY__;
          if (diff.length) {
            console.group('[FBQ-ENRICHER] run ' + (entry ? entry.id + ' (' + entry.label + ')' : '[desconhecido]'));
            if (entry) {
              console.log('meta:', { id: entry.id, label: entry.label, script: entry.script });
            }
            console.log('diff:', diff);
            console.log('before:', beforeEnricher);
            console.log('after:', afterEnricher);
            console.groupEnd();
          } else if (entry) {
            console.log('[FBQ-ENRICHER] run ' + entry.id + ' (' + entry.label + ') sem mudanças detectadas');
          }
        }
      }
      if (a[0] === 'set' && a[1] === 'userData') {
        a[2] = sanitizeUserData(a[2], args);
        a = a.slice(0, 3);
      }
      if (a[0] === 'init' && a.length >= 3) {
        if (a[2] && typeof a[2] === 'object' && !Array.isArray(a[2])) {
          if ('pixel_id' in a[2]) { try { delete a[2].pixel_id; } catch (_) { a[2].pixel_id = undefined; } }
        }
      }

      stripPixelIdEverywhere(a);

      if (DEBUG && a[0] === 'set' && a[1] === 'userData') {
        console.group('[FBQ-SAFE] post-sanitize (set userData)');
        console.log('sanitized args:', safeClone(a), 'len=', a.length);
        if (containsPixelIdInSetUserData(a)) {
          console.error('[FBQ-SAFE] pixel_id ainda presente no userData após sanitize-final');
          console.log('args:', safeClone(a));
          console.trace('[FBQ-SAFE] post-sanitize stack');
          throw new Error('[FBQ-SAFE] pixel_id presente após sanitize-final (debug)');
        }
        console.groupEnd();
      }

      if (DEBUG && (containsPixelIdInSetUserData(a) || containsPixelIdInInit(a))) {
        console.group('[FBQ-SAFE] pixel_id ainda presente após sanitize-final');
        console.log('args:', safeClone(a));
        console.log('__ENRICHER_REGISTRY__:', safeClone(ENRICHER_REGISTRY));
        console.log('stack:', captureStack('post-sanitize'));
        console.groupEnd();
        throw new Error('[FBQ-SAFE] pixel_id presente após sanitize-final (debug)');
      }

      return Reflect.apply(target, thisArg, a);
    } catch (err) {
      if (DEBUG) {
        console.error('[FBQ-SAFE] exceção no applyWithSanitize, usando args originais', { err: err, original: safeClone(args) });
      }
      return Reflect.apply(target, thisArg, args);
    }
  }

  function proxifyFunction(fn) {
    if (typeof fn !== 'function') return fn;
    if (fn.__FBQ_SAFE_PROXY__) return fn;
    var proxy = new Proxy(fn, {
      apply: function (target, thisArg, argumentsList) {
        return applyWithSanitize(target, thisArg, argumentsList);
      },
      get: function (target, prop, receiver) {
        var val = Reflect.get(target, prop, receiver);
        // Encadear proxy em callMethod/push (fila/execução interna do fbq)
        if (prop === 'callMethod' || prop === 'push') {
          return proxifyFunction(val);
        }
        return val;
      }
    });
    try { Object.defineProperty(proxy, '__FBQ_SAFE_PROXY__', { value: true }); } catch (_) {}
    return proxy;
  }

  function installOnce() {
    if (typeof window.fbq !== 'function') return false;
    if (window.fbq.__FBQ_SAFE_PROXY__) return true;
    // Importante: não perder shape; get trap reflete props dinâmicas (version/loaded/etc.)
    var proxied = proxifyFunction(window.fbq);
    // 🔒 Sanitizar qualquer item já enfileirado ANTES de instalar o proxy
    try {
      var q = window.fbq && window.fbq.queue;
      if (Array.isArray(q) && q.length) {
        if (DEBUG) {
          console.group('[FBQ-SAFE] queue snapshot (antes da limpeza)');
          console.log({ length: q.length, entries: safeClone(q) });
          console.groupEnd();
        }
        for (var i = 0; i < q.length; i++) {
          var originalItem = q[i] || [];
          var item = Array.prototype.slice.call(originalItem);
          if (DEBUG && (containsPixelIdInSetUserData(item) || containsPixelIdInInit(item))) {
            console.group('[FBQ-SAFE] queue item com pixel_id detectado');
            console.log('index:', i);
            console.log('raw:', safeClone(originalItem));
            console.groupEnd();
          }
          if (item[0] === 'set' && item[1] === 'userData') {
            item[2] = sanitizeUserData(item[2], item);
            item = item.slice(0, 3);
          } else if (item[0] === 'init' && item.length >= 3) {
            if (item[2] && typeof item[2] === 'object' && !Array.isArray(item[2]) && 'pixel_id' in item[2]) {
              try {
                delete item[2].pixel_id;
              } catch (_) {
                item[2].pixel_id = undefined;
              }
            }
          }
          stripPixelIdEverywhere(item);
          q[i] = item;
        }
        if (DEBUG) {
          console.group('[FBQ-SAFE] queue snapshot (após limpeza)');
          console.log({ length: q.length, entries: safeClone(q) });
          console.groupEnd();
        }
      }
    } catch (_) {}
    window.fbq = proxied;
    // Garante que o alias _fbq use o mesmo proxy (evita bypass)
    try { window._fbq = proxied; } catch (_) {}
    return true;
  }

  // Instalar quando a lib real estiver pronta; evitar redefinir várias vezes
  var tries = 0, timer = setInterval(function () {
    if (installOnce() || ++tries > 120) clearInterval(timer);
  }, 50);
})();
