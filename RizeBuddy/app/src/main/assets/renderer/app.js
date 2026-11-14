const DAY = 864e5, HR = 36e5, $ = id => document.getElementById(id);
const PROD = /code|devenv|idea|pycharm|webstorm|figma|photoshop|illustrator|winword|excel|powerpnt|notion|obsidian|terminal|powershell|cmd|postman|word|blender/i, MEET = /zoom|teams|webex|meet|skype/i;
const PAL = ['#6366F1', '#16a34a', '#3b82f6', '#e11d48', '#f59e0b', '#0d9488', '#a855f7', '#ec4899'], BC = {f: '#6366F1', m: '#3B82F6', b: '#F43F5E', o: '#64748B'}, CN = {f: 'Focus', m: 'Meeting', b: 'Break', o: 'Other'};
const ZL = [{px: 34, g: 15, d: 7}, {px: 90, g: 10, d: 5}, {px: 160, g: 5, d: 3}, {px: 360, g: 2, d: 2}, {px: 720, g: 1, d: 1}], PX = () => mode === 'day' ? Math.max(60, ZL[zl].px) : ZL[zl].px;
const NAV = [['Home', [['dash', '▦', 'Dashboard'], ['over', '◧', 'Overview']]], ['Track', [['cal', '▤', 'Calendar'], ['timer', '⏱', 'Timer'], ['act', '◔', 'Review'], ['yt', '▶', 'YouTube']]], ['Analyze', [['prod', '↗', 'Productivity'], ['rep', '≣', 'Reports']]], ['Work', [['proj', '◈', 'Projects'], ['cli', '☺', 'Clients'], ['area', '◐', 'Areas'], ['task', '☑', 'Tasks'], ['exam', '🎓', 'Exams'], ['prof', '€', 'Profitability']]], ['Admin', [['priv', '🔒', 'Privacy'], ['set', '⚙', 'Settings']]]];
let C = {v: {}, va: {}, areas: [], exams: [], kw: [], target: 6, idle: 120, projects: [], clients: [], tasks: [], entries: [], timer: null, game: {lv: 1, bonus: 0}};
let S = [], view = 'over', mode = 'day', day = today(), asking = null, step = 0, QL = [], sumTab = 'proj', lastXp = null, repDays = 30, G = {}, flt = 'all', zl = 0, CM = {}, ME = null, anim = true, scrollPend = true, tk = 'f';
function today() { return new Date().setHours(0, 0, 0, 0); }
const uid = () => Date.now() + Math.floor(Math.random() * 1e3);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const dur = s => (s.end - s.start) / 6e4, fm = m => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`; };
const tm = t => new Date(t).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', hour12: false});
const hms = ms => { const s = Math.max(0, Math.floor(ms / 1e3)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(x => String(x).padStart(2, '0')).join(':'); };
const eur = n => '€' + n.toFixed(2), loc = ms => new Date(ms - new Date(ms).getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
let AUTO = false, AUTOOPEN = true;
const save = () => { CM = {}; return api.setcfg(C).then(async r => { try { adoptCfg(await api.cfg()); } catch (e) {} return r; }); };   // the tray app syncs task -> chapter progress; pull it back
let _bg = null, _bgAgain = false;
// Background save: the screen is already updated, the tray app is told afterwards. Rapid edits coalesce into one more save instead of queueing a slow one each.
function saveBg() { if (_bg) { _bgAgain = true; return _bg; } _bg = (async () => { try { do { _bgAgain = false; await api.setcfg(C); } while (_bgAgain); try { adoptCfg(await api.cfg()); CM = {}; render(); } catch (e) {} } catch (e) { toast('Could not save, retrying…'); } finally { _bg = null; } })(); return _bg; }
const pvget = () => Object.assign({incognito: true, hideTitles: false, block: []}, C.privacy || {});
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.append(d); setTimeout(() => d.remove(), 2200); }

// ---------- classification: every app / site / video can be reviewed ----------
let YD = {};
const SH = () => C.shortSec ?? 60;
const isShort = s => s.kind === 'youtube' && SH() > 0 && !(('yt:' + s.title.toLowerCase()) in C.v) && !(s.title.toLowerCase() in C.v) && (/#shorts?\b/i.test(s.title) || (YD[s.title.toLowerCase()] || 0) <= (SH() + 4) * 1000);
const site = t => { const p = t.split(/\s[-–—|·•]\s/), l = p[p.length - 1].trim(); return p.length > 1 && l.length <= 26 ? l : t.slice(0, 40); };
const sk = s => s.kind === 'youtube' ? (s._k === 'yt:shorts' ? 'YouTube Shorts' : s.title) : s.kind === 'browser' ? site(s.title) : s.app;
const rk = s => s.kind === 'youtube' && isShort(s) ? 'yt:shorts' : ({youtube: 'yt:', browser: 'web:', app: 'app:'}[s.kind] || 'app:') + sk(s).toLowerCase();
const AISITE = /claude|chatgpt|gemini|copilot|perplexity|grok|deepseek|poe\b|mistral|meta ai|character\.ai|you\.com/i;
const hitW = (L, t) => (L || []).some(w => w && w.trim() && t.includes(w.trim().toLowerCase()));
function userRule(s) {      // your own rules beat everything: blocked sites/apps, and keywords that decide AI chats
  if (!(C.blk || []).length && !(C.kwb || []).length && !(C.kw || []).length) return null;
  const name = s.kind === 'youtube' ? 'youtube ' + s.title.toLowerCase() : s.kind === 'browser' ? site(s.title).toLowerCase() : s.app.toLowerCase();
  if (hitW(C.blk, name)) return {c: 'b', set: true, auto: true, blocked: true};
  if (s.kind === 'browser' && AISITE.test(name)) { const t = s.title.toLowerCase(); if (hitW(C.kwb, t)) return {c: 'b', set: true, auto: true, kwb: true}; if (hitW(C.kw, t) && !C.v['web:' + name]) return {c: 'f', set: true, auto: true}; }
  return null;
}
function cat(s) {
  const ur = userRule(s); if (ur) return ur;
  const k = s._k || (s._k = rk(s)); if (CM[k]) return CM[k];
  if (k === 'yt:shorts') { const v0 = C.v[k]; return CM[k] = v0 ? {c: v0, set: true} : {c: 'b', set: true, auto: true, short: true}; }
  let v = C.v[k]; if (v === undefined && s.kind === 'youtube') v = C.v[s.title.toLowerCase()];
  v = v === 'p' ? 'f' : v === 'u' ? 'b' : v; let r;
  if (v) r = {c: v, set: true};
  else if (s.kind === 'youtube' && hitW(C.kwb, s.title.toLowerCase())) r = {c: 'b', set: true, auto: true, kwb: true};
  else if (s.kind === 'youtube') r = C.kw.some(w => s.title.toLowerCase().includes(w.toLowerCase())) ? {c: 'f', set: true, auto: true} : {c: 'b', set: false};
  else if (s.kind === 'app') r = MEET.test(s.app) ? {c: 'm', set: true, auto: true} : PROD.test(s.app) ? {c: 'f', set: true, auto: true} : {c: 'o', set: false};
  else if (s.kind === 'browser' && s.rbc) r = {c: s.rbc, set: true, auto: true, rb: true};
  else r = {c: 'o', set: false};
  return CM[k] = r;
}
const bk = s => cat(s).c, isW = s => { const b = bk(s); return b === 'f' || b === 'm'; };
const col = s => { const c = cat(s); if (c.set && c.c === 'f') { const a = areaOf(s); if (a) return a.color; } return c.set ? BC[c.c] : s.kind === 'youtube' ? '#d97706' : s.kind === 'browser' ? '#0d9488' : '#64748B'; };
function proj(s) { const t = (s.app + ' ' + s.title).toLowerCase(); return C.projects.find(p => (p.kw || '').split(',').some(k => k.trim() && t.includes(k.trim().toLowerCase()))) || null; }
const pOf = id => C.projects.find(p => p.id == id), cOf = id => C.clients.find(c => c.id == id), rate = p => p ? (+p.rate || +(cOf(p.client)?.rate) || 0) : 0;

// ---------- ranges & data ----------
function range() {
  const d = new Date(day), y = d.getFullYear(), m = d.getMonth(), dd = d.getDate(); let a, b;
  if (mode === 'day') { a = day; b = new Date(y, m, dd + 1).getTime(); }
  else if (mode === 'week') { const nd = ZL[zl].d; if (nd < 7) { a = new Date(y, m, dd).getTime(); b = new Date(y, m, dd + nd).getTime(); } else { const o = (d.getDay() + 6) % 7; a = new Date(y, m, dd - o).getTime(); b = new Date(y, m, dd - o + 7).getTime(); } }
  else if (mode === 'month') { a = new Date(y, m, 1).getTime(); b = new Date(y, m + 1, 1).getTime(); }
  else { a = new Date(y, 0, 1).getTime(); b = new Date(y + 1, 0, 1).getTime(); }
  return [a, b];
}
const sess = (a, b) => S.filter(s => s.start >= a && s.start < b), ents = (a, b) => C.entries.filter(e => e.start >= a && e.start < b);
const sumMin = (L, f) => L.reduce((t, s) => t + (f(s) ? dur(s) : 0), 0), work = (a, b) => sumMin(sess(a, b), isW);
function stats(L) { const c = {f: 0, m: 0, b: 0, o: 0}; L.forEach(s => c[bk(s)] += dur(s)); return c; }
function game() {
  let xp = C.game.bonus || 0; const dm = {};
  S.forEach(s => { if (isW(s)) { const m = dur(s); xp += m; const k = new Date(s.start).setHours(0, 0, 0, 0); dm[k] = (dm[k] || 0) + m; } });
  C.exams.forEach(x => (x.ch || []).forEach(c => { xp += (c.imp || 1) * c.p * 4; }));
  C.entries.forEach(e => { const m = dur(e), v = (XPK[e.kind] || 0) * m + (e.pts || 0); if (v) { xp += v; if (e.kind === 's' || e.kind === 'x') { const k = new Date(e.start).setHours(0, 0, 0, 0); dm[k] = (dm[k] || 0) + m; } } });
  xp = Math.floor(xp); let L = 1, rem = xp, need = 100; while (rem >= need) { rem -= need; L++; need = 100 + (L - 1) * 40; }
  let st = 0, d = today(); if ((dm[d] || 0) < 30) d -= DAY; while ((dm[d] || 0) >= 30) { st++; d = new Date(d).setDate(new Date(d).getDate() - 1); }
  return {xp, L, rem, need, st, dm};
}
function tops(L, kf, ok) { const m = {}; L.filter(ok).forEach(s => { const k = kf(s); (m[k] = m[k] || {k, min: 0, s}).min += dur(s); }); return Object.values(m).sort((a, b) => b.min - a.min); }
function blocks(L, kf) { const o = []; L.forEach(s => { const k = kf(s), l = o[o.length - 1]; if (l && l.k === k && s.start - l.end < 12e4) l.end = Math.max(l.end, s.end); else o.push({k, start: s.start, end: s.end, s}); }); return o; }
function byProj(a, b) { const m = {}, add = (p, x) => { const k = p ? p.id : '_'; m[k] = (m[k] || 0) + x; };
  sess(a, b).forEach(s => { const p = proj(s); if (p) add(p, dur(s)); else if (isW(s)) add(null, dur(s)); }); ents(a, b).forEach(e => add(pOf(e.project), dur(e))); return m; }
const label = () => { const [a, b] = range(), f = (o, x) => new Date(x).toLocaleDateString([], o);
  return mode === 'day' ? f({weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'}, a) : mode === 'week' ? `${f({month: 'short', day: 'numeric'}, a)} – ${f({month: 'short', day: 'numeric', year: 'numeric'}, b - 1)}` : mode === 'month' ? f({month: 'long', year: 'numeric'}, a) : String(new Date(a).getFullYear()); };
const bars = rows => rows.slice(0, 12).map(r => `<div class="row"><div class="t">${esc(r[0])}</div><div style="width:130px"><div class="meter" style="width:${r[1] / (rows[0][1] || 1) * 100}%;background:${r[2] || 'var(--ac)'}"></div></div><div style="width:72px;text-align:right">${fm(r[1])}</div></div>`).join('') || '<div class="empty">Nothing yet.</div>';
const popts = sel => '<option value="">No project</option>' + C.projects.map(p => `<option value="${p.id}" ${p.id == sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
function items(L) { const m = {}; L.forEach(s => { (m[s._k] = m[s._k] || {k: s._k, s, min: 0}).min += dur(s); }); return Object.values(m).sort((a, b) => b.min - a.min); }
const pending = () => items(sess(...range())).filter(x => !cat(x.s).set && x.min >= (x.s.kind === 'youtube' ? .5 : 2));
const lbl = k => { const s = S.find(x => x._k === k); return s ? sk(s) : k.split(':').slice(1).join(':'); }, kindOf = k => ({yt: 'YouTube', web: 'Site', app: 'App'}[k.split(':')[0]]);

// ---------- calendar ----------
function lane(list, H, ds, o = {}) {
  let h = `<div class="col" ${o.d ? `data-d="${ds}"` : ''} style="height:${24 * H}px">`;
  for (let i = 0; i < 24; i++) { h += `<div class="hr" style="top:${i * H}px"></div>`; if (H >= 90) h += `<div class="hr hf" style="top:${i * H + H / 2}px"></div>`; if (H >= 160) h += `<div class="hr hf" style="top:${i * H + H / 4}px"></div><div class="hr hf" style="top:${i * H + H * .75}px"></div>`; }
  list.forEach(b => { const s = Math.max(b.start, ds), e = Math.min(b.end, ds + DAY); if (e <= s) return; const hh = Math.max(16, (e - s) / HR * H - 2), m = (e - s) / 6e4;
    const st = `top:${(s - ds) / HR * H}px;height:${hh}px;left:${b.l || '3px'};right:${b.r || '3px'};${b.kind === 'gap' ? '' : 'background:' + b.c}`, inner = `<b>${esc(b.t)}</b>${hh > 34 && !b.l ? `<br>${tm(s)}–${tm(e)} · ${fm(m)}${b.x || ''}` : ''}`;
    if (b.kind === 'entry') h += `<div class="blk ev" style="${st}" data-id="${b.id}" data-bs="${s}" data-be="${e}" data-t="${esc(b.t)}">${inner}<i class="rz"></i></div>`;
    else if (b.kind === 'gap') h += `<div class="blk ev gap" style="${st}" data-gs="${b.start}" data-ge="${b.end}">${inner}</div>`;
    else h += `<button class="blk ${b.kind === 'live' ? 'live' : ''}" style="${st}" data-bs="${s}" data-be="${e}" data-t="${esc(b.t)}" >${inner}</button>`; });
  if (ds === today()) { const n = new Date(); h += `<div class="now" style="top:${(Date.now() - ds) / HR * H}px"></div>`; }
  return h + '</div>';
}
const KCOL = {x: '#f97316', b: '#94a3b8', s: '#eab308', m: '#3b82f6'}, KN = {f: 'Productive', s: 'Study', x: 'Exercise', b: 'Break', m: 'Meeting'}, XPK = {s: 2, x: 1, f: 0, b: 0, m: 0}, ecol = e => ((e.kind === 's' || e.area) && aOf(e.area || 'study')) ? aOf(e.area || 'study').color : KCOL[e.kind] || pOf(e.project)?.color || '#8b5cf6';
const entryItems = E => E.map(e => ({kind: 'entry', id: e.id, start: e.start, end: e.end, t: e.task || pOf(e.project)?.name || KN[e.kind || 'f'], c: ecol(e), x: ' · ' + KN[e.kind || 'f']}));
const gapItems = (L, E) => blocks(L.filter(isW), () => 'w').filter(b => b.end - b.start >= 6e5 && !E.some(e => e.start < b.end && e.end > b.start)).map(b => ({kind: 'gap', start: b.start, end: b.end, t: 'Tracked work – click to log'}));
const gutter = H => '<div class="gut" style="height:' + 24 * H + 'px">' + [...Array(24)].map((_, i) => `<div class="hrl" style="top:${i * H + 2}px">${i}:00</div>` + (H >= 160 ? ['15', '30', '45'].map((m, q) => `<div class="hrl sub" style="top:${i * H + (q + 1) * H / 4 + 2}px">${i}:${m}</div>`).join('') : '')).join('') + '</div>';
const calBar = () => `<div class="calbar"><div class="seg"><button data-v="cal" class="on">Calendar</button><button data-v="rep">Report</button></div><button class="btn alt" data-a="zoom" data-p="-1">−</button><button class="btn alt" data-a="zoom" data-p="1">+</button><button class="btn alt" data-a="ics">Import .ics</button><span>Zoom ${zl + 1}/5 · ${ZL[zl].d} day${ZL[zl].d > 1 ? 's' : ''} · grid ${ZL[zl].g} min · drag in <b>Time entries</b> to log time · Ctrl+wheel zooms</span></div>`;
function calDay() {
  const [a, b] = range(), L = sess(a, b), E = ents(a, b), H = PX(), mk = (arr, f) => blocks(arr, f).filter(x => x.end - x.start >= 6e4);
  const apps = mk(L.filter(s => s.kind === 'app'), s => s.app).map(x => ({...x, t: x.s.app, c: col(x.s)}));
  const web = mk(L.filter(s => s.kind !== 'app'), s => s._k === 'yt:shorts' ? 'yt:shorts' : s.title).map(x => ({...x, t: x.k === 'yt:shorts' ? 'YouTube Shorts' : x.s.title, c: col(x.s), ask: x.s._k, x: ' · ' + CN[bk(x.s)] + (cat(x.s).set ? '' : '?')}));
  return calBar() + `<div class="cal" style="grid-template-columns:44px 1fr 1fr 1fr"><div class="hd"></div><div class="hd">Time entries</div><div class="hd">Apps</div><div class="hd">Browser &amp; YouTube</div>${gutter(H)}${lane([...gapItems(L, E), ...entryItems(E), ...liveItems(a, b)], H, a, {d: 1})}${lane(apps, H, a)}${lane(web, H, a)}</div>`;
}
function calWeek() {
  const [a] = range(), H = PX(), d0 = new Date(a), days = [...Array(ZL[zl].d)].map((_, i) => new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i).getTime());
  let h = calBar() + `<div class="cal" style="grid-template-columns:44px repeat(${ZL[zl].d},1fr)"><div class="hd"></div>` + days.map(d => `<div class="hd ${d === today() ? 't' : ''}" data-a="goday" data-p="${d}" style="cursor:pointer">${new Date(d).toLocaleDateString([], {weekday: 'short', day: 'numeric'})}<div class="sm">${fm(G.dm[d] || 0)}</div></div>`).join('') + gutter(H);
  days.forEach(d => { const nx = new Date(new Date(d).getFullYear(), new Date(d).getMonth(), new Date(d).getDate() + 1).getTime(), L = sess(d, nx), E = ents(d, nx);
    h += lane([...blocks(L, s => bk(s)).filter(x => x.end - x.start >= 18e4).map(x => ({...x, t: x.s.kind === 'app' ? x.s.app : x.s.title, c: BC[x.k], l: '2px', r: '48%'})), ...[...gapItems(L, E), ...entryItems(E), ...liveItems(d, nx)].map(x => ({...x, l: '54%', r: '2px', t: x.kind === 'gap' ? '＋ log' : x.t}))], H, d, {d: 1}); });
  return h + '</div>';
}
const heat = (m, a = .08) => `rgba(242,120,75,${a + Math.min(1, m / (C.target * 60)) * .6})`;
function calMonth() {
  const [a, b] = range(), f = new Date(a); let h = '<div class="mgrid">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="sm" style="text-align:center">${d}</div>`).join('');
  for (let i = 0; i < (f.getDay() + 6) % 7; i++) h += '<div></div>';
  for (let d = 1; ; d++) { const t = new Date(f.getFullYear(), f.getMonth(), d).getTime(); if (t >= b) break; const w = G.dm[t] || 0; h += `<div class="mc" data-a="goday" data-p="${t}" style="background:${heat(w)}"><b>${d}</b><span>${w ? fm(w) : ''}</span></div>`; }
  return h + '</div>';
}
function calYear() {
  const y = new Date(range()[0]).getFullYear(); let h = '<div class="ym">';
  for (let m = 0; m < 12; m++) { h += `<div class="card"><h3>${new Date(y, m, 1).toLocaleDateString([], {month: 'long'})}</h3><div class="yg">` + '<span></span>'.repeat((new Date(y, m, 1).getDay() + 6) % 7);
    for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) { const t = new Date(y, m, d).getTime(); h += `<i data-a="goday" data-p="${t}" title="${fm(G.dm[t] || 0)}" style="background:${(G.dm[t] || 0) ? heat(G.dm[t], .2) : 'var(--pn2)'}"></i>`; } h += '</div></div>'; }
  return h + '</div>';
}
const cal = () => ({day: calDay, week: calWeek, month: calMonth, year: calYear}[mode])();

