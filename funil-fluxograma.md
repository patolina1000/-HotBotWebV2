# Fluxograma do Funil de Conversão

```mermaid
flowchart TD
    %% Início do Funil
    Start([Tráfego Pago]) --> Traffic{Fonte de Tráfego}
    
    %% Divisão por fonte
    Traffic -->|Facebook Ads| FB[Facebook Ads<br/>UTM + fbp + fbc]
    Traffic -->|Kwai Ads| KW[Kwai Ads<br/>UTM + click_id]
    
    %% Convergência para Presell
    FB --> Presell[/modelo1/web/index.html<br/>PRESELL<br/>🎯 Eventos: PageView, ViewContent/]
    KW --> Presell
    
    %% Decisão do usuário
    Presell --> UserChoice{Escolha do Usuário}
    
    %% Fluxo Privacy (PIX)
    UserChoice -->|Botão Privacy| Plans[Página de Planos<br/>🎯 PageView, ViewContent]
    
    Plans --> PlanChoice{Seleção de Plano}
    
    PlanChoice -->|Plano Básico| BasicPlan[Checkout PIX<br/>🎯 AddToCart, InitiateCheckout]
    PlanChoice -->|Plano Premium| PremiumPlan[Checkout PIX<br/>🎯 AddToCart, InitiateCheckout]
    PlanChoice -->|Plano VIP| VIPPlan[Checkout PIX<br/>🎯 AddToCart, InitiateCheckout]
    
    %% Conversão Plano Básico
    BasicPlan --> BasicPurchase{Compra Básica}
    BasicPurchase -->|✅ Comprou| BasicSuccess[🎯 Purchase Event<br/>Básico Confirmado]
    BasicPurchase -->|❌ Abandonou| PixAbort1[PIX Abandonado<br/>⚠️ Evento Ausente]
    
    %% Upsell 1
    BasicSuccess --> Up1[UPSELL 1<br/>🎯 PageView, ViewContent]
    Up1 --> Up1Choice{Compra UP1?}
    Up1Choice -->|✅ Sim| Up1Success[🎯 Purchase Event<br/>UP1 Confirmado]
    Up1Choice -->|❌ Não| Down1[DOWNSELL 1<br/>🎯 PageView, ViewContent]
    
    %% Upsell 2
    Up1Success --> Up2[UPSELL 2<br/>🎯 PageView, ViewContent]
    Up2 --> Up2Choice{Compra UP2?}
    Up2Choice -->|✅ Sim| Up2Success[🎯 Purchase Event<br/>UP2 Confirmado]
    Up2Choice -->|❌ Não| Down2[DOWNSELL 2<br/>🎯 PageView, ViewContent]
    
    %% Upsell 3
    Up2Success --> Up3[UPSELL 3<br/>🎯 PageView, ViewContent]
    Up3 --> Up3Choice{Compra UP3?}
    Up3Choice -->|✅ Sim| Up3Success[🎯 Purchase Event<br/>UP3 Confirmado]
    Up3Choice -->|❌ Não| Down3[DOWNSELL 3<br/>🎯 PageView, ViewContent]
    
    %% Downsells encadeados
    Down1 --> DownChoice1{Compra Down1?}
    DownChoice1 -->|✅ Sim| DownSuccess1[🎯 Purchase Event]
    DownChoice1 -->|❌ Não| NextDown1[Próximo Downsell]
    
    Down2 --> DownChoice2{Compra Down2?}
    DownChoice2 -->|✅ Sim| DownSuccess2[🎯 Purchase Event]
    DownChoice2 -->|❌ Não| NextDown2[Próximo Downsell]
    
    Down3 --> DownChoice3{Compra Down3?}
    DownChoice3 -->|✅ Sim| DownSuccess3[🎯 Purchase Event]
    DownChoice3 -->|❌ Não| NextDown3[Próximo Downsell]
    
    %% Conversão Premium e VIP
    PremiumPlan --> PremiumPurchase{Compra Premium}
    PremiumPurchase -->|✅ Comprou| PremiumSuccess[🎯 Purchase Event<br/>Premium Confirmado]
    PremiumPurchase -->|❌ Abandonou| PixAbort2[PIX Abandonado<br/>⚠️ Evento Ausente]
    
    VIPPlan --> VIPPurchase{Compra VIP}
    VIPPurchase -->|✅ Comprou| VIPSuccess[🎯 Purchase Event<br/>VIP Confirmado]
    VIPPurchase -->|❌ Abandonou| PixAbort3[PIX Abandonado<br/>⚠️ Evento Ausente]
    
    %% Todos os sucessos convergem para grupo
    BasicSuccess --> Group1[grupo1<br/>Área de Membros]
    Up1Success --> Group1
    Up2Success --> Group1
    Up3Success --> Group1
    DownSuccess1 --> Group1
    DownSuccess2 --> Group1
    DownSuccess3 --> Group1
    NextDown1 --> Group1
    NextDown2 --> Group1
    NextDown3 --> Group1
    PremiumSuccess --> Group1
    VIPSuccess --> Group1
    
    %% Fluxo Telegram
    UserChoice -->|Botão Telegram| TelegramBot[Bot Telegram<br/>⚠️ Tracking Externo<br/>UTM + fbp + fbc + click_id]
    TelegramBot --> TelegramConversion[Conversão no Telegram<br/>⚠️ Server-Side Tracking Crítico]
    
    %% Abandono PIX
    PixAbort1 --> Retargeting[Pool de Retargeting<br/>⚠️ Audiência não mapeada]
    PixAbort2 --> Retargeting
    PixAbort3 --> Retargeting
    
    %% Estilos
    classDef tracking fill:#2ecc71,stroke:#27ae60,color:#000
    classDef warning fill:#e74c3c,stroke:#c0392b,color:#fff
    classDef conversion fill:#3498db,stroke:#2980b9,color:#fff
    classDef neutral fill:#95a5a6,stroke:#7f8c8d,color:#000
    
    class Presell,Plans,Up1,Up2,Up3,Down1,Down2,Down3 tracking
    class PixAbort1,PixAbort2,PixAbort3,Retargeting,TelegramBot warning
    class BasicSuccess,Up1Success,Up2Success,Up3Success,DownSuccess1,DownSuccess2,DownSuccess3,PremiumSuccess,VIPSuccess conversion
    class Start,Traffic,FB,KW,UserChoice,PlanChoice,BasicPlan,PremiumPlan,VIPPlan neutral
```

## Legenda:
- 🟢 **Verde**: Páginas com tracking implementado
- 🔴 **Vermelho**: Pontos críticos sem tracking adequado
- 🔵 **Azul**: Eventos de conversão
- ⚠️ **Alerta**: Possível gargalo ou evento ausente