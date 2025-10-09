// [FIX-PIXEL-CONFLICT] fbq Safe Proxy + Enricher Registry (idempotente)
;(function () {
  'use strict';
  if (window.__FBQ_SAFE_PROXY_INSTALLED__) return;
  window.__FBQ_SAFE_PROXY_INSTALLED__ = true;

  var enrichers = [];
  // Outras partes do código (ex.: UTMify) podem registrar transformadores de chamadas do fbq
  window.__FBQ_SAFE_PROXY_REGISTER = function (fn) {
    if (typeof fn === 'function') enrichers.push(fn);
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
      // Aplicar enrichers registrados (transformam args; devem retornar o array novo ou falsy p/ manter)
      for (var i = 0; i < enrichers.length; i++) {
        try {
          var maybe = enrichers[i](a);
          if (Array.isArray(maybe)) a = maybe;
        } catch (_) { /* ignore enricher errors */ }
      }
      // Sanitização: set('userData', userData[, pixelId])
      if (a[0] === 'set' && a[1] === 'userData') {
        a[2] = sanitizeUserData(a[2], args);
        // Nunca permitir 4º argumento
        a = a.slice(0, 3);
      }
      // Sanitização: init(pixelId, advancedMatching, options)
      // Assinatura comum: init, pixelId, advancedMatching, options
      if (a[0] === 'init' && a.length >= 3) {
        if (a[2] && typeof a[2] === 'object' && !Array.isArray(a[2])) {
          if ('pixel_id' in a[2]) { try { delete a[2].pixel_id; } catch (_) { a[2].pixel_id = undefined; } }
        }
      }
      return Reflect.apply(target, thisArg, a);
    } catch (_) {
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
