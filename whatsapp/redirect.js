// Aguarda o carregamento completo da página
document.addEventListener('DOMContentLoaded', function() {
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