// calendar drag: create / move / resize (ported from the SYSTEM calendar)
function wireCal() {
  const cl = document.querySelector('.cal'); if (!cl || !cl.querySelector('.col[data-d]')) return;
  const H = PX(), u = ZL[zl].g * 6e4, snap = m => Math.round(m / u) * u, cols = () => [...cl.querySelectorAll('.col[data-d]')];
  const colAt = x => cols().find(k => { const r = k.getBoundingClientRect(); return x >= r.left && x < r.right; });
  const yMs = (k, y) => +k.dataset.d + snap(Math.max(0, Math.min(DAY, (y - k.getBoundingClientRect().top) / H * HR))); let dr = null;
  cl.onpointerdown = e => { const k = e.target.closest('.col[data-d]'); if (!k || e.button || e.target.closest('button.blk')) return;
    const ev = e.target.closest('.ev'), en = ev && ev.dataset.id ? C.entries.find(x => x.id == ev.dataset.id) : null, t0 = yMs(k, e.clientY);
    dr = {k, ev, en, x: e.clientX, y: e.clientY, t0, m: 0, mode: !en ? 'new' : e.target.classList.contains('rz') ? 'rs' : 'mv', off: en ? t0 - en.start : 0}; cl.setPointerCapture(e.pointerId); };
  cl.onpointermove = e => { const d = dr; if (!d || (!d.m && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 6)) return; d.m = 1; let k = d.k, s, z, p = yMs(k, e.clientY);
    if (d.mode === 'new') { s = Math.min(d.t0, p); z = Math.max(d.t0, p); } else if (d.mode === 'rs') { s = d.en.start; z = p; } else { k = colAt(e.clientX) || d.k; p = yMs(k, e.clientY); s = Math.max(+k.dataset.d, p - d.off); z = s + d.en.end - d.en.start; }
    if (z - s < u) z = s + u; d.s = s; d.z = z;
    if (!d.gh) { d.gh = document.createElement('div'); d.gh.className = 'blk ghost'; d.gh.style.left = '3px'; d.gh.style.right = '3px'; if (d.ev && d.en) d.ev.style.opacity = .3; }
    const ds = +k.dataset.d; d.gh.style.top = (s - ds) / HR * H + 'px'; d.gh.style.height = Math.max(14, (Math.min(z, ds + DAY) - s) / HR * H - 2) + 'px'; d.gh.textContent = tm(s) + ' – ' + tm(z); k.append(d.gh); };
  cl.onpointerup = () => { const d = dr; if (!d) return; dr = null; d.gh && d.gh.remove(); if (d.ev) d.ev.style.opacity = '';
    if (!d.m) { if (d.en) return openModal(d.en); if (d.ev) return openModal(null, +d.ev.dataset.gs, +d.ev.dataset.ge, true); return openModal(null, d.t0, d.t0 + (u >= 18e5 ? 36e5 : 18e5)); }
    if (d.mode === 'new') return openModal(null, d.s, d.z); d.en.start = d.s; d.en.end = d.z; save(); render(); toast(d.mode === 'rs' ? 'Duration updated' : 'Moved'); };
  cl.onpointercancel = () => { if (dr) { dr.gh && dr.gh.remove(); if (dr.ev) dr.ev.style.opacity = ''; dr = null; } };
  cl.onwheel = e => { if (!e.ctrlKey) return; e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); };
}
function zoom(n) { const z = Math.max(0, Math.min(4, zl + n)); if (z !== zl) { zl = z; scrollPend = true; render(); } }

