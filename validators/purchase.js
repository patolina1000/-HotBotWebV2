function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeCurrency(currency) {
  if (typeof currency !== 'string') {
    return null;
  }
  const trimmed = currency.trim().toUpperCase();
  if (!trimmed) {
    return null;
  }
  return /^[A-Z]{3}$/.test(trimmed) ? trimmed : null;
}

function normalizeContents(contents = [], value) {
  if (!Array.isArray(contents)) {
    return [];
  }

  return contents
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const id = item.id !== undefined ? String(item.id).trim() : '';
      if (!id) {
        return null;
      }
      const quantityNum = toNumber(item.quantity);
      const quantity = quantityNum && quantityNum > 0 ? quantityNum : 1;
      const priceNum = toNumber(item.item_price);
      const normalized = {
        id,
        quantity
      };
      if (priceNum !== null && priceNum >= 0) {
        normalized.item_price = Number(priceNum.toFixed(2));
      } else if (value !== null) {
        normalized.item_price = Number(value.toFixed(2));
      }
      return normalized;
    })
    .filter(Boolean);
}

function normalizeContentIds(contentIds = [], fallbackIds = []) {
  const source = Array.isArray(contentIds) ? contentIds : [];
  const fallback = Array.isArray(fallbackIds) ? fallbackIds : [];
  const combined = source.length ? source : fallback;
  return combined
    .map(id => (id !== undefined && id !== null ? String(id).trim() : ''))
    .filter(Boolean);
}

function validatePurchaseInput({ value, currency, contents, content_ids: contentIds, content_type: contentType } = {}) {
  const numericValue = toNumber(value);
  if (numericValue === null || numericValue <= 0) {
    return { ok: false, reason: 'invalid_value' };
  }
  const normalizedValue = Number(numericValue.toFixed(2));

  const normalizedCurrency = normalizeCurrency(currency);
  if (!normalizedCurrency) {
    return { ok: false, reason: 'invalid_currency' };
  }

  const normalizedContents = normalizeContents(contents, normalizedValue);
  const normalizedContentIds = normalizeContentIds(contentIds, normalizedContents.map(item => item.id));

  if (!normalizedContents.length) {
    return { ok: false, reason: 'missing_contents' };
  }

  if (!normalizedContentIds.length) {
    return { ok: false, reason: 'missing_content_ids' };
  }

  const normalizedContentType = typeof contentType === 'string' && contentType.trim()
    ? contentType.trim()
    : normalizedContents.length > 1
      ? 'product_group'
      : 'product';

  return {
    ok: true,
    value: normalizedValue,
    currency: normalizedCurrency,
    contents: normalizedContents,
    content_ids: normalizedContentIds,
    content_type: normalizedContentType
  };
}

module.exports = {
  validatePurchaseInput
};
