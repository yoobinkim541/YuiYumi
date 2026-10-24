// Behaviour for the landing pages exported from the Claude Design canvas.
(() => {
  const $ = (s) => document.querySelector(s);

  // Background stays sharp over the hero, then veils over as the page scrolls.
  const veil = $('#veil');
  if (veil) {
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight || 900;
      const fade = Math.min(Math.max((window.scrollY - vh * 0.3) / (vh * 0.8), 0), 1);
      veil.style.opacity = String(fade * 0.82);
      const blur = fade > 0 ? `blur(${(fade * 10).toFixed(1)}px)` : 'none';
      veil.style.backdropFilter = blur;
      veil.style.webkitBackdropFilter = blur;
    };
    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    update();
  }

  // Night theme toggle.
  const night = $('#nightToggle');
  const overlay = $('#nightOverlay');
  if (night && overlay) {
    night.addEventListener('click', () => {
      const on = overlay.hidden;
      overlay.hidden = !on;
      night.setAttribute('aria-pressed', String(on));
      night.setAttribute('aria-label', on ? '낮 테마로 전환' : '밤 테마로 전환');
    });
  }

  // Menu on tablet and phone widths.
  const menu = $('.menu-btn');
  const header = $('header');
  if (menu && header) {
    menu.addEventListener('click', () => {
      const open = header.classList.toggle('nav-open');
      menu.setAttribute('aria-expanded', String(open));
    });
    header.querySelectorAll('nav a').forEach((a) => a.addEventListener('click', () => {
      header.classList.remove('nav-open');
      menu.setAttribute('aria-expanded', 'false');
    }));
  }

  // Demo buttons lead to the web app (<meta name="app-url">). The page veils over, then leaves.
  // A button with data-character opens the app with that character (?character=yui|yumi).
  const appUrl = ($('meta[name="app-url"]')?.content || '').trim();
  const appLink = $('#appLink');
  const appNote = $('#appNote');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (appUrl) {
    if (appNote) appNote.hidden = true;
    document.querySelectorAll('.js-app').forEach((a) => {
      const url = new URL(appUrl);
      if (a.dataset.character) url.searchParams.set('character', a.dataset.character);
      const target = url.href;
      a.href = target;
      a.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        if (reduceMotion) { window.location.href = target; return; }
        document.body.classList.add('leaving');
        setTimeout(() => { window.location.href = target; }, 1100);
      });
    });
    // Coming back with the browser's back button restores the page from cache; clear the veil.
    window.addEventListener('pageshow', () => document.body.classList.remove('leaving'));
  } else if (appLink) {
    appLink.setAttribute('aria-disabled', 'true');
    appLink.addEventListener('click', (e) => e.preventDefault());
  }

  // Install as an app (PWA). Chrome, Edge and Android offer a prompt; iPhone and iPad use Share → Add to Home Screen.
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  const installBox = $('#installBox');
  const installBtn = $('#installBtn');
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (installBox && !standalone) {
    let deferred = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      installBox.hidden = false;
      installBtn.hidden = false;
    });
    installBtn.addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      installBox.hidden = true;
    });
    window.addEventListener('appinstalled', () => { installBox.hidden = true; });
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      installBox.hidden = false;
      $('#iosInstallHint').hidden = false;
    }
  }

  // In-page links scroll there smoothly and keep the address bar clean (no #section).
  const headerOffset = () => ($('header')?.offsetHeight || 0) + 12;
  const scrollToId = (id, smooth) => {
    const el = document.getElementById(id);
    if (!el) return false;
    const start = window.scrollY;
    const y = id === 'top' ? 0 : el.getBoundingClientRect().top + window.scrollY - headerOffset();
    const top = Math.max(y, 0);
    window.scrollTo({ top, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
    // Some embedded or throttled views never animate a smooth scroll; land there anyway.
    if (smooth) setTimeout(() => { if (Math.abs(window.scrollY - top) > 4 && window.scrollY === start) window.scrollTo(0, top); }, 700);
    return true;
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (scrollToId(decodeURIComponent(a.getAttribute('href').slice(1)), true)) e.preventDefault();
  });
  // Arriving with a hash (e.g. /#download from a character page): drop it, then scroll there.
  const dropHash = () => {
    if (!location.hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    return id;
  };
  const arrived = dropHash();
  if (arrived) window.addEventListener('load', () => scrollToId(arrived, false), { once: true });
  // A typed or pasted #section on this page: same treatment.
  window.addEventListener('hashchange', () => { const id = dropHash(); if (id) scrollToId(id, true); });
})();
