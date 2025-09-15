/**
 * fbclid-handler.js - Gerenciamento correto do cookie _fbc
 * 
 * Este script captura o parâmetro fbclid da URL e cria o cookie _fbc
 * no formato correto: fb.1.timestamp.fbclid
 */

(function() {
  'use strict';
  
  console.log('🔧 fbclid-handler.js carregado');
  
  /**
   * Captura o fbclid da URL atual
   * @returns {string|null} O valor do fbclid ou null se não encontrado
   */
  function capturarFbclid() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const fbclid = urlParams.get('fbclid');
      
      if (fbclid && fbclid.trim()) {
        console.log('✅ fbclid capturado da URL:', fbclid);
        return fbclid.trim();
      }
      
      console.log('ℹ️ Nenhum fbclid encontrado na URL');
      return null;
    } catch (error) {
      console.error('❌ Erro ao capturar fbclid:', error);
      return null;
    }
  }
  
  /**
   * Constrói o valor _fbc no formato correto
   * @param {string} fbclid - O valor do fbclid capturado
   * @returns {string} O valor _fbc formatado
   */
  function construirFbc(fbclid) {
    // Formato: fb.1.timestamp.fbclid
    const timestamp = Date.now(); // timestamp em milissegundos
    const fbc = `fb.1.${timestamp}.${fbclid}`;
    
    console.log('🔧 _fbc construído:', fbc);
    return fbc;
  }
  
  /**
   * Define o cookie _fbc com validade de 90 dias
   * @param {string} fbcValue - O valor _fbc a ser definido
   */
  function definirCookieFbc(fbcValue) {
    try {
      // Validade de 90 dias
      const dataExpiracao = new Date();
      dataExpiracao.setDate(dataExpiracao.getDate() + 90);
      
      // Configurações do cookie
      const cookieConfig = [
        `_fbc=${encodeURIComponent(fbcValue)}`,
        `expires=${dataExpiracao.toUTCString()}`,
        'path=/',
        'SameSite=Lax'
      ];
      
      // Adicionar Secure se for HTTPS
      if (window.location.protocol === 'https:') {
        cookieConfig.push('Secure');
      }
      
      document.cookie = cookieConfig.join('; ');
      
      console.log('✅ Cookie _fbc definido com sucesso');
      console.log('📅 Validade: 90 dias');
      
      // Salvar no localStorage como backup
      try {
        localStorage.setItem('fbc', fbcValue);
        console.log('💾 _fbc salvo no localStorage como backup');
      } catch (e) {
        console.warn('⚠️ Não foi possível salvar _fbc no localStorage:', e);
      }
      
    } catch (error) {
      console.error('❌ Erro ao definir cookie _fbc:', error);
    }
  }
  
  /**
   * Verifica se já existe um cookie _fbc válido
   * @returns {string|null} O valor _fbc existente ou null
   */
  function obterFbcExistente() {
    try {
      // Verificar cookie primeiro
      const match = document.cookie.match(/(?:^|; )_fbc=([^;]*)/);
      if (match && match[1]) {
        const fbcExistente = decodeURIComponent(match[1]);
        console.log('ℹ️ Cookie _fbc existente encontrado:', fbcExistente);
        return fbcExistente;
      }
      
      // Verificar localStorage como fallback
      const fbcLocalStorage = localStorage.getItem('fbc');
      if (fbcLocalStorage) {
        console.log('ℹ️ _fbc encontrado no localStorage:', fbcLocalStorage);
        return fbcLocalStorage;
      }
      
      console.log('ℹ️ Nenhum _fbc existente encontrado');
      return null;
    } catch (error) {
      console.error('❌ Erro ao verificar _fbc existente:', error);
      return null;
    }
  }
  
  /**
   * Valida se um valor _fbc está no formato correto
   * @param {string} fbc - O valor _fbc a ser validado
   * @returns {boolean} True se válido, false caso contrário
   */
  function validarFormatoFbc(fbc) {
    // Formato esperado: fb.1.timestamp.fbclid
    const regex = /^fb\.1\.\d{13}\.[\w-]+$/;
    return regex.test(fbc);
  }
  
  /**
   * Função principal para processar o fbclid e configurar _fbc
   */
  function processarFbclid() {
    console.log('🚀 Iniciando processamento do fbclid...');
    
    // Verificar se já existe um _fbc válido
    const fbcExistente = obterFbcExistente();
    if (fbcExistente && validarFormatoFbc(fbcExistente)) {
      console.log('✅ _fbc válido já existe, não é necessário recriar');
      return fbcExistente;
    }
    
    // Capturar fbclid da URL
    const fbclid = capturarFbclid();
    if (!fbclid) {
      console.log('ℹ️ Nenhum fbclid na URL, mantendo _fbc existente ou aguardando');
      return fbcExistente;
    }
    
    // Construir e definir novo _fbc
    const novoFbc = construirFbc(fbclid);
    definirCookieFbc(novoFbc);
    
    return novoFbc;
  }
  
  /**
   * Função de limpeza para remover parâmetro fbclid da URL (opcional)
   */
  function limparFbclidDaUrl() {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('fbclid')) {
        url.searchParams.delete('fbclid');
        
        // Atualizar URL sem recarregar a página
        window.history.replaceState({}, document.title, url.toString());
        console.log('🧹 fbclid removido da URL');
      }
    } catch (error) {
      console.error('❌ Erro ao limpar fbclid da URL:', error);
    }
  }
  
  // Executar processamento quando o DOM estiver pronto
  function inicializar() {
    console.log('🔧 Inicializando fbclid-handler...');
    
    const fbcProcessado = processarFbclid();
    
    // Opcional: limpar fbclid da URL após processamento
    if (fbcProcessado) {
      setTimeout(limparFbclidDaUrl, 1000);
    }
    
    console.log('✅ fbclid-handler inicializado');
  }
  
  // Executar imediatamente se DOM já estiver pronto, senão aguardar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }
  
  // Expor função globalmente para uso manual se necessário
  window.fbclidHandler = {
    processar: processarFbclid,
    obterFbc: obterFbcExistente,
    validarFbc: validarFormatoFbc
  };
  
})();
