(function() {
    'use strict';

    // Função simplificada para enviar apenas o nome do evento
    async function trackFunnelEvent(eventName) {
        try {
            await fetch('/api/funnel/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event_name: eventName }),
                keepalive: true
            });
        } catch (e) {
            // Falha silenciosamente para não impactar a experiência do usuário.
            console.error('Falha ao rastrear evento de funil:', e);
        }
    }

    // Expõe a função de rastreamento globalmente
    window.trackFunnelEvent = trackFunnelEvent;
    window.funnelTracker = { track: trackFunnelEvent };

    // Rastreia o primeiro evento: a visita à página (welcome)
    trackFunnelEvent('welcome');

})();
