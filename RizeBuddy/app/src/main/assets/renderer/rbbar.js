(() => {
  if (window.__rzb) return; window.__rzb = 1;
  const api = () => window.pywebview && window.pywebview.api;
  const h = (tag, p, ...kids) => { const e = document.createElement(tag); if (p) for (const k in p) { if (k === 'on') for (const ev in p.on) e.addEventListener(ev, p.on[ev]); else if (k === 'text') e.textContent = p[k]; else e.setAttribute(k, p[k]); } kids.flat().forEach(c => c != null && e.append(c)); return e; };
  const CSS = `*{box-sizing:border-box;font:600 13px "Segoe UI Variable","Segoe UI",system-ui,sans-serif}
  .tab{position:fixed;top:0;left:50%;margin-left:-26px;width:52px;height:22px;padding:0;border-radius:0 0 12px 12px;background:rgba(32,24,44,.92);border:1px solid #F2784B;border-top:0;color:#FFC24B;font-size:12px;line-height:20px;text-align:center;opacity:.6;transition:.15s}
  .tab:hover,.open .tab{opacity:1;background:#F2784B;color:#fff}
  .dd{position:fixed;top:26px;left:50%;width:300px;margin-left:-150px;max-height:76vh;overflow:auto;display:none;background:rgba(32,24,44,.98);color:#fff;border:1px solid #F2784B;border-radius:14px;box-shadow:0 14px 40px #000a;padding:8px}
  .open .dd{display:block}.nav{display:flex;gap:6px;margin-bottom:6px}.nav button{flex:1}
  .it{display:block;width:100%;text-align:left;margin-bottom:4px;background:#ffffff10}.it.cur{background:#F2784B}
  .lab{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#cdbfe6;margin:4px 4px 6px}.none{color:#cdbfe6;font-weight:500;padding:6px 4px}
  button{border:0;border-radius:10px;background:#ffffff18;color:#fff;padding:7px 11px;cursor:pointer;white-space:nowrap}button:hover{background:#ffffff30}
  button.cur{background:#F2784B}.sp{flex:1}.sep{width:1px;height:22px;background:#ffffff30;margin:0 4px}.sites{display:flex;gap:6px;overflow:auto;scrollbar-width:none}.pin.p{background:#F2784B}
  .ov{position:fixed;inset:0;background:#0009;display:none;place-items:center}.ov.show{display:grid}
  .card{width:min(440px,92vw);max-height:84vh;overflow:auto;background:#2a2038;color:#fff;border-radius:18px;padding:18px;border:1px solid #F2784B;box-shadow:0 20px 60px #000a}
  .card h2{margin:0 0 4px;font-size:18px}.card p{margin:0 0 12px;color:#cdbfe6;font-weight:500;font-size:12.5px}
  .row{display:flex;align-items:center;gap:8px;background:#ffffff12;border-radius:12px;padding:8px 10px;margin-bottom:6px}.row i{font-style:normal;font-size:18px}.row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row small{color:#cdbfe6;font-weight:500}
  .row button{padding:3px 9px}.add{display:flex;gap:6px;margin-top:10px}input{flex:1;min-width:0;border:1px solid #ffffff40;border-radius:10px;background:#ffffff14;color:#fff;padding:9px 11px;outline:none}input:focus{border-color:#F2784B}
  .go{background:#F2784B}.err{min-height:18px;color:#ff9a8a;font-weight:500;margin-top:4px}.foot{margin-top:10px;color:#cdbfe6;font-weight:500;font-size:12px}`;
  const host = h('div', {id: 'rize-browser-bar'}); host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647';
  const root = host.attachShadow({mode: 'open'});
  try { const ss = new CSSStyleSheet(); ss.replaceSync(CSS); root.adoptedStyleSheets = [ss]; } catch (e) { root.append(h('style', {text: CSS})); }
  let locked = false, sites = [];
  const wrap = h('div'), ov = h('div', {class: 'ov'}), err = h('div', {class: 'err'}), list = h('div'), items = h('div');
  const setOpen = on => wrap.classList.toggle('open', on);
  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  const cur = () => location.hostname.replace(/^www\./, '');
  function drawSites() {
    const same = u => { const x = hostOf(u); return x && (cur() === x || cur().endsWith('.' + x)); };
    items.replaceChildren(...(sites.length ? sites.map(s => h('button', {class: 'it' + (same(s.u) ? ' cur' : ''), title: s.u, text: hostOf(s.u) || s.u, on: {click: () => { setOpen(false); api().go(s.u); }}})) : [h('div', {class: 'none', text: 'No websites yet. Open ⚙ Settings to add one.'})]));
    list.replaceChildren(...sites.map(s => h('div', {class: 'row'}, h('span', {text: hostOf(s.u) || s.u}), h('button', {title: 'Remove', text: '✕', on: {click: async () => { await api().remove(s.u); load(); }}}))));
  }
  async function load() { try { sites = (await api().sites()).sites || []; drawSites(); } catch (e) {} }
  const input = h('input', {placeholder: 'Add a website, e.g. perplexity.ai', spellcheck: 'false', autocomplete: 'off'});
  async function add() { err.textContent = ''; const r = await api().add(input.value); if (!r || !r.ok) { err.textContent = (r && r.error) || 'Could not add that.'; return; } input.value = ''; sites = r.sites; drawSites(); }
  const closeSet = () => { ov.classList.remove('show'); locked = false; };
  const openSet = () => { setOpen(false); ov.classList.add('show'); locked = true; load(); setTimeout(() => input.focus(), 30); };
  input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); add(); } else if (e.key === 'Escape') closeSet(); });
  input.addEventListener('keyup', e => e.stopPropagation()); input.addEventListener('keypress', e => e.stopPropagation());
  ov.addEventListener('mousedown', e => { if (e.target === ov) closeSet(); });
  ov.append(h('div', {class: 'card'}, h('h2', {text: '⚙ Browser settings'}), h('p', {text: 'These websites appear in the ▼ list at the top. There is no address bar on purpose: add a site here to use it.'}), list,
    h('div', {class: 'add'}, input, h('button', {class: 'go', text: '➕ Add', on: {click: add}})), err,
    h('div', {class: 'foot', text: 'Buddy sees which of these sites you use and counts it like any browser. Esc closes this panel.'}), h('div', {class: 'add'}, h('span', {class: 'sp'}), h('button', {text: 'Done', on: {click: closeSet}}))));
  const tab = h('button', {class: 'tab', title: 'Your websites (Ctrl+Space)', text: '▼', on: {click: () => { load(); setOpen(!wrap.classList.contains('open')); }}});
  const dd = h('div', {class: 'dd'}, h('div', {class: 'nav'}, h('button', {title: 'Back (Alt+←)', text: '‹ Back', on: {click: () => api().back()}}), h('button', {title: 'Forward (Alt+→)', text: 'Forward ›', on: {click: () => api().forward()}}), h('button', {title: 'Reload (Ctrl+R)', text: '⟳', on: {click: () => api().reload()}})),
    h('div', {class: 'lab', text: 'Websites'}), items, h('button', {class: 'it', text: '⚙ Settings – add or remove sites', on: {click: openSet}}));
  wrap.append(tab, dd, ov); root.append(wrap);
  document.addEventListener('mousedown', e => { if (!e.composedPath().includes(host)) setOpen(false); }, true);
  addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === ',') { e.preventDefault(); openSet(); }
    else if (e.ctrlKey && e.code === 'Space') { e.preventDefault(); load(); setOpen(!wrap.classList.contains('open')); }
    else if (e.ctrlKey && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); api().reload(); }
    else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); api().back(); }
    else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); api().forward(); }
    else if (e.key === 'Escape') { if (ov.classList.contains('show')) closeSet(); else setOpen(false); }
  }, true);
  document.documentElement.append(host);
  if (api()) load(); else addEventListener('pywebviewready', load, {once: true});
})();
