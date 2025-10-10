const ACCENT_REGEX = /[\u0300-\u036f]/g;

function toStringValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  const coerced = String(value).trim();
  return coerced || null;
}

function norm(value) {
  const stringValue = toStringValue(value);
  if (!stringValue) {
    return null;
  }

  const normalized = stringValue
    .normalize('NFD')
    .replace(ACCENT_REGEX, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

  return normalized || null;
}

function onlyDigits(value) {
  const stringValue = toStringValue(value);
  if (!stringValue) {
    return null;
  }

  const digits = stringValue.replace(/\D+/g, '');
  return digits || null;
}

function mapGeoToUserData(geo = {}) {
  const userData = {};

  const defaultCountry = norm('br');
  if (defaultCountry) {
    userData.country = defaultCountry;
  }

  if (!geo || typeof geo !== 'object') {
    return userData;
  }

  const cityCandidate =
    geo.geo_city ??
    geo.city ??
    geo.ct ??
    null;

  const regionCandidate =
    geo.geo_region ??
    geo.region ??
    geo.state ??
    null;

  const regionNameCandidate =
    geo.geo_region_name ??
    geo.region_name ??
    geo.regionName ??
    geo.state_name ??
    null;

  const postalCandidate =
    geo.geo_postal_code ??
    geo.postal_code ??
    geo.postal ??
    geo.zip ??
    geo.zp ??
    null;

  const countryCandidate =
    geo.geo_country_code ??
    geo.country_code ??
    geo.countryCode ??
    geo.geo_country ??
    geo.country ??
    null;

  const city = norm(cityCandidate);
  if (city) {
    userData.ct = city;
  }

  const state = norm(regionCandidate || regionNameCandidate);
  if (state) {
    userData.st = state;
  }

  const postal = onlyDigits(postalCandidate);
  if (postal) {
    userData.zp = postal;
  }

  const country = norm(countryCandidate || 'br');
  if (country) {
    userData.country = country;
  }

  return userData;
}

module.exports = {
  norm,
  onlyDigits,
  mapGeoToUserData
};
