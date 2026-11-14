// Buddy robot: orange helmet, black glass screen, solid glowing eyes (canvas, no dependencies).
const NAMES = {excited: 'excited', Excited: 'excited', love: 'love', Love: 'love', surprised: 'surprised', Surprised: 'surprised', dizzy: 'dizzy', Dizzy: 'dizzy', pouty: 'pouty', Pouty: 'pouty', thinking: 'thinking', Thinking: 'thinking', tired: 'tired', Tired: 'tired', cheerful: 'cheerful', Cheerful: 'cheerful', happy: 'happy', 'Happy Idle': 'happy', cheering: 'cheering', Cheering: 'cheering', sad: 'sad', Sad: 'sad', angry: 'angry', Angry: 'angry', confused: 'confused', Confused: 'confused', shocked: 'shocked', Shocked: 'shocked', winking: 'winking', Winking: 'winking', sleepy: 'sleepy', Sleepy: 'sleepy', disappointed: 'disappointed', Disappointed: 'disappointed', giggle: 'giggle', Giggle: 'giggle', depressed: 'depressed', Depressed: 'depressed'};
// body motion per emotion: hover amplitude/speed, vertical offset, head tilt (deg), bounce
const MOTION = {happy: {a: 1, s: 1, o: 0, tilt: 0}, cheering: {a: .4, s: 2.4, o: -4, tilt: 0, jump: 2.4, spin: 1}, sad: {a: .5, s: .6, o: 12, tilt: -5}, angry: {a: .6, s: 1.5, o: 0, tilt: 0, shake: 1},
  confused: {a: .8, s: .9, o: 0, tilt: 9}, shocked: {a: .3, s: 1, o: -14, tilt: 0, pop: 1}, winking: {a: 1.1, s: 1.1, o: 0, tilt: 5}, sleepy: {a: .4, s: .5, o: 10, tilt: -7}, disappointed: {a: .4, s: .55, o: 8, tilt: -4},
  giggle: {a: .8, s: 1.3, o: 0, tilt: 0, gig: 1},                        // quiet happy: little shoulder-shakes in bursts, cheeks pink, a soft "hehe"
  depressed: {a: .25, s: .35, o: 17, tilt: -9}, neutral: {a: .8, s: 1, o: 0, tilt: 0},
  excited: {a: 1.6, s: 2, o: -3, tilt: 0, jump: .8}, love: {a: 1, s: 1.2, o: 0, tilt: 3}, surprised: {a: .3, s: 1, o: -8, tilt: 0}, dizzy: {a: .6, s: 1, o: 2, tilt: 0, wob: 1},
  pouty: {a: .5, s: .8, o: 2, tilt: -3}, thinking: {a: .7, s: .7, o: 0, tilt: 7}, tired: {a: .35, s: .45, o: 9, tilt: -6}, cheerful: {a: 1.3, s: 1.6, o: -2, tilt: 0, jump: .5}};                         // slumped, slow, dim glow, tears and a small rain cloud

const BLUE = '#58C9FF', BLUE2 = '#B6EBFF', GLOW = 'rgba(88,201,255,';

