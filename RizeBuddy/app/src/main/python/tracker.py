"""Rize Buddy for Windows: Python tracker + local dashboard (http://127.0.0.1:8766) + warm AI study buddy."""
import ctypes, json, logging, os, re, sys, threading, time, webbrowser
import subprocess, urllib.request, queue, copy, hashlib, collections
ANDROID = bool(os.environ.get('RIZE_ANDROID'))      # set by android_entry.py: Windows-only parts are replaced by droid.py
try: import ctypes.wintypes as wt
except Exception: wt = None
try: import psutil
except Exception: psutil = None
try: import pystray
except Exception: pystray = None
import buddy, focus, algo, store, links, autorev, progress, names
from flask import Flask, jsonify, request, send_from_directory
try: from icon import make_icon
except Exception: make_icon = None

if sys.stdout is None: sys.stdout = sys.stderr = open(os.devnull, 'w')  # --noconsole builds
TICK = 2
VERSION = 'B17'   # bump on every release: a running older copy is asked to quit and the new one takes over
PORT = 8766
URL = f'http://127.0.0.1:{PORT}'
BASE = os.environ.get('RIZE_BASE') or getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
DIR = store.DIR
FILE = store.FILE
os.makedirs(DIR, exist_ok=True)
LOAD = {'note': ''}          # what load() had to do (restored from a backup / could not read the file), told to the student by Buddy

data = {'sessions': [], 'v': {}, 'target': 6, 'idle': 120, 'autostart': False, 'autoOpen': True, 'projects': [], 'clients': [], 'tasks': [], 'entries': [], 'timer': None, 'pomo': None, 'breakMin': 50, 'lastBreakNote': 0, 'icsUrl': '', 'areas': [], 'va': {}, 'exams': [], 'shortSec': 60, 'pausedUntil': 0, 'pauseMin': 30, 'offtaskMin': 15, 'game': {'lv': 1, 'bonus': 0}, 'privacy': {'incognito': True, 'hideTitles': False, 'block': []},
        'kw': ['tutorial', 'course', 'lecture', 'learn', 'how to', 'programming', 'react', 'python', 'explained', 'documentary'],
        'strict': {'on': False, 'earn': 30, 'give': 15, 'cap': 120, 'lock': 15}, 'blk': [], 'kwb': ['reaction', 'funny', 'vlog', 'gameplay', 'prank', 'trailer', 'meme', 'roast', 'full episode']}
data['distractions'] = []
data['navViews'] = {}      # dashboard page -> how many times it was opened (ranks the Buddy side panel)
DEFAULT = copy.deepcopy(data)
KEYS = ('v', 'kw', 'target', 'idle', 'projects', 'clients', 'tasks', 'entries', 'timer', 'pomo', 'game', 'breakMin', 'lastBreakNote', 'icsUrl', 'areas', 'va', 'exams', 'shortSec', 'pauseMin', 'offtaskMin', 'privacy', 'blk', 'kwb', 'freezeMin', 'freezeSec', 'strict')
lock = threading.Lock()
cur, now, last_save = None, None, 0
user32 = ctypes.windll.user32 if os.name == 'nt' else None

BROWSERS = re.compile(r'chrome|msedge|edge|firefox|brave|opera|vivaldi|arc', re.I)
SUFFIX = re.compile(r'\s[-–—]\s(Google Chrome|Microsoft.{0,2}Edge|Mozilla Firefox|Brave|Opera|Vivaldi).*$', re.I)
YT = re.compile(r'\s[-–—]\s*YouTube$', re.I)


# ---------- privacy: private windows, blocklist, hidden titles ----------
PRIVRE = re.compile(r'incognito|inprivate|private browsing|private window|\(private\)|\[private\]', re.I)

def priv():
    return {'incognito': True, 'hideTitles': False, 'block': [], **(data.get('privacy') or {})}

def skip_window(name, title):
    """True if this window must NOT be recorded at all (private browsing window, or matches the blocklist)."""
    p = priv(); raw = f'{name} {title}'.lower()
    if p['incognito'] and BROWSERS.search(name) and PRIVRE.search(title): return True
    return any(b.strip() and b.strip().lower() in raw for b in p['block'])

# ---------- pause tracking, productivity check, off-task alert ----------
PEEK = {'pin': 0}
OWN = {'rize', 'rize clone', 'rize buddy', 'buddy', 'rize peek', 'rize freeze', 'rize ai', 'rizebuddy'}
ALERTQ = queue.Queue(); ALERT = {'next': 0}; TRAY = None; WIDGET_OK = False
SHORTRE = re.compile(r'#shorts?\b', re.I); MEETRE = re.compile(r'zoom|teams|webex|meet|skype', re.I)
PRODAPP = re.compile(r'code|devenv|idea|pycharm|webstorm|figma|photoshop|illustrator|winword|excel|powerpnt|notion|obsidian|terminal|powershell|cmd|postman|word|blender', re.I)
CMAP = {'p': 'f', 'u': 'b'}

def paused():
    pu = data.get('pausedUntil', 0)
    if pu > 1 and pu <= time.time() * 1000: data['pausedUntil'] = 0; return False
    return pu != 0

def set_pause(minutes):
    global cur, now
    data['pausedUntil'] = int(time.time() * 1000 + minutes * 60000) if minutes > 0 else 1; cur = now = None; save()

def resume():
    data['pausedUntil'] = 0; save()

def site_py(t):
    p = re.split(r'\s[-–—|·•]\s', t); l = p[-1].strip()
    return l if len(p) > 1 and len(l) <= 26 else t[:40]

AISITE = re.compile(r'claude|chatgpt|gemini|copilot|perplexity|grok|deepseek|poe\b|mistral|meta ai|character\.ai|you\.com', re.I)

def _hit(words, text):
    return any(w and w.strip().lower() in text for w in (words or []))

def kw_cat(s):
    """User rules that beat everything else: blocked sites/apps are never productive; distraction / productive keywords decide AI chats."""
    if s['kind'] == 'youtube': name = 'youtube ' + s['title'].lower()
    elif s['kind'] == 'browser': name = site_py(s['title']).lower()
    else: name = s['app'].lower()
    if _hit(data.get('blk'), name): return 'b'
    if s['kind'] == 'browser' and AISITE.search(name):
        t = s['title'].lower()
        if _hit(data.get('kwb'), t): return 'b'
        if _hit(data.get('kw'), t) and not data['v'].get('web:' + name): return 'f'
    return None

def cat_py(s):
    """Same Focus / Meeting / Break / Other rules as the dashboard (f, m, b, o)."""
    u = kw_cat(s)
    if u: return u
    v = data['v']
    if s['kind'] == 'youtube':
        t = s['title'].lower(); x = v.get('yt:' + t) or v.get(t)
        if x: return CMAP.get(x, x)
        if t.startswith('youtube (') or not t.strip(): return 'o'            # Android without Accessibility: we cannot see what is playing, so never call it a distraction
        try:
            if focus.goal_at(data, s['start'])['id'] and any(focus.words_match(n, t) for n in focus._ids(data, focus.goal_at(data, s['start']))[1]): return 'f'   # video title matches the current goal / topic
        except Exception: pass
        sh = data.get('shortSec', 60)
        if SHORTRE.search(t) or (sh > 0 and s['end'] - s['start'] <= (sh + 4) * 1000): return 'b'
        if _hit(data.get('kwb'), t): return 'b'
        return 'f' if any(w in t for w in data['kw']) else 'b'
    if s['kind'] == 'browser':
        x = v.get('web:' + site_py(s['title']).lower()); return CMAP.get(x, x) if x else (s.get('rbc') or 'o')
    x = v.get('app:' + s['app'].lower())
    if x: return CMAP.get(x, x)
    return 'm' if MEETRE.search(s['app']) else 'f' if PRODAPP.search(s['app']) else 'o'

def skey(s):
    """Same key the dashboard uses (yt:/web:/app:) so per-item overrides apply."""
    if s['kind'] == 'youtube':
        t = s['title'].lower(); sh = data.get('shortSec', 60)
        return 'yt:shorts' if SHORTRE.search(t) or (sh > 0 and s['end'] - s['start'] <= (sh + 4) * 1000) else 'yt:' + t
    if s['kind'] == 'browser': return 'web:' + site_py(s['title']).lower()
    return 'app:' + s['app'].lower()

def s_ok(s):
    """Focus/Meeting AND on the current goal (if one is set)."""
    return focus.ok(data, s, cat_py(s), skey(s))

def work_minutes():
    """Work minutes today that count toward the current goal."""
    t0 = time.mktime((*time.localtime()[:3], 0, 0, 0, 0, 0, -1)) * 1000
    with lock: L = [s for s in data['sessions'] if s['start'] >= t0]
    return sum((s['end'] - s['start']) / 6e4 for s in L if s_ok(s))

def wasted_minutes():
    """Unproductive minutes today: everything the dashboard files under Unproductive."""
    t0 = time.mktime((*time.localtime()[:3], 0, 0, 0, 0, 0, -1)) * 1000
    with lock: L = [s for s in data['sessions'] if s['start'] >= t0]
    return sum((s['end'] - s['start']) / 6e4 for s in L if cat_py(s) == 'b')

def stats_today():
    """The three numbers Buddy shows: productive (on today's goal) / wasted / live focus streak, all in minutes."""
    return {'prod': round(work_minutes()), 'wasted': round(wasted_minutes()), 'streak': streak_now()[0]}

def streak_now():
    """(current streak min, best today min, goal name)."""
    t0 = time.mktime((*time.localtime()[:3], 0, 0, 0, 0, 0, -1)) * 1000
    with lock: L = [s for s in data['sessions'] if s['end'] >= t0]
    b, _, live = focus.streak(L, s_ok, focus.F(data).get('gap', 5) * 60000)
    return round(live / 60000), round(b / 60000), focus.F(data)['goal']

