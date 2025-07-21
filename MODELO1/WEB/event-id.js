function generateEventID(eventName, userId = '', timestamp = Date.now()) {
  if (eventName === 'Purchase' && userId) return userId;
  const input = `${eventName}_${userId}_${timestamp}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return 'e' + (hash >>> 0).toString(16);
}

// Expose globally
window.generateEventID = generateEventID;
