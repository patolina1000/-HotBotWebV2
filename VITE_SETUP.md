# Configuração do Vite + ThumbmarkJS

Este projeto foi configurado para usar o Vite como bundler e carregar o ThumbmarkJS via NPM em vez do CDN.

## Estrutura

```
├── src/
│   ├── redirect.js    # Script do redirect (com import do ThumbmarkJS)
│   └── obrigado.js    # Script da página de obrigado (com import do ThumbmarkJS)
├── dist/              # Arquivos de build de produção
├── whatsapp/
│   ├── redirect.html  # HTML atualizado para usar o bundle
│   └── obrigado.html  # HTML atualizado para usar o bundle
├── redirect.html      # Arquivo de teste para desenvolvimento
├── obrigado.html      # Arquivo de teste para desenvolvimento
└── vite.config.js     # Configuração do Vite
```

## Scripts Disponíveis

### Desenvolvimento
```bash
npm run vite:dev
```
Inicia o servidor de desenvolvimento do Vite em `http://localhost:5173`

### Build de Produção
```bash
npm run vite:build
```
Gera os arquivos otimizados na pasta `dist/`

### Preview da Produção
```bash
npm run vite:preview
```
Serve os arquivos de produção para teste

## Mudanças Implementadas

### 1. Estrutura de Arquivos
- ✅ Criado diretório `src/` na raiz
- ✅ Movido `redirect.js` e `obrigado.js` para `src/`

### 2. Código JavaScript
- ✅ Substituído o sistema de import complexo pelo import direto:
  ```js
  import { Thumbmark } from '@thumbmarkjs/thumbmarkjs';
  
  async function getThumbmarkId() {
    const thumbmark = new Thumbmark();
    const { id } = await thumbmark.get();
    console.log('✅ Thumbmark ID via bundle:', id);
    return id;
  }
  ```
- ✅ Removido o sistema de retry/CDN fallback (não necessário com bundle)

### 3. Configuração Vite
- ✅ Criado `vite.config.js` com configuração para múltiplos entry points

### 4. Arquivos HTML
- ✅ Atualizado `whatsapp/redirect.html` e `whatsapp/obrigado.html`
- ✅ Removido script CDN do ThumbmarkJS
- ✅ Adicionado `type="module"` nos scripts
- ✅ Apontado para `/src/redirect.js` e `/src/obrigado.js`

### 5. Dependências
- ✅ Instalado `vite` como devDependency
- ✅ Instalado `@thumbmarkjs/thumbmarkjs` como dependency

## Como Testar

### Durante Desenvolvimento
1. Execute: `npm run vite:dev`
2. Acesse: `http://localhost:5173/redirect.html`
3. Acesse: `http://localhost:5173/obrigado.html`

### Para Produção
1. Execute: `npm run vite:build`
2. Os arquivos gerados estarão em `dist/`
3. Atualize os HTMLs para usar os arquivos de `dist/` em produção

## Arquivos de Teste

Foram criados `redirect.html` e `obrigado.html` na raiz para facilitar o teste durante desenvolvimento. Estes arquivos:
- Usam gradientes em vez de imagens de background
- Carregam os scripts diretamente de `/src/`
- Mostram mensagens indicando que estão usando o bundle

## Vantagens da Nova Configuração

1. **Bundling**: O ThumbmarkJS é incluído no bundle, garantindo carregamento
2. **Otimização**: O Vite otimiza automaticamente o código para produção
3. **Hot Reload**: Durante desenvolvimento, mudanças são refletidas instantaneamente
4. **Tree Shaking**: Apenas o código necessário é incluído no bundle final
5. **Compatibilidade**: Funciona com ES6 modules nativamente

## Próximos Passos

1. Teste as páginas em desenvolvimento: `http://localhost:5173/redirect.html`
2. Execute o build de produção: `npm run vite:build`
3. Atualize o servidor para servir os arquivos de `dist/` quando necessário