// ---------- entry modal ----------
function openModal(en, s, e, gap) {
  const x = en ? {...en} : {start: s, end: e || s + HR, task: '', project: '', note: '', kind: 'f'}; if (gap) { const g = suggest(x.start, x.end); x.task = g.task; x.project = g.project; x.hint = g.hint; }
  ME = en ? en.id : null;
  $('modal').innerHTML = `<div class="mbox"><h3>${en ? 'Edit' : 'New'} time entry</h3><label>Task<input id="mt" list="tl2" value="${esc(x.task)}" placeholder="What did you work on?"><datalist id="tl2">${C.tasks.map(t => `<option value="${esc(t.title)}">`).join('')}</datalist></label>
  <label>Project<select id="mp">${popts(x.project)}</select>${x.hint ? `<span class="sm">${x.hint}</span>` : ''}</label><label>Type<select id="mk">${['f', 's', 'x', 'b', 'm'].map(k => `<option value="${k}" ${(x.kind || 'f') === k ? 'selected' : ''}>${KN[k]}</option>`).join('')}</select></label><label>Area<select id="ma"><option value="">None</option>${C.areas.map(a => `<option value="${a.id}" ${(x.area || (x.kind === 's' ? 'study' : '')) === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label><label>Notes<textarea id="mn">${esc(x.note || '')}</textarea></label>
  <div class="grid2"><label>Starts<input id="ms" type="datetime-local" value="${loc(x.start)}"></label><label>Ends<input id="me" type="datetime-local" value="${loc(x.end)}"></label></div>
  <div class="flex" style="justify-content:space-between;margin-top:14px"><div>${en ? '<button class="btn alt" data-a="mdel">Delete</button>' : ''}</div><div class="flex"><button class="btn alt" data-a="mcancel">Cancel</button><button class="btn" data-a="msave">Save</button></div></div></div>`;
  $('modal').classList.add('on'); setTimeout(() => $('mt')?.focus(), 50);
}
const closeModal = () => { $('modal').classList.remove('on'); $('modal').innerHTML = ''; ME = null; };

// ---------- views ----------
function dash() {
  const [a, b] = range(), L = sess(a, b), st = stats(L), sig = st.f + st.m, noise = st.b, ratio = noise ? sig / noise : sig, np = pending().length;
  const title = !G.xp ? 'Newbie' : noise > sig ? 'Lost in the Noise' : ratio >= 2 ? 'Signal Hunter' : 'Rookie', msg = !G.xp ? 'Work in your apps and every minute turns into XP.' : G.st > 1 ? `${G.st} days in a row. Keep stacking signal.` : 'Less noise, more signal.';
  return `<div class="card" style="background:#0a0a0a"><div class="flex" style="justify-content:space-between"><div><span class="pill">${title}</span><div class="big" style="margin-top:6px">Level ${G.L}</div><div class="sm">${msg}</div></div><div class="big">🔥 ${G.st}<span class="sm"> day streak</span></div></div><div class="flex sm" style="justify-content:space-between;margin-top:10px"><span>XP to next level</span><b>${G.rem} / ${G.need}</b></div><div class="bar"><i style="width:${G.rem / G.need * 100}%;background:linear-gradient(90deg,#6366F1,#3B82F6)"></i></div></div>
  ${np ? `<div class="ask"><div class="t">❓ ${np} app/site/video${np > 1 ? 's' : ''} waiting for your review</div><button class="btn" data-a="flt" data-p="new">Review now</button></div>` : '<div></div>'}
  <div class="grid4"><div class="card"><div class="sm">XP today</div><div class="big">+${Math.round(G.dm[today()] || 0)}</div></div><div class="card"><div class="sm">Signal</div><div class="big g">${fm(sig)}</div></div><div class="card"><div class="sm">Noise</div><div class="big r">${fm(noise)}</div></div><div class="card"><div class="sm">Signal : noise</div><div class="big">${ratio.toFixed(1)}</div></div></div>
  ${nextExam()}<div class="grid2"><div class="card"><h3>Top apps</h3>${bars(tops(L, s => s.app, s => s.kind === 'app').map(x => [x.k, x.min, col(x.s)]))}</div><div class="card"><h3>Projects</h3>${bars(Object.entries(byProj(a, b)).map(([k, v]) => [pOf(k)?.name || 'Unassigned', v, pOf(k)?.color || '#64748B']).sort((x, y) => y[1] - x[1]))}</div></div>`;
}
const P0 = () => ({mode: 'focus', running: false, seg: 0, endAt: 0, rem: 1500000, task: '', project: '', cycle: 0, act: 'study', goalDay: 0, cfg: {focus: 25, short: 5, long: 15, every: 4, goal: 4}});
const pm = () => C.pomo || (C.pomo = P0()), PD = m => pm().cfg[m] * 6e4, pmLeft = p => p.running ? Math.max(0, p.endAt - Date.now()) : p.rem;
const mmss = ms => { const x = Math.ceil(ms / 1e3); return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };
const RW = [['✨ Nice focus!', 0, 55], ['🎁 Lucky bonus!', 15, 25], ['🔥 On fire!', 30, 15], ['💎 Jackpot!', 60, 5]];
const reward = () => { let r = Math.random() * 100, a = 0; for (const x of RW) { a += x[2]; if (r < a) return x; } return RW[0]; };
const EX = [['Push-ups', 'k', .2], ['Squats', 'k', .15], ['Sit-ups', 'k', .15], ['Pull-ups', 'k', .6], ['Plank', 'm', 1], ['Running', 'm', 1.5], ['Walking', 'm', .6], ['Cycling', 'm', 1]];
function beep() { try { const a = new AudioContext(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = .1; o.start(); setTimeout(() => { o.stop(); a.close(); }, 400); } catch (e) {} }
function closeSeg(end, done) { const p = pm(), s = p.seg; if (end - s < 3e4) return null; const kind = p.mode !== 'focus' ? 'b' : p.act === 'exercise' ? 'x' : p.act === 'prod' ? 'f' : 's';
  const e = {id: uid(), start: s, end, task: p.mode !== 'focus' ? 'Break' : p.act === 'exercise' ? 'Workout' : p.task, project: p.mode === 'focus' ? p.project : '', kind, pomo: done && p.mode === 'focus' ? 1 : 0, note: '', area: p.mode !== 'focus' || p.act === 'exercise' ? '' : (p.area || (p.act === 'study' ? 'study' : '')), link: p.mode === 'focus' && p.act === 'study' && p.link ? ((l) => ({it: l[0], ch: l[1]}))(p.link.split(':')) : null}; C.entries.push(e); return e; }
async function pmStart() { const p = pm(); if (p.running) return; const n = Date.now(); p.running = true; p.endAt = n + p.rem; p.seg = n; try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {} await save(); }
async function pmPause() { const p = pm(); if (!p.running) return; const n = Date.now(), e = closeSeg(n, 0), fin = p.mode === 'focus' && p.act === 'exercise'; p.rem = fin ? PD('focus') : Math.max(0, p.endAt - n); p.running = false; await save(); if (fin && e) askWorkout(e.id); }
async function pmDone() { const p = pm(), was = p.mode, ex = p.act === 'exercise', e = closeSeg(p.endAt, 1); let rw = null;
  if (was === 'focus') { p.cycle++; p.mode = p.cycle % p.cfg.every === 0 ? 'long' : 'short'; rw = reward(); if (rw[1]) C.game.bonus = (C.game.bonus || 0) + rw[1];
    const td = today(), n = C.entries.filter(x => x.pomo && x.start >= td).length + 0; if (!ex && n >= p.cfg.goal && p.goalDay !== td) { p.goalDay = td; C.game.bonus = (C.game.bonus || 0) + 50; toast('🎯 Daily pomodoro goal reached! +50 XP'); } } else p.mode = 'focus';
  p.running = false; p.rem = PD(p.mode); await save(); beep(); try { new Notification('Rize', {body: was === 'focus' ? 'Focus done – take a break' : 'Break over – back to focus'}); } catch (x) {}
  if (was === 'focus' && ex && e) askWorkout(e.id); else if (rw) rewardModal(rw); else pop('Break over – back to focus'); await refresh(); }
async function pmSkip() { const p = pm(); if (p.running) closeSeg(Date.now(), 0); if (p.mode === 'focus') { p.cycle++; p.mode = p.cycle % p.cfg.every === 0 ? 'long' : 'short'; } else p.mode = 'focus'; p.running = false; p.rem = PD(p.mode); await save(); }
async function pmStop() { const p = pm(); if (p.running) closeSeg(Date.now(), 0); p.mode = 'focus'; p.running = false; p.rem = PD('focus'); await save(); toast('Saved'); }
function rewardModal(rw) { const p = pm(), n = C.entries.filter(x => x.pomo && x.start >= today()).length;
  $('modal').innerHTML = `<div class="mbox" style="text-align:center"><h3>${rw[0]}</h3><p class="sm">${rw[1] ? '+' + rw[1] + ' bonus XP · ' : ''}${Math.round(n / p.cfg.goal * 100)}% of today’s pomodoro goal${G.st > 1 ? ' · 🔥 ' + G.st + '-day streak' : ''}</p><div class="flex" style="justify-content:center;margin-top:12px"><button class="btn" data-a="pmgo2">Start break</button><button class="btn alt" data-a="mcancel">Later</button></div></div>`; $('modal').classList.add('on'); }
function askWorkout(id) { const e = C.entries.find(x => x.id == id); if (!e) return; ME = id;
  $('modal').innerHTML = `<div class="mbox"><h3>💪 What did you do?</h3><p class="sm">${tm(e.start)}–${tm(e.end)} · ${fm(dur(e))}</p><div style="max-height:50vh;overflow:auto">${EX.map((x, i) => `<label>${x[0]} (${x[1] === 'k' ? 'reps' : 'minutes'})<input id="wx${i}" type="number" min="0" value="${(e.items || {})[x[0]] || 0}"></label>`).join('')}</div><div class="flex" style="justify-content:flex-end;margin-top:12px"><button class="btn alt" data-a="mcancel">Skip</button><button class="btn" data-a="wsave">Save workout</button></div></div>`; $('modal').classList.add('on'); }
function timer() {
  const p = pm(), tt = PD(p.mode), left = pmLeft(p), td = today(), T = ents(td, td + DAY), poms = T.filter(e => e.pomo).length, foc = T.filter(e => e.kind === 's' || e.kind === 'f').reduce((x, e) => x + dur(e), 0), brk = T.filter(e => e.kind === 'b').reduce((x, e) => x + dur(e), 0), ex = T.filter(e => e.kind === 'x').reduce((x, e) => x + dur(e), 0);
  const E = ents(...range()).sort((x, y) => y.start - x.start), col = p.mode === 'focus' ? '#6366F1' : '#10B981', goal = p.cfg.goal || 4;
  return `<div class="grid2" style="align-items:start"><div class="card" style="text-align:center"><div class="tabs">${[['focus', 'Focus'], ['short', 'Short break'], ['long', 'Long break']].map(m => `<button class="${p.mode === m[0] ? 'on' : ''}" data-a="pmmode" data-p="${m[0]}">${m[1]}</button>`).join('')}</div>
  <div style="position:relative;width:230px;height:230px;margin:0 auto"><svg viewBox="0 0 200 200" width="230" height="230"><circle cx="100" cy="100" r="90" fill="none" stroke="#1E293B" stroke-width="8"/><circle id="pmr" cx="100" cy="100" r="90" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round" stroke-dasharray="565.5" stroke-dashoffset="${565.5 * (1 - (tt - left) / tt)}" transform="rotate(-90 100 100)" style="transition:stroke-dashoffset 1s linear"/></svg><div style="position:absolute;inset:0;display:grid;place-content:center"><div class="clk" id="pmt" style="font-size:44px;margin:0">${mmss(left)}</div><div class="sm">${p.mode === 'focus' ? 'Focus · pomodoro ' + (p.cycle % p.cfg.every + 1) + ' of ' + p.cfg.every : 'Break time'}</div></div></div>
  <div class="flex" style="justify-content:center;margin:12px 0"><select id="pma" ${p.running ? 'disabled' : ''}>${[['study', '📚 Study'], ['prod', '💼 Productive'], ['exercise', '💪 Exercise']].map(o => `<option value="${o[0]}" ${(p.act || 'study') === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>${p.act === 'exercise' ? '' : `<input id="pmk" list="tl" placeholder="${p.act === 'prod' ? 'What are you working on?' : 'What are you studying?'}" value="${esc(p.task)}"><datalist id="tl">${C.tasks.map(x => `<option value="${esc(x.title)}">`).join('')}</datalist><select id="pmp" ${p.running ? 'disabled' : ''}>${popts(p.project)}</select><select id="pmar" ${p.running ? 'disabled' : ''}><option value="">${p.act === 'study' ? 'Area: Study' : 'No area'}</option>${C.areas.map(a => `<option value="${a.id}" ${p.area === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>${p.act === 'study' ? `<select id="pml" ${p.running ? 'disabled' : ''}>${linkOpts(p.link || '')}</select>` : ''}`}</div>
  <div class="flex" style="justify-content:center"><button class="btn" data-a="pmtoggle">${p.running ? (p.act === 'exercise' && p.mode === 'focus' ? 'Finish' : 'Pause') : 'Start'}</button><button class="btn alt" data-a="pmskip">Skip</button><button class="btn alt" data-a="pmstop">Stop &amp; save</button><button class="btn alt" data-a="pmcfg">⚙ Durations</button><button class="btn alt" data-a="pip">⧉ Pop out</button><button class="btn alt" data-a="snd">🎧 ${SND ? 'Sound off' : 'Focus sound'}</button></div>
  <div class="sm" style="margin-top:10px">${p.act === 'exercise' ? 'Exercise mode: when it ends you pick what you did (earns XP).' : 'Study earns 2 XP/min, exercise 1 XP/min + workout points. Space = start/pause.'}</div></div>
  <div class="card"><div class="grid2"><div class="card"><div class="sm">Daily goal</div><div class="big">${Math.round(poms / goal * 100)}%</div><div class="sm">${poms}/${goal} 🍅</div></div><div class="card"><div class="sm">Focus today</div><div class="big">${fm(foc)}</div></div><div class="card"><div class="sm">Focus %</div><div class="big">${foc + brk ? Math.round(foc / (foc + brk) * 100) : 0}%</div></div><div class="card"><div class="sm">Exercise</div><div class="big">${fm(ex)}</div></div></div>
  <h3>Sessions – ${label()} <button class="btn alt" style="float:right;padding:2px 10px" data-a="newentry">＋ New entry</button></h3>${E.map(e => `<div class="row" data-a="editentry" data-p="${e.id}" style="cursor:pointer"><i class="dot" style="background:${ecol(e)}"></i><div class="t">${esc(e.task || KN[e.kind || 'f'])}<div class="sm">${KN[e.kind || 'f']} · ${tm(e.start)}–${tm(e.end)}${e.pomo ? ' · 🍅' : ''}${e.pts ? ' · +' + e.pts + ' pts' : ''}</div></div><b>${fm(dur(e))}</b></div>`).join('') || '<div class="empty">No sessions yet.</div>'}</div></div>`;
}
async function pmTick() { updTrk(); drawPip(); const p = C.pomo; if (!p) return; if (p.running && Date.now() >= p.endAt) return pmDone(); const left = pmLeft(p), tt = PD(p.mode), t = $('pmt'); if (t) t.textContent = mmss(left); const r = $('pmr'); if (r) r.setAttribute('stroke-dashoffset', 565.5 * (1 - (tt - left) / tt)); $('mini').textContent = p.running ? `⏱ ${mmss(left)}` : '▶ Timer'; }
function ytFocus(L) { const y = (L || sess(...range())).filter(s => s.kind === 'youtube'), t = sumMin(y, () => 1); return t ? Math.round(sumMin(y, s => bk(s) === 'f') / t * 100) : 0; }
function ytCards(L) { const y = L.filter(s => s.kind === 'youtube'), v = new Set(y.map(s => s._k)), rev = [...v].filter(k => cat(y.find(s => s._k === k)).set).length;
  return `<div class="grid4"><div class="card"><div class="sm">Videos watched</div><div class="big">${[...v].filter(k => k !== 'yt:shorts').length}</div><div class="sm">${y.filter(s => s._k === 'yt:shorts').length} short${y.filter(s => s._k === 'yt:shorts').length === 1 ? '' : 's'} · ${fm(sumMin(y.filter(s => s._k === 'yt:shorts'), () => 1))}</div></div><div class="card"><div class="sm">Reviewed</div><div class="big">${rev}/${v.size}</div></div><div class="card"><div class="sm">YouTube time</div><div class="big">${fm(sumMin(y, () => 1))}</div></div><div class="card"><div class="sm">YouTube focus %</div><div class="big g">${ytFocus(L)}%</div></div></div>`; }
// ---------- YouTube: unproductive videos (judged by TITLE, never by the domain) as a graph over time + a list to review ----------
let YQ = [];
function ytUnpro(L) {
  const [a, b] = range(), yt = L.filter(s => s.kind === 'youtube'), y = yt.filter(s => bk(s) === 'b'); YQ = [];
  if (!y.length) return `<div class="card"><h3>▶ Unproductive YouTube</h3><div class="empty">No unproductive YouTube in this period. 🎉</div></div>`;
  const hourly = mode === 'day', yearly = mode === 'year', n = hourly ? 24 : yearly ? 12 : Math.max(1, Math.round((b - a) / DAY));
  const bi = t => hourly ? new Date(t).getHours() : yearly ? new Date(t).getMonth() : Math.max(0, Math.min(n - 1, Math.floor((t - a) / DAY)));
  const lab = i => hourly ? String(i) : yearly ? new Date(2000, i, 1).toLocaleDateString([], {month: 'short'}) : String(new Date(a + i * DAY + 12 * HR).getDate());
  const B = Array.from({length: n}, () => ({min: 0, t: {}}));
  y.forEach(s => { const x = B[bi(s.start)], nm = sk(s); x.min += dur(s); x.t[nm] = (x.t[nm] || 0) + dur(s); });
  const mx = Math.max(1, ...B.map(x => x.min)), tot = sumMin(y, () => 1), all = sumMin(yt, () => 1);
  const step = n > 24 ? 3 : hourly ? 3 : 1;
  const chart = `<div class="flex" style="align-items:flex-end;height:150px;gap:${n > 24 ? 2 : 4}px;flex-wrap:nowrap">${B.map((x, i) => { const top = Object.entries(x.t).sort((p, q) => q[1] - p[1])[0]; return `<div style="flex:1;min-width:0;text-align:center"><div title="${esc(lab(i) + (hourly ? ':00' : ''))} · ${fm(x.min)}${top ? ' · ' + esc(top[0]) : ''}" style="height:${Math.max(x.min ? 3 : 0, x.min / mx * 110)}px;background:#F43F5E;border-radius:3px 3px 0 0"></div><div class="sm">${i % step === 0 ? lab(i) : '&nbsp;'}</div></div>`; }).join('')}</div>`;
  const g = {}; y.forEach(s => { const k = s._k, r = g[k] || (g[k] = {k, name: sk(s), min: 0, st: [], s}); r.min += dur(s); r.st.push(s.start); });
  const rows = Object.values(g).sort((p, q) => q.min - p.min).slice(0, 15), m0 = rows[0].min || 1;
  const when = r => r.st.sort((p, q) => p - q).slice(0, 3).map(t => hourly ? tm(t) : new Date(t).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false})).join(', ') + (r.st.length > 3 ? ' …' : '');
  return `<div class="card"><h3>▶ Unproductive YouTube · ${fm(tot)} <span class="sm">(${all ? Math.round(tot / all * 100) : 0}% of your YouTube time)</span></h3><div class="sm" style="margin-bottom:6px">Every video is judged by its <b>title</b> (and length), not by youtube.com. Minutes per ${hourly ? 'hour' : yearly ? 'month' : 'day'}:</div>${chart}</div>
  <div class="card"><h3>Review these videos</h3><div class="sm" style="margin-bottom:6px">Biggest time first. If Rize got one wrong, mark it Productive and it learns.</div>${rows.map(r => { YQ.push(r.k); const i = YQ.length - 1, c = cat(r.s); return `<div class="row"><span class="kb">▶</span><div class="t">${esc(r.name)}<div class="sm">${fm(r.min)} · ${esc(when(r))}${c.set ? '' : ' · <span style="color:var(--y)">not reviewed</span>'}</div></div><div style="width:110px"><div class="meter" style="width:${r.min / m0 * 100}%;background:#F43F5E"></div></div><div class="cs"><button class="f" data-a="ytmark" data-p="${i},f">✅ Productive</button><button class="b ${c.set && c.c === 'b' ? 'on' : ''}" data-a="ytmark" data-p="${i},b">Unproductive</button></div></div>`; }).join('')}</div>`;
}
function act(f) {
  f = f || flt; const L = sess(...range()), all = items(L), F = {all: () => 1, app: x => x.s.kind === 'app', web: x => x.s.kind === 'browser', yt: x => x.s.kind === 'youtube', new: x => !cat(x.s).set}, nn = all.filter(F.new).length;
  const list = all.filter(F[f]).slice(0, 60); QL = list.map(x => x.k); const ytc = f === 'yt' ? ytCards(L) + ytUnpro(L) : '';
  const tabs = [['all', 'All'], ['app', 'Apps'], ['web', 'Websites'], ['yt', 'YouTube'], ['new', `Needs review (${nn})`]];
  return `${ytc}<div class="tabs">${tabs.map(t => `<button class="${f === t[0] ? 'on' : ''}" data-a="flt" data-p="${t[0]}">${t[1]}</button>`).join('')}</div><div class="card"><h3>Tell Rize what counts as Focus, Meeting, Unproductive or Other – applies to every future session</h3>${list.map((x, i) => { const c = cat(x.s); return `<div class="row"><span class="kb">${kindOf(x.k)}</span><div class="t">${esc(sk(x.s))}<div class="sm">${fm(x.min)}${c.set ? '' : ' · <span class="y" style="color:var(--y)">not reviewed</span>'}${c.auto ? ' · auto' : ''}${window.autoTag ? autoTag(x.k) : ''}${x.k === 'yt:shorts' ? ' · videos ≤ ' + SH() + 's and #shorts · noise by default' : ''}${x.k === 'app:explorer' ? ' · Windows Explorer = File Explorer folders (the desktop, taskbar and Alt-Tab are no longer counted)' : ''}</div></div><div class="cs">${['f', 'm', 'b', 'o'].map(k => `<button class="${k} ${c.c === k && c.set ? 'on' : ''} ${c.auto ? 'au' : ''}" data-a="setcat" data-p="${i},${k}">${CN[k]}</button>`).join('')}</div>${c.c === 'f' ? areaSel(x, i) : ''}</div>`; }).join('') || '<div class="empty">Nothing here yet. Use your PC and activity shows up.</div>'}</div>`;
}
function projV() { const [a, b] = range(), m = byProj(a, b);
  return `<div class="card"><h3>New project</h3><div class="flex"><input id="pn" placeholder="Name"><select id="pc"><option value="">No client</option>${C.clients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><input id="pr" type="number" placeholder="€/hour" style="width:90px"><input id="pk" placeholder="Auto-match keywords (figma, vscode)" style="width:260px"><button class="btn" data-a="addproj">Add</button></div></div>
  <div class="card"><h3>Projects – ${label()}</h3>${C.projects.map(p => `<div class="row"><i class="dot" style="background:${p.color}"></i><div class="t"><b>${esc(p.name)}</b><div class="sm">${esc(cOf(p.client)?.name || 'No client')} · ${rate(p) ? eur(rate(p)) + '/h' : 'no rate'} · keywords: ${esc(p.kw || '—')}</div></div><b>${fm(m[p.id] || 0)}</b><button class="x" data-a="delproj" data-p="${p.id}">✕</button></div>`).join('') || '<div class="empty">No projects yet. Add keywords so apps and sites are matched automatically.</div>'}</div>`; }
function cliV() { const [a, b] = range(), m = byProj(a, b), hrs = c => C.projects.filter(p => p.client == c.id).reduce((t, p) => t + (m[p.id] || 0), 0);
  return `<div class="card"><h3>New client</h3><div class="flex"><input id="cn" placeholder="Client name"><input id="cr" type="number" placeholder="€/hour" style="width:100px"><button class="btn" data-a="addcli">Add</button></div></div><div class="card"><h3>Clients – ${label()}</h3>${C.clients.map(c => `<div class="row"><div class="t"><b>${esc(c.name)}</b><div class="sm">${c.rate ? eur(+c.rate) + '/h' : 'no rate'}</div></div><b>${fm(hrs(c))}</b><button class="btn alt" data-a="creport" data-p="${c.id}">Report</button><button class="x" data-a="delcli" data-p="${c.id}">✕</button></div>`).join('') || '<div class="empty">No clients yet.</div>'}</div>`; }
const chOpts = sel => '<option value="">No exam topic</option>' + C.exams.map(e => `<optgroup label="${esc(e.name)}"><option value="e:${e.id}" ${String(sel) === 'e:' + e.id ? 'selected' : ''}>🎓 Whole exam: ${esc(e.name)}</option>${(e.ch || []).map(c => `<option value="${c.id}" ${String(sel) === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
const exName = id => { const e = C.exams.find(x => String(x.id) === String(id)); return e ? e.name : ''; };
const chName = id => { for (const e of C.exams) { const c = (e.ch || []).find(x => String(x.id) === String(id)); if (c) return c.name; } return ''; };
function taskV() { const lm = t => window.linkMin ? linkMin('g:task:' + t.id) : 0, spent = t => C.entries.filter(e => e.taskId != null ? String(e.taskId) === String(t.id) : e.task === t.title).reduce((s, e) => s + dur(e), 0) + lm(t);
  const TR = t => `<div class="row"><input type="checkbox" data-a="donetask" data-p="${t.id}" ${t.done ? 'checked' : ''}><div class="t" style="${t.done ? 'text-decoration:line-through;color:var(--mt)' : ''}">${esc(t.title)}<div class="sm">${esc(pOf(t.project)?.name || 'No project')}${t.exam && exName(t.exam) ? ' · 🎓 ' + esc(exName(t.exam)) + ' (whole exam)' : ''}${t.chap && chName(t.chap) ? ' · 🔗 ' + esc(chName(t.chap)) + (t.autoChap ? ' (auto-linked)' : '') + ' (' + (t.done ? 100 : t.p || 0) + '%)' : ''}${t.est && !t.done ? ' · ⏱ ' + (t.p || 0) + '% of ' + fm(t.est) + ' (follows your time)' : ''}${lm(t) ? ' · ⏱ ' + fm(lm(t)) + ' from linked sites/apps (Review)' : ''}</div></div><select class="tlk" data-tl="${t.id}" title="Exam topic this task counts toward" style="max-width:150px">${chOpts(t.exam ? 'e:' + t.exam : t.chap)}</select><input type="number" min="0" class="tes" data-te="${t.id}" value="${t.est || ''}" placeholder="est min" title="Estimated minutes: progress follows your time" style="width:74px"><span class="sm">${fm(spent(t))}</span><button class="btn alt" data-a="starttask" data-p="${t.id}">▶</button><button class="x" data-a="deltask" data-p="${t.id}">✕</button></div>`;
  const tsec = (h, L, e, c) => `<div class="card"${c ? ' style="border-color:var(--g)"' : ''}><h3 style="margin:0 0 6px">${h} <span class="pill">${L.length}</span></h3>${L.map(TR).join('') || '<div class="empty">' + e + '</div>'}</div>`;
  return `<div class="card"><h3>New task</h3><div class="flex"><input id="tn" placeholder="Task title" style="width:260px"><input id="te" type="number" min="0" placeholder="Est. min" title="Optional: how many minutes this should take. Its progress then follows the time you spend (Timer + linked sites/apps)." style="width:90px"><select id="tp">${popts('')}</select><select id="tch" title="Link to an exam topic: its progress then updates automatically">${chOpts('')}</select><button class="btn" data-a="addtask">Add</button></div></div>${tsec('📝 To do – not finished', C.tasks.filter(t => !t.done), 'Nothing left to do 🎉')}${tsec('✅ Done – finished', C.tasks.filter(t => t.done), 'Nothing finished yet', 1)}`; }
const dl = (c, p) => { if (!p || Math.round((c - p) / p * 100) === 0) return ''; const d = Math.round((c - p) / p * 100); return `<span class="${d >= 0 ? 'g' : 'r'}" style="font-size:11px;font-weight:600">${d >= 0 ? '▲' : '▼'} ${Math.abs(d)}%</span>`; };
function tlStrip(L, a, b) {
  if (!L.length) return '<div class="empty">No activity tracked for this day yet.</div>';
  const now = Date.now(), t0 = Math.floor(Math.min(L[0].start, a + 8 * HR) / HR) * HR, t1 = Math.ceil(Math.max(L[L.length - 1].end, a + 18 * HR, now > a && now < b ? now : 0) / HR) * HR, sp = t1 - t0;
  const segs = blocks(L, s => bk(s)).filter(x => x.end - x.start >= 3e4).map(x => `<i class="tseg" style="left:${(x.start - t0) / sp * 100}%;width:${Math.max(.25, (x.end - x.start) / sp * 100)}%;background:${BC[x.k]}" data-bs="${x.start}" data-be="${x.end}" data-t="${esc(CN[x.k] + ' · ' + sk(x.s))}"></i>`).join('');
  const step = sp / HR > 12 ? 2 : 1, ticks = []; for (let t = t0; t <= t1; t += step * HR) ticks.push(`<span style="left:${(t - t0) / sp * 100}%">${new Date(t).getHours()}:00</span>`);
  return `<div class="tlbar" data-t0="${t0}" data-sp="${sp}">${segs}<div class="scrub"><b></b></div></div><div class="tlticks">${ticks.join('')}</div><div class="sm">Hover to scrub the day, click a segment for details.</div>`;
}
function stackBars(rows) { const mx = Math.max(60, ...rows.map(r => r.f + r.m + r.b + r.o));
  return `<div class="flex" style="align-items:flex-end;gap:6px;flex-wrap:nowrap;height:170px">${rows.map(r => `<div style="flex:1;min-width:0;text-align:center"><div style="height:130px;display:flex;flex-direction:column-reverse;border-radius:5px;overflow:hidden" title="${fm(r.f + r.m)} work">${['f', 'm', 'b', 'o'].map(k => `<div style="height:${r[k] / mx * 130}px;background:${BC[k]}"></div>`).join('')}</div><div class="sm">${r.label}</div></div>`).join('')}</div>`; }
function bucketsOf(a, b) { const out = [], y = new Date(a).getFullYear();
  if (mode === 'year') for (let m = 0; m < 12; m++) out.push({label: new Date(y, m, 1).toLocaleDateString([], {month: 'short'}), ...stats(sess(new Date(y, m, 1).getTime(), new Date(y, m + 1, 1).getTime()))});
  else for (let x = a; x < b;) { const d = new Date(x), n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); out.push({label: mode === 'week' ? d.toLocaleDateString([], {weekday: 'short'}) : String(d.getDate()), ...stats(sess(x, n))}); x = n; }
  return out; }
function insights(L, st, pst, dw, pdw) {
  const out = [], tr = st.f + st.m + st.b + st.o, ptr = pst.f + pst.m + pst.b + pst.o, hrs = Array(24).fill(0); L.filter(s => bk(s) === 'f').forEach(s => hrs[new Date(s.start).getHours()] += dur(s));
  const mx = Math.max(...hrs), bh = hrs.indexOf(mx); if (mx > 5) out.push(['🎯', `Your best focus hour was <b>${bh}:00–${bh + 1}:00</b> (${fm(mx)} of focus).`]);
  const w = st.f + st.m, pw = pst.f + pst.m; if (pw && Math.abs(w - pw) / pw >= .01) out.push([w >= pw ? '📈' : '📉', `Work time is <b>${Math.abs(Math.round((w - pw) / pw * 100))}% ${w >= pw ? 'higher' : 'lower'}</b> than the previous ${mode}.`]);
  const dist = tops(L, s => sk(s), s => bk(s) === 'b')[0]; if (dist && tr) out.push(['⚠️', `<b>${esc(dist.k)}</b> took ${fm(dist.min)} (${Math.round(dist.min / tr * 100)}% of tracked time).`]);
  if (dw.deep) out.push(['🧠', `${fm(dw.deep)} of deep work, longest streak <b>${fm(dw.longest)}</b>.`]); else if (tr > 30) out.push(['🧠', 'No uninterrupted 25-minute focus block yet – try a Pomodoro.']);
  const sph = dw.sw / Math.max(1, tr / 60), psph = pdw.sw / Math.max(1, ptr / 60); if (tr > 20) out.push(['🔀', `<b>${dw.sw}</b> context switches (${sph.toFixed(1)}/h)${psph ? (psph > sph ? ', fewer than before.' : ', more than before.') : '.'}`]);
  const sh = L.filter(s => s._k === 'yt:shorts'); if (sh.length) out.push(['📱', `<b>${sh.length}</b> shorts (${fm(sumMin(sh, () => 1))}) counted as noise.`]);
  const np = pending().length; if (np) out.push(['❓', `<b>${np}</b> item${np > 1 ? 's' : ''} need your review to keep these numbers accurate.`]);
  return out.slice(0, 6); }
function over() {
  const [a, b] = range(), L = sess(a, b), st = stats(L), P = sess(a - (b - a), a), pst = stats(P), dw = deepWork(L), pdw = deepWork(P), tr = st.f + st.m + st.b + st.o, w = st.f + st.m, pw = pst.f + pst.m;
  const tgt = C.target * 60 * {day: 1, week: 5, month: 22, year: 260}[mode], spH = dw.sw / Math.max(1, tr / 60), fscore = tr ? Math.round(Math.min(100, (w ? dw.deep / w : 0) * 60 + Math.max(0, 1 - spH / 40) * 40)) : 0;
  const ring = `<svg width="92" height="92" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="#1E293B" stroke-width="9"/><circle cx="50" cy="50" r="42" fill="none" stroke="#6366F1" stroke-width="9" stroke-linecap="round" stroke-dasharray="263.9" stroke-dashoffset="${263.9 * (1 - fscore / 100)}" transform="rotate(-90 50 50)"/><text x="50" y="58" text-anchor="middle" fill="#E6E8EE" font-size="26" font-weight="700" font-family="ui-monospace,Consolas,monospace">${fscore}</text></svg>`;
  const np = pending().length, gp = mode === 'day' ? gapItems(L, ents(a, b)).length : 0, ins = insights(L, st, pst, dw, pdw);
  const review = np || gp ? `<div class="ask"><div class="t">📝 <b>Day review</b> – ${np ? np + ' item' + (np > 1 ? 's' : '') + ' to categorize' : ''}${np && gp ? ' · ' : ''}${gp ? gp + ' tracked block' + (gp > 1 ? 's' : '') + ' not logged yet' : ''}</div>${np ? '<button class="btn" data-a="flt" data-p="new">Review items</button>' : ''}${gp ? '<button class="btn alt" data-a="gocal">Open calendar</button>' : ''}</div>` : '';
  const legend = ['f', 'm', 'b', 'o'].map(k => `<span><i class="dot" style="background:${BC[k]}"></i>${CN[k]} <b class="mono">${fm(st[k])}</b> ${dl(st[k], pst[k])}</span>`).join('');
  const pr = Object.entries(byProj(a, b)).map(([k, v]) => [pOf(k)?.name || 'Unassigned', v, pOf(k)?.color || '#64748B']).sort((x, y) => y[1] - x[1]);
  return `${review}<div class="card"><div class="flex" style="justify-content:space-between;margin-bottom:10px"><h3 style="margin:0">${mode === 'day' ? 'Timeline' : 'Breakdown'} – ${label()}</h3><div class="legend">${legend}</div></div>${mode === 'day' ? tlStrip(L, a, b) : stackBars(bucketsOf(a, b))}</div>
  <div class="grid4"><div class="card" style="display:flex;gap:12px;align-items:center">${ring}<div><div class="sm">Focus score</div><div class="sm">deep work &amp; few switches</div></div></div>
  <div class="card"><div class="sm">Work vs target</div><div class="big">${fm(w)}</div>${dl(w, pw)}<div class="bar" style="margin-top:8px"><i style="width:${Math.min(100, w / tgt * 100)}%;background:var(--ac)"></i></div><div class="sm">${Math.round(w / tgt * 100)}% of ${fm(tgt)}</div></div>
  <div class="card"><div class="sm">Deep work</div><div class="big">${fm(dw.deep)}</div>${dl(dw.deep, pdw.deep)}<div class="sm">longest ${fm(dw.longest)}</div></div>
  <div class="card"><div class="sm">Context switches</div><div class="big">${dw.sw}</div>${dl(dw.sw, pdw.sw)}<div class="sm">${spH.toFixed(1)} per hour</div></div></div>
  <div class="grid2"><div class="card"><h3>Insights</h3>${ins.map(i => `<div class="ins"><span>${i[0]}</span><div>${i[1]}</div></div>`).join('') || '<div class="empty">Track a little more to see insights.</div>'}</div>
  <div class="card"><h3>Where your time went</h3><div class="bar" style="height:18px;margin-bottom:8px">${['f', 'm', 'b', 'o'].map(k => `<div style="width:${st[k] / (tr || 1) * 100}%;background:${BC[k]}"></div>`).join('')}</div>${bars(pr)}</div></div>
  <div class="grid2"><div class="card"><h3>Top apps</h3>${bars(tops(L, s => s.app, s => s.kind === 'app').map(x => [x.k, x.min, col(x.s)]))}</div><div class="card"><h3>Top websites &amp; videos</h3>${bars(tops(L, s => sk(s), s => s.kind !== 'app').map(x => [x.k, x.min, col(x.s)]))}</div></div>`;
}
// slide-out inspector (click any block / timeline segment)
let INS = null, IK = [];
function openInsp(bs, be, title) { INS = {a: bs, b: be, t: title}; drawInsp(); $('insp').classList.add('on'); }
function drawInsp() { if (!INS) return; const ov = s => Math.min(s.end, INS.b) - Math.max(s.start, INS.a), L = S.filter(s => ov(s) > 0), its = items(L.map(s => ({...s, end: s.start + ov(s)}))); IK = its.slice(0, 8).map(x => x.k);
  const m = {}; L.forEach(s => { m[s.title] = (m[s.title] || 0) + ov(s) / 6e4; }); const tt = Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 6);
  $('insp').innerHTML = `<div class="flex" style="justify-content:space-between"><b style="font-size:15px">${esc(INS.t)}</b><button class="x" data-a="inclose">✕</button></div><div class="sm mono">${tm(INS.a)} – ${tm(INS.b)} · ${fm((INS.b - INS.a) / 6e4)}</div>
  <h3 style="margin-top:16px">Apps &amp; websites – click to categorize</h3>${its.slice(0, 8).map((x, i) => { const c = cat(x.s); return `<div class="irow"><div class="t">${esc(sk(x.s))}<div class="sm">${fm(x.min)} · ${kindOf(x.k)} · ${c.set ? CN[c.c] + (c.auto ? ' (auto)' : '') : 'not reviewed'}</div></div><div class="cs">${['f', 'm', 'b', 'o'].map(k => `<button class="${k} ${c.c === k && c.set ? 'on' : ''}" title="${CN[k]}" data-a="insset" data-p="${i},${k}">${CN[k][0]}</button>`).join('')}</div></div>`; }).join('') || '<div class="sm">No detail</div>'}
  <h3 style="margin-top:16px">Window titles</h3>${tt.map(([t, v]) => `<div class="leg"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px">${esc(t)}</span><span class="mono">${fm(v)}</span></div>`).join('')}
  <div class="flex" style="margin-top:18px"><button class="btn" data-a="inslog">Log as time entry</button></div>`; }
document.addEventListener('mousemove', e => { const b = e.target.closest('.tlbar'); if (!b) return; const r = b.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), sc = b.querySelector('.scrub'); sc.style.left = f * 100 + '%'; sc.firstChild.textContent = tm(+b.dataset.t0 + f * +b.dataset.sp); });
function prof() { const [a, b] = range(), m = byProj(a, b); let tot = 0, hrs = 0;
  const rows = C.projects.map(p => { const h = (m[p.id] || 0) / 60, r = h * rate(p); tot += r; hrs += h; return `<tr><td><i class="dot" style="background:${p.color}"></i>${esc(p.name)}</td><td>${esc(cOf(p.client)?.name || '—')}</td><td class="n">${h.toFixed(1)} h</td><td class="n">${rate(p) ? eur(rate(p)) : '—'}</td><td class="n"><b>${eur(r)}</b></td></tr>`; }).join(''), w = work(a, b) / 60;
  return `<div class="grid4"><div class="card"><div class="sm">Earned</div><div class="big g">${eur(tot)}</div></div><div class="card"><div class="sm">Billable hours</div><div class="big">${hrs.toFixed(1)} h</div></div><div class="card"><div class="sm">All work hours</div><div class="big">${w.toFixed(1)} h</div></div><div class="card"><div class="sm">Effective rate</div><div class="big">${w ? eur(tot / w) : '—'}/h</div></div></div><div class="card"><h3>Per project – ${label()}</h3><table><tr><th>Project</th><th>Client</th><th class="n">Time</th><th class="n">Rate</th><th class="n">Revenue</th></tr>${rows || '<tr><td colspan="5" class="sm">Add projects with rates first.</td></tr>'}</table></div>`; }
function dayRows(n) { const rows = []; for (let i = 0; i < n; i++) { const d = new Date(), a = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i).getTime(), nx = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i + 1).getTime(); rows.push({a, ...stats(sess(a, nx))}); } return rows; }
let rp = {m: 'day', o: 0, scope: 'all', _s0: 0};
const fmtD = t => new Date(t).toLocaleDateString(undefined, {day: 'numeric', month: 'short'});
function rep() {
  const td = today(), d = new Date(td), study = rp.scope === 'study'; let s0, n, step, lab;
  if (rp.m === 'day') { s0 = new Date(d.getFullYear(), d.getMonth(), d.getDate() + rp.o).getTime(); n = 24; step = HR; lab = new Date(s0).toLocaleDateString(undefined, {weekday: 'long', day: 'numeric', month: 'short', year: 'numeric'}); }
  else if (rp.m === 'week') { s0 = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7 + rp.o * 7).getTime(); n = 7; step = DAY; lab = `${fmtD(s0)} – ${fmtD(s0 + 6 * DAY)}, ${new Date(s0).getFullYear()}`; }
  else { const f = new Date(d.getFullYear(), d.getMonth() + rp.o, 1); s0 = f.getTime(); n = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate(); step = DAY; lab = f.toLocaleDateString(undefined, {month: 'long', year: 'numeric'}); }
  rp._s0 = s0; const end = s0 + n * step, B = [...Array(n)].map(() => ({})), T = {}, AK = C.areas.map(a => 'a:' + a.id), CK = {s: 'var(--ac)', n: '#F43F5E', o: '#475569'}; C.areas.forEach(a => { CK['a:' + a.id] = a.color; }); let sp = 0, np = 0, cnt = 0;
  const addB = (a, b, k) => { const i0 = Math.max(0, Math.floor((a - s0) / step)), i1 = Math.min(n - 1, Math.floor((b - 1 - s0) / step)); for (let i = i0; i <= i1; i++) { const x = s0 + i * step; B[i][k] = (B[i][k] || 0) + Math.max(0, Math.min(b, x + step) - Math.max(a, x)) / HR; } };
  const addT = (key, t, k, a, b) => { const h = Math.max(0, Math.min(b, end) - Math.max(a, s0)) / HR; (T[key] = T[key] || {t, k, h: 0}).h += h; };
  if (!study) sess(s0, end).forEach(x => { const c = bk(x), w = c === 'f' || c === 'm', ar = w ? areaOf(x) : null, k = w ? (ar ? 'a:' + ar.id : 's') : c === 'b' ? 'n' : 'o'; addB(x.start, x.end, k); addT(rk(x), sk(x), k, x.start, x.end); if (k === 'n') np += dur(x); else if (k !== 'o') sp += dur(x); });
  ents(s0, end).forEach(e => { const id = e.area || (e.kind === 's' ? 'study' : ''), k = 'a:' + id;
    if (e.kind === 's' || (!study && e.kind === 'f' && id)) { const kk = AK.includes(k) ? k : 'a:study'; addB(e.start, e.end, kk); addT('e:' + (e.task || 'Session'), e.task || 'Session', kk, e.start, e.end); sp += dur(e); cnt++; }
    else if (!study && e.kind === 'x') { addB(e.start, e.end, 's'); addT('e:' + (e.task || 'Workout'), e.task || 'Workout', 's', e.start, e.end); sp += dur(e); cnt++; } });
  const PH = Math.max(.05, (Math.min(Date.now(), end) - s0) / HR), pcs = h => Math.min(100, Math.round(h / PH * 100)) + '%', sum = k => B.reduce((a, b) => a + (b[k] || 0), 0), tot = b => Object.values(b).reduce((x, y) => x + y, 0), mx = Math.max(...B.map(tot), .01), ORD = ['s', ...AK, 'n', 'o'];
  const fl = i => rp.m === 'day' ? (i % 3 ? '' : i + 'h') : rp.m === 'week' ? new Date(s0 + i * DAY).toLocaleDateString(undefined, {weekday: 'short'}) : i + 1;
  const bars = B.map((b, i) => { const tt = tot(b), pc = Math.min(100, Math.round(tt / (step / HR) * 100));
    return `<div class="bc ${rp.m !== 'day' && s0 + i * DAY === td ? 't' : ''}" data-a="rpd" data-p="${i}" title="${pc}%">${tt && n < 9 ? `<em>${pc}%</em>` : '<em></em>'}${tt <= 0 ? '<div class="st z"></div>' : `<div class="st" style="height:${Math.max(6, tt / mx * 190)}px">${ORD.map(k => `<i style="height:${(b[k] || 0) / tt * 100}%;background:${CK[k]}"></i>`).join('')}</div>`}<span>${fl(i)}</span></div>`; }).join('');
  const rows = Object.values(T).filter(x => x.h > 0).sort((a, b) => b.h - a.h), mt = rows.length ? rows[0].h : 1;
  const rh = rows.slice(0, 25).map(x => `<div class="tr"><i class="dot" style="background:${CK[x.k]}"></i><b>${esc(x.t)}</b><em style="color:${CK[x.k]}">${pcs(x.h)}</em><div class="tb"><i style="width:${x.h / mt * 100}%;background:${CK[x.k]}"></i></div></div>`).join('');
  const sa = ['s', ...AK].reduce((t, k) => t + sum(k), 0), na = sum('n'), wk = ents(s0, end).filter(e => e.kind === 'x' && e.items), exT = {}; wk.forEach(e => Object.entries(e.items).forEach(([k, v]) => exT[k] = (exT[k] || 0) + v));
  const areaSpans = C.areas.map(a => `<span>${esc(a.name)} <b style="color:${a.color}">${pcs(sum('a:' + a.id))}</b></span>`).join('');
  return `<div class="rtop"><div class="seg"><button data-v="cal">Calendar</button><button data-v="rep" class="on">Report</button></div><div class="seg">${[['all', 'All activity'], ['study', 'Study timer only']].map(x => `<button data-a="rps" data-p="${x[0]}" class="${rp.scope === x[0] ? 'on' : ''}">${x[1]}</button>`).join('')}</div><div class="seg">${['day', 'week', 'month'].map(m => `<button data-a="rpm" data-p="${m}" class="${rp.m === m ? 'on' : ''}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div><div class="flex"><button class="btn alt" data-a="csv2">Entries CSV</button><button class="btn alt" data-a="csv">Daily CSV</button></div></div>
  <div class="rnav"><button class="btn alt" data-a="rpn" data-p="-1">‹</button><b>${lab}</b><button class="btn alt" data-a="rpn" data-p="1">›</button></div>
  <div class="card"><p class="lab">${study ? 'Study sessions (% of period)' : 'Total signal time (% of period)'}</p><div class="bigr">${pcs(sa)}<small>${cnt} sessions</small></div>
  <div class="mini">${study ? `<span>${ents(s0, end).filter(e => e.pomo).length} pomodoros finished</span>${areaSpans}<span>+${Math.round(sp)} S</span>` : `<span>Noise <b style="color:#F43F5E">${pcs(na)}</b></span><span>Signal share <b>${sa + na ? Math.round(sa / (sa + na) * 100) + '%' : '—'}</b></span>${areaSpans}<span>Other <b>${pcs(sum('o'))}</b></span><span>+${Math.round(sp)} S · +${Math.round(np)} N</span>`}</div>
  <div class="bars ${n > 8 ? 'dense' : ''}">${bars}</div><p class="hint">${rp.m === 'day' ? '<a data-a="repcal">Open this day in the calendar</a>' : 'Click a day to open it'}</p></div>
  <div class="card"><p class="lab">By task</p>${rh || '<p class="sm">No logs in this period.</p>'}</div>${Object.keys(exT).length ? `<div class="card"><p class="lab">Workout totals</p>${Object.entries(exT).map(([k, v]) => `<div class="leg"><span>${esc(k)}</span><b class="mono">${v}</b></div>`).join('')}</div>` : ''}`;
}
function prod() { const [a, b] = range(), L = sess(a, b), st = stats(L), hrs = Array(24).fill(0); L.filter(s => bk(s) === 'f').forEach(s => hrs[new Date(s.start).getHours()] += dur(s));
  const mx = Math.max(1, ...hrs), tr = st.f + st.m + st.b + st.o, score = st.f + st.m + st.b ? Math.round((st.f + st.m) / (st.f + st.m + st.b) * 100) : 0, fs = ents(a, b).filter(e => e.pomo).length; const dw = deepWork(L), spH = dw.sw / Math.max(1, tr / 60), fscore = tr ? Math.round(Math.min(100, (st.f + st.m ? dw.deep / (st.f + st.m) : 0) * 60 + Math.max(0, 1 - spH / 40) * 40)) : 0;
  return `<div class="grid4"><div class="card"><div class="sm">Focus score</div><div class="big">${fscore}</div><div class="sm">deep work + few switches</div></div><div class="card"><div class="sm">Deep work (25+ min)</div><div class="big">${fm(dw.deep)}</div></div><div class="card"><div class="sm">Longest focus streak</div><div class="big">${fm(dw.longest)}</div></div><div class="card"><div class="sm">Context switches</div><div class="big">${dw.sw}</div><div class="sm">${spH.toFixed(1)} per hour</div></div></div><div class="grid4"><div class="card"><div class="sm">Productivity score</div><div class="big">${score}%</div></div><div class="card"><div class="sm">Focus time</div><div class="big">${fm(st.f)}</div></div><div class="card"><div class="sm">Focus sessions</div><div class="big">${fs}</div></div><div class="card"><div class="sm">Tracked</div><div class="big">${fm(tr)}</div></div></div>
  <div class="card"><h3>Focus by hour of day</h3><div class="flex" style="align-items:flex-end;height:150px;gap:4px;flex-wrap:nowrap">${hrs.map((m, h) => `<div style="flex:1;text-align:center"><div title="${fm(m)}" style="height:${m / mx * 110}px;background:var(--ac);border-radius:3px 3px 0 0"></div><div class="sm">${h}</div></div>`).join('')}</div></div>
  <div class="grid2"><div class="card"><h3>Top distractions</h3>${bars(tops(L, s => sk(s), s => bk(s) === 'b').map(x => [x.k, x.min, '#dc2626']))}</div><div class="card"><h3>Top focus items</h3>${bars(tops(L, s => sk(s), s => bk(s) === 'f').map(x => [x.k, x.min, '#16a34a']))}</div></div>`; }
function set() { const VK = Object.keys(C.v);
  const autoCard = `<div class="card"><div class="sw ${AUTO ? 'on' : ''}" style="border:0;padding:0" data-a="autotog"><i></i><div><b>Start automatically when the phone starts</b><div class="sm">Runs quietly in the background (a small notification stays) and keeps tracking. Turn off any time.</div></div></div><div class="sw ${AUTOOPEN ? 'on' : ''}" style="border:0;padding:0;margin-top:10px" data-a="autoopentog"><i></i><div><b>Open Buddy's window when the PC starts</b><div class="sm">After you log in, Buddy pops up by itself for the daily check-in.</div></div></div></div>`;
  return autoCard + `<div class="card" style="border-color:var(--r)"><h3>🚫 Always unproductive – sites &amp; apps</h3><div class="sm" style="margin-bottom:6px">Anything whose site, app or channel name contains one of these words is counted as a distraction, always, even if you marked it productive before. Example: instagram, netflix, reddit.</div>${(C.blk || []).map((k, i) => `<span class="chip">${esc(k)}<b data-a="rmb" data-p="${i}">×</b></span>`).join('') || '<span class="sm">None yet</span>'}<div class="flex" style="margin-top:8px"><input id="nb" placeholder="e.g. instagram"><button class="btn" data-a="addb">🚫 Block</button></div></div><div class="card"><h3>⚠️ Distraction keywords – YouTube titles &amp; AI chats</h3><div class="sm" style="margin-bottom:6px">If a YouTube video title or an AI chat (Claude, ChatGPT, Gemini…) has one of these words, that time is NOT productive. Example: funny, prank, gameplay.</div>${(C.kwb || []).map((k, i) => `<span class="chip">${esc(k)}<b data-a="rmd" data-p="${i}">×</b></span>`).join('') || '<span class="sm">None yet</span>'}<div class="flex" style="margin-top:8px"><input id="nd" placeholder="e.g. gameplay"><button class="btn" data-a="addd">➕ Add</button></div></div><div class="card"><h3>✅ Productive keywords – YouTube titles &amp; AI chats</h3><div class="sm" style="margin-bottom:6px">A title with one of these words counts as productive (distraction words win if both match). Example: chemistry, derivation, python.</div>${(C.kw || []).map((k, i) => `<span class="chip">${esc(k)}<b data-a="rm" data-p="${i}">×</b></span>`).join('') || '<span class="sm">None yet</span>'}<div class="flex" style="margin-top:8px"><input id="nk" placeholder="e.g. tutorial"><button class="btn" data-a="addk">➕ Add</button></div></div>
  <div class="grid2"><div class="card"><h3>Daily work target (hours)</h3><input id="tg" type="number" min="1" max="16" value="${C.target}"></div><div class="card"><h3>Pause tracking after idle (minutes)</h3><input id="idl" type="number" min="1" max="60" value="${C.idle / 60}"></div></div><div class="grid2"><div class="card"><h3>Pause tracking – default length when you press Pause (minutes, 0 = until I resume)</h3><input id="pau" type="number" min="0" max="480" value="${C.pauseMin ?? 30}"></div><div class="card"><h3>Off-task alert after (minutes of non-productive activity, 0 = off)</h3><input id="off" type="number" min="0" max="240" value="${C.offtaskMin ?? 15}"><div class="sm" style="margin-top:6px">Shows a window and a Windows notification, even when this dashboard is closed. Focus timers and breaks don't trigger it.</div></div></div><div class="card" style="border-color:var(--ac)"><h3>🔒 Strict mode – break tokens</h3><div class="sm" style="margin-bottom:8px">Study to earn tokens: every time you finish the productive minutes below you win break minutes. Distractions spend them while Buddy only watches. At zero tokens Buddy interrupts and freezes your screen. (Replaces the regular freeze and off-task alerts while tokens last.)</div><div class="sw"><input type="checkbox" id="stm" ${(C.strict || {}).on ? "checked" : ""}><span>Strict mode on</span></div><div class="grid2"><div><b>Productive minutes per token</b><input id="ste" type="number" min="1" max="240" value="${(C.strict || {}).earn ?? 30}"></div><div><b>Break minutes you win</b><input id="stg" type="number" min="0" max="120" value="${(C.strict || {}).give ?? 15}"></div><div><b>Most tokens you can bank (minutes)</b><input id="stc" type="number" min="0" max="600" value="${(C.strict || {}).cap ?? 120}"></div><div><b>Lock-out freeze (seconds)</b><input id="stl" type="number" min="5" max="120" value="${(C.strict || {}).lock ?? 15}"></div></div></div><div class="card" style="border-color:var(--r)"><h3>🛑 Distraction freeze</h3><div class="sm" style="margin-bottom:8px">While you stay on a site, app or video you marked unproductive, Buddy covers the whole screen with a countdown card, then closes it by itself. Everything is frozen until it ends.</div><div class="grid2"><div><b>Every (minutes on that site, 0 = off)</b><input id="frz" type="number" min="0" max="120" value="${C.freezeMin ?? 5}"></div><div><b>Freeze for (seconds, 1–60)</b><input id="frs" type="number" min="1" max="60" value="${C.freezeSec ?? 5}"></div></div></div><div class="card"><h3>YouTube Shorts: videos watched for this many seconds or less (or tagged #shorts) count as noise – 0 turns it off</h3><input id="shs" type="number" min="0" max="300" value="${SH()}"></div>
  <div class="grid2"><div class="card"><h3>Break reminder after (minutes of unbroken work, 0 = off). Buddy only reminds while you are really working, never during a timer or when idle, and comes back later if you ignore it</h3><input id="brk" type="number" min="0" max="240" value="${C.breakMin ?? 50}"></div><div class="card"><h3>Calendar link (Google / Outlook iCal address)</h3><div class="flex" style="flex-wrap:nowrap"><input id="icu" placeholder="https://calendar.google.com/…/basic.ics" value="${esc(C.icsUrl || '')}" style="flex:1"><button class="btn alt" data-a="sync">Sync</button></div></div></div><div class="card"><h3>Your reviews (${VK.length}) – click ✕ to undo</h3>${VK.slice(0, 80).map((k, i) => `<span class="chip"><i class="dot" style="background:${BC[C.v[k] === 'p' ? 'f' : C.v[k] === 'u' ? 'b' : C.v[k]] || '#888'}"></i>${esc(k.replace(/^(yt|web|app):/, ''))}<b data-a="unv" data-p="${i}">×</b></span>`).join('') || '<div class="sm">None yet.</div>'}</div>`; }
const V = {dash, cal, timer, act: () => act(), yt: () => act('yt'), proj: projV, area: areasV, exam: examsV, cli: cliV, task: taskV, over, prof, rep, prod, set, priv: privV};

// ---------- summary panel ----------
function donut(it) { const tot = it.reduce((t, i) => t + i[1], 0) || 1, R = 42, Cc = 2 * Math.PI * R; let off = 0;
  const ring = it.map(i => { const l = i[1] / tot * Cc, e = `<circle r="${R}" cx="55" cy="55" fill="none" stroke="${i[2]}" stroke-width="14" stroke-dasharray="${l} ${Cc - l}" stroke-dashoffset="${-off}" transform="rotate(-90 55 55)"/>`; off += l; return e; }).join('');
  return `<div class="flex" style="flex-wrap:nowrap"><svg width="110" height="110">${ring || '<circle r="42" cx="55" cy="55" fill="none" stroke="#2a2a33" stroke-width="14"/>'}</svg><div style="flex:1;min-width:0">${it.slice(0, 4).map(i => `<div class="leg"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><i class="dot" style="background:${i[2]}"></i>${esc(i[0])}</span><span>${fm(i[1])}</span></div>`).join('') || '<div class="sm">No data yet</div>'}</div></div>`; }
function sumHTML() {
  const [a, b] = range(), L = sess(a, b), st = stats(L), w = st.f + st.m, days = {day: 1, week: 5, month: 22, year: 260}[mode], tr = st.f + st.m + st.b + st.o, tt = tr || 1, m = byProj(a, b); let it;
  if (sumTab === 'task') { const t = {}; ents(a, b).forEach(e => t[e.task || '(no task)'] = (t[e.task || '(no task)'] || 0) + dur(e)); it = Object.entries(t).map(([k, v], i) => [k, v, PAL[i % 8]]); }
  else if (sumTab === 'client') { const t = {}; Object.entries(m).forEach(([k, v]) => { const n = k === '_' ? 'Unassigned' : cOf(pOf(k)?.client)?.name || 'No client'; t[n] = (t[n] || 0) + v; }); it = Object.entries(t).map(([k, v], i) => [k, v, k === 'Unassigned' ? '#64748B' : PAL[i % 8]]); }
  else it = Object.entries(m).map(([k, v]) => [pOf(k)?.name || 'Unassigned', v, pOf(k)?.color || '#64748B']);
  it.sort((x, y) => y[1] - x[1]); const mt = ['f', 'm', 'b', 'o'].map(k => [CN[k] + (k === 'o' ? 's' : k === 'm' ? 's' : k === 'b' ? 's' : ''), st[k], BC[k]]);
  return `<div class="card" style="background:#0a0a0a"><div class="flex" style="justify-content:space-between"><b>Level ${G.L}</b><span class="sm">🔥 ${G.st} day streak</span></div><div class="bar" style="margin-top:6px"><i style="width:${G.rem / G.need * 100}%;background:linear-gradient(90deg,#6366F1,#3B82F6)"></i></div><div class="sm">${G.rem} / ${G.need} XP</div></div>
  <div class="grid2"><div class="card"><div class="sm">Work hours</div><div class="big">${fm(w)}</div></div><div class="card"><div class="sm">Percent of target</div><div class="big">${Math.round(w / (C.target * 60 * days) * 100)}%</div><div class="sm">of ${C.target * days}h</div></div></div>
  <div class="tabs">${[['task', 'Tasks'], ['proj', 'Projects'], ['client', 'Clients']].map(t => `<button class="${sumTab === t[0] ? 'on' : ''}" data-a="stab" data-p="${t[0]}">${t[1]}</button>`).join('')}</div><div class="card">${donut(it)}</div>
  <div class="grid2"><div class="card"><div class="sm">Percent of tracked</div><div class="big">${(w / tt * 100).toFixed(1)}%</div></div><div class="card"><div class="sm">Focus time</div><div class="big">${fm(st.f)}</div></div></div>
  <div class="card"><h3>Productivity metrics · ${fm(tr)}</h3><div class="bar">${mt.map(i => `<div style="width:${i[1] / tt * 100}%;background:${i[2]}"></div>`).join('')}</div><div class="grid2" style="margin-top:8px">${mt.map(i => `<div class="sm"><i class="dot" style="background:${i[2]}"></i>${i[0]}<br>${fm(i[1])}</div>`).join('')}</div></div>`;
}

// ---------- review banner ----------
function askBar() {
  const pe = pending(), k = asking || pe[0]?.k; if (!k) return '';
  if (step === 1) return `<div class="ask"><div class="t">✅ Which word in “${esc(lbl(k))}” shows it’s productive? (optional – future videos with it become Focus)</div><input id="kwi" placeholder="e.g. tutorial"><button class="btn" data-a="kws">Save keyword</button><button class="btn alt" data-a="kwx">Skip</button></div>`;
  return `<div class="ask"><div class="t">❓ What is <b>“${esc(lbl(k))}”</b> (${kindOf(k)})? ${pe.length > 1 && !asking ? `<span class="sm">· ${pe.length - 1} more</span>` : ''}</div>${['f', 'm', 'b', 'o'].map(c => `<button class="btn ${c === 'f' ? '' : 'alt'}" data-a="bc" data-p="${c}">${CN[c]}</button>`).join('')}${asking ? '' : '<button class="btn alt" data-a="flt" data-p="new">Review all</button>'}</div>`;
}

// ---------- actions ----------
const val = id => $(id).value.trim(), go = () => { anim = true; scrollPend = true; };
const A = {
  buddy: () => rz('/api/buddy/open'),
  aiwin: () => rz('/api/ai/launcher'),
  mini: () => { view = 'timer'; go(); }, today: () => { day = today(); go(); },
  nv: p => { const d = new Date(day), n = +p; if (mode === 'day') d.setDate(d.getDate() + n); else if (mode === 'week') d.setDate(d.getDate() + (ZL[zl].d < 7 ? ZL[zl].d : 7) * n); else if (mode === 'month') d.setMonth(d.getMonth() + n); else d.setFullYear(d.getFullYear() + n); day = d.setHours(0, 0, 0, 0); go(); },
  goday: p => { day = +p; mode = 'day'; view = 'cal'; go(); }, stab: p => { sumTab = p; anim = true; }, zoom: p => zoom(+p),
  ask: p => { asking = p; step = 0; }, flt: p => { flt = p; view = 'act'; asking = null; go(); },
  ytmark: async p => { const [i, c] = p.split(','), k = YQ[+i]; if (!k) return; C.v[k] = c; await save(); toast(`“${lbl(k)}” → ${c === 'f' ? 'Productive' : 'Unproductive'} · YouTube focus ${ytFocus()}%`); },
  setcat: async p => { const [i, c] = p.split(','), k = QL[+i]; C.v[k] = c; await save(); toast(`“${lbl(k)}” → ${CN[c]} · YouTube focus ${ytFocus()}%`); if (k.startsWith('yt:') && c === 'f') { asking = k; step = 1; } },
  bc: async c => { const k = asking || pending()[0]?.k; if (!k) return; C.v[k] = c; await save(); if (k.startsWith('yt:') && c === 'f') { asking = k; step = 1; } else { asking = null; toast(`Saved: ${CN[c]} · YouTube focus ${ytFocus()}%`); } },
  kws: async () => { const w = val('kwi').toLowerCase(); if (w && !C.kw.includes(w)) C.kw.push(w); asking = null; step = 0; await save(); }, kwx: () => { asking = null; step = 0; },
  rm: async p => { C.kw.splice(+p, 1); CM = {}; await save(); }, rmb: async p => { C.blk.splice(+p, 1); CM = {}; await save(); }, rmd: async p => { C.kwb.splice(+p, 1); CM = {}; await save(); },
  addb: async () => { const w = val('nb').toLowerCase().trim(); C.blk = C.blk || []; if (w && !C.blk.includes(w)) { C.blk.push(w); CM = {}; await save(); toast('🚫 ' + w + ' is now always unproductive'); } },
  addd: async () => { const w = val('nd').toLowerCase().trim(); C.kwb = C.kwb || []; if (w && !C.kwb.includes(w)) { C.kwb.push(w); CM = {}; await save(); toast('⚠️ Titles with “' + w + '” are now not productive'); } }, addk: async () => { const w = val('nk').toLowerCase().trim(); if (w && !C.kw.includes(w)) { C.kw.push(w); CM = {}; await save(); } },
  pvt: p => { PS.t = p; PS.sel.clear(); PS.built = false; }, pvr: p => { PS.r = p; PS.sel.clear(); PS.built = false; }, pvs: p => { PS.sort = p; PS.built = false; },
  pvsel: p => { const k = PS.groups[+p].k; PS.sel.has(k) ? PS.sel.delete(k) : PS.sel.add(k); },
  pvall: () => { PS.sel = PS.sel.size === PS.groups.length ? new Set() : new Set(PS.groups.map(g => g.k)); }, pvclr: () => PS.sel.clear(),
  pvopen: p => { const k = PS.groups[+p].k; PS.open.has(k) ? PS.open.delete(k) : PS.open.add(k); },
  pvtog: async p => { const P = pvget(); P[p] = !P[p]; C.privacy = P; await save(); },
  rmblock: async p => { const P = pvget(); P.block.splice(+p, 1); C.privacy = P; await save(); },
  pvdel: p => pvAsk([PS.groups[+p]]),
  pvdelt: p => { const [i, j] = p.split(',').map(Number), g = PS.groups[i], t = g.T[j]; pvAsk([{k: g.k, ty: g.ty, name: t.title || g.name, ids: t.ids}]); },
  pvdelsel: () => pvAsk(PS.groups.filter(g => PS.sel.has(g.k))), pvblocksel: () => pvAsk(PS.groups.filter(g => PS.sel.has(g.k)), true), pvdelall: () => pvAsk(PS.groups),
  pvgo: async () => { const P = PEND; closeModal(); if (!P) return; const r = await api.purge({ids: P.ids, keys: P.keys}); await pvSync(); if (P.block.length) { const B = pvget(); P.block.forEach(w => { if (!B.block.includes(w)) B.block.push(w); }); C.privacy = B; await save(); } PEND = null; PS.sel.clear(); PS.built = false; await refresh(); toast(`Deleted ${r.removed} record${r.removed === 1 ? '' : 's'}`); },
  addblock: async () => { const w = ($('pv_b')?.value || '').trim().toLowerCase(); if (!w) return; const P = pvget(); if (P.block.includes(w)) return toast('Already blocked'); P.block.push(w); C.privacy = P; await save(); const n = S.filter(s => `${s.app} ${s.title}`.toLowerCase().includes(w)).length; PS.built = false; if (!n) return toast(`“${w}” will no longer be recorded`); PMATCH = w; $('modal').innerHTML = `<div class="mbox" style="width:410px"><h3>“${esc(w)}” is blocked</h3><p class="sm">It won't be recorded from now on. There are also <b>${n}</b> older record${n === 1 ? '' : 's'} that match – delete them too?</p><div class="flex" style="justify-content:flex-end;margin-top:14px"><button class="btn alt" data-a="mcancel">Keep them</button><button class="btn dng" data-a="pvgom">Delete them</button></div></div>`; $('modal').classList.add('on'); },
  pvgom: async () => { closeModal(); const r = await api.purge({match: PMATCH}); await pvSync(); PS.built = false; await refresh(); toast(`Deleted ${r.removed} record${r.removed === 1 ? '' : 's'}`); },
  autoopentog: async () => { try { const r = await api.setAutoOpen(!AUTOOPEN); AUTOOPEN = r.on; toast(AUTOOPEN ? 'Buddy will open when the PC starts' : 'Buddy will start quietly in the tray'); render && render(); } catch (e) { toast('Could not change this'); } },
  autotog: async () => { try { const r = await api.setAuto(!AUTO); AUTO = r.on; toast(r.ok ? (AUTO ? 'Will start when you log in' : 'Auto-start turned off') : 'Could not change auto-start'); } catch (e) { toast('Could not change auto-start'); } },
  unv: async p => { delete C.v[Object.keys(C.v)[+p]]; await save(); },
  addproj: async () => { if (!val('pn')) return; C.projects.push({id: uid(), name: val('pn'), client: $('pc').value, rate: val('pr'), kw: val('pk'), color: PAL[C.projects.length % 8]}); await save(); toast('Project added'); },
  delproj: async p => { C.projects = C.projects.filter(x => x.id != p); await save(); },
  addcli: async () => { if (!val('cn')) return; C.clients.push({id: uid(), name: val('cn'), rate: val('cr')}); await save(); toast('Client added'); },
  delcli: async p => { C.clients = C.clients.filter(x => x.id != p); await save(); },
  addtask: async () => { if (!val('tn')) return; const e = +val('te') || 0; C.tasks.push({id: uid(), title: val('tn'), project: $('tp').value, done: false, scope: 'week', dl: loc(Date.now() + 7 * DAY).slice(0, 16), p: 0, ...(e ? {est: e} : {}), ...($('tch').value.startsWith('e:') ? {exam: +$('tch').value.slice(2) || $('tch').value.slice(2)} : $('tch').value ? {chap: +$('tch').value || $('tch').value} : {})}); await save(); },
  deltask: async p => { C.tasks = C.tasks.filter(x => x.id != p); await save(); },
  donetask: async p => { const t = C.tasks.find(x => x.id == p); t.done = !t.done; if (t.done) { t.pBefore = t.p || 0; t.p = 100; t.doneDay = new Date().toISOString().slice(0, 10); } else { t.p = t.pBefore || 0; delete t.pBefore; t.doneDay = ''; t._p = null; } await save(); },
  starttask: async p => { const t = C.tasks.find(x => x.id == p), q = pm(); if (q.running) return toast('Pause or stop the timer first'); q.act = 'prod'; q.task = t.title; q.project = t.project; q.mode = 'focus'; q.rem = PD('focus'); view = 'timer'; go(); await save(); },
  pmmode: async p => { const q = pm(); if (q.running) return toast('Pause or stop the timer first'); q.mode = p; q.rem = PD(p); await save(); },
  pmtoggle: async () => { pm().running ? await pmPause() : await pmStart(); }, pmskip: async () => { await pmSkip(); }, pmstop: async () => { await pmStop(); }, pmgo2: async () => { closeModal(); await pmStart(); },
  pmcfg: () => { const c = pm().cfg; $('modal').innerHTML = `<div class="mbox"><h3>Timer settings</h3>${[['f', 'Focus (minutes)', 'focus'], ['s', 'Short break (minutes)', 'short'], ['l', 'Long break (minutes)', 'long'], ['n', 'Long break after how many pomodoros', 'every'], ['g', 'Daily pomodoro goal', 'goal']].map(x => `<label>${x[1]}<input id="pc_${x[0]}" type="number" min="1" value="${c[x[2]]}"></label>`).join('')}<div class="flex" style="justify-content:flex-end;margin-top:12px"><button class="btn alt" data-a="mcancel">Cancel</button><button class="btn" data-a="pmcsave">Save</button></div></div>`; $('modal').classList.add('on'); },
  pmcsave: async () => { const c = pm().cfg, g = id => Math.max(1, +$(id).value || 1); c.focus = g('pc_f'); c.short = g('pc_s'); c.long = g('pc_l'); c.every = g('pc_n'); c.goal = g('pc_g'); if (!pm().running) pm().rem = PD(pm().mode); closeModal(); await save(); },
  wsave: async () => { const e = C.entries.find(x => x.id == ME); if (!e) return; const it = {}; EX.forEach((x, i) => { const q = +$('wx' + i).value; if (q > 0) it[x[0]] = q; }); if (!Object.keys(it).length) return toast('Add at least one exercise'); e.items = it; e.pts = Math.round(EX.reduce((t, x) => t + (it[x[0]] || 0) * x[2], 0)); closeModal(); await save(); toast(`Workout saved +${e.pts} pts`); },
  newentry: () => { const n = Date.now(); openModal(null, n - HR, n); }, editentry: p => openModal(C.entries.find(x => x.id == p)),
  msave: async () => { const s = new Date($('ms').value).getTime(), e = new Date($('me').value).getTime(); if (!(e > s)) return toast('End must be after start');
    const v = {task: val('mt'), project: $('mp').value, kind: $('mk').value, area: $('ma').value, note: val('mn'), start: s, end: e}; if (ME) Object.assign(C.entries.find(x => x.id == ME), v); else C.entries.push({id: uid(), ...v}); closeModal(); await save(); toast('Saved'); },
  mdel: async () => { C.entries = C.entries.filter(x => x.id != ME); closeModal(); await save(); toast('Deleted'); }, mcancel: () => closeModal(),
  rpm: p => { rp.m = p; rp.o = 0; anim = true; }, rps: p => { rp.scope = p; }, rpn: p => { rp.o += +p; },
  rpd: p => { if (rp.m === 'day') return; rp.o = Math.round((rp._s0 + (+p) * DAY - today()) / DAY); rp.m = 'day'; anim = true; }, repcal: () => { day = rp._s0; mode = 'day'; view = 'cal'; go(); },
  addarea: async () => { const n = val('an'); if (!n) return; C.areas.push({id: 'a' + uid(), name: n, color: $('acol').value, kw: val('ak')}); await save(); toast('Area added'); },
  delarea: async p => { C.areas = C.areas.filter(a => a.id !== p); Object.keys(C.va).forEach(k => { const l = vl(C.va[k]); if (!l.includes(p)) return; const r = l.filter(x => x !== p); if (r.length) C.va[k] = r.length === 1 ? r[0] : r; else delete C.va[k]; }); await save(); },
  editarea: p => { const a = aOf(p); form('Edit area', [{k: 'name', l: 'Name', v: a.name}, {k: 'color', l: 'Colour', t: 'color', v: a.color}, {k: 'kw', l: 'Auto keywords (comma separated)', v: a.kw || ''}], v => { if (!v.name) return false; Object.assign(a, {name: v.name, color: v.color, kw: v.kw}); }); },
  refadd: p => { const t = refTarget(p); if (!t) return; form('Add keywords', [{k: 'w', l: 'Words that mean "' + t.name + '" (separate several with commas)', v: ''}, {k: 'z', l: 'e.g. optics, lens, refraction. A site, app or video whose name contains one counts for it.', t: 'note'}], v => { const L = v.w.split(',').map(x => x.trim().toLowerCase().slice(0, 30)).filter(Boolean); if (!L.length) { toast('Type at least one word'); return false; } t.refs = [...new Set([...(t.refs || []), ...L])].slice(0, 20); }); },
  refdel: async p => { const t = refTarget(p); if (!t) return; t.refs = (t.refs || []).filter(x => x !== p.split('|')[1]); await save(); },
  addexam: () => examForm(), editexam: p => examForm(C.exams.find(x => x.id == p)), gotoexam: () => { view = 'exam'; go(); },
  delexam: p => form('Delete this exam?', [{k: 'z', l: 'Its chapters and progress will be removed.', t: 'note'}], () => { C.exams = C.exams.filter(x => x.id != p); }),
  addch: p => chForm(C.exams.find(x => x.id == p)), editch: p => { const [i, c] = p.split(','), it = C.exams.find(x => x.id == i); chForm(it, it.ch.find(x => x.id == c)); },
  delch: async p => { const [i, c] = p.split(','), it = C.exams.find(x => x.id == i); it.ch = it.ch.filter(x => x.id != c); await save(); },
  fmsave: async () => { const v = {}; FM.fields.forEach(f => { if (f.t !== 'note') v[f.k] = $('f_' + f.k).value.trim(); }); if (await FM.onSave(v) === false) return; closeModal(); await save(); },
  trk: async () => { if (TRK) await trkResume(); else pauseMenu(); }, pausefor: async p => { closeModal(); await trkPause(+p); }, pip: () => popTimer(),
  gocal: () => { view = 'cal'; go(); }, inclose: () => { $('insp').classList.remove('on'); INS = null; },
  insset: async p => { const [i, c] = p.split(','), k = IK[+i]; C.v[k] = c; await save(); toast(`“${lbl(k)}” → ${CN[c]}`); },
  inslog: () => { const x = INS; $('insp').classList.remove('on'); INS = null; openModal(null, x.a, x.b, true); },
  snd: () => sound(!SND), ics: () => $('icsf').click(), sync: () => syncICS(true), print: () => window.print(),
  creport: p => { const c = cOf(p), [a, b] = range(), m = byProj(a, b), ps = C.projects.filter(x => x.client == c.id); let tot = 0, hrs = 0;
    const rows = ps.map(x => { const h = (m[x.id] || 0) / 60, r = h * rate(x); tot += r; hrs += h; return `<tr><td>${esc(x.name)}</td><td class="n">${h.toFixed(2)} h</td><td class="n">${rate(x) ? eur(rate(x)) : '—'}</td><td class="n">${eur(r)}</td></tr>`; }).join('');
    const en = ents(a, b).filter(e => ps.some(x => x.id == e.project)).sort((x, y) => x.start - y.start);
    $('modal').innerHTML = `<div class="mbox" style="width:660px;max-height:90vh;overflow:auto"><h3>${esc(c.name)} – ${label()}</h3><table><tr><th>Project</th><th class="n">Hours</th><th class="n">Rate</th><th class="n">Amount</th></tr>${rows || '<tr><td colspan="4">No projects for this client.</td></tr>'}<tr><td><b>Total</b></td><td class="n"><b>${hrs.toFixed(2)} h</b></td><td></td><td class="n"><b>${eur(tot)}</b></td></tr></table><h3 style="margin-top:14px">Time entries</h3><table>${en.map(e => `<tr><td>${new Date(e.start).toLocaleDateString()}</td><td>${esc(e.task || KN[e.kind || 'f'])}</td><td class="n">${fm(dur(e))}</td></tr>`).join('') || '<tr><td class="sm">No manual entries.</td></tr>'}</table><div class="flex noprint" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-a="print">Print / Save as PDF</button><button class="btn alt" data-a="mcancel">Close</button></div></div>`; $('modal').classList.add('on'); },
  csv2: () => { const [a, b] = range(), r = [['Date', 'Start', 'End', 'Minutes', 'Type', 'Task', 'Project', 'Client', 'Notes']]; ents(a, b).sort((x, y) => x.start - y.start).forEach(e => { const p = pOf(e.project); r.push([new Date(e.start).toISOString().slice(0, 10), tm(e.start), tm(e.end), Math.round(dur(e)), KN[e.kind || 'f'], e.task || '', p?.name || '', cOf(p?.client)?.name || '', e.note || ''].map(v => '"' + String(v).replace(/"/g, '""') + '"')); });
    const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob([r.map(x => x.join(',')).join('\n')], {type: 'text/csv'})); l.download = 'rize-entries.csv'; l.click(); },
  csv: () => { const r = [['Date', 'Work h', 'Focus h', 'Meetings h', 'Breaks h', 'Other h']]; dayRows(repDays).forEach(x => r.push([new Date(x.a).toISOString().slice(0, 10), ...[x.f + x.m, x.f, x.m, x.b, x.o].map(v => (v / 60).toFixed(2))]));
    const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob([r.map(x => x.join(',')).join('\n')], {type: 'text/csv'})); l.download = 'rize-report.csv'; l.click(); }
};
document.addEventListener('click', async e => {
  const bl = e.target.closest('.blk[data-bs]:not(.ev):not(.live), .tseg[data-bs]'); if (bl) { openInsp(+bl.dataset.bs, +bl.dataset.be, bl.dataset.t); return; }
  const n = e.target.closest('[data-v]'); if (n) { view = n.dataset.v; if (view === 'yt') flt = 'yt'; go(); render(); return; }
  const m = e.target.closest('[data-m]'); if (m) { mode = m.dataset.m; go(); render(); return; }
  if (e.target.id === 'modal') { closeModal(); return; }
  const t = e.target.closest('[data-a]'); if (!t) return; await A[t.dataset.a]?.(t.dataset.p, t); render();
});
document.addEventListener('input', e => { if (e.target.id === 'pmk') { pm().task = e.target.value; clearTimeout(window._pt); window._pt = setTimeout(save, 400); } });
document.addEventListener('change', async e => { const id = e.target.id; if (e.target.type === 'range') { await save(); return; } if (id.startsWith('ar_')) { const k = QL[+id.slice(3)], v = e.target.value; if (v === '') return; if (v === '~') delete C.va[k]; else if (v === '-') C.va[k] = ''; else { const l = vl(C.va[k]); if (!l.includes(v)) l.push(v); C.va[k] = l.length === 1 ? l[0] : l; } CM = {}; render(); saveBg(); return; } if (id === 'pmar') { pm().area = e.target.value; await save(); return; } if (id === 'pml') { pm().link = e.target.value; await save(); return; } if (id === 'pma') { pm().act = e.target.value; await save(); render(); return; } if (id === 'pmp') { pm().project = e.target.value; await save(); return; } if (id === 'tg') C.target = +e.target.value || 6; else if (id === 'brk') C.breakMin = Math.max(0, +e.target.value || 0); else if (id === 'icu') C.icsUrl = e.target.value.trim(); else if (id === 'icsf') { const f = e.target.files[0]; if (f) { const n = importICS(await f.text()); await save(); toast(`Imported ${n} event${n === 1 ? '' : 's'}`); await refresh(); } return; } else if (id === 'idl') C.idle = (+e.target.value || 2) * 60; else if (id === 'rd') repDays = +e.target.value; else if (id === 'pau') C.pauseMin = Math.max(0, +e.target.value || 0); else if (id === 'off') C.offtaskMin = Math.max(0, +e.target.value || 0); if (id === 'stm') { C.strict = {...(C.strict || {})}; C.strict.on = e.target.checked; } if (['ste', 'stg', 'stc', 'stl'].includes(id)) { C.strict = {on: false, earn: 30, give: 15, cap: 120, lock: 15, ...(C.strict || {})}; const v = Math.max(+e.target.min, Math.min(+e.target.max, +e.target.value || 0)); C.strict[{ste: 'earn', stg: 'give', stc: 'cap', stl: 'lock'}[id]] = v; }
  if (id === 'frz') C.freezeMin = Math.max(0, Math.min(120, +e.target.value || 0)); if (id === 'frs') C.freezeSec = Math.max(1, Math.min(60, Math.round(+e.target.value) || 5)); else if (id === 'shs') C.shortSec = Math.max(0, +e.target.value || 0); else return; await save(); id === 'shs' ? await refresh() : render(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); $('insp').classList.remove('on'); INS = null; return; } if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || $('modal').classList.contains('on')) return;
  const k = e.key.toLowerCase(), md = {d: 'day', w: 'week', m: 'month', y: 'year'};
  if (k === 'n') { e.preventDefault(); const n = Date.now(); openModal(null, n - HR, n); } else if (k === 't') { A.today(); render(); } else if (e.key === 'ArrowLeft') { A.nv(-1); render(); } else if (e.key === 'ArrowRight') { A.nv(1); render(); }
  else if (k === 'p') { view = 'timer'; go(); render(); } else if (e.key === ' ' && view === 'timer') { e.preventDefault(); A.pmtoggle().then(render); } else if (k === 'x') { TRK ? trkResume() : trkPause(C.pauseMin ?? 30); } else if (k === 'v') { view = view === 'cal' ? 'rep' : 'cal'; go(); render(); } else if (k === 'r') { view = 'rep'; go(); render(); } else if (md[k]) { mode = md[k]; go(); render(); } else if (e.key === '+' || e.key === '=') zoom(1); else if (e.key === '-') zoom(-1);
});

// ---------- hover popup ----------
document.addEventListener('mouseover', e => {
  const b = e.target.closest('.blk[data-bs], .tseg[data-bs]'), p = $('pop'); if (!b) { p.style.display = 'none'; return; }
  const s0 = +b.dataset.bs, s1 = +b.dataset.be, m = {}; let tot = 0;
  S.forEach(s => { const o = Math.min(s.end, s1) - Math.max(s.start, s0); if (o > 0) { const k = s.kind === 'youtube' ? 'YouTube' : s.kind === 'browser' ? sk(s) : s.app; m[k] = (m[k] || 0) + o / 6e4; tot += o / 6e4; } });
  const top = Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 3), pr = proj({app: '', title: b.dataset.t});
  p.innerHTML = `<b>${esc(b.dataset.t)}</b> <span class="sm" style="float:right">${fm((s1 - s0) / 6e4)}</span><div class="sm">${tm(s0)} – ${tm(s1)}</div>${pr ? `<p><span class="pill" style="color:${pr.color}">${esc(pr.name)}</span></p>` : ''}<div class="sm" style="margin:8px 0 4px">Apps &amp; Websites</div>${top.map(([k, v]) => `<div class="leg"><span>${Math.round(v / (tot || 1) * 100)}% &nbsp;${esc(k)}</span><span>${fm(v)}</span></div><div class="meter" style="width:${v / (tot || 1) * 100}%"></div>`).join('') || '<div class="sm">No detail</div>'}`;
  p.style.display = 'block'; const r = b.getBoundingClientRect(); p.style.left = Math.min(innerWidth - 310, Math.max(10, r.left)) + 'px'; p.style.top = Math.min(innerHeight - p.offsetHeight - 10, r.bottom + 6) + 'px';
});

// ---------- more Rize features: live calendar block, deep work, break reminders, sound, calendar sync, smart suggestions ----------
let SND = null, LC = {}, lastSync = 0;
const liveItems = (a, b) => { const p = C.pomo; if (!p || !p.running || p.seg < a || p.seg >= b) return []; return [{kind: 'live', start: p.seg, end: Math.max(Date.now(), p.seg + 6e4), t: (p.mode !== 'focus' ? 'Break' : p.act === 'exercise' ? 'Workout' : p.task || 'Focus') + ' · in progress', c: p.mode !== 'focus' ? '#94a3b8' : p.act === 'exercise' ? '#f97316' : p.act === 'study' ? '#eab308' : '#16a34a'}]; };
function deepWork(L) { const o = []; L.filter(s => bk(s) === 'f').forEach(s => { const l = o[o.length - 1]; if (l && s.start - l.end < 12e4) l.end = Math.max(l.end, s.end); else o.push({start: s.start, end: s.end}); });
  const m = o.map(x => (x.end - x.start) / 6e4); let sw = 0; L.forEach((s, i) => { if (i && s._k !== L[i - 1]._k && s.start - L[i - 1].end < 6e4) sw++; });
  return {deep: m.filter(x => x >= 25).reduce((a, b) => a + b, 0), longest: Math.max(0, ...m), sw}; }
function sound(on) { try { if (!on) { SND && SND.close(); SND = null; return; } const a = new AudioContext(), n = a.sampleRate * 2, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0); let l = 0; for (let i = 0; i < n; i++) { l = (l + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } const src = a.createBufferSource(), g = a.createGain(); src.buffer = buf; src.loop = true; g.gain.value = .35; src.connect(g); g.connect(a.destination); src.start(); SND = a; } catch (e) {} }
function topSess(a, b) { const m = {}; S.forEach(s => { const o = Math.min(s.end, b) - Math.max(s.start, a); if (o > 0 && isW(s)) (m[s._k] = m[s._k] || {s, v: 0}).v += o; }); return Object.values(m).sort((x, y) => y.v - x.v)[0]?.s; }
function suggest(a, b) { const s = topSess(a, b); if (!s) return {task: '', project: '', hint: ''}; let p = proj(s), conf = p ? 100 : 0, src = p ? 'a project keyword' : '';
  if (!p && LC[s._k]) { const e = Object.entries(LC[s._k]).sort((x, y) => y[1] - x[1]), tot = e.reduce((t, x) => t + x[1], 0); p = pOf(e[0][0]); conf = Math.round(e[0][1] / tot * 100); src = 'your past entries'; }
  return {task: sk(s), project: p?.id || '', hint: p ? `Suggested “${esc(p.name)}” from ${src} · ${conf}% confidence` : ''}; }
function buildLearn() { LC = {}; C.entries.forEach(e => { if (!e.project || e.kind === 'b') return; const s = topSess(e.start, e.end); if (s) { const m = LC[s._k] = LC[s._k] || {}; m[e.project] = (m[e.project] || 0) + 1; } }); }
function breakCheck() { return; /* moved to the tray app (buddy.break_check): works with the dashboard closed and only fires when it makes sense */ const m = C.breakMin ?? 50, p = pm(); if (!m || !S.length || (p.running && p.mode !== 'focus')) return; let i = S.length - 1; if (Date.now() - S[i].end > 18e4) return;
  while (i > 0 && S[i].start - S[i - 1].end < 18e4) i--; const st = (S[S.length - 1].end - S[i].start) / 6e4;
  if (st >= m && Date.now() - (C.lastBreakNote || 0) > 6e5) { C.lastBreakNote = Date.now(); api.setcfg(C); toast(`☕ Time for a break – ${Math.round(st)} min without a pause`); beep(); try { new Notification('Rize', {body: 'Time for a break'}); } catch (e) {} } }
function parseICS(t) { const out = [], g = (b, k) => (b.match(new RegExp('^' + k + '[^:\\r\\n]*:(.*)$', 'm')) || [])[1];
  const d = v => { const m = (v || '').trim().match(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?/); if (!m) return NaN; const a = [+m[1], m[2] - 1, +m[3], +m[4] || 0, +m[5] || 0, +m[6] || 0]; return m[7] ? Date.UTC(...a) : new Date(...a).getTime(); };
  t.replace(/\r?\n[ \t]/g, '').split('BEGIN:VEVENT').slice(1).forEach(b => { const s = d(g(b, 'DTSTART')), e = d(g(b, 'DTEND')); if (s && e > s && e - s < DAY) out.push({s, e, t: (g(b, 'SUMMARY') || 'Meeting').trim()}); }); return out; }
function importICS(t) { const lo = today() - 30 * DAY, hi = today() + 2 * DAY; let n = 0; parseICS(t).forEach(v => { const key = v.s + '|' + v.t; if (v.s < lo || v.s > hi || C.entries.some(x => x.ics === key)) return; C.entries.push({id: uid(), start: v.s, end: v.e, task: v.t, project: proj({app: '', title: v.t})?.id || '', kind: 'm', ics: key, note: ''}); n++; }); return n; }
async function syncICS(manual) { if (!C.icsUrl) return manual && toast('Add your calendar link in Settings'); lastSync = Date.now(); try { const r = await fetch('/api/ics?url=' + encodeURIComponent(C.icsUrl)); if (!r.ok) throw 0; const n = importICS(await r.text()); if (n) { await save(); await refresh(); } if (manual) toast(`Synced – ${n} new event${n === 1 ? '' : 's'}`); } catch (e) { if (manual) toast('Could not read that calendar link'); } }
const autoSync = () => { if (C.icsUrl && Date.now() - lastSync > 18e5) syncICS(); };

// ---------- Areas (custom groups, Study = default/yellow) ----------
const aOf = id => C.areas.find(a => a.id == id);
const vl = v => (Array.isArray(v) ? v : v ? [v] : []).filter(x => x && typeof x === 'string');   // Review links of one app / site / video: '' | one id | a list of ids
function areaOf(s) { const m = C.va || {}, k = s._k; if (m[k] !== undefined) return vl(m[k]).map(id => aOf(id)).find(Boolean) || null; if (k === 'yt:shorts') return null; const t = (s.app + ' ' + s.title).toLowerCase();
  const hit = C.areas.find(a => (a.kw || '').split(',').some(w => w.trim() && t.includes(w.trim().toLowerCase())) && !(a.id === 'study' && s.kind !== 'youtube' && false)); if (hit) return hit;
  return s.kind === 'youtube' && bk(s) === 'f' ? aOf('study') || null : null; }
function areaSel(x, i) { const m = C.va || {}, cur = m[x.k] === undefined ? '' : m[x.k] === '' ? '-' : m[x.k], au = areaOf(x.s);
  return `<select class="ars" id="ar_${i}" title="Area"><option value="">Auto${au ? ' · ' + esc(au.name) : ''}</option>${C.areas.map(a => `<option value="${a.id}" ${cur === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}<option value="-" ${cur === '-' ? 'selected' : ''}>No area</option></select>`; }
function areasV() { const [a, b] = range(), tot = {};
  sess(a, b).filter(isW).forEach(s => { const x = areaOf(s); if (x) tot[x.id] = (tot[x.id] || 0) + dur(s); }); ents(a, b).forEach(e => { const id = e.area || (e.kind === 's' ? 'study' : ''); if (id) tot[id] = (tot[id] || 0) + dur(e); });
  return `<div class="card"><h3>New area</h3><p class="sm" style="margin:0 0 10px">An area is a part of your life or work – Study, Coding, Fitness… Videos, apps and sites join an area automatically by keyword; you can change any of them on the Review page. Every video you mark <b>Focus</b> goes to <b>Study</b> (yellow) unless another area matches.</p><div class="flex"><input id="an" placeholder="Name"><input id="acol" type="color" value="#6366F1" style="width:46px;padding:2px;height:34px"><input id="ak" placeholder="Auto keywords (python, guitar)" style="width:280px"><button class="btn" data-a="addarea">Add</button></div></div>
  <div class="card"><h3>Areas – ${label()}</h3>${C.areas.map(x => `<div class="row"><i class="dot" style="background:${x.color}"></i><div class="t"><b>${esc(x.name)}</b>${x.id === 'study' ? ' <span class="pill">default</span>' : ''}<div class="sm">keywords: ${esc(x.kw || '—')}</div></div><b class="mono">${fm(tot[x.id] || 0)}</b><button class="x" data-a="editarea" data-p="${x.id}">✎</button>${x.id === 'study' ? '' : `<button class="x" data-a="delarea" data-p="${x.id}">✕</button>`}</div>`).join('')}</div>`; }
// ---------- generic form modal ----------
let FM = null;
function form(title, fields, onSave) { FM = {fields, onSave};
  $('modal').innerHTML = `<div class="mbox"><h3>${title}</h3>${fields.map(f => f.t === 'note' ? `<p class="sm">${f.l}</p>` : `<label>${f.l}${f.o ? `<select id="f_${f.k}">${f.o.map(o => `<option value="${o[0]}" ${String(o[0]) === String(f.v) ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>` : f.t === 'area' ? `<textarea id="f_${f.k}">${esc(f.v || '')}</textarea>` : `<input id="f_${f.k}" type="${f.t || 'text'}" value="${esc(f.v || '')}">`}</label>`).join('')}<div class="flex" style="justify-content:flex-end;margin-top:14px"><button class="btn alt" data-a="mcancel">Cancel</button><button class="btn" data-a="fmsave">Save</button></div></div>`; $('modal').classList.add('on'); setTimeout(() => document.querySelector('#modal input,#modal select')?.focus(), 50); }
// ---------- Exams (copied from SYSTEM) ----------
// Reference keywords: "this word = this exam / chapter". Sites, apps and videos containing it count for it (Review, Buddy, off-task check, Smart review).
const refsHTML = (o, ex = null) => { const w = ex == null ? 'exam' : 'chapter', id = ex == null ? o.id : ex + ',' + o.id;
  return `<div class="refs"><small class="rl">Keywords = this ${w}</small>${(o.refs || []).map(r => `<span class="ref">${esc(r)}<button class="rx" data-a="refdel" data-p="${id}|${esc(r)}" title="Remove">×</button></span>`).join('')}<button class="refadd" data-a="refadd" data-p="${id}" title="Add a keyword that means this ${w}">+</button></div>`; };
const refTarget = p => { const [a, b] = p.split('|')[0].split(','), e = C.exams.find(x => x.id == a); return e && (b ? (e.ch || []).find(c => c.id == b) : e); };
const pctEx = i => i.ch && i.ch.length ? Math.round(i.ch.reduce((a, c) => a + c.p, 0) / i.ch.length) : 0;
const dueTag = x => { if (!x.dl) return ' <small class="rt" style="color:#F59E0B">⚠ set deadline</small>'; const d = Math.ceil((new Date(x.dl + 'T23:59') - Date.now()) / DAY); return ` <small class="rt" style="${d < 0 ? 'color:var(--r)' : ''}">📅 ${d < 0 ? 'overdue' : d + 'd left'}</small>`; };
const chStudy = id => { const m = C.entries.filter(e => e.link && e.link.ch == id).reduce((a, e) => a + dur(e), 0) + (window.linkMin ? linkMin('g:chap:' + id) : 0); return m > 0 ? ` <small class="rt">⏱ ${fm(m)}</small>` : ''; };
const linkOpts = sel => '<option value="">Free study</option>' + C.exams.map(i => `<optgroup label="${esc(i.name)}"><option value="${i.id}:" ${sel === i.id + ':' ? 'selected' : ''}>${esc(i.name)} (whole exam)</option>${(i.ch || []).map(c => `<option value="${i.id}:${c.id}" ${sel === i.id + ':' + c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
const cdHTML = t => `<div class="cd" data-t="${t}">${['days', 'hrs', 'mins', 'secs'].map(u => `<div><b>00</b><small>${u}</small></div>`).join('<i>:</i>')}</div>`;
function tickCd() { document.querySelectorAll('.cd').forEach(el => { const d = Math.max(0, +el.dataset.t - Date.now()), v = [Math.floor(d / DAY), Math.floor(d % DAY / HR), Math.floor(d % HR / 6e4), Math.floor(d % 6e4 / 1e3)]; el.querySelectorAll('b').forEach((b, i) => { b.textContent = String(v[i]).padStart(2, '0'); }); el.classList.toggle('done', !d); }); }
function nextExam() { const x = [...C.exams].filter(i => new Date(i.date) > Date.now()).sort((a, b) => new Date(a.date) - new Date(b.date))[0]; return x ? `<div class="card" data-a="gotoexam" style="cursor:pointer"><div class="flex" style="justify-content:space-between"><h3 style="margin:0">🎓 Next exam – ${esc(x.name)}</h3><b class="mono">${pctEx(x)}% prepared</b></div>${cdHTML(new Date(x.date).getTime())}</div>` : ''; }
function examsV() { const list0 = window.exSort ? exSort([...C.exams]) : [...C.exams].sort((a, b) => new Date(a.date) - new Date(b.date)), list = [...list0.filter(i => new Date(i.date) > Date.now()), ...list0.filter(i => new Date(i.date) <= Date.now())], up = list.filter(i => new Date(i.date) > Date.now()).length, R = 54, Cc = 2 * Math.PI * R;
  const card = i => { const tp = pctEx(i), dt = new Date(i.date), over = dt.getTime() <= Date.now();
    return `<div class="card"><div class="flex" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap"><div><h3 style="font-size:16px;color:var(--tx);margin:0">${esc(i.name)}${over ? ' <span class="badge g">✅ Completed</span>' : window.exTag ? exTag(i) : ''}</h3><div class="sm">${dt.toLocaleString(undefined, {weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})}</div>${i.note ? `<div class="sm">🎯 ${esc(i.note)}</div>` : ''}${refsHTML(i)}</div><div style="white-space:nowrap">${window.exBtns ? exBtns(i) : ''}<button class="x" data-a="editexam" data-p="${i.id}">✎</button><button class="x" data-a="delexam" data-p="${i.id}">✕</button></div></div>${over ? '<div class="flex" style="color:var(--g);font-weight:600;margin:10px 0 4px">✅ Completed · this exam is over, no countdown</div>' : cdHTML(dt.getTime())}
    <div class="xb"><div style="position:relative;width:130px;height:130px;flex:none"><svg viewBox="0 0 130 130" width="130" height="130"><circle cx="65" cy="65" r="${R}" fill="none" stroke="#1E293B" stroke-width="12"/><circle id="xr_${i.id}" cx="65" cy="65" r="${R}" fill="none" stroke="#FBBF24" stroke-width="12" stroke-linecap="round" stroke-dasharray="${Cc}" stroke-dashoffset="${Cc * (1 - tp / 100)}" transform="rotate(-90 65 65)" style="transition:stroke-dashoffset .4s"/></svg><div style="position:absolute;inset:0;display:grid;place-content:center;text-align:center"><b class="big" id="xp_${i.id}">${tp}%</b><small class="sm">prepared</small></div></div>
    <div style="flex:1;min-width:0"><p class="lab">Chapters</p>${(i.ch || []).map(x => `<div class="chr" data-it="${i.id}" data-ch="${x.id}"><div class="flex" style="justify-content:space-between;flex-wrap:nowrap"><b style="font-weight:600">${esc(x.name)}${x.imp > 1 ? ` <small class="rt">★${x.imp}</small>` : ''}${dueTag(x)}${chStudy(x.id)}${x.autoMin ? ` <small class="rt" title="Progress follows the time you spend on this chapter (Timer + linked sites/apps), out of ${x.est} min">⏱ auto by time · ${fm(x.est)}</small>` : ''}${x.auto ? ` <small class="rt" title="Your linked tasks move this chapter forward from the value you set. Drag the slider any time to adjust it.">🔗 follows ${x.auto} task${x.auto > 1 ? 's' : ''} · drag to adjust</small>` : ''}</b><span style="white-space:nowrap"><em class="pv2" style="font-style:normal">${x.p}</em>% <button class="x" data-a="editch" data-p="${i.id},${x.id}">✎</button><button class="x" data-a="delch" data-p="${i.id},${x.id}">✕</button></span></div>${refsHTML(x, i.id)}<input type="range" min="0" max="100" value="${x.p}" style="width:100%;padding:0" aria-label="${esc(x.name)} preparation"></div>`).join('') || '<p class="sm">No chapters yet. Add the first one.</p>'}<button class="btn alt" data-a="addch" data-p="${i.id}">＋ Chapter</button></div></div></div>`; };
  return `<div class="flex" style="justify-content:space-between;margin-bottom:10px"><div class="sm">${up} upcoming · set a target and watch the clock · chapter XP = importance × % × 4</div><button class="btn" data-a="addexam">＋ Add exam</button></div>${(() => { const upL = list.filter(i => new Date(i.date) > Date.now()), doneL = list.filter(i => new Date(i.date) <= Date.now()); if (!list.length) return '<div class="card"><p class="sm">No exams yet. Add one to start the countdown.</p></div>'; return `<h2 class="lab" style="margin:14px 0 6px;font-size:15px">📚 Upcoming – not finished (${upL.length})</h2>${upL.map(card).join('') || '<div class="card"><p class="sm">No upcoming exams.</p></div>'}<h2 class="lab" style="margin:18px 0 6px;font-size:15px;color:var(--g)">✅ Completed – exam is over (${doneL.length})</h2>${doneL.map(card).join('') || '<div class="card"><p class="sm">No completed exams yet.</p></div>'}`; })()}`; }
function examForm(i) { form(i ? 'Edit exam' : 'Add exam', [{k: 'name', l: 'Exam name', v: i ? i.name : ''}, {k: 'date', l: 'Date & time', t: 'datetime-local', v: loc(i ? new Date(i.date).getTime() : Date.now() + 7 * DAY)}, {k: 'note', l: 'Target / notes', t: 'area', v: i ? i.note || '' : ''}],
  v => { const d = new Date(v.date); if (!v.name || isNaN(d)) { toast('Add a name and a date'); return false; } if (i) Object.assign(i, {name: v.name, date: d.toISOString(), note: v.note}); else C.exams.push({id: uid(), name: v.name, date: d.toISOString(), note: v.note || '', ch: []}); }); }
function chForm(it, c) { form(c ? 'Edit chapter' : 'New chapter', [{k: 'name', l: 'Chapter name', v: c ? c.name : ''}, {k: 'dl', l: 'Deadline (required)', t: 'date', v: c && c.dl ? c.dl : String(it.date).slice(0, 10)}, {k: 'imp', l: 'Importance (XP = importance × % × 4)', o: [['1', '1 · Normal'], ['2', '2'], ['3', '3 · Important'], ['4', '4'], ['5', '5 · Critical']], v: String(c && c.imp || 1)}, {k: 'est', l: 'Study time needed, minutes (optional: progress then follows your time)', t: 'number', v: c && c.est ? String(c.est) : ''}],
  v => { if (!v.name || !v.dl) { toast('Add a name and a deadline'); return false; } const est = Math.max(0, +v.est || 0); if (c) { c.name = v.name; c.dl = v.dl; c.imp = +v.imp; if (est) { if (est !== c.est) c._p = null; c.est = est; } else { delete c.est; delete c.autoMin; } } else (it.ch = it.ch || []).push({id: uid(), name: v.name, p: 0, dl: v.dl, imp: +v.imp, ...(est ? {est} : {})}); }); }
document.addEventListener('input', e => { const t = e.target; if (t.type !== 'range' || !t.closest('.chr')) return; const r = t.closest('.chr'), it = C.exams.find(x => x.id == r.dataset.it), c = it.ch.find(x => x.id == r.dataset.ch); c.p = +t.value; r.querySelector('.pv2').textContent = c.p; const tp = pctEx(it); $('xp_' + it.id).textContent = tp + '%'; $('xr_' + it.id).setAttribute('stroke-dashoffset', 339.29 * (1 - tp / 100)); });
setInterval(tickCd, 1000);

// ---------- pause tracking (temporary stop) ----------
let TRK = 0, PIP = null;
const pauseLeft = () => TRK > 1 ? Math.max(0, TRK - Date.now()) : 0, hmsm = ms => { const x = Math.ceil(ms / 1e3), h = Math.floor(x / 3600); return (h ? h + ':' + String(Math.floor(x % 3600 / 60)).padStart(2, '0') : Math.floor(x / 60)) + ':' + String(x % 60).padStart(2, '0'); };
const rz = (u, b) => fetch(u, {method: 'POST', headers: {'X-Rize': '1', 'Content-Type': 'application/json'}, body: JSON.stringify(b || {})});
async function trkPause(min) { await rz('/api/pause', {minutes: min}); TRK = min > 0 ? Date.now() + min * 6e4 : 1; toast(min > 0 ? `Tracking paused for ${min} min` : 'Tracking paused until you resume'); updTrk(); drawPbar(); }
async function trkResume() { await rz('/api/resume'); TRK = 0; toast('Tracking resumed'); updTrk(); drawPbar(); }
function updTrk() { if (TRK > 1 && Date.now() > TRK) TRK = 0; const b = $('trk'); if (!b) return; b.textContent = TRK ? (TRK > 1 ? `▶ Resume · ${hmsm(pauseLeft())}` : '▶ Resume') : '⏸ Pause'; b.classList.toggle('paused', !!TRK); }
function drawPbar() { $('pbar').innerHTML = TRK ? `<div class="ask" style="border-color:#F59E0B66;background:#F59E0B14"><div class="t">⏸ <b>Tracking is paused</b> – nothing is being recorded${TRK > 1 ? ' · resumes automatically in ' + hmsm(pauseLeft()) : ' until you resume'}.</div><button class="btn" data-a="trk">Resume now</button></div>` : ''; }
function pauseMenu() { const d = C.pauseMin ?? 30, opts = [[15, '15 min'], [30, '30 min'], [60, '1 hour'], [120, '2 hours'], [0, 'Until I resume']];
  $('modal').innerHTML = `<div class="mbox" style="width:380px"><h3>Pause tracking for…</h3><p class="sm">Nothing is recorded while paused and it resumes by itself. Your default is <b>${d ? d + ' min' : 'until you resume'}</b> (change it in Settings).</p><div class="grid2">${opts.map(o => `<button class="btn ${o[0] === d ? '' : 'alt'}" data-a="pausefor" data-p="${o[0]}">${o[1]}${o[0] === d ? ' ★' : ''}</button>`).join('')}</div><div class="flex" style="margin-top:14px;justify-content:flex-end"><button class="btn alt" data-a="mcancel">Cancel</button></div></div>`; $('modal').classList.add('on'); }
// ---------- pop-out timer (Picture-in-Picture window) ----------
async function popTimer() {
  if (PIP && !PIP.closed) { PIP.close(); PIP = null; return; }
  if (!('documentPictureInPicture' in window)) return toast('Pop-out needs a newer Edge – the floating desktop widget works instead');
  try { PIP = await documentPictureInPicture.requestWindow({width: 290, height: 200}); } catch (e) { return toast('Could not open the small window'); }
  const d = PIP.document, st = d.createElement('style');
  st.textContent = 'body{margin:0;background:#0F1115;color:#E6E8EE;font:13px "Segoe UI",system-ui,sans-serif}.w{padding:12px 14px;text-align:center}.m{font-size:11px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.t{font:700 46px ui-monospace,Consolas,monospace;margin:2px 0 6px}.bar{height:5px;background:#1E293B;border-radius:3px;overflow:hidden}.bar i{display:block;height:100%;background:#6366F1;transition:width 1s linear}.r{display:flex;gap:6px;justify-content:center;margin-top:12px;flex-wrap:wrap}button{background:#6366F1;color:#fff;border:0;border-radius:7px;padding:6px 11px;font:inherit;font-weight:600;cursor:pointer}button+button{background:#1b1f29;border:1px solid #1E293B;color:#E6E8EE}button.warn{background:#F59E0B!important;color:#000!important;border-color:#F59E0B!important}.s{font-size:11px;color:#94A3B8;margin-top:8px}';
  d.head.appendChild(st); d.body.innerHTML = '<div class="w"><div class="m" id="pm"></div><div class="t" id="pt"></div><div class="bar"><i id="pb"></i></div><div class="r"><button data-a="pmtoggle" id="p1"></button><button data-a="pmskip">Skip</button><button data-a="trk" id="p3"></button></div><div class="s" id="ps"></div></div>';
  d.body.onclick = async e => { const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a; if (a === 'trk') { TRK ? await trkResume() : await trkPause(C.pauseMin ?? 30); } else await A[a](); render(); drawPip(); };
  PIP.addEventListener('pagehide', () => { PIP = null; }); drawPip();
}
function drawPip() { if (!PIP || PIP.closed) return; const p = pm(), d = PIP.document, left = pmLeft(p), tt = PD(p.mode), g = id => d.getElementById(id); if (!g('pt')) return;
  g('pm').textContent = p.mode === 'focus' ? (p.act === 'exercise' ? '💪 Exercise' : p.act === 'prod' ? '💼 Productive' : '📚 Study') + (p.task ? ' · ' + p.task : '') + ' · pomodoro ' + (p.cycle % p.cfg.every + 1) + '/' + p.cfg.every : p.mode === 'short' ? '☕ Short break' : '🌴 Long break';
  g('pt').textContent = mmss(left); g('pb').style.width = Math.max(0, Math.min(100, (tt - left) / tt * 100)) + '%'; g('p1').textContent = p.running ? 'Pause' : 'Start';
  g('p3').textContent = TRK ? 'Resume tracking' : 'Pause tracking'; g('p3').className = TRK ? 'warn' : ''; g('ps').textContent = TRK ? '⏸ tracking paused' : '● tracking'; }

// ---------- gamification ----------
function lvlUp(L) { const o = document.createElement('div'); o.className = 'lu'; o.innerHTML = `<div><small>You reached</small><h2>${[...'LEVEL'].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</h2><b>${L}</b><p class="sm">Click to continue</p></div>`; o.onclick = () => o.remove(); document.body.append(o); setTimeout(() => o.remove(), 5000); }
function pop(t) { const b = document.createElement('div'); b.className = 'bub'; b.textContent = t; document.body.append(b); setTimeout(() => b.remove(), 2500); }

// ---------- render (only touches the DOM when something changed → no flicker, scroll is kept) ----------
function setHTML(el0, html) {
  if (el0._h === html && !anim) return; const sc = el0.querySelector('.cal')?.scrollTop; el0.innerHTML = html; el0._h = html;
  el0.classList.remove('anim'); if (anim) { void el0.offsetWidth; el0.classList.add('anim'); } return sc;
}

// ================= Privacy page =================
const PS = {t: 'all', r: '7', q: '', sort: 'time', sel: new Set(), open: new Set(), built: false, groups: [], cnt: {all: 0, site: 0, yt: 0, app: 0}};
let PEND = null, PMATCH = '';
const PR = [['h', 'Last hour', () => [Date.now() - HR, Infinity]], ['d', 'Today', () => [today(), Infinity]], ['y', 'Yesterday', () => [today() - DAY, today()]], ['7', '7 days', () => [today() - 6 * DAY, Infinity]], ['30', '30 days', () => [today() - 29 * DAY, Infinity]], ['all', 'All time', () => [0, Infinity]]];
const PT = [['all', 'All'], ['site', 'Websites'], ['yt', 'YouTube'], ['app', 'Apps']], PTL = {site: 'Website', yt: 'YouTube', app: 'App'};
const ptype = s => s.kind === 'browser' ? 'site' : s.kind === 'youtube' ? 'yt' : 'app';
const pdur = ms => ms < 6e4 ? Math.max(1, Math.round(ms / 1e3)) + ' s' : fm(ms / 6e4);
const pwhen = t => (t >= today() ? 'Today ' : fmtD(t) + ' ') + tm(t);
const pvSync = async () => { const c = await api.cfg(); C.v = c.v; C.va = c.va; };

function pvBuild() {
  const [a, b] = PR.find(x => x[0] === PS.r)[2](), q = PS.q.trim().toLowerCase(), M = {};
  S.forEach(s => {
    if (s.start < a || s.start >= b) return;
    const name = sk(s); if (q && !name.toLowerCase().includes(q) && !s.title.toLowerCase().includes(q)) return;
    const g = M[s._k] || (M[s._k] = {k: s._k, ty: ptype(s), name, ms: 0, last: 0, ids: [], T: {}}), d = s.end - s.start;
    g.ms += d; g.last = Math.max(g.last, s.end); g.ids.push(s.id);
    const t = g.T[s.title] || (g.T[s.title] = {title: s.title, ms: 0, last: 0, ids: []}); t.ms += d; t.last = Math.max(t.last, s.end); t.ids.push(s.id);
  });
  let L = Object.values(M); const cnt = {all: L.length, site: 0, yt: 0, app: 0};
  L.forEach(g => { cnt[g.ty]++; g.T = Object.values(g.T).sort((x, y) => y.ms - x.ms); });
  L = L.filter(g => PS.t === 'all' || g.ty === PS.t);
  L.sort(PS.sort === 'name' ? (x, y) => x.name.localeCompare(y.name) : PS.sort === 'recent' ? (x, y) => y.last - x.last : (x, y) => y.ms - x.ms);
  PS.groups = L; PS.cnt = cnt; PS.built = true;
  const keep = new Set(L.map(g => g.k)); PS.sel = new Set([...PS.sel].filter(k => keep.has(k)));
}

function pvListHTML() {
  const L = PS.groups; if (!L.length) return '<div class="pvempty">Nothing recorded for this filter.</div>';
  const n = L.filter(g => PS.sel.has(g.k)).length, recs = L.reduce((x, g) => x + g.ids.length, 0);
  const bar = `<div class="pvbar"><span class="ck ${n === L.length ? 'on' : ''}" data-a="pvall" title="Select all shown"></span><span>${n ? n + ' selected' : L.length + ' item' + (L.length === 1 ? '' : 's') + ' · ' + recs + ' records'}</span><span style="flex:1"></span>`
    + (n ? `<button class="btn dng" data-a="pvdelsel">🗑 Delete selected</button><button class="btn alt" data-a="pvblocksel">Delete &amp; never record</button><button class="btn alt" data-a="pvclr">Clear</button>` : `<button class="btn alt" data-a="pvdelall">🗑 Delete all ${L.length} shown</button>`) + '</div>';
  return bar + L.map((g, i) => {
    const exp = g.ty !== 'yt', open = exp && PS.open.has(g.k);
    return `<div class="pvr"><span class="ck ${PS.sel.has(g.k) ? 'on' : ''}" data-a="pvsel" data-p="${i}"></span><span class="pill">${PTL[g.ty]}</span><div class="t" ${exp ? `data-a="pvopen" data-p="${i}"` : ''} title="${esc(g.name)}">${esc(g.name)}${exp ? `<span class="sm"> · ${g.T.length} ${g.ty === 'app' ? 'window' : 'page'}${g.T.length === 1 ? '' : 's'} ${open ? '▾' : '▸'}</span>` : ''}</div><div class="n">${pdur(g.ms)}</div><div class="n w">${pwhen(g.last)}</div><button class="ib" data-a="pvdel" data-p="${i}" title="Delete">🗑</button></div>`
      + (open ? `<div class="pvs">${g.T.slice(0, 60).map((t, j) => `<div class="pvr"><div class="t" title="${esc(t.title)}">${esc(t.title || '(untitled)')}</div><div class="n">${pdur(t.ms)}</div><div class="n w">${pwhen(t.last)}</div><button class="ib" data-a="pvdelt" data-p="${i},${j}" title="Delete this one">✕</button></div>`).join('')}${g.T.length > 60 ? `<div class="sm" style="padding:4px 8px">+${g.T.length - 60} more – use search to narrow down</div>` : ''}</div>` : '');
  }).join('');
}

function privV() {
  if (!PS.built) pvBuild();
  const P = pvget(), sw = (k, t, d) => `<div class="sw ${P[k] ? 'on' : ''}" data-a="pvtog" data-p="${k}"><i></i><div><b>${t}</b><div class="sm">${d}</div></div></div>`;
  return `<div class="card"><div class="pvh"><h3>🔒 Privacy controls</h3><span class="sm">Applies to everything recorded from now on</span></div>
  ${sw('incognito', 'Skip private windows', 'Incognito, InPrivate and Private Browsing windows are never recorded (detected from the window title).')}
  ${sw('hideTitles', 'Hide website and video names', 'Browser time is saved only as “Web browsing” – no sites, page titles or video titles. The strictest option.')}
  <div class="sw" style="display:block;cursor:default"><b>Never record these</b><div class="sm" style="margin:2px 0 8px">Anything whose app name or window title contains one of these words is skipped completely.</div>
  ${pvget().block.map((k, i) => `<span class="chip">${esc(k)}<b data-a="rmblock" data-p="${i}">✕</b></span>`).join('') || '<div class="sm" style="margin-bottom:6px">Nothing blocked yet.</div>'}
  <div class="pvf"><input id="pv_b" placeholder="Site or app name, e.g. facebook – press Enter"><button class="btn" data-a="addblock">Block</button></div></div></div>
  <div class="card"><div class="pvh"><h3>🗂 Recorded history</h3><span class="sm">Pick what to delete – nothing is removed until you confirm</span></div>
  <div class="pvf"><div class="seg">${PT.map(x => `<button data-a="pvt" data-p="${x[0]}" class="${PS.t === x[0] ? 'on' : ''}">${x[1]} <span class="sm">${PS.cnt[x[0]]}</span></button>`).join('')}</div><input id="pv_q" placeholder="🔍 Search sites, videos, apps…" value="${esc(PS.q)}"></div>
  <div class="pvf" style="margin-top:0"><div class="seg">${PR.map(x => `<button data-a="pvr" data-p="${x[0]}" class="${PS.r === x[0] ? 'on' : ''}">${x[1]}</button>`).join('')}</div><span style="flex:1"></span><span class="sm">Sort</span><div class="seg">${[['time', 'Most time'], ['recent', 'Recent'], ['name', 'A–Z']].map(x => `<button data-a="pvs" data-p="${x[0]}" class="${PS.sort === x[0] ? 'on' : ''}">${x[1]}</button>`).join('')}</div></div>
  <div id="pvlist">${pvListHTML()}</div></div>`;
}

function pvAsk(groups, block) {
  const ids = groups.flatMap(g => g.ids), gone = new Set(ids);
  const keys = [...new Set(groups.map(g => g.k))].filter(k => /^(web|yt):/.test(k) && !S.some(s => s._k === k && !gone.has(s.id)));
  PEND = {ids, keys, block: block ? [...new Set(groups.filter(g => g.ty !== 'yt').map(g => g.name.toLowerCase()))] : []};
  const nm = groups.length === 1 ? `“${esc(groups[0].name)}”` : `${groups.length} items`;
  $('modal').innerHTML = `<div class="mbox" style="width:410px"><h3>Delete ${nm}?</h3><p class="sm">This permanently removes <b>${ids.length}</b> record${ids.length === 1 ? '' : 's'} from this computer (range: ${PR.find(x => x[0] === PS.r)[1]}).${PEND.block.length ? ' They will also be added to the “never record” list.' : ''} It cannot be undone.</p><div class="flex" style="justify-content:flex-end;margin-top:14px"><button class="btn alt" data-a="mcancel">Cancel</button><button class="btn dng" data-a="pvgo">Delete</button></div></div>`;
  $('modal').classList.add('on');
}
document.addEventListener('input', e => { if (e.target.id !== 'pv_q') return; PS.q = e.target.value; PS.sel.clear(); pvBuild(); $('pvlist').innerHTML = pvListHTML(); document.querySelectorAll('[data-a="pvt"] .sm').forEach(b => { b.textContent = PS.cnt[b.parentElement.dataset.p]; }); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'pv_b') { e.preventDefault(); A.addblock().then(render); } });

let viewLogged = null, navSeq = null;
function countView() {      // every time the page changes, tell the tracker (Buddy's side panel ranks pages by this)
  if (view === viewLogged) return; viewLogged = view;
  fetch('/api/nav/view', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Rize': '1'}, body: JSON.stringify({page: view})}).catch(() => {});
}
let ready = false;
function gotoPage(p) { if (!p || !V[p]) return; view = p; flt = p === 'yt' ? 'yt' : flt; asking = null; if (ready) { go(); render(); } }      // before the first load only remember the page, refresh() draws it
function render() {
  countView();
  if (view !== 'priv') PS.built = false;
  $('navl').innerHTML = NAV.map(g => `<div class="grp">${g[0]}</div>` + g[1].map(n => `<button data-v="${n[0]}" class="${view === n[0] ? 'on' : ''}"><span>${n[1]}</span>${n[2]}</button>`).join('')).join('');
  $('modes').innerHTML = ['day', 'week', 'month', 'year'].map(m => `<button data-m="${m}" class="${mode === m ? 'on' : ''}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('');
  $('date').textContent = view === 'rep' ? 'Reports' : view === 'priv' ? 'Privacy' : label(); G = game(); $('mini').textContent = pm().running ? `⏱ ${mmss(pmLeft(pm()))}` : '▶ Timer';
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || ''); let html, sc;
  if (!typing) { try { html = V[view](); } catch (e) { html = '<pre>' + esc(e.stack) + '</pre>'; } sc = setHTML($('view'), html);
    const c = $('view').querySelector('.cal'); if (c) { if (scrollPend) { const H = PX(), hr = mode === 'day' && day === today() ? new Date().getHours() - 1 : (S.find(s => s.start >= day && s.start < day + DAY) ? new Date(S.find(s => s.start >= day && s.start < day + DAY).start).getHours() - 1 : 8); c.scrollTop = Math.max(0, hr) * H; scrollPend = false; } else if (sc) c.scrollTop = sc; } wireCal(); }
  updTrk(); drawPbar(); drawPip(); if (INS) drawInsp(); $('ask').innerHTML = ['over', 'rep', 'act', 'yt', 'priv'].includes(view) ? '' : askBar(); $('app').classList.toggle('wide', !['cal', 'dash', 'over'].includes(view)); $('app').classList.toggle('rep', view === 'rep'); try { setHTML($('sum'), sumHTML()); } catch (e) { $('sum').innerHTML = '<pre>' + esc(e.stack) + '</pre>'; }
  anim = false;
}
async function refresh() {
  S = (await api.range(0, Date.now() + DAY)).sort((a, b) => a.start - b.start); YD = {}; S.forEach(s => { if (s.kind === 'youtube') { const t = s.title.toLowerCase(); YD[t] = Math.max(YD[t] || 0, s.end - s.start); } }); S.forEach(s => { s._k = rk(s); }); CM = {}; G = game();
  if (G.L > C.game.lv) { lvlUp(G.L); C.game.lv = G.L; api.setcfg(C); }
  if (lastXp !== null && G.xp > lastXp) pop(`+${G.xp - lastXp} XP`); lastXp = G.xp; buildLearn(); breakCheck(); autoSync(); render();
}
api.onTick(c => { if (c && c.nav) { if (navSeq === null) { navSeq = c.nav.seq; if (c.nav.seq && c.nav.age < 15) gotoPage(c.nav.page); } else if (c.nav.seq !== navSeq) { navSeq = c.nav.seq; gotoPage(c.nav.page); } } const p = pm(); TRK = c && c.paused ? c.paused : 0; $('now').innerHTML = (p.running ? `<b>⏱ ${mmss(pmLeft(p))}</b> ${p.mode === 'focus' ? 'focus' : 'break'}<br>` : '') + (TRK ? `<b style="color:#F59E0B">⏸ Tracking paused</b><br>${TRK > 1 ? 'back in ' + hmsm(pauseLeft()) : 'until you resume'}<br><button class="btn" data-a="trk" style="margin-top:6px;padding:3px 10px">Resume</button>` : c && c.app ? `<b>● Tracking</b><br>${esc(c.app)}<br>${esc((c.title || '').slice(0, 60))}` : 'Idle – waiting'); updTrk(); drawPbar(); });
setInterval(pmTick, 1000);
(async () => { try { AUTO = (await api.autostart()).on; } catch (e) {} try { AUTOOPEN = (await api.autoopen()).on; } catch (e) {} { const c0 = await api.cfg(); Object.assign(C, c0); adoptCfg(c0); } C.game = C.game || {lv: 1, bonus: 0}; C.va = C.va || {}; C.exams = C.exams || []; if (!C.areas || !C.areas.length) C.areas = [{id: 'study', name: 'Study', color: '#FBBF24', kw: 'tutorial,course,lecture,learn,explained,exam,chapter'}]; { const h = decodeURIComponent(location.hash.slice(1)); if (h && V[h]) { view = h; if (h === 'yt') flt = 'yt'; } } await refresh(); ready = true; setInterval(refresh, 15000); })();

// ---------- keyboard: Enter = add / next field / save, Ctrl+Enter = save anywhere, Esc = close ----------
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.defaultPrevented || e.shiftKey || e.altKey || e.isComposing) return;
  const t = e.target; if (!t || !/^(INPUT|TEXTAREA)$/.test(t.tagName) || ['checkbox', 'radio', 'range', 'file', 'button', 'color'].includes(t.type) || t.onkeydown || t.classList.contains('rfi')) return;
  const scope = t.closest('#modal.on'), prim = r => r && r.querySelector('button.btn:not(.alt)');
  if (scope) {
    const F = [...scope.querySelectorAll('input,select,textarea')].filter(x => !['checkbox', 'radio', 'range', 'hidden', 'file'].includes(x.type) && x.offsetParent), i = F.indexOf(t);
    if (t.tagName === 'TEXTAREA' && !e.ctrlKey) return;
    e.preventDefault(); if (!e.ctrlKey && i >= 0 && i < F.length - 1) { F[i + 1].focus(); F[i + 1].select && F[i + 1].select(); return; } const b = prim(scope); if (b) b.click(); return;
  }
  if (t.tagName === 'TEXTAREA') return;
  const b = prim(t.closest('.flex, .pvf')) || prim(t.closest('.card'));
  e.preventDefault(); if (b && b.dataset.a) b.click(); else t.blur();
});
