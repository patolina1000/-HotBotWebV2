# Fluxo de Redirecionamento do Checkout - Sistema Avançado

## Diagrama do Fluxo Completo com Downsells Específicos

```mermaid
graph TD
    A[Usuário acessa /checkout] --> B[Página de Checkout Principal]
    B --> C{Usuário seleciona plano?}
    C -->|Sim| D[Gera PIX via API]
    C -->|Não| B
    
    D --> E[Exibe Modal PIX com QR Code]
    E --> F{Usuário paga PIX?}
    F -->|Sim| G[Verifica Status do Pagamento]
    F -->|Não| E
    
    G --> H{Pagamento confirmado?}
    H -->|Sim| I[Dispara evento Purchase]
    H -->|Não| J[Recarrega página para novo PIX]
    J --> E
    
    I --> K[Redireciona para UP1]
    K --> L[Upsell 1 - Oferta Especial]
    L --> M{Usuário compra UP1?}
    M -->|Sim| N[Dispara Purchase UP1]
    M -->|Não| O[Redireciona para UP2]
    N --> O
    
    O --> P[Upsell 2 - Segunda Oferta]
    P --> Q{Usuário compra UP2?}
    Q -->|Sim| R[Dispara Purchase UP2]
    Q -->|Não| S[Redireciona para UP3]
    R --> S
    
    S --> T[Upsell 3 - Terceira Oferta]
    T --> U{Usuário compra UP3?}
    U -->|Sim| V[Dispara Purchase UP3]
    U -->|Não| W[Redireciona para Obrigado]
    V --> W
    
    W --> X[Página de Obrigado]
    X --> Y[Fim do Funil]
    
    %% Fluxo de Downsells Específicos por Upsell
    %% Downsells do UP1 (3 opções)
    L --> Z1[Back1_1 - Downsell UP1 - Opção 1]
    L --> Z2[Back1_2 - Downsell UP1 - Opção 2]
    L --> Z3[Back1_3 - Downsell UP1 - Opção 3]
    
    %% Downsells do UP2 (3 opções)
    P --> AA1[Back2_1 - Downsell UP2 - Opção 1]
    P --> AA2[Back2_2 - Downsell UP2 - Opção 2]
    P --> AA3[Back2_3 - Downsell UP2 - Opção 3]
    
    %% Downsells do UP3 (3 opções)
    T --> BB1[Back3_1 - Downsell UP3 - Opção 1]
    T --> BB2[Back3_2 - Downsell UP3 - Opção 2]
    T --> BB3[Back3_3 - Downsell UP3 - Opção 3]
    
    %% Redirecionamentos dos Downsells do UP1
    Z1 --> CC1{Usuário compra Back1_1?}
    CC1 -->|Sim| DD1[Dispara Purchase Back1_1]
    CC1 -->|Não| EE1[Redireciona para UP2]
    DD1 --> EE1
    
    Z2 --> CC2{Usuário compra Back1_2?}
    CC2 -->|Sim| DD2[Dispara Purchase Back1_2]
    CC2 -->|Não| EE2[Redireciona para UP2]
    DD2 --> EE2
    
    Z3 --> CC3{Usuário compra Back1_3?}
    CC3 -->|Sim| DD3[Dispara Purchase Back1_3]
    CC3 -->|Não| EE3[Redireciona para UP2]
    DD3 --> EE3
    
    %% Redirecionamentos dos Downsells do UP2
    AA1 --> FF1{Usuário compra Back2_1?}
    FF1 -->|Sim| GG1[Dispara Purchase Back2_1]
    FF1 -->|Não| HH1[Redireciona para UP3]
    GG1 --> HH1
    
    AA2 --> FF2{Usuário compra Back2_2?}
    FF2 -->|Sim| GG2[Dispara Purchase Back2_2]
    FF2 -->|Não| HH2[Redireciona para UP3]
    GG2 --> HH2
    
    AA3 --> FF3{Usuário compra Back2_3?}
    FF3 -->|Sim| GG3[Dispara Purchase Back2_3]
    FF3 -->|Não| HH3[Redireciona para UP3]
    GG3 --> HH3
    
    %% Redirecionamentos dos Downsells do UP3
    BB1 --> II1{Usuário compra Back3_1?}
    II1 -->|Sim| JJ1[Dispara Purchase Back3_1]
    II1 -->|Não| KK1[Redireciona para Obrigado]
    JJ1 --> KK1
    
    BB2 --> II2{Usuário compra Back3_2?}
    II2 -->|Sim| JJ2[Dispara Purchase Back3_2]
    II2 -->|Não| KK2[Redireciona para Obrigado]
    JJ2 --> KK2
    
    BB3 --> II3{Usuário compra Back3_3?}
    II3 -->|Sim| JJ3[Dispara Purchase Back3_3]
    II3 -->|Não| KK3[Redireciona para Obrigado]
    JJ3 --> KK3
    
    %% Contadores de tempo para cada downsell
    Z1 --> LL1[Contador 10min Back1_1]
    Z2 --> LL2[Contador 10min Back1_2]
    Z3 --> LL3[Contador 10min Back1_3]
    
    AA1 --> MM1[Contador 10min Back2_1]
    AA2 --> MM2[Contador 10min Back2_2]
    AA3 --> MM3[Contador 10min Back2_3]
    
    BB1 --> NN1[Contador 10min Back3_1]
    BB2 --> NN2[Contador 10min Back3_2]
    BB3 --> NN3[Contador 10min Back3_3]
    
    %% Redirecionamentos por tempo esgotado
    LL1 -->|Tempo esgotado| EE1
    LL2 -->|Tempo esgotado| EE2
    LL3 -->|Tempo esgotado| EE3
    
    MM1 -->|Tempo esgotado| HH1
    MM2 -->|Tempo esgotado| HH2
    MM3 -->|Tempo esgotado| HH3
    
    NN1 -->|Tempo esgotado| KK1
    NN2 -->|Tempo esgotado| KK2
    NN3 -->|Tempo esgotado| KK3
    
    %% Estilos
    classDef checkoutPage fill:#e1f5fe
    classDef upsellPage fill:#fff3e0
    classDef downsellPage fill:#fce4ec
    classDef obrigadoPage fill:#e8f5e8
    classDef decision fill:#fff9c4
    classDef api fill:#f3e5f5
    
    class A,B checkoutPage
    class L,P,T upsellPage
    class Z1,Z2,Z3,AA1,AA2,AA3,BB1,BB2,BB3 downsellPage
    class X,Y obrigadoPage
    class C,F,H,M,Q,U,CC1,CC2,CC3,FF1,FF2,FF3,II1,II2,II3 decision
    class D,G,I,N,R,V,DD1,DD2,DD3,GG1,GG2,GG3,JJ1,JJ2,JJ3 api
```

