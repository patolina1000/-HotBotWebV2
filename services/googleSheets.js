const { google } = require('googleapis');

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
        console.log('EMAIL DA CONTA DE SERVIÇO:', process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
        console.log('CHAVE PRIVADA (ANTES DO FORMATO):', process.env.GOOGLE_PRIVATE_KEY);
        console.log('--- FIM DO DIAGNÓSTICO ---');
        // Formata a chave privada, substituindo \n por quebras de linha reais
        const formattedPrivateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

        // Cria um cliente JWT com as credenciais da conta de serviço
        const auth = new google.auth.JWT(
            process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            null,
            formattedPrivateKey,
            ['https://www.googleapis.com/auth/spreadsheets']
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
