const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para interpretar JSON
app.use(express.json());

// Endpoint local que atua como proxy
app.post('/api/auth-token', async (req, res) => {
  try {
    const response = await fetch('https://api.syncpayments.com.br/api/partner/v1/auth-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('[Auth Proxy] Erro ao obter token:', error);
    res.status(500).json({ error: 'Erro ao autenticar com a API SyncPayments' });
  }
});

// Inicia o servidor na porta 3000
app.listen(PORT, () => {
  console.log(`Servidor de proxy de autenticação rodando na porta ${PORT}`);
});
