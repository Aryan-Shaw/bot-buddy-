// Applies light/dark before first paint. Choice is stored on the server too (Buddy windows use a different browser profile).
(() => {
  const r = document.documentElement, pref = localStorage.getItem('theme') || 'auto';
  const eff = p => p === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : p;
  const apply = p => { r.dataset.theme = eff(p); r.dataset.pref = p; };
  apply(pref);
  window.setTheme = async p => { localStorage.setItem('theme', p); apply(p); try { await fetch('/api/theme', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Rize': '1'}, body: JSON.stringify({theme: p})}); } catch (e) {} };
  window.cycleTheme = () => setTheme({auto: 'light', light: 'dark', dark: 'auto'}[r.dataset.pref || 'auto']);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => apply(localStorage.getItem('theme') || 'auto'));
  fetch('/api/theme').then(x => x.json()).then(j => { if (j.theme && j.theme !== (localStorage.getItem('theme') || 'auto')) { localStorage.setItem('theme', j.theme); apply(j.theme); } }).catch(() => {});
})();
