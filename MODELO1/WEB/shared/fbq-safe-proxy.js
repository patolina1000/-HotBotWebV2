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
  function sanitizeUserData(input) {
    var o = cloneShallow(input) || {};
    if (o && typeof o === 'object' && 'pixel_id' in o) delete o.pixel_id;
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
      // Sanitização específica do userData
      if (a[0] === 'set' && a[1] === 'userData') {
        a[2] = sanitizeUserData(a[2]);
        // garantir máximo de 3 argumentos (evita erro do 4º arg)
        a = a.slice(0, 3);
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
    // Importante: não perder shape; usamos get trap para refletir props dinâmicas (version/loaded/etc.)
    window.fbq = proxifyFunction(window.fbq);
    return true;
  }

  // Instalar quando a lib real estiver pronta; evitar redefinir várias vezes
  var tries = 0, timer = setInterval(function () {
    if (installOnce() || ++tries > 120) clearInterval(timer);
  }, 50);
})();
