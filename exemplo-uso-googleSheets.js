const { logEvento } = require('./services/googleSheets');

// Exemplo de uso em diferentes partes do funil de vendas

// 1. Usuário entra no site
async function logarEntradaSite() {
  try {
    await logEvento('welcome');
    console.log('Entrada no site logada');
  } catch (error) {
    console.error('Erro ao logar entrada:', error);
  }
}

// 2. Usuário clica em CTA
async function logarCliqueCTA() {
  try {
    await logEvento('cta_clicker');
    console.log('Clique CTA logado');
  } catch (error) {
    console.error('Erro ao logar clique CTA:', error);
  }
}

// 3. Usuário inicia bot Telegram
async function logarInicioBot() {
  try {
    await logEvento('bot1');
    console.log('Início do bot logado');
  } catch (error) {
    console.error('Erro ao logar início do bot:', error);
  }
}

// 4. PIX gerado
async function logarPIXGerado() {
  try {
    await logEvento('pix');
    console.log('PIX gerado logado');
  } catch (error) {
    console.error('Erro ao logar PIX:', error);
  }
}

// 5. Compra realizada (com tipo de oferta)
async function logarCompra(tipoOferta) {
  try {
    await logEvento('purchase', tipoOferta);
    console.log(`Compra logada: ${tipoOferta}`);
  } catch (error) {
    console.error('Erro ao logar compra:', error);
  }
}

// Exemplo de uso em um fluxo completo
async function exemploFluxoCompleto() {
  console.log('=== Iniciando fluxo de exemplo ===');
  
  // Simula entrada no site
  await logarEntradaSite();
  
  // Simula clique em CTA
  await logarCliqueCTA();
  
  // Simula início do bot
  await logarInicioBot();
  
  // Simula geração de PIX
  await logarPIXGerado();
  
  // Simula compra da oferta principal
  await logarCompra('principal');
  
  // Simula downsell DS1
  await logarCompra('DS1');
  
  // Simula mensagem periódica MP1
  await logarCompra('MP1');
  
  console.log('=== Fluxo completo finalizado ===');
}

// Executar exemplo se chamado diretamente
if (require.main === module) {
  exemploFluxoCompleto().catch(console.error);
}

module.exports = {
  logarEntradaSite,
  logarCliqueCTA,
  logarInicioBot,
  logarPIXGerado,
  logarCompra,
  exemploFluxoCompleto
};