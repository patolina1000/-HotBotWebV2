(function () {
  const DEFAULT_LINK = 'https://t.me/bot1';
  const REDIRECT_DELAY = 4000;

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

  function updateCountdown(element, milliseconds) {
    if (!element) return;
    const seconds = Math.ceil(Math.max(milliseconds, 0) / 1000);
    element.textContent = `Redirecionando em ${seconds} segundos...`;
  }

  function animateProgress(barElement, countdownElement, duration) {
    if (!barElement) return;

    let startTimestamp = null;

    const step = (timestamp) => {
      if (startTimestamp === null) {
        startTimestamp = timestamp;
      }

      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);

      barElement.style.width = `${progress * 100}%`;
      updateCountdown(countdownElement, duration - elapsed);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const baseLink = window.BOT1_LINK_FROM_SERVER || DEFAULT_LINK;
    const targetUrl = buildTargetUrl(baseLink, window.location.search);
    const countdownEl = document.getElementById('countdown');
    const progressBar = document.getElementById('progress-bar');

    updateCountdown(countdownEl, REDIRECT_DELAY);
    animateProgress(progressBar, countdownEl, REDIRECT_DELAY);

    window.setTimeout(() => {
      window.location.href = targetUrl;
    }, REDIRECT_DELAY);
  });
})();
