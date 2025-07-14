(function(){
  const params = new URLSearchParams(window.location.search);
  const utmKeys = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
  utmKeys.forEach(key => {
    const value = params.get(key);
    if (value !== null) {
      localStorage.setItem(key, value);
    }
  });
})();
