/* ==========================================================================
   ARYAL STORE — THEME MOTION LAYER
   Progressive enhancement only. If this file fails to load, the site still
   renders and functions exactly as before (reveal elements default visible
   because the reveal classes are added by this script only).
   ========================================================================== */
(function () {
  'use strict';

  var motionOK = !window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* -------- Header: shadow / background once the page is scrolled -------- */
  function initHeader() {
    var header = document.querySelector('header');
    if (!header) return;
    var ticking = false;
    function update() {
      if (window.scrollY > 8) header.classList.add('lux-scrolled');
      else header.classList.remove('lux-scrolled');
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* -------- Keep the sticky category bar pinned right under the header --------
     The header is fixed (and shifted by the announcement strip), so its measured
     bottom edge is the exact sticky offset the category bar needs. We measure it
     at runtime instead of hard-coding a height, so it stays correct at any
     breakpoint or after webfonts change the header's height. */
  function initNavOffset() {
    var header = document.querySelector('header');
    var nav = document.querySelector('.category-nav');
    if (!header || !nav) return;
    var root = document.documentElement;

    function sync() {
      if (nav.offsetParent === null) {          // hidden (e.g. mobile) -> use CSS fallback
        root.style.removeProperty('--lux-nav-top');
        return;
      }
      var bottom = header.getBoundingClientRect().bottom;
      root.style.setProperty('--lux-nav-top', Math.round(bottom) + 'px');
    }

    sync();
    window.addEventListener('resize', sync, { passive: true });
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(sync).catch(function () {});
    }
  }

  /* -------- Scroll reveal -------- */
  var REVEAL_SELECTOR = [
    '.section-title',
    '.product-card',
    '.trust-card',
    '.cat-preview-card',
    '.hero-promo-card',
    '.promo-card'
  ].join(',');

  var observer = null;

  function reveal(el) {
    if (!el || el.classList.contains('lux-in') || el.__luxObserved) return;
    el.__luxObserved = true;
    el.classList.add('lux-reveal');
    if (observer) observer.observe(el);
  }

  function scan(root) {
    if (!motionOK || !observer) return;
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches(REVEAL_SELECTOR)) reveal(root);
    var nodes = root.querySelectorAll ? root.querySelectorAll(REVEAL_SELECTOR) : [];
    for (var i = 0; i < nodes.length; i++) reveal(nodes[i]);
  }

  function initReveal() {
    if (!motionOK || !('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('lux-in');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    scan(document.body);

    if ('MutationObserver' in window) {
      var mo = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          m.addedNodes.forEach(function (n) { scan(n); });
        });
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  function init() {
    initHeader();
    initNavOffset();
    initReveal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
