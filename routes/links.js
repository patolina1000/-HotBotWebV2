const express = require('express');
const path = require('path');
const router = express.Router();

/**
 * Rotas de redirecionamento para links externos
 * Facilita o gerenciamento de links promocionais e campanhas
 */

// 🔥 NOVA IMPLEMENTAÇÃO: /seusonho
// Agora serve página direta com todas as funcionalidades do boas vindas
// Executa: PageView, ViewContent, geração de payload, registro no Excel, redirecionamento direto ao bot1
router.get('/seusonho', (req, res) => {
  const params = new URLSearchParams(req.query);
  
  // Garantir UTMs padrão se não fornecidos
  if (!params.has('utm_source')) {
    params.set('utm_source', 'instagram');
    params.set('utm_medium', 'bio');
    params.set('utm_campaign', 'bio-instagram');
  }

  console.log(`🌟 Acesso direto /seusonho | UTMs: ${params.toString()} | IP: ${req.ip} | User-Agent: ${req.get('User-Agent')}`);

  // Servir a página HTML direta ao invés de redirecionar
  const htmlPath = path.join(__dirname, '..', 'MODELO1', 'WEB', 'seusonho-direct.html');
  res.sendFile(htmlPath);
});

// Exemplo de como adicionar novos redirecionamentos no futuro:
// router.get('/outro-link', (req, res) => {
//   res.redirect(301, 'https://exemplo.com');
// });
module.exports = router;
