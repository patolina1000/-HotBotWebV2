const { google } = require('googleapis');
const path = require('path');

// ==============================================================================
//  PASSO 1: DIAGNÓSTICO DO CARREGAMENTO DO ARQUIVO DE CREDENCIAIS
// ==============================================================================
let credentials;
try {
    console.log("[DEBUG] Tentando carregar o arquivo 'credentials.json'...");
    const credentialsPath = path.join(__dirname, '..', 'credentials.json');
    credentials = require(credentialsPath);
    console.log("[DEBUG] Arquivo 'credentials.json' encontrado e carregado via require().");
} catch (error) {
    console.error("[ERRO CRÍTICO] Falha ao carregar 'credentials.json'. O arquivo não existe ou o caminho está errado.", error.message);
    // Se falhar aqui, o resto não vai funcionar.
    // Lança o erro para parar a execução e deixar o log claro.
    throw new Error("Parando a execução: 'credentials.json' não encontrado.");
}


async function appendDataToSheet(range, values) {
    try {
        console.log(`\n--- INICIANDO PROCESSO DE APPEND PARA A ABA: "${range}" ---`);

        // ==============================================================================
        //  PASSO 2: DIAGNÓSTICO DO CONTEÚDO DAS CREDENCIAIS
        // ==============================================================================
        console.log("[DEBUG] Verificando o conteúdo das credenciais carregadas...");
        if (!credentials || !credentials.client_email || !credentials.private_key) {
            console.error("[ERRO CRÍTICO] O arquivo 'credentials.json' foi carregado, mas está malformado ou não contém 'client_email' e 'private_key'.");
            console.error("[DEBUG] Chaves encontradas no objeto de credenciais:", Object.keys(credentials));
            throw new Error("Parando a execução: Credenciais inválidas.");
        }
        console.log("[DEBUG] Credenciais parecem válidas. Email:", credentials.client_email);
        console.log("[DEBUG] Chave Privada encontrada. (Tamanho:", credentials.private_key.length, "caracteres)");


        // ==============================================================================
        //  PASSO 3: DIAGNÓSTICO DA CRIAÇÃO DO CLIENTE DE AUTENTICAÇÃO (JWT)
        // ==============================================================================
        console.log("[DEBUG] Criando o cliente de autenticação JWT...");
        const auth = new google.auth.JWT(
            credentials.client_email,
            null,
            credentials.private_key,
            [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive'
            ]
        );
        console.log("[DEBUG] Cliente de autenticação JWT criado com sucesso.");


        // ==============================================================================
        //  PASSO 4: DIAGNÓSTICO DA AUTORIZAÇÃO (OBTENÇÃO DO TOKEN DE ACESSO)
        // ==============================================================================
        console.log("[DEBUG] Solicitando token de acesso ao Google...");
        try {
            await auth.authorize();
            console.log("[DEBUG] Token de acesso obtido com SUCESSO do Google.");
        } catch (authError) {
            console.error("[ERRO CRÍTICO NA AUTORIZAÇÃO] O Google rejeitou a tentativa de obter um token de acesso.");
            console.error("[DEBUG] Detalhes do erro de autorização:", authError);
            throw new Error("Parando a execução: Falha ao autorizar com o Google.");
        }


        // ==============================================================================
        //  PASSO 5: DIAGNÓSTICO DA CHAMADA À API DO GOOGLE SHEETS
        // ==============================================================================
        console.log("[DEBUG] Criando o serviço do Google Sheets (v4)...");
        const sheets = google.sheets({ version: 'v4', auth });
        
        const requestBody = {
            spreadsheetId: process.env.SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: values,
            },
        };
        
        console.log(`[DEBUG] Executando a chamada 'append' para a planilha: ${process.env.SPREADSHEET_ID}`);
        
        const response = await sheets.spreadsheets.values.append(requestBody);
        
        console.log(`[SUCESSO] Dados adicionados à aba "${range}". Células atualizadas: ${response.data.updates.updatedCells}`);
        console.log("--- FIM DO PROCESSO DE APPEND ---");
        return response.data;

    } catch (error) {
        console.error(`\n--- !!! FALHA GERAL NO PROCESSO PARA A ABA: "${range}" !!! ---`);
        console.error("[ERRO] Descrição do erro:", error.message);

        // O erro da API do Google geralmente tem mais detalhes dentro de `error.response`
        if (error.response) {
            console.error("[ERRO] Status da Resposta da API:", error.response.status);
            console.error("[ERRO] Detalhes da Resposta da API:", JSON.stringify(error.response.data, null, 2));
        }
        console.error("[ERRO] Stack Trace Completo:", error.stack);
        console.log("--- FIM DO PROCESSO DE APPEND COM FALHA ---");
        
        // Relança o erro para que a parte do código que chamou a função saiba que falhou.
        throw error;
    }
}

// Exporta a função para ser usada em outros lugares
module.exports = {
    appendDataToSheet,
};
