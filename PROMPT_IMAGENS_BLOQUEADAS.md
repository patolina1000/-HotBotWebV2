# 🎨 PROMPT: Sistema de Imagens Bloqueadas com SVG + Base64

## 📋 CONTEXTO
Este prompt ensina como implementar um sistema de galeria de mídias bloqueadas usando SVG codificado em Base64, similar ao usado em plataformas de conteúdo premium.

## 🎯 OBJETIVO
Criar uma interface visual onde usuários veem previews de conteúdo bloqueado com ícones de cadeado, incentivando pagamento para desbloqueio.

## 🛠️ IMPLEMENTAÇÃO TÉCNICA

### 1. ESTRUTURA HTML BASE
```html
<!-- Container principal da galeria -->
<div class="board-block">
    <!-- Filtros de navegação -->
    <ul class="nav nav-tabs tab-sub">
        <li class="nav-item sub pt-1">
            <a class="text-sub-tab nav-link sub-item active">
                <span class="text-base font-normal">Todos</span>
            </a>
        </li>
        <li class="nav-item sub pt-1">
            <a class="text-sub-tab nav-link sub-item">
                <span class="text-base font-normal">Fotos</span>
            </a>
        </li>
        <li class="nav-item sub pt-1">
            <a class="text-sub-tab nav-link sub-item">
                <span class="text-base font-normal">Vídeos</span>
            </a>
        </li>
        <li class="nav-item sub pt-1">
            <a class="text-sub-tab nav-link sub-item">
                <span class="text-base font-normal">Pagos</span>
            </a>
        </li>
    </ul>
    
    <!-- Grid de conteúdo bloqueado -->
    <div class="board-block-content">
        <!-- Item individual bloqueado -->
        <div class="videopostagem grid" style="flex: 1 1 calc(33.33% - 3px); max-width: 260px; aspect-ratio: 1 / 1;">
            <!-- Ícone de cadeado (SVG direto) -->
            <svg class="svg-inline--fa fa-lock-keyhole cursor-pointer" 
                 aria-hidden="true" focusable="false" 
                 data-prefix="fal" data-icon="lock-keyhole" 
                 role="img" xmlns="http://www.w3.org/2000/svg" 
                 viewBox="0 0 448 512">
                <path fill="currentColor" d="M224 32c53 0 96 43 96 96v64H128V128c0-53 43-96 96-96zM96 128v64H80c-44.2 0-80 35.8-80 80V432c0 44.2 35.8 80 80 80H368c44.2 0 80-35.8 80-80V272c0-44.2-35.8-80-80-80H352V128C352 57.3 294.7 0 224 0S96 57.3 96 128zM80 224H368c26.5 0 48 21.5 48 48V432c0 26.5-21.5 48-48 48H80c-26.5 0-48-21.5-48-48V272c0-26.5 21.5-48 48-48zm160 88c0-8.8-7.2-16-16-16s-16 7.2-16 16v80c0 8.8 7.2 16 16 16s16-7.2 16-16V312z"></path>
            </svg>
            
            <!-- Imagem de fundo (SVG em Base64) -->
            <img src="data:image/svg+xml;base64,[SEU_BASE64_AQUI]" 
                 alt="bg-locked" 
                 class="w-100" 
                 style="background-color: var(--color-bg-light);">
        </div>
    </div>
</div>
```

### 2. CSS NECESSÁRIO
```css
/* Grid responsivo */
.board-block-content {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    background-color: rgb(255, 255, 255);
    padding: 10px;
}

.videopostagem.grid {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.2s ease;
}

.videopostagem.grid:hover {
    transform: scale(1.02);
}

/* Ícone de cadeado centralizado */
.svg-inline--fa.fa-lock-keyhole {
    position: absolute;
    z-index: 2;
    color: #2563eb; /* Azul escuro */
    font-size: 2rem;
}

/* Filtros de navegação */
.tab-sub {
    display: flex;
    gap: 0;
    margin-bottom: 0;
    border-bottom: 1px solid #e5e7eb;
}

.text-sub-tab {
    padding: 12px 16px;
    color: #6b7280;
    text-decoration: none;
    border: none;
    background: none;
    transition: all 0.2s ease;
}

.text-sub-tab.active,
.text-sub-tab:hover {
    color: #f97316; /* Laranja */
    background-color: #fed7aa; /* Laranja claro */
    border-bottom: 2px solid #f97316;
}
```

