// [AUDIT-ONLY] Meta Pixel conflict diagnostic helper
(function () {
  'use strict';

  var AUDIT_PREFIX = '[AUDIT][PIXEL-CONFLICT]';
  var auditState = {
    calls: [],
    initCalls: [],
    reassignmentCount: 0
  };

  function safeStringify(value) {
    try {
      if (typeof value === 'undefined') {
        return 'undefined';
      }
      if (value === null) {
        return 'null';
      }
      if (typeof value === 'function') {
        return '[function ' + (value.name || 'anonymous') + ']';
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    } catch (error) {
      return '[unserializable:' + (error && error.message ? error.message : 'error') + ']';
    }
  }

  function log() {
    if (typeof console === 'undefined' || typeof console.log !== 'function') {
      return;
    }

    var args = Array.prototype.slice.call(arguments);
    args.unshift(AUDIT_PREFIX);
    try {
      console.log.apply(console, args);
    } catch (error) {
      /* noop */
    }
  }

  function logScripts(phase) {
    try {
      var scripts = Array.prototype.slice.call(document.getElementsByTagName('script'));
      var pixelScripts = scripts
        .map(function (script) {
          return script && script.src ? script.src.trim() : '';
        })
        .filter(function (src) {
          return src && (src.indexOf('connect.facebook.net') !== -1 || src.indexOf('fbevents.js') !== -1);
        });

      log('scripts fbevents detectados (phase=' + phase + ', count=' + pixelScripts.length + '):');
      pixelScripts.forEach(function (src) {
        log(' -', src);
      });
    } catch (error) {
      log('erro ao listar scripts fbevents:', error);
    }
  }

  function describeFbq(stage) {
    try {
      var fbq = window.fbq;
      var type = typeof fbq;
      log('fbq snapshot (' + stage + '): typeof=' + type);

      if (type === 'function') {
        var queue = null;
        try {
          queue = Array.isArray(fbq.queue) ? fbq.queue : null;
        } catch (queueError) {
          queue = '[inacessível]';
        }

        var callMethodType = typeof fbq.callMethod;
        var version = (function () {
          try {
            return fbq.version;
          } catch (error) {
            return '[inacessível]';
          }
        })();
        var loaded = (function () {
          try {
            return fbq.loaded;
          } catch (error) {
            return '[inacessível]';
          }
        })();

        if (queue && queue !== '[inacessível]') {
          log('fbq snapshot (' + stage + '): queue.length=' + queue.length);
        } else {
          log('fbq snapshot (' + stage + '): queue=' + safeStringify(queue));
        }

        log('fbq snapshot (' + stage + '): callMethod=' + callMethodType + ', version=' + safeStringify(version) + ', loaded=' + safeStringify(loaded));
      }

      log('fbq snapshot (' + stage + '): window._fbq typeof=' + typeof window._fbq);
    } catch (error) {
      log('erro ao descrever fbq (' + stage + '):', error);
    }
  }

  function summarizeCalls() {
    if (!auditState.calls.length) {
      log('nenhuma chamada fbq registrada pelo proxy.');
      return;
    }

    var initCount = auditState.initCalls.length;
    log('total de chamadas fbq observadas=' + auditState.calls.length + ' | chamadas init=' + initCount);

    if (initCount) {
      auditState.initCalls.forEach(function (entry, index) {
        log('init[' + index + ']: pixelId=' + safeStringify(entry.pixelId) + ', advancedMatching=' + safeStringify(entry.advancedMatching) + ', options=' + safeStringify(entry.options));
      });
    }
  }

  function logCall(origin, args) {
    var argsArray = Array.prototype.slice.call(args);
    var method = argsArray.length ? argsArray[0] : '[desconhecido]';
    var payload = argsArray.slice(1);

    auditState.calls.push({
      origin: origin,
      method: method,
      args: payload,
      timestamp: Date.now()
    });

    if (method === 'init') {
      auditState.initCalls.push({
        pixelId: payload.length ? payload[0] : undefined,
        advancedMatching: payload.length > 1 ? payload[1] : undefined,
        options: payload.length > 2 ? payload[2] : undefined
      });
    }

    log("fbq call -> origin=" + origin + ' | method=' + method + ' | args=' + safeStringify(payload));
  }

  function proxifyFunction(fn, label) {
    if (typeof fn !== 'function') {
      return fn;
    }

    if (fn.__fbqAuditProxy__) {
      return fn;
    }

    if (typeof Proxy === 'function') {
      var handler = {
        apply: function (target, thisArg, argumentsList) {
          logCall(label, argumentsList);
          return Reflect.apply(target, thisArg, argumentsList);
        },
        get: function (target, property, receiver) {
          var value = Reflect.get(target, property, receiver);

          if (property === 'callMethod' || property === 'push') {
            return proxifyFunction(value, label + '.' + String(property));
          }

          return value;
        }
      };

      var proxy = new Proxy(fn, handler);
      proxy.__fbqAuditProxy__ = true;
      return proxy;
    }

    var proxyFn = function () {
      logCall(label, arguments);
      return fn.apply(this, arguments);
    };

    try {
      Object.getOwnPropertyNames(fn).forEach(function (prop) {
        proxyFn[prop] = fn[prop];
      });
    } catch (error) {
      /* noop */
    }

    proxyFn.__fbqAuditProxy__ = true;
    return proxyFn;
  }

  function installProxy(value, reason) {
    if (typeof value === 'function') {
      var proxied = proxifyFunction(value, reason);
      try {
        log('proxy aplicado em window.fbq (' + reason + ')');
      } catch (error) {
        /* noop */
      }
      return proxied;
    }

    return value;
  }

  (function monitorFbq() {
    var currentValue = typeof window.fbq === 'undefined' ? undefined : window.fbq;
    var storedValue = installProxy(currentValue, 'initial');

    Object.defineProperty(window, 'fbq', {
      configurable: true,
      enumerable: true,
      get: function () {
        return storedValue;
      },
      set: function (newValue) {
        auditState.reassignmentCount += 1;
        var stack;
        try {
          stack = new Error('fbq reassignment').stack;
        } catch (error) {
          stack = '[stack indisponível]';
        }

        log('window.fbq redefinido (' + auditState.reassignmentCount + 'ª vez). typeof novo valor=' + typeof newValue);
        if (stack) {
          log('stack fbq redefine ->\n' + String(stack).split('\n').slice(0, 6).join('\n'));
        }

        storedValue = installProxy(newValue, 'reassignment#' + auditState.reassignmentCount);
      }
    });

    if (typeof currentValue !== 'undefined') {
      storedValue = installProxy(currentValue, 'initial');
    }
  })();

  log('diagnostic-pixel-audit script carregado');
  describeFbq('script-load');

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        logScripts('DOMContentLoaded');
        describeFbq('DOMContentLoaded');
      });
    } else {
      logScripts('DOMContentLoaded (immediate)');
      describeFbq('DOMContentLoaded (immediate)');
    }

    window.addEventListener('load', function () {
      logScripts('load');
      describeFbq('load');
      summarizeCalls();
    });
  }
})();
