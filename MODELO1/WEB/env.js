(function(){
  async function loadEnv(){
    try {
      const res = await fetch('/api/env');
      const data = await res.json();
      window.envVars = data;
      if(data.pixelId){
        !function(f,b,e,v,n,t,s){
          if(f.fbq)return;n=f.fbq=function(){
            n.callMethod ? n.callMethod.apply(n,arguments) : n.queue.push(arguments);
          };
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s);
        }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', data.pixelId);
        fbq('track', 'PageView');
      }
    } catch(err){
      console.error('Erro ao carregar vari\u00e1veis de ambiente', err);
    }
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', loadEnv);
  } else {
    loadEnv();
  }
})();
