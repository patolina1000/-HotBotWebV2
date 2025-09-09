// Centralized flow control for upsell/back pages
const FLOW_MAP = {
  up1: { decline: 'back1.html', purchase: 'up2.html' },
  up2: { decline: 'back2.html', purchase: 'up3.html' },
  up3: { decline: 'back3.html', purchase: '../obrigado.html' },
  back1: { decline: '../obrigado.html', purchase: 'up2.html' },
  back2: { decline: '../obrigado.html', purchase: 'up3.html' },
  back3: { decline: '../obrigado.html', purchase: '../obrigado.html' }
};

function withTracking(url) {
  const params = new URLSearchParams(window.location.search);
  const query = params.toString();
  const sep = url.includes('?') ? '&' : '?';
  return query ? url + sep + query : url;
}

function goToNextOnDecline(page, origin) {
  const target = FLOW_MAP[page]?.decline;
  if (!target) return;
  console.info(`[FLOW] ${page} decline -> redirect to ${target}`, { origin });
  window.location.href = withTracking(target);
}

function goToNextOnPurchase(page, origin) {
  const target = FLOW_MAP[page]?.purchase;
  if (!target) return;
  console.info(`[FLOW] ${page} purchase_confirmed -> redirect to ${target}`, { origin });
  window.location.href = withTracking(target);
}
