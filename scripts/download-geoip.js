const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const MAXMIND_LICENSE_KEY = process.env.MAXMIND_LICENSE_KEY;
const GEO_DB_PATH = path.join(__dirname, '..', 'geo', 'GeoLite2-City.mmdb');
const GEO_DIR = path.dirname(GEO_DB_PATH);

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {}); // Delete the file async
      reject(err);
    });
  });
}

async function main() {
  try {
    // Verificar se o arquivo já existe
    if (fs.existsSync(GEO_DB_PATH)) {
      console.log('[GEO] Arquivo GeoLite2-City.mmdb já existe, pulando download');
      return;
    }

    if (!MAXMIND_LICENSE_KEY) {
      console.log('[GEO] MAXMIND_LICENSE_KEY não definida, pulando download');
      return;
    }

    console.log('[GEO] Iniciando download do GeoLite2-City...');
    
    // Criar diretório se não existir
    if (!fs.existsSync(GEO_DIR)) {
      fs.mkdirSync(GEO_DIR, { recursive: true });
    }

    // URL do GeoLite2-City (formato .tar.gz)
    const downloadUrl = `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${MAXMIND_LICENSE_KEY}&suffix=tar.gz`;
    const tempFile = path.join(GEO_DIR, 'GeoLite2-City.tar.gz');

    // Download do arquivo
    await downloadFile(downloadUrl, tempFile);
    console.log('[GEO] Download concluído, extraindo...');

    // Extrair arquivo
    execSync(`tar -xzf "${tempFile}" -C "${GEO_DIR}"`, { stdio: 'inherit' });
    
    // Encontrar o arquivo .mmdb extraído
    const files = fs.readdirSync(GEO_DIR);
    const mmdbFile = files.find(file => file.endsWith('.mmdb'));
    
    if (mmdbFile) {
      const extractedPath = path.join(GEO_DIR, mmdbFile);
      fs.renameSync(extractedPath, GEO_DB_PATH);
      console.log('[GEO] Arquivo movido para:', GEO_DB_PATH);
    }

    // Limpar arquivo temporário
    fs.unlinkSync(tempFile);
    console.log('[GEO] Download OK - GeoLite2-City.mmdb pronto');

  } catch (error) {
    console.error('[GEO] Erro no download:', error.message);
    // Não falhar o build em caso de erro
    process.exit(0);
  }
}

main();
