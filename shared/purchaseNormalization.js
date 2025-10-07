(function (globalScope, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('crypto'));
  } else {
    const exports = factory(null);
    globalScope.PurchaseNormalization = exports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function (nodeCrypto) {
  const hasNodeCrypto = !!(nodeCrypto && typeof nodeCrypto.createHash === 'function');

  const BASE_URL_PROTOCOLS = new Set(['http:', 'https:']);

  function baseNormalize(value) {
    if (value === null || value === undefined) {
      return null;
    }
    const stringified = String(value).trim();
    return stringified ? stringified : null;
  }

  function normalizeEmail(value) {
    const normalized = baseNormalize(value);
    return normalized ? normalized.toLowerCase() : null;
  }

  function normalizePhone(value) {
    const normalized = baseNormalize(value);
    if (!normalized) {
      return null;
    }
    const digits = normalized.replace(/\D+/g, '');
    return digits || null;
  }

  function normalizeName(value) {
    const normalized = baseNormalize(value);
    if (!normalized) {
      return null;
    }
    const withoutAccents = normalized
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s'-]+/g, '');
    const trimmed = withoutAccents.trim();
    return trimmed ? trimmed.toLowerCase() : null;
  }

  function normalizeExternalId(value) {
    const normalized = baseNormalize(value);
    return normalized || null;
  }

  function toUtf8Bytes(input) {
    if (typeof input !== 'string') {
      throw new TypeError('sha256 expects a string input');
    }

    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(input);
    }

    if (typeof Buffer !== 'undefined') {
      return Buffer.from(input, 'utf8');
    }

    const encoded = unescape(encodeURIComponent(input));
    const bytes = new Uint8Array(encoded.length);
    for (let i = 0; i < encoded.length; i += 1) {
      bytes[i] = encoded.charCodeAt(i);
    }
    return bytes;
  }

  function bytesToBinaryString(bytes) {
    if (typeof bytes === 'string') {
      return bytes;
    }
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return binary;
  }

  function sha256Native(input) {
    if (!hasNodeCrypto) {
      return null;
    }
    return nodeCrypto.createHash('sha256').update(input, 'utf8').digest('hex');
  }

  function sha256Portable(input) {
    const bytes = toUtf8Bytes(input);
    const ascii = bytesToBinaryString(bytes);
    const rightRotate = (value, amount) => (value >>> amount) | (value << (32 - amount));

    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    const words = [];
    let asciiBitLength = ascii.length * 8;

    const hash = [];
    const k = [];
    const isComposite = {};
    let primeCounter = 0;

    for (let candidate = 2; primeCounter < 64; candidate += 1) {
      if (!isComposite[candidate]) {
        for (let i = candidate * candidate; i < 313; i += candidate) {
          isComposite[i] = candidate;
        }
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
        primeCounter += 1;
      }
    }

    ascii += '\x80';
    while (ascii.length % 64 !== 56) {
      ascii += '\x00';
    }

    for (let i = 0; i < ascii.length; i += 1) {
      const charCode = ascii.charCodeAt(i);
      const wordIndex = i >> 2;
      words[wordIndex] = words[wordIndex] || 0;
      words[wordIndex] |= charCode << ((3 - (i % 4)) * 8);
    }

    words.push((asciiBitLength / maxWord) | 0);
    words.push(asciiBitLength >>> 0);

    for (let j = 0; j < words.length; j += 16) {
      const w = new Array(64);
      for (let i = 0; i < 16; i += 1) {
        w[i] = words[j + i] | 0;
      }
      for (let i = 16; i < 64; i += 1) {
        const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }

      let a = hash[0];
      let b = hash[1];
      let c = hash[2];
      let d = hash[3];
      let e = hash[4];
      let f = hash[5];
      let g = hash[6];
      let h = hash[7];

      for (let i = 0; i < 64; i += 1) {
        const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + s1 + ch + k[i] + w[i]) | 0;
        const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (s0 + maj) | 0;

        h = g;
        g = f;
        f = e;
        e = (d + temp1) | 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) | 0;
      }

      hash[0] = (hash[0] + a) | 0;
      hash[1] = (hash[1] + b) | 0;
      hash[2] = (hash[2] + c) | 0;
      hash[3] = (hash[3] + d) | 0;
      hash[4] = (hash[4] + e) | 0;
      hash[5] = (hash[5] + f) | 0;
      hash[6] = (hash[6] + g) | 0;
      hash[7] = (hash[7] + h) | 0;
    }

    let hex = '';
    for (let i = 0; i < hash.length; i += 1) {
      const value = hash[i];
      hex += (value >>> 0).toString(16).padStart(8, '0');
    }

    return hex;
  }

  function sha256(value) {
    if (value === null || value === undefined) {
      return null;
    }
    const normalized = String(value);
    const trimmed = normalized.trim();
    if (!trimmed) {
      return null;
    }

    const native = sha256Native(trimmed);
    if (native) {
      return native;
    }

    return sha256Portable(trimmed);
  }

  function splitName(value) {
    const normalized = baseNormalize(value);
    if (!normalized) {
      return { firstName: null, lastName: null };
    }
    const parts = normalized.split(/\s+/);
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: null };
    }
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' ')
    };
  }

  function buildNormalizationSnapshot(normalized) {
    return {
      email: normalized.email ? 'ok' : 'skip',
      phone: normalized.phone ? 'ok' : 'skip',
      fn: normalized.first_name ? 'ok' : 'skip',
      ln: normalized.last_name ? 'ok' : 'skip',
      external_id: normalized.external_id ? 'ok' : 'skip'
    };
  }

  function buildAdvancedMatching(normalized) {
    const result = {};
    if (normalized.email) {
      result.em = sha256(normalized.email);
    }
    if (normalized.phone) {
      result.ph = sha256(normalized.phone);
    }
    if (normalized.first_name) {
      result.fn = sha256(normalized.first_name);
    }
    if (normalized.last_name) {
      result.ln = sha256(normalized.last_name);
    }
    if (normalized.external_id) {
      result.external_id = sha256(normalized.external_id);
    }
    return result;
  }

  function normalizeUrlForEventSource(url) {
    const normalized = baseNormalize(url);
    if (!normalized) {
      return null;
    }
    let parsed;
    try {
      parsed = new URL(normalized);
    } catch (error) {
      try {
        parsed = new URL(`https://${normalized}`);
      } catch (innerError) {
        return null;
      }
    }

    if (!BASE_URL_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }

    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/');

    return parsed.toString();
  }

  function ensureArray(value) {
    if (Array.isArray(value)) {
      return value;
    }
    return value ? [value] : [];
  }

  return {
    normalizeEmail,
    normalizePhone,
    normalizeName,
    normalizeExternalId,
    normalizeUrlForEventSource,
    sha256,
    splitName,
    buildAdvancedMatching,
    buildNormalizationSnapshot,
    ensureArray
  };
});