class Robot {
  constructor(cv, scale = 1) {
    this.cv = cv; this.g = cv.getContext('2d'); this.scale = scale; this.t = 0; this.last = performance.now();
    this.name = 'happy'; this.shown = 'happy'; this.lock = null; this.lockUntil = 0; this.look = {x: 0, y: 0}; this.lt = {x: 0, y: 0}; this.prev = 'happy'; this.base = 'happy'; this.lg = 0; this.mix = 1; this.talk = false; this.hold = null; this.bp = 0; this.nextBlink = 2.5; this.bt = 0;
    this.resize(); try { new ResizeObserver(() => this.resize()).observe(cv); } catch (e) {}
    requestAnimationFrame(() => this.tick());
  }
  resize() {                                                          // keep the bitmap in step with the real size, otherwise the robot is stretched when the window is resized
    const dpr = window.devicePixelRatio || 1, w = this.cv.clientWidth, h = this.cv.clientHeight; if (!w || !h) return;
    this.w = w; this.h = h; this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  set(name, ms) {                                                     // temporary reaction: after ms the robot goes back to its base mood
    name = NAMES[name] || name; if (!MOTION[name]) return;
    clearTimeout(this.hold); this.hold = null; if (ms) this.hold = setTimeout(() => { this.hold = null; this.set(this.base); }, ms);
    if (name === this.name) return;
    this.name = name;
  }
  angry(ms) { this.lock = 'angry'; this.lockUntil = performance.now() + ms; }          // ear poke: angry (and shaking) whatever else is going on
  setBase(name) {                                                     // long-lasting mood (driven by today's numbers); does not cut a reaction short
    name = NAMES[name] || name; if (!MOTION[name] || name === this.base) return;
    this.base = name; if (!this.hold) this.set(name);
  }
  tick() {
    const n = performance.now(), dt = Math.min(.05, (n - this.last) / 1000); this.last = n; this.t += dt;
    if (this.mix < 1) this.mix = Math.min(1, this.mix + dt / .28);
    this.bt += dt; if (this.bt > this.nextBlink) { this.bt = 0; this.nextBlink = 2.6 + Math.random() * 2; this.bp = .001; }
    if (this.bp > 0) { this.bp += dt * 8; if (this.bp > 1) this.bp = 0; }
    const locked = this.lock && n < this.lockUntil; if (!locked) this.lock = null;
    const eff = locked ? this.lock : this.name;                               // every face keeps its look while talking (the mouth moves)
    if (eff !== this.shown) { this.prev = this.shown; this.shown = eff; this.mix = 0; }
    const f = Math.min(1, dt * 9); this.look.x += (this.lt.x - this.look.x) * f; this.look.y += (this.lt.y - this.look.y) * f;
    this.draw(); requestAnimationFrame(() => this.tick());
  }
  blink() { return this.bp > 0 ? 1 - Math.sin(this.bp * Math.PI) * .92 : 1; }
  draw() {
    const g = this.g, t = this.t, k = this.scale, m = MOTION[this.shown] || MOTION.happy; g.clearRect(0, 0, this.w, this.h);
    const cx = this.w / 2, cy = this.h * .47;
    let hov = Math.sin(t * 2.1 * m.s) * 7 * m.a + m.o; if (m.jump) hov -= Math.abs(Math.sin(t * 4.2)) * 16 * m.jump; if (m.pop) hov -= Math.max(0, 1 - this.mix) * 0;
    this.lg = m.gig ? Math.max(0, Math.sin(t * 1.7) - .35) / .65 : 0;       // laugh burst 0..1
    let sxs = 1, sway = 0, rot = 0;                                      // very happy: hops side to side, wobbles and does a full turn every few seconds
    if (m.spin) { const ph = (t % 3.2) / 3.2; if (ph < .5) { const c = Math.cos(ph / .5 * Math.PI * 2); sxs = (c < 0 ? -1 : 1) * Math.max(.06, Math.abs(c)); } sway = Math.sin(t * 2.1) * 28; rot = Math.sin(t * 4.2) * 10; }
    if (m.wob) rot = Math.sin(t * 5) * 9;
    const sx = m.shake ? Math.sin(t * 45) * 1.6 : m.gig ? Math.sin(t * 30) * 2 * this.lg : 0;
    // ground shadow
    const ss = Math.max(.6, 1 - (-hov + 10) * .012);
    g.fillStyle = 'rgba(150,80,40,.18)'; g.beginPath(); g.ellipse(cx + sway * k, cy + 118 * k, 78 * ss * k, 11 * ss * k, 0, 0, 7); g.fill();
    g.save(); g.translate(cx + (sx + sway) * k, cy + hov * k); g.rotate((m.tilt + rot + Math.sin(t * 1.3) * 1.2 + (m.gig ? Math.sin(t * 15) * 2.5 * this.lg : 0)) * Math.PI / 180); g.scale(k * sxs, k);
    this.shell();
    g.save(); this.screen(); g.restore();
    g.globalAlpha = 1; this.faceMix();
    g.restore();
  }
  faceMix() {                                                       // cross-fade previous -> current expression
    const g = this.g, a = this.mix;
    g.save(); g.translate(this.look.x * 9, this.look.y * 6);                    // the eyes follow the cursor
    if (a < 1) { g.globalAlpha = 1 - a; this.face(this.prev, false); }
    g.globalAlpha = a < 1 ? a : 1; this.face(this.shown, true); g.globalAlpha = 1; g.restore();
  }
  rr(x, y, w, h, r) { this.g.beginPath(); this.g.roundRect(x, y, w, h, r); }
  shell() {
    const g = this.g;
    for (const s of [-1, 1]) {                                      // ear pods
      g.save(); g.translate(s * 104, 4);
      let gr = g.createLinearGradient(0, -34, 0, 34); gr.addColorStop(0, '#FF8B3E'); gr.addColorStop(1, '#B8441A'); this.rr(-14 + (s > 0 ? 0 : -6), -36, 26, 72, 13); g.fillStyle = gr; g.fill(); g.lineWidth = 4.5; g.strokeStyle = '#3B1A0C'; g.stroke();
      const rg = g.createLinearGradient(0, -26, 0, 26); rg.addColorStop(0, '#6D737C'); rg.addColorStop(1, '#2B2F35'); g.beginPath(); g.ellipse(s * 10, 0, 17, 27, 0, 0, 7); g.fillStyle = rg; g.fill(); g.lineWidth = 4; g.stroke();
      const lg = g.createRadialGradient(s * 8, -6, 2, s * 10, 0, 18); lg.addColorStop(0, '#CFF3FF'); lg.addColorStop(.45, '#4FC3F7'); lg.addColorStop(1, '#1976D2'); g.beginPath(); g.ellipse(s * 10, 0, 10, 19, 0, 0, 7); g.fillStyle = lg; g.fill();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(s * 7, -9, 3, 6, .2, 0, 7); g.fill(); g.restore();
    }
    const hg = g.createLinearGradient(0, -90, 0, 92); hg.addColorStop(0, '#FF9347'); hg.addColorStop(.55, '#E4601F'); hg.addColorStop(1, '#B03F17');
    this.rr(-108, -88, 216, 176, 72); g.fillStyle = hg; g.fill(); g.lineWidth = 5; g.strokeStyle = '#3B1A0C'; g.lineJoin = 'round'; g.stroke();
    g.save(); this.rr(-108, -88, 216, 176, 72); g.clip();            // rim light + bottom shade
    g.fillStyle = 'rgba(120,35,8,.35)'; g.beginPath(); g.ellipse(0, 100, 150, 38, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,214,170,.55)'; g.beginPath(); g.ellipse(-62, -66, 52, 14, -.45, 0, 7); g.fill();
    g.restore();
  }
  screen() {
    const g = this.g, sg = g.createLinearGradient(0, -64, 0, 66); sg.addColorStop(0, '#202329'); sg.addColorStop(.5, '#0C0D10'); sg.addColorStop(1, '#16181C');
    this.rr(-93, -68, 186, 136, 50); g.fillStyle = sg; g.fill(); g.lineWidth = 4; g.strokeStyle = '#25120A'; g.stroke();
    g.save(); this.rr(-93, -68, 186, 136, 50); g.clip(); g.fillStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.moveTo(-90, -66); g.lineTo(10, -66); g.lineTo(-60, 70); g.lineTo(-90, 70); g.fill(); g.restore();
  }
  glow(draw) { const g = this.g, dim = this.name === 'depressed'; g.save(); g.shadowColor = dim ? 'rgba(88,201,255,.45)' : 'rgba(88,201,255,.95)'; g.shadowBlur = dim ? 6 : 16; if (dim) g.globalAlpha *= .72; draw(); g.restore(); }
  solid(path, light = true) {                                     // filled glowing shape with a lighter core
    const g = this.g; this.glow(() => { g.fillStyle = BLUE; g.fill(path); });
    if (light) { g.save(); g.fillStyle = 'rgba(190,240,255,.55)'; g.translate(-1.5, -2); g.scale(.82, .8); g.fill(path); g.restore(); }
  }
  oval(x, y, rx, ry) { const p = new Path2D(); p.ellipse(x, y, Math.max(.5, rx), Math.max(.5, ry), 0, 0, 7); return p; }
  thick(path, w = 9) { const g = this.g; g.lineCap = g.lineJoin = 'round'; this.glow(() => { g.strokeStyle = BLUE; g.lineWidth = w; g.stroke(path); }); g.strokeStyle = 'rgba(200,244,255,.7)'; g.lineWidth = w * .35; g.stroke(path); }
  face(e, main) {
    const g = this.g, t = this.t, bl = main ? this.blink() : 1, ex = 40, ey = -12;
    const talk = main && this.talk ? Math.abs(Math.sin(t * 11) * Math.sin(t * 5.3 + 1)) * 1.25 : 0;
    const heart = (x, y, s) => { const p = new Path2D(); p.moveTo(x, y + s * .9); p.bezierCurveTo(x - s * 1.5, y - s * .1, x - s * .7, y - s * 1.2, x, y - s * .45); p.bezierCurveTo(x + s * .7, y - s * 1.2, x + s * 1.5, y - s * .1, x, y + s * .9); p.closePath(); return p; };
    const spiral = (cx, cy, r0, rot) => { const p = new Path2D(); for (let i = 0; i <= 40; i++) { const a = rot + i * .4, rr = r0 * i / 40, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? p.lineTo(x, y) : p.moveTo(x, y); } return p; };
    const sparks = () => { g.save(); g.lineCap = 'round'; g.strokeStyle = '#3B1A0C'; g.lineWidth = 4; g.globalAlpha *= .6 + .4 * Math.sin(t * 9); for (let i = 0; i < 3; i++) { const a = -1.25 + i * .42; g.beginPath(); g.moveTo(114 + Math.cos(a) * 14, -76 + Math.sin(a) * 14); g.lineTo(114 + Math.cos(a) * 30, -76 + Math.sin(a) * 30); g.stroke(); } g.restore(); };
    const smile = (w, d, th = 5) => { const p = new Path2D(); p.moveTo(-w, 26); p.quadraticCurveTo(0, 26 + d, w, 26); this.thick(p, th); };
    const openMouth = (w, h) => { const p = new Path2D(); p.moveTo(-w, 22); p.quadraticCurveTo(0, 22, w, 22); p.quadraticCurveTo(w * .8, 22 + h, 0, 22 + h); p.quadraticCurveTo(-w * .8, 22 + h, -w, 22); this.solid(p, false); g.save(); g.fillStyle = '#2A8FCC'; g.beginPath(); g.ellipse(0, 22 + h * .85, w * .5, h * .28, 0, 0, 7); g.fill(); g.restore(); };
    const MOUTHLESS = ['neutral', 'sad', 'angry', 'pouty', 'dizzy', 'thinking', 'tired', 'confused', 'disappointed', 'depressed'];
    const tk = talk > .18 && MOUTHLESS.includes(e);                    // these faces have a still mouth: hide it while talking and draw a talking mouth instead
    if (tk) { g.save(); const cp = new Path2D(); cp.rect(-400, -400, 800, 800); cp.rect(-30, 20, 60, 38); g.clip(cp, 'evenodd'); }
    if (e === 'neutral') {                                            // calm: flat bar eyes (right one a bit higher), tiny frown, small sweat drop
      const b1 = new Path2D(); b1.moveTo(-ex - 20, ey + 3); b1.lineTo(-ex + 16, ey + 3); this.thick(b1, 7);
      const b2 = new Path2D(); b2.moveTo(ex - 16, ey - 2); b2.lineTo(ex + 20, ey - 5); this.thick(b2, 7);
      const dd = new Path2D(); dd.moveTo(ex + 24, ey + 8); dd.lineTo(ex + 29, ey + 16); dd.lineTo(ex + 24, ey + 24); dd.lineTo(ex + 19, ey + 16); dd.closePath(); this.solid(dd, false);
      const p = new Path2D(); p.moveTo(-9, 38); p.quadraticCurveTo(0, 29, 9, 38); this.thick(p, 4);
    } else if (e === 'happy') {                                       // productive: squeezed-happy ^ ^ eyes, open smile
      for (const s of [-1, 1]) { const p = new Path2D(); p.moveTo(s * ex - 18, ey + 8); p.quadraticCurveTo(s * ex, ey - 26, s * ex + 18, ey + 8); this.thick(p, 9); }
      openMouth(18, 16 + talk * 6);
    } else if (e === 'cheering') {                                    // very happy: same face, big mouth, the whole bot jumps (no stars)
      for (const s of [-1, 1]) { const p = new Path2D(); p.moveTo(s * ex - 19, ey + 8); p.quadraticCurveTo(s * ex, ey - 30, s * ex + 19, ey + 8); this.thick(p, 10); }
      openMouth(30, 22 + talk * 8);
    } else if (e === 'sad') {
      for (const s of [-1, 1]) { this.rr(s * ex - 20, ey + 2, 40, 7, 3.5); this.glow(() => { g.fillStyle = BLUE; g.fill(); }); }
      const p = new Path2D(); p.moveTo(-18, 40); p.quadraticCurveTo(0, 22, 18, 40); this.thick(p, 5);
      const o = (t * .6) % 1; g.fillStyle = `rgba(150,225,255,${.85 * (1 - o)})`; g.beginPath(); g.moveTo(ex - 8, ey + 14 + o * 34); g.quadraticCurveTo(ex - 2, ey + 22 + o * 34, ex - 8, ey + 30 + o * 34); g.quadraticCurveTo(ex - 14, ey + 22 + o * 34, ex - 8, ey + 14 + o * 34); g.fill();
    } else if (e === 'angry') {                                       // slanted bar eyes, frown, sweat drop and red steam puffs
      for (const s of [-1, 1]) { const p = new Path2D(); p.moveTo(s * ex + s * 24, ey - 8); p.lineTo(s * ex - s * 18, ey + 8); this.thick(p, 9); }
      const p = new Path2D(); p.moveTo(-18, 42); p.quadraticCurveTo(0, 24, 18, 42); this.thick(p, 5);
      const dd = new Path2D(); dd.moveTo(ex + 22, ey + 16); dd.lineTo(ex + 27, ey + 24); dd.lineTo(ex + 22, ey + 32); dd.lineTo(ex + 17, ey + 24); dd.closePath(); this.solid(dd, false);
      const puff = (x, y, sc, fl) => { g.save(); g.translate(x, y); g.scale(sc * fl, sc); g.beginPath(); g.moveTo(-24, 12); g.arc(-20, -2, 14, 2.3, 4.7); g.arc(-3, -16, 16, 3.8, 6.0); g.arc(17, -6, 14, 4.6, 7.3); g.arc(14, 9, 11, -1, 1.7); g.closePath(); g.fillStyle = 'rgba(255,255,255,.6)'; g.fill(); g.lineWidth = 4; g.lineJoin = 'round'; g.strokeStyle = '#E8412C'; g.stroke(); g.restore(); };
      const pu = 1 + .12 * Math.sin(t * 7); puff(-128, -92 - Math.sin(t * 7) * 3, pu, 1); puff(128, -92 - Math.sin(t * 7 + 1) * 3, pu, -1);
    } else if (e === 'excited' || e === 'pouty') {                    // > < eyes: open smile + sparks (excited) or a small frown + puffed cheeks (pouty)
      for (const s of [-1, 1]) { const p = new Path2D(); p.moveTo(s * ex - s * 16, ey - 14); p.lineTo(s * ex + s * 12, ey + 2); p.lineTo(s * ex - s * 16, ey + 18); this.thick(p, 8); }
      if (e === 'excited') { openMouth(15, 14 + talk * 8); sparks(); }
      else { const p = new Path2D(); p.moveTo(-12, 40); p.quadraticCurveTo(0, 28, 12, 40); this.thick(p, 5); g.save(); g.fillStyle = 'rgba(255,150,175,.3)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 68, 16, 12, 7, 0, 0, 7); g.fill(); } g.restore(); }
    } else if (e === 'love') {
      const pu = 1 + .12 * Math.sin(t * 6); for (const s of [-1, 1]) this.solid(heart(s * ex, ey + 2, 20 * pu), false);
      openMouth(14, 12 + talk * 8);
    } else if (e === 'surprised') {
      for (const s of [-1, 1]) { const p = this.oval(s * ex, ey - 4, 14, 14 * bl); this.glow(() => { g.strokeStyle = BLUE; g.lineWidth = 6; g.stroke(p); }); }
      const p = this.oval(0, 38, 7, 9 + talk * 4); this.glow(() => { g.strokeStyle = BLUE; g.lineWidth = 5; g.stroke(p); }); sparks();
    } else if (e === 'dizzy') {
      for (const s of [-1, 1]) this.thick(spiral(s * ex, ey + 2, 20, t * 4 * -s), 4);
      const p = new Path2D(); p.moveTo(-22, 38); for (let i = 0; i < 4; i++) p.quadraticCurveTo(-22 + i * 11 + 5.5, i % 2 ? 44 : 32, -22 + (i + 1) * 11, 38); this.thick(p, 4);
      g.save(); g.translate(112, -78); g.strokeStyle = '#2A1B4A'; g.lineWidth = 4; g.lineCap = 'round'; g.stroke(spiral(0, 0, 14, -t * 5)); g.restore();
    } else if (e === 'thinking') {
      this.solid(this.oval(-ex, ey + 4, 13, 10 * bl)); const b1 = new Path2D(); b1.moveTo(-ex - 14, ey - 10); b1.lineTo(-ex + 12, ey - 14); this.thick(b1, 5);
      this.solid(this.oval(ex, ey + 2, 14, 19 * bl)); const b2 = new Path2D(); b2.moveTo(ex - 14, ey - 18); b2.lineTo(ex + 16, ey - 28 - Math.sin(t * 2) * 1.5); this.thick(b2, 5);
      const p = new Path2D(); p.moveTo(-14, 38); p.quadraticCurveTo(-2, 30, 12, 40); this.thick(p, 5);
      g.save(); g.translate(112, -64 + Math.sin(t * 3) * 4); g.font = 'bold 36px Arial'; g.textAlign = 'center'; g.fillStyle = '#2A1B4A'; g.fillText('?', 0, 0); g.restore();
    } else if (e === 'tired') {
      for (const s of [-1, 1]) { this.rr(s * ex - 20, ey + 4, 40, 7, 3.5); this.glow(() => { g.fillStyle = BLUE; g.fill(); }); }
      const p = new Path2D(); p.moveTo(-14, 40); p.quadraticCurveTo(0, 30 - Math.sin(t * 1.5) * 2, 14, 40); this.thick(p, 5);
      g.save(); g.translate(112, -74); g.strokeStyle = '#2A1B4A'; g.lineWidth = 4; g.lineCap = 'round'; for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(Math.sin(t * 2 + i) * 3, i * 9, 14 - i * 3, 5, 0, 0, 7); g.stroke(); } g.restore();
    } else if (e === 'cheerful') {
      for (const s of [-1, 1]) { const p = new Path2D(); p.moveTo(s * ex - 18, ey + 8); p.quadraticCurveTo(s * ex, ey - 24 - Math.sin(t * 3) * 2, s * ex + 18, ey + 8); this.thick(p, 8); }
      openMouth(17, 15 + talk * 6); sparks();
    } else if (e === 'confused') {
      this.solid(this.oval(-ex, ey + 2, 9, 12 * bl)); this.solid(this.oval(ex, ey - 2, 15, 25 * bl));
      const p = new Path2D(); p.moveTo(-18, 30); p.bezierCurveTo(-8, 20, 6, 40, 18, 28); this.thick(p, 5);
      g.save(); g.translate(104, -70 + Math.sin(t * 3) * 4); g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.fillStyle = '#FFD25A'; g.strokeStyle = '#3B1A0C'; g.lineWidth = 5; g.strokeText('?', 0, 0); g.fillText('?', 0, 0); g.restore();
    } else if (e === 'shocked') {
      for (const s of [-1, 1]) { this.solid(this.oval(s * ex, ey, 17, 27 * bl)); g.fillStyle = '#0C0D10'; g.beginPath(); g.ellipse(s * ex, ey, 5, 7, 0, 0, 7); g.fill(); }
      const p = this.oval(0, 36, 11, 14 + talk * 4); this.glow(() => { g.strokeStyle = BLUE; g.lineWidth = 6; g.stroke(p); });
    } else if (e === 'winking') {
      this.solid(this.oval(-ex, ey, 13, 21 * bl));
      const p = new Path2D(); p.moveTo(ex - 18, ey + 8); p.quadraticCurveTo(ex, ey - 24, ex + 18, ey + 8); this.thick(p, 10);
      if (talk > .2) openMouth(15, 8 + talk * 12); else smile(19, 16);
    } else if (e === 'disappointed') {
      for (const s of [-1, 1]) {                                        // heavy half-closed lids, eyes glancing down
        const p = new Path2D(); p.ellipse(s * ex, ey + 6, 15, 17 * bl, 0, 0, 7); this.solid(p);
        g.save(); g.fillStyle = '#0C0D10'; g.fillRect(s * ex - 20, ey - 14, 40, 17 + Math.sin(t * .8) * 1.5); g.restore();
        const b = new Path2D(); b.moveTo(s * ex - s * 16, ey - 17 - s * 3); b.lineTo(s * ex + s * 16, ey - 17 + s * 3); this.thick(b, 5);
      }
      const p = new Path2D(); p.moveTo(-17, 40); p.quadraticCurveTo(0, 30 - Math.sin(t * 1.2) * 1.5, 17, 40); this.thick(p, 5);
      const o = (t * .5) % 1; g.fillStyle = `rgba(150,225,255,${.8 * (1 - o)})`; g.beginPath(); g.moveTo(ex + 28, ey - 22 + o * 30); g.quadraticCurveTo(ex + 34, ey - 12 + o * 30, ex + 28, ey - 4 + o * 30); g.quadraticCurveTo(ex + 22, ey - 12 + o * 30, ex + 28, ey - 22 + o * 30); g.fill();
    } else if (e === 'giggle') {
      const lg = this.lg;
      for (const s of [-1, 1]) { const p = new Path2D(); p.moveTo(s * ex - 15, ey + 8); p.quadraticCurveTo(s * ex, ey - 15 - lg * 3, s * ex + 15, ey + 8); this.thick(p, 8); }   // squeezed-shut ^ ^ eyes
      g.save(); g.fillStyle = 'rgba(255,150,175,.34)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 66, 16, 13, 7, 0, 0, 7); g.fill(); } g.restore();   // blush
      if (lg > .25) openMouth(13, 5 + lg * 9); else smile(15, 12);
      if (lg > .3) { g.save(); g.globalAlpha *= Math.min(1, lg * 1.2); g.font = 'bold 15px Arial'; g.textAlign = 'center'; g.fillStyle = '#FFE6B0'; g.strokeStyle = '#3B1A0C'; g.lineWidth = 4; const y = -64 - lg * 8; g.strokeText('he he', -98, y); g.fillText('he he', -98, y); g.restore(); }
    } else if (e === 'depressed') {
      for (const s of [-1, 1]) {                                        // small dim eyes, heavy lids sloping down at the outer corners, looking at the floor
        this.solid(this.oval(s * ex, ey + 6, 14, 13 * bl), false);
        g.save(); g.fillStyle = '#0C0D10'; g.beginPath(); g.moveTo(s * ex - 24, ey - 22); g.lineTo(s * ex + 24, ey - 22); g.lineTo(s * ex + s * 24, ey + 8); g.lineTo(s * ex - s * 24, ey - 6); g.closePath(); g.fill(); g.restore();
        for (let k = 0; k < 2; k++) { const o = (t * .38 + k * .5 + (s > 0 ? .25 : 0)) % 1; g.fillStyle = `rgba(150,225,255,${.8 * (1 - o)})`; g.beginPath(); g.ellipse(s * ex + s * 4, ey + 20 + o * 42, 3.2, 5, 0, 0, 7); g.fill(); }   // slow tears
      }
      const p = new Path2D(); p.moveTo(-15, 44); p.quadraticCurveTo(0, 31 + Math.sin(t * .9) * 1.2, 15, 44); this.thick(p, 4.5);
      const cl = new Path2D(); for (const [x, y, r] of [[-27, -116, 16], [0, -126, 21], [28, -116, 16]]) { cl.moveTo(x + r, y); cl.arc(x, y, r, 0, 7); } cl.rect(-40, -116, 80, 16);
      g.save(); g.translate(Math.sin(t * .7) * 3, 0); g.lineJoin = 'round'; g.strokeStyle = '#3B1A0C'; g.lineWidth = 8; g.stroke(cl); g.fillStyle = '#8D99B3'; g.fill(cl);
      g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.ellipse(-8, -132, 10, 4, -.3, 0, 7); g.fill();
      g.strokeStyle = 'rgba(150,225,255,.85)'; g.lineWidth = 2.6; g.lineCap = 'round';
      const ba = g.globalAlpha; for (let k = 0; k < 5; k++) { const o = (t * 1.1 + k * .21) % 1, x = -30 + k * 15; g.globalAlpha = ba * (1 - o * .8); g.beginPath(); g.moveTo(x, -98 + o * 12); g.lineTo(x - 2, -90 + o * 12); g.stroke(); }
      g.restore();
    } else if (e === 'sleepy') {
      for (const s of [-1, 1]) { const p = new Path2D(); p.moveTo(s * ex - 18, ey); p.quadraticCurveTo(s * ex, ey + 18, s * ex + 18, ey); p.closePath(); this.solid(p); }
      this.glow(() => { g.fillStyle = BLUE; g.beginPath(); g.ellipse(0, 36, 7, 5 + talk * 4, 0, 0, 7); g.fill(); });
      ['z', 'Z', 'z'].forEach((c, i) => { const o = (t * .5 + i * .33) % 1; g.font = `bold ${14 + i * 5}px Arial`; g.fillStyle = `rgba(255,214,150,${1 - o})`; g.strokeStyle = `rgba(59,26,12,${1 - o})`; g.lineWidth = 3; g.strokeText(c, 100 + i * 12, -50 - o * 40); g.fillText(c, 100 + i * 12, -50 - o * 40); });
    }
    if (tk) { g.restore(); openMouth(11, 5 + Math.min(1, talk) * 12); }
  }
}