## Detalhes do Fluxo - Sistema Avançado

### 1. **Página Principal de Checkout** (`/checkout`)
- Usuário seleciona plano de pagamento
- Gera PIX via API `/api/gerar-pix-checkout`
- Exibe modal com QR Code e chave PIX
- Verifica status do pagamento periodicamente

### 2. **Funil de Upsells** (Ofertas Adicionais)
- **UP1** (`/checkout/funil_completo/up1.html?g=1`)
  - Primeira oferta especial
  - **Se comprar**: Redireciona para UP2
  - **Se não comprar**: 3 opções de downsell específicas

- **UP2** (`/checkout/funil_completo/up2.html`)
  - Segunda oferta especial
  - **Se comprar**: Redireciona para UP3
  - **Se não comprar**: 3 opções de downsell específicas

- **UP3** (`/checkout/funil_completo/up3.html`)
  - Terceira oferta especial
  - **Se comprar**: Redireciona para Obrigado
  - **Se não comprar**: 3 opções de downsell específicas

### 3. **Sistema de Downsells Específicos** (9 páginas de recuperação)

#### **Downsells do UP1** (3 opções)
- **Back1_1** (`/checkout/funil_completo/back1_1.html`)
  - Primeira opção de downsell para quem não comprou UP1
  - Contador de 10 minutos
  - Redireciona para UP2 após tempo ou compra

