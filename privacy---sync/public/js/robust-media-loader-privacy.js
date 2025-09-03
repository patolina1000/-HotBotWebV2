/**
 * Sistema Robusto de Carregamento de Mídias - Privacy Edition
 * Garante que todas as imagens, vídeos e recursos sejam carregados com fallbacks e retries
 * Integração específica para o sistema Privacy
 * Versão: 1.0.0
 */

class RobustMediaLoaderPrivacy {
  constructor() {
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 segundo
    this.loadedMedia = new Map();
    this.failedMedia = new Map();
    this.loadingPromises = new Map();
    this.observers = [];
    
    // Configurações de fallback específicas do Privacy
    this.fallbackConfig = {
      images: [
        '/images/banner.jpg',
        '/images/logo.png',
        '/images/hadrielle.jpg',
        '/images/fundo.jpg',
        'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExYTFhIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZmlsbD0iI2ZmZmZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlbSBJbmRpc3BvbsOtdmVsPC90ZXh0Pjwvc3ZnPg=='
      ],
      videos: [
        '/media/vid01.mp4',
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
      ],
      css: [
        '/css/privacy.css',
        '/css/app.css',
        '/css/core.css',
        '/css/bulma.min.css',
        '/css/bootstrap.min.css'
      ]
    };
    
    console.log('🎬 [PRIVACY-MEDIA-LOADER] Sistema robusto inicializado');
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
    console.log('🔧 [PRIVACY-MEDIA-LOADER] Configurando sistema...');
    
    // Verificar e corrigir CSS faltantes
    this.ensureCSSLoaded();
    
    // Interceptar mudanças no background-image
    this.interceptBackgroundImages();
    
    // Monitorar mídias existentes
    this.scanExistingMedia();
    
    // Configurar observers
    this.setupMutationObserver();
    this.setupErrorHandlers();
    
    // Interceptar criação dinâmica
    this.interceptDynamicMedia();
    
    // Monitorar carrossel e galerias específicas do Privacy
    this.setupCarouselMonitoring();
  }
  
  /**
   * Garante que todos os CSS essenciais estejam carregados
   */
  async ensureCSSLoaded() {
    console.log('🎨 [PRIVACY-MEDIA-LOADER] Verificando CSS essenciais...');
    
    const essentialCSS = [
      '/css/privacy.css',
      '/css/app.css',
      '/css/core.css'
    ];
    
    for (const cssPath of essentialCSS) {
      try {
        await this.ensureStylesheetLoaded(cssPath);
      } catch (error) {
        console.warn(`⚠️ [PRIVACY-MEDIA-LOADER] Falha ao carregar CSS: ${cssPath}`, error);
      }
    }
  }
  
