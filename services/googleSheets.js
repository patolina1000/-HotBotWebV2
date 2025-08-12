const { google } = require('googleapis');

// Configurações do Google Sheets
const SPREADSHEET_ID = '1SY_wan3SxwIs4Q58chDPp1HMmCCz4wEG3vIklv0QBXc';
const RANGE = 'Sheet1!A:D';

// Credenciais do Service Account (substitua com o JSON completo do Google Cloud Console)
const CREDENTIALS = {
  "type": "service_account",
  "project_id": "rastreamento-funil",
  "private_key_id": "", // PREENCHA: Baixe o JSON completo do Google Cloud Console
  "private_key": "-----BEGIN PRIVATE KEY-----\n\n-----END PRIVATE KEY-----", // PREENCHA: Chave privada completa
  "client_email": "arthur@rastreamento-funil.iam.gserviceaccount.com",
  "client_id": "", // PREENCHA: ID do cliente
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/arthur%40rastreamento-funil.iam.gserviceaccount.com"
};

// API Key alternativa (se service account não funcionar)
const API_KEY = 'AIzaSyAOSHZxrs1YT5t9icuLskuReatte0Agvpk';

// Função para autenticar com Google Sheets
async function authenticate() {
  try {
    // Tenta autenticação com Service Account (recomendado para write)
    if (CREDENTIALS.private_key && CREDENTIALS.private_key_id) {
      const auth = new google.auth.JWT(
        CREDENTIALS.client_email,
        null,
        CREDENTIALS.private_key,
        ['https://www.googleapis.com/auth/spreadsheets']
      );
      
      await auth.authorize();
      return auth;
    } else {
      console.warn('Service Account não configurado. Use API Key para leitura apenas.');
      // Fallback para API Key (só leitura)
      return new google.auth.GoogleAuth({
        key: API_KEY,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      });
    }
  } catch (error) {
    console.error('Erro na autenticação Google Sheets:', error);
    throw error;
  }
}

// Função principal para logar eventos
async function logEvento(evento, oferta = '') {
  try {
    const auth = await authenticate();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Data atual no formato YYYY-MM-DD
    const data = new Date().toISOString().split('T')[0];
    
    // Quantidade sempre 1
    const quantidade = 1;
    
    // Valores para inserir na planilha
    const values = [[data, evento, quantidade, oferta]];
    
    // Verifica se é autenticação de Service Account (permite write)
    if (auth instanceof google.auth.JWT) {
      // Append na planilha
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: RANGE,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: values
        }
      });
      
      console.log(`Evento logado: ${evento} - ${data} - Oferta: ${oferta || 'N/A'}`);
      return response.data;
    } else {
      // Se for API Key, só pode ler
      console.warn('API Key não permite escrita. Configure Service Account para logar eventos.');
      return null;
    }
    
  } catch (error) {
    console.error('Erro ao logar evento no Google Sheets:', error);
    throw error;
  }
}

// Exemplo de uso dos eventos do funil
async function exemplosEventos() {
  // Eventos de entrada
  await logEvento('welcome');
  await logEvento('cta_clicker');
  await logEvento('bot1');
  
  // Eventos de conversão
  await logEvento('pix');
  await logEvento('purchase', 'principal');
  await logEvento('purchase', 'DS1');
  await logEvento('purchase', 'MP1');
}

module.exports = { 
  logEvento,
  exemplosEventos // Opcional: para testes
};