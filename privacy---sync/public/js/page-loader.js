/**
 * Simple helper to hide the page loader once the page is ready.
 * Prevents the interface from remaining stuck on the loading screen.
 */
(function() {
  function hideLoader() {
    const loader = document.querySelector('.pageloader, .pageLoader');
    if (loader) {
      loader.classList.remove('is-active');
      loader.style.display = 'none';
    }
  }

  document.addEventListener('DOMContentLoaded', hideLoader);
  window.addEventListener('load', hideLoader);
  setTimeout(hideLoader, 5000);
})();
