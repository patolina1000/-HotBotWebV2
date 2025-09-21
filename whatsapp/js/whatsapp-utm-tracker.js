const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const STORAGE_PREFIX = 'whatsapp_';

function getStorageKey(key) {
  return `${STORAGE_PREFIX}${key}`;
}

function isLocalhost() {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') {
    return false;
  }

  const { hostname } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function normalizeUTM(value, key) {
  if (value === undefined || value === null) {
    return '';
  }

  let normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  if (normalized === 'unknown' || normalized === 'undefined') {
    return 'nao-definido';
  }

  if (key === 'utm_source') {
    const plain = normalized.replace(/[^a-z0-9]/g, '');
    const tokens = normalized.replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);
    const hasWhatsAppToken = tokens.some(token => token === 'whatsapp' || token === 'wa');
    if (plain.includes('whatsapp') || plain === 'wa' || plain.startsWith('wa') || hasWhatsAppToken) {
      return 'whatsapp';
    }
  }

  normalized = normalized.replace(/\s+/g, '-');
  normalized = normalized.replace(/-+/g, '-');
  normalized = normalized.replace(/^-+|-+$/g, '');

  return normalized || 'nao-definido';
}

function saveToStorage(key, value) {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  const storageKey = getStorageKey(key);
  try {
    if (value !== undefined && value !== null && value !== '') {
      window.localStorage.setItem(storageKey, value);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch (error) {
    // Ignorar falha de armazenamento silenciosamente
  }
}

function loadFromStorage(key) {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getStorageKey(key));
    if (rawValue === null) {
      return null;
    }

    const normalized = normalizeUTM(rawValue, key);
    if (!normalized) {
      window.localStorage.removeItem(getStorageKey(key));
      return null;
    }

    if (normalized !== rawValue) {
      window.localStorage.setItem(getStorageKey(key), normalized);
    }

    return normalized;
  } catch (error) {
    return null;
  }
}

function captureUTMs() {
  if (typeof window === 'undefined') {
    return;
  }

  const params = new URLSearchParams(window.location.search || '');
  const utms = {};
  let capturedNew = false;

  for (const key of UTM_KEYS) {
    const urlValue = params.get(key);

    if (urlValue !== null) {
      const normalized = normalizeUTM(urlValue, key);
      if (normalized) {
        utms[key] = normalized;
        saveToStorage(key, normalized);
      } else {
        saveToStorage(key, '');
      }
      capturedNew = true;
      continue;
    }

    const storedValue = loadFromStorage(key);
    if (storedValue) {
      utms[key] = storedValue;
    }
  }

  if (capturedNew) {
    const payload = {};
    for (const [key, value] of Object.entries(utms)) {
      if (value !== undefined && value !== null && value !== '') {
        payload[key] = value;
      }
    }

    if (Object.keys(payload).length > 0) {
      sendToBackend(payload);
    }
  }
}

async function sendToBackend(utms) {
  if (!utms || typeof utms !== 'object' || Object.keys(utms).length === 0) {
    return;
  }

  try {
    const response = await fetch('/utm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(utms)
    });

    if (isLocalhost()) {
      if (response.ok) {
        console.log('[WhatsApp UTM Tracker] UTMs enviados com sucesso:', utms);
      } else {
        console.log('[WhatsApp UTM Tracker] Falha ao enviar UTMs:', response.status, response.statusText);
      }
    }
  } catch (error) {
    if (isLocalhost()) {
      console.log('[WhatsApp UTM Tracker] Erro ao enviar UTMs:', error);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', captureUTMs);
} else {
  captureUTMs();
}

