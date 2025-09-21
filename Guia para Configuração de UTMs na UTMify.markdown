# Guia para Configuração de UTMs na UTMify

## Introdução
Os parâmetros UTM (Urchin Tracking Module) são amplamente utilizados para rastrear o desempenho de campanhas de marketing digital, permitindo identificar a origem, o meio, a campanha e o conteúdo específico que geram tráfego para um site. No entanto, na plataforma UTMify, você está enfrentando problemas com UTMs sendo classificadas como "inválidas", mesmo que as campanhas estejam aprovadas e gerando comissões. Este guia aborda as possíveis causas do problema, fornece recomendações para corrigir os parâmetros UTM e sugere práticas para garantir que suas futuras campanhas sejam reconhecidas como válidas pela UTMify.

## Análise dos Campos Problemáticos
Com base nos dados fornecidos, os seguintes parâmetros UTM estão sendo usados nas campanhas problemáticas:
- **utm_source**: ["instagram", "ig"]
- **utm_campaign**: ["story-instagram", "bio-instagram", "cbo"]
- **utm_medium**: ["story", "bio", "novo conjunto de anúncios de vendas"]
- **utm_content**: ["cr3", "unknown"]

### Problemas Identificados
1. **Inconsistência no utm_source**:
   - O parâmetro `utm_source` está configurado como "instagram" ou "ig", mas as campanhas estão rodando principalmente no Telegram, via "Arthur - teste". Essa discrepância entre a fonte declarada e a fonte real do tráfego é provavelmente a principal causa da classificação de "UTMs inválidas" pela UTMify. O `utm_source` deve refletir com precisão a plataforma onde o link foi compartilhado, que neste caso é o Telegram.
   
2. **Valores de utm_medium não padronizados**:
   - Os valores "story" e "bio" são específicos de funcionalidades do Instagram, não do Telegram. Em geral, o `utm_medium` deve representar uma categoria ampla, como "social", "email" ou "cpc". O uso de termos muito específicos pode não ser reconhecido pela UTMify ou causar confusão nos relatórios.
   - O valor "novo conjunto de anúncios de vendas" contém espaços, o que não é uma prática recomendada, pois algumas plataformas podem não lidar bem com espaços nos parâmetros UTM.

3. **utm_content com "unknown"**:
   - O valor "unknown" em `utm_content` pode ser problemático, pois não fornece informações úteis sobre o conteúdo específico que gerou o tráfego. Algumas plataformas, incluindo a UTMify, podem rejeitar ou classificar como inválido um parâmetro que não seja descritivo.

4. **Possíveis problemas de configuração técnica**:
   - A UTMify exige que um script específico seja instalado nas páginas de destino para capturar os parâmetros UTM corretamente. Se o script não estiver configurado adequadamente para a plataforma de vendas utilizada, isso pode resultar em problemas de rastreamento.

## Valores Recomendados para os Parâmetros UTM
Para corrigir os problemas e garantir que as UTMs sejam reconhecidas como válidas pela UTMify, recomendamos os seguintes valores para os parâmetros:

| Parâmetro       | Valor Recomendado         | Descrição                                                                 |
|-----------------|---------------------------|---------------------------------------------------------------------------|
| **utm_source**  | telegram                  | Reflete a origem real do tráfego, que é o Telegram.                       |
| **utm_medium**  | social ou messaging       | Representa a categoria do canal, adequada para o Telegram.                |
| **utm_campaign**| arthur-teste-campaign     | Nome descritivo da campanha, usando hífens em vez de espaços.             |
| **utm_content** | cr3 ou outro identificador| Identificador específico do conteúdo ou anúncio, evitando "unknown".      |

### Exemplo de URL com UTMs Corretas
Um exemplo de URL com parâmetros UTM corrigidos seria:
```
https://seusite.com/?utm_source=telegram&utm_medium=social&utm_campaign=arthur-teste-campaign&utm_content=cr3
```

## Padrão de Nomenclatura para UTMs
Embora não tenhamos encontrado documentação específica da UTMify sobre padrões de nomenclatura, as melhores práticas gerais para UTMs, que provavelmente se aplicam à UTMify, incluem:
- **Usar letras minúsculas**: Algumas plataformas, incluindo o Google Analytics 4, são sensíveis a maiúsculas/minúsculas. Por exemplo, "Telegram" e "telegram" podem ser tratados como valores diferentes. Para evitar problemas, use sempre letras minúsculas.
- **Evitar espaços**: Substitua espaços por hífens (-) ou sublinhados (_). Por exemplo, em vez de "novo conjunto de anúncios de vendas", use "novo-conjunto-de-anuncios-de-vendas".
- **Ser descritivo e consistente**: Use nomes claros que qualquer pessoa analisando os dados possa entender. Evite termos ambíguos como "unknown" ou códigos genéricos como "1A", "1B", etc.
- **Manter consistência**: Crie uma convenção de nomenclatura e a siga em todas as campanhas para facilitar a análise e evitar erros.

