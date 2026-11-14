// v9: auto-review banner in Review, "auto" tags, feedback to the learner, and Settings > Backups / data safety.
(() => {
  const jp = (u, b) => fetch(u, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Rize': '1'}, body: JSON.stringify(b || {})}).then(r => r.json());
  const AI = k => (C.auto && C.auto.items && C.auto.items[k]) || null, SG = k => (C.auto && C.auto.sug && C.auto.sug[k]) || null;
  const cn = c => (window.CN && CN[c]) || ({f: 'Productive', b: 'Unproductive', m: 'Meeting', o: 'Other'}[c] || c);
  const pull = async () => { try { adoptCfg(await api.cfg()); } catch (e) {} CM = {}; render(); };
  const nm = id => { const l = window.linkInfoOf ? linkInfoOf(id) : null; return l ? l.n : id.split(':').pop(); };

  window.autoTag = k => { const a = AI(k), s = SG(k); return a && !a.linkOnly ? ` · <span title="${esc(a.why || '')}. Tap another category to correct it, Rize learns from that.">🤖 auto-reviewed ${Math.round((a.conf || 0) * 100)}%</span>` : s ? ` · <span style="color:var(--y)">💡 suggested: ${esc(cn(s.c))}</span>` : ''; };
  window.autoLinked = (k, id) => { const a = AI(k); return !!(a && (a.links || []).includes(id)); };

  // ---- Review banner
  let lastRun = 0;
  const oact = V.act;
  V.act = () => {
    if (Date.now() - lastRun > 60000) { lastRun = Date.now(); jp('/api/auto/run').then(r => { if (r.ok) { C.auto = r.status; render(); } }); }
    const a = C.auto || {}, cv = a.cov || {}, sug = Object.entries(a.sug || {}).slice(0, 12), n = Object.keys(a.sug || {}).length, tot = (cv.auto || 0) + (cv.manual || 0) + (cv.pending || 0);
    const rows = sug.map(([k, s]) => `<div class="row"><div class="t">💡 ${esc(s.name || k.split(':').pop())}<div class="sm">looks <b>${esc(cn(s.c))}</b> (${Math.round((s.conf || 0) * 100)}%)${(s.links || []).length ? ' · for ' + esc(nm(s.links[0])) : ''} · ${esc(s.why || '')}</div></div><button class="btn" data-au="accept" data-k="${esc(k)}">Accept</button><button class="x" data-au="reject" data-k="${esc(k)}" title="Not this, I will decide">✕</button></div>`).join('');
    const banner = `<div class="card" style="border-color:var(--ac)"><div class="flex" style="justify-content:space-between;flex-wrap:wrap"><h3 style="margin:0">🤖 Auto-review ${a.on === false ? '<span class="sm">(off)</span>' : ''}</h3><span><button class="btn alt" data-au="toggle">${a.on === false ? 'Turn on' : 'Turn off'}</button> <button class="btn alt" data-au="run">Run now</button></span></div>
      <p class="sm" style="margin:6px 0">${tot ? `<b>${cv.pct || 0}%</b> of your new sites, apps and videos were sorted for you (${cv.auto} of ${tot}; ${cv.pending} still need you). ` : 'Nothing new to review yet. '}It learns from every correction${(cv.right || cv.wrong) ? ` (so far ${cv.right} confirmed, ${cv.wrong} corrected, confidence needed: ${Math.round((cv.thr || .8) * 100)}%)` : ''}. Tap any category below to correct an automatic one.</p>
      ${n ? `<div class="flex" style="justify-content:space-between"><b>${n} suggestion${n > 1 ? 's' : ''} to confirm</b><button class="btn" data-au="acceptall">Accept all ${n}</button></div>${rows}` : ''}</div>`;
    return banner + oact();
  };
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-au]'); if (!b) return; const op = b.dataset.au, k = b.dataset.k || '';
    if (op === 'run') { toast('Reviewing…'); const r = await jp('/api/auto/run'); if (r.ok) C.auto = r.status; await pull(); toast(`Done: ${r.applied || 0} sorted, ${r.suggested || 0} suggestions`); return; }
    if (op === 'toggle') { const r = await jp('/api/auto/toggle', {on: C.auto && C.auto.on === false}); C.auto = r.status; render(); return; }
    if (op === 'adv') { const r = await jp('/api/auto/toggle', {adv: !(C.auto && C.auto.adv !== false)}); C.auto = r.status; render(); return; }
    if (['accept', 'reject', 'acceptall'].includes(op)) { const r = await jp('/api/auto/feedback', {key: k, op}); await pull(); toast(op === 'acceptall' ? `Accepted ${r.n} 👍` : op === 'accept' ? 'Accepted 👍' : 'OK, you decide'); }
  });

  // ---- corrections teach the learner
  const _setcat = A.setcat; A.setcat = async p => { const [i, c] = p.split(','), k = QL[+i]; await _setcat(p); if (k) { await jp('/api/auto/feedback', {key: k, op: 'set', c}); adoptCfg(await api.cfg()); } };
  const _unlink = A.unlink; A.unlink = async p => { const n = p.indexOf(','), k = QL[+p.slice(0, n)], id = p.slice(n + 1), was = k && autoLinked(k, id); await _unlink(p); if (was) { await jp('/api/auto/feedback', {key: k, op: 'unlink'}); adoptCfg(await api.cfg()); render(); } };

  // ---- v11: live Review ("what am I doing now" + the last 2 productive / 2 unproductive) and the progress map
  const CATN = {f: 'Productive', m: 'Meeting', b: 'Not productive', o: 'Not reviewed'}, CATC = {f: 'var(--g)', m: 'var(--ac)', b: 'var(--r)', o: 'var(--mt)'};
  const ico = k => k === 'app' ? '🖥' : k === 'youtube' ? '▶' : '🌐';
  const chips = L => (L || []).map(n => `<span class="lk"><b>✓</b> ${esc(n)}</span>`).join('');
  const rvRow = (x, flip) => `<div class="row"><div class="t">${ico(x.kind)} ${esc(x.name)} ${x.auto ? '<small title="Sorted by auto-review">🤖</small>' : ''}<div class="sm">${x.agoMin != null ? (x.agoMin < 1 ? 'just now' : x.agoMin + ' min ago') + ' · ' : ''}${fm(x.min)}${x.today > x.min + 0.5 ? ' (' + fm(x.today) + ' today)' : ''}</div></div>${x.canLabel ? `<button class="btn alt" data-rs="${esc(x.key)}" data-c="${flip}">${flip === 'f' ? '✅ Productive' : '🚫 Not productive'}</button>` : ''}</div>`;
  const rvHtml = R => {
    if (!R) return '<p class="sm">Looking…</p>'; const n = R.now;
    const now = !n ? '<p class="sm">Idle right now: nothing is being tracked.</p>' : `<div class="row" style="border:1px solid ${CATC[n.cat]};border-radius:10px;padding:8px"><div class="t">${ico(n.kind)} <b>${esc(n.name)}</b> <span class="pill" style="color:${CATC[n.cat]}">${CATN[n.cat] || ''}</span> ${n.auto ? '<small title="Sorted by auto-review">🤖</small>' : ''}<div class="sm">${n.note ? esc(n.note) : fm(n.min) + ' in a row' + (n.today > n.min + .5 ? ' · ' + fm(n.today) + ' today' : '')} · ${n.cat === 'f' || n.cat === 'm' ? (n.onGoal ? '✅ counts for your goal' : '⚠ productive, but not for your current goal') : n.cat === 'b' ? '🚫 counts as a distraction' : 'not reviewed yet'}</div></div>${n.canLabel ? `<span style="display:flex;gap:6px"><button class="btn${n.cat === 'f' ? '' : ' alt'}" data-rs="${esc(n.key)}" data-c="f">✅</button><button class="btn${n.cat === 'b' ? '' : ' alt'}" data-rs="${esc(n.key)}" data-c="b">🚫</button></span>` : ''}</div>`;
    return `<div class="lab sm"><b>Right now</b></div>${now}
      <div class="lab sm" style="margin-top:10px"><b style="color:var(--g)">Before this: 2 productive</b></div>${R.productive.map(x => rvRow(x, 'b')).join('') || '<p class="sm">No productive site or app in the last 3 days yet.</p>'}
      <div class="lab sm" style="margin-top:10px"><b style="color:var(--r)">Before this: 2 not productive</b></div>${R.unproductive.map(x => rvRow(x, 'f')).join('') || '<p class="sm">Nothing unproductive recently 👏</p>'}
      ${R.unreviewed ? `<p class="sm" style="margin-top:8px">${R.unreviewed} other site / app${R.unreviewed > 1 ? 's' : ''} used recently ${R.unreviewed > 1 ? 'are' : 'is'} not reviewed yet (see the list below).</p>` : ''}`;
  };
  let RV = null, PM = null, pmT = 0; const pmFetch = async () => { try { PM = await fetch('/api/progress').then(r => r.json()); pmT = Date.now(); } catch (e) {} };
  const rvFetch = async () => { try { RV = await fetch('/api/review/now').then(r => r.json()); } catch (e) {} const el = $('rvnow'); if (el && !(el.matches(':hover') && document.activeElement && el.contains(document.activeElement))) el.innerHTML = rvHtml(RV); };
  const pmBar = (p, h = 6) => `<div style="background:var(--pn2);border-radius:99px;height:${h}px;overflow:hidden"><div style="width:${Math.max(0, Math.min(100, p))}%;height:100%;background:var(--ac)"></div></div>`;
  const taskLine = t => `<div class="sm" style="display:flex;gap:6px;align-items:center;margin:2px 0 0 14px"><span style="width:14px">${t.done ? '✅' : '▫'}</span><span style="flex:1">${esc(t.title)}${t.rank ? ' <small>#' + t.rank + '</small>' : ''}</span><span>${t.p}%${t.spent ? ' · ⏱ ' + fm(t.spent) : ''}${t.est ? ' / ' + fm(t.est) : ''}</span></div>${t.sites.length ? `<div class="lks" style="margin-left:28px">${t.sites.map(s => `<span class="lk">${esc(s.name)} · ${fm(s.min)}</span>`).join('')}</div>` : ''}`;
  const pmHtml = () => {
    if (!PM) return '<p class="sm">Loading…</p>'; const rv = PM.review || {};
    const ex = PM.exams.map(e => `<div style="margin:8px 0;padding:8px;border:1px solid var(--ln);border-radius:10px"><div class="flex" style="justify-content:space-between"><b>🎓 ${esc(e.name)}</b><span class="sm">${e.prep}% ready${e.minutes ? ' · ⏱ ' + fm(e.minutes) : ''} · tasks ${e.tasksDone}/${e.tasksTotal}</span></div>${pmBar(e.prep, 8)}
      ${e.chapters.map(c => `<div style="margin-top:8px"><div class="flex" style="justify-content:space-between"><span>${esc(c.name)} ${c.follows ? `<small class="rt">🔗 follows ${c.follows} task${c.follows > 1 ? 's' : ''}</small>` : ''}${c.autoMin ? '<small class="rt">⏱ follows your time</small>' : ''}</span><span class="sm">${c.p}%${c.minutes ? ' · ⏱ ' + fm(c.minutes) : ''}</span></div>${pmBar(c.p)}${c.sites.length ? `<div class="lks" style="margin-top:3px">${c.sites.map(s => `<span class="lk" title="Reviewed site / app linked to this topic">${esc(s.name)} · ${fm(s.min)}</span>`).join('')}</div>` : ''}${c.tasks.map(taskLine).join('')}</div>`).join('') || '<p class="sm">No chapters yet.</p>'}
      ${e.tasks.length ? `<div style="margin-top:8px"><span class="sm">Tasks for the whole exam</span>${e.tasks.map(taskLine).join('')}</div>` : ''}</div>`).join('') || '<p class="sm">Add an exam to see its progress here.</p>';
    return `<p class="sm">Everything you enter is linked: tasks move their chapter, the chapter moves the exam, and the sites / apps you reviewed add the minutes. Drag a chapter slider any time to set it yourself.</p>${ex}${PM.loose.length ? `<div style="margin-top:8px"><span class="sm">Tasks not linked to an exam yet</span>${PM.loose.map(taskLine).join('')}</div>` : ''}`;
  };
  const unlinkedHtml = () => {
    if (!PM) return ''; const rv = PM.review || {}; const o = window.goalOptsOf ? goalOptsOf() : {topics: [], exams: [], tasks: []};
    const sel = k => `<select class="ulk" data-k="${esc(k)}" style="max-width:190px"><option value="">＋ Link to…</option>${[['Exam topics', o.topics], ['Exams', o.exams], ['Tasks', o.tasks]].map(([t, a]) => a && a.length ? `<optgroup label="${t}">${a.map(y => `<option value="${esc(y.id)}">${esc(y.name)}</option>`).join('')}</optgroup>` : '').join('')}</select>`;
    return `<div class="card"><div class="flex" style="justify-content:space-between"><h3 style="margin:0">🔗 Review → progress</h3><span class="sm">last ${rv.days} days</span></div>
      <p class="sm" style="margin:6px 0"><b>${rv.pct}%</b> of your productive time (${fm(rv.linkedMin)}) is linked to an exam topic or task and counts toward its progress. ${rv.unlinkedMin ? `${fm(rv.unlinkedMin)} is not linked yet.` : 'Everything is linked 🎉'}</p>${pmBar(rv.pct, 8)}
      ${(rv.unlinked || []).map(x => `<div class="row"><div class="t">${esc(x.name)}<div class="sm">${fm(x.min)} productive, not linked</div></div>${sel(x.key)}</div>`).join('')}</div>`;
  };
  const oact2 = V.act;
  V.act = () => { rvFetch(); if (Date.now() - pmT > 15000) pmFetch().then(() => view === 'act' && render()); return `<div class="card" style="border-color:var(--g)"><div class="flex" style="justify-content:space-between"><h3 style="margin:0">🔍 What am I doing now?</h3><span class="sm">live</span></div><div id="rvnow">${rvHtml(RV)}</div></div>` + oact2() + unlinkedHtml(); };
  setInterval(() => { if (typeof view !== 'undefined' && view === 'act' && !document.hidden) rvFetch(); }, 4000);
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-rs]'); if (!b) return;
    b.disabled = true; await jp('/api/review/set', {key: b.dataset.rs, c: b.dataset.c}); adoptCfg(await api.cfg()); CM = {}; await rvFetch(); await pmFetch(); toast(b.dataset.c === 'f' ? 'Marked productive ✅' : 'Marked not productive 🚫'); render();
  });
  document.addEventListener('change', async e => {
    const s = e.target.closest('.ulk'); if (!s || !s.value) return; const k = s.dataset.k; C.va = C.va || {}; const cur = C.va[k]; const l = cur === undefined || cur === '' ? [] : Array.isArray(cur) ? cur : [cur];
    if (!l.includes(s.value)) l.push(s.value); C.va[k] = l.length === 1 ? l[0] : l; CM = {}; toast('Linked 🔗 its time now counts toward that goal'); render(); saveBg().then(() => pmFetch()).then(() => render());
  });

  // ---- Settings: data safety
  let BK = null, HL = null; const loadBK = async () => { try { [BK, HL] = await Promise.all([fetch('/api/backups').then(r => r.json()), fetch('/api/health').then(r => r.json())]); } catch (e) {} };
  const when = t => new Date(t).toLocaleString([], {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
  const oset = V.set;
  V.set = () => {
    if (!BK) loadBK().then(() => view === 'set' && render());
    const a = C.auto || {}, rows = ((BK && BK.items) || []).slice(0, 14).map(b => `<div class="row"><div class="t">${b.kind === 'daily' ? '📅 Daily' : b.kind === 'mirror' ? '📁 Documents copy' : '🕒 Auto'} · ${when(b.t)}<div class="sm">${b.sessions} sessions · ${b.tasks} tasks · ${b.exams} exams · ${b.kb} KB${b.ok ? '' : ' · unreadable'}</div></div>${b.ok ? `<button class="btn alt" data-bk="restore" data-n="${esc(b.name)}">Restore</button>` : ''}</div>`).join('');
    const panel = `<div class="card"><h3>🛡 Data safety</h3>
      <p class="sm">Your data is saved every few seconds, written safely (it can't end up half-written), copied to a rolling backup every ~5 minutes plus one per day, and saved one last time when Windows shuts down. A key-less copy also goes to <b>${esc((BK && BK.mirror) || 'Documents\\RizeBuddy-backup')}</b>. If the main file is ever damaged, the newest backup is restored by itself and Buddy tells you.</p>
      <p class="sm">${HL ? (HL.ok ? '✅ Saving is healthy' : '⚠ Saving is paused to protect your data') + ` · ${HL.sessions} sessions, ${HL.tasks} tasks, ${HL.exams} exams · last save ${HL.lastSave ? when(HL.lastSave) : '–'}${HL.errors ? ' · ' + HL.errors + ' save errors (see rize.log)' : ''}${HL.note ? ' · started from: ' + esc(HL.source) : ''}` : 'Checking…'}</p>
      <div class="flex"><button class="btn" data-bk="now">Back up now</button><button class="btn alt" data-bk="folder">Open data folder</button></div>
      <div style="margin-top:8px;max-height:260px;overflow:auto">${rows || '<div class="sm">No backups yet.</div>'}</div></div>
      <div class="card"><h3>🤖 Automation</h3>
      <div class="sw ${a.on !== false ? 'on' : ''}" data-au="toggle" style="border:0;padding:6px 0"><i></i><div><b>Auto-review sites, apps and videos</b><div class="sm">Sorts new items for you using what you already labelled, your exam words and well-known study / distraction sites, and links Focus items to the right topic or task. Only asks when unsure.</div></div></div>
      <div class="sw ${a.adv !== false ? 'on' : ''}" data-au="adv" style="border:0;padding:6px 0"><i></i><div><b>Move on automatically when a goal is finished</b><div class="sm">When the current goal's task or chapter is completed (or deleted), Buddy sets the next best one from your exam priorities.</div></div></div></div>`;
    return panel + oset();
  };
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-bk]'); if (!b) return;
    if (b.dataset.bk === 'now') { await jp('/api/backups/now'); await loadBK(); render(); toast('Backed up ✅'); }
    if (b.dataset.bk === 'folder') { const r = await jp('/api/data/folder'); if (!r.ok) toast('Could not open the folder'); }
    if (b.dataset.bk === 'restore') {
      const m = modal(`<h3 style="font-size:16px">Restore this backup?</h3><p class="sm">Your current data is backed up first, so you can undo this. The app reloads afterwards.</p><div class="flex" style="justify-content:flex-end;margin-top:14px"><button class="btn alt" data-a="mcancel">Cancel</button><button class="btn" id="bkgo">Restore</button></div>`);
      m.onclick = async ev => { if (ev.target.id !== 'bkgo') return; const r = await jp('/api/backups/restore', {name: b.dataset.n}); if (r.ok) location.reload(); else toast(r.err || 'Restore failed'); };
    }
  });
  render();
})();
