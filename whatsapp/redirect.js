// Função de geolocalização baseada na lógica do index.html
async function detectCity() {
    const statusTextEl = document.getElementById('status-text');
    if (!statusTextEl) return;
    
    const tries = [
        {url: "https://ipinfo.io/json", parse: d => d.city},
        {url: "https://ipapi.co/json/", parse: d => !d.error ? d.city : null},
        {url: "https://geolocation-db.com/json/", parse: d => d.city && "Not found" !== d.city ? d.city : null}
    ];
    
    for (const t of tries) {
        try {
            const r = await fetch(t.url, {headers: {Accept: "application/json"}});
            if (!r.ok) continue;
            const j = await r.json();
            const c = t.parse(j);
            if (c) {
                statusTextEl.textContent = `ONLINE AGORA · ${c}`;
                return;
            }
        } catch (e) {
            // Continua para próxima tentativa
        }
    }
    
    // Se não conseguir detectar a cidade, mantém apenas "ONLINE AGORA"
    statusTextEl.textContent = "ONLINE AGORA";
}

// Aguarda o carregamento completo da página
document.addEventListener('DOMContentLoaded', function() {
    // Chama a função de geolocalização imediatamente
    detectCity();
    
    // Aguarda 2 segundos para mostrar a animação de carregamento
    setTimeout(function() {
        // Obtém o link do WhatsApp que foi injetado pelo servidor
        const zapLink = window.zapLink;
        
        if (zapLink) {
            // Redireciona para o WhatsApp
            window.location.href = zapLink;
        } else {
            // Fallback caso não tenha o link
            console.error('Link do WhatsApp não encontrado');
            document.querySelector('.loading-text').textContent = 'Erro: Link não encontrado';
        }
    }, 2000);
});