### 3. JAVASCRIPT PARA INTERATIVIDADE
```javascript
$(document).ready(function() {
    // Sistema de abas principais
    var tabButtons = {
        postagens: $('.nav-link:contains("Postagens")'),
        midias: $('.nav-link:contains("Mídias")')
    };
    
    var tabContents = {
        postagens: $('#conteudo-postagens'),
        midias: $('#conteudo-midias')
    };

    function trocarAba(abaAtiva) {
        // Esconde todos os painéis
        $.each(tabContents, function(key, value){
            value.hide();
        });
        
        // Remove classe 'active' de todos os botões
        $.each(tabButtons, function(key, value){
            value.removeClass('active');
        });

        // Mostra painel correto e adiciona classe 'active'
        if (tabButtons[abaAtiva] && tabContents[abaAtiva]) {
            tabContents[abaAtiva].show();
            tabButtons[abaAtiva].addClass('active');
        }
    }

    // Event listeners para abas
    tabButtons.postagens.on('click', function() {
        trocarAba('postagens');
    });

    tabButtons.midias.on('click', function() {
        trocarAba('midias');
    });

    // Sistema de filtros de mídia
    $('.tab-sub .sub-item').on('click', function() {
        // Remove active de todos
        $('.tab-sub .sub-item').removeClass('active');
        // Adiciona active no clicado
        $(this).addClass('active');
        
        // Aqui você pode implementar a lógica de filtro
        var filtro = $(this).text().trim();
        console.log('Filtro selecionado:', filtro);
    });

    // Inicia com aba de mídias ativa
    trocarAba('midias');
});
```

## 🎨 CRIAÇÃO DAS IMAGENS SVG

### 1. MÉTODO: SVG + Base64
```html
<!-- SVG original -->
<svg width="299" height="341" viewBox="0 0 299 341" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M112.122 9.23201C189.582 -11.5233 269.163 34.4228 289.918 111.883C310.674 189.343 264.728 268.923 187.268 289.679C164.432 295.798 141.441 296.127 119.778 291.535L116.193 290.775L115.123 294.279L103.326 332.915C101.126 339.692 99.1312 343.694 96.177 346.575C93.2277 349.451 88.8966 351.619 81.1237 353.702C67.2352 357.423 52.913 349.153 49.1916 335.265L9.47172 187.028C-11.2835 109.568 34.6625 29.9873 112.122 9.23201Z" 
          stroke="url(#gradient1)" 
          stroke-width="8"/>
    <defs>
        <linearGradient id="gradient1" x1="39.7113" y1="341.023" x2="224.96" y2="20.967" gradientUnits="userSpaceOnUse">
            <stop stop-color="white"/>
            <stop offset="0.4" stop-color="#FCFBF9"/>
            <stop offset="0.9" stop-color="#F6F1EA"/>
            <stop offset="1" stop-color="#F4EEE5"/>
        </linearGradient>
    </defs>
</svg>
```

### 2. CONVERSÃO PARA BASE64
```javascript
// Método 1: Online
// Use: https://base64-image.de ou similar

// Método 2: Via JavaScript
function svgToBase64(svgString) {
    return 'data:image/svg+xml;base64,' + btoa(svgString);
}

// Método 3: Via Node.js
const fs = require('fs');
const svgContent = fs.readFileSync('imagem.svg', 'utf8');
const base64 = Buffer.from(svgContent).toString('base64');
const dataUri = `data:image/svg+xml;base64,${base64}`;
```

