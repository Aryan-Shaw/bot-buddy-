// Rize Buddy v4 additions (loaded after app.js + focus.js)
(() => {
  const jp = (u, b) => fetch(u, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Rize': '1'}, body: JSON.stringify(b || {})}).then(r => r.json());
  const jg = u => fetch(u).then(r => r.json());
  const dl = (name, text, type = 'application/json') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const readFile = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsText(f); });
  const stamp = () => new Date().toISOString().slice(0, 10);
  const modal = html => { $('modal').innerHTML = `<div class="mbox" style="max-height:90vh;overflow:auto">${html}</div>`; $('modal').classList.add('on'); return $('modal').firstChild; };
  const reload = async () => { Object.assign(C, await api.cfg()); C.va = C.va || {}; await refresh(); };

  // ================= theme button =================
  const tb = document.createElement('button'); tb.className = 'btn alt'; tb.id = 'themeb';
  const ICON = {auto: '🌓', light: '☀️', dark: '🌙'};
  const paintTheme = () => { const p = document.documentElement.dataset.pref || 'auto'; tb.textContent = ICON[p]; tb.title = `Theme: ${p} (click to change)`; };
  tb.onclick = () => { cycleTheme(); setTimeout(paintTheme, 30); }; $('bud').before(tb); paintTheme();

  // ================= buddy state cache (quotes, level...) =================
  let BS = null; const loadBS = async () => { try { BS = await jg('/api/buddy/state'); } catch (e) {} };
  loadBS();

  // ================= focus sound: presets + your own audio files =================
  const SD = {vol: +(localStorage.sndVol || .4), kind: localStorage.sndKind || 'brown', auto: localStorage.sndAuto !== '0'};
  let ac = null, master = null, stopNodes = null, ducked = false, autoStarted = false;
  const idb = () => new Promise((ok, no) => { const r = indexedDB.open('rize-sounds', 1); r.onupgradeneeded = () => r.result.createObjectStore('f', {keyPath: 'id'}); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const idbDo = async (mode, fn) => { const d = await idb(); return new Promise((ok, no) => { const t = d.transaction('f', mode), rq = fn(t.objectStore('f')); t.oncomplete = () => ok(rq && rq.result); t.onerror = () => no(t.error); }); };
  const PRESETS = [['brown', 'Brown noise (deep, steady)'], ['pink', 'Pink noise (soft)'], ['white', 'White noise'], ['rain', 'Rain'], ['waves', 'Ocean waves'], ['binaural', 'Deep focus tone (headphones)']];
  function noiseBuf(c, type) {
    const n = c.sampleRate * 4, b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let l = 0, b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1;
        if (type === 'white') d[i] = w * .5; else if (type === 'pink') { b0 = .99765 * b0 + w * .099; b1 = .963 * b1 + w * .2965; b2 = .57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * .1848) * .2; } else { l = (l + .02 * w) / 1.02; d[i] = l * 3.5; } } }
    return b;
  }
  const loop = (c, buf, to) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(to); s.start(); return s; };
  async function build(kind) {
    const c = ac, out = c.createGain(); out.connect(master); const st = [];
    if (kind.startsWith('file:')) { const rec = await idbDo('readonly', s => s.get(+kind.slice(5))); if (!rec) throw new Error('missing'); st.push(loop(c, await c.decodeAudioData(rec.data.slice(0)), out)); }
    else if (kind === 'rain') { const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000; hp.connect(lp); lp.connect(out); out.gain.value = .7; st.push(loop(c, noiseBuf(c, 'white'), hp)); const lo = c.createGain(); lo.gain.value = .35; lo.connect(out); st.push(loop(c, noiseBuf(c, 'brown'), lo)); }
    else if (kind === 'waves') { const g = c.createGain(); g.gain.value = .55; g.connect(out); const o = c.createOscillator(), og = c.createGain(); o.frequency.value = .1; og.gain.value = .4; o.connect(og); og.connect(g.gain); o.start(); st.push(o, loop(c, noiseBuf(c, 'brown'), g)); }
    else if (kind === 'binaural') { [[200, -1], [210, 1]].forEach(([f, p]) => { const o = c.createOscillator(), pn = c.createStereoPanner(), g = c.createGain(); o.frequency.value = f; pn.pan.value = p; g.gain.value = .18; o.connect(pn); pn.connect(g); g.connect(out); o.start(); st.push(o); }); }
    else st.push(loop(c, noiseBuf(c, kind), out));
    return () => { st.forEach(n => { try { n.stop(); } catch (e) {} }); out.disconnect(); };
  }
  async function play(kind) {
    await halt(true);
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); await ac.resume(); if (!master) { master = ac.createGain(); master.connect(ac.destination); }
      master.gain.value = ducked ? 0 : SD.vol; stopNodes = await build(kind || SD.kind); SND = {on: true}; }
    catch (e) { SND = null; toast('Could not play that sound'); }
    render();
  }
  async function halt(quiet) { if (stopNodes) { stopNodes(); stopNodes = null; } SND = null; autoStarted = false; if (!quiet) render(); }
  sound = on => on ? play() : halt();                                           // the old Focus-sound button now uses this engine
  const setVol = v => { SD.vol = v; localStorage.sndVol = v; if (master && !ducked) master.gain.setTargetAtTime(v, ac.currentTime, .05); };
  // pause our own sound whenever Buddy speaks; tell the server a sound is playing so it does not mistake it for a video
  setInterval(async () => { if (!stopNodes) return; try { const r = await jp('/api/sound/state', {playing: !ducked}); if (r.speaking !== ducked) { ducked = r.speaking; master.gain.setTargetAtTime(ducked ? 0 : SD.vol, ac.currentTime, .08); } } catch (e) {} }, 700);
  // start / stop together with the Pomodoro focus timer
  const syncAuto = () => { const p = pm(); if (!SD.auto) return; if (p.running && p.mode === 'focus' && p.act !== 'exercise' && !stopNodes) { play().then(() => { autoStarted = true; }); } else if (autoStarted && !(p.running && p.mode === 'focus')) halt(); };
  for (const n of ['pmStart', 'pmPause', 'pmDone', 'pmSkip', 'pmStop']) { const f = window[n]; window[n] = async function (...a) { const r = await f.apply(this, a); syncAuto(); return r; }; }

  async function soundModal() {
    const files = await idbDo('readonly', s => s.getAll()) || [], sel = SD.kind;
    const opt = (v, t, extra = '') => `<label class="flex" style="margin:4px 0;color:var(--tx)"><input type="radio" name="sk" value="${v}" ${sel === v ? 'checked' : ''} style="width:auto"> ${t}${extra}</label>`;
    const m = modal(`<h3 style="font-size:16px;color:var(--tx)">🎧 Focus sound</h3><p class="sm">Plays while your focus timer runs and pauses on breaks. It also pauses by itself while Buddy is speaking.</p>
      ${PRESETS.map(p => opt(p[0], p[1])).join('')}
      <div class="sm" style="margin:10px 0 2px">Your own sounds (mp3 / wav / ogg, stays on this computer)</div>
      ${files.map(f => opt('file:' + f.id, esc(f.name), ` <button class="x" data-del="${f.id}" title="Remove">✕</button>`)).join('') || '<div class="sm">None yet.</div>'}
      <label class="btn alt" style="display:inline-block;margin-top:6px;cursor:pointer">＋ Add sound file<input type="file" id="sfile" accept="audio/*" hidden></label>
      <label style="color:var(--mt)">Volume<input id="svol" type="range" min="0" max="1" step=".05" value="${SD.vol}" style="padding:0"></label>
      <label class="flex" style="color:var(--tx)"><input type="checkbox" id="sauto" ${SD.auto ? 'checked' : ''} style="width:auto"> Start & stop with the focus timer</label>
      <div class="flex" style="justify-content:flex-end;margin-top:14px"><button class="btn alt" data-a="mcancel">Close</button><button class="btn alt" id="sstop">■ Stop</button><button class="btn" id="splay">▶ Play now</button></div>`);
    m.onchange = async e => { if (e.target.name === 'sk') { SD.kind = e.target.value; localStorage.sndKind = SD.kind; if (stopNodes) play(); }
      if (e.target.id === 'sauto') { SD.auto = e.target.checked; localStorage.sndAuto = SD.auto ? '1' : '0'; }
      if (e.target.id === 'sfile' && e.target.files[0]) { const f = e.target.files[0]; if (f.size > 40e6) return toast('File too large (40 MB max)'); const data = await f.arrayBuffer(); const id = Date.now(); await idbDo('readwrite', s => s.put({id, name: f.name, data})); SD.kind = 'file:' + id; localStorage.sndKind = SD.kind; soundModal(); } };
    m.oninput = e => { if (e.target.id === 'svol') setVol(+e.target.value); };
    m.onclick = async e => { const d = e.target.closest('[data-del]'); if (d) { await idbDo('readwrite', s => s.delete(+d.dataset.del)); if (SD.kind === 'file:' + d.dataset.del) { SD.kind = 'brown'; localStorage.sndKind = 'brown'; } soundModal(); }
      if (e.target.id === 'splay') play(); if (e.target.id === 'sstop') halt(); };
  }
  A.snd = () => { if (stopNodes) halt(); else soundModal(); render(); };
  A.sndcfg = () => soundModal();
  const _timer = V.timer; V.timer = () => { let h = _timer(); const p = pm();
    h = h.replace(/(<button class="btn alt" data-a="snd">.*?<\/button>)/, `$1<button class="btn alt" data-a="sndcfg" title="Choose or upload a sound">⚙ Sound</button>`);
    if ((p.act || 'study') === 'study') {                                       // Study = an exam / chapter, never free text
      h = h.replace('<option value="">Free study</option>', '<option value="">Select exam / chapter…</option>').replace(/<input id="pmk"[^>]*>/, '').replace(/<datalist id="tl">.*?<\/datalist>/, '').replace(/<select id="pmp".*?<\/select>/, '').replace(/<select id="pmar".*?<\/select>/, '');
    }
    return h; };

  // ================= Study -> Exams =================
  const _start = window.pmStart;
  window.pmStart = async function () {
    const p = pm();
    if (p.mode === 'focus' && !p.running && (p.act || 'study') === 'study') {
      if (!C.exams.length) { toast('Add an exam first: study sessions belong to an exam'); view = 'exam'; render(); return; }
      if (!p.link || !p.link.includes(':')) { toast('Pick the exam or chapter you are studying'); return; }
      const [i, c] = p.link.split(':'), ex = C.exams.find(x => x.id == i), ch = ex && (ex.ch || []).find(x => x.id == c);
      p.task = ch ? ch.name : ex ? ex.name : p.task; p.project = ''; p.area = 'study';
      const gid = ch ? 'g:chap:' + ch.id : 'g:exam:' + i;                       // studying a chapter makes it the current goal
      jp('/api/curgoal', {id: gid, name: p.task, kind: ch ? 'chap' : 'exam'}).then(() => { try { refresh(); } catch (e) {} });
    }
    return _start();
  };

  // ================= Tasks: deadline + scope, and import / export of exams & tasks =================
  const expBar = `<div class="flex" style="margin-bottom:10px"><button class="btn alt" data-a="expet">⬇ Export exams &amp; tasks</button><button class="btn alt" data-a="impet">⬆ Import exams &amp; tasks</button><input type="file" id="impf" accept=".json,application/json" hidden></div>`;
  const _task = V.task; V.task = () => expBar + _task().replace('<button class="btn" data-a="addtask">', `<select id="tsc" title="Show in Buddy as"><option value="">Normal task</option><option value="day">Today</option><option value="week">This week</option></select><input id="tdl" type="datetime-local" title="Deadline (optional)"><input id="tst" type="datetime-local" title="🔔 Start time: Buddy reminds you (optional)"><input id="tmd" type="datetime-local" title="🔔 Extra reminder between start and deadline (optional)"><button class="btn" data-a="addtask">`);
  // ---- exam priorities (computed by the tray app so the dashboard and Buddy always agree) ----
  let PL = null, PLT = 0;
  const loadPlan = async () => { try { const p = await jg('/api/buddy/plan'); const ch = JSON.stringify(p.rows) !== JSON.stringify(PL && PL.rows); PL = p; PLT = Date.now(); return ch; } catch (e) { return false; } };
  const plRow = id => PL ? PL.rows.findIndex(r => r.id == id) : -1;
  window.exSort = list => list.sort((a, b) => { const x = plRow(a.id), y = plRow(b.id); return x >= 0 && y >= 0 ? x - y : x >= 0 ? -1 : y >= 0 ? 1 : new Date(a.date) - new Date(b.date); });
  window.exTag = i => { const k = plRow(i.id); if (k < 0) return ''; const r = PL.rows[k];
    return ` <small class="rt" title="Priority score = points from your ranking (best rank = most points) + ${PL.prox} for the nearest exam. Equal scores: the nearer exam goes first.">⭐ #${k + 1} · score ${r.score}${r.bonus ? ' (+' + r.bonus + ' nearest)' : ''} · your rank ${r.rank}</small>`; };
  window.exBtns = i => { const k = plRow(i.id); if (k < 0) return ''; const r = PL.rows[k];
    return `<button class="x" data-a="exup" data-p="${i.id}" ${r.rank === 1 ? 'disabled' : ''} title="Rank this exam higher">▲</button><button class="x" data-a="exdown" data-p="${i.id}" ${r.rank === PL.rows.length ? 'disabled' : ''} title="Rank this exam lower">▼</button>`; };
  const exMove = async (id, dir) => { const r = await jp('/api/buddy/exam-rank', {id: +id, dir}); if (r.note) toast(r.note); await reload(); await loadPlan(); };
  A.exup = p => exMove(p, 'up'); A.exdown = p => exMove(p, 'down');
  const _exam = V.exam; V.exam = () => { if (!PL || Date.now() - PLT > 8000) loadPlan().then(ch => { if (ch && view === 'exam' && !document.querySelector('#modal.on')) render(); }); return expBar + _exam(); };
  A.addtask = async () => { if (!val('tn')) return; const ch = $('tch')?.value, st = $('tst')?.value || '', md = $('tmd')?.value || '', dl = $('tdl')?.value || '';
    if (st && dl && st >= dl) return toast('The start time must be before the deadline'); if (md && ((st && md <= st) || (dl && md >= dl))) return toast('The extra reminder must be between start and deadline');
    const rank = Math.max(0, ...C.tasks.filter(t => !t.done).map(t => +t.rank || 0)) + 1;
    C.tasks.push({id: uid(), title: val('tn'), project: $('tp').value, done: false, scope: $('tsc')?.value || '', dl, p: 0, rank, ...(ch ? {chap: +ch || ch} : {}), ...(st || md ? {rm: {start: st, mid: md ? [md] : [], ov: (BS && BS.profile && BS.profile.overdueMin) || 30}} : {})}); await save(); toast('Task added'); };
  A.expet = () => { dl(`rize-exams-tasks-${stamp()}.json`, JSON.stringify({app: 'rize-buddy', format: 2, part: ['exams', 'tasks'], exported: Date.now(), data: {exams: C.exams, tasks: C.tasks}})); toast('Exported exams & tasks'); };
  A.impet = () => { $('impf').value = ''; $('impf').onchange = e => pickImport(e.target.files[0], 'exams & tasks'); $('impf').click(); };
  A.expall = () => { const m = modal(`<h3 style="font-size:16px;color:var(--tx)">⬇ Export everything</h3><p class="sm">One file with all your data: tracked history, exams, tasks, goals, settings, Buddy chat, distractions and quotes.</p>
    <label class="flex" style="color:var(--tx)"><input type="checkbox" id="xkeys" style="width:auto"> Include my AI API keys (keep the file private!)</label>
    <div class="flex" style="justify-content:flex-end;margin-top:14px"><button class="btn alt" data-a="mcancel">Cancel</button><button class="btn" id="xgo">Download</button></div>`);
    m.onclick = async e => { if (e.target.id !== 'xgo') return; const t = await (await fetch('/api/export?part=all&keys=' + ($('xkeys').checked ? 1 : 0))).text(); dl(`rize-buddy-backup-${stamp()}.json`, t); closeModal(); toast('Backup downloaded'); }; };
  A.impall = () => { $('impf').value = ''; $('impf').onchange = e => pickImport(e.target.files[0], 'all data'); $('impf').click(); };
  async function pickImport(f, label) {
    if (!f) return; let payload; try { payload = JSON.parse(await readFile(f)); } catch (e) { return toast('That file is not valid JSON'); }
    if (payload.app !== 'rize-buddy' || !payload.data) return toast('This is not a Rize Buddy export');
    const keys = Object.keys(payload.data), n = k => Array.isArray(payload.data[k]) ? payload.data[k].length : 0;
    const m = modal(`<h3 style="font-size:16px;color:var(--tx)">⬆ Import ${label}</h3><p class="sm">File contains: ${keys.map(k => k + (Array.isArray(payload.data[k]) ? ' (' + n(k) + ')' : '')).join(', ')}.</p>
      <label class="flex" style="color:var(--tx)"><input type="radio" name="im" value="merge" checked style="width:auto"> <span><b>Merge</b> – add to what I have (same items are updated)</span></label>
      <label class="flex" style="color:var(--tx)"><input type="radio" name="im" value="replace" style="width:auto"> <span><b>Replace</b> – overwrite the matching parts with the file</span></label>
      <div class="flex" style="justify-content:flex-end;margin-top:14px"><button class="btn alt" data-a="mcancel">Cancel</button><button class="btn" id="igo">Import</button></div>`);
    m.onclick = async e => { if (e.target.id !== 'igo') return; const mode = m.querySelector('[name=im]:checked').value; const r = await jp('/api/import', {payload, mode});
      closeModal(); if (r.ok) { await reload(); await loadBS(); toast('Imported ✓'); } else toast(r.err || 'Import failed'); };
  }

  // ================= Distractions page =================
  let DD = null, DT = 0;
  const loadDist = async () => { try { DD = await jg('/api/distractions'); DT = Date.now(); } catch (e) {} };
  const VB = {important: ['g', 'Important'], break: ['y', 'Break'], not: ['r', 'Not important'], asked: ['n', 'No answer yet'], unclear: ['n', 'Unclear']};
  const OB = {returned: ['g', 'Back on goal'], ignored: ['r', 'Ignored'], allowed: ['g', 'Allowed'], break: ['y', 'Break taken'], '': ['n', 'Pending']};
  V.dist = () => {
    if (!DD || Date.now() - DT > 12000) loadDist().then(() => view === 'dist' && render());
    if (!DD) return '<div class="card">Loading…</div>';
    const c = DD.counts, win = c.returned + c.ignored ? Math.round(c.returned / (c.returned + c.ignored) * 100) : 0;
    const rows = DD.items.map(x => { const v = VB[x.verdict] || VB.asked, o = OB[x.outcome || ''] || OB[''];
      return `<tr><td class="mono">${new Date(x.t).toLocaleDateString([], {day: 'numeric', month: 'short'})} ${tm(x.t)}</td><td><b>${esc(x.title || x.app)}</b><div class="sm">${esc(x.app)} · ${x.min} min</div></td><td>${esc(x.goal || '—')}</td><td>${x.answer ? esc(x.answer) : '<span class="sm">—</span>'}</td><td><span class="badge ${v[0]}">${v[1]}</span></td><td><span class="badge ${o[0]}">${o[1]}</span></td></tr>`; }).join('');
    return `<div class="grid4"><div class="card"><div class="sm">Distractions logged</div><div class="big">${DD.total}</div></div><div class="card"><div class="sm">Back on goal after nudge</div><div class="big g">${c.returned}</div><div class="sm">${win}% success</div></div><div class="card"><div class="sm">Ignored</div><div class="big r">${c.ignored}</div></div><div class="card"><div class="sm">Allowed / breaks</div><div class="big">${c.allowed + c.break}</div></div></div>
    ${DD.top.length ? `<div class="card"><h3>Most frequent</h3>${DD.top.map(t => `<div class="leg"><span>${esc(t[0])}</span><b class="mono">${t[1]}×</b></div>`).join('')}</div>` : ''}
    <div class="card"><div class="sect-h"><h3>Distractions: what happened and what you said</h3><button class="btn alt" data-a="distclr">Clear list</button></div>
    <p class="sm">When you drift away from your goal, Buddy asks what you are doing, checks whether it matters for your current goal and exam, and either lets it go or talks you back.</p>
    ${rows ? `<div style="overflow-x:auto"><table><tr><th>When</th><th>Distraction</th><th>Current goal</th><th>What you said</th><th>Verdict</th><th>Result</th></tr>${rows}</table></div>` : '<div class="empty">No distractions yet. Keep it that way 💪</div>'}</div>`;
  };
  NAV.find(x => x[0] === 'Analyze')[1].push(['dist', '⚠', 'Distractions']);
  A.distclr = async () => { await jp('/api/distractions/clear'); DD = null; toast('Cleared'); };

  // ================= Settings additions =================
  const LV = [['quiet', 'Quiet: a few check-ins a day'], ['balanced', 'Balanced (recommended)'], ['chatty', 'Chatty: more encouragement']];
  const _set = V.set;
  V.set = () => {
    if (!BS) loadBS().then(() => view === 'set' && render());
    const p = (BS && BS.profile) || {level: 'balanced', duck: true, peekMin: 0}, allq = (BS && BS.quotes) || [], q = allq.filter(x => !['distract', 'achieve'].includes(x.kind)), th = document.documentElement.dataset.pref || 'auto';
    return `<div class="card"><h3>🎨 Appearance</h3><div class="seg">${[['auto', 'Auto'], ['light', '☀️ Light'], ['dark', '🌙 Dark']].map(t => `<button data-a="theme" data-p="${t[0]}" class="${th === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div></div>
    <div class="card"><h3>🤖 Buddy behaviour</h3>
      <div class="kv"><label style="margin:0">How often may Buddy pop up?<select id="bs_level" style="margin-left:8px">${LV.map(l => `<option value="${l[0]}" ${p.level === l[0] ? 'selected' : ''}>${l[1]}</option>`).join('')}</select></label></div>
      <div class="sw ${p.newSiteAsk !== false ? 'on' : ''}" data-a="nsask" style="border:0;padding:6px 0"><i></i><div><b>Ask me about new sites &amp; apps</b><div class="sm">Buddy asks, in short, whether a new site/app is productive and aligned with your goal.</div></div></div>
      <div class="kv"><label style="margin:0">...only after I spent <input id="bs_nsm" type="number" min="1" max="240" value="${p.newSiteMin ?? 20}" style="width:70px"> minutes on it</label></div>
      <div class="kv"><label style="margin:0">When <input id="bs_nsb" type="number" min="5" max="500" value="${p.newSiteBatch ?? 50}" style="width:70px"> new sites are waiting, offer a quick clean-up</label></div>
      <div class="sw ${p.duck !== false ? 'on' : ''}" data-a="duck" style="border:0;padding:6px 0"><i></i><div><b>Pause videos &amp; music while Buddy speaks</b><div class="sm">Resumes by itself when Buddy finishes. Needs the optional "pycaw" package to detect what is playing.</div></div></div>
      <div class="sm">Buddy only checks on distractions when you have a current goal or a focus timer running, never more than your level allows, and backs off if you ignore it.</div></div>
    <div class="card"><div class="sect-h"><h3>💬 Quotes &amp; motivation messages (${q.length})</h3></div><p class="sm">Buddy mixes these into its encouragement, celebrations and nudges.</p>
      <div class="flex" style="flex-wrap:nowrap"><input id="qt" placeholder="Add a quote or motivation message…" style="flex:1"><input id="qa" placeholder="Author (optional)" style="width:150px"><select id="qk"><option value="quote">Quote</option><option value="motivation">My message</option></select><button class="btn" data-a="qadd">Add</button></div>
      <div style="margin-top:8px;max-height:220px;overflow:auto">${q.map(x => `<div class="row"><div class="t" style="white-space:normal">${x.kind === 'motivation' ? '💪' : '❝'} ${esc(x.text)}${x.author ? ` <span class="sm">- ${esc(x.author)}</span>` : ''}</div><button class="x" data-a="qdel" data-p="${x.id}">✕</button></div>`).join('') || '<div class="sm">No quotes yet.</div>'}</div>
      <label class="btn alt" style="display:inline-block;margin-top:8px;cursor:pointer">Import list (.txt, one per line, "text | author")<input type="file" id="qfile" accept=".txt" hidden></label></div>
    ${[['distract', "😤 When I'm distracted, Buddy says…", 'Your own lines for the moment you drift away from your goal (and for overdue reminders). Use {name} and {goal}. Buddy uses one of yours about 7 times out of 10.', 'e.g. Future you is watching. Close it, {name}.'], ['achieve', '🏆 When I hit a streak or complete a goal, Buddy says…', 'Your own lines for focus-streak milestones, finished goals and the daily target. Use {name} and {goal}.', 'e.g. That is how winners show up, {name}!']].map(([k, h, d, ph]) => `<div class="card"><div class="sect-h"><h3>${h} (${allq.filter(x => x.kind === k).length})</h3></div><p class="sm">${d}</p><div class="flex" style="flex-wrap:nowrap"><input id="ln_${k}" placeholder="${ph}" style="flex:1"><button class="btn" data-a="ladd" data-p="${k}">Add</button></div><div style="margin-top:8px;max-height:200px;overflow:auto">${allq.filter(x => x.kind === k).map(x => `<div class="row"><div class="t" style="white-space:normal">${esc(x.text)}</div><button class="x" data-a="qdel" data-p="${x.id}">✕</button></div>`).join('') || '<div class="sm">None yet: Buddy uses a few built-in lines until you add your own.</div>'}</div></div>`).join('')}
    <div class="card"><h3>🔔 Goal reminders</h3><p class="sm">Set a start time, extra times and a deadline on a task (Tasks page or the 🔔 in Buddy). Buddy pops up at each one, then asks what you are doing after the deadline.</p>
      <div class="flex"><label class="flex" style="color:var(--tx)"><input type="checkbox" id="bs_rem" style="width:auto" ${p.remindOn !== false ? 'checked' : ''}> Reminders on</label><label class="flex" style="color:var(--tx)">Ask every <input id="bs_ov" type="number" min="5" max="240" value="${p.overdueMin || 30}" style="width:70px"> min after a deadline</label></div></div>
    ${_set()}
    <div class="card"><h3>💾 Your data</h3><p class="sm">Back up or move everything, including history, exams, tasks, goals, chat and quotes.</p>
      <div class="flex"><button class="btn" data-a="expall">⬇ Export all data</button><button class="btn alt" data-a="impall">⬆ Import all data</button><button class="btn alt" data-a="expet">⬇ Exams &amp; tasks only</button><button class="btn alt" data-a="impet">⬆ Import exams &amp; tasks</button><input type="file" id="impf" accept=".json,application/json" hidden></div></div>
    <div class="card" style="border-color:var(--r)"><h3 style="color:var(--r)">⚠ Delete all data</h3><p class="sm">Erases history, exams, tasks, goals, chat, distractions and quotes. Buddy will ask you its first-time questions again. Export a backup first if unsure.</p><button class="btn dng" data-a="wipe">Delete all data…</button></div>`;
  };
  A.theme = p => { setTheme(p); setTimeout(paintTheme, 30); };
  A.nsask = async () => { const on = !(BS.profile.newSiteAsk !== false); BS = await jp('/api/buddy/settings', {newSiteAsk: on}); };
  A.duck = async () => { const on = !(BS.profile.duck !== false); BS = await jp('/api/buddy/settings', {duck: on}); };
  A.qadd = async () => { const t = val('qt'); if (!t) return; const r = await jp('/api/buddy/quotes', {op: 'add', text: t, author: val('qa'), kind: $('qk').value}); BS.quotes = r.quotes; document.activeElement.blur(); toast('Added'); };
  A.ladd = async k => { const t = val('ln_' + k); if (!t) return; const r = await jp('/api/buddy/quotes', {op: 'add', text: t, kind: k}); BS.quotes = r.quotes; document.activeElement.blur(); toast('Added'); };
  A.qdel = async p => { const r = await jp('/api/buddy/quotes', {op: 'del', id: +p}); BS.quotes = r.quotes; };
  document.addEventListener('change', async e => {
    const tl = e.target.closest && e.target.closest('.tlk'); if (tl) { const k = C.tasks.find(x => x.id == tl.dataset.tl); if (k) { if (tl.value.startsWith('e:')) { k.exam = +tl.value.slice(2) || tl.value.slice(2); delete k.chap; delete k.nolink; delete k.autoChap; } else if (tl.value) { k.chap = +tl.value || tl.value; delete k.exam; delete k.nolink; delete k.autoChap; } else { delete k.chap; delete k.exam; delete k.autoChap; k.nolink = true; } await save(); toast(tl.value ? 'Linked: the topic\'s progress now updates from this task 🔗' : 'Unlinked'); render(); } return; }
    const te = e.target.closest && e.target.closest('.tes'); if (te) { const k = C.tasks.find(x => x.id == te.dataset.te); if (k) { const n = Math.max(0, +te.value || 0); if (n) k.est = n; else delete k.est; k._p = null; await save(); toast(n ? 'Estimate saved: progress now follows your time ⏱' : 'Estimate removed'); render(); } return; }
    if (e.target.id === 'bs_nsm' || e.target.id === 'bs_nsb') { BS = await jp('/api/buddy/settings', e.target.id === 'bs_nsm' ? {newSiteMin: +e.target.value} : {newSiteBatch: +e.target.value}); toast('Saved'); }
    if (e.target.id === 'bs_rem' || e.target.id === 'bs_ov') { BS = await jp('/api/buddy/settings', {remindOn: $('bs_rem').checked, overdueMin: +$('bs_ov').value || 30}); toast('Saved'); }
    if (e.target.id === 'bs_level') { BS = await jp('/api/buddy/settings', {level: e.target.value}); toast('Saved'); }
    if (e.target.id === 'qfile' && e.target.files[0]) { const items = (await readFile(e.target.files[0])).split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => { const [text, author] = l.split('|'); return {text: text.trim(), author: (author || '').trim()}; }); const r = await jp('/api/buddy/quotes', {op: 'import', items}); BS.quotes = r.quotes; toast(`Imported ${items.length} lines`); render(); }
  });
  A.wipe = () => { const m = modal(`<h3 style="font-size:16px;color:var(--r)">Delete ALL data?</h3><p class="sm">This cannot be undone. Everything you tracked, planned and told Buddy will be erased.</p>
    <label class="flex" style="color:var(--tx)"><input type="checkbox" id="wk" checked style="width:auto"> Keep my AI API keys</label>
    <label>Type <b>DELETE</b> to confirm<input id="wc" autocomplete="off"></label>
    <div class="flex" style="justify-content:flex-end;margin-top:14px"><button class="btn alt" data-a="mcancel">Cancel</button><button class="btn dng" id="wgo">Delete everything</button></div>`);
    m.onclick = async e => { if (e.target.id !== 'wgo') return; if ($('wc').value.trim() !== 'DELETE') return toast('Type DELETE to confirm'); const r = await jp('/api/reset', {confirm: 'DELETE', keepKeys: $('wk').checked}); if (r.ok) { localStorage.removeItem('nc'); location.reload(); } }; };
  // ================= goal priorities (YOUR order, #1 = most important; Buddy and the corner pop-up follow it) =================
  let GP = null, GPT = 0;
  const loadGP = async () => { try { const p = await jg('/api/buddy/plan'); const ch = JSON.stringify(p.goals) !== JSON.stringify(GP); GP = p.goals; GPT = Date.now(); return ch; } catch (e) { return false; } };
  const goalCard = () => { if (!GP || Date.now() - GPT > 8000) loadGP().then(ch => { if (ch && view === 'task' && !document.querySelector('#modal.on') && !document.activeElement?.closest?.('input,select')) render(); });
    if (!GP || !GP.length) return '';
    const late = d => d && new Date(d) < new Date() ? ' <span class="badge r">overdue</span>' : '';
    return `<div class="card"><h3>🎯 Goal priorities (${GP.length})</h3><p class="sm">Your order. #1 is what Buddy tells you to do first. Move goals with ▲ ▼.</p>${GP.map((t, k) => `<div class="row"><div class="t" style="white-space:normal"><b>#${t.rank}</b> ${esc(t.t)} <span class="sm">${t.scope === 'day' ? 'Today' : t.scope === 'week' ? 'This week' : ''}${t.dl ? ' · due ' + esc(String(t.dl).replace('T', ' ')) : ''}${t.rm ? ' · 🔔' : ''}</span>${late(t.dl)}</div><button class="x" data-a="gup" data-p="${t.id}" ${k === 0 ? 'disabled' : ''} title="More important">▲</button><button class="x" data-a="gdown" data-p="${t.id}" ${k === GP.length - 1 ? 'disabled' : ''} title="Less important">▼</button></div>`).join('')}</div>`; };
  const gMove = async (id, dir) => { const r = await jp('/api/buddy/task-rank', {id: +id, dir, all: true}); if (r.note) toast(r.note); GP = r.goals; GPT = Date.now(); await reload(); };
  A.gup = p => gMove(p, 'up'); A.gdown = p => gMove(p, 'down');
  const _task2 = V.task; V.task = () => goalCard() + _task2();

  // ================= shared focus timer: Buddy's window / the corner pop-up can start, pause or finish it; this page follows =================
  const tkey = q => [q.running, q.seg, q.mode, q.endAt, q.rem, q.task, q.cycle, q.act, JSON.stringify(q.cfg)].join('|');
  const tmrSync = async () => { try {
    if (window.apiBusy && apiBusy()) return; const r = await jg('/api/timer?dash=1'), p = C.pomo; if (!p || tkey(r.pomo) === tkey(p)) return;
    if (window.apiBusy && apiBusy()) return; C.pomo = {...p, ...r.pomo}; adoptCfg(await api.cfg()); if ($('pmt') && !document.querySelector('#modal.on')) render(); } catch (e) {} };
  setInterval(tmrSync, 2000);
  { const _done = window.pmDone; window.pmDone = async function (...a) { try { const r = await jg('/api/timer?dash=1'), p = C.pomo; if (p && p.running && (!r.pomo.running || r.pomo.seg !== p.seg)) { await tmrSync(); return; } } catch (e) {} return _done.apply(this, a); }; }
  render();
})();
