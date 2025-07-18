(function(){
  function setup(){
    var fbq = window.fbq;
    if(typeof fbq !== 'function'){
      return false;
    }
    if(fbq.__intercepted) return true;
    var original = fbq;
    function wrapper(){
      try {
        if(arguments[0]==='track' && arguments[1]==='Purchase'){
          var data = arguments[2] || {};
          var opts = arguments[3] || {};
          var eventId = (opts && opts.eventID) || data.event_id || '';
          var value = data.value;
          var currency = data.currency;
          console.log('%c[FBQ] Purchase Disparado', 'color: green; font-weight: bold;', '| ID:', eventId, '| Valor:', value, '| Moeda:', currency);
          try {
            fetch('/api/log-fbq', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ event: 'Purchase', data: data, options: opts })
            })
            .then(res => res.ok ? res.json() : Promise.reject('Erro na resposta da API'))
            .then(resp => {
              console.log('[FBQ API LOG] Sucesso:', resp);
            })
            .catch(err => {
              console.warn('[FBQ API LOG] Erro no .catch:', err);
            });
          } catch(e){
            console.error('Falha no fetch /api/log-fbq', e);
          }
        }
      } catch(e){
        console.error('Erro no interceptor fbq', e);
      }
      return original.apply(this, arguments);
    }
    for(var prop in original){
      try{wrapper[prop] = original[prop];}catch(e){}
    }
    wrapper.__intercepted = true;
    window.fbq = wrapper;
    return true;
  }
  var attempts = 0;
  (function wait(){
    if(setup()) return;
    if(attempts++ < 50) setTimeout(wait, 100);
  })();
})();
