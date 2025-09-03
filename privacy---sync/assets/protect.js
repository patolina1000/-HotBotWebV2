// Proteções básicas para as páginas
(function() {
    'use strict';
    
    // Desabilitar menu de contexto
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
    });
    
    // Desabilitar teclas de atalho
    document.addEventListener('keydown', function(e) {
        // F12
        if (e.keyCode === 123) {
            e.preventDefault();
            return false;
        }
        
        // Ctrl+Shift+I
        if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
            e.preventDefault();
            return false;
        }
        
        // Ctrl+Shift+J
        if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
            e.preventDefault();
            return false;
        }
        
        // Ctrl+U
        if (e.ctrlKey && e.keyCode === 85) {
            e.preventDefault();
            return false;
        }
        
        // Ctrl+Shift+C
        if (e.ctrlKey && e.shiftKey && e.keyCode === 67) {
            e.preventDefault();
            return false;
        }
    });
    
    // Proteção contra inspeção
    let devtools = {
        open: false,
        orientation: null
    };
    
    setInterval(function() {
        const threshold = 160;
        const widthThreshold = window.outerWidth - window.innerWidth > threshold;
        const heightThreshold = window.outerHeight - window.innerHeight > threshold;
        
        if (widthThreshold || heightThreshold) {
            if (!devtools.open) {
                devtools.open = true;
                document.body.innerHTML = 'Acesso negado';
            }
        } else {
            devtools.open = false;
        }
    }, 500);
    
    // Proteção contra console
    if (typeof console !== 'undefined') {
        console.log = function() {};
        console.warn = function() {};
        console.error = function() {};
        console.info = function() {};
    }
    
})();
