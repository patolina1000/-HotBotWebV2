const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const db = new sqlite3.Database('tokens.db'); // caminho correto para o mesmo banco do bot

app.use(cors());
app.use(express.static('public')); // Para servir arquivos estáticos

// Endpoint de verificação de token
app.get('/verify-token', (req, res) => {
  const token = req.query.token;

  if (!token) {
    return res.status(400).json({ 
      valid: false, 
      erro: 'Token não informado.' 
    });
  }

  // Verifica se o token_uuid existe e está válido
  db.get('SELECT * FROM tokens WHERE token_uuid = ? AND status = "valido"', [token], (err, row) => {
    if (err) {
      console.error('Erro no banco de dados:', err);
      return res.status(500).json({ 
        valid: false, 
        erro: 'Erro no banco de dados.' 
      });
    }

    if (!row) {
      return res.status(404).json({ 
        valid: false, 
        erro: 'Token inválido ou expirado.' 
      });
    }

    // Token válido - retorna informações
    return res.status(200).json({
      valid: true,
      telegram_id: row.telegram_id,
      valor: row.valor,
      utm_source: row.utm_source,
      utm_campaign: row.utm_campaign,
      utm_medium: row.utm_medium,
      criado_em: row.criado_em
    });
  });
});

// Endpoint para marcar token como usado (opcional)
app.post('/use-token', (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ erro: 'Token não informado.' });
  }

  db.run('UPDATE tokens SET status = "usado" WHERE token_uuid = ?', [token], function(err) {
    if (err) {
      return res.status(500).json({ erro: 'Erro ao marcar token como usado.' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ erro: 'Token não encontrado.' });
    }

    return res.json({ sucesso: true });
  });
});

// Endpoint para servir arquivos HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/obrigado.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'obrigado.html'));
});

app.get('/expirado.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'expirado.html'));
});

/*
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Servidor de verificação rodando em http://localhost:${PORT}`);
});
*/