const q = new URLSearchParams(location.search), S = Math.max(1, Math.min(60, +q.get('s') || 5)), w = q.get('w') || 'this', m = q.get('m') || '', g = q.get('g') || '';
document.getElementById('h').textContent = q.get('h') || 'Distraction: ' + w;
document.getElementById('p').textContent = q.get('b') || (m ? 'You have been on it for about ' + m + ' min. ' : '') + (g ? 'Your goal right now: ' + g + '.' : 'Time to get back to work.');
const n = document.getElementById('n'), b = document.getElementById('b'), t0 = Date.now(); b.style.transition = 'transform ' + S + 's linear'; requestAnimationFrame(() => requestAnimationFrame(() => { b.style.transform = 'scaleX(0)'; }));
const tick = () => { const left = Math.max(0, Math.ceil(S - (Date.now() - t0) / 1000)); n.textContent = left; if (left <= 0) { try { window.close(); } catch (e) {} } };
setInterval(tick, 200); tick();
['keydown', 'keyup', 'mousedown', 'contextmenu', 'wheel'].forEach(ev => addEventListener(ev, e => e.preventDefault(), true));
