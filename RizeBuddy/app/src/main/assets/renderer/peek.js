const $ = id => document.getElementById(id), q = new URLSearchParams(location.search), kind = q.get('k') || 'peek', arg = q.get('a') || '';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const dur = m => m >= 2880 ? Math.floor(m / 1440) + 'd' : m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm';
const hm = m => Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
const jp = (u, b) => fetch(u, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Rize': '1'}, body: JSON.stringify(b)}).then(r => r.json());
let D = null, pinned = false, timer = null, LIFE = kind === 'streak' ? 11 : 8;
function cd(dl) { if (!dl) return ''; const ms = dl - Date.now(), m = Math.floor(Math.abs(ms) / 6e4); return ms < 0 ? `<span class="cd late">overdue ${dur(m)}</span>` : `<span class="cd">${dur(m)} left</span>`; }
function draw(full) {
  if (!D) return;
  $('work').innerHTML = `Work ${hm(D.work)}<small>${Math.round(D.work / D.target * 100)}% of ${Math.round(D.target / 60)}h</small>`; $('wb').style.width = Math.min(100, D.work / D.target * 100) + '%';
  $('goal').textContent = '🎯 ' + (D.goal.name || 'any productive work'); $('sk').textContent = `🔥 ${D.live}m` + (D.best > D.live ? ` · best ${D.best}m` : '');
  if (!full && pinned) { document.querySelectorAll('.cdh').forEach((el, i) => { el.innerHTML = cd(D.rows[i].dl); }); return; }
  $('rows').innerHTML = D.rows.length ? D.rows.map((r, i) => `<div class="r"><div class="k">${r.rk ? '#' + r.rk + ' · ' : ''}${esc(r.k)}</div><div class="h"><b>${esc(r.t)}</b><span class="cdh">${cd(r.dl)}</span><span class="p" id="pp${i}">${r.p}%</span></div><div class="bar"><i style="width:${r.p}%"></i></div><input type="range" min="0" max="100" step="5" value="${r.p}" data-i="${i}"></div>`).join('') : '<div class="empty">No goals yet 🙂 click here and add one</div>';
  fit();
}
function fit() {                      // shrink the window to its content and stick it to the bottom-right corner
  try { const h = document.body.scrollHeight + (window.outerHeight - window.innerHeight), w = 330 + (window.outerWidth - window.innerWidth);
    window.resizeTo(w, h); window.moveTo(screen.availLeft + screen.availWidth - w, screen.availTop + screen.availHeight - h); } catch (e) {}
}
function pin() {
  if (pinned) return; pinned = true; fetch('/api/peek/pin', {method: 'POST'}); clearTimeout(timer); $('life').style.display = 'none'; document.body.classList.add('pin'); draw(true);
  fetch('/api/goal/options').then(r => r.json()).then(o => {
    const opt = (a, f) => a.map(x => `<option value="${esc(x.id)}" data-n="${esc(x.name)}" data-k="${x.kind}">${f(x)}</option>`).join(''), cur = D.goal.id || '';
    $('gsel').innerHTML = `<option value="">🎯 Current goal: ${esc(D.goal.name || 'anything productive')}</option><option value="" data-n="" data-clear="1">Anything productive</option>` +
      (o.topics.length ? `<optgroup label="Exam topics">${opt(o.topics, x => esc(x.name) + ' · ' + esc(x.exam))}</optgroup>` : '') + (o.exams.length ? `<optgroup label="Exams">${opt(o.exams, x => esc(x.name))}</optgroup>` : '') + (o.tasks.length ? `<optgroup label="Tasks">${opt(o.tasks, x => esc(x.name))}</optgroup>` : '');
    fit();
  });
}
document.addEventListener('click', pin);
document.addEventListener('input', async e => { const r = e.target.closest('input[data-i]'); if (!r) return; const row = D.rows[+r.dataset.i]; $('pp' + r.dataset.i).textContent = r.value + '%'; row.p = +r.value;
  if (row.src === 'c') await jp('/api/chapter', {id: row.id, p: +r.value}); else await jp('/api/buddy/goal', {id: row.id, scope: row.scope, op: 'prog', p: +r.value}); });
$('gsel').onchange = async e => { const o = e.target.selectedOptions[0]; if (o.index === 0) return; await jp('/api/curgoal', {id: o.value, name: o.dataset.n || '', kind: o.dataset.k || ''}); D = await (await fetch('/api/peek')).json(); draw(true); };
$('gnew').onkeydown = async e => { if (e.key !== 'Enter' || !$('gnew').value.trim()) return; await jp('/api/buddy/add', {kind: $('gsc').value, text: $('gnew').value.trim(), dl: $('gdl').value}); $('gnew').value = ''; D = await (await fetch('/api/peek')).json(); draw(true); };
const LINES = ['You are doing great, keep the streak alive 🔥', 'One more focused block and you are ahead of yesterday 💪', 'Small steps, big results. Stay on your goal 🎯'];
(async () => {
  D = await (await fetch('/api/peek')).json(); draw(true); setInterval(() => draw(false), 1000);
  tmPoll(); setInterval(tmPoll, 3000); setInterval(drawTm, 1000); $('tmb').onclick = async e => { e.stopPropagation(); TM = await jp('/api/timer', {op: 'toggle'}); TMt = Date.now(); drawTm(); };
  const show = t => { $('msg').style.display = 'block'; $('msg').textContent = t; fit(); };
  if (kind === 'streak') {
    show(`🔥 ${arg} minutes unbroken! Keep going…`);
    try { const r = await Promise.race([jp('/api/buddy/line', {kind: 'streak', minutes: +arg}), new Promise((_, e) => setTimeout(e, 6500))]); if (r && r.reply) show(r.reply); } catch (e) {}
  }
  $('life').animate([{transform: 'scaleX(1)'}, {transform: 'scaleX(0)'}], {duration: LIFE * 1000, fill: 'forwards', easing: 'linear'});
  timer = setTimeout(() => { if (pinned) return; document.body.style.transition = 'opacity .35s'; document.body.style.opacity = 0; setTimeout(() => window.close(), 380); }, LIFE * 1000);
})();

// ---- focus timer (same timer as Buddy's window and the dashboard Timer page)
var TM = null, TMt = 0;
async function tmPoll() { try { TM = await (await fetch('/api/timer')).json(); TMt = Date.now(); drawTm(); } catch (e) {} }
function drawTm() {
  if (!TM) return; const p = TM.pomo, left = p.running ? Math.max(0, p.endAt - Date.now()) : TM.left, t = Math.max(0, Math.ceil(left / 1000)), brk = p.mode !== 'focus';
  $('tm').className = 'tm ' + (p.running ? 'run ' : '') + (brk ? 'brk' : ''); $('tmt').textContent = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  $('tml').textContent = (brk ? '☕ Break' : '🎯 ' + (p.task || 'Focus')) + (p.running ? '' : ' · paused'); $('tmb').textContent = p.running ? '⏸' : '▶';
}
