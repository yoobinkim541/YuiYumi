// Desktop app entry (desktop.html). The overlay window loads it plain; the settings,
// dashboard and agent panel windows load it with #settings / #dashboard / #agent.

const view = location.hash.slice(1)
if (view === 'settings' || view === 'dashboard') void import('./panel').then(m => m.mountPanel(view))
else if (view === 'agent') void import('./panel').then(m => m.mountAgentPanel())
else void import('./overlay').then(m => m.mountOverlay())
