const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const j = (u, b) => fetch(u, b === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Rize': '1'}, body: JSON.stringify(b)}).then(r => r.json());
let S = null, busy = false, panelOn = false, rec = null, robot = null;
const MOODS = [['😄', 'great'], ['🙂', 'good'], ['😐', 'meh'], ['😟', 'stressed'], ['😴', 'tired']];

// ---------- voice out ----------
const clean = t => t.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim();
const PROS = {giggle: [1.03, 1.12], depressed: [.86, .78], cheering: [1.1, 1.28], happy: [1.03, 1.1], winking: [1.05, 1.15], shocked: [1.1, 1.25], confused: [.98, 1.02], sad: [.92, .85], disappointed: [.9, .8], sleepy: [.86, .88]};
let speakTok = 0, ducking = false;
const duck = async on => { try { await j('/api/buddy/duck', {on}); } catch (e) {} };
const sleep = ms => new Promise(f => setTimeout(f, ms));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Natural voice = local Chatterbox server (Hindi + English). Falls back to the browser / Edge voice whenever it is missing, loading or slow.
let cbAudio = null, cbEnd = null, cbState = {t: 0, ok: false, info: {}};
const cbReady = async (force) => {
  if (!force && Date.now() - cbState.t < 15000) return cbState.ok;
  try { const r = await j('/api/buddy/tts/status'); cbState = {t: Date.now(), ok: !!(r.running && r.ready), info: r}; } catch (e) { cbState = {t: Date.now(), ok: false, info: {}}; }
  return cbState.ok;
};
const stopAudio = () => { if (cbAudio) { try { cbAudio.pause(); } catch (e) {} cbAudio = null; } if (cbEnd) { const f = cbEnd; cbEnd = null; f(false); } };
const chunkText = t => { const out = []; let cur = ''; for (const p of (t.match(/[^.!?\u0964]+[.!?\u0964]*/g) || [t])) { if (cur && (cur + p).length > 170) { out.push(cur.trim()); cur = p; } else cur += p; } if (cur.trim()) out.push(cur.trim()); return out; };
async function ttsFetch(text, emo) {
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), 65000);
  try { const r = await fetch('/api/buddy/tts', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Rize': '1'}, body: JSON.stringify({text, emotion: emo}), signal: ac.signal}); if (!r.ok) { cbState.t = 0; return null; } return URL.createObjectURL(await r.blob()); }
  catch (e) { cbState.t = 0; return null; } finally { clearTimeout(to); }
}
const playUrl = (url, tok) => new Promise(res => {
  const a = cbAudio = new Audio(url); a.playbackRate = clamp((S.profile.ttsRate || 1) * (CUTE() ? KID_RATE : 1), .5, 2); a.preservesPitch = false;      // faster + higher = young anime-kid voice
  const end = ok => { cbEnd = null; URL.revokeObjectURL(url); res(ok); }; cbEnd = end;
  a.onended = () => end(true); a.onerror = () => end(false);
  a.play().then(() => { if (tok === speakTok) robot.talk = true; }).catch(() => end(false));
});
async function speakNatural(t, emo, tok) {                       // true = handled (even if cut short), false = fall back to the browser voice
  const chunks = chunkText(t); let next = ttsFetch(chunks[0], emo), first = true;
  for (let i = 0; i < chunks.length; i++) {
    const url = await next; if (tok !== speakTok) { if (url) URL.revokeObjectURL(url); return true; }
    if (!url) { if (first) return false; break; }                                  // a later sentence failed: stop here but still un-pause the media
    if (i + 1 < chunks.length) next = ttsFetch(chunks[i + 1], emo);               // prepare the next sentence while this one plays
    if (first && S.profile.duck !== false && !ducking) { ducking = true; await duck(true); }
    first = false; if (tok !== speakTok) { URL.revokeObjectURL(url); return true; }
    if (!(await playUrl(url, tok))) break;
  }
  if (tok === speakTok) { robot.talk = false; if (ducking) { ducking = false; duck(false); } }
  return true;
}
const CUTE = () => S.profile.ttsCute !== false;
const KID_RATE = 1.18, KID_PITCH = 1.45;      // cute, cool anime-kid voice: raise these for a younger sound, set both to 1 for the old voice
function stopSpeaking() { speakTok++; stopAudio(); try { speechSynthesis.cancel(); } catch (e) {} robot && (robot.talk = false); if (ducking) { ducking = false; duck(false); } }
function cuteify(t) {            // tries to sound cute: now and then a little giggle after an excited sentence
  let n = 0; return t.replace(/([A-Za-z\u00C0-\u024F]{4,}[^.!?]{12,}!)(\s|$)/g, (m, s, sp) => (n++ < 1 && Math.random() < .4) ? s + ' Hehe!' + sp : m);
}
async function speak(text, emo = 'happy') {
  if (!S.profile.voice || !text) return;
  let t = clean(text).replace(/!{2,}/g, '!').replace(/\?{2,}/g, '?'); if (!t) return;
  if (CUTE() && !['sad', 'angry', 'disappointed', 'depressed', 'tired', 'dizzy'].includes(emo)) t = cuteify(t);
  const tok = ++speakTok; stopAudio(); try { speechSynthesis.cancel(); } catch (e) {}
  const eng = S.profile.ttsEngine || 'auto';
  if (eng !== 'browser' && await cbReady()) {
    if (tok !== speakTok) return;
    if (await speakNatural(t, emo, tok)) return;
    if (eng === 'chatterbox' && tok === speakTok) toast('The natural voice did not answer, using the browser voice');
  }
  if (tok === speakTok) speakBrowser(t, emo, tok);
}
async function speakBrowser(t, emo, tok) {
  const fallback = () => { robot.talk = true; setTimeout(() => robot.talk = false, Math.min(9000, t.length * 70)); j('/api/buddy/speak', {text: t}); };
  const done_ = () => { if (ducking) { ducking = false; duck(false); } robot.talk = false; };
  try {
    if (S.profile.duck !== false && !ducking) { ducking = true; await duck(true); }       // pauses videos / music that are playing
    if (tok !== speakTok) return;
    const voices = speechSynthesis.getVoices(), lg = (S.profile.lang || 'en-IN').slice(0, 2), pick = voices.filter(x => x.lang.toLowerCase().startsWith(lg));
    const voice = voices.find(x => x.name === S.profile.ttsVoice) || pick.find(x => /\bana\b|child|kid|junior/i.test(x.name)) || pick.find(x => /natural|online/i.test(x.name)) || pick[0] || null;
    const [br, bp] = PROS[emo] || PROS.happy, parts = t.match(/[^.!?]+[.!?]*/g) || [t];
    const done = () => { if (tok !== speakTok) return; robot.talk = false; if (ducking) { ducking = false; duck(false); } };
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p.trim()), ex = /!\s*$/.test(p), q = /\?\s*$/.test(p), el = /\.\.\./.test(p);
      u.voice = voice; u.lang = voice ? voice.lang : (S.profile.lang || 'en-IN');
      u.rate = clamp(br * (S.profile.ttsRate || 1) * (ex ? 1.06 : el ? .92 : 1), .5, 1.7); u.pitch = clamp(bp * (S.profile.ttsPitch || 1) * (CUTE() ? KID_PITCH : 1) + (ex ? .1 : 0) + (q ? .1 : 0) + (CUTE() ? (i % 2 ? .12 : -.03) + (ex ? .06 : 0) : 0), 0, 2); u.volume = 1;
      if (i === 0) u.onstart = () => { if (tok === speakTok) robot.talk = true; };
      if (i === parts.length - 1) u.onend = done;
      u.onerror = e => { done(); if (e.error === 'not-allowed' && tok === speakTok) fallback(); };
      speechSynthesis.speak(u);
    });
  } catch (e) { done_(); fallback(); }
}
speechSynthesis && (speechSynthesis.onvoiceschanged = () => {});

