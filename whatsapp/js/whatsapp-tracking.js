(function() {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  function isLocalhost() {
    if (!window.location || !window.location.hostname) {
      return false;
    }

    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  }

  const DEBUG = isLocalhost();
  const LOG_PREFIX = '[WhatsApp Tracking]';
  const USER_ID_STORAGE_KEY = 'whatsapp_tracking_user_id';
  const VIEW_CONTENT_DELAY = 4000;
  const FB_PIXEL_SRC = 'https://connect.facebook.net/en_US/fbevents.js';
  const UTM_STORAGE_PREFIX = 'whatsapp_utm_';
  const CLIENT_IP_STORAGE_KEY = 'whatsapp_client_ip_address';
  const CLIENT_IP_SESSION_KEY = 'whatsapp_client_ip_address_session';
  const CLIENT_IP_ENDPOINTS = Object.freeze([
    { url: 'https://api.ipify.org?format=json', parser: async response => (await response.json()).ip },
    { url: 'https://ipv4.icanhazip.com/', parser: async response => (await response.text()).trim() },
    { url: 'https://ipinfo.io/json', parser: async response => (await response.json()).ip }
  ]);

  function ensureTestEventHelpers() {
    if (typeof window === 'undefined') {
      return {
        TEST_EVENT_CODE: 'TEST50600',
        isValidationMode: () => false,
        setValidationMode: () => false,
        withTestEventCode: eventData => (eventData && typeof eventData === 'object' ? eventData : {})
      };
    }

    if (window.__whatsappTestEventHelpers) {
      return window.__whatsappTestEventHelpers;
    }

    const TEST_EVENT_CODE = 'TEST50600';
    const STORAGE_KEY = 'whatsapp_test_event_mode';
    let cachedMode = null;

    function parseBoolean(value) {
      if (value === null || value === undefined) {
        return null;
      }

      const normalized = String(value).trim().toLowerCase();
      if (!normalized) {
        return null;
      }

      if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
      }

      if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
      }

      return null;
    }

    function storeMode(value) {
      cachedMode = !!value;

      if (typeof window.localStorage === 'undefined') {
        return;
      }

      try {
        if (cachedMode) {
          window.localStorage.setItem(STORAGE_KEY, '1');
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      } catch (error) {
        // Ignorar falhas de armazenamento silenciosamente
      }
    }

    function readStoredMode() {
      if (typeof window.localStorage === 'undefined') {
        return null;
      }

      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === '1') {
          return true;
        }
      } catch (error) {
        // Ignorar falhas de leitura silenciosamente
      }

      return null;
    }

    function readModeFromUrl() {
      if (typeof window.location === 'undefined') {
        return null;
      }

      try {
        const params = new URLSearchParams(window.location.search || '');
        const toggle = parseBoolean(params.get('whatsapp_test_event'));
        if (toggle !== null) {
          return toggle;
        }

        const codeParam = params.get('fb_test_event_code') || params.get('test_event_code');
        if (codeParam && codeParam.trim() === TEST_EVENT_CODE) {
          return true;
        }
      } catch (error) {
        // Ignorar falhas na leitura da URL
      }

      return null;
    }

    function resolveValidationMode() {
      if (cachedMode !== null) {
        return cachedMode;
      }

      const modeFromUrl = readModeFromUrl();
      if (modeFromUrl !== null) {
        storeMode(modeFromUrl);
        return cachedMode;
      }

      const modeFromStorage = readStoredMode();
      if (modeFromStorage !== null) {
        storeMode(modeFromStorage);
        return cachedMode;
      }

      storeMode(false);
      return cachedMode;
    }

    function isValidationMode() {
      return resolveValidationMode();
    }

    function setValidationMode(active) {
      storeMode(!!active);
      return cachedMode;
    }

    function withTestEventCode(eventData, options) {
      const payload = eventData && typeof eventData === 'object' ? eventData : {};
      const force = options && options.force === true;

      if (force) {
        setValidationMode(true);
      }

      if (!force && !isValidationMode()) {
        return payload;
      }

      if (payload.test_event_code === TEST_EVENT_CODE) {
        return payload;
      }

      return {
        ...payload,
        test_event_code: TEST_EVENT_CODE
      };
    }

    const helpers = {
      TEST_EVENT_CODE,
      isValidationMode,
      setValidationMode,
      withTestEventCode
    };

    // Resolver modo imediatamente para processar parâmetros de URL
    resolveValidationMode();

    window.__whatsappTestEventHelpers = helpers;
    return helpers;
  }

  const {
    TEST_EVENT_CODE,
    isValidationMode: isTestValidationMode,
    withTestEventCode,
    setValidationMode: setTestValidationMode
  } = ensureTestEventHelpers();
  const DEFAULT_CUSTOMER = Object.freeze({
    name: 'Cliente WhatsApp',
    email: 'cliente.whatsapp@example.com',
    cpf: '00000000000',
    document: '00000000000',
    phone: '+550000000000',
    country: 'BR'
  });
  const DEFAULT_PRODUCT = Object.freeze({
    id: 'whatsapp-default-product',
    name: 'WhatsApp Purchase',
    planId: 'whatsapp-plan',
    planName: 'WhatsApp Plan',
    quantity: 1
  });

  let pixelInitialized = false;
  let pixelInitializationPromise = null;
  let facebookPixelScriptPromise = null;
  let configCache = null;
  let configPromise = null;
  let cachedUserId = null;
  let activePixelId = null;
  let initExecutionPromise = null;
  let initCompleted = false;
  let cachedClientIpPromise = null;
  const sentCapiPurchaseTokens = new Set();

  function sanitizeTrackingParameterValue(value) {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }

      const lowered = trimmed.toLowerCase();
      if (lowered === 'null' || lowered === 'undefined' || lowered === 'unknown') {
        return null;
      }

      return trimmed;
    }

    return value;
  }

  function getStoredUtms() {
    const utms = {};

    if (!window.localStorage) {
      return utms;
    }

    try {
      const prefixLength = 'whatsapp_'.length;

      for (let index = 0; index < window.localStorage.length; index += 1) {
        const storageKey = window.localStorage.key(index);

        if (!storageKey || !storageKey.startsWith(UTM_STORAGE_PREFIX)) {
          continue;
        }

        const storedValue = window.localStorage.getItem(storageKey);
        const sanitizedValue = sanitizeTrackingParameterValue(storedValue);

        if (sanitizedValue === null) {
          continue;
        }

        const normalizedKey = storageKey.slice(prefixLength);
        utms[normalizedKey] = sanitizedValue;
      }
    } catch (error) {
      logError('Erro ao recuperar UTMs do localStorage.', error);
    }

    return utms;
  }

  function normalizeUtms(utms) {
    if (!utms || typeof utms !== 'object') {
      return {};
    }

    return Object.keys(utms).reduce((accumulator, key) => {
      accumulator[key] = sanitizeTrackingParameterValue(utms[key]);
      return accumulator;
    }, {});
  }

  function parsePurchaseValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const sanitized = value.replace(/[^0-9,.-]/g, '').replace(',', '.');
      const parsed = Number.parseFloat(sanitized);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return Number.NaN;
  }

  function normalizeStringForHash(value) {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '');
  }

  async function hashSHA256(value) {
    const normalized = normalizeStringForHash(value);

    if (!normalized) {
      return null;
    }

    const cryptoSubtle = typeof window !== 'undefined' && window.crypto && window.crypto.subtle
      ? window.crypto.subtle
      : null;

    if (cryptoSubtle && typeof TextEncoder !== 'undefined') {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(normalized);
        const hashBuffer = await cryptoSubtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
      } catch (error) {
        logError('Falha ao gerar hash SHA-256 usando crypto.subtle.', error);
      }
    }

    log('SHA-256 indisponível neste ambiente. hashSHA256 retornará null.');
    return null;
  }

  function normalizePhoneNumber(phone) {
    if (!phone) {
      return '';
    }

    let digits = String(phone).replace(/\D+/g, '');

    if (!digits) {
      return '';
    }

    if (digits.startsWith('00')) {
      digits = digits.slice(2);
    }

    digits = digits.replace(/^0+/, '');

    if (!digits) {
      return '';
    }

    if (!digits.startsWith('55') && digits.length >= 10 && digits.length <= 11) {
      digits = `55${digits}`;
    }

    if (!digits.startsWith('+')) {
      digits = `+${digits}`;
    }

    if (digits.startsWith('++')) {
      digits = `+${digits.slice(2)}`;
    }

    return digits;
  }

  function extractNameParts(name) {
    if (!name) {
      return ['', ''];
    }

    const sanitized = String(name)
      .trim()
      .replace(/\s+/g, ' ');

    if (!sanitized) {
      return ['', ''];
    }

    const [firstName, ...rest] = sanitized.split(' ');
    const lastName = rest.join(' ');
    return [firstName || '', lastName || ''];
  }

  function getStoredClientIp() {
    if (typeof window === 'undefined') {
      return '';
    }

    try {
      if (window.sessionStorage) {
        const storedSession = window.sessionStorage.getItem(CLIENT_IP_SESSION_KEY);
        if (storedSession) {
          return storedSession;
        }
      }
    } catch (error) {
      // Ignorar erros de acesso ao sessionStorage
    }

    try {
      if (window.localStorage) {
        const stored = window.localStorage.getItem(CLIENT_IP_STORAGE_KEY);
        if (stored) {
          return stored;
        }
      }
    } catch (error) {
      // Ignorar erros de acesso ao localStorage
    }

    return '';
  }

  function storeClientIp(ip) {
    if (typeof window === 'undefined' || !ip) {
      return;
    }

    try {
      if (window.sessionStorage) {
        window.sessionStorage.setItem(CLIENT_IP_SESSION_KEY, ip);
      }
    } catch (error) {
      // Ignorar erros de acesso ao sessionStorage
    }

    try {
      if (window.localStorage) {
        window.localStorage.setItem(CLIENT_IP_STORAGE_KEY, ip);
      }
    } catch (error) {
      // Ignorar erros de acesso ao localStorage
    }
  }

  async function fetchClientIpAddress() {
    if (typeof fetch !== 'function') {
      return '';
    }

    for (const endpoint of CLIENT_IP_ENDPOINTS) {
      try {
        const response = await fetch(endpoint.url, { credentials: 'omit' });
        if (!response.ok) {
          continue;
        }

        const value = await endpoint.parser(response);
        if (value) {
          return value;
        }
      } catch (error) {
        // Ignorar e tentar próximo endpoint
      }
    }

    return '';
  }

  async function getClientIpAddress() {
    if (typeof window === 'undefined') {
      return '';
    }

    const stored = getStoredClientIp();
    if (stored) {
      return stored;
    }

    if (cachedClientIpPromise) {
      try {
        return await cachedClientIpPromise;
      } catch (error) {
        cachedClientIpPromise = null;
        return '';
      }
    }

    cachedClientIpPromise = (async () => {
      try {
        const fetchedIp = await fetchClientIpAddress();
        if (fetchedIp) {
          storeClientIp(fetchedIp);
          return fetchedIp;
        }
      } catch (error) {
        // Ignorar erro global
      }

      return '';
    })();

    try {
      const ip = await cachedClientIpPromise;
      return ip;
    } finally {
      cachedClientIpPromise = null;
    }
  }

  function resolveTestEventCode(explicitCode) {
    if (explicitCode && typeof explicitCode === 'string') {
      return explicitCode.trim();
    }

    const env = typeof process !== 'undefined' && process.env ? process.env : null;
    if (env) {
      const envCode = env.FB_TEST_EVENT_CODE || env.WHATSAPP_FB_TEST_EVENT_CODE;
      if (envCode && typeof envCode === 'string' && envCode.trim()) {
        return envCode.trim();
      }
    }

    return null;
  }

  function collectPurchaseCustomerData(rawData) {
    const data = rawData && typeof rawData === 'object' ? { ...rawData } : {};

    if (typeof window !== 'undefined') {
      if (!data.phone || !data.name) {
        const globalData =
          window.__whatsappPurchaseData ||
          window.__lastWhatsappPurchaseData ||
          window.whatsappPurchaseData ||
          null;

        if (globalData && typeof globalData === 'object') {
          data.name = data.name || globalData.nome || globalData.name || '';
          data.phone = data.phone || globalData.telefone || globalData.phone || '';
        }
      }

      try {
        if (!data.name && window.sessionStorage) {
          const storedName = window.sessionStorage.getItem('whatsapp_purchase_name');
          if (storedName) {
            data.name = storedName;
          }
        }
      } catch (error) {
        // Ignorar erros de sessionStorage
      }

      try {
        if (!data.phone && window.sessionStorage) {
          const storedPhone = window.sessionStorage.getItem('whatsapp_purchase_phone');
          if (storedPhone) {
            data.phone = storedPhone;
          }
        }
      } catch (error) {
        // Ignorar erros de sessionStorage
      }

      try {
        if (!data.name && window.localStorage) {
          const storedName = window.localStorage.getItem('whatsapp_purchase_name');
          if (storedName) {
            data.name = storedName;
          }
        }
      } catch (error) {
        // Ignorar erros de localStorage
      }

      try {
        if (!data.phone && window.localStorage) {
          const storedPhone = window.localStorage.getItem('whatsapp_purchase_phone');
          if (storedPhone) {
            data.phone = storedPhone;
          }
        }
      } catch (error) {
        // Ignorar erros de localStorage
      }

      if (typeof window.location !== 'undefined') {
        try {
          const params = new URLSearchParams(window.location.search || '');
          if (!data.name) {
            data.name = params.get('nome') || params.get('name') || params.get('cliente') || '';
          }
          if (!data.phone) {
            data.phone = params.get('telefone') || params.get('phone') || params.get('tel') || '';
          }
        } catch (error) {
          // Ignorar erros ao processar parâmetros
        }
      }

      if (!data.userAgent && typeof window.navigator !== 'undefined') {
        data.userAgent = window.navigator.userAgent || '';
      }
    }

    const [firstName, lastName] = extractNameParts(
      data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : data.name
    );
    data.firstName = data.firstName || firstName;
    data.lastName = data.lastName || lastName;

    if (!data.name) {
      const combined = `${data.firstName || ''} ${data.lastName || ''}`.trim();
      data.name = combined;
    }

    return data;
  }

  function resolveWhatsAppAccessToken(config) {
    if (config && config.whatsapp) {
      const whatsappConfig = config.whatsapp;
      if (typeof whatsappConfig.pixelToken === 'string' && whatsappConfig.pixelToken.trim()) {
        return whatsappConfig.pixelToken.trim();
      }
      if (typeof whatsappConfig.accessToken === 'string' && whatsappConfig.accessToken.trim()) {
        return whatsappConfig.accessToken.trim();
      }
      if (typeof whatsappConfig.token === 'string' && whatsappConfig.token.trim()) {
        return whatsappConfig.token.trim();
      }
    }

    if (config && typeof config.WHATSAPP_FB_PIXEL_TOKEN === 'string' && config.WHATSAPP_FB_PIXEL_TOKEN.trim()) {
      return config.WHATSAPP_FB_PIXEL_TOKEN.trim();
    }

    const env = typeof process !== 'undefined' && process.env ? process.env : null;
    if (env) {
      const envToken = env.WHATSAPP_FB_PIXEL_TOKEN || env.FB_PIXEL_TOKEN || env.FB_PIXEL_TOKEN_WHATSAPP;
      if (envToken && typeof envToken === 'string' && envToken.trim()) {
        return envToken.trim();
      }
    }

    if (typeof window !== 'undefined') {
      const globalToken =
        window.WHATSAPP_FB_PIXEL_TOKEN ||
        window.FB_PIXEL_TOKEN ||
        window.__WHATSAPP_FB_PIXEL_TOKEN__ ||
        null;

      if (globalToken && typeof globalToken === 'string' && globalToken.trim()) {
        return globalToken.trim();
      }
    }

    return '';
  }

  function resolveWhatsAppPixelId(config) {
    if (activePixelId) {
      return activePixelId;
    }

    if (config && config.whatsapp && typeof config.whatsapp.pixelId === 'string' && config.whatsapp.pixelId.trim()) {
      return config.whatsapp.pixelId.trim();
    }

    if (config && typeof config.FB_PIXEL_ID === 'string' && config.FB_PIXEL_ID.trim()) {
      return config.FB_PIXEL_ID.trim();
    }

    return '';
  }

  function buildCustomData(numericValue, token, utms) {
    const sanitizedValue = Math.round(Number.parseFloat(numericValue) * 100) / 100;
    const normalizedUtms = normalizeUtms(utms);
    const customData = {
      currency: 'BRL',
      value: Number.isFinite(sanitizedValue) && sanitizedValue > 0 ? sanitizedValue : numericValue,
      contents: [
        {
          id: token,
          quantity: 1,
          item_price: Number.isFinite(sanitizedValue) && sanitizedValue > 0 ? sanitizedValue : numericValue
        }
      ],
      content_type: 'product',
      transaction_id: token
    };

    for (const [key, value] of Object.entries(normalizedUtms)) {
      if (value !== null && value !== undefined && value !== '') {
        customData[key] = value;
      }
    }

    return customData;
  }

  async function sendPurchaseEventToCapi({ token, value, utms, customerData } = {}) {
    const safeToken = typeof token === 'string' ? token.trim() : '';
    if (!safeToken) {
      log('Token inválido. Evento Purchase via CAPI não será enviado.');
      return false;
    }

    if (sentCapiPurchaseTokens.has(safeToken)) {
      log('Evento Purchase via CAPI já enviado para este token nesta sessão.');
      return true;
    }

    if (typeof fetch !== 'function') {
      log('Fetch API indisponível. Evento Purchase via CAPI não será enviado.');
      return false;
    }

    let config;
    try {
      config = await loadConfig();
    } catch (error) {
      logError('Erro ao carregar configuração para envio CAPI.', error);
      return false;
    }

    const pixelId = resolveWhatsAppPixelId(config);
    if (!pixelId) {
      log('Pixel ID do WhatsApp não disponível. Evento Purchase via CAPI não será enviado.');
      return false;
    }

    const accessToken = resolveWhatsAppAccessToken(config);
    if (!accessToken) {
      log('Access token do Pixel do WhatsApp não disponível. Evento Purchase via CAPI não será enviado.');
      return false;
    }

    const customer = collectPurchaseCustomerData(customerData);
    const normalizedPhone = normalizePhoneNumber(customer.phone);
    const userAgent = customer.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    const clientIp = customer.ip || (await getClientIpAddress());

    const [hashedPhone, hashedFirstName, hashedLastName] = await Promise.all([
      hashSHA256(normalizedPhone),
      hashSHA256(customer.firstName),
      hashSHA256(customer.lastName)
    ]);

    const userData = {};
    if (hashedPhone) {
      userData.ph = [hashedPhone];
    }
    if (hashedFirstName) {
      userData.fn = [hashedFirstName];
    }
    if (hashedLastName) {
      userData.ln = [hashedLastName];
    }
    if (clientIp) {
      userData.client_ip_address = clientIp;
    }
    if (userAgent) {
      userData.client_user_agent = userAgent;
    }

    const eventTime = Math.floor(Date.now() / 1000);
    const customData = buildCustomData(value, safeToken, utms);

    const eventPayload = {
      event_name: 'Purchase',
      event_time: eventTime,
      event_id: safeToken,
      action_source: 'website',
      user_data: userData,
      custom_data: customData
    };

    if (typeof window !== 'undefined' && window.location && window.location.href) {
      eventPayload.event_source_url = window.location.href;
    }

    let testEventCode = resolveTestEventCode(customer.testEventCode);
    const payloadWithTestCode = withTestEventCode(eventPayload);

    if (!testEventCode && payloadWithTestCode && payloadWithTestCode.test_event_code) {
      testEventCode = payloadWithTestCode.test_event_code;
    } else if (testEventCode) {
      payloadWithTestCode.test_event_code = testEventCode;
    }

    const requestBody = {
      data: [payloadWithTestCode]
    };

    const encodedPixelId = encodeURIComponent(pixelId);
    const encodedToken = encodeURIComponent(accessToken);
    let requestUrl = `https://graph.facebook.com/v19.0/${encodedPixelId}/events?access_token=${encodedToken}`;
    if (testEventCode) {
      requestUrl += `&test_event_code=${encodeURIComponent(testEventCode)}`;
    }

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const responseBody = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMessage = responseBody && responseBody.error ? responseBody.error : response.statusText;
        throw new Error(`Falha ao enviar evento Purchase via CAPI: ${errorMessage || 'Erro desconhecido'}`);
      }

      sentCapiPurchaseTokens.add(safeToken);
      log('Evento Purchase enviado para Facebook CAPI.', {
        eventID: safeToken,
        pixelId,
        value,
        testEventCode: testEventCode || null,
        response: responseBody || null
      });

      return true;
    } catch (error) {
      logError('Erro ao enviar evento Purchase via CAPI.', error);
      return false;
    }
  }

  function log(message, data) {
    if (!DEBUG) {
      return;
    }

    if (typeof data !== 'undefined') {
      console.log(`${LOG_PREFIX} ${message}`, data);
    } else {
      console.log(`${LOG_PREFIX} ${message}`);
    }
  }

  function logError(message, error) {
    if (!DEBUG) {
      return;
    }

    if (error) {
      console.error(`${LOG_PREFIX} ${message}`, error);
    } else {
      console.error(`${LOG_PREFIX} ${message}`);
    }
  }

  if (DEBUG) {
    log('Ambiente localhost detectado - logs habilitados.');
  }

  if (isTestValidationMode()) {
    log('Modo de validação do Facebook Pixel ativo - test_event_code será anexado aos eventos do WhatsApp.', {
      testEventCode: TEST_EVENT_CODE
    });
  }

  function ensureFbqStub() {
    if (window.fbq) {
      return;
    }

    const fbqStub = function() {
      fbqStub.callMethod ? fbqStub.callMethod.apply(fbqStub, arguments) : fbqStub.queue.push(arguments);
    };

    if (!window._fbq) {
      window._fbq = fbqStub;
    }

    fbqStub.push = fbqStub;
    fbqStub.loaded = false;
    fbqStub.version = '2.0';
    fbqStub.queue = [];
    window.fbq = fbqStub;
  }

  function loadFacebookPixelScript() {
    if (window.fbq && window.fbq.callMethod) {
      return Promise.resolve();
    }

    if (facebookPixelScriptPromise) {
      return facebookPixelScriptPromise;
    }

    ensureFbqStub();

    facebookPixelScriptPromise = new Promise((resolve, reject) => {
      try {
        const existingScript = document.querySelector(`script[src="${FB_PIXEL_SRC}"]`);

        if (existingScript) {
          if (existingScript.getAttribute('data-loaded') === 'true' || (window.fbq && window.fbq.callMethod)) {
            resolve();
            return;
          }

          existingScript.addEventListener('load', () => {
            existingScript.setAttribute('data-loaded', 'true');
            resolve();
          }, { once: true });

          existingScript.addEventListener('error', () => {
            facebookPixelScriptPromise = null;
            reject(new Error('Falha ao carregar a biblioteca do Facebook Pixel.'));
          }, { once: true });

          return;
        }

        const script = document.createElement('script');
        script.async = true;
        script.src = FB_PIXEL_SRC;

        script.onload = () => {
          script.setAttribute('data-loaded', 'true');
          resolve();
        };

        script.onerror = () => {
          facebookPixelScriptPromise = null;
          reject(new Error('Falha ao carregar a biblioteca do Facebook Pixel.'));
        };

        const head = document.head || document.getElementsByTagName('head')[0] || document.body;
        if (head) {
          head.appendChild(script);
        } else {
          facebookPixelScriptPromise = null;
          reject(new Error('Não foi possível anexar o script do Facebook Pixel.'));
        }
      } catch (error) {
        facebookPixelScriptPromise = null;
        reject(error);
      }
    });

    return facebookPixelScriptPromise;
  }

  async function loadConfig() {
    if (configCache) {
      return configCache;
    }

    if (configPromise) {
      return configPromise;
    }

    if (typeof fetch === 'undefined') {
      const error = new Error('Fetch API não está disponível neste ambiente.');
      logError('Não foi possível buscar as configurações do WhatsApp.', error);
      throw error;
    }

    const promise = (async () => {
      try {
        const response = await fetch('/api/config', { credentials: 'same-origin' });
        if (!response.ok) {
          throw new Error(`Falha ao carregar configuração do WhatsApp (status ${response.status})`);
        }

        const data = await response.json();
        configCache = data;
        return data;
      } catch (error) {
        logError('Erro ao carregar configuração do WhatsApp.', error);
        throw error;
      } finally {
        configPromise = null;
      }
    })();

    configPromise = promise;
    return promise;
  }

  async function initWhatsAppPixel() {
    if (pixelInitialized) {
      return true;
    }

    if (pixelInitializationPromise) {
      return pixelInitializationPromise;
    }

    const promise = (async () => {
      try {
        const config = await loadConfig();
        const pixelId = config && config.whatsapp && config.whatsapp.pixelId;

        if (!pixelId) {
          log('Pixel ID do WhatsApp não configurado. Rastreamento desativado.');
          return false;
        }

        await loadFacebookPixelScript();

        if (typeof window.fbq !== 'function') {
          throw new Error('fbq não está disponível após carregar a biblioteca do Facebook Pixel.');
        }

        window.fbq('init', pixelId);
        window.fbq('set', 'autoConfig', true, pixelId);

        pixelInitialized = true;
        activePixelId = pixelId;

        log('Facebook Pixel do WhatsApp inicializado.', { pixelId });
        return true;
      } catch (error) {
        logError('Erro ao inicializar o Facebook Pixel do WhatsApp.', error);
        return false;
      } finally {
        pixelInitializationPromise = null;
      }
    })();

    pixelInitializationPromise = promise;
    return promise;
  }

  function getUserId() {
    if (cachedUserId) {
      return cachedUserId;
    }

    if (!window.localStorage) {
      cachedUserId = 'anonimo';
      return cachedUserId;
    }

    try {
      const stored = window.localStorage.getItem(USER_ID_STORAGE_KEY);
      if (stored) {
        cachedUserId = stored;
        return stored;
      }

      const generated = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(USER_ID_STORAGE_KEY, generated);
      cachedUserId = generated;
      return generated;
    } catch (error) {
      cachedUserId = 'anonimo';
      return cachedUserId;
    }
  }

  async function generateHash(input) {
    const source = String(input ?? '');
    const cryptoObj = typeof window !== 'undefined' && window.crypto && window.crypto.subtle ? window.crypto : null;

    if (cryptoObj && typeof TextEncoder !== 'undefined') {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(source);
        const hashBuffer = await cryptoObj.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
        return hashHex.slice(0, 16);
      } catch (error) {
        logError('Falha ao gerar hash usando crypto.subtle.', error);
      }
    }

    const fallback = `${source}|${Date.now()}|${Math.random()}`;
    let hash = 0;
    for (let i = 0; i < fallback.length; i += 1) {
      const charCode = fallback.charCodeAt(i);
      hash = (hash << 5) - hash + charCode;
      hash |= 0;
    }

    const fallbackHex = (
      Math.abs(hash).toString(16) +
      Date.now().toString(16) +
      Math.floor(Math.random() * 0xffffffff).toString(16)
    ).padEnd(16, '0');

    return fallbackHex.slice(0, 16);
  }

  async function generateEventId(eventName, userId, timestamp) {
    const safeEvent = eventName || 'event';
    const safeUser = userId || 'anonimo';
    const safeTimestamp = typeof timestamp === 'number' ? timestamp : Date.now();
    const randomPart = Math.random().toString(36).slice(2, 10);

    const input = `${safeEvent}|${safeUser}|${safeTimestamp}|${randomPart}`;
    return generateHash(input);
  }

  async function trackPageView() {
    if (!pixelInitialized || typeof window.fbq !== 'function') {
      log('Pixel não inicializado. PageView não será enviado.');
      return;
    }

    try {
      const eventID = await generateEventId('PageView', getUserId(), Date.now());
      const eventPayload = withTestEventCode({ eventID });
      window.fbq('track', 'PageView', eventPayload);
      log('Evento PageView enviado.', {
        eventID,
        pixelId: activePixelId,
        testEventCode: eventPayload.test_event_code || null
      });
    } catch (error) {
      logError('Erro ao enviar evento PageView.', error);
    }
  }

  async function trackViewContent() {
    if (!pixelInitialized || typeof window.fbq !== 'function') {
      log('Pixel não inicializado. ViewContent não será enviado.');
      return;
    }

    try {
      const eventID = await generateEventId('ViewContent', getUserId(), Date.now());
      const eventPayload = withTestEventCode({ eventID });
      window.fbq('track', 'ViewContent', eventPayload);
      log('Evento ViewContent enviado.', {
        eventID,
        pixelId: activePixelId,
        testEventCode: eventPayload.test_event_code || null
      });
    } catch (error) {
      logError('Erro ao enviar evento ViewContent.', error);
    }
  }

  async function sendToUtmify(token, numericValue, utms) {
    const safeToken = typeof token === 'string' ? token.trim() : '';
    if (!safeToken) {
      log('Token inválido. Conversão para UTMify não será enviada.');
      return false;
    }

    if (typeof fetch !== 'function') {
      log('Fetch API indisponível. Conversão para UTMify não será enviada.');
      return false;
    }

    const parsedValue = parsePurchaseValue(numericValue);
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      log('Valor inválido para conversão UTMify.', { value: numericValue });
      return false;
    }

    const priceInCents = Math.max(Math.round(parsedValue * 100), 0);
    const gatewayFeeInCents = 0;
    const userCommissionInCents = priceInCents;
    const normalizedUtms = normalizeUtms(utms);
    const timestamp = new Date().toISOString();

    const payload = {
      orderId: safeToken,
      platform: 'whatsapp',
      paymentMethod: 'whatsapp',
      status: 'approved',
      createdAt: timestamp,
      approvedDate: timestamp,
      customer: { ...DEFAULT_CUSTOMER },
      products: [
        {
          ...DEFAULT_PRODUCT,
          priceInCents
        }
      ],
      commission: {
        totalPriceInCents: priceInCents,
        gatewayFeeInCents,
        userCommissionInCents
      },
      trackingParameters: normalizedUtms
    };

    try {
      const response = await fetch('/api/whatsapp/utmify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Falha ao enviar conversão para UTMify (status ${response.status}). ${errorText}`.trim());
      }

      log('Conversão enviada para UTMify com sucesso.', payload);
      return true;
    } catch (error) {
      logError('Erro ao enviar conversão para UTMify.', error);
      return false;
    }
  }

  async function trackPurchase(token, value) {
    const safeToken = typeof token === 'string' ? token.trim() : '';
    if (!safeToken) {
      log('Token inválido. Evento Purchase não será enviado.');
      return false;
    }

    const numericValue = parsePurchaseValue(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      log('Valor inválido. Evento Purchase não será enviado.', { value });
      return false;
    }

    const utms = getStoredUtms();
    const eventID = safeToken;
    let purchaseTracked = false;
    let capiTracked = false;
    let pixelTestEventCode = null;

    try {
      const initialized = pixelInitialized ? true : await initWhatsAppPixel();

      if (initialized && typeof window.fbq === 'function') {
        const eventPayload = withTestEventCode({
          value: numericValue,
          currency: 'BRL',
          eventID,
          ...utms
        });

        window.fbq('track', 'Purchase', eventPayload);
        purchaseTracked = true;
        pixelTestEventCode = eventPayload.test_event_code || null;
        log('Evento Purchase enviado para Facebook Pixel.', {
          eventID,
          value: numericValue,
          pixelId: activePixelId,
          utms,
          testEventCode: eventPayload.test_event_code || null
        });
      } else {
        log('Pixel não inicializado. Evento Purchase não foi enviado ao Facebook Pixel.');
      }
    } catch (error) {
      logError('Erro ao enviar evento Purchase.', error);
    }

    try {
      capiTracked = await sendPurchaseEventToCapi({
        token: safeToken,
        value: numericValue,
        utms,
        customerData: {
          testEventCode: pixelTestEventCode
        }
      });
    } catch (error) {
      logError('Erro inesperado ao enviar Purchase para o Facebook CAPI.', error);
    }

    await sendToUtmify(safeToken, numericValue, utms);

    return purchaseTracked || capiTracked;
  }

  async function init() {
    if (initCompleted) {
      return true;
    }

    if (initExecutionPromise) {
      return initExecutionPromise;
    }

    initExecutionPromise = (async () => {
      const initialized = await initWhatsAppPixel();
      if (!initialized) {
        log('Inicialização do Pixel falhou ou foi desabilitada.');
        return false;
      }

      await trackPageView();

      log(`Agendando ViewContent para daqui a ${VIEW_CONTENT_DELAY / 1000} segundos.`);
      window.setTimeout(() => {
        trackViewContent();
      }, VIEW_CONTENT_DELAY);

      initCompleted = true;
      return true;
    })();

    try {
      return await initExecutionPromise;
    } catch (error) {
      logError('Erro durante a inicialização do rastreamento.', error);
      return false;
    } finally {
      initExecutionPromise = null;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.whatsappTracking = {
    init,
    trackPageView,
    trackViewContent,
    trackPurchase,
    generateEventId,
    generateHash,
    hashSHA256,
    isValidationMode: isTestValidationMode,
    setValidationMode: setTestValidationMode,
    withTestEventCode,
    sendPurchaseEventToCapi
  };
})();
