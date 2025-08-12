(function() {
    'use strict';

    // Gerar session_id único para esta sessão
    function generateSessionId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `session_${timestamp}_${random}`;
    }

    // Obter ou criar session_id
    function getSessionId() {
        let sessionId = sessionStorage.getItem('funnel_session_id');
        if (!sessionId) {
            sessionId = generateSessionId();
            sessionStorage.setItem('funnel_session_id', sessionId);
        }
        return sessionId;
    }

    // Função para enviar eventos com session_id
    async function trackFunnelEvent(eventName, additionalData = {}) {
        try {
            const sessionId = getSessionId();
            const eventData = {
                event_name: eventName,
                session_id: sessionId,
                event_id: `event_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                ...additionalData
            };

            await fetch('/api/funnel/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData),
                keepalive: true
            });

            console.log(`[Funil] Evento rastreado: ${eventName} - Session: ${sessionId}`);
        } catch (e) {
            // Falha silenciosamente para não impactar a experiência do usuário.
            console.error('Falha ao rastrear evento de funil:', e);
        }
    }

    // Expõe as funções de rastreamento globalmente
    window.trackFunnelEvent = trackFunnelEvent;
    window.funnelTracker = { 
        track: trackFunnelEvent,
        getSessionId: getSessionId
    };

    // Rastreia o primeiro evento: a visita à página (welcome)
    trackFunnelEvent('welcome');

})();