// ---------- voice in ----------
function listen(onText, onEnd) {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) { toast('Voice typing isn\'t supported here, please type 🙂'); onEnd && onEnd(); return null; }
  const r = new R(); r.lang = S.profile.lang || 'en-IN'; r.interimResults = true; r.continuous = false;
  r.onresult = e => { let t = ''; for (const x of e.results) t += x[0].transcript; onText(t, e.results[e.results.length - 1].isFinal); };
  r.onerror = e => { if (e.error === 'not-allowed') toast('Please allow the microphone 🎙️'); else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Voice error: ' + e.error); };
  r.onend = () => onEnd && onEnd(); try { r.start(); } catch (e) {} return r;
}
function micFor(input, btn) {   // dictate into any input
  btn.onclick = () => {
    if (rec) { rec.stop(); return; } btn.classList.add('rec');
    const base = input.value ? input.value + ' ' : '';
    rec = listen((t) => { input.value = base + t; }, () => { rec = null; btn.classList.remove('rec'); input.dispatchEvent(new Event('input')); });
  };
}
function toast(t) { const d = document.createElement('div'); d.className = 'm b'; d.textContent = t; d.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:30;max-width:90%'; document.body.append(d); setTimeout(() => d.remove(), 2600); }

// ---------- chat ----------
let LASTTXT = '', LASTT = 0;
function refineEmo(n, tx) {         // the backend sends a few generic moods; the words of the reply pick the matching face from the full set
  if (!['happy', 'cheering', 'winking', 'giggle', 'confused', 'shocked', 'disappointed'].includes(n) || !tx) return n;
  const t = tx.toLowerCase(), has = re => re.test(t);
  if (has(/\b(thank|proud of you|love|you(?:'|\u2019)re the best|so sweet)\b/)) return 'love';
  if (has(/\b(congrat|amazing|well done|great job|fantastic|crushed it|new record|yay)\b/)) return n === 'cheering' ? 'cheering' : 'excited';
  if (has(/\b(oops|sorry|error|something went wrong|did not answer|couldn(?:'|\u2019)t|can(?:'|\u2019)t reach)\b/)) return 'dizzy';
  if (has(/\b(late|go to sleep|get some sleep|rest your eyes|exhausted|worn out|tired)\b/)) return 'tired';
  if (has(/\b(hmm|let me think|let me check|figuring|plan(?:ning)? (?:it|this)|work(?:ing)? out)\b/)) return 'thinking';
  if (has(/\b(wow|whoa|no way|really\?|seriously\?|you did it)\b/)) return 'surprised';
  if (has(/\b(please|come on|don(?:'|\u2019)t ignore|you promised|again\?)\b/)) return 'pouty';
  if (n === 'happy' && has(/!/)) return 'cheerful';
  return n;
}
function addMsg(role, text, care, src) {
  if (role !== 'user') { LASTTXT = text || ''; LASTT = Date.now(); }
  const d = document.createElement('div'); d.className = 'm ' + (role === 'user' ? 'u' : 'b') + (care ? ' care' : ''); d.innerHTML = esc(text).replace(/\n/g, '<br>')
    + (role !== 'user' && src && S.profile.devSrc !== false ? `<i class="src ${src === 'ai' ? 'ai' : 'sys'}" title="${src === 'ai' ? 'Live AI' : 'System (algorithm)'}"></i>` : '');
  $('msgs').append(d); $('msgs').scrollTop = 1e9; return d;
}
function typing(on) {
  robot && (on ? robot.set('thinking') : robot.set(robot.base));
  const o = $('typing'); if (o) o.remove(); $('st').textContent = on ? 'typing…' : 'here with you';
  if (on) { const d = document.createElement('div'); d.id = 'typing'; d.className = 'm b typing'; d.innerHTML = '<i></i><i></i><i></i>'; $('msgs').append(d); $('msgs').scrollTop = 1e9; }
}
function setChips(list) {
  $('chips').innerHTML = ''; list.forEach(([label, fn]) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = label; b.onclick = () => { $('chips').innerHTML = ''; fn(); }; $('chips').append(b); });
}
const SILENT = ['newsite', 'reviewbatch', 'reviewnudge'];                         // review questions are text only, never spoken
async function say(text, event) {
  if (busy) return; busy = true; const e_ = event; if (text) addMsg('user', text); typing(true);
  let r; try { r = await j('/api/buddy/chat', {text, event}); } catch (e) { r = {reply: 'Hmm, my connection hiccuped. Try again in a sec?'}; }
  const wait = Math.min(1200, 350 + r.reply.length * 8); await new Promise(f => setTimeout(f, wait)); typing(false); busy = false;
  addMsg('buddy', r.reply, r.care, r.src); robot.set(r.emotion || 'happy', 7000); if (!(e_ && SILENT.includes(e_.type))) speak(r.reply, r.emotion || 'happy'); if (e_ && e_.type === 'dailygoal') confetti();
  if (r.care) addMsg('buddy', `If things feel heavy right now, please talk to a trusted adult today. Helpline: ${r.helpline} 💛`, true);
  if (r.ai_state === 'nokey') setChips([['🔑 Add my AI key', openSettings], ['🧭 What should I do next?', () => say('What should I do next?')]]);
  else if (r.ai_state === 'failed') setChips([['🔁 Try again', () => say(text)], ['⚙ Check my keys', openSettings], ['🧭 What should I do next?', () => say('What should I do next?')]]);
  else if (r.goal) setChips([['🎯 Set as my goal', () => setGoalFrom(r.goal)], ['📊 See my plan', openPlan]]);
  else if (r.plan) setChips([['📊 See my plan', openPlan]]);
  if (r.open) { const f = {smart: openSmart, now: openNow, deadlines: openDeadlines}[r.open]; if (f) setTimeout(f, 450); }
  S = await j('/api/buddy/state'); drawPanel(); return r;
}
function send() { const t = $('in').value.trim(); if (!t || busy) return; $('in').value = ''; $('in').style.height = 'auto'; setChips([]); if (pendingOver) { const id = pendingOver; pendingOver = null; answerOver(id, t); } else if (pendingDist) answerDist(t); else say(t); }

async function setGoalFrom(g) {
  const r = await j('/api/curgoal', {id: g.id, name: g.name, kind: g.kind}); if (r.error) return toast(r.error);
  S.goal = r.goal; drawPanel(); toast('Goal set: ' + g.name + ' 🎯');
}

// ---------- events from the tracker ----------
let handledCheckin = false;
async function poll() {
  let ev = []; try { ev = await j('/api/buddy/events'); } catch (e) { return; }
  ev.sort((a, b) => (a.type === 'reminder' && a.kind === 'overdue') - (b.type === 'reminder' && b.kind === 'overdue'));      // the "what are you doing?" question goes last so its answer chips stay on screen
  for (const e of ev) {
    if (e.type === 'distract') { await say('', e); askDistraction(e); }
    else if (['dailygoal', 'halfway', 'hour'].includes(e.type)) { await say('', e); if (e.type === 'dailygoal') setChips([['Start a break ☕', () => say('Thanks! Taking a break now')], ['One more block 💪', () => say('Let\'s go, one more block')]]); }
    else if (e.type === 'offtask') {
      await say('', e);
      if (e.offgoal) setChips([['Back to ' + (e.goal || 'my goal') + ' 💪', () => say('Right, back to my goal')], ['My goal changed', openGoalPicker]]); else
      setChips([['I\'m back 💪', () => say('I\'m back, let\'s go')], ['Give me 10 min', () => { j('/api/buddy/snooze', {min: 10}); say('Give me 10 more minutes please'); }], ['Not feeling it today', () => say('Honestly I\'m not feeling it today')]]);
    } else if (e.type === 'checkin') { handledCheckin = true; if (!S.checkedIn) openCheckin(); }
    else if (e.type === 'breaktime') {
      await say('', e);
      setChips([['Taking a break \u2615', () => { j('/api/buddy/breaksnooze', {min: 6}); say('Thanks! Taking a break now'); }], ['10 more minutes', () => { j('/api/buddy/breaksnooze', {min: 10}); say('Give me 10 more minutes please'); }]]);
    }
    else if (e.type === 'newsite') { await say('', e); askReview(e); }
    else if (e.type === 'reviewbatch' || e.type === 'reviewnudge') { await say('', e); setChips([['🗂 Review now', () => openReview('todo')], ['🔍 What am I doing now?', () => openReview('now')], ['Later', () => {}]]); }
    else if (e.type === 'streakwarn') { await say('', e); guardPoll(); }
    else if (e.type === 'goaldone') { await say('', e); S = await j('/api/buddy/state'); drawPanel(); setChips([['📊 See my plan', openPlan], ['Pick another 🎯', openGoalPicker]]); }
    else if (e.type === 'restored' || e.type === 'dataproblem') { await say('', e); setChips([['🛡 Open backups', () => j('/api/dash/open', {page: 'set'})]]); }
    else if (e.type === 'reminder') { await remindEvent(e); }
    else if (e.type === 'timerdone') { beep(); await say('', e); tmrPoll(); setChips(e.was === 'focus' ? [['▶ Start my break', () => tmrOp('start')], ['⏭ Skip break', () => tmrOp('skip')]] : [['▶ Start focus', () => tmrOp('start')], ['Not yet', () => {}]]); }
    else if (e.type === 'newdata' || e.type === 'streak' || e.type === 'streakbreak') { await say('', e); if (e.type === 'streakbreak') setChips([['Restart 5 min 💪', () => say('Ok restarting, give me 5 minutes')], ['I needed a break', () => say('I needed a break honestly')]]); }
  }
}

// ---------- distraction conversation: Buddy asks what you are doing, judges it against your goal, then allows or convinces ----------
let pendingDist = null;
const DCH = [['📚 It\'s for my goal', 'studying something related to my goal'], ['☕ Taking a break', 'taking a short break to rest'], ['⚠️ Something urgent', 'something urgent and important'], ['🙈 Just scrolling', 'just scrolling, honestly']];
function askDistraction(e) { pendingDist = e.did; setChips(DCH.map(([l, t]) => [l, () => answerDist(t)])); $('in').placeholder = 'What are you doing right now?'; }
async function answerDist(text) {
  const id = pendingDist; setChips([]); addMsg('user', text); typing(true);
  let r; try { r = await j('/api/buddy/distract', {id, text}); } catch (e) { r = {reply: 'Hmm, my connection hiccuped. Try again?', emotion: 'confused', verdict: 'unclear'}; }
  await sleep(Math.min(1200, 350 + r.reply.length * 8)); typing(false); addMsg('buddy', r.reply, false, r.src); robot.set(r.emotion || 'happy', 7000); speak(r.reply, r.emotion || 'happy');
  if (r.verdict === 'unclear') askDistraction({did: id});
  else { pendingDist = null; $('in').placeholder = 'Type or tap the mic…'; if (r.verdict === 'not') setChips([['Okay, 10-min sprint 💪', () => say('Okay, I\'m back, let\'s go')], ['5 more minutes please', () => { j('/api/buddy/snooze', {min: 5}); say('Give me 5 more minutes please'); }]]); }
  S = await j('/api/buddy/state'); drawPanel();
}
function confetti() { const c = ['#4F46E5', '#F59E0B', '#10B981', '#EF4444', '#3B82F6', '#EC4899']; for (let i = 0; i < 60; i++) { const d = document.createElement('i'); d.className = 'cf'; d.style.cssText = `left:${Math.random() * 100}%;background:${c[i % 6]};animation-delay:${Math.random() * .8}s;animation-duration:${1.8 + Math.random() * 1.6}s`; document.body.append(d); setTimeout(() => d.remove(), 4200); } }

// ---------- new site / app review: short question in the chat, answered with one tap ----------
function askReview(e) {
  const g = S.goal && S.goal.name, sg = e.sug, go = v => async () => { const r = await j('/api/buddy/review', {key: e.key, verdict: v}); addMsg('buddy', r.reply, false, r.src); robot.set(r.emotion || 'happy', 4000); setChips([]); S = await j('/api/buddy/state'); drawPanel(); };
  const more = ['🗂 Review all', () => openReview('todo', e.key)];
  if (sg) { const nmx = {f: 'productive', b: 'not productive', m: 'a meeting', o: 'neutral'}[sg.c] || sg.c; return setChips([['💡 I think it is ' + nmx + ' - accept', go('accept')], ['✅ Productive', go('aligned')], ['🚫 Not productive', go('no')], more, ['⏭ Later', go('later')]]); }
  setChips(g ? [['✅ Yes, productive', go('aligned')], ['➖ Productive, other goal', go('prod')], ['🚫 Not productive', go('no')], more, ['⏭ Later', go('later')]]
             : [['✅ Productive', go('aligned')], ['🚫 Not productive', go('no')], more, ['⏭ Later', go('later')]]);
}
// ---------- streak protection: countdown while you are away from your goal ----------
let GD = null, GDt = 0;
async function guardPoll() { try { const r = await j('/api/buddy/guard'); GD = r.guard; GDt = Date.now(); drawGuard(); } catch (e) {} }
function drawGuard() {
  const el = $('guard'), mg = $('mguard'); if (!el) return;
  if (!GD) { el.hidden = true; mg.hidden = true; return; }
  const left = GD.left - Math.floor((Date.now() - GDt) / 1000); if (left <= 0) { el.hidden = true; mg.hidden = true; return; }
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0'), cls = left <= 60 ? 'warn' : GD.why === 'away' ? 'safe' : '';
  el.hidden = false; el.className = cls;
  el.innerHTML = `<b>🛡 Protect your ${GD.streak}-min streak: <em>${mm}:${ss}</em></b><small>${GD.why === 'away' ? 'On a break. Safe until the timer ends' : 'Off goal. Back to ' + esc((S.goal && S.goal.name) || 'your goal') + ' to keep it'}</small><div class="gb"><i style="width:${Math.min(100, left / (GD.gap * 60) * 100)}%"></i></div>`;
  mg.hidden = false; mg.className = cls; mg.textContent = `🛡 ${mm}:${ss}`; mg.title = `Protect your ${GD.streak}-min streak`;
}
setInterval(guardPoll, 2500); setInterval(drawGuard, 1000);

// ---------- welcome back: joyful summary of what you did while Buddy was quiet ----------
const clock = t => new Date(t).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
function addReport(r) {
  const o = r.other || {}, foot = [o.bad ? `⏳ ${fmtM(o.bad)} unproductive` : '', o.prod ? `➖ ${fmtM(o.prod)} productive, other goal` : '', o.unrev ? `❓ ${fmtM(o.unrev)} on unreviewed sites` : ''].filter(Boolean).join(' · ');
  const d = document.createElement('div'); d.className = 'm b rep';
  d.innerHTML = `<div class="rh2">${clock(r.from)} → ${clock(r.to)} · ${fmtM(r.on)} on your goal</div>${r.rows.map(x => `<div class="rr"><span class="tm">${clock(x.start)}–${clock(x.end)}</span><span class="nm" title="${esc(x.name)}">${esc(x.name)}</span><em>${fmtM(x.min)}${x.goal ? ' · 🎯 ' + esc(x.goal) : ''}</em></div>`).join('')}${r.more ? `<div class="rr dim">+${r.more} shorter visits</div>` : ''}${foot ? `<div class="rr dim">${foot}</div>` : ''}`;
  $('msgs').append(d); $('msgs').scrollTop = 1e9;
}
let welcoming = false;
let comeBack = async function (force) {
  if (!S || welcoming || $('sheet').classList.contains('on') || document.hidden) return false; welcoming = true;
  try {
    const w = await j('/api/buddy/welcome', {}); if (w.none) return false;
    addMsg('buddy', w.reply, false, w.src); addReport(w.report); robot.set(w.emotion || 'cheering', 9000); speak(w.reply, 'cheering'); if (w.big) confetti();
    S = await j('/api/buddy/state'); drawPanel(); return true;
  } catch (e) { return false; } finally { welcoming = false; }
};
setInterval(() => { if (document.hasFocus() && !document.hidden) j('/api/buddy/seen', {focused: true}).catch(() => {}); }, 4000);
window.addEventListener('focus', () => comeBack()); document.addEventListener('visibilitychange', () => { if (!document.hidden) comeBack(); });

// ---------- today's numbers: streak / productive / wasted, biggest on top; the robot's mood follows the leader ----------
const STREAK_LEAD = 1;          // streak counts as "highest" when streak x this >= productive time (1 = it equals all of today's productive time)
const fmtM = m => m >= 60 ? Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm' : m + 'm';
const STAT = {streak: ['🔥', 'Streak', 'Current unbroken focus on your goal'], prod: ['✅', 'Productive', "Today's time on your goals"], wasted: ['⏳', 'Wasted', 'Unproductive time today']};
function statMood(v) {          // top stat decides: productive -> happy, streak -> very happy (jumping), wasted -> sad and angry, swapping every minute
  const low = () => (Math.floor(Date.now() / 60000) % 2 ? 'angry' : 'sad');
  if (!v.streak && v.prod === v.wasted) return 'neutral';              // nothing yet, or productive = unproductive with no streak: calm face
  if (v.wasted > v.prod && v.wasted > v.streak) return low();
  if (v.streak > 0 && v.streak * STREAK_LEAD >= v.prod && v.streak >= v.wasted) return 'cheering';
  return v.prod >= v.wasted ? 'happy' : low();
}
function drawStats() {
  const s = S.stats || {prod: 0, wasted: 0, streak: S.streak ? S.streak[0] : 0}, box = $('stats'); if (!box) return;
  if (!box.children.length) Object.keys(STAT).forEach(k => { const d = document.createElement('div'); d.className = 'sc k-' + k; d.dataset.k = k; d.title = STAT[k][2]; d.innerHTML = `<i>${STAT[k][0]}</i><div><b></b><small>${STAT[k][1]}</small></div>`; box.append(d); });
  const order = ['streak', 'prod', 'wasted'].sort((a, b) => (s[b] || 0) - (s[a] || 0));      // stable: equal values keep streak > productive > wasted
  order.forEach((k, n) => { const d = box.querySelector(`[data-k="${k}"]`); d.style.transform = `translateY(${n * 36}px)`; d.classList.toggle('lead', n === 0 && (s[k] || 0) > 0); d.querySelector('b').textContent = fmtM(s[k] || 0); });
  const ms = $('mstats'); if (ms) ms.innerHTML = order.map(k => `<span class="k-${k}" title="${STAT[k][2]}">${STAT[k][0]} ${fmtM(s[k] || 0)}</span>`).join('');
  const mood = statMood(s); $('mmood').textContent = {neutral: 'calm and ready', sad: 'a bit low, let\'s turn it around', angry: 'not happy about the wasted time', depressed: 'a bit low, let\'s turn it around', cheering: 'on fire right now 🔥', giggle: 'happy with your work', happy: 'here with you'}[mood] || 'here with you';
  robot && robot.setBase(mood);
}

// ---------- side panel: dashboard pages, most opened first; opens the dashboard on only that page ----------
let RK = [];
const railSet = on => { $('rail').classList.toggle('open', on); $('rscrim').classList.toggle('on', on); if (on) loadRanks(); };
async function loadRanks() { try { RK = await j('/api/nav/ranks'); drawRail(); } catch (e) {} }
function drawRail() {
  $('rlist').innerHTML = RK.map((p, n) => `<button class="ri ${n < 3 && p.views ? 'top' : ''}" data-pg="${esc(p.id)}" title="${esc(p.name)}${p.views ? ' · opened ' + p.views + '×' : ''}"><i>${p.icon}</i><span>${esc(p.name)}</span><em>${p.views || ''}</em></button>`).join('');
}
$('rToggle').onclick = e => { e.stopPropagation(); railSet(!$('rail').classList.contains('open')); };
$('rlist').onclick = async e => { const b = e.target.closest('[data-pg]'); if (!b) return; const p = RK.find(x => x.id === b.dataset.pg); railSet(false); toast('Opening ' + (p ? p.name : 'dashboard') + '…'); try { await j('/api/dash/open', {page: b.dataset.pg}); } catch (x) {} setTimeout(loadRanks, 3500); };
document.addEventListener('click', e => { if (!e.target.closest('#rail')) railSet(false); }); $('rscrim').onclick = () => railSet(false);
document.addEventListener('keydown', e => { if (e.key === 'Escape') railSet(false); });

// ---------- goals / dates panel ----------
function cd(dl) { if (!dl) return ''; const ms = new Date(dl) - Date.now(), a = Math.abs(ms), m = Math.floor(a / 6e4), t = m >= 2880 ? Math.floor(m / 1440) + 'd' : m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm'; return ms < 0 ? `<span class="cd late">overdue ${t}</span>` : `<span class="cd">${t} left</span>`; }
const linkSel = g => `<select class="lsel" data-tl="${g.id}" title="Link to an exam topic: its progress then updates automatically"><option value="">${g.chapName ? '🔗 ' + esc(g.chapName) + (g.autoChap ? ' (auto)' : '') : '🔗 link topic'}</option>${(S.chaps || []).map(c => `<option value="${c.id}" ${String(c.id) === String(g.chap) ? 'selected' : ''}>${esc(c.name)} · ${esc(c.exam)}</option>`).join('')}${g.chap ? '<option value="-">✕ unlink</option>' : ''}</select>`;
const rankHTML = (g, n, i) => g.done || !g.rank ? '' : `<span class="rk" title="Your priority order (#1 = most important)"><em>#${g.rank}</em><button data-rk="${g.id},up" ${i === 0 ? 'disabled' : ''}>▲</button><button data-rk="${g.id},down" ${i === n - 1 ? 'disabled' : ''}>▼</button></span>`;
function goalHTML(g, scope, i = 0, n = 1) {
  const ds = `data-s="${scope}"`;
  return `<div class="gi ${g.done ? 'done' : ''}" data-gid="${g.id}"><input type="checkbox" ${g.done ? 'checked' : ''} data-g="${g.id}" ${ds}>
    <div class="gb"><div class="gt">${esc(g.t)}</div>
      <div class="gm">${rankHTML(g, n, i)}${g.done ? '' : `<button class="bell ${g.rm ? '' : 'off'}" data-bell="${g.id}" title="${g.rm ? 'Reminders on: tap to edit' : 'Add reminders'}">🔔</button>${cd(g.dl)}`}${linkSel(g)}</div>
      <div class="gp"><input type="range" min="0" max="100" step="5" value="${g.p || 0}" data-pg="${g.id}" ${ds} aria-label="Progress"><b title="${g.est ? 'Follows your time: ' + g.spent + ' of ' + g.est + ' min' : 'Set an estimate in the dashboard (Tasks) and this follows your time'}">${g.p || 0}%${g.est ? ' ⏱' : ''}</b>${g.spent ? `<small>${fmtM(g.spent)}</small>` : ''}</div></div>
    <button class="gx" data-d="${g.id}" ${ds} title="Delete this goal">✕</button></div>`;
}
// accordion sections (Today / This week / Coming up): the shell is built once, only the bodies are refreshed, so folds stay smooth and nothing jumps while you drag a slider
const ACC = (() => { try { return JSON.parse(localStorage.getItem('accState')) || {day: 1, week: 1, up: 0}; } catch (e) { return {day: 1, week: 1, up: 0}; } })();
const ACCT = [['day', 'Today'], ['week', 'This week'], ['up', 'Coming up']];
function buildPanel() {
  $('panel').innerHTML = ACCT.map(([k, t]) => `<div class="acc ${ACC[k] ? '' : 'shut'}" data-acc="${k}"><button class="ah" data-ah="${k}" aria-expanded="${ACC[k] ? 'true' : 'false'}"><span id="at_${k}">${t}</span><em id="ac_${k}">0</em><i>▾</i></button><div class="fold ${ACC[k] ? 'open' : ''}"><div class="fi"><div class="ab" id="ab_${k}"></div></div></div></div>`).join('');
}
function drawPanel(force) {
  $('bn').textContent = S.profile.buddyName; const gn = S.goal && S.goal.name; $('gChip').textContent = '🎯 ' + (gn || 'Set my goal'); $('mgoal').textContent = '🎯 ' + (gn || 'Set my goal'); drawStats();
  const vo = !!S.profile.voice; $('bVoice').classList.toggle('off', !vo); $('bVoice').innerHTML = `<i>${vo ? '🔊' : '🔇'}</i>Voice ${vo ? 'on' : 'off'}`;
  const rv = S.rv || {n: 0, due: 0}, bd = $('bdgRev'); bd.hidden = !rv.n; bd.textContent = rv.n > 99 ? '99+' : rv.n; $('bRev').classList.toggle('needs', rv.due > 0 || rv.n >= (S.profile.newSiteNudge || 10));
  if (!$('ab_day')) buildPanel();
  const act = document.activeElement; if (!force && act && $('panel').contains(act) && /^(SELECT|INPUT)$/.test(act.tagName) && act.type !== 'checkbox') return;     // do not rebuild under the finger
  const none = t => `<div class="empty">${t}</div>`, open = L => L.filter(g => !g.done).length;
  $('at_day').textContent = 'Today' + (S.today.mood ? ' · feeling ' + S.today.mood : ''); $('ac_day').textContent = open(S.today.goals) + '/' + S.today.goals.length;
  $('ab_day').innerHTML = S.today.goals.map((g, i, a) => goalHTML(g, 'day', i, a.length)).join('') || none('No goals yet. Tap ➕ to add one.');
  $('ac_week').textContent = open(S.week) + '/' + S.week.length;
  $('ab_week').innerHTML = S.week.map((g, i, a) => goalHTML(g, 'week', i, a.length)).join('') || none('No weekly goals yet.');
  $('ac_up').textContent = S.landmarks.length;
  $('ab_up').innerHTML = S.landmarks.map(x => `<div class="lm2"><span>${x.exam ? '🎓' : '📌'} ${esc(x.name)}${x.prep != null ? ` · ${x.prep}% ready` : ''}</span><em>${x.days === 0 ? 'today!' : x.days + ' d'}</em></div>`).join('') || none('Nothing coming up yet.');
}
$('panel').onclick = async e => {
  const ah = e.target.closest('[data-ah]'); if (ah) { const k = ah.dataset.ah, box = ah.closest('.acc'), on = box.classList.contains('shut'); box.classList.toggle('shut', !on); box.querySelector('.fold').classList.toggle('open', on); ah.setAttribute('aria-expanded', on); ACC[k] = on ? 1 : 0; try { localStorage.setItem('accState', JSON.stringify(ACC)); } catch (x) {} return; }
  const c = e.target.closest('input[data-g]'), d = e.target.closest('button[data-d]'), rk = e.target.closest('button[data-rk]'), bl = e.target.closest('button[data-bell]');
  if (rk && !rk.disabled) { const [id, dir] = rk.dataset.rk.split(','), r = await j('/api/buddy/task-rank', {id: +id, dir}); if (r.note) toast(r.note); S = r.state; drawPanel(true); return; }
  if (bl) { openReminder(+bl.dataset.bell); return; }
  if (c) { const r = await j('/api/buddy/goal', {id: +c.dataset.g, scope: c.dataset.s}); if (r.ok) { S = r.state; drawPanel(true); if (r.done) say('', {type: 'goal_done', desc: r.text}); if (r.next) { S.goal = (await j('/api/buddy/state')).goal; drawPanel(true); } } }
  if (d) { const card = d.closest('.gi'); if (card) card.classList.add('go'); const r = await j('/api/buddy/goal', {id: +d.dataset.d, scope: d.dataset.s, op: 'del'}); if (r.ok) { setTimeout(() => { S = r.state; drawPanel(true); }, 220); } else if (card) card.classList.remove('go'); }
};
$('panel').onchange = async e => { const ls = e.target.closest('select[data-tl]'); if (ls) { const x = await j('/api/buddy/tasklink', {id: +ls.dataset.tl, chap: ls.value === '-' ? '' : ls.value}); if (x.ok) { S = x.state; drawPanel(true); toast(ls.value && ls.value !== '-' ? 'Linked: progress will update automatically 🔗' : 'Unlinked'); } return; } const r = e.target.closest('input[data-pg]'); if (r) { const x = await j('/api/buddy/goal', {id: +r.dataset.pg, scope: r.dataset.s, op: 'prog', p: +r.value}); if (x.ok) { S = x.state; drawPanel(true); if (x.done) say('', {type: 'goal_done', desc: x.text}); } } };
$('panel').oninput = e => { const r = e.target.closest('input[data-pg]'); if (r) { const b = r.parentElement.querySelector('b'); if (b) b.textContent = r.value + '%'; } };     // live % while dragging


// ---------- current goal: always picked from exam topics / exams / tasks (or typed new) ----------
function goalChips(sel) {
  const o = S.options || {topics: [], exams: [], tasks: []}, ch = (x, ic, sub) => `<button class="chip ${sel === x.id ? 'on' : ''}" data-ga="${esc(x.id)}" data-gn="${esc(x.name)}" data-gk="${x.kind}">${ic} ${esc(x.name)}${sub ? ' <small style="opacity:.6">· ' + esc(sub) + '</small>' : ''}</button>`;
  const sec = (title, list) => list.length ? `<p style="margin:8px 0 3px;font-size:12px">${title}</p><div class="kinds">${list.join('')}</div>` : '';
  return sec('📚 Exam topics', o.topics.slice(0, 8).map(x => ch(x, '', x.exam))) + sec('🎓 Exams', o.exams.slice(0, 5).map(x => ch(x, '🎓'))) + sec('✅ Tasks', o.tasks.slice(0, 6).map(x => ch(x, '')))
    + `<div class="kinds" style="margin-top:8px"><button class="chip ${!sel ? 'on' : ''}" data-ga="" data-gn="" data-gk="">Anything productive</button></div>`;
}
// ---------- current goal ----------
async function openGoalPicker() {
  let H = {items: []}; try { H = await j('/api/goal/history'); } catch (e) {}
  const prev = H.items.filter(x => x.status !== 'active'), ago = t => { const d = Math.round((Date.now() - t) / 864e5); return d < 1 ? 'today' : d === 1 ? 'yesterday' : d + 'd ago'; };
  const none = !(S.options.topics.length + S.options.exams.length + S.options.tasks.length);
  const c = sheet(`<h3>What's your goal right now? 🎯</h3><p>Goals come from your exams or tasks. Only work on the current goal counts for your hours & streak.</p>
  ${none ? '<p><b>Nothing to pick yet.</b> Add an exam topic or a task (➕ here, or in the dashboard) and it will show up.</p>' : ''}${goalChips(S.goal && S.goal.id)}
  ${prev.length ? `<p style="margin:12px 0 3px;font-size:12px">🕘 Previous goals</p>${prev.slice(0, 8).map(x => `<div class="lm"><span>${esc(x.name)}${x.status === 'done' ? ' ✅' : ''}<br><small style="color:var(--mt)">${x.min} min · ${ago(x.last)}</small></span>${x.status === 'done' ? '' : `<button class="chip" data-ga="${esc(x.id)}" data-gn="${esc(x.name)}" data-gk="${esc(x.kind)}">▶ Resume</button>`}</div>`).join('')}` : ''}
  <div class="acts"><button class="btn alt" id="cx">Close</button></div>`);
  const set = async (id, name, kind) => { const r = await j('/api/curgoal', {id, name, kind}); if (r.error) return toast(r.error); S.goal = r.goal; closeSheet(); drawPanel(); say('', {type: 'newdata', desc: name ? `their current focus goal is now ${name}` : 'they cleared their focus goal'}); };
  c.querySelectorAll('[data-gn]').forEach(b => b.onclick = () => set(b.dataset.ga, b.dataset.gn, b.dataset.gk)); $('cx').onclick = closeSheet;
}
$('gChip').onclick = openGoalPicker; $('rb').onclick = e => {
  const r = $('rb').getBoundingClientRect(), k = robot.scale, lx = (e.clientX - r.left - r.width / 2) / k, ly = (e.clientY - r.top - r.height * .47) / k;
  if (Math.abs(lx) > 80 && Math.abs(lx) < 134 && Math.abs(ly - 4) < 48) earPoke(); else if ((POKES = POKES.filter(x => Date.now() - x < 4000).concat(Date.now())).length >= 5) { POKES = []; tease(1); }
  else robot.set(['cheering', 'winking', 'shocked', 'excited', 'love', 'cheerful', 'surprised', 'dizzy', 'pouty'][Math.random() * 9 | 0], 2400);
};
// ---------- teasing Buddy: each tease gets a reaction, a line (spoken in the cute voice) and a face; too much teasing makes it cross ----------
const TEASE = [
  ['\u{1F449} Poke', ['Hey! That tickles!', 'Stop poking me, hehe!', 'Boop received. Now poke your books!'], ['cheerful', 'surprised']],
  ['\u{1FAB6} Tickle', ['Hahaha! Stop, stop, that tickles!', 'Hehehe! No fair!', 'Ahaha! I will tickle you back with homework!'], ['excited', 'cheerful']],
  ['\u{1F61B} Stick tongue out', ['Ehh? Rude! I am cute, you are not!', 'Hmph! Bleh! Happy now?'], ['pouty']],
  ['\u{1F36A} Steal its snack', ['Hey! That was MY snack! Give it back!', 'Noooo, my cookie!'], ['shocked', 'pouty']],
  ['\u{1F96B} Call it a tin can', ['I am NOT a tin can! I am a very advanced study buddy!', 'Tin can?! Hmph!'], ['angry', 'pouty']],
  ['\u{1F634} Say \u201Cboring\u201D', ['Boring?! Then go study and make it fun!', 'Hmph. You are the boring one. Study!'], ['pouty', 'tired']],
  ['\u{1FAE3} Cover its eyes', ['Eek! I cannot see anything! Hehe!', 'Where did the world go? Hehe!'], ['surprised', 'dizzy']],
  ['\u2764\uFE0F Say \u201Cyou are cute\u201D', ['E-eh?! Don\u2019t say that so suddenly! Hehe, thank you.', 'Hehe, I know! Now go study!'], ['love', 'cheerful']]
];
let TEASED = [], POKES = [];
function tease(i) {
  const now = Date.now(); TEASED = TEASED.filter(x => now - x < 90000); TEASED.push(now);
  const pick = a => a[Math.random() * a.length | 0];
  let line, emo;
  if (TEASED.length >= 6) { TEASED = []; line = 'Okay, that is ENOUGH teasing! Stop disturbing me and study!'; emo = 'angry'; robot.angry(5000); }
  else { line = pick(TEASE[i][1]); emo = pick(TEASE[i][2]); robot.set(emo, 4500); }
  addMsg('buddy', line); speak(line, emo);
}
function setupTease() {          // dropdown on the stage (top-left): pick a tease, Buddy reacts
  const btn = $('tzBtn'), menu = $('tzMenu'); if (!btn || !menu) return;
  menu.innerHTML = TEASE.map((t, i) => `<button role="menuitem" data-i="${i}">${t[0]}</button>`).join('');
  const set = on => { menu.hidden = !on; btn.setAttribute('aria-expanded', on); if (on) { const r = btn.getBoundingClientRect(); menu.style.left = Math.max(6, Math.min(r.left, innerWidth - 226)) + 'px'; menu.style.top = (r.bottom + 6) + 'px'; } };
  btn.onclick = e => { e.stopPropagation(); set(menu.hidden); };
  menu.onclick = e => { const b = e.target.closest('[data-i]'); if (b) { tease(+b.dataset.i); set(false); } };
  document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('#tzMenu')) set(false); });
  addEventListener('resize', () => set(false)); addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
}
setupTease();
function earPoke() {            // touching the ears makes Buddy angry
  const t = ['Stop disturbing me and study!', 'Hey! Stop disturbing me and study!', 'Don\u2019t touch my ears! Stop disturbing me and study!'][Math.random() * 3 | 0];
  robot.angry(5000); addMsg('buddy', t + ' \u{1F624}'); speak(t, 'angry');
}
document.addEventListener('mousemove', e => { if (!robot) return; const r = $('rb').getBoundingClientRect(); robot.lt = {x: clamp((e.clientX - r.left - r.width / 2) / Math.max(200, innerWidth / 2), -1, 1), y: clamp((e.clientY - r.top - r.height * .47) / Math.max(200, innerHeight / 2), -1, 1)}; });
document.addEventListener('mouseleave', () => { if (robot) robot.lt = {x: 0, y: 0}; });
setInterval(() => { try { if (S && S.stats && robot) drawStats(); } catch (e) {} }, 15000);   // lets sad / angry swap every minute

// ---------- plan: goals + exam priorities + chapters + tasks, all in one place ----------
async function openPlan() {
  let P; try { P = await j('/api/buddy/plan'); } catch (e) { return toast('Could not load your plan'); }
  const rows = P.rows || [], g = P.goal || {}, dtxt = d => d === 0 ? 'today' : d === 1 ? 'tomorrow' : d < 0 ? 'overdue' : 'in ' + d + 'd';
  const setBtn = (id, name, kind) => `<button class="chip" data-sg="${esc(id)}" data-gn="${esc(name)}" data-gk="${esc(kind)}">🎯 Set goal</button>`;
  const dim = t => `<small style="color:var(--mt)">${t}</small>`;
  const pick = P.pick ? `<div class="pl" style="border-color:var(--ac)"><b>🧭 Next up: ${esc(P.pick.name)}</b>${P.pick.kind === 'chap' ? ' ' + dim(esc(P.pick.exam)) : ''}<div style="font-size:13px;color:var(--mt);margin:4px 0 6px">${esc(P.pick.why)}</div>${setBtn(P.pick.id, P.pick.name, P.pick.kind)}</div>` : '';
  const due = P.task ? `<div class="pl" style="border-color:#E5484D"><b>⏰ Due soon: ${esc(P.task.name)}</b> ${dim(P.task.hours < 0 ? 'overdue' : 'in ' + Math.round(P.task.hours) + 'h')}</div>` : '';
  const ex = rows.map((r, k) => `<div class="pl"><div class="lm"><b>#${k + 1} ${esc(r.name)}</b><em>${dtxt(r.days)}</em></div>
    <div style="font-size:12px;color:var(--mt)">Priority score ${r.score}${r.bonus ? ' (includes +' + r.bonus + ' for the nearest exam)' : ''} · your rank ${r.rank} of ${rows.length}${r.prep != null ? ' · ' + r.prep + '% ready' : ''}${r.spent ? ' · ⏱ ' + fmtM(r.spent) + ' studied' : ''}</div>
    <div class="bar2"><i style="width:${r.prep || 0}%"></i></div>
    <div style="display:flex;gap:6px;margin:4px 0 6px"><button class="chip" data-rk="${r.id},up" ${r.rank === 1 ? 'disabled' : ''}>▲ Higher</button><button class="chip" data-rk="${r.id},down" ${r.rank === rows.length ? 'disabled' : ''}>▼ Lower</button></div>
    ${r.chapters.slice(0, 4).map(c => `<div class="lm"><span>${esc(c.name)} ${dim('★' + c.imp + ' · ' + c.p + '%' + (c.spent ? ' · ⏱ ' + fmtM(c.spent) : '') + (c.dl ? ' · ' + dtxt(c.days) : ''))}</span>${setBtn('g:chap:' + c.id, c.name, 'chap')}</div>`).join('') || dim(r.nch ? 'All chapters done 🎉' : 'No chapters yet. Add them in the dashboard under Exams.')}
    ${r.chapters.length > 4 ? dim('+' + (r.chapters.length - 4) + ' more chapters') : ''}</div>`).join('') || '<div class="pl">' + dim('No upcoming exams yet. Add one in the dashboard (Exams), then rank it here.') + '</div>';
  const tl = L => (L || []).map(t => `<div class="lm"><span>${t.done ? '✅' : '⬜'} ${esc(t.t)} ${dim((t.p || 0) + '%')}</span>${t.done ? '' : cd(t.dl)}</div>`).join('') || dim('Nothing here.');
  const GL = P.goals || [], gl = GL.map((t, k) => `<div class="lm"><span><b>#${t.rank}</b> ${esc(t.t)} ${dim(t.scope === 'week' ? 'this week' : t.scope === 'day' ? 'today' : '')}</span><span style="display:flex;gap:4px;align-items:center">${cd(t.dl)}<button class="chip" data-gr="${t.id},up" ${k === 0 ? 'disabled' : ''}>▲</button><button class="chip" data-gr="${t.id},down" ${k === GL.length - 1 ? 'disabled' : ''}>▼</button></span></div>`).join('') || dim('No open goals. Tap ➕ to add one.');
  const c = sheet(`<h3>📊 My plan</h3><p>🎯 Now: <b>${esc(g.name || 'Anything productive')}</b> · daily target ${P.target}h</p>${due}${pick}
    <h4 class="ph">My goals by priority</h4>${gl}<h4 class="ph">Exams by priority</h4>${ex}<h4 class="ph">Today's tasks</h4>${tl(P.day)}<h4 class="ph">This week</h4>${tl(P.week)}
    <div class="acts"><button class="btn alt" id="cx">Close</button></div>`);
  $('cx').onclick = closeSheet;
  c.onclick = async e => {
    const sg = e.target.closest('[data-sg]'), rk = e.target.closest('[data-rk]'), gr = e.target.closest('[data-gr]');
    if (gr && !gr.disabled) { const [id, d] = gr.dataset.gr.split(','), r = await j('/api/buddy/task-rank', {id: +id, dir: d, all: true}); if (r.note) toast(r.note); S = r.state; drawPanel(); openPlan(); return; }
    if (sg) { await setGoalFrom({id: sg.dataset.sg, name: sg.dataset.gn, kind: sg.dataset.gk}); closeSheet(); }
    if (rk && !rk.disabled) { const [id, d] = rk.dataset.rk.split(','), r = await j('/api/buddy/exam-rank', {id: +id, dir: d}); if (r.note) toast(r.note); S = await j('/api/buddy/state'); openPlan(); }
  };
}
$('bPlan').onclick = openPlan;
// ================= v13: Review right inside Buddy: tab "Right now" + tab "To review" (one card at a time, keyboard friendly) =================
let nowTimer = null, RV = {items: [], total: 0, cov: {}};
const TAGC = {App: 'app', YouTube: 'yt', 'Local page': 'loc'}, CATN = {f: 'Productive', m: 'Meeting', b: 'Not productive', o: 'Not reviewed'}, CATC = {f: 'var(--g)', m: 'var(--ac)', b: '#EF4444', o: 'var(--mt)'};
const kindTag = x => x.tag || (x.kind === 'app' ? 'App' : x.kind === 'youtube' ? 'YouTube' : 'Website');
const tagHTML = x => `<span class="tag ${TAGC[kindTag(x)] || ''}">${esc(kindTag(x))}</span>`;
const nameHTML = (x, big) => `<div class="rn ${big ? 'big' : ''}">${esc(x.name || 'Untitled page')} ${tagHTML(x)}</div>${x.hint ? `<div class="rh">${esc(x.hint)}</div>` : ''}`;
const SUGN = {f: 'productive', b: 'not productive', m: 'a meeting', o: 'neutral'};
let rvRefresh = 0; const rvState = () => { clearTimeout(rvRefresh); rvRefresh = setTimeout(async () => { try { S = {...(await j('/api/buddy/state')), gap: S.gap}; drawPanel(); } catch (e) {} }, 700); };

async function openReview(tab = 'now', focusKey) {
  if (!LKO) await loadLko();
  try { RV = await j('/api/buddy/reviews'); } catch (e) { RV = {items: [], total: 0, cov: {}}; }
  const c = sheet(`<div class="rvh"><h3>🔍 Review</h3><button class="x" id="cx" title="Close" aria-label="Close">✕</button></div><div class="rvt" id="rvt"><button data-t="now">Right now</button><button data-t="todo">To review <b id="rvc"></b></button></div><div id="rvb" class="rvbody"></div>`); c.classList.add('wide');
  const close = () => { clearInterval(nowTimer); closeSheet(); rvState(); }; $('cx').onclick = close; c.onchange = lkChange;
  const cnt = () => { const b = $('rvc'); if (b) { b.textContent = RV.total > 99 ? '99+' : RV.total || ''; b.classList.toggle('z', !RV.total); } };
  const show = t => { clearInterval(nowTimer); c.querySelectorAll('#rvt [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === t)); const bd = $('rvb'); bd.classList.remove('rvbody'); void bd.offsetWidth; bd.classList.add('rvbody'); bd.innerHTML = ''; cnt(); t === 'todo' ? tabTodo() : tabNow(); };
  $('rvt').onclick = e => { const b = e.target.closest('[data-t]'); if (b) show(b.dataset.t); };

  // ---- tab 1: what am I doing right now + the last 2 productive / 2 not productive
  function tabNow() {
    $('rvb').innerHTML = '<div id="nowbox"><p class="empty">Looking…</p></div><div class="acts" style="justify-content:flex-start;flex-wrap:wrap;gap:8px"><button class="sbtn" id="nows">✨ Smart review (AI)</button><button class="sbtn" id="nowd">🗂 Open in dashboard</button></div>';
    $('nows').onclick = () => { clearInterval(nowTimer); openSmart(); }; $('nowd').onclick = () => j('/api/dash/open', {page: 'act'});
    const draw = async () => {
      let R; try { R = await j('/api/review/now'); } catch (e) { return; } if (!$('nowbox')) return clearInterval(nowTimer);
      const ago = x => x.agoMin < 1 ? 'just now' : x.agoMin + ' min ago';
      const row = (x, flip) => `<div class="nrow"><div class="nl">${nameHTML(x)}<div class="nm">${ago(x)} · ${fmtM(Math.round(x.min))}${(x.links || []).length ? ' · 🔗 ' + esc(x.links.join(', ')) : ''}${x.auto ? ' · 🤖 sorted automatically' : ''}</div>${lkRow(x)}</div>${x.canLabel ? `<button class="sbtn sm ${flip === 'f' ? 'ok' : 'no'}" data-nk="${esc(x.key)}" data-c="${flip}">${flip === 'f' ? '✅ Productive' : '🚫 Not productive'}</button>` : ''}</div>`;
      const n = R.now;
      const nowCard = !n ? '<p class="empty">Idle: nothing is being tracked right now.</p>' : `<div class="nowcard" style="--cc:${CATC[n.cat]}"><div class="nl">${nameHTML(n, true)}<div class="nm" style="margin-top:6px"><span class="cat ${n.cat}">${CATN[n.cat] || ''}</span> · ${n.note ? esc(n.note) : fmtM(Math.round(n.min)) + ' in a row'} · ${n.cat === 'f' || n.cat === 'm' ? (n.onGoal ? '✅ counts for your goal' : '⚠ not for your current goal') : n.cat === 'b' ? '🚫 counted as a distraction' : '❓ not reviewed yet'}</div>${lkRow(n)}</div>${n.canLabel ? `<div style="display:flex;gap:8px;margin-top:10px"><button class="sbtn ok" data-nk="${esc(n.key)}" data-c="f" style="flex:1;justify-content:center">✅ Productive</button><button class="sbtn no" data-nk="${esc(n.key)}" data-c="b" style="flex:1;justify-content:center">🚫 Not productive</button></div>` : ''}</div>`;
      $('nowbox').innerHTML = `<p style="margin:0 0 6px"><b>Right now</b></p>${nowCard}`
        + `<p style="margin:14px 0 2px"><b style="color:var(--g)">Before this · productive</b></p>${R.productive.map(x => row(x, 'b')).join('') || '<p class="empty">None yet.</p>'}`
        + `<p style="margin:14px 0 2px"><b style="color:#EF4444">Before this · not productive</b></p>${R.unproductive.map(x => row(x, 'f')).join('') || '<p class="empty">Nothing unproductive recently 👏</p>'}`
        + (RV.total ? `<div class="hint2" style="display:flex;gap:10px;align-items:center;justify-content:space-between"><span><b>${RV.total}</b> other new site${RV.total > 1 ? 's' : ''}/app${RV.total > 1 ? 's' : ''} not reviewed yet.</span><button class="sbtn sm pri" data-go="todo">Review them →</button></div>` : '');
    };
    c.onclick = async e => {
      if (e.target.closest('[data-go]')) return show('todo');
      const u = e.target.closest('[data-lc]'); if (u) { u.disabled = true; u.closest('.nrow, .nowcard').style.opacity = .6; await j('/api/buddy/rlink', {key: u.dataset.lc, op: 'clear'}); await draw(); return; }
      const b = e.target.closest('[data-nk]'); if (!b) return; b.disabled = true; await j('/api/review/set', {key: b.dataset.nk, c: b.dataset.c}); await draw(); rvState();
    };
    nowTimer = setInterval(() => { if (!$('nowbox')) clearInterval(nowTimer); else if (!(document.activeElement && document.activeElement.classList.contains('lks'))) draw(); }, 5000); draw();
  }

  // ---- tab 2: manual review, one card at a time (P productive, N not, A accept suggestion, S skip)
  function tabTodo() {
    let Q = RV.items.slice(), done = 0; const total0 = Math.max(Q.length, 1), goalName = S.goal && S.goal.name;
    if (focusKey) { const i = Q.findIndex(x => x.key === focusKey); if (i > 0) Q.unshift(Q.splice(i, 1)[0]); focusKey = null; }
    const nSug = () => Q.filter(x => x.sug).length;
    $('rvb').innerHTML = `<div class="hint2" id="rvhint"></div><div class="rprog"><i id="rvp"></i></div><div id="rvcard"></div><div class="kb"><span><kbd>P</kbd> productive</span><span><kbd>N</kbd> not productive</span><span><kbd>A</kbd> accept 💡</span><span><kbd>S</kbd> skip</span></div>
      <div class="acc inl shut" id="rvall"><button class="ah" data-ah="x" aria-expanded="false"><span>Up next</span><em id="rvn">0</em><i>▾</i></button><div class="fold"><div class="fi"><div class="ab wl" id="rvl"></div></div></div></div>
      <div class="acts" style="justify-content:flex-start;flex-wrap:wrap;gap:8px;margin-top:14px"><button class="sbtn" id="rvacc">👍 Accept all 💡</button><button class="sbtn" id="rvsm">✨ Smart review (AI)</button><button class="sbtn" id="rvdash">🗂 Dashboard</button></div>`;
    const cardHTML = x => `<div class="rcard in" id="rc" data-key="${esc(x.key)}"><div>${tagHTML(x)} <span style="color:var(--mt);font-size:12.5px">${fmtM(x.min)} so far</span></div><div class="rname">${esc(x.name)}</div>${x.hint ? `<div class="rh">${esc(x.hint)}</div>` : ''}
      ${x.sug ? `<div class="rsug"><span>💡 Looks <b>${SUGN[x.sug.c] || esc(x.sug.c)}</b>${(x.sug.links || []).length ? ' → ' + esc(x.sug.links.join(', ')) : ''}</span><button class="sbtn sm pri" data-act="accept">👍 Accept</button></div>` : ''}
      <div class="rbtns"><button class="sbtn ok" data-act="aligned">✅ Productive${goalName ? `<small>for ${esc(goalName.slice(0, 24))}</small>` : ''}</button><button class="sbtn no" data-act="no">🚫 Not productive</button>${goalName ? '<button class="sbtn" data-act="prod">➖ Productive, other goal</button>' : ''}<button class="sbtn" data-act="skip">⏭ Skip for now</button></div>
      <div class="rlk">${lkSel(x)}</div></div>`;
    const draw = (animateIn) => {
      const left = Q.length; RV.total = left; cnt(); $('rvn').textContent = Math.max(0, left - 1); $('rvp').style.width = Math.round(done / (done + left || 1) * 100) + '%';
      const cv = RV.cov || {}; $('rvhint').innerHTML = left ? `<b>${left}</b> waiting${nSug() ? ` · 💡 ${nSug()} with a suggestion` : ''}${cv.pct ? ` · 🤖 I already sorted <b>${cv.pct}%</b> of your new items` : ''}. Pick one answer per card, it teaches me.` : '🎉 Everything is reviewed. Nice work!';
      $('rvcard').innerHTML = left ? cardHTML(Q[0]) : `<div class="rcard" style="text-align:center;padding:26px 16px"><div style="font-size:38px">🎉</div><div class="rname">All clear</div><div class="rmeta">${done ? 'You reviewed ' + done + ' this time. ' : ''}I'll tell you when more pile up.</div></div>`;
      $('rvl').innerHTML = Q.slice(1, 80).map(x => `<div class="nrow" data-rk2="${esc(x.key)}"><div class="nl">${nameHTML(x)}<div class="nm">${fmtM(x.min)}${x.sug ? ' · 💡 ' + (SUGN[x.sug.c] || '') : ''}</div></div><span style="display:flex;gap:5px">${x.sug ? '<button class="sbtn sm" data-v="accept" title="Accept the suggestion">👍</button>' : ''}<button class="sbtn sm ok" data-v="aligned" title="Productive">✅</button><button class="sbtn sm no" data-v="no" title="Not productive">🚫</button></span></div>`).join('') || '<p class="empty">Nothing else waiting.</p>';
      $('rvacc').style.display = nSug() ? '' : 'none'; $('rvacc').textContent = `👍 Accept all 💡 (${nSug()})`;
    };
    const take = (verdict, key) => { j('/api/buddy/review', {key, verdict, silent: true}).catch(() => {}); rvState(); };
    const act = verdict => {
      const x = Q[0]; if (!x) return; const card = $('rc'); if (!card || card.classList.contains('out')) return;
      if (verdict === 'accept' && !x.sug) return;
      if (verdict === 'skip') { card.classList.add('out'); return setTimeout(() => { Q.push(Q.shift()); draw(); }, 230); }
      card.classList.add('out'); if (verdict === 'no') card.classList.add('no'); take(verdict, x.key);
      setTimeout(() => { Q.shift(); done++; draw(); }, 240);
    };
    draw();
    c.onclick = async e => {
      const ah = e.target.closest('[data-ah]'); if (ah) { const box = ah.closest('.acc'), on = box.classList.contains('shut'); box.classList.toggle('shut', !on); box.querySelector('.fold').classList.toggle('open', on); ah.setAttribute('aria-expanded', on); return; }
      const a = e.target.closest('[data-act]'); if (a) return act(a.dataset.act);
      const v = e.target.closest('[data-v]'); if (v) { const row = v.closest('[data-rk2]'), k = row.dataset.rk2; row.classList.add('go'); take(v.dataset.v, k); setTimeout(() => { Q = Q.filter(x => x.key !== k); done++; draw(); }, 280); return; }
      if (e.target.closest('#rvacc')) { const b = $('rvacc'); b.disabled = true; await j('/api/auto/feedback', {op: 'acceptall'}); try { RV = await j('/api/buddy/reviews'); } catch (x) {} Q = RV.items.slice(); done = 0; draw(); toast('Suggestions accepted 👍'); rvState(); return; }
      if (e.target.closest('#rvsm')) { clearInterval(nowTimer); return openSmart(); }
      if (e.target.closest('#rvdash')) return j('/api/dash/open', {page: 'act'});
    };
    c.keyAction = k => { if (k === 'p') act('aligned'); else if (k === 'n') act('no'); else if (k === 'a') act('accept'); else if (k === 's') act('skip'); };
  }
  show(tab === 'todo' ? 'todo' : 'now');
}
document.addEventListener('keydown', e => { const c = $('sheet').firstChild; if (!c || !c.keyAction || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test((e.target || {}).tagName || '')) return; const k = (e.key || '').toLowerCase(); if ('pnas'.includes(k) && k.length === 1) { e.preventDefault(); c.keyAction(k); } });
const openNow = () => openReview('now'), openReviews = key => openReview('todo', typeof key === 'string' ? key : undefined);
$('bNow').onclick = () => openReview('now'); $('bRev').onclick = () => openReview('todo');


// ---------- sheets ----------
const sheet = html => { $('sheet').innerHTML = `<div class="card">${html}</div>`; $('sheet').classList.add('on'); return $('sheet').firstChild; };
const closeSheet = () => { if (rec) rec.stop(); clearInterval(nowTimer); $('sheet').classList.remove('on'); $('sheet').innerHTML = ''; };
const field = (id, ph, type) => `<div class="row"><input id="${id}" type="${type || 'text'}" placeholder="${ph}"><button class="mic" data-mic="${id}" style="width:40px;height:40px;border-radius:12px;border:1px solid var(--ln);background:#fff">🎙️</button></div>`;
const wireMics = root => root.querySelectorAll('[data-mic]').forEach(b => micFor($(b.dataset.mic), b));

function openCheckin() {
  const A = {name: S.profile.name, mood: '', goals: [], weekGoals: [], landmarks: [], note: ''};
  const steps = [];
  if (!S.profile.name) steps.push('name');
  steps.push('mood', 'focus', 'goals'); if (S.isMonday || !S.hasWeek) steps.push('week'); steps.push('dates');
  let i = 0;
  const pills = (arr, k) => arr.map((x, n) => `<span class="pill">${esc(x.name || x)}${x.date ? ' · ' + x.date : ''}<b data-rm="${k},${n}">×</b></span>`).join('');
  const draw = () => {
    const s = steps[i], nm = A.name || 'there'; let body = '';
    if (s === 'name') body = `<h3>Hey! I'm ${esc(S.profile.buddyName)} 👋</h3><p>I'll be around while you study. What should I call you?</p>${field('f1', 'Your name')}`;
    if (s === 'mood') body = `<h3>Hey ${esc(nm)}, how are you feeling today?</h3><p>No wrong answer, I just wanna know.</p><div class="moods">${MOODS.map(m => `<button data-mood="${m[1]}" class="${A.mood === m[1] ? 'on' : ''}">${m[0]}<small>${m[1]}</small></button>`).join('')}</div>${field('f1', 'Anything on your mind? (optional)')}`;
    if (s === 'focus') body = `<h3>What's your main focus right now?</h3><p>Pick an exam topic or task. Only work on it counts toward your hours and streak. (Nothing listed? Skip, then add an exam or task.)</p>${goalChips(A.goalId)}`;
    if (s === 'goals') body = `<h3>What do you want to get done today?</h3><p>Even 1–3 small things is perfect.</p><div id="pl">${pills(A.goals, 'g')}</div>${field('f1', 'e.g. Finish Physics chapter 4 questions')}<button class="chip" id="addg">＋ add</button>`;
    if (s === 'week') body = `<h3>And this week?</h3><p>The bigger things you want to hit by Sunday.</p><div id="pl">${pills(A.weekGoals, 'w')}</div>${field('f1', 'e.g. Complete Organic Chemistry revision')}<button class="chip" id="addg">＋ add</button>`;
    if (s === 'dates') body = `<h3>Any tests or deadlines coming up?</h3><p>I'll keep track so you don't have to. Skip if nothing new.</p><div id="pl">${pills(A.landmarks, 'l')}</div>${field('f1', 'Name, e.g. Physics unit test')}<div class="row"><input id="f2" type="date"></div><button class="chip" id="addg">＋ add</button>`;
    const last = i === steps.length - 1, c = sheet(`<div class="dots">${steps.map((_, n) => `<i class="${n <= i ? 'on' : ''}"></i>`).join('')}</div>${body}<div class="acts"><button class="btn alt" id="skip" style="${s === 'name' || s === 'mood' ? 'visibility:hidden' : ''}">Skip</button><button class="btn" id="next">${last ? 'Done ✓' : 'Next →'}</button></div>`);
    wireMics(c); const f1 = $('f1') || {value: '', focus() {}}; f1.focus();
    const add = () => { const v = f1.value.trim(); if (!v) return false;
      if (s === 'goals') A.goals.push(v); else if (s === 'week') A.weekGoals.push(v); else if (s === 'dates') { if (!$('f2').value) { toast('Pick the date too 📅'); return false; } A.landmarks.push({name: v, date: $('f2').value}); }
      return true; };
    c.querySelectorAll('[data-ga]').forEach(b => b.onclick = () => { A.goalId = b.dataset.ga; A.goalName = b.dataset.gn; A.goalKind = b.dataset.gk; A.goalSet = true; c.querySelectorAll('[data-ga]').forEach(x => x.classList.toggle('on', x === b)); });
    c.querySelectorAll('[data-mood]').forEach(b => b.onclick = () => { A.mood = b.dataset.mood; c.querySelectorAll('[data-mood]').forEach(x => x.classList.toggle('on', x === b)); });
    c.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const [k, n] = b.dataset.rm.split(','); ({g: A.goals, w: A.weekGoals, l: A.landmarks})[k].splice(+n, 1); draw(); });
    if ($('addg')) { $('addg').onclick = () => { if (add()) draw(); }; f1.onkeydown = e => { if (e.key === 'Enter') { if (add()) draw(); } }; }
    $('skip').onclick = () => next(true); $('next').onclick = () => next(false);
    const next = skip => { if (!skip) { if (s === 'name') { if (!f1.value.trim()) return toast('Tell me your name 🙂'); A.name = f1.value.trim(); }
        else if (s === 'mood') { if (!A.mood) return toast('Tap how you feel 🙂'); A.note = f1.value.trim(); }
        else if (s === 'focus') { /* chosen by tapping a chip */ } else if (f1.value.trim()) { if (!add()) return; } }
      if (s === 'name' && skip) return toast('Tell me your name 🙂'); if (s === 'mood' && skip) return toast('Tap how you feel 🙂');
      if (last) finish(); else { i++; draw(); } };
  };
  const finish = async () => { closeSheet(); if (A.goalSet) await j('/api/curgoal', {id: A.goalId, name: A.goalName, kind: A.goalKind}); S = await j('/api/buddy/checkin', A); S = await j('/api/buddy/state'); handledCheckin = true; drawPanel(); say('', {type: 'checkin_done'}); };
  draw();
}

function openAdd() {
  let kind = 'day'; const K = [['day', '🎯 Today'], ['week', '📅 This week'], ['more', '⋯ More']], M = [['landmark', '📌 Test / deadline'], ['mood', '💭 How I feel'], ['note', '📝 Note']];
  const chapOpts = (S.chaps || []).map(c => `<option value="${c.id}">${esc(c.name)} · ${esc(c.exam)} (${c.p}%)</option>`).join('');
  const c = sheet(`<h3>Add a goal 🎯</h3><p>Type it or say it. Link it to an exam topic and that topic's progress updates by itself.</p><div class="kinds" id="kk">${K.map(k => `<button class="chip ${k[0] === kind ? 'on' : ''}" data-k="${k[0]}">${k[1]}</button>`).join('')}</div><div class="kinds" id="km" style="display:none">${M.map(k => `<button class="chip" data-k="${k[0]}">${k[1]}</button>`).join('')}</div>${field('t1', 'e.g. Solve 20 optics numericals')}
    <div class="row" id="dr" style="display:none"><input id="t2" type="date"></div><div class="row" id="dl"><input id="t3" type="datetime-local" title="Deadline (optional)"></div>
    <div id="lk"><label>How many minutes will it take? (optional: its progress then follows your time)</label><input id="t6" type="number" min="0" placeholder="e.g. 45"><label>Link to exam topic (optional, matching names are linked automatically)</label><select id="t4"><option value="">No link</option>${chapOpts}</select><div class="sw"><input type="checkbox" id="t5"><span>Make it my current goal</span></div>
    <div class="sw"><input type="checkbox" id="rm0"><span>🔔 Remind me (start, in between, deadline, then keep asking)</span></div><div id="rmb" style="display:none">${remindFields({})}</div></div>
    <div class="acts"><button class="btn alt" id="cx">Cancel</button><button class="btn" id="ok">Add goal</button></div>`);
  wireMics(c); $('t1').focus(); const rmw = wireRemind(c); $('rm0').onchange = () => $('rmb').style.display = $('rm0').checked ? 'block' : 'none';
  const sync = () => { const g = kind === 'day' || kind === 'week'; $('dr').style.display = kind === 'landmark' ? 'flex' : 'none'; $('dl').style.display = g ? 'flex' : 'none'; $('lk').style.display = g ? 'block' : 'none'; $('ok').textContent = g ? 'Add goal' : 'Save'; c.querySelectorAll('[data-k]').forEach(x => x.classList.toggle('on', x.dataset.k === kind)); };
  c.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { if (b.dataset.k === 'more') { $('km').style.display = $('km').style.display === 'none' ? 'flex' : 'none'; return; } kind = b.dataset.k; sync(); });
  $('cx').onclick = closeSheet;
  $('ok').onclick = async () => { const text = $('t1').value.trim(); if (!text) return toast('Type or say your goal first'); const r = await j('/api/buddy/add', {kind, text, date: $('t2').value, dl: $('t3').value, chap: $('t4').value, est: +($('t6').value || 0), makeCurrent: $('t5').checked, remind: $('rm0').checked ? {on: true, ...rmw()} : undefined});
    if (!r.ok) return toast(r.err || 'Couldn\'t save that'); S = await j('/api/buddy/state'); drawPanel(); closeSheet(); say('', {type: 'newdata', desc: r.desc}); };
}

function openSettings() {
  const p = S.profile, L = [['en-IN', 'English (India)'], ['hi-IN', 'Hindi'], ['bn-IN', 'Bengali'], ['en-US', 'English (US)']], th = document.documentElement.dataset.pref || 'auto';
  const voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith((p.lang || 'en').slice(0, 2)));
  const lns = k => (S.quotes || []).filter(q => q.kind === k).map(q => `<div class="lm"><span>${k === 'distract' ? '😤' : '🏆'} ${esc(q.text)} <small style="color:var(--mt)">· used ${q.used || 0}×</small></span><button class="chip" data-qd="${q.id}">✕</button></div>`).join('') || '<small style="color:var(--mt)">None yet: Buddy uses a few built-in lines until you add your own.</small>';
  const quotes = () => (S.quotes || []).filter(q => !['distract', 'achieve'].includes(q.kind)).map(q => `<div class="lm"><span>${q.kind === 'motivation' ? '💪' : '❝'} ${esc(q.text)}${q.author ? ' <small style="color:var(--mt)">- ' + esc(q.author) + '</small>' : ''} <small style="color:var(--mt)">· used ${q.used || 0}×</small></span><button class="chip" data-qd="${q.id}">✕</button></div>`).join('') || '<small style="color:var(--mt)">No quotes yet.</small>';
  const c = sheet(`<h3>Settings ⚙️</h3>
  <label>Your name</label><input id="s1" value="${esc(p.name)}"><label>Buddy's name</label><input id="s2" value="${esc(p.buddyName)}"><label>Class / grade</label><input id="s3" value="${esc(p.grade)}">
  <label>Appearance</label><div class="kinds">${[['auto', 'Auto'], ['light', '☀️ Light'], ['dark', '🌙 Dark']].map(t => `<button class="chip ${th === t[0] ? 'on' : ''}" data-th="${t[0]}">${t[1]}</button>`).join('')}</div>
  <label>How often may Buddy pop up?</label><select id="s14">${[['quiet', 'Quiet: a few check-ins a day'], ['balanced', 'Balanced (recommended)'], ['chatty', 'Chatty: more encouragement']].map(l => `<option value="${l[0]}" ${l[0] === p.level ? 'selected' : ''}>${l[1]}</option>`).join('')}</select>
  <label>Voice language (mic + spoken replies)</label><select id="s4">${L.map(l => `<option value="${l[0]}" ${l[0] === p.lang ? 'selected' : ''}>${l[1]}</option>`).join('')}</select>
  <label>Voice engine</label><select id="s19">${[['auto', 'Natural voice (Chatterbox) when available, else browser voice'], ['chatterbox', 'Natural voice only'], ['browser', 'Browser / Edge voice only']].map(l => `<option value="${l[0]}" ${l[0] === (p.ttsEngine || 'auto') ? 'selected' : ''}>${l[1]}</option>`).join('')}</select>
  <div class="note" id="vst" style="text-align:left;margin:4px 0 0">Checking the natural voice…</div>
  <label>Expressiveness <small id="ev">${p.ttsExag ?? 1}</small></label><input type="range" id="s20" min="0.5" max="1.5" step="0.1" value="${p.ttsExag ?? 1}">
  <label>Browser voice (used when the natural voice is off or not ready)</label><select id="s15"><option value="">Automatic (best natural voice)</option>${voices.map(v => `<option value="${esc(v.name)}" ${v.name === p.ttsVoice ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
  <label>Speed <small id="rv">${p.ttsRate}</small></label><input type="range" id="s16" min="0.7" max="1.4" step="0.05" value="${p.ttsRate}"><label>Pitch (browser voice only) <small id="pv">${p.ttsPitch}</small></label><input type="range" id="s17" min="0.7" max="1.4" step="0.05" value="${p.ttsPitch}">
  <div class="acts" style="justify-content:flex-start"><button class="btn alt" id="tv">▶ Test voice</button></div>
  <div class="sw"><input type="checkbox" id="s5" ${p.voice ? 'checked' : ''}><span>Speak replies out loud</span></div>
  <div class="sw"><input type="checkbox" id="s5c" ${p.ttsCute !== false ? 'checked' : ''}><span>Cute kid voice (higher, playful, little giggles)</span></div>
  <div class="sw"><input type="checkbox" id="s21" ${p.devSrc !== false ? 'checked' : ''}><span>Developer: small dot on each reply (green = system algorithm, blue = live AI)</span></div>
  <div class="sw"><input type="checkbox" id="s18" ${p.duck !== false ? 'checked' : ''}><span>Pause videos &amp; music while I speak</span></div>
  <div class="sw"><input type="checkbox" id="s6" ${p.shareApps ? 'checked' : ''}><span>Let Buddy know which app I'm on (app name only, never page titles)</span></div>
  <div class="sw"><input type="checkbox" id="s7" ${p.enabled ? 'checked' : ''}><span>Buddy checks in on its own (check-in, distractions, celebrations)</span></div>
  <div class="sw"><input type="checkbox" id="s22" ${p.newSiteAsk !== false ? 'checked' : ''}><span>Ask me whether a new site / app is productive and aligned with my goal</span></div>
  <label>...but only after I have spent this many minutes on it</label><input id="s23" type="number" min="1" max="240" value="${p.newSiteMin ?? 20}">
  <label>When this many new sites / apps are waiting, offer a quick clean-up</label><input id="s24" type="number" min="5" max="500" value="${p.newSiteBatch ?? 50}">
  <label>Soft reminder to review when this many sites / apps are waiting (max 2 a day)</label><input id="s27" type="number" min="3" max="200" value="${p.newSiteNudge ?? 10}">
  <label>Corner pop-up every N minutes (0 = only when I click the tray icon)</label><input id="s11" type="number" min="0" max="240" value="${p.peekMin}">
  <label>A break shorter than this many minutes doesn't end your focus streak</label><input id="s12" type="number" min="1" max="30" value="${S.gap || 5}">
  <div class="hint2" id="lnh"></div>
  <label>How often Buddy uses my own lines <small id="lsv">${Math.round((p.lineShare ?? .9) * 100)}%</small></label><input type="range" id="s28" min="20" max="100" step="5" value="${Math.round((p.lineShare ?? .9) * 100)}">
  <div class="acts" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"><button class="btn alt" id="tl1">😤 Hear a distracted line</button><button class="btn alt" id="tl2">🏆 Hear a win line + quote</button></div>
  <label>Quotes & motivation messages Buddy can use</label><div id="ql" style="max-height:130px;overflow:auto">${quotes()}</div>
  <div class="row"><input id="qt" placeholder="Add a quote or your own motivation line…"><button class="chip" id="qa">＋ Add</button></div>
  <label>😤 When I'm distracted, Buddy says… (your own lines; {name} and {goal} work)</label><div id="ld" style="max-height:110px;overflow:auto">${lns('distract')}</div>
  <div class="row"><input id="ldt" placeholder="e.g. Future you is watching. Close it, {name}."><button class="chip" id="lda">＋ Add</button></div>
  <label>🏆 When I hit a streak or finish a goal, Buddy says…</label><div id="la" style="max-height:110px;overflow:auto">${lns('achieve')}</div>
  <div class="row"><input id="lat" placeholder="e.g. That's how winners show up, {name}!"><button class="chip" id="laa">＋ Add</button></div>
  <label>🔔 Reminders</label><div class="sw"><input type="checkbox" id="s25" ${p.remindOn !== false ? 'checked' : ''}><span>Pop up for goal reminders (start, custom times, deadline)</span></div>
  <label>After a deadline, ask "what are you doing?" every (minutes)</label><input id="s26" type="number" min="5" max="240" value="${p.overdueMin || 30}">
  <label>Coach rules for Buddy's motivation (one per line)</label><textarea class="f" id="s13" rows="5">${esc((p.prompts || []).join('\n'))}</textarea>
  <label>Helpline shown if someone is in distress</label><input id="s8" value="${esc(p.helpline)}">
  <label>OpenRouter API keys, one per line (${S.keys.length ? S.keys.length + ' saved: ' + S.keys.map(esc).join(', ') + '. Paste new ones to replace' : 'none saved yet'}). Used only for questions you ask directly (and rarely for a cheer).</label><textarea class="f" id="s9" rows="3" placeholder="sk-or-v1-…"></textarea>
  <label>Models to try first (optional, one per line)</label><textarea class="f" id="s10" rows="2">${esc(S.models.join('\n'))}</textarea>
  <div class="acts"><button class="btn alt" id="clr">Clear chat</button><button class="btn alt" id="cx">Close</button><button class="btn" id="ok">Save & test</button></div><p id="res" style="margin:10px 0 0"></p>
  <hr style="border:0;border-top:1px solid var(--ln);margin:14px 0"><button class="btn alt" id="wipe" style="color:#DC2626;border-color:#DC2626">⚠ Delete all my data…</button>`);
  $('cx').onclick = closeSheet; $('clr').onclick = async () => { S = await j('/api/buddy/settings', {clearChat: true}); $('msgs').innerHTML = ''; toast('Chat cleared'); };
  c.querySelectorAll('[data-th]').forEach(b => b.onclick = () => { setTheme(b.dataset.th); c.querySelectorAll('[data-th]').forEach(x => x.classList.toggle('on', x === b)); });
  $('s20').oninput = e => $('ev').textContent = e.target.value;
  $('s28').oninput = e => $('lsv').textContent = e.target.value + '%';
  const lnh = () => { const Q = S.quotes || [], nq = Q.filter(q => ['quote', 'motivation'].includes(q.kind || 'quote')).length, nd = Q.filter(q => q.kind === 'distract').length, na = Q.filter(q => q.kind === 'achieve').length;
    $('lnh').innerHTML = (nq + nd + na) ? `Buddy rotates through <b>${nq}</b> quote${nq === 1 ? '' : 's'}, <b>${nd}</b> distracted line${nd === 1 ? '' : 's'} and <b>${na}</b> win line${na === 1 ? '' : 's'}: every one gets a turn before any repeats, and the live AI is told to use them too.${!nd || !na ? ' <b>' + (!nd ? 'Add a distracted line' : 'Add a win line') + '</b> and Buddy will use yours instead of the built-in ones.' : ''}` : 'You have not added any quotes or lines yet, so Buddy only uses a few built-in ones. Add your own below and Buddy will use them.'; }; lnh();
  $('tl1').onclick = () => { closeSheet(); say('', {type: 'offtask', force_own: true}); }; $('tl2').onclick = () => { closeSheet(); say('', {type: 'streak', minutes: 30, force_own: true}); };
  cbReady(true).then(() => { const i = cbState.info || {}, v = $('vst'); if (!v) return;
    v.textContent = i.ready ? `\u2705 Natural voice is running (${i.device || 'cpu'}). Hindi and English.` : i.running && i.loading ? '\u23F3 Natural voice is starting (it downloads the model the first time, a few minutes)\u2026'
      : i.installed ? '\u26A0 Installed but not running yet. Restart Rize Buddy.' + (i.error ? ' (' + i.error + ')' : '') : 'Not installed: run setup-voice.bat once (Hindi + English, about 3 GB). Until then the browser voice is used.'; });
  $('s16').oninput = e => $('rv').textContent = e.target.value; $('s17').oninput = e => $('pv').textContent = e.target.value;
  $('tv').onclick = () => { S.profile.ttsVoice = $('s15').value; S.profile.ttsRate = +$('s16').value; S.profile.ttsPitch = +$('s17').value; S.profile.ttsCute = $('s5c').checked; S.profile.ttsEngine = $('s19').value; S.profile.ttsExag = +$('s20').value; S.profile.voice = true; if (S.profile.ttsEngine !== 'browser' && cbState.ok) toast('Natural voice: the first sentence can take a few seconds\u2026'); speak('WOW! That was a great session! Congratulations, you just completed your goal for today!', 'cheering'); };
  const reQ = () => { lnh(); $('ql').innerHTML = quotes(); $('ld').innerHTML = lns('distract'); $('la').innerHTML = lns('achieve'); wireQ(); };
  const wireQ = () => c.querySelectorAll('[data-qd]').forEach(b => b.onclick = async () => { const r = await j('/api/buddy/quotes', {op: 'del', id: +b.dataset.qd}); S.quotes = r.quotes; reQ(); });
  const addLine = (inp, kind) => async () => { const t = $(inp).value.trim(); if (!t) return; const r = await j('/api/buddy/quotes', {op: 'add', text: t, kind}); S.quotes = r.quotes; $(inp).value = ''; reQ(); };
  $('lda').onclick = addLine('ldt', 'distract'); $('laa').onclick = addLine('lat', 'achieve');
  wireQ(); $('qa').onclick = async () => { const t = $('qt').value.trim(); if (!t) return; const r = await j('/api/buddy/quotes', {op: 'add', text: t, kind: 'motivation'}); S.quotes = r.quotes; $('qt').value = ''; reQ(); };
  $('wipe').onclick = () => { const w = sheet(`<h3>Delete ALL data? ⚠️</h3><p>Everything is erased: history, exams, tasks, goals, chat, quotes. I'll ask you my first-time questions again. This cannot be undone.</p><label><input type="checkbox" id="wk" checked style="width:auto;flex:none"> Keep my API keys</label><label>Type DELETE to confirm</label><input id="wc" autocomplete="off"><div class="acts"><button class="btn alt" id="wn">Cancel</button><button class="btn" id="wy" style="background:#DC2626">Delete everything</button></div>`);
    $('wn').onclick = closeSheet; $('wy').onclick = async () => { if ($('wc').value.trim() !== 'DELETE') return toast('Type DELETE to confirm'); const r = await j('/api/reset', {confirm: 'DELETE', keepKeys: $('wk').checked}); if (r.ok) location.reload(); }; };
  $('ok').onclick = async () => {
    S = await j('/api/buddy/settings', {name: $('s1').value, buddyName: $('s2').value, grade: $('s3').value, lang: $('s4').value, voice: $('s5').checked, shareApps: $('s6').checked, enabled: $('s7').checked, helpline: $('s8').value, keys: $('s9').value, models: $('s10').value, peekMin: +$('s11').value, prompts: $('s13').value, level: $('s14').value, ttsVoice: $('s15').value, ttsRate: +$('s16').value, ttsPitch: +$('s17').value, ttsCute: $('s5c').checked, duck: $('s18').checked, devSrc: $('s21').checked, newSiteAsk: $('s22').checked, newSiteMin: +$('s23').value, newSiteBatch: +$('s24').value, newSiteNudge: +$('s27').value || 10, lineShare: (+$('s28').value || 90) / 100, remindOn: $('s25').checked, overdueMin: +$('s26').value || 30, ttsEngine: $('s19').value, ttsExag: +$('s20').value}); cbState.t = 0;
    await j('/api/focus/gap', {gap: +$('s12').value});
    drawPanel(); $('res').textContent = 'Testing the AI connection…'; const r = await j('/api/buddy/chat', {text: 'Reply with one short friendly hello to confirm you are working'});
    $('res').textContent = r.ai ? '✅ AI connected! ' + r.reply : (S.keys.length ? '⚠️ Couldn\'t reach the AI. Check the keys and your internet.' : 'Saved ✓ (no API key: Buddy still works with its built-in brain, add a key for free-form questions).'); if (r.ai) addMsg('buddy', r.reply); };
}
$('bAi').onclick = () => j('/api/ai/launcher', {}); $('bBrowser').onclick = () => j('/api/ai/launcher', {}); $('bAdd').onclick = openAdd; $('bSet').onclick = openSettings;
$('bVoice').onclick = async () => { S = await j('/api/buddy/settings', {voice: !S.profile.voice}); drawPanel(); if (!S.profile.voice) stopSpeaking(); };
$('bTheme').onclick = () => cycleTheme();
$('sheet').onclick = e => { if (e.target === $('sheet')) closeSheet(); };

// ---------- composer ----------
$('send').onclick = send; $('in').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
$('in').oninput = () => { $('in').style.height = 'auto'; $('in').style.height = Math.min(100, $('in').scrollHeight) + 'px'; };
$('mic').onclick = () => {
  if (rec) { rec.stop(); return; } $('mic').classList.add('rec'); stopSpeaking();
  rec = listen((t, fin) => { $('in').value = t; if (fin) { rec && rec.stop(); } }, () => { rec = null; $('mic').classList.remove('rec'); if ($('in').value.trim()) send(); });
};

// ================= v13: robot folds into a slim strip, goals open in its place, header menu =================
let robotOpen = true, autoFold = false;
function setRobot(open, user) {
  robotOpen = open; $('robotBox').classList.toggle('open', open); $('miniBox').classList.toggle('open', !open);
  if (user) autoFold = false;
  if (open && user && panelOn && innerHeight < 780) setPanel(false, true);          // robot and goals share the same room on a short window
  setTimeout(() => { try { robot && robot.resize(); } catch (e) {} }, 430);
}
function setPanel(on, keepRobot) {
  panelOn = on; $('panelBox').classList.toggle('open', on); $('bGoals').classList.toggle('on', on);
  if (keepRobot) { autoFold = false; return; }
  if (on && robotOpen) { autoFold = true; setRobot(false); }                       // goals open where the robot was, the robot folds into the strip
  else if (!on && autoFold) { autoFold = false; setRobot(true); }
}
$('stFold').onclick = e => { e.stopPropagation(); setRobot(false, true); };
$('mini').onclick = e => { if (e.target.closest('#mguard')) return; setRobot(true, true); };
$('bGoals').onclick = () => setPanel(!panelOn);
const shortWin = matchMedia('(max-height:560px)');
shortWin.addEventListener && shortWin.addEventListener('change', m => { if (m.matches && robotOpen) { autoFold = true; setRobot(false); } else if (!m.matches && autoFold && !panelOn) { autoFold = false; setRobot(true); } });
const moreSet = on => { $('moreMenu').classList.toggle('open', on); $('bMore').classList.toggle('on', on); $('bMore').setAttribute('aria-expanded', on); };
$('bMore').onclick = e => { e.stopPropagation(); moreSet(!$('moreMenu').classList.contains('open')); };
document.addEventListener('click', e => { if (!e.target.closest('#moreMenu') && !e.target.closest('#bMore')) moreSet(false); });
$('moreMenu').addEventListener('click', () => setTimeout(() => moreSet(false), 80));
document.addEventListener('keydown', e => { if (e.key === 'Escape') moreSet(false); });
if (shortWin.matches) { autoFold = true; setRobot(false); }

// ---------- start ----------
(async () => {
  robot = new Robot($('rb'), .5);
  { const rs = robot.set.bind(robot); robot.set = (n, ms) => rs(ms && Date.now() - LASTT < 2500 ? refineEmo(n, LASTTXT) : n, ms); }
  S = await j('/api/buddy/state'); S.gap = (await j('/api/focus?days=7')).gap; drawPanel(); loadRanks(); setInterval(async () => { try { S = {...(await j('/api/buddy/state')), gap: S.gap}; drawPanel(); } catch (e) {} }, 15000); setInterval(loadRanks, 90000);
  S.log.forEach(m => addMsg(m.r === 'user' ? 'user' : 'buddy', m.c, false, m.src));
  await poll();
  if (!S.checkedIn && !handledCheckin) openCheckin();
  else if (await comeBack()) {}
  else if (!$('sheet').classList.contains('on') && (!S.log.length || Date.now() - S.log[S.log.length - 1].t > 4 * 36e5) && !busy) say('', {type: 'greet'});
  setInterval(poll, 2500); guardPoll();
})();


// ================= reminders: start time, custom times, deadline, then "what are you doing?" every N minutes =================
var pendingOver = null, overTitle = '';
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.setValueAtTime(.15, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .6); o.start(); o.stop(a.currentTime + .6); } catch (e) {} }
function remindFields(r) {
  const mids = (r.mid || []).map(m => `<button class="chip" data-mid="${m}">${m.replace('T', ' ')} ✕</button>`).join('');
  return `<label>⏰ Start time (Buddy pops up and says "time to start")</label><input id="rs" type="datetime-local" value="${r.start || ''}">
    <label>🕐 Extra reminders between start and deadline</label><div class="row"><input id="rmt" type="datetime-local"><button class="chip" id="rma">＋ Add</button></div><div class="mids" id="rml">${mids}</div>
    <label>🚨 After the deadline, ask "what are you doing?" every (minutes, 0 = never)</label><input id="rov" type="number" min="0" max="240" value="${r.ov ?? (S.profile.overdueMin || 30)}">`;
}
function wireRemind(root) {
  const mid = new Set([...root.querySelectorAll('[data-mid]')].map(b => b.dataset.mid));
  const draw = () => { $('rml').innerHTML = [...mid].sort().map(m => `<button class="chip" data-mid="${m}">${m.replace('T', ' ')} ✕</button>`).join(''); $('rml').querySelectorAll('[data-mid]').forEach(b => b.onclick = () => { mid.delete(b.dataset.mid); draw(); }); };
  $('rma').onclick = () => { const v = $('rmt').value; if (!v) return toast('Pick a date and time first'); mid.add(v); $('rmt').value = ''; draw(); };
  draw();
  return () => ({start: $('rs').value, mid: [...mid], ov: +$('rov').value});
}
function openReminder(id) {
  const g = [...S.today.goals, ...S.week].find(x => x.id === id); if (!g) return;
  const c = sheet(`<h3>🔔 Reminders</h3><p><b>${esc(g.t)}</b></p><label>Deadline</label><input id="rdl" type="datetime-local" value="${g.dl || ''}">${remindFields(g.rm || {})}
    <div class="acts">${g.rm ? '<button class="btn alt" id="rx">Remove</button>' : ''}<button class="btn alt" id="cx">Cancel</button><button class="btn" id="ok">Save</button></div>`);
  const get = wireRemind(c); $('cx').onclick = closeSheet;
  if ($('rx')) $('rx').onclick = async () => { const r = await j('/api/buddy/reminder', {id, op: 'clear'}); if (r.ok) { S = r.state; drawPanel(); closeSheet(); toast('Reminders removed'); } };
  $('ok').onclick = async () => { const r = await j('/api/buddy/reminder', {id, dl: $('rdl').value, ...get()}); if (!r.ok) return toast(r.err || 'Could not save'); S = r.state; drawPanel(); closeSheet(); toast('Reminders saved 🔔'); };
}
async function remindAct(id, act, min) { const r = await j('/api/buddy/remind-act', {id, act, min}); if (r.reply) { addMsg('buddy', r.reply); robot.set(r.emotion || 'happy', 6000); speak(r.reply, r.emotion || 'happy'); } if (r.state) { S = r.state; drawPanel(); } else toast(act === 'snooze' ? 'Snoozed ' + min + ' min 😴' : 'Okay'); }
async function markDone(id) { const r = await j('/api/buddy/goal', {id, scope: ((S.today.goals.find(x => x.id === id)) ? 'day' : 'week')}); if (r.ok) { S = r.state; drawPanel(); if (r.done) say('', {type: 'goal_done', desc: r.text}); } }
async function startNow(e) { try { await setGoalFrom({id: 'g:task:' + e.id, name: e.title, kind: 'task'}); } catch (x) {} tmrOp('start', {forceGoal: 1}); }
async function remindEvent(e) {
  beep(); await say('', e);
  if (e.kind === 'start') setChips([['▶ Start now (timer)', () => startNow(e)], ['😴 10 min', () => remindAct(e.id, 'snooze', 10)], ['Later', () => {}]]);
  else if (e.kind === 'mid') setChips([['▶ Start a block', () => startNow(e)], ['👍 On track', () => say('I\'m on track')], ['😴 10 min', () => remindAct(e.id, 'snooze', 10)]]);
  else if (e.kind === 'dl') setChips([['✅ It\'s done', () => markDone(e.id)], ['⏰ +30 min', () => remindAct(e.id, 'more', 30)], ['⏰ +1 hour', () => remindAct(e.id, 'more', 60)]]);
  else if (e.kind === 'overdue') {
    pendingOver = e.id; overTitle = e.title; $('in').placeholder = 'What are you doing right now?';
    setChips([['💪 Working on it', () => answerOver(e.id, 'working on it', 'working')], ['☕ On a break', () => answerOver(e.id, 'taking a break', 'break')], ['🙈 Something else', () => answerOver(e.id, 'something else, not this')], ['⏰ I need more time', () => { pendingOver = null; remindAct(e.id, 'more', 30); }], ['✅ It\'s done', () => { pendingOver = null; markDone(e.id); }], ['🔕 Stop asking', () => { pendingOver = null; remindAct(e.id, 'stop'); }]]);
  }
}
async function answerOver(id, text, code) {
  pendingOver = null; $('in').placeholder = 'Type or tap the mic…'; setChips([]); addMsg('user', text); typing(true);
  let r; try { r = await j('/api/buddy/remind-answer', {id, text, code}); } catch (e) { r = {reply: 'Hmm, my connection hiccuped. Try again?', emotion: 'confused'}; }
  await sleep(Math.min(1200, 350 + r.reply.length * 8)); typing(false); addMsg('buddy', r.reply, false, r.src); robot.set(r.emotion || 'happy', 7000); speak(r.reply, r.emotion || 'happy');
  if (r.verdict === 'not' || r.verdict === 'unclear') { pendingOver = id; setChips([['Okay, 10-min sprint 💪', () => answerOver(id, 'working on it', 'working')], ['⏰ I need more time', () => { pendingOver = null; remindAct(id, 'more', 30); }]]); }
  S = await j('/api/buddy/state'); drawPanel();
}

// ================= focus timer in Buddy's window (same timer as the dashboard Timer page) =================
var TM = null, TMt = 0, TMIN = false; try { TMIN = localStorage.getItem('rbTmrMin') === '1'; } catch (e) {}
const mmss = ms => { const t = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(t / 60), s = t % 60; return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); };
async function tmrPoll() { try { TM = await j('/api/timer'); TMt = Date.now(); drawTimer(); } catch (e) {} }
async function tmrOp(op, extra) { try { TM = await j('/api/timer', {op, ...(extra || {})}); TMt = Date.now(); drawTimer(); S = {...(await j('/api/buddy/state')), gap: S.gap}; drawPanel(); } catch (e) {} }
function drawTimer() {
  if (!TM || !$('tmr')) return; const p = TM.pomo, left = p.running ? Math.max(0, p.endAt - Date.now()) : TM.left, brk = p.mode !== 'focus';
  const pct = clamp(100 - left / TM.total * 100, 0, 100), name = brk ? (p.mode === 'long' ? 'Long break' : 'Short break') : (p.task || (S && S.goal && S.goal.name) || 'Focus');
  const root = $('tmr'); root.className = (p.running ? 'run ' : '') + (brk ? 'brk ' : '') + (TMIN ? 'min' : '');
  if (!root.dataset.built) { root.dataset.built = 1; root.innerHTML = `<div class="tw"><div class="ring"><svg viewBox="0 0 76 76" aria-hidden="true"><circle class="rb" cx="38" cy="38" r="34"/><circle class="rf" id="tring" cx="38" cy="38" r="34"/></svg><span class="tt" id="tt"></span></div><div class="ti"><div class="tnr"><b id="tn" title="Change topic"></b><button class="tfold" id="tfold" title="Collapse timer">⌃</button></div><small id="ts"></small><div class="tbtn"><button class="ib go" id="tgo" title="Start / pause"></button><button class="ib" id="ted" title="Change what you are working on">✏️ Topic</button><button class="ib" id="tpl" title="Add 5 minutes">⏱ +5m</button><button class="ib" id="tsk" title="Skip to the next block">⏭ Skip</button><button class="ib" id="tst" title="Stop and reset">⏹ Stop</button><button class="ib" id="tcf" title="Set minutes">⚙ Set</button></div></div></div><div class="fold open" id="tmw"><div class="fi"><div class="tmodes" id="tmd"></div></div></div>`;
    $('tfold').onclick = () => { TMIN = !TMIN; try { localStorage.setItem('rbTmrMin', TMIN ? '1' : '0'); } catch (e) {} drawTimer(); };
    $('tpl').onclick = () => tmrOp('extend', {min: 5});
    $('tn').onclick = $('ted').onclick = editTopic;
    $('tgo').onclick = () => tmrOp('toggle'); $('tsk').onclick = () => tmrOp('skip'); $('tst').onclick = () => tmrOp('stop');
    $('tcf').onclick = () => { const c = sheet(`<h3>⏱ Timer</h3><label>Focus minutes</label><input id="c1" type="number" min="1" max="240" value="${TM.pomo.cfg.focus}"><label>Short break</label><input id="c2" type="number" min="1" max="60" value="${TM.pomo.cfg.short}"><label>Long break</label><input id="c3" type="number" min="1" max="120" value="${TM.pomo.cfg.long}"><label>Long break after how many blocks</label><input id="c4" type="number" min="1" max="12" value="${TM.pomo.cfg.every}"><div class="acts"><button class="btn alt" id="cx">Cancel</button><button class="btn" id="ok">Save</button></div>`); $('cx').onclick = closeSheet; $('ok').onclick = async () => { await tmrOp('cfg', {focus: +$('c1').value, short: +$('c2').value, long: +$('c3').value, every: +$('c4').value}); closeSheet(); }; };
    $('tmd').onclick = e => { const b = e.target.closest('[data-m]'); if (b && !TM.pomo.running) tmrOp('mode', {mode: b.dataset.m}); }; }
  $('tt').textContent = mmss(left); $('tn').textContent = (brk ? '☕ ' : '🎯 ') + name; $('ts').textContent = `${TM.poms || 0} focus block${TM.poms === 1 ? '' : 's'} today · ${p.running ? 'running' : left < TM.total ? 'paused' : 'ready'}`;
  $('tring').style.strokeDashoffset = (213.6 * (1 - pct / 100)).toFixed(1); $('tmw').classList.toggle('open', !p.running && !TMIN); $('tfold').textContent = TMIN ? '⌄' : '⌃'; $('tfold').title = TMIN ? 'Expand timer' : 'Collapse timer'; $('tgo').textContent = (p.running ? '⏸' : '▶') + (TMIN ? '' : (p.running ? ' Pause' : ' Start'));
  if ($('tmd').dataset.m !== p.mode) { $('tmd').dataset.m = p.mode; $('tmd').innerHTML = [['focus', 'Focus'], ['short', 'Short break'], ['long', 'Long break']].map(([m, l]) => `<button class="chip ${p.mode === m ? 'on' : ''}" data-m="${m}">${l}</button>`).join(''); }
}
// change the timer's topic (what the block is booked to)
function editTopic() {
  if (!TM) return; const p = TM.pomo, sug = [];
  try { (((S || {}).goals) || []).forEach(g => g && g.name && sug.push(g.name)); if (S && S.goal && S.goal.name) sug.unshift(S.goal.name); } catch (e) {}
  const u = [...new Set(sug)].slice(0, 8);
  sheet(`<h3>✏️ Timer topic</h3><label>What are you working on?</label><input id="tpt" type="text" maxlength="120" value="${esc(p.task || '')}" placeholder="e.g. Chemistry – Organic revision">${u.length ? '<div class="chips" id="tps" style="margin-top:8px">' + u.map(n => `<button class="chip" data-n="${esc(n)}">🎯 ${esc(n)}</button>`).join('') + '</div>' : ''}<label>Type</label><select id="tpa"><option value="study">📚 Study</option><option value="prod">💼 Work / task</option><option value="exercise">🏃 Exercise</option></select><div class="acts"><button class="btn alt" id="cx">Cancel</button><button class="btn alt" id="tpr">↺ Use my goal</button><button class="btn" id="ok">✓ Save</button></div>`);
  $('tpa').value = p.act || 'study'; if ($('tps')) $('tps').onclick = e => { const b = e.target.closest('[data-n]'); if (b) $('tpt').value = b.dataset.n; };
  $('cx').onclick = closeSheet; $('ok').onclick = async () => { await tmrOp('task', {task: $('tpt').value, act: $('tpa').value}); closeSheet(); };
  $('tpr').onclick = async () => { await tmrOp('task', {task: '', act: $('tpa').value}); closeSheet(); }; setTimeout(() => $('tpt').focus(), 50);
}
setInterval(drawTimer, 1000); setInterval(tmrPoll, 3000); tmrPoll();


// ================= v12: link from chat, smart review, deadlines with live timers, refresh =================
let LKO = null;                                                        // exams / topics / tasks a site can be linked to
async function loadLko() { try { LKO = (await j('/api/buddy/rlinks')).opts; } catch (e) { LKO = []; } }
const ICO = {Exams: '📝 ', Topics: '📖 ', Tasks: '☑ '};
const lkSel = x => `<select class="lks" data-lk="${esc(x.key)}" style="margin-top:4px;max-width:100%;font-size:12px"><option value="">🔗 Link to exam / topic / task…</option>${(LKO || []).map(o => `<option value="${esc(o.gid)}">${ICO[o.group] || ''}${esc(o.name)}</option>`).join('')}</select>`;
const lkRow = x => x && x.key && x.canLabel !== false ? '<br>' + lkSel(x) + ((x.links || []).length ? ` <button class="chip" data-lc="${esc(x.key)}" style="font-size:11px">✕ unlink</button>` : '') : '';
// instant: the row shows the link before the server answers (the slow recalculation happens after the reply on the server)
async function lkChange(e) {
  const s = e.target.closest('.lks'); if (!s || !s.value) return; const gid = s.value, name = s.selectedOptions[0].textContent.replace(/^\S+\s/, ''), key = s.dataset.lk, row = s.closest('.nrow, .lm, .rcard, .nowcard');
  const sm = row && row.querySelector('small, .nm, .rmeta, .rh'); if (sm) sm.append(document.createTextNode(' · 🔗 ' + name)); s.value = ''; toast('Linked 🔗 ' + name);
  const r = await j('/api/buddy/rlink', {key, op: 'add', id: gid}).catch(() => ({ok: false})); if (!r.ok) toast('Could not link, try again');
}

async function openSmart() {
  sheet(`<h3>✨ Smart review</h3><div id="smb"><p>Sending your top 50 new sites and your upcoming exams to the AI in one go… this can take up to a minute ⏳</p></div><div class="acts"><button class="btn alt" id="cx">Close</button></div>`);
  $('cx').onclick = closeSheet;
  let R; try { R = await j('/api/buddy/smartreview', {}); } catch (e) { R = {ok: false, err: 'failed'}; }
  if (!$('smb')) return;
  if (!R.ok) { $('smb').innerHTML = R.err === 'nokey' ? '<p>Add an OpenRouter or Groq key first (⚙ settings, one key per line).</p>' : R.err === 'badjson' ? '<p>The AI answered in a format I could not read. Please try again.</p>' : '<p>I could not reach the AI. Check your keys in ⚙ settings and try again.</p>'; return; }
  if (!R.items.length) { $('smb').innerHTML = '<p>Nothing new to review 🎉</p>'; return; }
  const CNm = {f: '✅ Productive', b: '🚫 Not productive', m: '👥 Meeting'};
  const row = x => `<div class="lm" data-sk="${esc(x.key)}"><span><b>${esc(x.name)}</b><br><small style="color:var(--mt)">${fmtM(x.min)} · ${CNm[x.c]}${(x.links || []).length ? ' · 🔗 ' + esc(x.links.join(', ')) : ''}</small></span><span style="display:flex;gap:6px"><button class="chip" data-a="accept">👍</button><button class="chip" data-a="reject">✕</button></span></div>`;
  $('smb').innerHTML = `<p>I checked <b>${R.sent}</b> sites and apps against your upcoming exams. Nothing is applied until you accept:</p><div id="sml">${R.items.map(row).join('')}</div><div class="acts"><button class="btn" id="sma">Accept all suggestions</button></div>`;
  $('sma').onclick = () => { $('sml').innerHTML = '<p>Accepted 👍</p>'; j('/api/auto/feedback', {op: 'acceptall'}).then(async () => { S = await j('/api/buddy/state'); drawPanel(); }); };
  $('smb').onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; const r = b.closest('[data-sk]'); const k = r.dataset.sk; r.remove(); j('/api/auto/feedback', {key: k, op: b.dataset.a}); };
}

// ---- deadlines & exam timers: live countdown (the server sends the exact time; this window counts down every second)
let dueTimer = null;
const p2 = n => String(n).padStart(2, '0');
const cdTxt = ms => { const late = ms < 0; let s = Math.floor(Math.abs(ms) / 1000); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (late ? '−' : '') + (d ? d + 'd ' : '') + p2(h) + ':' + p2(m) + ':' + p2(s % 60); };
const cdCol = ms => ms < 0 ? '#EF4444' : ms < 864e5 ? '#F59E0B' : 'var(--g)';
async function openDeadlines() {
  let D; try { D = await j('/api/buddy/deadlines'); } catch (e) { return toast('Could not load deadlines'); }
  const off = D.now - Date.now(), inp = 'font-size:12px;padding:2px 4px;border-radius:8px;border:1px solid var(--bd,#9994);background:transparent;color:inherit';
  const tl = sel => `<select class="tls" style="${inp};max-width:100%"><option value="">🔗 Link…</option><option value="-">No link</option>${D.opts.filter(o => o.tl).map(o => `<option value="${esc(o.tl)}" ${sel && sel === o.tl ? 'selected' : ''}>${({Exams: '📝 ', Topics: '📖 ', Projects: '📁 '})[o.group] || ''}${esc(o.name)}</option>`).join('')}</select>`;
  const row = x => `<div class="lm" data-kind="${x.kind}" data-id="${esc(x.id)}"><span style="flex:1;min-width:0"><b>${({exam: '📝', task: '☑', project: '📁'})[x.kind]} ${esc(x.name)}</b>${x.prep != null ? ` <small style="color:var(--mt)">${x.prep}% ${x.kind === 'exam' ? 'ready' : 'done'}${x.tasks ? ' · ' + x.open + '/' + x.tasks + ' tasks open' : ''}</small>` : ''}<br>`
    + (x.kind === 'task' ? tl(x.lid) + ' ' : '') + `<input type="datetime-local" class="dti" value="${esc(x.iso)}" style="${inp}"></span><b class="cd" data-ts="${x.ts}" style="font-variant-numeric:tabular-nums;white-space:nowrap">…</b></div>`;
  const boxes = ts => `<div class="cdb" data-ts="${ts}">${['days', 'hrs', 'mins', 'secs'].map(u => `<div><b>00</b><small>${u}</small></div>`).join('<i>:</i>')}</div>`;
  const refBox = (ex, ch, refs) => `<div class="refs" data-ex="${esc(ex)}" data-ch="${ch == null ? '' : esc(ch)}"><small class="rl">Keywords = this ${ch == null ? 'exam' : 'chapter'}</small>${refs.map(r => `<span class="ref">${esc(r)}<button data-rd="${esc(r)}" title="Remove">×</button></span>`).join('')}<button class="refadd" data-ra="1" title="Add a keyword that means this ${ch == null ? 'exam' : 'chapter'}">+</button></div>`;
  const exRow = x => `<div data-kind="exam" data-id="${esc(x.id)}" style="border:1px solid rgba(128,128,128,.28);border-radius:12px;padding:10px;margin:8px 0"><b>🎓 ${esc(x.name)}</b> <small style="color:var(--mt)">${x.prep != null ? x.prep + '% prepared' : ''}${x.tasks ? ' · ' + x.open + '/' + x.tasks + ' tasks open' : ''}</small><br><input type="datetime-local" class="dti" value="${esc(x.iso)}" style="${inp}">${boxes(x.ts)}${refBox(x.id, null, x.refs || [])}${(x.ch || []).map(c => `<div style="padding:6px 0;border-top:1px dashed rgba(128,128,128,.25)"><b style="font-weight:600">${esc(c.name)}</b> <small style="color:var(--mt)">${c.p}%${c.dl ? ' · 📅 ' + esc(c.dl) : ''}</small>${refBox(x.id, c.id, c.refs || [])}</div>`).join('')}</div>`;
  const refsIn = (ex, ch) => { const x = D.items.find(i => i.kind === 'exam' && String(i.id) === String(ex)) || {}; return ch ? (x.ch || []).find(c => String(c.id) === String(ch)) || {} : x; };
  const redraw = (box, ex, ch) => { box.outerHTML = refBox(ex, ch || null, refsIn(ex, ch).refs || []); };
  const sec = (t, k) => { const L = D.items.filter(x => x.kind === k); return L.length ? `<p style="margin:12px 0 4px"><b>${t}</b></p>${L.map(k === 'exam' ? exRow : row).join('')}` : ''; };
  const free = D.opts.filter(o => o.group === 'Projects' && !D.items.some(x => x.kind === 'project' && 'p:' + x.id === o.tl));
  const c = sheet(`<h3>📅 Deadlines &amp; exam timers</h3><div id="dub">${sec('Exams', 'exam') + sec('Goals &amp; tasks', 'task') + sec('Projects', 'project') || '<p>No dated exams, goals or projects yet.</p>'}</div>`
    + (free.length ? `<p style="margin:12px 0 4px"><b>➕ Give a project a deadline</b></p><div class="flex" style="gap:6px;flex-wrap:wrap"><select id="pjs" style="${inp}">${free.map(o => `<option value="${esc(o.tl.slice(2))}">${esc(o.name)}</option>`).join('')}</select><input type="datetime-local" id="pjd" style="${inp}"><button class="chip" id="pjo">Set</button></div>` : '')
    + `<div class="acts"><button class="btn alt" id="cx">Close</button></div>`);
  $('cx').onclick = () => { clearInterval(dueTimer); closeSheet(); };
  const tick = () => { const els = document.querySelectorAll('#sheet .cd[data-ts]'); if (!els.length && !$('dub')) return clearInterval(dueTimer); els.forEach(el => { const ms = +el.dataset.ts - (Date.now() + off); el.textContent = cdTxt(ms); el.style.color = cdCol(ms); });
    document.querySelectorAll('#sheet .cdb').forEach(el => { const d = +el.dataset.ts - (Date.now() + off), a = Math.abs(d), v = [Math.floor(a / 864e5), Math.floor(a % 864e5 / 36e5), Math.floor(a % 36e5 / 6e4), Math.floor(a % 6e4 / 1e3)]; el.querySelectorAll('b').forEach((b, i) => { b.textContent = p2(v[i]); }); el.classList.toggle('late', d < 0); }); };
  clearInterval(dueTimer); dueTimer = setInterval(tick, 1000); tick();
  c.onchange = async e => {
    const row = e.target.closest('[data-kind]');
    if (e.target.classList.contains('dti') && row) {                         // new date / time: the timer jumps at once, the save follows
      if (!e.target.value) return; const cd = row.querySelector('.cd, .cdb'); cd.dataset.ts = new Date(e.target.value).getTime(); tick(); toast('Time saved ⏰');
      j('/api/buddy/deadline', {kind: row.dataset.kind, id: row.dataset.id, iso: e.target.value}).then(async () => { S = await j('/api/buddy/state'); drawPanel(); });
    } else if (e.target.classList.contains('tls') && row && e.target.value) {   // link a deadline task to an exam / topic / project
      const v = e.target.value; toast(v === '-' ? 'Unlinked' : 'Linked 🔗');
      const req = v.startsWith('p:') ? j('/api/buddy/taskproj', {id: +row.dataset.id, project: v.slice(2)}) : j('/api/buddy/tasklink', {id: +row.dataset.id, chap: v === '-' ? '' : v});
      if (v === '-') j('/api/buddy/taskproj', {id: +row.dataset.id, project: ''});
      req.then(async () => { S = await j('/api/buddy/state'); drawPanel(); });
    }
  };
  c.addEventListener('click', e => {                                         // green +: type a keyword, Enter saves it; × removes one
    const a = e.target.closest('[data-ra]'); if (a) { const i = document.createElement('input'); i.className = 'rfi'; i.placeholder = 'keyword, Enter'; a.replaceWith(i); i.focus(); return; }
    const d = e.target.closest('[data-rd]'); if (d) { const box = d.closest('.refs'), ex = box.dataset.ex, ch = box.dataset.ch, t = refsIn(ex, ch); t.refs = (t.refs || []).filter(w => w !== d.dataset.rd); redraw(box, ex, ch); j('/api/buddy/ref', {ex, ch, op: 'del', word: d.dataset.rd}); }
  });
  c.addEventListener('keydown', e => {
    if (!e.target.classList.contains('rfi')) return; const box = e.target.closest('.refs'), ex = box.dataset.ex, ch = box.dataset.ch;
    if (e.key === 'Escape') return redraw(box, ex, ch); if (e.key !== 'Enter') return;
    const L = e.target.value.split(',').map(x => x.trim().toLowerCase().slice(0, 30)).filter(Boolean); if (!L.length) return redraw(box, ex, ch);
    const t = refsIn(ex, ch); t.refs = [...new Set([...(t.refs || []), ...L])].slice(0, 20); redraw(box, ex, ch); toast('Keyword added ✅'); j('/api/buddy/ref', {ex, ch, op: 'add', words: L});
  });
  if ($('pjo')) $('pjo').onclick = async () => { if (!$('pjd').value) return toast('Pick a date and time first'); await j('/api/buddy/deadline', {kind: 'project', id: $('pjs').value, iso: $('pjd').value}); toast('Project deadline set 📁'); openDeadlines(); };
}
$('bDue').onclick = openDeadlines;
$('bRefresh').onclick = async () => {
  const b = $('bRefresh'); b.disabled = true; b.style.opacity = .5;
  try { S = {...(await j('/api/buddy/refresh', {})), gap: S.gap}; LKO = null; drawPanel(); loadRanks(); tmrPoll(); toast('Refreshed 🔄'); } catch (e) { toast('Could not refresh'); }
  b.disabled = false; b.style.opacity = '';
};

// ---------- v16: one labelled Menu dropdown (the red dot shows when Review needs you)
(function () {
  const dot = $('tdot'), rv = $('bdgRev'), sync = () => { dot.hidden = rv.hidden || $('moreMenu').classList.contains('open'); };
  new MutationObserver(sync).observe(rv, {attributes: true, attributeFilter: ['hidden']}); $('bMore').addEventListener('click', () => setTimeout(sync, 0)); sync();
})();

// ---------- v15: "what did I miss?" after the app was closed ----------
const isoL = ms => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const fmtD = ms => { const d = new Date(ms), td = new Date(); return (d.toDateString() === td.toDateString() ? '' : d.toLocaleDateString([], {weekday: 'short'}) + ' ') + clock(ms); };
let gapShown = false, gapDone = false;
async function askGap() {
  if (gapShown || gapDone || !S || $('sheet').classList.contains('on')) return;
  let g; try { g = (await j('/api/buddy/gap')).gap; } catch (e) { return; }
  if (!g) { gapDone = true; return; }
  gapShown = true; gapSheet(g);
}
function gapSheet(g) {
  const mins = Math.round((g.to - g.from) / 60000), night = mins >= 240 && (new Date(g.from).getHours() >= 21 || new Date(g.from).getHours() <= 3);
  const K = [['sleep', '😴 Sleep'], ['study', '📚 Studied'], ['college', '🏫 College / School'], ['custom', '✍️ Something else']]; let kind = night ? 'sleep' : '';
  const c = sheet(`<h3>Welcome back! 🌅</h3><p>I didn't see you from <b>${fmtD(g.from)}</b> to <b>${fmtD(g.to)}</b> (${fmtM(mins)}). What did I miss?</p>
    <div class="gapq"><div class="gapk" id="gk">${K.map(k => `<button class="chip ${k[0] === kind ? 'on' : ''}" data-k="${k[0]}">${k[1]}</button>`).join('')}</div>
    <input id="gl" maxlength="80" placeholder="What did you do? (e.g. tuition, travelling, cricket)" style="display:none">
    <div class="row"><label>From<input type="datetime-local" id="gf" value="${isoL(g.from)}"></label><label>To<input type="datetime-local" id="gt" value="${isoL(g.to)}"></label></div>
    <p class="sm" style="margin:0">Only part of it? Change the times, save, and I'll ask about the rest. It goes into your calendar.</p></div>
    <div class="acts"><button class="btn alt" id="gs">Skip</button><button class="btn" id="gv">Save to calendar ✓</button></div>`);
  const sync = () => { c.querySelectorAll('#gk .chip').forEach(b => b.classList.toggle('on', b.dataset.k === kind)); $('gl').style.display = kind === 'custom' ? '' : 'none'; };
  c.querySelectorAll('#gk .chip').forEach(b => b.onclick = () => { kind = b.dataset.k; sync(); if (kind === 'custom') $('gl').focus(); }); sync();
  $('gs').onclick = async () => { await j('/api/buddy/gap', {action: 'skip'}).catch(() => {}); gapDone = true; gapShown = false; closeSheet(); };
  $('gv').onclick = async () => {
    if (!kind) return toast('Pick what happened first'); const a = new Date($('gf').value).getTime(), z = new Date($('gt').value).getTime();
    const r = await j('/api/buddy/gap', {action: 'answer', kind, label: $('gl').value, from: a, to: z}).catch(() => ({error: 'Could not save'}));
    if (r.error) return toast(r.error);
    toast('Added to your calendar 🗓️'); closeSheet();
    if (r.gap) gapSheet(r.gap); else { gapDone = true; gapShown = false; robot.set('happy', 5000); addMsg('buddy', 'Got it, thanks for telling me! 🗓️ I put it in your calendar. Ready when you are 💪', false, 'system'); }
  };
}
setInterval(askGap, 5000); setTimeout(askGap, 2500);
const _cb = comeBack; comeBack = async function (f) { if (!gapDone) { await askGap(); if (gapShown) return false; } return _cb(f); };

// ---------- v15: small calendar ----------
const CK2 = {s: '#eab308', m: '#3b82f6', b: '#94a3b8', x: '#f97316', f: '#8b5cf6'}; let calDay = 0;
async function openCal(day) {
  const d = await j('/api/buddy/cal?day=' + (day || Date.now())); calDay = d.day; const H = 30, pos = ms => Math.max(0, Math.min(24, (ms - d.day) / 3600000)) * H;
  const box = (x, cls, col, txt) => `<div class="ev ${cls}" style="top:${pos(x.start)}px;height:${Math.max(10, pos(x.end) - pos(x.start))}px;background:${col}" title="${esc(txt)} · ${clock(x.start)}–${clock(x.end)}">${esc(txt)}</div>`;
  const hrs = [...Array(24)].map((_, h) => `<div class="hr" style="top:${h * H}px">${h % 12 || 12}${h < 12 ? 'a' : 'p'}</div>`).join('');
  const dls = d.dl.map(x => `<div class="dlm" style="top:${pos(x.ts)}px">${x.kind === 'exam' ? '🎓' : '⏰'} ${esc(x.name)}</div>`).join('');
  const lbl = new Date(d.day).toLocaleDateString([], {weekday: 'short', day: 'numeric', month: 'short'}), now = Date.now();
  const c = sheet(`<div class="rvh"><h3>🗓️ Calendar</h3><button class="x" id="cx" title="Close" aria-label="Close">✕</button></div><div class="cal2">
    <div class="cn"><button class="ib" id="cp" aria-label="Previous day">‹</button><b>${lbl}</b><button class="ib" id="cn2" aria-label="Next day">›</button><button class="chip" id="ct">Today</button></div>
    <div class="lg">Left: your blocks · Right: tracked apps & sites (3 min+)</div>
    <div class="tl" id="tl"><div class="tg">${hrs}${d.ents.map(x => box(x, 'l1', CK2[x.kind] || CK2.f, x.name)).join('')}${d.runs.map(x => box(x, 'l2', '#14b8a6', x.name)).join('')}${dls}</div></div>
    <div style="margin-top:8px">${d.ents.length ? d.ents.map(x => `<div class="el"><span>${esc(x.name)} · ${clock(x.start)}–${clock(x.end)}</span><button class="bell" data-del="${x.id}" title="Delete">✕</button></div>`).join('') : '<p class="sm">No blocks yet.</p>'}</div>
    <details style="margin-top:6px"><summary class="sm" style="cursor:pointer">＋ Add a block</summary><div class="gapq"><input id="al" maxlength="80" placeholder="What? (e.g. Tuition)"><div class="gapk" id="ak">${[['s', '📚 Study'], ['m', '🏫 College'], ['b', '😴 Rest / sleep'], ['f', '✍️ Other']].map((k, i) => `<button class="chip ${i ? '' : 'on'}" data-k="${k[0]}">${k[1]}</button>`).join('')}</div>
    <div class="row"><label>From<input type="datetime-local" id="af" value="${isoL(Math.min(now, d.day + 86399000) - 3600000)}"></label><label>To<input type="datetime-local" id="at" value="${isoL(Math.min(now, d.day + 86399000))}"></label></div><button class="btn" id="aa">Add to calendar</button></div></details></div>`);
  c.classList.add('wide'); $('cx').onclick = closeSheet; $('tl').scrollTop = Math.max(0, pos(Math.min(now, d.day + 86399000)) - 120);
  $('cp').onclick = () => openCal(d.day - 43200000); $('cn2').onclick = () => openCal(d.day + 129600000); $('ct').onclick = () => openCal(Date.now());
  let ak = 's'; c.querySelectorAll('#ak .chip').forEach(b => b.onclick = () => { ak = b.dataset.k; c.querySelectorAll('#ak .chip').forEach(x => x.classList.toggle('on', x === b)); });
  c.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { await j('/api/buddy/calentry', {op: 'del', id: b.dataset.del}); openCal(d.day + 43200000); });
  $('aa').onclick = async () => { const r = await j('/api/buddy/calentry', {op: 'add', kind: ak, label: $('al').value, from: new Date($('af').value).getTime(), to: new Date($('at').value).getTime()}).catch(() => ({error: 'Could not save'})); if (r.error) return toast(r.error); toast('Added 🗓️'); openCal(d.day + 43200000); };
}
$('bCal').onclick = () => openCal();

