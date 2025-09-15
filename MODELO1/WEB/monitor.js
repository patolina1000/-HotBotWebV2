const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Configurações
const CONFIG = {
  SERVER_URL: process.env.SERVER_URL || 'http://localhost:3000',
  CHECK_INTERVAL: 60000, // 1 minuto
  WEBHOOK_URL: process.env.WEBHOOK_URL || null, // URL do webhook para notificações
  LOG_FILE: './logs/monitor.log',
  MAX_LOG_SIZE: 10 * 1024 * 1024, // 10MB
  ALERT_THRESHOLD: 3, // Alertar após 3 falhas consecutivas
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || null,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || null,
};

class ServerMonitor {
  constructor() {
    this.isServerUp = true;
    this.consecutiveFailures = 0;
    this.lastCheck = null;
    this.stats = {
      uptime: 0,
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      startTime: Date.now(),
      lastResponseTime: 0,
      avgResponseTime: 0,
      responseTimes: []
    };
    
    this.ensureLogDirectory();
    this.startMonitoring();
    
    // Relatório a cada 1 hora
    setInterval(() => this.generateReport(), 60 * 60 * 1000);
  }

  ensureLogDirectory() {
    const logDir = path.dirname(CONFIG.LOG_FILE);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      meta,
      stats: this.stats
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    
    try {
      // Verificar tamanho do arquivo
      if (fs.existsSync(CONFIG.LOG_FILE)) {
        const stat = fs.statSync(CONFIG.LOG_FILE);
        if (stat.size > CONFIG.MAX_LOG_SIZE) {
          // Fazer backup do log atual
          const backupFile = CONFIG.LOG_FILE + '.backup';
          fs.renameSync(CONFIG.LOG_FILE, backupFile);
        }
      }
      
      // Escrever no arquivo
      fs.appendFileSync(CONFIG.LOG_FILE, logLine);
      
      // Console com cores
      const colors = {
        info: '\x1b[36m',    // Cyan
        warn: '\x1b[33m',    // Yellow
        error: '\x1b[31m',   // Red
        success: '\x1b[32m', // Green
        reset: '\x1b[0m'
      };
      
      const color = colors[level] || colors.info;
      console.log(`${color}[${timestamp}] ${level.toUpperCase()}: ${message}${colors.reset}`);
      
      if (meta && Object.keys(meta).length > 0) {
        console.log(`${color}Meta:${colors.reset}`, meta);
      }
      
    } catch (error) {
      console.error('Erro ao escrever log:', error);
    }
  }

