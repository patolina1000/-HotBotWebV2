const express = require('express');
const router = express.Router();

/**
 * Rotas de redirecionamento para links externos
 * Facilita o gerenciamento de links promocionais e campanhas
 */

// Rota: /seusonho
// Redireciona para: https://entry.ohvips.xyz/?utm_source=instagram&utm_medium=bio&utm_campaign=bio-instagram
router.get('/seusonho', (req, res) => {
  const params = new URLSearchParams(req.query);
  if (!params.has('utm_source')) {
    params.set('utm_source', 'instagram');
    params.set('utm_medium', 'bio');
    params.set('utm_campaign', 'bio-instagram');
  }
  const targetUrl = `https://entry.ohvips.xyz/?${params.toString()}`;

  console.log(`🔗 Redirecionamento /seusonho -> ${targetUrl} | IP: ${req.ip} | User-Agent: ${req.get('User-Agent')}`);

  res.redirect(301, targetUrl);
});

// Exemplo de como adicionar novos redirecionamentos no futuro:
// router.get('/outro-link', (req, res) => {
//   res.redirect(301, 'https://exemplo.com');
// });
module.exports = router;