// ---------- keyboard: Enter = next field / save in a sheet, Ctrl+Enter = save, Esc = close ----------
document.addEventListener('keydown', e => {
  const sh = $('sheet'); if (!sh || !sh.classList.contains('on')) return;
  if (e.key === 'Escape') { if (!e.defaultPrevented) closeSheet(); return; }
  if (e.key !== 'Enter' || e.defaultPrevented || e.shiftKey || e.altKey || e.isComposing) return;
  const t = e.target; if (!t || !/^(INPUT|TEXTAREA)$/.test(t.tagName) || ['checkbox', 'radio', 'range', 'file', 'button'].includes(t.type) || t.onkeydown || t.classList.contains('rfi') || !sh.contains(t)) return;
  if (t.tagName === 'TEXTAREA' && !e.ctrlKey) return;
  const F = [...sh.querySelectorAll('input,select,textarea')].filter(x => !['checkbox', 'radio', 'range', 'hidden', 'file'].includes(x.type) && x.offsetParent), i = F.indexOf(t);
  e.preventDefault(); if (!e.ctrlKey && i >= 0 && i < F.length - 1) { F[i + 1].focus(); return; }
  const b = sh.querySelector('#ok, button.btn:not(.alt)'); if (b) b.click();
});

// ---------- strict mode: break tokens shown like a game (coins merge into gems) ----------
let TK = null, TKev = null, TKst = '';
const fmtTok = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function drawTok(d) {
  const box = $('tok'); if (!box || !d) return; TK = d;
  box.className = 'tok ' + (d.on ? d.status : 'off');
  if (!d.on) { box.innerHTML = '<div class="tr"><b>\u{1F512} Strict mode</b><span>Study to earn break tokens</span><button class="tgl" id="tokT">Turn on</button></div>'; $('tokT').onclick = () => strictToggle(true); return; }
  const coin = Math.max(1, d.give) * 60, n = Math.floor(d.bal / coin), gems = Math.floor(n / 4), coins = n % 4, part = (d.bal % coin) / coin;
  const stat = {earning: '\u26A1 Earning tokens', break: '\u{1F3AE} Break time \u2013 I am just watching', out: '\u26D4 Out of tokens!', idle: 'Ready'}[d.status] || '';
  box.innerHTML = `<div class="tr"><b>\u{1F512} Strict mode</b><span>${stat}</span><button class="tgl" id="tokT" title="Turn strict mode off">Off</button></div>
  <div class="cn" id="coins" title="4 coins merge into 1 gem">${'<i class="g">\u{1F48E}</i>'.repeat(gems)}${'<i>\u{1FA99}</i>'.repeat(coins)}${part > .02 ? '<i class="h">\u{1FA99}</i>' : ''}${!d.bal ? '<small>no tokens yet</small>' : `<small>${fmtTok(d.bal)} of break</small>`}</div>
  <div class="bar"><i style="width:${Math.min(100, d.prog / (d.earn * 60) * 100)}%"></i></div>
  <span class="sm">${d.status === 'out' ? 'Back to work! ' : ''}Next token in ${fmtTok(d.earn * 60 - d.prog)} of productive time \u2192 +${d.give} min break \u00B7 earned ${d.earned}</span>`;
  $('tokT').onclick = () => strictToggle(false);
  if (TKev !== null && d.ev > TKev) { $('coins').classList.add('pop'); if (robot) robot.set('excited', 4500); const t = `Token earned! ${d.give} more minutes of break!`; addMsg('buddy', '\u{1FA99} ' + t); speak(t, 'cheering'); }
  TKev = d.ev;
  if (d.status === 'out' && TKst !== 'out') { if (robot) robot.angry(5000); const t = 'You are out of break tokens! Back to study!'; addMsg('buddy', '\u26D4 ' + t); speak(t, 'angry'); }
  if (d.status === 'break' && TKst !== 'break' && TKst !== '') toast('Break time started. I will not interrupt while tokens last.');
  TKst = d.status;
}
async function strictToggle(on) { try { drawTok(await j('/api/strict', {on})); } catch (e) {} }
async function pollTok() { try { drawTok(await j('/api/strict')); } catch (e) {} }
pollTok(); setInterval(pollTok, 4000);