## 🎯 PERSONALIZAÇÕES POSSÍVEIS

### 1. CORES E GRADIENTES
```css
/* Gradiente personalizado */
<linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#ff6b6b"/>
    <stop offset="50%" stop-color="#4ecdc4"/>
    <stop offset="100%" stop-color="#45b7d1"/>
</linearGradient>
```

### 2. FORMAS DIFERENTES
```html
<!-- Círculo -->
<circle cx="150" cy="150" r="120" stroke="url(#gradient1)" stroke-width="8" fill="none"/>

<!-- Retângulo arredondado -->
<rect x="20" y="20" width="260" height="300" rx="20" ry="20" stroke="url(#gradient1)" stroke-width="8" fill="none"/>

<!-- Forma orgânica personalizada -->
<path d="M50,50 Q150,20 250,50 T450,50 L450,300 Q150,280 50,300 Z" stroke="url(#gradient1)" stroke-width="8" fill="none"/>
```

### 3. ÍCONES DIFERENTES
```html
<!-- Ícone de estrela -->
<svg class="svg-inline--fa fa-star" viewBox="0 0 512 512">
    <path fill="currentColor" d="M256 0l55.1 170.3L512 170.3l-142.4 103.4L427.1 512 256 384.6 84.9 512l57.5-238.3L0 170.3l200.9 0L256 0z"/>
</svg>

<!-- Ícone de coração -->
<svg class="svg-inline--fa fa-heart" viewBox="0 0 512 512">
    <path fill="currentColor" d="M256 448l-31.09-31.09C119.4 312.6 64 258.6 64 192c0-70.7 57.3-128 128-128 32.8 0 62.7 12.3 85.3 32.6C298.3 76.3 328.2 64 361 64c70.7 0 128 57.3 128 128 0 66.6-55.4 120.6-160.9 224.9L256 448z"/>
</svg>
```

## 📱 RESPONSIVIDADE

### 1. GRID ADAPTATIVO
```css
/* Mobile */
@media (max-width: 768px) {
    .videopostagem.grid {
        flex: 1 1 calc(50% - 3px);
        max-width: calc(50% - 3px);
    }
}

/* Tablet */
@media (min-width: 769px) and (max-width: 1024px) {
    .videopostagem.grid {
        flex: 1 1 calc(33.33% - 3px);
        max-width: calc(33.33% - 3px);
    }
}

/* Desktop */
@media (min-width: 1025px) {
    .videopostagem.grid {
        flex: 1 1 calc(25% - 3px);
        max-width: calc(25% - 3px);
    }
}
```

## 🚀 VANTAGENS DESTA IMPLEMENTAÇÃO

1. **Performance**: SVG + Base64 carrega instantaneamente
2. **Responsivo**: Escala perfeitamente em qualquer tela
3. **Customizável**: Fácil de modificar cores, formas e efeitos
4. **Sem dependências**: Não precisa de bibliotecas externas
5. **SEO friendly**: Ícones e textos são indexáveis
6. **Acessível**: Suporte a screen readers

## 📝 CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Criar estrutura HTML base
- [ ] Implementar CSS responsivo
- [ ] Adicionar JavaScript para interatividade
- [ ] Criar SVGs personalizados
- [ ] Converter SVGs para Base64
- [ ] Testar em diferentes dispositivos
- [ ] Otimizar performance
- [ ] Adicionar animações (opcional)

## 🎨 FERRAMENTAS RECOMENDADAS

1. **Criação de SVG**: Figma, Adobe Illustrator, Inkscape
2. **Conversão Base64**: base64-image.de, base64.guru
3. **Teste de responsividade**: Chrome DevTools
4. **Otimização**: SVGOMG (otimizador de SVG)

---

**💡 DICA**: Comece com um design simples e vá refinando. O importante é ter a funcionalidade básica funcionando primeiro!
