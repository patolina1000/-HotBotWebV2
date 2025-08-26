/**
 * 🚀 SISTEMA DE MONITORAMENTO DE UPTIME
 * Monitora tempo de atividade para detectar cold starts
 */

class UptimeMonitor {
  constructor() {
    this.startTime = Date.now();
    this.lastActivityTime = Date.now();
    this.coldStartDetected = false;
    this.logInterval = null;
    this.activityCheckInterval = null;
    
    this.initializeMonitoring();
  }

  initializeMonitoring() {
    // Log de uptime a cada 30 minutos
    this.logInterval = setInterval(() => {
      this.logUptimeStatus();
    }, 30 * 60 * 1000);

    // Verificar atividade a cada minuto
    this.activityCheckInterval = setInterval(() => {
      this.checkForColdStart();
    }, 60 * 1000);

    // Log inicial
    console.log('⏰ Sistema de monitoramento de uptime iniciado');
    this.logUptimeStatus();
  }

  // Registrar atividade (chamado em endpoints críticos)
  recordActivity() {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivityTime;
    
    // Se passou muito tempo sem atividade, pode ter sido cold start
    if (timeSinceLastActivity > 20 * 60 * 1000) { // 20 minutos
      console.log(`🚨 POSSÍVEL COLD START DETECTADO: ${Math.round(timeSinceLastActivity / 1000 / 60)} min sem atividade`);
      this.coldStartDetected = true;
    }
    
    this.lastActivityTime = now;
  }

  // Verificar se houve cold start
  checkForColdStart() {
    const now = Date.now();
    const uptime = now - this.startTime;
    
    // Se uptime é muito baixo, provavelmente houve restart
    if (uptime < 5 * 60 * 1000) { // Menos de 5 minutos
      const uptimeMinutes = Math.round(uptime / 1000 / 60);
      if (uptimeMinutes === 1) { // Log apenas uma vez
        console.log(`🔄 RESTART DETECTADO: Servidor reiniciado há ${uptimeMinutes} minuto(s)`);
      }
    }
  }

  // Log periódico de status
  logUptimeStatus() {
    const now = Date.now();
    const uptime = now - this.startTime;
    const lastActivity = now - this.lastActivityTime;
    
    const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    
    const lastActivityMinutes = Math.floor(lastActivity / (1000 * 60));
    
    console.log('📊 STATUS DO SERVIDOR:');
    console.log(`⏰ Uptime: ${uptimeHours}h ${uptimeMinutes}m`);
    console.log(`🔄 Última atividade: ${lastActivityMinutes} min atrás`);
    console.log(`💾 Memória: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);
    
    // Status de cold start
    if (this.coldStartDetected) {
      console.log('🚨 Cold start detectado nesta sessão');
      this.coldStartDetected = false; // Reset flag
    } else {
      console.log('✅ Nenhum cold start detectado');
    }
    
    console.log('─'.repeat(50));
  }

  // Obter estatísticas
  getStats() {
    const now = Date.now();
    const uptime = now - this.startTime;
    const lastActivity = now - this.lastActivityTime;
    
    return {
      startTime: this.startTime,
      uptime: uptime,
      uptimeFormatted: this.formatUptime(uptime),
      lastActivity: lastActivity,
      lastActivityFormatted: this.formatUptime(lastActivity),
      memoryUsage: Math.round(process.memoryUsage().rss / 1024 / 1024),
      coldStartDetected: this.coldStartDetected
    };
  }

  // Formatar tempo
  formatUptime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else {
      return `${minutes}m ${seconds % 60}s`;
    }
  }

  // Cleanup
  destroy() {
    if (this.logInterval) {
      clearInterval(this.logInterval);
    }
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
    }
  }
}

// Instância singleton
let uptimeMonitorInstance = null;

function getUptimeMonitor() {
  if (!uptimeMonitorInstance) {
    uptimeMonitorInstance = new UptimeMonitor();
  }
  return uptimeMonitorInstance;
}

module.exports = {
  UptimeMonitor,
  getUptimeMonitor
};
