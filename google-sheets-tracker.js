const express = require('express');
const { google } = require('googleapis');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurações do Google Sheets
const SPREADSHEET_ID = '1SY_wan3SxwIs4Q58chDPp1HMmCCz4wEG3vIklv0QBXc';
const SERVICE_ACCOUNT_EMAIL = 'arthur@rastreamento-funil.iam.gserviceaccount.com';
const API_KEY = 'AIzaSyAOSHZxrs1YT5t9icuLskuReatte0Agvpk';

// Mapeamento de eventos para abas
const EVENTO_TO_SHEET = {
  'welcome': 'Welcome',
  'cta_click': 'CTA_Click',
  'botstart': 'BotStart',
  'pixgerado': 'PixGerado',
  'purchase': 'Purchase'
};

// Configuração da autenticação
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'service-account-key.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

// Função para obter a data atual no formato brasileiro
function getDataAtual() {
  const hoje = new Date();
  return hoje.toLocaleDateString('pt-BR');
}

// Função para registrar evento simples
async function registrarEvento(evento) {
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const dataAtual = getDataAtual();
    
    // Verificar se já existe uma linha para hoje
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${EVENTO_TO_SHEET[evento]}!A:B`
    });
    
    const valores = response.data.values || [];
    let linhaExistente = -1;
    
    // Procurar por linha existente com a data de hoje
    for (let i = 0; i < valores.length; i++) {
      if (valores[i][0] === dataAtual) {
        linhaExistente = i + 1; // +1 porque as linhas do Sheets começam em 1
        break;
      }
    }
    
    if (linhaExistente > 0) {
      // Atualizar quantidade existente
      const quantidadeAtual = parseInt(valores[linhaExistente - 1][1]) || 0;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${EVENTO_TO_SHEET[evento]}!B${linhaExistente}`,
        valueInputOption: 'RAW',
        resource: {
          values: [[quantidadeAtual + 1]]
        }
      });
    } else {
      // Adicionar nova linha
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${EVENTO_TO_SHEET[evento]}!A:B`,
        valueInputOption: 'RAW',
        resource: {
          values: [[dataAtual, 1]]
        }
      });
    }
    
    return { success: true, message: `Evento ${evento} registrado com sucesso` };
  } catch (error) {
    console.error('Erro ao registrar evento:', error);
    return { success: false, error: error.message };
  }
}

// Função para registrar purchase com oferta
async function registrarPurchase(oferta) {
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const dataAtual = getDataAtual();
    
    // Adicionar nova linha na aba Purchase
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Purchase!A:C',
      valueInputOption: 'RAW',
      resource: {
        values: [[dataAtual, 1, oferta]]
      }
    });
    
    return { success: true, message: `Purchase registrado com sucesso para oferta: ${oferta}` };
  } catch (error) {
    console.error('Erro ao registrar purchase:', error);
    return { success: false, error: error.message };
  }
}

// Endpoint para registrar evento simples
app.post('/registrar-evento', async (req, res) => {
  try {
    const { evento } = req.body;
    
    if (!evento) {
      return res.status(400).json({ 
        success: false, 
        error: 'Campo "evento" é obrigatório' 
      });
    }
    
    if (!EVENTO_TO_SHEET[evento.toLowerCase()]) {
      return res.status(400).json({ 
        success: false, 
        error: `Evento "${evento}" não é válido. Eventos válidos: ${Object.keys(EVENTO_TO_SHEET).join(', ')}` 
      });
    }
    
    const resultado = await registrarEvento(evento.toLowerCase());
    
    if (resultado.success) {
      res.json(resultado);
    } else {
      res.status(500).json(resultado);
    }
  } catch (error) {
    console.error('Erro no endpoint /registrar-evento:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

// Endpoint para registrar purchase
app.post('/registrar-purchase', async (req, res) => {
  try {
    const { oferta } = req.body;
    
    if (!oferta) {
      return res.status(400).json({ 
        success: false, 
        error: 'Campo "oferta" é obrigatório' 
      });
    }
    
    const resultado = await registrarPurchase(oferta);
    
    if (resultado.success) {
      res.json(resultado);
    } else {
      res.status(500).json(resultado);
    }
  } catch (error) {
    console.error('Erro no endpoint /registrar-purchase:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

// Endpoint de status
app.get('/status', (req, res) => {
  res.json({ 
    status: 'online', 
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /registrar-evento',
      'POST /registrar-purchase',
      'GET /status'
    ]
  });
});

// Endpoint raiz
app.get('/', (req, res) => {
  res.json({
    message: 'Google Sheets Tracker - Sistema de Rastreamento de Eventos',
    version: '1.0.0',
    endpoints: {
      'POST /registrar-evento': 'Registra eventos do funil (welcome, cta_click, botstart, pixgerado)',
      'POST /registrar-purchase': 'Registra compras com oferta específica',
      'GET /status': 'Status do sistema',
      'GET /': 'Esta mensagem de ajuda'
    },
    eventos_suportados: Object.keys(EVENTO_TO_SHEET)
  });
});

// Tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Erro interno do servidor' 
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Google Sheets Tracker rodando na porta ${PORT}`);
  console.log(`📊 Planilha: ${SPREADSHEET_ID}`);
  console.log(`🔗 Endpoints disponíveis:`);
  console.log(`   POST http://localhost:${PORT}/registrar-evento`);
  console.log(`   POST http://localhost:${PORT}/registrar-purchase`);
  console.log(`   GET  http://localhost:${PORT}/status`);
});

module.exports = app;