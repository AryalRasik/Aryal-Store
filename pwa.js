(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  function register() {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function (error) {
      if (window.console && console.warn) console.warn('Service worker registration failed:', error);
    });
  }

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
})();
