const readline = require('readline');
const fs = require('fs');
const { getConfig } = require('./loadConfig');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question, defaultValue) {
  return new Promise(resolve => {
    rl.question(`${question} (${defaultValue}): `, answer => {
      resolve(answer.trim() === '' ? defaultValue : answer.trim());
    });
  });
}

function generateEnvContent(cfg) {
  return `# Configurações do Gateway de Pagamento
GATEWAY=${cfg.gateway}
ENVIRONMENT=${cfg.environment}
GENERATE_QR_CODE_ON_MOBILE=${cfg.generateQRCodeOnMobile}

# Configurações do SyncPay
SYNCPAY_CLIENT_ID=${cfg.syncpay.clientId}
SYNCPAY_CLIENT_SECRET=${cfg.syncpay.clientSecret}

# Configurações do PushinPay
PUSHINPAY_TOKEN=${cfg.pushinpay.token}

# Configurações do Webhook
WEBHOOK_BASE_URL=${cfg.webhook.baseUrl}
WEBHOOK_SECRET=${cfg.webhook.secret}

# Informações do Modelo
MODEL_NAME=${cfg.model.name}
MODEL_HANDLE=${cfg.model.handle}
MODEL_BIO=${cfg.model.bio}

# Configurações dos Planos - Mensal
PLAN_MONTHLY_BUTTON_ID=${cfg.plans.monthly.buttonId}
PLAN_MONTHLY_LABEL=${cfg.plans.monthly.label}
PLAN_MONTHLY_PRICE_LABEL=${cfg.plans.monthly.priceLabel}
PLAN_MONTHLY_PRICE=${cfg.plans.monthly.price}
PLAN_MONTHLY_DESCRIPTION=${cfg.plans.monthly.description}

# Configurações dos Planos - Trimestral
PLAN_QUARTERLY_BUTTON_ID=${cfg.plans.quarterly.buttonId}
PLAN_QUARTERLY_LABEL=${cfg.plans.quarterly.label}
PLAN_QUARTERLY_PRICE_LABEL=${cfg.plans.quarterly.priceLabel}
PLAN_QUARTERLY_PRICE=${cfg.plans.quarterly.price}
PLAN_QUARTERLY_DESCRIPTION=${cfg.plans.quarterly.description}

# Configurações dos Planos - Semestral
PLAN_SEMESTRIAL_BUTTON_ID=${cfg.plans.semestrial.buttonId}
PLAN_SEMESTRIAL_LABEL=${cfg.plans.semestrial.label}
PLAN_SEMESTRIAL_PRICE_LABEL=${cfg.plans.semestrial.priceLabel}
PLAN_SEMESTRIAL_PRICE=${cfg.plans.semestrial.price}
PLAN_SEMESTRIAL_DESCRIPTION=${cfg.plans.semestrial.description}

# URL de Redirecionamento
REDIRECT_URL=${cfg.redirectUrl}
`;
}

async function main() {
  const cfg = getConfig();

  cfg.gateway = await ask('Gateway (syncpay/pushinpay)', cfg.gateway);
  cfg.environment = await ask('Environment (production/sandbox)', cfg.environment);
  const defaultMobileQR = cfg.generateQRCodeOnMobile ? 'true' : 'false';
  cfg.generateQRCodeOnMobile = (await ask('Generate QR Code on mobile? (true/false)', defaultMobileQR)).toLowerCase() === 'true';
  cfg.syncpay.clientId = await ask('SyncPay Client ID', cfg.syncpay.clientId);
  cfg.syncpay.clientSecret = await ask('SyncPay Client Secret', cfg.syncpay.clientSecret);
  cfg.pushinpay.token = await ask('PushinPay Token', cfg.pushinpay.token);

  cfg.webhook = cfg.webhook || { baseUrl: 'https://seu-dominio.com', secret: 'sua-chave-secreta-aqui' };
  cfg.webhook.baseUrl = await ask('Webhook base URL', cfg.webhook.baseUrl);
  cfg.webhook.secret = await ask('Webhook secret', cfg.webhook.secret);

  cfg.redirectUrl = await ask('Redirect URL', cfg.redirectUrl || '/compra-aprovada');

  cfg.model.name = await ask('Model name', cfg.model.name);
  cfg.model.handle = await ask('Model @', cfg.model.handle);
  cfg.model.bio = await ask('Model bio', cfg.model.bio);

  for (const key of Object.keys(cfg.plans)) {
    const plan = cfg.plans[key];
    plan.label = await ask(`Plan ${key} label`, plan.label);
    plan.priceLabel = await ask(`Plan ${key} price label`, plan.priceLabel);
    plan.price = parseFloat(await ask(`Plan ${key} amount`, plan.price));
  }

  // Gerar arquivo .env
  const envContent = generateEnvContent(cfg);
  fs.writeFileSync('.env', envContent);
  
  console.log('✅ Configuração salva no arquivo .env');
  console.log('⚠️ Lembre-se de adicionar .env ao .gitignore para proteger suas credenciais');
  rl.close();
}

main();
