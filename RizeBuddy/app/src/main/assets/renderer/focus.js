// Rize Buddy additions: collapsible sidebar, current goal, focus streaks (crown + graph).
(() => {
  const jf = (u, b) => fetch(u, b === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Rize': '1'}, body: JSON.stringify(b)}).then(r => r.json());
  let FD = null, GH = null, RANGE = 14;
  const mins = m => m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
  const gname = () => FD && FD.goal && FD.goal.name ? FD.goal.name : 'Any productive work';
  async function load() { try { FD = await jf(`/api/focus?days=${Math.max(RANGE, 14)}`); GH = await jf('/api/goal/history'); const b = $('goalb'); if (b) b.textContent = '🎯 ' + gname(); } catch (e) {} }
  const refresh = async () => { await load(); if (['streak', 'rep', 'act'].includes(view)) render(); };

  // ---- sidebar collapse ----
  const style = document.createElement('style');
  style.textContent = `.app.nc nav{display:none}.app.nc{grid-template-columns:1fr 330px}.app.nc.wide{grid-template-columns:1fr}
  .crown{filter:drop-shadow(0 2px 4px #f2784b55)}.strk .bar-r{transition:height .5s}.gpick{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.gpick .btn.on{background:var(--ac);color:#fff}
  .lks{display:flex;flex-wrap:wrap;gap:5px;align-items:center;justify-content:flex-end;max-width:440px}.lk{display:inline-flex;gap:5px;align-items:center;max-width:210px;white-space:nowrap;background:color-mix(in srgb,var(--g) 14%,var(--pn));border:1px solid color-mix(in srgb,var(--g) 40%,var(--ln));border-radius:99px;padding:2px 4px 2px 9px;font-size:12px}.lk b{color:var(--g)}.lk small{opacity:.6}.lk .x{padding:0 5px}.lk.auto{background:var(--pn2);border-color:var(--ln);padding:2px 9px;color:var(--mt)}`;
  document.head.append(style);
  const tog = document.createElement('button'); tog.className = 'btn alt'; tog.id = 'navt'; tog.title = 'Show / hide the side panel'; tog.textContent = '☰';
  const h1 = $('date'), wrap = document.createElement('div'); wrap.className = 'flex'; h1.replaceWith(wrap); wrap.append(tog, h1);
  const applyNav = () => $('app').classList.toggle('nc', localStorage.getItem('nc') === '1');
  tog.onclick = () => { localStorage.setItem('nc', localStorage.getItem('nc') === '1' ? '0' : '1'); applyNav(); };
  applyNav();

  // ---- current goal button + picker ----
  const gb = document.createElement('button'); gb.className = 'btn alt'; gb.id = 'goalb'; gb.title = 'Only work on this goal counts'; gb.textContent = '🎯 …';
  $('bud').before(gb); gb.onclick = () => pickGoal();
  const setGoal = async (id, name, kind) => { await jf('/api/curgoal', {id, name, kind}); closeModal(); toast(name ? `Current goal: ${name} 🎯` : 'Goal cleared'); await refresh(); };
  // goal options come from exam topics (chapters), exams and normal tasks
  const goalOpts = () => {
    const topics = [], exams = [], tasks = [];
    (C.exams || []).forEach(e => { exams.push({id: 'g:exam:' + e.id, name: e.name, kind: 'exam'}); (e.ch || []).filter(c => (c.p || 0) < 100).forEach(c => topics.push({id: 'g:chap:' + c.id, name: c.name, exam: e.name, dl: c.dl || '9999', kind: 'chap'})); });
    topics.sort((a, b) => a.dl < b.dl ? -1 : 1); (C.tasks || []).filter(t => !t.done).forEach(t => tasks.push({id: 'g:task:' + t.id, name: t.title, kind: 'task'}));
    return {topics, exams, tasks};
  };
  const goalBtns = (cls, attr, sel) => { const o = goalOpts(), b = (x, sub) => `<button class="btn ${cls} ${sel === x.id ? 'on' : ''}" ${attr}="${esc(x.id)}" data-gn="${esc(x.name)}" data-gk="${x.kind}">${esc(x.name)}${sub ? ` <small style="opacity:.6">· ${esc(sub)}</small>` : ''}</button>`;
    const sec = (t, l) => l.length ? `<div class="sm" style="margin:8px 0 2px">${t}</div><div class="gpick">${l.join('')}</div>` : '';
    return sec('📚 Exam topics', o.topics.slice(0, 10).map(x => b(x, x.exam))) + sec('🎓 Exams', o.exams.slice(0, 6).map(x => b(x))) + sec('✅ Tasks', o.tasks.slice(0, 8).map(x => b(x))); };
  const ago = t => { const d = Math.round((Date.now() - t) / 864e5); return d < 1 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; };
  window.pickGoal = async () => {
    await load(); const g = FD ? FD.goal : {id: '', name: ''}, items = (GH && GH.items) || [], prev = items.filter(x => x.status !== 'active');
    const hist = prev.length ? `<div class="sm" style="margin:12px 0 2px">🕘 Previous goals · tap to resume</div>${prev.slice(0, 10).map(x => `<div class="row" style="padding:6px 0"><div class="t"><b>${esc(x.name)}</b> ${x.status === 'done' ? '<span class="badge g">finished</span>' : ''}<div class="sm">${mins(x.min)} worked · last ${ago(x.last)}</div></div>${x.status === 'done' ? '' : `<button class="btn alt" data-gid="${esc(x.id)}" data-gn="${esc(x.name)}" data-gk="${esc(x.kind)}">▶ Resume</button>`}</div>`).join('')}` : '';
    $('modal').innerHTML = `<div class="mbox" style="max-height:88vh;overflow:auto"><h3 style="font-size:16px;color:var(--tx)">🎯 Current goal</h3><p class="sm">Goals come from your <b>exams</b> (topics) or <b>tasks</b>, so everything stays in one plan. Only work on the current goal counts as productive.</p>
    <div class="card" style="margin:8px 0"><div class="sm">Now</div><b>${g.name ? esc(g.name) : 'Anything productive'}</b></div>
    ${goalBtns('alt', 'data-gid', g.id)}<div class="gpick"><button class="btn alt ${!g.id && !g.name ? 'on' : ''}" data-gid="" data-gn="" data-gk="">Anything productive</button></div>${hist}
    <p class="sm">Nothing to pick? Add an exam topic in <b>Exams</b> or a task in <b>Tasks</b> first.</p>
    <div class="flex" style="justify-content:flex-end;margin-top:10px"><button class="btn alt" id="gc">Close</button></div></div>`;
    $('modal').classList.add('on'); $('modal').querySelectorAll('[data-gn]').forEach(b => b.onclick = () => setGoal(b.dataset.gid, b.dataset.gn, b.dataset.gk)); $('gc').onclick = closeModal;
  };
  A.pickgoal = () => pickGoal();

  // ---- Review: ask for the current goal ----
  const goalAsk = () => {
    const g = FD ? FD.goal : {id: '', name: ''};
    return `<div class="ask" style="flex-wrap:wrap"><div class="t">🎯 <b>What is your current goal right now?</b> <span class="sm">Now: <b>${esc(gname())}</b>. Only work on it counts; other sites/apps are timepass.</span></div>${goalBtns('alt', 'data-fg', g.id)}<div class="gpick"><button class="btn alt ${!g.id && !g.name ? 'on' : ''}" data-fg="" data-gn="" data-gk="">Anything</button><button class="btn" data-a="pickgoal">Goal history…</button><button class="btn alt" data-v="task">＋ New task</button></div></div>`;
  };
  document.addEventListener('click', e => { const b = e.target.closest('[data-fg]'); if (b) setGoal(b.dataset.fg, b.dataset.gn, b.dataset.gk); });
  // Review shows the TRUE category you chose; every other view treats Focus that is off-goal as Unproductive
  let RAW = false; const oact = V.act, oyt = V.yt;
  V.act = () => { RAW = true; try { return goalAsk() + oact(); } finally { RAW = false; } }; V.yt = () => { RAW = true; try { return goalAsk() + oyt(); } finally { RAW = false; } };
  CN.b = 'Unproductive';
  const wm = (name, text) => { name = (name || '').toLowerCase().trim(); if (!name) return false; if (text.includes(name)) return true; const sig = (name.match(/[a-z0-9]+/g) || []).filter(w => w.length >= 4); return sig.length > 0 && sig.filter(w => text.includes(w)).length >= Math.max(1, Math.floor((sig.length + 1) / 2)); };
  const goalAt = t => { let g = {id: '', name: ''}; for (const x of (FD && FD.log) || []) { if (x.t <= t) g = x; else break; } return g; };
  // linked things count together (same rule as links.goal_ids on the tray app): a task counts for its chapter, a chapter for its tasks, an exam for everything under it
  function goalFam(g) {
    const ids = new Set(g.id ? [g.id] : []), names = [g.name], tk = c => (C.tasks || []).filter(t => String(t.chap) === String(c));
    const addC = (c, ex) => { ids.add('g:chap:' + c.id); names.push(c.name, ...(c.refs || [])); tk(c.id).forEach(t => { ids.add('g:task:' + t.id); names.push(t.title); }); };
    const gid = g.id || '';
    if (gid.startsWith('g:task:')) { const t = (C.tasks || []).find(x => 'g:task:' + x.id === gid); if (t && t.chap != null && t.chap !== '') (C.exams || []).forEach(e => (e.ch || []).filter(c => String(c.id) === String(t.chap)).forEach(c => addC(c))); }
    else if (gid.startsWith('g:chap:')) (C.exams || []).forEach(e => (e.ch || []).filter(c => 'g:chap:' + c.id === gid).forEach(c => addC(c)));
    else if (gid.startsWith('g:exam:')) (C.exams || []).filter(e => 'g:exam:' + e.id === gid).forEach(e => { names.push(...(e.refs || [])); (e.ch || []).forEach(c => addC(c)); (C.tasks || []).filter(t => String(t.exam) === String(e.id)).forEach(t => { ids.add('g:task:' + t.id); names.push(t.title); }); });
    if (gid.startsWith('g:task:')) { const t = (C.tasks || []).find(x => 'g:task:' + x.id === gid); const e = t && t.exam != null && t.exam !== '' ? (C.exams || []).find(x => String(x.id) === String(t.exam)) : null; if (e) { ids.add('g:exam:' + e.id); names.push(e.name); } }
    return {ids, names};
  }
  function onGoal(s) {
    const g = goalAt(s.start); if (!g.id && !g.name) return true;
    const v = vl((C.va || {})[s._k]), {ids, names} = goalFam(g);
    if (v.some(x => ids.has(x))) return true;
    if (g.id && !g.id.startsWith('g:')) { const a = areaOf(s); if (a && a.id === g.id) return true; } else if (v.some(x => x.startsWith('g:'))) return false;
    const t = (s.app + ' ' + s.title).toLowerCase(); return names.some(n => wm(n, t));
  }
  const _cat = cat; window.rawBk = s => _cat(s).c; cat = function (s) { const r = _cat(s); return !RAW && FD && r.c === 'f' && !onGoal(s) ? {...r, c: 'b', off: true} : r; };
  // ---- Review: an app / site / video can serve SEVERAL topics / tasks. Linked ones show as ticks, "+" adds another. Completed ones stay visible. ----
  const linkInfo = id => {
    if (id.startsWith('g:task:')) { const t = (C.tasks || []).find(x => 'g:task:' + x.id === id); return t && {n: t.title, done: !!t.done}; }
    if (id.startsWith('g:chap:')) { for (const e of C.exams || []) { const c = (e.ch || []).find(x => 'g:chap:' + x.id === id); if (c) return {n: c.name, done: (c.p || 0) >= 100}; } return null; }
    if (id.startsWith('g:exam:')) { const e = (C.exams || []).find(x => 'g:exam:' + x.id === id); return e && {n: e.name, done: false}; }
    const a = aOf(id); return a && {n: a.name, done: false};
  };
  window.linkInfoOf = linkInfo; window.goalOptsOf = () => goalOpts();
  const doneOpts = () => { const o = []; (C.tasks || []).filter(t => t.done).forEach(t => o.push({id: 'g:task:' + t.id, name: t.title})); (C.exams || []).forEach(e => (e.ch || []).filter(c => (c.p || 0) >= 100).forEach(c => o.push({id: 'g:chap:' + c.id, name: c.name + ' (' + e.name + ')'}))); return o; };
  areaSel = function (x, i) {
    const cur = (C.va || {})[x.k], list = vl(cur), au = cur === undefined ? areaOf(x.s) : null, o = goalOpts();
    const chips = list.map(id => { const n = linkInfo(id); return n ? `<span class="lk" title="${esc(n.n)}"><b>✓</b> ${esc(n.n)}${n.done ? ' <small>done</small>' : ''}${window.autoLinked && autoLinked(x.k, id) ? ' <small title="Linked by auto-review: tap ✕ if it is wrong and it will learn">🤖 auto</small>' : ''}<button class="x" data-a="unlink" data-p="${i},${esc(id)}" title="Remove this link">✕</button></span>` : ''; }).join('');
    const op = a => a.filter(y => !list.includes(y.id)).map(y => `<option value="${esc(y.id)}">${esc(y.name)}</option>`).join('');
    const grp = (t, a) => { const h = op(a); return h ? `<optgroup label="${t}">${h}</optgroup>` : ''; };
    return `<div class="lks">${chips}${au ? `<span class="lk auto">${esc(au.name)} · auto</span>` : ''}<select class="ars plus" id="ar_${i}" title="Link to a topic / task. You can link several."><option value="">＋ ${list.length ? 'Link another' : 'Link topic / task'}</option>${grp('Exam topics', o.topics)}${grp('Exams', o.exams)}${grp('Tasks', o.tasks)}${grp('Areas', (C.areas || []).map(a => ({id: a.id, name: a.name})))}${grp('Completed', doneOpts())}<option value="-">No area</option>${cur !== undefined ? '<option value="~">↺ Reset to auto</option>' : ''}</select></div>`;
  };
  A.unlink = async p => { const n = p.indexOf(','), k = QL[+p.slice(0, n)], id = p.slice(n + 1); if (!k) return; const l = vl(C.va[k]).filter(x => x !== id); if (l.length) C.va[k] = l.length === 1 ? l[0] : l; else delete C.va[k]; CM = {}; render(); saveBg(); };

  // ---- minutes the Review links add to a task / chapter (shared sites split their time between the topics they serve) ----
  const LK = {key: '', map: {}}; let IV = {};
  const ivOf = id => IV[id] || (IV[id] = (C.entries || []).filter(e => id.startsWith('g:task:') ? (e.taskId != null ? 'g:task:' + e.taskId === id : e.task && e.task === ((C.tasks || []).find(t => 'g:task:' + t.id === id) || {}).title) : id.startsWith('g:chap:') ? e.link && 'g:chap:' + e.link.ch === id : false).map(e => [e.start, e.end]));
  const overlap = (id, s) => Math.min(dur(s), ivOf(id).reduce((t, [a, b]) => t + Math.max(0, Math.min(b, s.end) - Math.max(a, s.start)) / 6e4, 0));   // already logged by the timer: never counted twice
  function calcLinks() {
    const out = {}; IV = {};
    for (const s of S) {
      const ids = vl((C.va || {})[s._k]).filter(x => x.startsWith('g:')); if (!ids.length) continue;
      const c = rawBk(s); if (c !== 'f' && c !== 'm') continue;
      for (const id of ids) out[id] = (out[id] || 0) + Math.max(0, dur(s) - overlap(id, s)) / ids.length;
    }
    return out;
  }
  window.linkMin = id => { const k = S.length + '|' + (S.length ? S[S.length - 1].end : 0) + '|' + (C.entries || []).length + '|' + JSON.stringify(C.va || {}) + '|' + JSON.stringify(C.v || {}); if (LK.key !== k) { LK.key = k; LK.map = calcLinks(); } return Math.round(LK.map[id] || 0); };
  // exams/tasks can be updated from the corner pop-up: pull them in when idle
  setInterval(async () => { if ((window.apiBusy && apiBusy()) || document.querySelector('#modal.on') || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
    try { const c = await api.cfg(); const ch = ['exams', 'tasks', 'v', 'va', 'areas', 'projects', 'clients', 'entries'].some(k => JSON.stringify(c[k]) !== JSON.stringify(C[k])) || JSON.stringify(c.auto) !== JSON.stringify(C.auto); adoptCfg(c); if (ch) { CM = {}; render(); } } catch (e) {} }, 15000);

  // ---- streak graph ----
  function graph(days, h = 230) {
    const W = 760, L = 56, B = 28, T = 48, n = days.length, bw = (W - L) / n, mx = Math.max(60, ...days.map(d => d.best)), best = days.reduce((a, d) => d.best > a.best || (d.best === a.best && d.best > 0) ? d : a, {best: 0});
    const y = v => T + (h - T - B) * (1 - v / mx), steps = [0, .5, 1].map(f => Math.round(mx * f / 15) * 15);
    return `<svg viewBox="0 0 ${W} ${h}" style="width:100%;max-width:820px;height:auto;display:block;margin:0 auto">${steps.map(v => `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#F1D9C4"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="#9A7B67">${mins(v)}</text>`).join('')}
    ${days.map((d, i) => { const x = L + i * bw + bw * .18, w = bw * .64, isB = d.best > 0 && d === best, dt = new Date(d.d + 'T12:00');
      return `<g><rect class="bar-r" x="${x}" y="${y(d.best)}" width="${w}" height="${Math.max(0, h - B - y(d.best))}" rx="5" fill="${isB ? '#F2784B' : '#FFC24B'}"><title>${dt.toDateString()} · best streak ${mins(d.best)} · work ${mins(d.work)}</title></rect>
      ${isB ? `<text class="crown" x="${x + w / 2}" y="${y(d.best) - 6}" text-anchor="middle" font-size="20">👑</text>` : ''}${d.best ? `<text x="${x + w / 2}" y="${y(d.best) - (isB ? 28 : 5)}" text-anchor="middle" font-size="10" fill="#4A3428" font-weight="700">${mins(d.best)}</text>` : ''}
      <text x="${x + w / 2}" y="${h - 10}" text-anchor="middle" font-size="10" fill="#9A7B67">${n <= 16 ? dt.toLocaleDateString(undefined, {weekday: 'short'}) + ' ' + dt.getDate() : dt.getDate()}</text></g>`; }).join('')}</svg>`;
  }
  const bestDay = days => days.reduce((a, d) => d.best > a.best ? d : a, {best: 0, d: ''});
  const crownLine = days => { const b = bestDay(days); return b.best ? `<b>👑 ${new Date(b.d + 'T12:00').toDateString()}</b> · ${mins(b.best)} unbroken` : 'No streak yet. Start a focus block on your goal 💪'; };
  function streakCard(days) {
    return `<div class="card strk"><div class="flex" style="justify-content:space-between"><h3 style="margin:0">🔥 Focus streaks</h3><span class="sm">${crownLine(days)}</span></div>
    <p class="sm" style="margin:4px 0 8px">Longest unbroken work on your goal each day (${FD.gap}-min breaks don't count as a break). Goal: <b>${esc(gname())}</b></p>${graph(days)}</div>`;
  }
  V.streak = () => {
    if (!FD) { load().then(render); return '<div class="card">Loading…</div>'; }
    const days = FD.days.slice(-RANGE), t = FD.days[FD.days.length - 1], b = bestDay(FD.days.slice(-RANGE)), todayCrown = t && t.best > 0 && t.d === b.d;
    return `<div class="grid4"><div class="card"><div class="sm">Today's max streak ${todayCrown ? '<span class="crown">👑</span>' : ''}</div><div class="big">${mins(FD.best)}</div><div class="sm">live now: <b style="color:var(--ac)">${mins(FD.live)}</b></div></div>
    <div class="card"><div class="sm">Best day (${RANGE}d) 👑</div><div class="big">${mins(b.best)}</div><div class="sm">${b.d ? new Date(b.d + 'T12:00').toDateString() : '–'}</div></div>
    <div class="card"><div class="sm">Work on goal today</div><div class="big">${mins(t ? t.work : 0)}</div><div class="sm">🎯 ${esc(gname())}</div></div>
    <div class="card"><div class="sm">Streak rule</div><div class="big">${FD.gap}m</div><div class="sm">a longer break resets it</div></div></div>
    <div class="flex" style="margin:10px 0"><div class="seg">${[14, 30, 60].map(r => `<button data-sr="${r}" class="${RANGE === r ? 'on' : ''}">${r} days</button>`).join('')}</div></div>${streakCard(days)}
    <div class="card"><h3>How it works</h3><p class="sm">A streak is unbroken work on your <b>current goal</b>: work 1 h, take a ≤${FD.gap} min breather, work 1 h more = a <b>2 h streak</b>. Step away longer, or open something unrelated, and it resets. The day with the longest streak gets the 👑.</p></div>`;
  };
  document.addEventListener('click', async e => { const b = e.target.closest('[data-sr]'); if (b) { RANGE = +b.dataset.sr; await load(); render(); } });
  const orep = V.rep; V.rep = () => { const h = orep(); if (!FD) { load().then(render); return h; } const i = h.indexOf('<div class="card">'); const c = streakCard(FD.days.slice(-14)); return i < 0 ? h + c : h.slice(0, i) + c + h.slice(i); };
  const g = NAV.find(x => x[0] === 'Analyze'); g[1].splice(1, 0, ['streak', '🔥', 'Streaks']);
  load().then(() => render()); setInterval(refresh, 20000);
})();
