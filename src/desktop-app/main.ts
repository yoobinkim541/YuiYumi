// Desktop app entry (desktop.html). The overlay window loads it plain; the settings and
// dashboard panel windows load it with #settings / #dashboard.

const view = location.hash.slice(1)
if (view === 'settings' || view === 'dashboard') void import('./panel').then(m => m.mountPanel(view))
else void import('./overlay').then(m => m.mountOverlay())
