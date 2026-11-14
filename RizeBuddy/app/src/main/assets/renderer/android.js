/* Rize Buddy for Android: small shims so the desktop pages run inside the Android WebView. Loaded first on every page. */
(function () {
  const A = window.RizeAndroid;
  if (!A) return;                                   // plain browser (desktop test): do nothing
  document.documentElement.classList.add('android');

  // 1) the dashboard is another page in the same window (no second OS window on a phone)
  const _fetch = window.fetch.bind(window);
  window.fetch = function (u, o) {
    try {
      const url = typeof u === 'string' ? u : (u && u.url) || '';
      if (url.indexOf('/api/dash/open') >= 0) {
        let page = ''; try { page = JSON.parse(o.body).page || ''; } catch (e) {}
        setTimeout(() => { location.href = '/' + (page ? '#' + page : ''); }, 0);
        return Promise.resolve(new Response('{"ok":true}', {headers: {'Content-Type': 'application/json'}}));
      }
      if (url.indexOf('/api/buddy/open') >= 0) {
        setTimeout(() => { location.href = '/companion.html'; }, 0);
        return Promise.resolve(new Response('{"ok":true}', {headers: {'Content-Type': 'application/json'}}));
      }
    } catch (e) {}
    return _fetch(u, o);
  };

  // 2) voice typing: WebView has no SpeechRecognition, so use Android's recogniser through the bridge
  class SR {
    constructor() { this.lang = 'en-IN'; this.interimResults = true; this.continuous = false; this.onresult = this.onerror = this.onend = null; }
    start() { window.__rizeSRActive = this; A.startListening(this.lang || 'en-IN'); }
    stop() { A.stopListening(); }
    abort() { A.stopListening(); }
  }
  window.SpeechRecognition = window.webkitSpeechRecognition = SR;
  window.__rizeSR = function (type, payload) {
    const r = window.__rizeSRActive; if (!r) return;
    if (type === 'partial' || type === 'result') { const res = [[{transcript: payload}]]; res[res.length - 1].isFinal = type === 'result'; r.onresult && r.onresult({results: res}); }
    else if (type === 'error') { r.onerror && r.onerror({error: payload}); }
    else if (type === 'end') { window.__rizeSRActive = null; r.onend && r.onend(); }
  };

  // 3) downloads (export / backup / csv): blob links do nothing in a WebView, so hand the bytes to Kotlin which saves them to Downloads
  const _click = HTMLAnchorElement.prototype.click;
  const BLOBS = new Map(), _create = URL.createObjectURL.bind(URL);          // the pages' CSP forbids fetch(blob:), so remember each Blob instead
  URL.createObjectURL = function (b) { const u = _create(b); BLOBS.set(u, b); return u; };
  function saveBlob(a) {
    const b = BLOBS.get(a.href); if (!b) return Promise.resolve();
    return new Promise(res => {
      const fr = new FileReader();
      fr.onload = () => { const d = String(fr.result); A.saveFile(a.download || 'rize-export', d.slice(d.indexOf(',') + 1), b.type || 'application/octet-stream'); res(); };
      fr.readAsDataURL(b);
    });
  }
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && /^blob:/.test(this.href)) { saveBlob(this); return; }
    return _click.apply(this, arguments);
  };
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[download]'); if (a && /^blob:/.test(a.href)) { e.preventDefault(); saveBlob(a); } }, true);

  // 4) a dashboard needs a way back to Buddy; the system Back button works too
  const onDash = () => location.pathname === '/' || /index\.html$/.test(location.pathname);
  // 5) setup banner when a permission Buddy needs is missing
  function banner(msg, btn, what) {
    let b = document.getElementById('rzAndBanner');
    if (!msg) { b && b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'rzAndBanner'; document.body.append(b); }
    b.innerHTML = '<span></span><button type="button"></button>'; b.firstChild.textContent = msg; b.lastChild.textContent = btn;
    b.lastChild.onclick = () => A.openSetting(what);
  }
  function poll() {
    let s; try { s = JSON.parse(A.status()); } catch (e) { return; }
    if (!s.usage) banner('Buddy cannot see which app you use yet.', 'Allow', 'usage');
    else if (!s.notifications) banner('Turn on notifications so Buddy can reach you.', 'Allow', 'notifications');
    else banner('');
  }
  addEventListener('DOMContentLoaded', () => {
    if (onDash()) {
      const f = document.createElement('button'); f.id = 'rzAndBuddy'; f.type = 'button'; f.textContent = '🤖 Buddy';
      f.onclick = () => { location.href = '/companion.html'; }; document.body.append(f);
    }
    poll(); setInterval(poll, 8000);
  });
})();
