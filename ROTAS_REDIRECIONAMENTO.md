# 🔗 Rotas de Redirecionamento

## Implementação

Foi adicionado um sistema de rotas de redirecionamento ao projeto seguindo as melhores práticas de organização.

### Estrutura de Arquivos

```
/routes/
  └── links.js    # Arquivo com as rotas de redirecionamento
```

### Arquivos Modificados

- `server.js` - Adicionado import e uso das rotas de links
- `routes/links.js` - Novo arquivo com as rotas de redirecionamento

## Rotas Disponíveis

### `/seusonho`
- **URL de acesso**: `https://seudominio.com/seusonho`
- **Destino**: `https://entry.ohvips.xyz/?utm_source=instagram&utm_medium=bio&utm_campaign=bio-instagram`
- **Tipo**: Redirecionamento 301 (permanente)
- **Logs**: Registra IP e User-Agent para analytics

## Como Adicionar Novas Rotas

Para adicionar um novo redirecionamento, edite o arquivo `routes/links.js`:

```javascript
// Adicione uma nova rota seguindo este padrão:
router.get('/novo-link', (req, res) => {
  const targetUrl = 'https://destino.com';
  console.log(`🔗 Redirecionamento /novo-link -> ${targetUrl} | IP: ${req.ip}`);
  res.redirect(301, targetUrl);
});
```

## Características

- ✅ Redirecionamento 301 (SEO-friendly)
- ✅ Logs para analytics e monitoramento
- ✅ Estrutura escalável para novos links
- ✅ Código limpo e documentado
- ✅ Integração com a estrutura existente do projeto