  /**
   * Garante que um stylesheet seja carregado
   */
  ensureStylesheetLoaded(href) {
    return new Promise((resolve, reject) => {
      // Verificar se já existe
      const existing = document.querySelector(`link[href="${href}"]`);
      if (existing) {
        resolve(existing);
        return;
      }
      
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout ao carregar CSS: ${href}`));
      }, 10000);
      
      link.onload = () => {
        clearTimeout(timeout);
        console.log('✅ [PRIVACY-MEDIA-LOADER] CSS carregado:', href);
        resolve(link);
      };
      
      link.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`Erro ao carregar CSS: ${href}`));
      };
      
      document.head.appendChild(link);
    });
  }
  
  /**
   * Monitora especificamente elementos do carrossel do Privacy
   */
  setupCarouselMonitoring() {
    console.log('🎠 [PRIVACY-MEDIA-LOADER] Configurando monitoramento de carrossel...');
    
    // Monitorar carrossel de mídia
    const carouselObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Verificar elementos específicos do carrossel
            if (node.classList && (
              node.classList.contains('carousel-media') ||
              node.classList.contains('bg-image') ||
              node.classList.contains('carousel-inner')
            )) {
              this.processCarouselElement(node);
            }
            
            // Verificar dentro do elemento
            if (node.querySelectorAll) {
              node.querySelectorAll('.carousel-media img, .bg-image, .carousel-inner img').forEach(img => {
                this.ensureImageLoaded(img);
              });
            }
          }
        });
      });
    });
    
    // Observar containers específicos do Privacy
    const containers = document.querySelectorAll('.carousel-inner, .medias-container, .background');
    containers.forEach(container => {
      carouselObserver.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'style']
      });
    });
    
    this.observers.push(carouselObserver);
  }
  
  /**
   * Processa elementos específicos do carrossel
   */
  async processCarouselElement(element) {
    console.log('🎠 [PRIVACY-MEDIA-LOADER] Processando elemento do carrossel:', element);
    
    // Processar imagens dentro do elemento
    const images = element.querySelectorAll('img');
    for (const img of images) {
      if (img.src) {
        await this.ensureImageLoaded(img);
      }
    }
    
    // Processar background images
    const computedStyle = window.getComputedStyle(element);
    const backgroundImage = computedStyle.backgroundImage;
    
    if (backgroundImage && backgroundImage !== 'none') {
      const urls = this.extractUrlsFromCSS(backgroundImage);
      for (const url of urls) {
        await this.loadBackgroundImage(element.style, url, 'background-image');
      }
    }
  }
  
  /**
   * Configurar handlers de erro específicos do Privacy
   */
  setupErrorHandlers() {
    // Handler para erros de recursos
    window.addEventListener('error', (event) => {
      if (event.target && (event.target.tagName === 'IMG' || event.target.tagName === 'VIDEO')) {
        console.warn('🚨 [PRIVACY-MEDIA-LOADER] Erro detectado em mídia:', event.target.src);
        this.handleMediaError(event.target);
      }
    }, true);
    
    // Handler específico para imagens do Privacy
    document.addEventListener('error', (event) => {
      if (event.target.classList && event.target.classList.contains('bg-image')) {
        console.warn('🚨 [PRIVACY-MEDIA-LOADER] Erro em imagem de fundo:', event.target.src);
        this.handleBgImageError(event.target);
      }
    }, true);
  }
  
  /**
   * Trata erros em imagens de fundo específicas do Privacy
   */
  async handleBgImageError(imgElement) {
    const fallbackImages = [
      '/images/banner.jpg',
      '/images/fundo.jpg',
      'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExYTFhIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZmlsbD0iI2ZmZmZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlbSBJbmRpc3BvbsOtdmVsPC90ZXh0Pjwvc3ZnPg=='
    ];
    
    for (const fallback of fallbackImages) {
      try {
        await this.preloadImage(fallback);
        imgElement.src = fallback;
        console.log('✅ [PRIVACY-MEDIA-LOADER] Fallback aplicado para bg-image:', fallback);
        break;
      } catch (error) {
        console.warn('⚠️ [PRIVACY-MEDIA-LOADER] Fallback falhou:', fallback, error);
      }
    }
  }
  
  /**
   * Trata erros gerais em mídias
   */
  async handleMediaError(mediaElement) {
    if (mediaElement.tagName === 'IMG') {
      await this.ensureImageLoaded(mediaElement);
    } else if (mediaElement.tagName === 'VIDEO') {
      await this.ensureVideoLoaded(mediaElement);
    }
  }
  
  /**
   * Intercepta mudanças no background-image (herda do sistema base)
   */
  interceptBackgroundImages() {
    const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
    
    CSSStyleDeclaration.prototype.setProperty = function(property, value, priority) {
      if (property === 'background-image' && value.includes('url(')) {
        const urls = window.RobustMediaLoaderPrivacy.extractUrlsFromCSS(value);
        urls.forEach(url => {
          window.RobustMediaLoaderPrivacy.loadBackgroundImage(this, url, property, priority);
        });
      } else {
        originalSetProperty.call(this, property, value, priority);
      }
    };
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
          console.log(`🔄 [PRIVACY-MEDIA-LOADER] Tentando background: ${url} (tentativa ${retries + 1})`);
          
          await this.preloadImage(url);
          
          if (typeof styleObj.setProperty === 'function') {
            styleObj.setProperty(property, `url('${url}')`, priority);
          } else {
            styleObj.backgroundImage = `url('${url}')`;
          }
          
          console.log('✅ [PRIVACY-MEDIA-LOADER] Background carregado:', url);
          return { url, success: true, attempts: retries + 1 };
          
        } catch (error) {
          console.warn(`⚠️ [PRIVACY-MEDIA-LOADER] Falha background ${url}:`, error);
          retries++;
          
          if (retries <= this.maxRetries) {
            await this.delay(this.retryDelay * retries);
          }
        }
      }
    }
    
    throw new Error(`Falha ao carregar background: ${originalUrl}`);
  }
  
  /**
   * Escaneia mídias existentes
   */
  scanExistingMedia() {
    console.log('🔍 [PRIVACY-MEDIA-LOADER] Escaneando mídias existentes...');
    
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
    
    // Escanear background images
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
   * Configura mutation observer
   */
  setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'IMG' && node.src) {
              this.ensureImageLoaded(node);
            }
            
            if (node.tagName === 'VIDEO') {
              this.ensureVideoLoaded(node);
            }
            
            if (node.querySelectorAll) {
              node.querySelectorAll('img[src]').forEach(img => {
                this.ensureImageLoaded(img);
              });
              
              node.querySelectorAll('video').forEach(video => {
                this.ensureVideoLoaded(video);
              });
            }
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
    const originalCreateElement = document.createElement;
    document.createElement = function(tagName) {
      const element = originalCreateElement.call(this, tagName);
      
      if (tagName.toLowerCase() === 'img') {
        const originalSrcSetter = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src').set;
        Object.defineProperty(element, 'src', {
          set: function(value) {
            originalSrcSetter.call(this, value);
            if (value) {
              window.RobustMediaLoaderPrivacy.ensureImageLoaded(this);
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
   * Garante que uma imagem seja carregada
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
          console.log(`🔄 [PRIVACY-MEDIA-LOADER] Tentando imagem: ${url} (tentativa ${retries + 1})`);
          
          await this.preloadImage(url);
          imgElement.src = url;
          
          console.log('✅ [PRIVACY-MEDIA-LOADER] Imagem carregada:', url);
          return { url, success: true, attempts: retries + 1 };
          
        } catch (error) {
          console.warn(`⚠️ [PRIVACY-MEDIA-LOADER] Falha imagem ${url}:`, error);
          retries++;
          
          if (retries <= this.maxRetries) {
            await this.delay(this.retryDelay * retries);
          }
        }
      }
    }
    
    throw new Error(`Falha ao carregar imagem: ${originalSrc}`);
  }
  
  /**
   * Garante que um vídeo seja carregado
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
          console.log(`🔄 [PRIVACY-MEDIA-LOADER] Tentando vídeo: ${url} (tentativa ${retries + 1})`);
          
          await this.preloadVideo(url);
          videoElement.src = url;
          
          console.log('✅ [PRIVACY-MEDIA-LOADER] Vídeo carregado:', url);
          return { url, success: true, attempts: retries + 1 };
          
        } catch (error) {
          console.warn(`⚠️ [PRIVACY-MEDIA-LOADER] Falha vídeo ${url}:`, error);
          retries++;
          
          if (retries <= this.maxRetries) {
            await this.delay(this.retryDelay * retries);
          }
        }
      }
    }
    
    throw new Error(`Falha ao carregar vídeo: ${originalSrc}`);
  }
  
  /**
   * Pré-carrega uma imagem
   */
  preloadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout imagem: ${src}`));
      }, 10000);
      
      img.onload = () => {
        clearTimeout(timeout);
        resolve(img);
      };
      
      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`Erro imagem: ${src}`));
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
        reject(new Error(`Timeout vídeo: ${src}`));
      }, 15000);
      
      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        resolve(video);
      };
      
      video.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`Erro vídeo: ${src}`));
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
   * Força recarregamento de mídias falhadas
   */
  async retryFailedMedia() {
    console.log('🔄 [PRIVACY-MEDIA-LOADER] Tentando recarregar mídias falhadas...');
    
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
        console.error(`❌ [PRIVACY-MEDIA-LOADER] Falha ao retentar ${key}:`, error);
      }
    }
  }
  
  /**
   * Obtém estatísticas
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
   * Limpa sistema
   */
  destroy() {
    this.loadedMedia.clear();
    this.failedMedia.clear();
    this.loadingPromises.clear();
    
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    
    console.log('🗑️ [PRIVACY-MEDIA-LOADER] Sistema destruído');
  }
}

// Inicializar sistema globalmente
if (typeof window !== 'undefined') {
  window.RobustMediaLoaderPrivacy = new RobustMediaLoaderPrivacy();
  
  // Expor métodos úteis globalmente
  window.retryFailedMediaPrivacy = () => window.RobustMediaLoaderPrivacy.retryFailedMedia();
  window.getMediaStatsPrivacy = () => window.RobustMediaLoaderPrivacy.getStats();
}
