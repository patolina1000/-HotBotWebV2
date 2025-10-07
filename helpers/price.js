function toIntOrNull(x) {
  if (x === null || x === undefined) return null;
  const n = typeof x === 'string' ? parseInt(x, 10) : Number(x);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i >= 0 ? i : null;
}
function centsToValue(cents) {
  const i = toIntOrNull(cents);
  return i !== null ? Number((i / 100).toFixed(2)) : null;
}
module.exports = { toIntOrNull, centsToValue };
