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

  // Web demo link comes from <meta name="app-url">; until it is set the button stays inert.
  const appUrl = ($('meta[name="app-url"]')?.content || '').trim();
  const appLink = $('#appLink');
  const appNote = $('#appNote');
  if (appLink) {
    if (appUrl) {
      document.querySelectorAll('.js-app').forEach((a) => { a.href = appUrl; });
      if (appNote) appNote.hidden = true;
    } else {
      appLink.setAttribute('aria-disabled', 'true');
      appLink.addEventListener('click', (e) => e.preventDefault());
    }
  }
})();