  async checkServer() {
    const startTime = Date.now();
    this.stats.totalChecks++;
    
    try {
      const url = new URL(CONFIG.SERVER_URL + '/api/health');
      const client = url.protocol === 'https:' ? https : http;
      
      const response = await new Promise((resolve, reject) => {
        const req = client.get(url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'ServerMonitor/1.0'
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: data
            });
          });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
      });
      
      const responseTime = Date.now() - startTime;
      this.stats.lastResponseTime = responseTime;
      this.stats.responseTimes.push(responseTime);
      
      // Manter apenas os últimos 100 tempos de resposta
      if (this.stats.responseTimes.length > 100) {
        this.stats.responseTimes.shift();
      }
      
      // Calcular média
      this.stats.avgResponseTime = this.stats.responseTimes.reduce((a, b) => a + b, 0) / this.stats.responseTimes.length;
      
      if (response.statusCode === 200) {
        // Tentar parsear JSON
        try {
          const healthData = JSON.parse(response.body);
          await this.handleSuccess(responseTime, healthData);
        } catch (e) {
          await this.handleSuccess(responseTime, null);
        }
      } else {
        await this.handleFailure(`HTTP ${response.statusCode}`, responseTime);
      }
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await this.handleFailure(error.message, responseTime);
    }
    
    this.lastCheck = new Date();
  }

  async handleSuccess(responseTime, healthData) {
    this.stats.successfulChecks++;
    
    // Se estava down, avisar que voltou
    if (!this.isServerUp) {
      this.log('success', `🟢 Servidor voltou ao ar após ${this.consecutiveFailures} falhas`, {
        responseTime,
        downtime: this.consecutiveFailures * (CONFIG.CHECK_INTERVAL / 1000) + ' segundos'
      });
      
      await this.sendAlert('🟢 SERVIDOR RECUPERADO', `Servidor voltou ao ar!\n\nTempo de resposta: ${responseTime}ms\nFalhas consecutivas: ${this.consecutiveFailures}`);
    }
    
    this.isServerUp = true;
    this.consecutiveFailures = 0;
    
    // Log detalhado a cada 10 checks quando tudo OK
    if (this.stats.totalChecks % 10 === 0) {
      this.log('info', `✅ Servidor OK (${responseTime}ms)`, {
        responseTime,
        avgResponseTime: Math.round(this.stats.avgResponseTime),
        uptime: this.getUptime(),
        healthData
      });
    }
  }

  async handleFailure(errorMessage, responseTime) {
    this.stats.failedChecks++;
    this.consecutiveFailures++;
    
    this.log('error', `🔴 Falha no servidor`, {
      error: errorMessage,
      responseTime,
      consecutiveFailures: this.consecutiveFailures,
      failureRate: ((this.stats.failedChecks / this.stats.totalChecks) * 100).toFixed(2) + '%'
    });
    
    // Alertar se atingiu o threshold
    if (this.consecutiveFailures === CONFIG.ALERT_THRESHOLD) {
      this.isServerUp = false;
      const message = `🔴 SERVIDOR FORA DO AR!\n\nFalhas consecutivas: ${this.consecutiveFailures}\nÚltimo erro: ${errorMessage}\nTempo de resposta: ${responseTime}ms`;
      
      await this.sendAlert('🚨 SERVIDOR DOWN', message);
    }
  }

  async sendAlert(title, message) {
    // Webhook genérico
    if (CONFIG.WEBHOOK_URL) {
      try {
        const url = new URL(CONFIG.WEBHOOK_URL);
        const client = url.protocol === 'https:' ? https : http;
        
        const payload = JSON.stringify({
          title,
          message,
          timestamp: new Date().toISOString(),
          stats: this.stats
        });
        
        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        };
        
        const req = client.request(options);
        req.write(payload);
        req.end();
        
      } catch (error) {
        this.log('error', 'Erro ao enviar webhook', { error: error.message });
      }
    }
    
    // Telegram
    if (CONFIG.TELEGRAM_BOT_TOKEN && CONFIG.TELEGRAM_CHAT_ID) {
      try {
        await this.sendTelegramMessage(`${title}\n\n${message}`);
      } catch (error) {
        this.log('error', 'Erro ao enviar Telegram', { error: error.message });
      }
    }
  }

  async sendTelegramMessage(text) {
    const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = JSON.stringify({
      chat_id: CONFIG.TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'HTML'
    });
    
    return new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(`Telegram API error: ${res.statusCode}`));
          }
        });
      });
      
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  getUptime() {
    const uptimeMs = Date.now() - this.stats.startTime;
    const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
    const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }

  generateReport() {
    const report = {
      period: '1 hora',
      uptime: this.getUptime(),
      totalChecks: this.stats.totalChecks,
      successRate: ((this.stats.successfulChecks / this.stats.totalChecks) * 100).toFixed(2) + '%',
      failureRate: ((this.stats.failedChecks / this.stats.totalChecks) * 100).toFixed(2) + '%',
      avgResponseTime: Math.round(this.stats.avgResponseTime) + 'ms',
      lastResponseTime: this.stats.lastResponseTime + 'ms',
      isServerUp: this.isServerUp,
      consecutiveFailures: this.consecutiveFailures
    };
    
    this.log('info', '📊 Relatório de monitoramento', report);
  }

  startMonitoring() {
    this.log('info', '🚀 Monitor iniciado', {
      serverUrl: CONFIG.SERVER_URL,
      checkInterval: CONFIG.CHECK_INTERVAL / 1000 + 's',
      alertThreshold: CONFIG.ALERT_THRESHOLD
    });
    
    // Primeira verificação imediata
    this.checkServer();
    
    // Verificações periódicas
    setInterval(() => {
      this.checkServer();
    }, CONFIG.CHECK_INTERVAL);
  }

  // Método para obter estatísticas
  getStats() {
    return {
      ...this.stats,
      uptime: this.getUptime(),
      successRate: ((this.stats.successfulChecks / this.stats.totalChecks) * 100).toFixed(2) + '%',
      failureRate: ((this.stats.failedChecks / this.stats.totalChecks) * 100).toFixed(2) + '%',
      avgResponseTime: Math.round(this.stats.avgResponseTime) + 'ms',
      isServerUp: this.isServerUp,
      consecutiveFailures: this.consecutiveFailures,
      lastCheck: this.lastCheck
    };
  }
}

// Iniciar monitor
const monitor = new ServerMonitor();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🔄 Parando monitor...');
  monitor.log('info', 'Monitor parado pelo usuário');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('Erro não capturado no monitor:', error);
  if (monitor) {
    monitor.log('error', 'Erro não capturado', { error: error.message, stack: error.stack });
  }
  process.exit(1);
});

module.exports = monitor;
