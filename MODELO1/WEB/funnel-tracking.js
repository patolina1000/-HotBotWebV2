(function() {
    'use strict';

    // 1. Gera ou recupera um ID de sessão único para este visitante
    let sessionId = sessionStorage.getItem('funnel_session_id');
    if (!sessionId) {
        sessionId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
        sessionStorage.setItem('funnel_session_id', sessionId);
    }

    // 2. Função para enviar um evento para nosso endpoint de coleta
    async function trackFunnelEvent(eventName, eventData = {}) {
        const payload = {
            session_id: sessionId,
            event_name: eventName,
            ...eventData
        };

        try {
            // Usamos fetch com keepalive para garantir que a requisição seja enviada
            // mesmo se o usuário navegar para outra página rapidamente.
            await fetch('/api/funnel/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true
            });
        } catch (e) {
            // Falha silenciosamente para não impactar a experiência do usuário.
            console.error('Falha ao rastrear evento de funil:', e);
        }
    }

    // 3. Expõe a função de rastreamento e a ID da sessão globalmente
    window.funnelTracker = {
        track: trackFunnelEvent,
        getSessionId: () => sessionId
    };

    // 4. Rastreia o primeiro evento: a visita à página (welcome)
    // Este evento é disparado assim que o script é carregado.
    window.funnelTracker.track('welcome');

})();
