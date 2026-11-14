const j = (u, o) => fetch(u, o).then(r => r.json());
let REV = null, INFL = 0;
window.apiBusy = () => INFL > 0;      // revision of the settings this window last adopted: the tray app merges (instead of overwriting) when somebody else changed things since
const ADOPT = ['exams', 'tasks', 'v', 'va', 'areas', 'projects', 'clients', 'entries', 'kw', 'target', 'idle', 'shortSec', 'pauseMin', 'offtaskMin', 'privacy', 'icsUrl', 'breakMin'];
window.adoptCfg = c => { if (!c || !window.C) return; ADOPT.forEach(k => { if (k in c) C[k] = c[k]; }); C.auto = c.auto; REV = c._rev || REV; };   // pomo / timer / game stay local: they run live in this window
window.api = {
  range: (a, b) => j(`/api/range?a=${a}&b=${b}`),
  cfg: () => j('/api/cfg'),
  setcfg: c => { const b = {...c}; delete b.auto; delete b._rev; b._base = REV; INFL++; return j('/api/cfg', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(b)}).then(r => { INFL--; if (r && r.rev && !r.merged) REV = r.rev; return r; }, e => { INFL--; throw e; }); },
  purge: b => j('/api/purge', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Rize': '1'}, body: JSON.stringify(b)}),
  autostart: () => j('/api/autostart'),
  autoopen: () => j('/api/autoopen'),
  setAutoOpen: on => j('/api/autoopen', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Rize': '1'}, body: JSON.stringify({on})}),
  setAuto: on => j('/api/autostart', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Rize': '1'}, body: JSON.stringify({on})}),
  onTick: f => { const p = () => j('/api/now').then(f).catch(() => {}); p(); setInterval(p, 2000); }
};