def offgoal_now():
    """True when the current activity is productive work, but NOT for the current goal."""
    if not now: return False
    s = {**now, 'start': int(time.time() * 1000), 'end': int(time.time() * 1000) + 1000}
    return cat_py(s) in ('f', 'm') and not s_ok(s)

def offtask_minutes():
    """Minutes of continuous non-productive activity ending now (0 if idle or currently productive)."""
    with lock: L = data['sessions'][-600:]
    if not L or time.time() * 1000 - L[-1]['end'] > 180000: return 0
    edge = first = L[-1]['end']
    for s in reversed(L):
        if edge - s['end'] > 180000 or s_ok(s) or new_unreviewed(s): break
        first = edge = s['start']
    return (L[-1]['end'] - first) / 60000

def work_stretch():
    """Minutes of unbroken screen work ending now (for the break reminder). Productive and not-yet-reviewed time counts, unproductive
    time (feeds, games) never does, and a pause longer than the streak-gap setting ends the stretch."""
    gap = focus.F(data).get('gap', 5) * 60000
    with lock: L = data['sessions'][-800:]
    if not L or time.time() * 1000 - L[-1]['end'] > gap or cat_py(L[-1]) == 'b': return 0      # idle, or on something unproductive right now
    first = edge = L[-1]['start']
    for s in reversed(L):
        if edge - s['end'] > gap or cat_py(s) == 'b': break
        first = edge = s['start']
    return (L[-1]['end'] - first) / 60000

def disp(s):
    """Name shown to the student for a session (same idea as the dashboard)."""
    return s['title'] if s['kind'] == 'youtube' else site_py(s['title']) if s['kind'] == 'browser' else s['app']

def meta(s):
    """(readable name, kind label, raw text) for the student-facing lists. Display only: review keys never use it."""
    return names.nice(s['kind'], s.get('app', ''), s.get('title', ''))

def nice(s): return meta(s)[0]

def reviewable(s):
    """New-site review only covers apps and websites (YouTube videos have their own rules) that are not Buddy's own windows."""
    return s['kind'] in ('app', 'browser') and s['app'].lower() not in OWN and not is_shell(s['app'], s['title']) and s['title'] not in ('not recorded', 'viewing - not counted')

def new_unreviewed(s):
    """A site / app the student has never reviewed AND that has not yet reached the review threshold: it gets the benefit of the doubt (no off-task alert)."""
    try:
        if s.get('rbc') or not reviewable(s) or skey(s) in data['v'] or not buddy.st()['profile'].get('newSiteAsk', True): return False
        r = (buddy.REV.get('stats') or {}).get(skey(s))                    # past the review threshold (+15 min): it counts as off-task again
        return r is None or r['min'] < buddy.new_site_min() + 15
    except Exception: return False

def site_stats(days=14):
    """Every never-reviewed app / site of the last N days with the minutes spent: {key: {key,name,kind,min,first,last}}."""
    t0 = (time.time() - days * 86400) * 1000; out = {}
    with lock: L = [s for s in data['sessions'] if s['end'] >= t0]
    for s in L:
        if not reviewable(s) or s.get('rbc'): continue
        k = skey(s)
        if k in data['v']: continue
        r = out.setdefault(k, {'key': k, 'name': nice(s)[:60], 'tag': meta(s)[1], 'hint': meta(s)[2], 'kind': s['kind'], 'min': 0.0, 'first': s['start'], 'last': s['end'], 'sug': (data.get('auto') or {}).get('sug', {}).get(k)})
        r['min'] += (s['end'] - s['start']) / 60000; r['first'] = min(r['first'], s['start']); r['last'] = max(r['last'], s['end'])
    return out

def current_goal_id():
    return focus.F(data)['goal'].get('id', '')

def review_site(key, verdict):
    """Buddy's quick review: aligned (productive + linked to the current goal), prod (productive, other goal), no (unproductive)."""
    if not key or key.startswith('yt:'): return False
    with lock:
        if verdict in ('aligned', 'prod'):
            data['v'][key] = 'f'
            gid = current_goal_id()
            if verdict == 'aligned' and gid.startswith('g:'): data.setdefault('va', {})[key] = gid
        elif verdict == 'no': data['v'][key] = 'b'
        else: return False
        autorev.feedback(data, key, 'set', data['v'][key])
    save(); return True

def quiet_now():
    """Buddy keeps completely quiet while the activity in front of you is productive AND counts for your current goal."""
    try:
        if paused() or not cur or not now or now.get('app') in ('Rize Buddy', 'Desktop', 'Private / blocked', 'Rize dashboard'): return False
        return bool(s_ok(cur['s']))
    except Exception: return False

def productive_now():
    """True while the app / site / video in front of you is productive (Focus or Meeting), whether or not it is the current goal.
    Buddy never opens an interrupt window over it. (quiet_now is stricter: it also needs the goal to match.)"""
    try:
        if paused() or not now or now.get('app') in ('Rize Buddy', 'Desktop', 'Private / blocked', 'Rize dashboard'): return False
        s = {**now, 'start': int(time.time() * 1000), 'end': int(time.time() * 1000) + 1000}
        return cat_py(s) in ('f', 'm')
    except Exception: return False

def streak_guard():
    """Streak protection timer. None when nothing is at risk, else {streak: min at risk, left: s until it breaks, since: s off goal, why: 'off'|'away', gap: min}.
    A streak survives breaks up to the streak-gap setting (default 5 min); the timer runs while you are away from aligned work."""
    gap = focus.F(data).get('gap', 5) * 60000
    t0 = time.mktime((*time.localtime()[:3], 0, 0, 0, 0, 0, -1)) * 1000
    with lock: L = [s for s in data['sessions'] if s['end'] >= t0]
    st = focus.streak_state(L, s_ok, gap)
    if st['cur'] < 120000 or st['left'] <= 0 or st['since'] < 12000: return None           # nothing to protect / already broken / still on goal (12 s grace for tab flicker)
    away = (not now) or now.get('app') in ('Desktop',) or not idle_ok()
    return {'streak': round(st['cur'] / 60000), 'left': round(st['left'] / 1000), 'since': round(st['since'] / 1000), 'why': 'away' if away else 'off', 'gap': round(gap / 60000, 1)}

def away_report(since_ms, to_ms=None):
    """What you did between two moments, on the sites / apps that count for your goal, with timestamps (for Buddy's welcome-back)."""
    to_ms = to_ms or time.time() * 1000
    with lock: L = [s for s in data['sessions'] if s['end'] > since_ms and s['start'] < to_ms]
    L.sort(key=lambda s: s['start']); runs = []; other = {'prod': 0.0, 'bad': 0.0, 'unrev': 0.0}; on = 0.0
    names = {}
    for e in data.get('exams', []):
        names['g:exam:%s' % e['id']] = e.get('name', '')
        for c in e.get('ch', []): names['g:chap:%s' % c['id']] = c.get('name', '')
    for t in data.get('tasks', []): names['g:task:%s' % t['id']] = t.get('title', '')
    for s in L:
        a, b = max(s['start'], since_ms), min(s['end'], to_ms); m = (b - a) / 60000
        if m <= 0: continue
        if s_ok(s):
            on += m; k = skey(s)
            if runs and runs[-1]['key'] == k and a - runs[-1]['end'] <= 120000: runs[-1]['end'] = b; runs[-1]['min'] += m
            else:
                links = [names[x] for x in focus.vlist((data.get('va') or {}).get(k)) if x in names]
                g = focus.goal_at(data, s['start'])['name']
                runs.append({'key': k, 'name': nice(s)[:60], 'kind': s['kind'], 'start': a, 'end': b, 'min': m, 'goal': (links[0] if links else g)})
        else:
            c = cat_py(s); other['bad' if c == 'b' else 'prod' if c in ('f', 'm') else 'unrev'] += m
    big = [r for r in runs if r['min'] >= 1]; small = len(runs) - len(big)
    for r in big: r['min'] = round(r['min'])
    return {'from': since_ms, 'to': to_ms, 'on': round(on), 'rows': big[:12], 'more': max(0, len(big) - 12) + small, 'other': {k: round(v) for k, v in other.items()}}

def tray_notify(msg):
    try: TRAY.notify(msg, 'Rize Buddy')
    except Exception: pass

def notify_offtask(m):
    try:
        if buddy.on_offtask(m, offgoal_now(), focus.F(data)['goal']['name']):
            try:
                import winsound; winsound.MessageBeep()
            except Exception: pass
            return
    except Exception as e: print('buddy offtask failed:', e)
    msg = f"You have been off-task for {m} minutes. Ready to get back to work?"
    try: TRAY.notify(msg, 'Rize – off-task alert')
    except Exception: pass
    try:
        import winsound; winsound.MessageBeep()
    except Exception: pass
    if WIDGET_OK: ALERTQ.put(msg)
    else: threading.Thread(target=lambda: ctypes.windll.user32.MessageBoxW(0, msg, 'Rize – off-task alert', 0x40040), daemon=True).start()

def live_cat(c):
    """cat_py for what is on screen RIGHT NOW (used by the distraction freeze and strict mode). The old 1-second stand-in made every video
    look like a Short, so productive videos got the freeze card too. Here a video you marked productive, or whose title has one of your
    productive keywords, is never treated as unproductive; otherwise the real time it has been open decides (Shorts rule)."""
    t = int(time.time() * 1000); st = t - 3600000
    try:
        if cur and cur['key'] == c['app'] + '|' + c['title']: st = cur['s']['start']
    except Exception: pass
    if c.get('kind') == 'youtube':
        u = kw_cat(c)
        if u: return u
        ti = c['title'].lower(); v = data['v']
        if not (v.get('yt:' + ti) or v.get(ti)) and not SHORTRE.search(ti) and not _hit(data.get('kwb'), ti) and any(w.strip() and w.strip().lower() in ti for w in data.get('kw', [])): return 'f'
    return cat_py({**c, 'start': st, 'end': t})