## Configuração do Script de UTMs
A UTMify exige que um script de rastreamento seja instalado nas páginas de destino para capturar os parâmetros UTM corretamente. O script varia dependendo da plataforma de vendas utilizada. Abaixo estão alguns exemplos de scripts fornecidos pela UTMify para diferentes plataformas:

| Plataforma  | Script de UTMs                                                                 |
|-------------|--------------------------------------------------------------------------------|
| Hotmart     | `<script src="https://cdn.utmify.com.br/scripts/utms/latest.js" data-utmify-prevent-subids async defer></script>` |
| Cartpanda   | `<script src="https://cdn.utmify.com.br/scripts/utms/latest.js" data-utmify-prevent-xcod-sck data-utmify-prevent-subids data-utmify-ignore-iframe data-utmify-is-cartpanda async defer></script>` |
| Doppus      | `<script src="https://cdn.utmify.com.br/scripts/utms/latest.js" data-utmify-prevent-xcod-sck data-utmify-prevent-subids data-utmify-plus-signal async defer></script>` |
| Outras      | `<script src="https://cdn.utmify.com.br/scripts/utms/latest.js" data-utmify-prevent-xcod-sck data-utmify-prevent-subids async defer></script>` |

Para obter o script correto para sua plataforma, consulte a [Central de Ajuda da UTMify](https://utmify.help.center/article/1013-como-instalar-o-script-de-utms-em-minhas-paginas). Certifique-se de que o script está inserido no código HTML das suas páginas de destino, geralmente no `<head>` ou no `<body>`.

## Possíveis Causas Adicionais de "UTMs Inválidas"
Além dos problemas com os valores dos parâmetros, outras causas potenciais incluem:
- **Integração com fontes de tráfego não suportadas**: A UTMify pode não ter integração direta com o Telegram, o que pode exigir configurações específicas para fontes de tráfego personalizadas. Verifique se você configurou corretamente os parâmetros UTM para fontes não integradas.
- **Redirecionadores ou cloakers**: Se você está usando redirecionadores (como TinyURL) ou cloakers, certifique-se de que eles estão configurados para repassar os parâmetros UTM corretamente. A UTMify recomenda ferramentas como Cloackup ou The White Rabbit para cloakers compatíveis.
- **Configuração no Typebot**: Se você usa Typebot, verifique se a opção "Hide query params on bot start" está desabilitada e se o script de UTMs está incluído no campo "Custom Head Code" do Metadata.

## Recomendações para Evitar Problemas Futuros
1. **Crie uma convenção de nomenclatura**: Mantenha um documento ou planilha com os valores de UTM aprovados para garantir consistência. Por exemplo:
   - utm_source: telegram, facebook, google
   - utm_medium: social, messaging, cpc, email
   - utm_campaign: [nome-da-campanha]-[data]
   - utm_content: [identificador-do-anúncio]
2. **Teste as UTMs**: Antes de lançar uma campanha, teste as URLs com UTMs em um ambiente controlado para verificar se estão sendo rastreadas corretamente na UTMify.
3. **Consulte a documentação da UTMify**: Acesse a [Central de Ajuda da UTMify](https://utmify.help.center/) para obter instruções detalhadas sobre a configuração de UTMs e scripts para sua plataforma específica.
4. **Entre em contato com o suporte**: Se o problema persistir, entre em contato com o suporte da UTMify para obter orientações específicas sobre a validação de UTMs no Telegram.

## Conclusão
O problema de "UTMs inválidas" na UTMify é provavelmente causado pela configuração incorreta do parâmetro `utm_source`, que não reflete a origem real do tráfego (Telegram), e possivelmente por valores não padronizados em `utm_medium` e `utm_content`. Ao corrigir os parâmetros para refletir a fonte correta, usar categorias amplas para o meio, evitar espaços e instalar o script de UTMs apropriado, você deve conseguir rastrear suas campanhas com precisão. Seguindo as melhores práticas de nomenclatura e verificando as configurações técnicas, suas futuras campanhas devem ser reconhecidas como válidas pela UTMify.

**Referências**:
- [Central de Ajuda | Utmify](https://utmify.help.center/)
- [Possíveis soluções para o problema de trackeamento de vendas | Utmify](https://utmify.help.center/article/1024-voce-esta-tendo-vendas-nao-trackeadas)
- [Como instalar o script de UTMs em minhas páginas | Utmify](https://utmify.help.center/article/1013-como-instalar-o-script-de-utms-em-minhas-paginas)