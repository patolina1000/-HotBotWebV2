(function () {
  const DEFAULT_LINK = 'https://t.me/bot1';

  function buildTargetUrl(baseLink, searchParams) {
    const params = new URLSearchParams(searchParams);
    let startValue = '';

    if (params.has('payload_id')) {
      startValue = params.get('payload_id') || '';
    } else if (params.has('start')) {
      startValue = params.get('start') || '';
    }

    let target = baseLink || DEFAULT_LINK;

    if (startValue) {
      const separator = target.includes('?') ? '&' : '?';
      target += `${separator}start=${encodeURIComponent(startValue)}`;
    }

    return target;
  }

  function updateCountdown(element, seconds) {
    if (!element) return;
    element.textContent = `Redirecionando em ${seconds} segundos…`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const baseLink = window.BOT1_LINK_FROM_SERVER || DEFAULT_LINK;
    const countdownEl = document.getElementById('countdown');
    const targetUrl = buildTargetUrl(baseLink, window.location.search);

    let remainingSeconds = 3;
    updateCountdown(countdownEl, remainingSeconds);

    const countdownInterval = setInterval(() => {
      remainingSeconds -= 1;
      if (remainingSeconds >= 0) {
        updateCountdown(countdownEl, remainingSeconds);
      }
      if (remainingSeconds < 0) {
        clearInterval(countdownInterval);
      }
    }, 1000);

    setTimeout(() => {
      window.location.href = targetUrl;
    }, 3000);
  });
})();
