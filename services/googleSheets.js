const { google } = require('googleapis');
const path = require('path');
const credentials = require(path.join(__dirname, '..', 'credentials.json'));

/**
 * Função assíncrona para adicionar dados a uma planilha do Google Sheets
 * @param {string} spreadsheetId - O ID da planilha
 * @param {string} range - O nome da aba e o intervalo (ex: 'Welcome!A:B')
 * @param {Array<Array>} values - Os dados a serem inseridos (ex: [['2025-01-01', 100]])
 * @returns {Promise<Object>} Objeto de resposta da API do Google Sheets
 * @throws {Error} Erro detalhado em caso de falha
 */
async function appendDataToSheet(spreadsheetId, range, values) {
    try {
        console.log('--- DIAGNÓSTICO GOOGLE SHEETS ---');
        console.log('EMAIL DA CONTA DE SERVIÇO:', credentials.client_email);
        console.log('--- FIM DO DIAGNÓSTICO ---');

        // Cria um cliente JWT com as credenciais da conta de serviço
        const auth = new google.auth.JWT(
            credentials.client_email,
            null,
            credentials.private_key, // Usado diretamente, sem formatação
            [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive'
            ]
        );

        // Instancia a API do Google Sheets
        const sheets = google.sheets({ version: 'v4', auth });

        // Executa a operação de append
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId,
            range: range,
            valueInputOption: 'RAW',
            requestBody: {
                values: values
            }
        });

        return response.data;
    } catch (error) {
        // Lança uma exceção detalhada com informações do erro
        throw new Error(`Erro ao adicionar dados à planilha: ${error.message}`);
    }
}

module.exports = {
    appendDataToSheet
};