- **Back1_2** (`/checkout/funil_completo/back1_2.html`)
  - Segunda opção de downsell para quem não comprou UP1
  - Contador de 10 minutos
  - Redireciona para UP2 após tempo ou compra

- **Back1_3** (`/checkout/funil_completo/back1_3.html`)
  - Terceira opção de downsell para quem não comprou UP1
  - Contador de 10 minutos
  - Redireciona para UP2 após tempo ou compra

#### **Downsells do UP2** (3 opções)
- **Back2_1** (`/checkout/funil_completo/back2_1.html`)
  - Primeira opção de downsell para quem não comprou UP2
  - Contador de 10 minutos
  - Redireciona para UP3 após tempo ou compra

- **Back2_2** (`/checkout/funil_completo/back2_2.html`)
  - Segunda opção de downsell para quem não comprou UP2
  - Contador de 10 minutos
  - Redireciona para UP3 após tempo ou compra

- **Back2_3** (`/checkout/funil_completo/back2_3.html`)
  - Terceira opção de downsell para quem não comprou UP2
  - Contador de 10 minutos
  - Redireciona para UP3 após tempo ou compra

#### **Downsells do UP3** (3 opções)
- **Back3_1** (`/checkout/funil_completo/back3_1.html`)
  - Primeira opção de downsell para quem não comprou UP3
  - Contador de 10 minutos
  - Redireciona para Obrigado após tempo ou compra

- **Back3_2** (`/checkout/funil_completo/back3_2.html`)
  - Segunda opção de downsell para quem não comprou UP3
  - Contador de 10 minutos
  - Redireciona para Obrigado após tempo ou compra

- **Back3_3** (`/checkout/funil_completo/back3_3.html`)
  - Terceira opção de downsell para quem não comprou UP3
  - Contador de 10 minutos
  - Redireciona para Obrigado após tempo ou compra

### 4. **Página Final** (`/checkout/obrigado`)
- Confirmação de pagamento
- Fim do funil de vendas

## Características Importantes - Sistema Avançado

- **Sistema de Downsells Específicos**: 9 páginas de recuperação (3 para cada upsell)
- **Tracking Completo**: Cada compra dispara eventos de Purchase para Facebook/Kwai
- **Preservação de Parâmetros**: UTMs e dados de tracking são mantidos em todo o fluxo
- **Contadores de Tempo**: Cada downsell tem contador de 10 minutos
- **Fallbacks**: Sistema robusto com redirecionamentos mesmo em caso de erro
- **Responsivo**: Todas as páginas são otimizadas para mobile
- **Personalização**: Ofertas específicas baseadas no comportamento do usuário

## Estrutura de Arquivos Necessária

```
checkout/funil_completo/
├── up1.html (Upsell 1)
├── up2.html (Upsell 2)
├── up3.html (Upsell 3)
├── back1_1.html (Downsell UP1 - Opção 1)
├── back1_2.html (Downsell UP1 - Opção 2)
├── back1_3.html (Downsell UP1 - Opção 3)
├── back2_1.html (Downsell UP2 - Opção 1)
├── back2_2.html (Downsell UP2 - Opção 2)
├── back2_3.html (Downsell UP2 - Opção 3)
├── back3_1.html (Downsell UP3 - Opção 1)
├── back3_2.html (Downsell UP3 - Opção 2)
├── back3_3.html (Downsell UP3 - Opção 3)
└── assets/
    ├── up1.mp4, up2.mp4, up3.mp4
    ├── back1_1.mp4, back1_2.mp4, back1_3.mp4
    ├── back2_1.mp4, back2_2.mp4, back2_3.mp4
    └── back3_1.mp4, back3_2.mp4, back3_3.mp4
```

## Tecnologias Utilizadas

- **Frontend**: HTML5, CSS3, JavaScript, Bootstrap
- **Tracking**: Facebook Pixel, Kwai Events API, UTMify
- **Pagamentos**: PIX via API externa
- **Estilização**: Gradientes, animações CSS, SweetAlert2
- **Lógica**: Sistema de roteamento inteligente baseado em comportamento
