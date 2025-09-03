// Bloqueia F12 e clique direito, exibindo um aviso temporário
(function() {
    function showProtectionMessage() {
        let popup = document.getElementById('protect-popup');
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'protect-popup';
            popup.textContent = 'Conteúdo protegido.';
            Object.assign(popup.style, {
                position: 'fixed',
                top: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.8)',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: '4px',
                fontSize: '14px',
                zIndex: 9999,
                display: 'none'
            });
            document.body.appendChild(popup);
        }
        popup.style.display = 'block';
        clearTimeout(popup.hideTimeout);
        popup.hideTimeout = setTimeout(() => {
            popup.style.display = 'none';
        }, 3000);
    }

    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        showProtectionMessage();
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'F12') {
            e.preventDefault();
            showProtectionMessage();
        }
    });
})();
