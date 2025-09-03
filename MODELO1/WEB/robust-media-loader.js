/**
 * Sistema Robusto de Carregamento de Mídias
 * Garante que todas as imagens e vídeos sejam carregados com fallbacks e retries
 * Versão: 1.0.0
 */

class RobustMediaLoader {
  constructor() {
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 segundo
    this.loadedMedia = new Map();
    this.failedMedia = new Map();
    this.loadingPromises = new Map();
    this.observers = [];
    
    // Configurações de fallback
    this.fallbackConfig = {
      images: [
        'assets/imagem.jpg',
        'assets/banner.jpg',
        'https://via.placeholder.com/800x600/1a1a1a/ffffff?text=Imagem+Indisponível'
      ],
      videos: [
        'assets/video.mp4',
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
      ]
    };
    
    console.log('🎬 [MEDIA-LOADER] Sistema de carregamento robusto inicializado');
    this.init();
  }
  
  init() {
    // Aguardar DOM estar pronto
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupMediaLoader());
    } else {
      this.setupMediaLoader();
    }
  }
  
  setupMediaLoader() {
    console.log('🔧 [MEDIA-LOADER] Configurando sistema de carregamento...');
    
    // Interceptar mudanças no background-image via CSS
    this.interceptBackgroundImages();
    
    // Monitorar imagens e vídeos existentes
    this.scanExistingMedia();
    
    // Configurar observer para novos elementos
    this.setupMutationObserver();
    
    // Interceptar mudanças dinâmicas no DOM
    this.interceptDynamicMedia();
  }
  
  /**
   * Intercepta e monitora imagens de fundo definidas via CSS
   */
  interceptBackgroundImages() {
    const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
    
    CSSStyleDeclaration.prototype.setProperty = function(property, value, priority) {
      if (property === 'background-image' && value.includes('url(')) {
        const urls = this.extractUrlsFromCSS(value);
        urls.forEach(url => {
          window.RobustMediaLoader.loadBackgroundImage(this, url, property, priority);
        });
      } else {
        originalSetProperty.call(this, property, value, priority);
      }
    }.bind(this);
    
    // Interceptar mudanças no style.backgroundImage
    Object.defineProperty(HTMLElement.prototype, 'backgroundImage', {
      set: function(value) {
        if (value && value.includes('url(')) {
          const urls = window.RobustMediaLoader.extractUrlsFromCSS(value);
          urls.forEach(url => {
            window.RobustMediaLoader.loadBackgroundImage(this.style, url, 'background-image');
          });
        } else {
          this.style.backgroundImage = value;
        }
      },
      get: function() {
        return this.style.backgroundImage;
      }
    });
  }
  
  /**
   * Extrai URLs de propriedades CSS
   */
  extractUrlsFromCSS(cssValue) {
    const urlRegex = /url\(['"]?([^'"]+)['"]?\)/g;
    const urls = [];
    let match;
    
    while ((match = urlRegex.exec(cssValue)) !== null) {
      urls.push(match[1]);
    }
    
    return urls;
  }
  
  /**
   * Carrega imagem de fundo com fallback
   */
  async loadBackgroundImage(styleObj, originalUrl, property, priority = '') {
    const cacheKey = `bg_${originalUrl}`;
    
    if (this.loadedMedia.has(cacheKey)) {
      console.log('🎯 [MEDIA-LOADER] Background image já carregada (cache):', originalUrl);
      return this.loadedMedia.get(cacheKey);
    }
    
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }
    
    const loadPromise = this.tryLoadBackgroundImage(styleObj, originalUrl, property, priority);
    this.loadingPromises.set(cacheKey, loadPromise);
    
    try {
      const result = await loadPromise;
      this.loadedMedia.set(cacheKey, result);
      return result;
    } catch (error) {
      this.failedMedia.set(cacheKey, error);
      throw error;
    } finally {
      this.loadingPromises.delete(cacheKey);
    }
  }
  
  /**
   * Tenta carregar imagem de fundo com fallbacks
   */
  async tryLoadBackgroundImage(styleObj, originalUrl, property, priority = '') {
    const urls = [originalUrl, ...this.fallbackConfig.images];
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      let retries = 0;
      
      while (retries <= this.maxRetries) {
        try {
          console.log(`🔄 [MEDIA-LOADER] Tentando carregar background: ${url} (tentativa ${retries + 1})`);
          
          await this.preloadImage(url);
          
          // Aplicar a imagem de fundo
          if (typeof styleObj.setProperty === 'function') {
            styleObj.setProperty(property, `url('${url}')`, priority);
          } else {
            styleObj.backgroundImage = `url('${url}')`;
          }
          
          console.log('✅ [MEDIA-LOADER] Background image carregada com sucesso:', url);
          return { url, success: true, attempts: retries + 1 };
          
        } catch (error) {
          console.warn(`⚠️ [MEDIA-LOADER] Falha ao carregar background ${url} (tentativa ${retries + 1}):`, error);
          retries++;
          
          if (retries <= this.maxRetries) {
            await this.delay(this.retryDelay * retries);
          }
        }
      }
    }
    
    throw new Error(`Falha ao carregar todas as opções de background image para: ${originalUrl}`);
  }
  
  /**
   * Escaneia mídias existentes no DOM
   */
  scanExistingMedia() {
    console.log('🔍 [MEDIA-LOADER] Escaneando mídias existentes...');
    
    // Escanear imagens
    document.querySelectorAll('img').forEach(img => {
      if (img.src) {
        this.ensureImageLoaded(img);
      }
    });
    
    // Escanear vídeos
    document.querySelectorAll('video').forEach(video => {
      if (video.src || video.querySelector('source')) {
        this.ensureVideoLoaded(video);
      }
    });
    
    // Escanear elementos com background-image
    this.scanBackgroundImages();
  }
  
  /**
   * Escaneia elementos com background-image
   */
  scanBackgroundImages() {
    document.querySelectorAll('*').forEach(element => {
      const computedStyle = window.getComputedStyle(element);
      const backgroundImage = computedStyle.backgroundImage;
      
      if (backgroundImage && backgroundImage !== 'none') {
        const urls = this.extractUrlsFromCSS(backgroundImage);
        urls.forEach(url => {
          this.loadBackgroundImage(element.style, url, 'background-image');
        });
      }
    });
  }
  
  /**
   * Configura observer para novos elementos
   */
  setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Verificar se é imagem
            if (node.tagName === 'IMG' && node.src) {
              this.ensureImageLoaded(node);
            }
            
            // Verificar se é vídeo
            if (node.tagName === 'VIDEO') {
              this.ensureVideoLoaded(node);
            }
            
            // Verificar imagens e vídeos dentro do novo elemento
            node.querySelectorAll && node.querySelectorAll('img[src]').forEach(img => {
              this.ensureImageLoaded(img);
            });
            
            node.querySelectorAll && node.querySelectorAll('video').forEach(video => {
              this.ensureVideoLoaded(video);
            });
          }
        });
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    this.observers.push(observer);
  }
  
  /**
   * Intercepta criação dinâmica de mídias
   */
  interceptDynamicMedia() {
    // Interceptar createElement para imagens
    const originalCreateElement = document.createElement;
    document.createElement = function(tagName) {
      const element = originalCreateElement.call(this, tagName);
      
      if (tagName.toLowerCase() === 'img') {
        const originalSrcSetter = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src').set;
        Object.defineProperty(element, 'src', {
          set: function(value) {
            originalSrcSetter.call(this, value);
            if (value) {
              window.RobustMediaLoader.ensureImageLoaded(this);
            }
          },
          get: function() {
            return originalSrcSetter.call(this);
          }
        });
      }
      
      return element;
    };
  }
  
  /**
   * Garante que uma imagem seja carregada com fallback
   */
  async ensureImageLoaded(imgElement) {
    const originalSrc = imgElement.src;
    const cacheKey = `img_${originalSrc}`;
    
    if (this.loadedMedia.has(cacheKey)) {
      return this.loadedMedia.get(cacheKey);
    }
    
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }
    
    const loadPromise = this.tryLoadImage(imgElement, originalSrc);
    this.loadingPromises.set(cacheKey, loadPromise);
    
    try {
      const result = await loadPromise;
      this.loadedMedia.set(cacheKey, result);
      return result;
    } catch (error) {
      this.failedMedia.set(cacheKey, error);
      throw error;
    } finally {
      this.loadingPromises.delete(cacheKey);
    }
  }
  
  /**
   * Tenta carregar imagem com fallbacks
   */
  async tryLoadImage(imgElement, originalSrc) {
    const urls = [originalSrc, ...this.fallbackConfig.images];
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      let retries = 0;
      
      while (retries <= this.maxRetries) {
        try {
          console.log(`🔄 [MEDIA-LOADER] Tentando carregar imagem: ${url} (tentativa ${retries + 1})`);
          
          await this.preloadImage(url);
          imgElement.src = url;
          
          console.log('✅ [MEDIA-LOADER] Imagem carregada com sucesso:', url);
          return { url, success: true, attempts: retries + 1 };
          
        } catch (error) {
          console.warn(`⚠️ [MEDIA-LOADER] Falha ao carregar imagem ${url} (tentativa ${retries + 1}):`, error);
          retries++;
          
          if (retries <= this.maxRetries) {
            await this.delay(this.retryDelay * retries);
          }
        }
      }
    }
    
    throw new Error(`Falha ao carregar todas as opções de imagem para: ${originalSrc}`);
  }
  
  /**
   * Garante que um vídeo seja carregado com fallback
   */
  async ensureVideoLoaded(videoElement) {
    const originalSrc = videoElement.src || videoElement.querySelector('source')?.src;
    if (!originalSrc) return;
    
    const cacheKey = `video_${originalSrc}`;
    
    if (this.loadedMedia.has(cacheKey)) {
      return this.loadedMedia.get(cacheKey);
    }
    
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }
    
    const loadPromise = this.tryLoadVideo(videoElement, originalSrc);
    this.loadingPromises.set(cacheKey, loadPromise);
    
    try {
      const result = await loadPromise;
      this.loadedMedia.set(cacheKey, result);
      return result;
    } catch (error) {
      this.failedMedia.set(cacheKey, error);
      throw error;
    } finally {
      this.loadingPromises.delete(cacheKey);
    }
  }
  
  /**
   * Tenta carregar vídeo com fallbacks
   */
  async tryLoadVideo(videoElement, originalSrc) {
    const urls = [originalSrc, ...this.fallbackConfig.videos];
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      let retries = 0;
      
      while (retries <= this.maxRetries) {
        try {
          console.log(`🔄 [MEDIA-LOADER] Tentando carregar vídeo: ${url} (tentativa ${retries + 1})`);
          
          await this.preloadVideo(url);
          videoElement.src = url;
          
          console.log('✅ [MEDIA-LOADER] Vídeo carregado com sucesso:', url);
          return { url, success: true, attempts: retries + 1 };
          
        } catch (error) {
          console.warn(`⚠️ [MEDIA-LOADER] Falha ao carregar vídeo ${url} (tentativa ${retries + 1}):`, error);
          retries++;
          
          if (retries <= this.maxRetries) {
            await this.delay(this.retryDelay * retries);
          }
        }
      }
    }
    
    throw new Error(`Falha ao carregar todas as opções de vídeo para: ${originalSrc}`);
  }
  
  /**
   * Pré-carrega uma imagem
   */
  preloadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout ao carregar imagem: ${src}`));
      }, 10000); // 10 segundos de timeout
      
      img.onload = () => {
        clearTimeout(timeout);
        resolve(img);
      };
      
      img.onerror = (error) => {
        clearTimeout(timeout);
        reject(new Error(`Erro ao carregar imagem: ${src}`));
      };
      
      img.src = src;
    });
  }
  
  /**
   * Pré-carrega um vídeo
   */
  preloadVideo(src) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout ao carregar vídeo: ${src}`));
      }, 15000); // 15 segundos de timeout
      
      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        resolve(video);
      };
      
      video.onerror = (error) => {
        clearTimeout(timeout);
        reject(new Error(`Erro ao carregar vídeo: ${src}`));
      };
      
      video.src = src;
    });
  }
  
  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Força o recarregamento de todas as mídias falhadas
   */
  async retryFailedMedia() {
    console.log('🔄 [MEDIA-LOADER] Tentando recarregar mídias falhadas...');
    
    const failedKeys = Array.from(this.failedMedia.keys());
    this.failedMedia.clear();
    
    for (const key of failedKeys) {
      try {
        if (key.startsWith('img_')) {
          const src = key.replace('img_', '');
          const imgs = document.querySelectorAll(`img[src="${src}"]`);
          for (const img of imgs) {
            await this.ensureImageLoaded(img);
          }
        } else if (key.startsWith('video_')) {
          const src = key.replace('video_', '');
          const videos = document.querySelectorAll(`video[src="${src}"]`);
          for (const video of videos) {
            await this.ensureVideoLoaded(video);
          }
        }
      } catch (error) {
        console.error(`❌ [MEDIA-LOADER] Falha ao retentar ${key}:`, error);
      }
    }
  }
  
  /**
   * Obtém estatísticas de carregamento
   */
  getStats() {
    return {
      loaded: this.loadedMedia.size,
      failed: this.failedMedia.size,
      loading: this.loadingPromises.size,
      loadedMedia: Array.from(this.loadedMedia.keys()),
      failedMedia: Array.from(this.failedMedia.keys())
    };
  }
  
  /**
   * Limpa cache e observers
   */
  destroy() {
    this.loadedMedia.clear();
    this.failedMedia.clear();
    this.loadingPromises.clear();
    
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    
    console.log('🗑️ [MEDIA-LOADER] Sistema de carregamento destruído');
  }
}

// Inicializar sistema globalmente
if (typeof window !== 'undefined') {
  window.RobustMediaLoader = new RobustMediaLoader();
  
  // Expor métodos úteis globalmente
  window.retryFailedMedia = () => window.RobustMediaLoader.retryFailedMedia();
  window.getMediaStats = () => window.RobustMediaLoader.getStats();
}