# ---------- distraction freeze: on a distracting site, every X minutes a full-screen card blocks the screen for N seconds ----------
FREEZE = {'since': 0, 'next': 0, 'last': 0, 'busy': False}

def open_freeze(sec, what, mins, goal, head='', body=''):
    """Full-screen, always-on-top card that counts down `sec` seconds and closes itself. It keeps grabbing focus, so the screen is frozen meanwhile."""
    from urllib.parse import quote
    FREEZE['busy'] = True
    try:
        if find_win('Rize Freeze'): return
        W, H = user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)
        url = f'{URL}/freeze.html?s={sec}&w={quote(what)}&m={mins}&g={quote(goal)}&h={quote(head)}&b={quote(body)}'
        edge = next((p for p in (r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', r'C:\Program Files\Microsoft\Edge\Application\msedge.exe') if os.path.exists(p)), None)
        if not edge: webbrowser.open(url); time.sleep(sec); return
        subprocess.Popen([edge, f'--app={url}', f'--window-size={W},{H}', '--window-position=0,0', f'--user-data-dir={os.path.join(DIR, "edge-buddy")}', '--no-first-run'])
        wait = time.time() + 8; shown = 0; vp = ctypes.c_void_p
        while time.time() < (shown + sec + 0.4 if shown else wait):
            hw = find_win('Rize Freeze')
            if hw:
                if not shown:
                    shown = time.time()
                    try: user32.SetWindowLongW(vp(hw), -16, user32.GetWindowLongW(vp(hw), -16) & ~0x00C40000)       # no title bar / border
                    except Exception: pass
                try: user32.SetWindowPos(vp(hw), vp(-1), 0, 0, W, H, 0x0060); user32.SetForegroundWindow(vp(hw))   # topmost, full screen, focused
                except Exception: pass
            time.sleep(0.15)
        hw = find_win('Rize Freeze')
        if hw: user32.PostMessageW(hw, 0x10, 0, 0)
    except Exception as e: print('freeze failed:', e)
    finally: FREEZE['busy'] = False

def freeze_check():
    """Called every tick. While the current site / app / video is one you marked unproductive, show the freeze card every `freezeMin` minutes (0 = off) for `freezeSec` seconds (1-60)."""
    try:
        n = float(data.get('freezeMin', 5) or 0); sec = max(1, min(60, int(data.get('freezeSec', 5) or 5))); c = now; tt = time.time()
        p = data.get('pomo'); brk = bool(p and p.get('running') and p.get('mode') != 'focus')
        bad = bool(n and c and c.get('kind') in ('browser', 'youtube', 'app') and not FREEZE['busy'] and not brk and not paused() and idle_ok() and not productive_now()
                   and live_cat(c) == 'b')
        if bad:
            FREEZE['last'] = tt
            if not FREEZE['since']: FREEZE['since'] = tt; FREEZE['next'] = tt + n * 60
            elif tt >= FREEZE['next']:
                what = (site_py(c['title']) if c['kind'] == 'browser' else c.get('title') if c['kind'] == 'youtube' else c.get('app', '')) or 'this'
                mins = max(1, round((tt - FREEZE['since']) / 60)); FREEZE['next'] = tt + sec + n * 60
                threading.Thread(target=open_freeze, args=(sec, str(what)[:60], mins, focus.F(data)['goal']['name']), daemon=True).start()
        elif FREEZE['since'] and tt - FREEZE['last'] > 45: FREEZE['since'] = 0
    except Exception as e: print('freeze_check:', e)

# ---------- strict mode: productive time earns break tokens; unproductive time spends them; no tokens left = lock-out ----------
STR = {'t': 0, 'status': 'off', 'lockAt': 0, 'ev': 0}

def strict_cfg():
    return {'on': False, 'earn': 30, 'give': 15, 'cap': 120, 'lock': 15, **(data.get('strict') or {})}

def strict_bank():
    return data.setdefault('strictBank', {'bal': 0, 'prog': 0, 'earned': 0, 'spent': 0})

def strict_tick():
    """Every `earn` productive minutes adds `give` minutes of break tokens (up to `cap`). Unproductive time spends them quietly. At 0 tokens it freezes the screen."""
    c = strict_cfg(); tt = time.time(); dt = min(max(tt - STR['t'], 0), 6) if STR['t'] else 0; STR['t'] = tt
    if not c['on']: STR['status'] = 'off'; return
    bank = strict_bank(); cur = now; cat = None
    if cur and cur.get('kind') in ('browser', 'youtube', 'app') and not paused() and idle_ok():
        cat = live_cat(cur)
    earn = max(1, float(c['earn'])) * 60; give = max(0, float(c['give'])) * 60; cap = max(give, float(c['cap']) * 60)
    if cat == 'f':
        bank['prog'] += dt; STR['status'] = 'earning'
        while bank['prog'] >= earn:
            bank['prog'] -= earn; bank['bal'] = min(cap, bank['bal'] + give); bank['earned'] += 1; STR['ev'] += 1
    elif cat == 'b':
        if bank['bal'] > 0: bank['bal'] = max(0, bank['bal'] - dt); bank['spent'] += dt; STR['status'] = 'break'
        else:
            STR['status'] = 'out'
            if not FREEZE['busy'] and tt - STR['lockAt'] > 45 + float(c['lock']):
                STR['lockAt'] = tt
                what = (site_py(cur['title']) if cur['kind'] == 'browser' else cur.get('title') if cur['kind'] == 'youtube' else cur.get('app', '')) or 'this'
                body = f"No break tokens left. Study {int(c['earn'])} min to earn {int(c['give'])} more."
                threading.Thread(target=open_freeze, args=(max(1, min(120, int(c['lock']))), str(what)[:60], 0, focus.F(data)['goal']['name'], 'Out of break tokens', body), daemon=True).start()
    else: STR['status'] = 'idle'

# ---------- Flask app (must exist before any @web.route below) ----------
web = Flask(__name__, static_folder=os.path.join(BASE, 'renderer'), static_url_path='')
logging.getLogger('werkzeug').setLevel(logging.ERROR)

web.register_blueprint(buddy.bp)

# ---------- Rize Browser: an integrated browser window (own process, pywebview) with no address bar; sites are added from its settings ----------
AIQ = [{'n': 'Gemini', 'e': '\u2728', 'u': 'https://gemini.google.com'}, {'n': 'Claude', 'e': '\U0001F9E0', 'u': 'https://claude.ai'},
       {'n': 'ChatGPT', 'e': '\U0001F4AC', 'u': 'https://chatgpt.com'}, {'n': 'YouTube', 'e': '\u25B6\uFE0F', 'u': 'https://www.youtube.com'}]
RBSUF = re.compile(r'(?:\s\|\s)?Rize Browser$')
AIB = {'p': None}

def norm_site(s):
    """'perplexity.ai' -> https://perplexity.ai ; only real http(s) websites (no plain words, no file: / javascript:)."""
    from urllib.parse import urlparse
    s = (s or '').strip()
    if not s or len(s) > 300 or ' ' in s or '.' not in s: return None
    if not re.match(r'^https?://', s, re.I):
        if re.match(r'^[a-z][a-z0-9+.\-]*:(?!\d+(/|$))', s, re.I): return None
        s = 'https://' + s
    p = urlparse(s)
    return s if p.scheme in ('http', 'https') and p.netloc and '.' in p.netloc else None

def ai_list():
    sv = data.setdefault('aiSites', [])
    if not data.get('aiSeed'):                                           # first time: offer the usual AI sites and YouTube
        have = {x['u'] for x in sv}; sv[:0] = [dict(q) for q in AIQ if q['u'] not in have]; data['aiSeed'] = True
    return sv

def find_rb_window():
    res = []; buf = ctypes.create_unicode_buffer(300)
    @ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)
    def cb(h, l):
        try:
            if user32.IsWindowVisible(h) and user32.GetWindowTextW(h, buf, 300) and RBSUF.search(buf.value): res.append(h)
        except Exception: pass
        return True
    user32.EnumWindows(cb, 0); return res[0] if res else 0

def open_ai_browser():
    p = AIB['p']
    if p and p.poll() is None:
        hw = find_rb_window()
        if hw: raise_win(hw); return
    ai_list(); save()
    if getattr(sys, 'frozen', False): cmd = [sys.executable, '--browser', str(PORT), DIR]
    else: cmd = [sys.executable.replace('python.exe', 'pythonw.exe'), os.path.abspath(__file__), '--browser', str(PORT), DIR]
    AIB['p'] = subprocess.Popen(cmd)

@web.get('/api/ai/sites')
def ai_sites():
    return jsonify(sites=ai_list(), last=data.get('aiLast', ''))

@web.post('/api/ai/add')
def ai_add():
    if request.headers.get('X-Rize') != '1': return 'no', 403
    u = norm_site((request.get_json(silent=True) or {}).get('url')); sv = ai_list()
    if not u: return jsonify(ok=False, error='That does not look like a website. Try something like perplexity.ai', sites=sv)
    host = re.sub(r'^www\.', '', u.split('/')[2])
    if any(re.sub(r'^www\.', '', x['u'].split('/')[2]) == host for x in sv): return jsonify(ok=False, error=host + ' is already in your list.', sites=sv)
    sv.append({'n': host.split('.')[0].capitalize(), 'e': '\U0001F310', 'u': u}); del sv[30:]; save()
    return jsonify(ok=True, sites=sv)

@web.post('/api/ai/forget')
def ai_forget():
    if request.headers.get('X-Rize') != '1': return 'no', 403
    u = (request.get_json(silent=True) or {}).get('u'); data['aiSites'] = [x for x in ai_list() if x['u'] != u]; save(); return jsonify(ok=True)

@web.post('/api/ai/last')
def ai_last():
    if request.headers.get('X-Rize') != '1': return 'no', 403
    u = str((request.get_json(silent=True) or {}).get('u') or '')
    if re.match(r'^https?://', u): data['aiLast'] = u[:500]
    return jsonify(ok=True)

@web.post('/api/ai/launcher')
def ai_launcher():
    if request.headers.get('X-Rize') != '1': return 'no', 403
    open_ai_browser(); return jsonify(ok=True)

@web.get('/api/strict')
def strict_api():
    c = strict_cfg(); b = strict_bank()
    return jsonify(on=c['on'], earn=c['earn'], give=c['give'], cap=c['cap'], bal=round(b['bal']), prog=round(b['prog']), earned=b['earned'], spent=round(b['spent']), status=STR['status'], ev=STR['ev'])

@web.post('/api/strict')
def strict_set():
    c = request.get_json(silent=True) or {}; s = strict_cfg()
    if 'on' in c: s['on'] = bool(c['on'])
    data['strict'] = s; save(); return strict_api()

def offtask_check():
    strict_tick()
    if strict_cfg()['on']:
        if strict_bank()['bal'] > 0: return        # break time: Buddy only watches, no interruptions
    else: freeze_check()
    n = data.get('offtaskMin', 15); p = data.get('pomo')
    if not n: return
    if p and p.get('running'):
        if p.get('mode') != 'focus': return      # breaks are allowed
        n = min(n, 8)                            # during a focus block distractions are caught earlier
    m = offtask_minutes()
    if m == 0: ALERT['next'] = 0
    elif m >= n and time.time() >= ALERT['next']:
        ALERT['next'] = time.time() + max(n, 5) * 60 * (1 + min(3, buddy.st()['nudges'].get('n', 0) // 2)); notify_offtask(int(m))   # backs off the more it is asked

def snooze(minutes):
    ALERT['next'] = time.time() + float(minutes) * 60

def _ico(kind):
    """Write the window icon once: 'bot' = Buddy's robot face, 'r' = the orange R."""
    p = os.path.join(DIR, f'{kind}.ico')
    if not os.path.exists(p):
        from icon import make_icon, make_bot_icon
        (make_bot_icon if kind == 'bot' else make_icon)(256).save(p, sizes=[(256, 256), (64, 64), (32, 32), (16, 16)])
    return p

def set_win_icon(title, kind):
    """Edge app windows of a local page can end up with a generic globe: give the window its real icon (title bar + taskbar)."""
    def run():
        try:
            path = _ico(kind); u = ctypes.windll.user32
            u.LoadImageW.restype = ctypes.c_void_p; u.LoadImageW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_uint, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
            u.SendMessageW.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p]
            big, small = (u.LoadImageW(None, path, 1, sz, sz, 0x10) for sz in (48, 16))      # IMAGE_ICON, LR_LOADFROMFILE
            for _ in range(60):
                h = find_win(title)
                if h: u.SendMessageW(h, 0x80, 1, big); u.SendMessageW(h, 0x80, 0, small); return     # WM_SETICON big + small
                time.sleep(.25)
        except Exception as e: print('window icon failed:', e)
    if os.name == 'nt': threading.Thread(target=run, daemon=True).start()

def place_win(title, x, y, w, h):
    """Edge remembers the size a window had last time; make a freshly opened Buddy window start at the default size."""
    def run():
        try:
            for _ in range(60):
                hw = find_win(title)
                if hw: time.sleep(.4); user32.SetWindowPos(hw, 0, int(x), int(y), int(w), int(h), 0x0004); return           # SWP_NOZORDER
                time.sleep(.25)
        except Exception as e: print('place window failed:', e)
    if os.name == 'nt': threading.Thread(target=run, daemon=True).start()

def find_win(title):
    try: return user32.FindWindowW(None, title) if user32 else 0
    except Exception: return 0

def raise_win(h):
    try: user32.ShowWindow(h, 9); user32.SetForegroundWindow(h)
    except Exception: pass

SPAWN = {'t': 0}; SPAWN_LOCK = threading.Lock()

def buddy_open(): return bool(find_win('Buddy')) or time.time() - SPAWN['t'] < 12     # a window that is still loading counts as open

def open_buddy(*a):
    """Reuse the Buddy window if one exists (bring it to front); only open a new one when there is none."""
    with SPAWN_LOCK:
        h = find_win('Buddy')
        if h: raise_win(h); return
        if time.time() - SPAWN['t'] < 12: return
        SPAWN['t'] = time.time()
        w, hh = 560, 900                                                                 # roomier default (was 430 x 720)
        try:
            sw, sh = user32.GetSystemMetrics(0), user32.GetSystemMetrics(1); w = min(w, int(sw * .45)); hh = min(hh, sh - 80); x, y = sw - w - 16, max(0, sh - hh - 56)
        except Exception: x, y = 100, 40
        url = f'{URL}/companion.html'
        for p in (r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'):
            if os.path.exists(p):
                subprocess.Popen([p, f'--app={url}', f'--window-size={w},{hh}', f'--window-position={x},{y}', f'--user-data-dir={os.path.join(DIR, "edge-buddy")}',
                                  '--autoplay-policy=no-user-gesture-required', '--no-first-run']); set_win_icon('Buddy', 'bot'); place_win('Buddy', x, y, w, hh); return
        webbrowser.open(url)

def open_peek(kind='peek', arg=''):
    """Small corner popup (like a tray flyout) that shows for ~8-10 s and closes itself."""
    hp = find_win('Rize Peek')
    if hp: raise_win(hp); return
    n = len(buddy.peek_rows()); w, h = 330, min(420, 150 + n * 54 + (40 if kind == 'streak' else 0))
    try:
        r = ctypes.wintypes.RECT(); ctypes.windll.user32.SystemParametersInfoW(0x30, 0, ctypes.byref(r), 0)     # work area (excludes taskbar)
        x, y = r.right - w, r.bottom - h
    except Exception: x, y = 100, 100
    url = f'{URL}/peek.html?k={kind}&a={arg}'
    for p in (r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'):
        if os.path.exists(p):
            subprocess.Popen([p, f'--app={url}', f'--window-size={w},{h}', f'--window-position={x},{y}', f'--user-data-dir={os.path.join(DIR, "edge-buddy")}', '--no-first-run']); set_win_icon('Rize Peek', 'r')
            def close():
                try:
                    hw = user32.FindWindowW(None, 'Rize Peek')
                    if hw and time.time() - PEEK['pin'] > 600: user32.PostMessageW(hw, 0x10, 0, 0)
                except Exception: pass
            threading.Timer(12, close).start(); return
    webbrowser.open(url)

def idle_ok():
    try: return not paused() and idle_seconds() < 120
    except Exception: return False

def load():
    """Load the data file. If it is empty / damaged (power cut, forced shutdown) the newest good backup is used instead (see store.py)."""
    d, note = store.load(DEFAULT)
    data.update(d); LOAD['note'] = note
    data.setdefault('strict', {'on': False, 'earn': 30, 'give': 15, 'cap': 120, 'lock': 15}); data.setdefault('freezeMin', 5); data.setdefault('freezeSec', 5); data.setdefault('blk', []); data.setdefault('kwb', ['reaction', 'funny', 'vlog', 'gameplay', 'prank', 'trailer', 'meme', 'roast', 'full episode'])
    if note: print('data load:', note)

def save(allow_empty=False):
    """Crash-safe save (temp file + fsync + atomic swap + rolling backups). Never overwrites real data with an empty dataset."""
    global last_save
    ok = store.save(data, lock, allow_empty=allow_empty)
    if ok: last_save = time.time()
    return ok

class LII(ctypes.Structure):
    _fields_ = [('cbSize', ctypes.c_uint), ('dwTime', ctypes.c_uint)]

def idle_seconds():
    i = LII(); i.cbSize = ctypes.sizeof(i)
    user32.GetLastInputInfo(ctypes.byref(i))
    return ((ctypes.windll.kernel32.GetTickCount() - i.dwTime) & 0xFFFFFFFF) / 1000

def active_window():
    hwnd = user32.GetForegroundWindow()
    if not hwnd: return None
    n = user32.GetWindowTextLengthW(hwnd)
    buf = ctypes.create_unicode_buffer(n + 1)
    user32.GetWindowTextW(hwnd, buf, n + 1)
    pid = wt.DWORD(); user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    try: name = psutil.Process(pid.value).name()
    except Exception: return None
    return name, buf.value

# ---------- Windows shell (desktop, taskbar, Alt-Tab, Start...) is never an activity ----------
SHELL_PROC = {'searchhost', 'searchapp', 'startmenuexperiencehost', 'shellexperiencehost', 'textinputhost', 'lockapp', 'logonui'}
SHELL_TITLES = {'', 'program manager', 'taskbar', 'task switching', 'task view', 'start', 'search', 'notification center', 'action center', 'quick settings',
                'new notification', 'snap assist', 'windows input experience', 'system tray overflow window.', 'desktop', 'start menu'}
SHELL = {'since': 0}

def is_shell(name, title):
    """explorer.exe is also the desktop, taskbar and Alt-Tab. When one of those has focus (e.g. you click the other monitor's wallpaper while reading
    Claude), the tracker used to book that time as 'explorer'. Real File Explorer windows (a folder title) are not shell."""
    n = re.sub(r'\.exe$', '', name or '', flags=re.I).lower(); t = (title or '').strip().lower()
    return n in SHELL_PROC or (n == 'explorer' and t in SHELL_TITLES)

def top_app_window():
    """The top-most visible, un-minimised, non-cloaked, non-shell window: what you are really looking at when the shell holds focus."""
    try:
        u = user32; h = u.GetTopWindow(0); dw = ctypes.windll.dwmapi
        for _ in range(80):
            if not h: break
            if u.IsWindowVisible(h) and not u.IsIconic(h) and not (u.GetWindowLongW(h, -20) & 0x80):          # WS_EX_TOOLWINDOW
                c = wt.DWORD(0); dw.DwmGetWindowAttribute(h, 14, ctypes.byref(c), 4)                           # DWMWA_CLOAKED
                n = u.GetWindowTextLengthW(h)
                if not c.value and n:
                    buf = ctypes.create_unicode_buffer(n + 1); u.GetWindowTextW(h, buf, n + 1)
                    pid = wt.DWORD(); u.GetWindowThreadProcessId(h, ctypes.byref(pid))
                    try: name = psutil.Process(pid.value).name()
                    except Exception: name = ''
                    if name and not is_shell(name, buf.value): return name, buf.value
            h = u.GetWindow(h, 2)                                                                              # GW_HWNDNEXT
    except Exception as e: print('top window failed:', e)
    return None

YTHOME = re.compile(r'^youtube$', re.I)

def rb_verdict(title):
    """Rize Browser: EVERY site is judged Productive (f), Meeting (m) or Unproductive (b), never left as 'Other'.
    Order: your distraction words, your productive words, the built-in lexicon (feeds, streaming, games, shopping... vs study / dev / AI tools),
    and a site nobody can place gets the benefit of the doubt (you chose it in the Rize Browser) = Productive. Your own Review always wins over this."""
    t = (title or '').lower(); name = site_py(title).lower()
    if _hit(data.get('blk'), name) or _hit(data.get('kwb'), t): return 'b'
    if _hit(data.get('kw'), t): return 'f'
    try: pr, st = autorev.prior('web:' + name, t)
    except Exception: pr, st = {'f': .25, 'b': .25, 'm': .03, 'o': .47}, 0.0
    if st >= .5: return max(('f', 'b', 'm'), key=lambda c: pr[c])
    return 'f'

def classify(name, title):
    name = re.sub(r'\.exe$', '', name, flags=re.I)
    rb = bool(RBSUF.search(title))
    if rb: name, title = 'msedge', RBSUF.sub('', title).strip() or 'Rize Browser'      # Rize Browser window: counted like any browser
    kind = 'app'
    if BROWSERS.search(name):
        kind = 'browser'
        title = re.sub(r'^\(\d+\)\s*', '', SUFFIX.sub('', title))
        if YT.search(title):
            kind, title = 'youtube', YT.sub('', title)
        elif YTHOME.match(title.strip()):                          # YouTube home page: judged like a video (by its title / length), never by the domain
            kind, title = 'youtube', 'YouTube home'
    c = {'app': name, 'title': title, 'kind': kind, 'site': ''}
    if rb:
        c['rb'] = True
        if kind == 'browser': c['rbc'] = rb_verdict(title)
    return c

def loop():
    global cur, now
    while True:
        try:
            if paused():
                cur = now = None; time.sleep(TICK); continue
            if idle_seconds() > data['idle']:
                cur = now = None
            else:
                w = active_window()
                if w and is_shell(*w):
                    alt = top_app_window()
                    if alt: w = alt; SHELL['since'] = 0
                    else:                                              # desktop really is empty (Win+D, everything minimised): brief grace, then not counted
                        SHELL['since'] = SHELL['since'] or time.time()
                        if cur and time.time() - SHELL['since'] < 60 and int(time.time() * 1000) - cur['s']['end'] < 10000: cur['s']['end'] = int(time.time() * 1000) + TICK * 1000
                        else: cur = None; now = {'app': 'Desktop', 'title': 'home screen - not counted'}
                        offtask_check(); buddy.tick(); time.sleep(TICK); continue
                else: SHELL['since'] = 0
                if w and skip_window(*w):
                    cur = None; now = {'app': 'Private / blocked', 'title': 'not recorded'}; time.sleep(TICK); continue
                if w and not RBSUF.search(w[1]) and (w[0].lower().startswith('rizebuddy') or w[1].strip().lower() in OWN):
                    cur = None; now = {'app': 'Rize Buddy', 'title': 'viewing - not counted'}; time.sleep(TICK); continue
                if w:
                    c = classify(*w)
                    if priv()['hideTitles'] and c['kind'] in ('browser', 'youtube') and c['title'].strip().lower() not in ('rize', 'rize clone'):
                        c = {'app': c['app'], 'title': 'Web browsing', 'kind': 'browser', 'site': '', **{k: c[k] for k in ('rb', 'rbc') if k in c}}
                    t = int(time.time() * 1000); key = c['app'] + '|' + c['title']
                    if c['kind'] == 'browser' and c['title'].strip().lower() in ('rize', 'rize clone'):
                        cur = None; now = {'app': 'Rize dashboard', 'title': 'viewing - not counted'}; time.sleep(TICK); continue
                    with lock:
                        if cur and cur['key'] == key and t - cur['s']['end'] < 10000:
                            cur['s']['end'] = t + TICK * 1000
                        else:
                            s = {'id': t, 'start': t, 'end': t + TICK * 1000, **c}
                            data['sessions'].append(s); cur = {'key': key, 's': s}
                    now = c
            offtask_check()
            buddy.tick()
            if time.time() - last_save > 8: save()
        except Exception as e:
            print('tick failed:', e)
        time.sleep(TICK)

@web.get('/')
def index(): return send_from_directory(web.static_folder, 'index.html')

@web.get('/api/range')
def rng():
    a, b = float(request.args['a']), float(request.args['b'])
    with lock: return jsonify([s for s in data['sessions'] if a <= s['start'] < b])

LISTK = ('projects', 'clients', 'tasks', 'entries', 'areas', 'exams')
REVS = collections.OrderedDict()          # rev -> copy of the shared settings at that moment (the base of a three-way merge)

def _subset():
    return {k: data.get(k) for k in KEYS}

def cfg_rev():
    """Short fingerprint of the shared settings. The dashboard sends the one it last saw; if it differs, someone else (Buddy, the corner pop-up,
    the maintenance loop) changed things meanwhile and the dashboard's save is MERGED instead of overwriting."""
    with lock:
        sub = _subset(); r = hashlib.md5(json.dumps(sub, sort_keys=True, default=str).encode('utf8', 'ignore')).hexdigest()[:12]
        if r not in REVS:
            REVS[r] = copy.deepcopy(sub)
            while len(REVS) > 12: REVS.popitem(last=False)
    return r

def _idk(x): return str(x.get('id')) if isinstance(x, dict) and 'id' in x else None

def merge3(base, mine, theirs):
    """Three-way merge. base = what the dashboard last saw, mine = what it wants to save, theirs = what the server has now.
    Whatever the dashboard did not change stays as the server has it; what it changed wins. Lists of {id} items merge item by item and field by field."""
    if mine == base: return copy.deepcopy(theirs)
    if theirs == base: return copy.deepcopy(mine)
    if isinstance(mine, dict) and isinstance(theirs, dict) and isinstance(base, dict):
        out = {}
        for k in set(mine) | set(theirs) | set(base):
            if k in mine and k in theirs: out[k] = merge3(base.get(k), mine[k], theirs[k])
            elif k in mine:                                                              # server removed it
                if k not in base or mine[k] != base.get(k): out[k] = copy.deepcopy(mine[k])
            elif k in theirs:                                                            # dashboard removed it
                if k not in base or theirs[k] != base.get(k): out[k] = copy.deepcopy(theirs[k])
        return out
    if all(isinstance(L, list) for L in (mine, theirs, base)) and all(_idk(x) is not None for L in (mine, theirs, base) for x in L) and (mine or theirs):
        bm, mm, tm = ({_idk(x): x for x in L} for L in (base, mine, theirs)); out = []; seen = set()
        for x in theirs + mine:
            i = _idk(x)
            if i in seen: continue
            seen.add(i)
            if i in mm and i in tm: out.append(merge3(bm.get(i, {}), mm[i], tm[i]) if i in bm else mm[i])
            elif i in mm:
                if i not in bm: out.append(mm[i])                                         # new in the dashboard
                elif mm[i] != bm[i]: out.append(mm[i])                                    # changed in the dashboard, deleted elsewhere: keep the change
            else:
                if i not in bm or tm[i] != bm[i]: out.append(tm[i])                       # new on the server (or edited there while the dashboard deleted it)
        return out
    return copy.deepcopy(mine)                                                           # both changed the same plain value: the dashboard (latest action) wins

@web.get('/api/cfg')
def get_cfg():
    out = {k: data[k] for k in KEYS}; out['_rev'] = cfg_rev(); out['auto'] = auto_public()
    return jsonify(out)

@web.post('/api/cfg')
def set_cfg():
    c = request.get_json() or {}; base_rev = c.pop('_base', None); merged = False
    with lock:
        old = {k: json.loads(json.dumps(data.get(k))) for k in ('exams', 'tasks')}
    cur_rev = cfg_rev()
    with lock:
        mine = {k: c[k] for k in KEYS if k in c}
        if base_rev and base_rev != cur_rev and base_rev in REVS:
            base = REVS[base_rev]; theirs = _subset(); merged = True
            data.update({k: merge3(base.get(k), mine[k], theirs.get(k)) for k in mine})
        else:
            data.update(mine)
        links.normalize(data)
    mins = link_minutes(True)
    with lock: links.sync_progress(data, mins)
    save()
    try: buddy.sync_progress(True)
    except Exception as e: print('progress sync failed:', e)
    try: buddy.on_cfg_change(old, {k: data.get(k) or [] for k in ('exams', 'tasks')})
    except Exception as e: print('buddy cfg hook failed:', e)
    return jsonify(ok=True, rev=cfg_rev(), merged=merged)

@web.get('/api/ics')
def ics():
    u = request.args.get('url', '')
    if not u.startswith('https://'): return 'bad url', 400
    try:
        req = urllib.request.Request(u, headers={'User-Agent': 'RizeBuddy'})
        return urllib.request.urlopen(req, timeout=15).read().decode('utf8', 'replace'), 200, {'Content-Type': 'text/plain'}
    except Exception as e: return str(e), 502

@web.get('/api/version')
def version(): return jsonify(v=VERSION)

@web.post('/api/quit')
def quit_api():
    if request.headers.get('X-Rize') != '1': return 'no', 403
    threading.Timer(0.3, lambda: (save(), os._exit(0))).start(); return jsonify(ok=True)

@web.after_request
def nocache(r): r.headers['Cache-Control'] = 'no-store'; return r

@web.post('/api/pause')
def pause_api():
    if request.headers.get('X-Rize') != '1': return 'no', 403
    set_pause(float((request.get_json(silent=True) or {}).get('minutes', 0))); return jsonify(ok=True)

@web.post('/api/resume')
def resume_api():
    if request.headers.get('X-Rize') != '1': return 'no', 403
    resume(); return jsonify(ok=True)

@web.post('/api/purge')
def purge_api():
    """Delete recorded history. Body: {all:true} | {since:ms} | {match:'text'} | {ids:[...], keys:[...]}."""
    global cur
    if request.headers.get('X-Rize') != '1': return 'no', 403
    b = request.get_json(silent=True) or {}
    with lock:
        n0 = len(data['sessions'])
        if b.get('all'):
            data['sessions'] = []
            for k in ('v', 'va'): data[k] = {x: y for x, y in data[k].items() if not x.startswith(('web:', 'yt:'))}
        elif b.get('since') is not None:
            data['sessions'] = [s for s in data['sessions'] if s['start'] < float(b['since'])]
        elif b.get('match'):
            m = str(b['match']).lower()
            data['sessions'] = [s for s in data['sessions'] if m not in f"{s['app']} {s['title']}".lower()]
            for k in ('v', 'va'): data[k] = {x: y for x, y in data[k].items() if m not in x.lower()}
        elif b.get('ids') is not None:
            ids = set(b['ids']); data['sessions'] = [s for s in data['sessions'] if s['id'] not in ids]
            for k in ('v', 'va'): data[k] = {x: y for x, y in data[k].items() if x not in set(b.get('keys', []))}
        cur = None; removed = n0 - len(data['sessions']); autorev.sync(data)
    save(); return jsonify(ok=True, removed=removed)

@web.post('/api/reset')
def reset_api():
    """Delete ALL data: the app starts from scratch and every first-run question is asked again."""
    global cur, now
    if request.headers.get('X-Rize') != '1': return 'no', 403
    b = request.get_json(silent=True) or {}
    if b.get('confirm') != 'DELETE': return jsonify(ok=False), 400
    keys = buddy.st().get('keys', []) if b.get('keepKeys', True) else []
    with lock:
        keep = {k: data.get(k) for k in ('autostart', 'autoInit', 'autoOpen')}
        data.clear(); data.update(copy.deepcopy(DEFAULT)); data.update(keep); cur = now = None
    buddy.after_reset(keys); store.wipe_backups(); save(allow_empty=True); return jsonify(ok=True)

def _merge(a, b):
    """Merge b into a: lists of {id} objects are united by id (b wins), dicts merge recursively, other lists are united, scalars only fill gaps."""
    if isinstance(a, dict) and isinstance(b, dict):
        for k, v in b.items(): a[k] = _merge(a[k], v) if k in a else v
        return a
    if isinstance(a, list) and isinstance(b, list):
        if all(isinstance(x, dict) and 'id' in x for x in a + b) and (a or b):
            idx = {x['id']: i for i, x in enumerate(a)}
            for x in b:
                if x['id'] in idx: a[idx[x['id']]] = x
                else: a.append(x)
            return a
        return a + [x for x in b if x not in a]
    return a

@web.get('/api/export')
def export_api():
    """?part=all (default) or part=exams,tasks ; keys=1 includes API keys."""
    parts = [p for p in request.args.get('part', 'all').split(',') if p]
    with lock:
        full = copy.deepcopy(data)
    if not int(request.args.get('keys', '0')): full.get('buddy', {}).pop('keys', None)
    body = full if parts == ['all'] else {k: full.get(k, []) for k in parts if k in ('exams', 'tasks', 'projects', 'clients', 'areas', 'entries')}
    out = json.dumps({'app': 'rize-buddy', 'format': 2, 'part': parts, 'exported': int(time.time() * 1000), 'data': body})
    return out, 200, {'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename=rize-buddy-' + '-'.join(parts) + '.json'}

@web.post('/api/import')
def import_api():
    """Body: {payload:{app,data}, mode:'replace'|'merge'}. Only the keys present in the file are touched."""
    global cur
    if request.headers.get('X-Rize') != '1': return 'no', 403
    b = request.get_json(silent=True) or {}; pl = b.get('payload') or {}
    d = pl.get('data') if pl.get('app') == 'rize-buddy' else None
    if not isinstance(d, dict): return jsonify(ok=False, err='This is not a Rize Buddy export file'), 400
    d.pop('pausedUntil', None)
    store.snapshot_now(data, lock)                                           # undo point: Settings > Backups
    with lock:
        if b.get('mode') == 'replace':
            keys = data.get('buddy', {}).get('keys', [])
            for k, v in d.items(): data[k] = v
            if 'buddy' in d and 'keys' not in d['buddy']: data['buddy']['keys'] = keys
        else:
            for k, v in d.items(): data[k] = _merge(data[k], v) if k in data else v
        cur = None
    buddy.st(); buddy.migrate_goals()
    with lock: links.normalize(data)
    save(); return jsonify(ok=True, keys=list(d.keys()))

@web.get('/api/autostart')
def auto_get(): return jsonify(on=bool(data.get('autostart')))

@web.get('/api/autoopen')
def autoopen_get(): return jsonify(on=bool(data.get('autoOpen', True)))

@web.post('/api/autoopen')
def autoopen_set():
    if request.headers.get('X-Rize') != '1': return 'no', 403
    data['autoOpen'] = bool((request.get_json(silent=True) or {}).get('on')); save()
    return jsonify(ok=True, on=data['autoOpen'])

@web.post('/api/autostart')
def auto_set():
    if request.headers.get('X-Rize') != '1': return 'no', 403
    on = bool((request.get_json(silent=True) or {}).get('on'))
    ok, err = apply_autostart(on)
    if ok: data['autostart'] = on; save()
    return jsonify(ok=ok, on=bool(data.get('autostart')), err=err)

@web.get('/api/focus')
def focus_api():
    days = min(120, max(7, int(request.args.get('days', 30))))
    with lock: rpt = focus.report(data, s_ok, days)
    live, best, goal = streak_now()
    return jsonify(goal=goal, gap=focus.F(data).get('gap', 5), live=live, best=best, days=rpt, log=focus.F(data)['log'][-60:])

@web.post('/api/curgoal')
def curgoal_api():
    c = request.get_json(silent=True) or {}
    if (c.get('id') or c.get('name')) and not str(c.get('id', '')).startswith('g:'): return jsonify(error='Goals must be an exam, exam topic or task'), 400
    g = focus.set_goal(data, c.get('id', ''), c.get('name', ''), c.get('kind', '')); save(); return jsonify(goal=g)

@web.get('/api/goal/options')
def goal_options(): return jsonify(focus.options(data))

@web.get('/api/goal/history')
def goal_history():
    """Current goal + every previous current goal with time spent, last used and whether it is finished."""
    since = time.time() * 1000 - 90 * 86400000; m = {}
    for x in focus.F(data)['log']:
        k = x['id'] or x['name']
        if k: m[k] = {'id': x['id'], 'name': x['name'], 'kind': x.get('kind', ''), 'last': x['t'], 'min': 0}
    with lock: L = [s for s in data['sessions'] if s['end'] >= since]
    for s in L:
        if s_ok(s):
            g = focus.goal_at(data, s['start']); k = g['id'] or g['name']
            if k in m: m[k]['min'] += (s['end'] - s['start']) / 6e4
    cur = focus.F(data)['goal']; ck = cur.get('id') or cur.get('name')
    out = []
    for k, v in m.items():
        v['min'] = round(v['min']); v['status'] = 'active' if k == ck else 'done' if focus.finished(data, v['id']) else 'previous'; out.append(v)
    out.sort(key=lambda v: (v['status'] != 'active', -v['last']))
    return jsonify(current=cur, items=out[:40])

@web.post('/api/chapter')
def chapter_api():
    c = request.get_json(silent=True) or {}
    with lock:
        for e in data.get('exams', []):
            for ch in e.get('ch', []):
                if ch.get('id') == c.get('id'): ch['p'] = max(0, min(100, int(c.get('p', 0))))
        links.sync_progress(data, MINS['m'])                                 # re-base now: your value is the new starting point for the linked tasks
    save(); return jsonify(ok=True)

# ---------- links: minutes per task / chapter / exam (one source of truth for Buddy and the dashboard) ----------
MINS = {'t': 0.0, 'm': {}}

def link_minutes(force=False):
    if force or time.time() - MINS['t'] > 40:
        with lock: sess = list(data['sessions'][-80000:])
        try: MINS['m'] = links.minutes(data, sess, cat_py, skey); MINS['t'] = time.time()
        except Exception as e: store.log('link minutes failed', repr(e))
    return MINS['m']

@web.get('/api/links/minutes')
def links_minutes(): return jsonify(link_minutes())

# ---------- live review + progress map ----------
@web.get('/api/review/now')
def review_now_api():
    """What you are doing right now + the last 2 productive and last 2 unproductive things before it (each can be corrected in one tap)."""
    with lock: sess = list(data['sessions'][-4000:])
    return jsonify(progress.review_now(data, sess, now, cat_py, skey, nice, s_ok, lambda k: autorev.is_auto(data, k), meta=meta))

@web.post('/api/review/set')
def review_set():
    """One-tap correction from the live review: {key, c: f|b|m|o}. Works for sites, apps and videos; teaches auto-review."""
    if request.headers.get('X-Rize') != '1': return 'no', 403
    b = request.get_json(silent=True) or {}; k, c = str(b.get('key', '')), b.get('c')
    if not k or k == 'yt:shorts' or c not in ('f', 'b', 'm', 'o'): return jsonify(ok=False), 400
    with lock: data['v'][k] = c; autorev.feedback(data, k, 'set', c)
    save(); buddy.REV['t'] = 0; return jsonify(ok=True, rev=cfg_rev())

@web.get('/api/progress')
def progress_api():
    """Exam -> chapter -> task tree with progress, minutes and the sites / apps that feed each, plus how much productive time is not linked yet."""
    mins = link_minutes()
    with lock: sess = list(data['sessions'][-60000:])
    return jsonify(progress.progress_tree(data, mins, sess, cat_py, skey, nice))

# ---------- auto-review ----------
def auto_public():
    a = autorev.A(data)
    try: cov = autorev.coverage(data, skey, reviewable)
    except Exception: cov = {}
    return {'on': a.get('on', True), 'adv': data.get('autoAdvance', True), 'items': {k: {'c': x['c'], 'conf': x.get('conf'), 'why': x.get('why', ''), 'links': x.get('links', []), 'lwhy': x.get('lwhy', ''), 'linkOnly': bool(x.get('linkOnly'))} for k, x in a['items'].items()},
            'sug': a['sug'], 'cov': cov}

@web.get('/api/auto/status')
def auto_status(): return jsonify(auto_public())

AUTO_RUN = threading.Lock()

def auto_pass():
    if not AUTO_RUN.acquire(blocking=False): return {}
    try:
        r = autorev.run(data, lock, skey, disp, reviewable)
        if r.get('applied') or r.get('suggested'): buddy.REV['t'] = 0       # Buddy's own "new site" list refreshes
        save(); return r
    finally: AUTO_RUN.release()

@web.post('/api/auto/run')
def auto_run_api():
    if request.headers.get('X-Rize') != '1': return 'no', 403
    return jsonify(ok=True, **auto_pass(), status=auto_public())

@web.post('/api/auto/feedback')
def auto_feedback():
    """Body: {key, op: set|unlink|accept|reject|acceptall, c}. The dashboard / Buddy tell auto-review when the student confirms or corrects it."""
    if request.headers.get('X-Rize') != '1': return 'no', 403
    b = request.get_json(silent=True) or {}
    with lock: n = autorev.feedback(data, b.get('key', ''), b.get('op', 'set'), b.get('c'))
    save(); buddy.REV['t'] = 0; return jsonify(ok=True, n=n, status=auto_public(), rev=cfg_rev())

@web.post('/api/auto/toggle')
def auto_toggle():
    if request.headers.get('X-Rize') != '1': return 'no', 403
    b = request.get_json(silent=True) or {}
    with lock:
        if 'on' in b: autorev.A(data)['on'] = bool(b['on'])
        if 'adv' in b: data['autoAdvance'] = bool(b['adv'])
    save(); return jsonify(ok=True, status=auto_public())

# ---------- data safety: backups, restore, health ----------
@web.get('/api/health')
def health():
    return jsonify(ok=store.S['loaded_ok'], note=LOAD['note'], lastSave=int(last_save * 1000), errors=store.S['dirty_err'], source=store.S['source'], dir=DIR, mirror=store.MIRROR,
                   sessions=len(data['sessions']), tasks=len(data.get('tasks', [])), exams=len(data.get('exams', [])))

@web.get('/api/backups')
def backups_list():
    out = []
    for b in store.backups():
        d = store.read_any(b['path']); out.append({'name': b['name'], 'kind': b['kind'], 't': b['t'], 'kb': round(b['size'] / 1024), 'sessions': len((d or {}).get('sessions', [])), 'tasks': len((d or {}).get('tasks', [])), 'exams': len((d or {}).get('exams', [])), 'ok': d is not None})
    return jsonify(items=out[:60], dir=DIR, mirror=store.MIRROR)

@web.post('/api/backups/now')
def backups_now():
    if request.headers.get('X-Rize') != '1': return 'no', 403
    ok = store.snapshot_now(data, lock); save(); return jsonify(ok=ok)

@web.post('/api/backups/restore')
def backups_restore():
    """Restore a snapshot by name. The current data is snapshotted first, so a restore can itself be undone."""
    global cur
    if request.headers.get('X-Rize') != '1': return 'no', 403
    name = (request.get_json(silent=True) or {}).get('name', ''); d = store.restore(name)
    if not d: return jsonify(ok=False, err='That backup could not be read'), 400
    store.snapshot_now(data, lock); keys = (data.get('buddy') or {}).get('keys', [])
    with lock:
        data.clear(); data.update(copy.deepcopy(DEFAULT)); data.update(d); data['pausedUntil'] = 0; cur = None
        b = data.setdefault('buddy', {})
        if not b.get('keys'): b['keys'] = keys                           # the key-less mirror must not wipe the saved API keys
    buddy.st(); buddy.migrate_goals()
    with lock: links.normalize(data)
    store.S['loaded_ok'] = True; save(); return jsonify(ok=True)

@web.post('/api/data/folder')
def data_folder():
    if request.headers.get('X-Rize') != '1': return 'no', 403
    try: os.startfile(DIR)
    except Exception as e: return jsonify(ok=False, err=str(e))
    return jsonify(ok=True)

@web.post('/api/focus/gap')
def gap_api():
    focus.F(data)['gap'] = max(1, min(30, int((request.get_json(silent=True) or {}).get('gap', 5)))); save(); return jsonify(ok=True)

@web.post('/api/peek/pin')
def peek_pin():
    PEEK['pin'] = time.time(); return jsonify(ok=True)

@web.get('/api/peek')
def peek_api():
    live, best, goal = streak_now(); m = work_minutes(); tgt = max(1, data['target'] * 60)
    return jsonify(work=round(m), target=round(tgt), goal=goal, live=live, best=best, rows=buddy.peek_rows(), name=buddy.st()['profile'].get('name', ''))

@web.get('/api/now')
def get_now(): return jsonify({**(now or {}), 'paused': data['pausedUntil'] if paused() else 0, 'speaking': bool(buddy.SPEAK['on']),
                               'nav': {'seq': NAVREQ['seq'], 'page': NAVREQ['page'], 'age': round(time.time() - NAVREQ['t']) if NAVREQ['t'] else 9999}})

@web.get('/api/nav/ranks')
def nav_ranks():
    """Dashboard pages, most opened first (ties keep the dashboard's own menu order)."""
    c = data.get('navViews') or {}; order = {p[0]: i for i, p in enumerate(PAGES)}
    return jsonify([{'id': p[0], 'icon': p[1], 'name': p[2], 'views': c.get(p[0], 0)} for p in sorted(PAGES, key=lambda p: (-c.get(p[0], 0), order[p[0]]))])

@web.post('/api/nav/view')
def nav_view():
    if request.headers.get('X-Rize') != '1': return 'no', 403
    pg = (request.get_json(silent=True) or {}).get('page', '')
    if pg not in PAGE_IDS: return jsonify(ok=False), 400
    with lock: v = data.setdefault('navViews', {}); v[pg] = v.get(pg, 0) + 1
    save(); return jsonify(ok=True)

@web.post('/api/dash/open')
def dash_open():
    if request.headers.get('X-Rize') != '1': return 'no', 403
    open_ui(page=(request.get_json(silent=True) or {}).get('page', '')); return jsonify(ok=True)


def widget():
    """Always-on-top floating widget: current activity, work vs goal, pomodoro. Drag to move, right-click hides, double-click opens the dashboard."""
    try:
        import tkinter as tk
        root = tk.Tk(); root.overrideredirect(True); root.attributes('-topmost', True); root.attributes('-alpha', 0.96); root.configure(bg='#161920')
        global WIDGET_OK; W, Hh = 300, 104; root.geometry(f'{W}x{Hh}+{root.winfo_screenwidth() - W - 24}+{root.winfo_screenheight() - Hh - 64}')
        lab = lambda size, fg, bold=False: tk.Label(root, bg='#161920', fg=fg, anchor='w', font=('Segoe UI', size, 'bold' if bold else 'normal'))
        a, b, c = lab(9, '#94A3B8'), lab(15, '#E6E8EE', True), lab(9, '#6366F1')
        for w_ in (a, b, c): w_.pack(fill='x', padx=12, pady=(5, 0))
        cv = tk.Canvas(root, height=6, bg='#1E293B', highlightthickness=0); cv.pack(fill='x', padx=12, pady=(6, 0))
        pos = {}
        def down(e): pos['x'], pos['y'] = e.x_root - root.winfo_x(), e.y_root - root.winfo_y()
        def move(e): root.geometry(f"+{e.x_root - pos['x']}+{e.y_root - pos['y']}")
        for w_ in (root, a, b, c, cv):
            w_.bind('<Button-1>', down); w_.bind('<B1-Motion>', move); w_.bind('<Double-Button-1>', lambda e: open_ui()); w_.bind('<Button-3>', lambda e: (data.update(widget=False), save()))
        shown = [True]
        def upd():
            try:
                want = data.get('widget', True)
                if want != shown[0]: (root.deiconify() if want else root.withdraw()); shown[0] = want
                m = work_minutes(); goal = max(1, data['target'] * 60); n = now
                a.config(text=('⏸ Tracking paused' if paused() else f"{n['app']} – {n['title']}"[:46] if n else 'Idle – waiting'))
                b.config(text=f"Work {int(m // 60)}h {int(m % 60):02d}m   {round(m / goal * 100)}% of goal")
                p = data.get('pomo')
                if p and p.get('running'):
                    left = max(0, p['endAt'] / 1000 - time.time()); c.config(text=f"⏱ {int(left // 60):02d}:{int(left % 60):02d}  {'focus' if p.get('mode') == 'focus' else 'break'}")
                else: c.config(text='Timer idle – press P in the dashboard')
                cv.delete('all'); cv.create_rectangle(0, 0, min(1, m / goal) * (W - 24), 6, fill='#6366F1', width=0)
            except Exception: pass
            root.after(1000, upd)
        WIDGET_OK = True
        def show_alert(msg):
            top = tk.Toplevel(root); top.title('Rize – off-task alert'); top.attributes('-topmost', True); top.configure(bg='#161920'); top.resizable(False, False)
            sw, sh = root.winfo_screenwidth(), root.winfo_screenheight(); top.geometry(f'400x180+{(sw - 400) // 2}+{(sh - 180) // 2}')
            tk.Label(top, text='⏰  Off-task alert', bg='#161920', fg='#F43F5E', font=('Segoe UI', 14, 'bold')).pack(pady=(16, 4))
            tk.Label(top, text=msg, bg='#161920', fg='#E6E8EE', font=('Segoe UI', 10), wraplength=360).pack(pady=4)
            row = tk.Frame(top, bg='#161920'); row.pack(pady=14)
            def snooze(): ALERT['next'] = time.time() + 600; top.destroy()
            for txt, cmd, bg in (("I'm back", top.destroy, '#6366F1'), ('Snooze 10 min', snooze, '#1b1f29'), ('Open Rize', lambda: (open_ui(), top.destroy()), '#1b1f29')):
                tk.Button(row, text=txt, command=cmd, bg=bg, fg='white', relief='flat', padx=12, pady=5, font=('Segoe UI', 10, 'bold')).pack(side='left', padx=5)
            top.lift(); top.focus_force()
        def poll():
            try:
                while True: show_alert(ALERTQ.get_nowait())
            except queue.Empty: pass
            root.after(1500, poll)
        poll(); upd(); root.mainloop()
    except Exception as e: print('widget unavailable:', e)

def set_autostart(on):
    import winreg
    k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\CurrentVersion\Run', 0, winreg.KEY_SET_VALUE)
    if on:
        exe = f'"{sys.executable}"' if getattr(sys, 'frozen', False) else f'"{sys.executable.replace("python.exe", "pythonw.exe")}" "{os.path.abspath(__file__)}"'
        winreg.SetValueEx(k, 'RizeBuddy', 0, winreg.REG_SZ, exe + ' --startup')   # --startup: tray + (if enabled) Buddy opens by itself after login
    else:
        try: winreg.DeleteValue(k, 'RizeBuddy')
        except FileNotFoundError: pass

def apply_autostart(on):
    """Register / remove the Windows login entry. Returns (ok, error)."""
    try: set_autostart(on); return True, ''
    except Exception as e: return False, str(e)

def running():
    try: urllib.request.urlopen(URL + '/api/now', timeout=1); return True
    except Exception: return False

PAGES = [('dash', '\u25A6', 'Dashboard'), ('over', '\u25E7', 'Overview'), ('cal', '\u25A4', 'Calendar'), ('timer', '\u23F1', 'Timer'), ('act', '\u25D4', 'Review'), ('yt', '\u25B6', 'YouTube'),
         ('prod', '\u2197', 'Productivity'), ('streak', '\U0001F525', 'Streaks'), ('rep', '\u2263', 'Reports'), ('dist', '\u26A0', 'Distractions'), ('proj', '\u25C8', 'Projects'),
         ('cli', '\u263A', 'Clients'), ('area', '\u25D0', 'Areas'), ('task', '\u2611', 'Tasks'), ('exam', '\U0001F393', 'Exams'), ('prof', '\u20AC', 'Profitability'),
         ('priv', '\U0001F512', 'Privacy'), ('set', '\u2699', 'Settings')]       # same ids as the dashboard's own menu
PAGE_IDS = {p[0] for p in PAGES}
NAVREQ = {'seq': 0, 'page': '', 't': 0}      # "go to this page" request for a dashboard window that is already open
UI_SPAWN = {'t': 0}

def open_ui(*a, page=''):
    """Open the dashboard (optionally straight on one page). If its window already exists it is raised and told to switch page."""
    if page not in PAGE_IDS: page = ''
    h = find_win('Rize Buddy')
    if h or time.time() - UI_SPAWN['t'] < 12:                       # open, or still loading
        if page: NAVREQ.update(seq=NAVREQ['seq'] + 1, page=page, t=time.time())
        if h: raise_win(h)
        return
    UI_SPAWN['t'] = time.time()
    url = URL + ('/#' + page if page else '')
    # Edge "app mode": a chrome-less window with its own taskbar button
    for p in (r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'):
        if os.path.exists(p):
            subprocess.Popen([p, f'--app={url}', '--window-size=1360,860', f'--user-data-dir={os.path.join(DIR, "edge")}', '--no-first-run']); set_win_icon('Rize Buddy', 'r'); return
    webbrowser.open(url)

def maintain():
    """Background housekeeping every 30 s: repair links, let task / chapter progress follow the work, move the current goal on when it is finished,
    run auto-review (every ~2 min). Runs on its own thread so the tracker loop never waits for it."""
    last_auto = 0.0; last_beat = 0.0; time.sleep(8)
    while True:
        try:
            if time.time() - last_beat > 60: last_beat = time.time(); buddy.beat();
            with lock: ch = links.normalize(data)
            mins = link_minutes(True)
            with lock: ch = links.sync_progress(data, mins) or ch
            def _plan(): return algo.plan(data.get('exams', []), data.get('tasks', []))      # called while the lock is held by housekeeping
            if data.get('autoAdvance', True):
                with lock: r = links.housekeeping(data, focus, _plan)
                if r: ch = True; buddy.on_goal_finished(r)
            if time.time() - last_auto > 120 and autorev.A(data).get('on', True):
                last_auto = time.time(); auto_pass()
            if ch: save()
        except Exception as e:
            store.log('maintain failed', repr(e))
        time.sleep(30)

def main():
    if running():          # already running: same version -> just show it; older version -> ask it to quit and take over
        try: v = json.load(urllib.request.urlopen(URL + '/api/version', timeout=1)).get('v')
        except Exception: v = None
        if v == VERSION: open_buddy(); return
        try: urllib.request.urlopen(urllib.request.Request(URL + '/api/quit', method='POST', headers={'X-Rize': '1'}), timeout=2)
        except Exception: pass
        time.sleep(1.5)
        if running(): open_buddy(); return
    load(); data['pausedUntil'] = 0
    with lock: links.normalize(data); autorev.A(data)
    store.install_exit_hooks(lambda: (buddy.beat(), store.save(data, lock)))                  # last save when Windows shuts down / restarts / logs off
    if not data.get('autoInit'): data['autoInit'] = True; data['autostart'] = True   # first run: start with Windows by default
    if os.name == 'nt': apply_autostart(bool(data.get('autostart')))               # also refreshes the path if the exe was moved
    save()
    buddy.init(data, lock, save, work_minutes, offtask_minutes, lambda: now, open_buddy, idle_ok, snooze, streak_now, open_peek, win_open=buddy_open, stretch=work_stretch, notify=tray_notify, stats=stats_today, quiet=quiet_now, guard=streak_guard, sites=site_stats, away=away_report, review=review_site, prod=productive_now)
    buddy.H['mins'] = link_minutes; buddy.H['skey'] = skey; buddy.H['reviewable'] = reviewable
    buddy.start_gap()                                                          # v15: was the app closed for a while? Buddy will ask what happened
    if LOAD['note']: buddy.on_data_note(LOAD['note'], store.S['source'])
    threading.Thread(target=loop, daemon=True).start()
    threading.Thread(target=maintain, daemon=True).start()
    threading.Thread(target=lambda: web.run('127.0.0.1', PORT), daemon=True).start()
    openui = open_ui
    def toggle(icon, item):
        ok, _ = apply_autostart(not data['autostart'])
        if ok: data['autostart'] = not data['autostart']; save()
    def toggle_open(icon, item):
        data['autoOpen'] = not data.get('autoOpen', True); save()
    def quit_(icon, item):
        buddy.beat(); save(); store.snapshot_now(data, lock); icon.stop(); os._exit(0)
    img = make_icon(64)
    def toggle_pause(icon, item):
        resume() if paused() else set_pause(data.get('pauseMin', 30))
    menu = pystray.Menu(pystray.MenuItem('Quick look', lambda i, it: open_peek(), default=True),
                        pystray.MenuItem('Open dashboard', openui),
                        pystray.MenuItem('Talk to Buddy', lambda i, it: open_buddy()),
                        pystray.MenuItem(lambda it: 'Resume tracking' if paused() else (f"Pause tracking ({data.get('pauseMin', 30)} min)" if data.get('pauseMin', 30) else 'Pause tracking'), toggle_pause),
                        pystray.MenuItem('Start with Windows', toggle, checked=lambda i: data['autostart']),
                        pystray.MenuItem('Open Buddy when the PC starts', toggle_open, checked=lambda i: data.get('autoOpen', True)),
                        pystray.MenuItem('Quit', quit_))
    if '--startup' in sys.argv:                                  # started by Windows at login: open Buddy by itself (unless switched off)
        if data.get('autoOpen', True):
            def _login_open():
                for _ in range(40):                              # wait until the desktop and the local server are ready (max ~2 min)
                    time.sleep(3)
                    if running(): break
                time.sleep(2)
                try: open_buddy()
                except Exception as e: store.log('login open failed', repr(e))
            threading.Thread(target=_login_open, daemon=True).start()
    elif '--hidden' not in sys.argv: open_buddy()
    global TRAY
    TRAY = pystray.Icon('RizeBuddy', img, 'Rize Buddy – tracking', menu); TRAY.run()

if ANDROID:
    import droid; droid.install(sys.modules[__name__])      # replaces the Windows window / tray / popup functions

if __name__ == '__main__':
    if '--browser' in sys.argv:                                      # the integrated browser window runs as its own process
        i = sys.argv.index('--browser'); import browser_host; browser_host.run(int(sys.argv[i + 1]), sys.argv[i + 2]); sys.exit(0)
    main()
