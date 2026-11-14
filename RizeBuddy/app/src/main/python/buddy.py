"""Buddy - a warm AI study companion for Rize Buddy.

Talks to OpenRouter's FREE models. Several API keys can be saved; when one is out of
quota / rejected the next one is used automatically (same for models).
Everything the student says or sets (goals, landmarks, mood, chat) is saved to
%APPDATA%\\RizeBuddy\\rize-data.json under the "buddy" key.
"""
import focus, algo, links, autorev, smart
import timer as tmr, reminders as rmd
import datetime, json, os, random, re, shutil, subprocess, sys, threading, time, urllib.error, urllib.request
from flask import Blueprint, Response, jsonify, request

API = 'https://openrouter.ai/api/v1'
GROQ = 'https://api.groq.com/openai/v1'                                   # keys starting with gsk_ go here (same OpenAI-style request, other URL + models)
GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
DEFAULT_MODELS = ['deepseek/deepseek-v4-flash:free', 'meta-llama/llama-3.3-70b-instruct:free', 'openrouter/free']
BAD_WORDS = re.compile(r'embed|rerank|guard|safety|coder|-vl|vision|image|audio|thinking|reason|-r1', re.I)
GOOD_WORDS = ('deepseek', 'llama-3.3', 'llama-4', 'gemma', 'qwen', 'mistral', 'nemotron')
CRISIS = re.compile(r"kill myself|suicid|end (it|my life)|want to die|don'?t want to (live|be here)|self[- ]?harm|hurt myself|cut myself|no reason to live", re.I)

bp = Blueprint('buddy', __name__)
H = {}                      # helpers injected by tracker.init()
EVENTS, ELOCK = [], threading.Lock()
SEEN = {'t': 0, 'prompted': '', 'opened': 0, 'start': time.time(), 'peek': time.time(), 'st': 0, 'live': 0, 'ms': 0, 'sd': ''}
DEFAULT_PROMPTS = [
    "Streak milestones (30, 60, 90, 120+ min of unbroken work on the current goal): hype them up for real, say the exact minutes, and invite one more block. Never let a big streak pass without a shout-out.",
    "When a streak breaks, never shame. Say what they built (minutes), ask what pulled them away, and offer a 5-minute restart on the current goal.",
    "If they are off-task for a while, name the current goal and the nearest deadline, be firm but kind, and give ONE tiny next step (a 10-minute sprint).",
    "If they are working on something productive that is NOT the current goal, appreciate the effort, then ask if the goal changed and offer to switch it.",
    "After about 90 minutes of streak, suggest a short stretch/water break (short breaks do not end the streak).",
    "Within 3 days of an exam or deadline lean on gentle urgency; further away lean on consistency and small wins.",
    "When they say they are done for the day: celebrate their best streak and one concrete win, and ask what tomorrow's first task is.",
]
COOL = {}                   # (key|key+model) -> unix time until which to skip it
DISC = {'t': 0, 'ids': []}  # discovered free models cache


def init(data, lock, save, work_minutes, offtask_minutes, now_fn, open_window, idle_ok, snooze, streak_now, open_peek, win_open=None, stretch=None, notify=None, stats=None, quiet=None, guard=None, sites=None, away=None, review=None, prod=None):
    H.update(prod=prod, data=data, lock=lock, save=save, work=work_minutes, off=offtask_minutes, now=now_fn, open=open_window, idle_ok=idle_ok, snooze=snooze, streak=streak_now, peek=open_peek, win_open=win_open, stretch=stretch, notify=notify, stats=stats, quiet=quiet, guard=guard, sites=sites, away=away, review=review)
    st(); migrate_goals(); sync_progress(); voice_start()
    threading.Thread(target=_bg, daemon=True).start()               # reminders + timer completion (own loop: the tracker loop skips ticks while you look at Buddy)


# ---------------------------------------------------------------- state
def st():
    b = H['data'].setdefault('buddy', {})
    b.setdefault('profile', {})
    p = b['profile']
    for k, v in {'name': '', 'buddyName': 'Sunny', 'grade': 'Class 12', 'lang': 'en-IN', 'voice': True, 'shareApps': True, 'enabled': True,
                 'helpline': 'Tele-MANAS 14416 (India, free, 24x7)', 'peekMin': 0, 'level': 'balanced', 'ttsVoice': '', 'ttsRate': 1.0, 'ttsPitch': 1.0, 'ttsCute': True, 'ttsEngine': 'auto', 'ttsExag': 1.0, 'devSrc': True, 'duck': True, 'theme': 'auto', 'newSiteAsk': True, 'newSiteMin': 20, 'newSiteBatch': 50, 'welcomeMin': 3, 'remindOn': True, 'overdueMin': 30, 'prompts': list(DEFAULT_PROMPTS)}.items():
        p.setdefault(k, v)
    for k, v in {'keys': [], 'models': [], 'days': {}, 'weeks': {}, 'landmarks': [], 'facts': [], 'log': [], 'nudges': {}, 'quotes': [], 'migrated': False}.items():
        b.setdefault(k, v)
    return b


def day_key(t=None):
    return (t or datetime.date.today()).isoformat()


def week_key():
    d = datetime.date.today()
    return (d - datetime.timedelta(days=d.weekday())).isoformat()


def today_rec():
    return st()['days'].setdefault(day_key(), {'mood': '', 'goals': [], 'checkin': False, 'notes': []})


def week_goals():
    return st()['weeks'].setdefault(week_key(), [])


def uid():
    return int(time.time() * 1000) + int.from_bytes(os.urandom(2), 'big') % 1000


def default_dl(scope):
    d = datetime.date.today()
    if scope == 'week': d += datetime.timedelta(days=6 - d.weekday())
    return d.isoformat() + 'T23:59'


def add_landmark(name, date, note=''):
    b = st(); name = (name or '').strip()[:120]
    try: datetime.date.fromisoformat(str(date)[:10])
    except Exception: return False
    if not name or any(x['name'].lower() == name.lower() and x['date'] == str(date)[:10] for x in b['landmarks']): return False
    b['landmarks'].append({'id': uid(), 'name': name, 'date': str(date)[:10], 'note': note[:200]})
    return True


def landmarks_upcoming(limit=8):
    b, out, today = st(), [], datetime.date.today()
    for x in b['landmarks']:
        try: d = datetime.date.fromisoformat(x['date'])
        except Exception: continue
        if d >= today: out.append({**x, 'days': (d - today).days})
    for e in H['data'].get('exams', []):                       # exams added in the dashboard
        try: d = datetime.datetime.fromisoformat(str(e['date']).replace('Z', '+00:00')).astimezone().date()
        except Exception: continue
        if d >= today and not focus.exam_over(e):
            ch = e.get('ch') or []
            prep = round(sum(c.get('p', 0) for c in ch) / len(ch)) if ch else None
            out.append({'id': e.get('id'), 'name': e.get('name', 'Exam'), 'date': d.isoformat(), 'days': (d - today).days, 'prep': prep, 'exam': True,
                        'note': e.get('note', ''), 'ts': smart.ts_of(e.get('date')), 'ch': [c for c in ch if c.get('p', 0) < 100]})
    return sorted(out, key=lambda x: x['days'])[:limit]


def mask(k): return k[:8] + '...' + k[-4:] if len(k) > 14 else '***'


def discover_models():
    if time.time() - DISC['t'] < 6 * 3600 and DISC['ids']: return DISC['ids']
    try:
        r = urllib.request.Request(API + '/models', headers={'User-Agent': 'RizeBuddy'})
        js = json.load(urllib.request.urlopen(r, timeout=12))
        ids = []
        for m in js.get('data', []):
            pr = m.get('pricing') or {}; i = m.get('id', '')
            if not i.endswith(':free') or BAD_WORDS.search(i): continue
            if str(pr.get('prompt', '1')) not in ('0', '0.0') or str(pr.get('completion', '1')) not in ('0', '0.0'): continue
            if 'text' not in (m.get('architecture', {}).get('output_modalities') or ['text']): continue
            ids.append(i)
        ids.sort(key=lambda i: next((n for n, w in enumerate(GOOD_WORDS) if w in i), 99))
        DISC.update(t=time.time(), ids=ids[:6])
    except Exception as e:
        print('model discovery failed:', e); DISC['t'] = time.time() - 5 * 3600
    return DISC['ids']


def model_list(extra=True):
    b = st(); out = []
    for m in b['models'] + DEFAULT_MODELS + (discover_models() if extra else []):
        if m and m not in out: out.append(m)
    return out[:7]


def parse_data(txt):
    m = re.search(r'#DATA\s*(\{.*\})\s*$', txt, re.S)
    if not m: return txt.strip(), None
    try: d = json.loads(m.group(1))
    except Exception: d = None
    return txt[:m.start()].strip(), d


def speak_server(text):
    if os.name != 'nt': return
    t = re.sub(r"[^\w\s.,!?'\-:;]", ' ', text)[:420].replace("'", "''")
    ps = f"Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak('{t}')"
    subprocess.Popen(['powershell', '-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], creationflags=0x08000000)


SPEAK = {'on': False, 'paused': False, 't': 0, 'dash': 0}
GATE = {'t': 0}
LEVELS = {'quiet': (45, 4), 'balanced': (20, 8), 'chatty': (10, 14)}      # (min minutes between pop-ups, max pop-ups a day)
AI_BUDGET_TOKENS = 1300
AI_EVENT_SHARE = 0.10                                                     # 10 % of automatic messages may use the AI, the rest is algorithm


# ---------------------------------------------------------------- goals now live in Tasks (goals come from exams or tasks only)
def migrate_goals():
    """One-time: old free-text day/week goals become normal tasks (scope day/week) so they can be picked as the current goal."""
    b = st()
    if b.get('migrated'): return
    tasks = H['data'].setdefault('tasks', [])
    wk = b['weeks'].get(week_key(), [])
    for day, rec in b['days'].items():
        for g in rec.get('goals', []):
            if day == day_key() and not g.get('done'): add_task(g['t'], 'day', g.get('dl', ''), g.get('p', 0))
        rec['goals'] = []
    for g in wk:
        if not g.get('done'): add_task(g['t'], 'week', g.get('dl', ''), g.get('p', 0))
    b['weeks'] = {}; b['migrated'] = True


def norm_dl(dl, scope):
    try: return datetime.datetime.fromisoformat(dl).strftime('%Y-%m-%dT%H:%M') if dl else default_dl(scope)
    except Exception: return default_dl(scope)


def set_link(t, val):
    """Link a task to an exam topic (value = chapter id) or to a whole exam ('e:<exam id>'); '' removes the link for good (never auto-linked again)."""
    val = '' if val is None else val
    if val == '' or val == '-': t.pop('chap', None); t.pop('exam', None); t.pop('autoChap', None); t['nolink'] = True; return
    t.pop('autoChap', None); t.pop('nolink', None)
    if isinstance(val, str) and val.startswith('e:'):
        ex = val[2:]; t.pop('chap', None); t['exam'] = int(ex) if ex.isdigit() else ex
    else: t['chap'] = val; t.pop('exam', None)


def add_task(text, scope='day', dl='', p=0, chap='', est=0, start='', mid=None, ov=None, remind=False):
    text = (text or '').strip()[:200]
    tasks = H['data'].setdefault('tasks', [])
    if not text: return False
    same = next((t for t in tasks if (t.get('title') or '').lower() == text.lower() and not t.get('done')), None)
    if same is not None:                                                     # already there: apply what is new (chapter / estimate) instead of dropping it
        if chap not in ('', None) and same.get('chap') in (None, '') and same.get('exam') in (None, ''): set_link(same, chap)
        if est and not same.get('est'): same['est'] = est
        return False
    dl = norm_dl(dl, scope)
    t = {'id': uid(), 'title': text, 'project': '', 'done': False, 'scope': scope, 'dl': dl, 'p': p}
    if chap not in ('', None): set_link(t, chap)
    if est: t['est'] = est
    ranks = [x['rank'] for x in tasks if not x.get('done') and isinstance(x.get('rank'), int)]
    t['rank'] = (max(ranks) if ranks else 0) + 1                             # a new goal starts at the bottom of YOUR priority list
    if start or mid or remind:
        ok, _ = rmd.plan(t, start or '', mid or [], st()['profile'].get('overdueMin', 30) if ov is None else ov)
        if not ok: rmd.plan(t, '', [], st()['profile'].get('overdueMin', 30))          # bad times: keep at least the deadline + overdue reminders
    tasks.append(t)
    return True


def exam_name(eid):
    for e in H['data'].get('exams', []):
        if str(e.get('id')) == str(eid): return e.get('name', '')
    return ''


def chap_name(cid):
    for e in H['data'].get('exams', []):
        for c in e.get('ch', []):
            if str(c.get('id')) == str(cid): return c.get('name', '')
    return ''


def _mins():
    try: return H['mins']() if H.get('mins') else {}
    except Exception: return {}


def _task_row(t, mins=None):
    mins = _mins() if mins is None else mins
    return {'id': t['id'], 't': t.get('title', ''), 'done': bool(t.get('done')), 'p': t.get('p', 0), 'dl': t.get('dl', ''), 'chap': ('e:%s' % t['exam']) if t.get('exam') not in (None, '') else t.get('chap', ''),
            'chapName': chap_name(t.get('chap')) if t.get('chap') else ('🎓 ' + exam_name(t.get('exam'))) if t.get('exam') not in (None, '') else '',
            'est': t.get('est') or 0, 'spent': round(mins.get('g:task:%s' % t['id'], 0)), 'autoChap': bool(t.get('autoChap')), 'auto': bool(t.get('est')) and not t.get('done'),
            'rank': t.get('rank') if not t.get('done') else None, 'rm': rmd.summary(t)}


def _tid(t): return t.get('id') if isinstance(t.get('id'), (int, float)) else 0


def fix_ranks():
    """Every open goal has a unique priority rank (1 = most important). True if something had to be fixed (so it gets saved)."""
    tasks = H['data'].setdefault('tasks', []); before = [(t.get('id'), t.get('rank')) for t in tasks]
    algo.normalize_task_ranks(tasks)
    return before != [(t.get('id'), t.get('rank')) for t in tasks]


def scoped(scope):
    mins = _mins()
    rows = [t for t in H['data'].get('tasks', []) if t.get('scope') == scope and (not t.get('done') or t.get('doneDay') == day_key())]
    rows.sort(key=lambda t: (bool(t.get('done')), algo._rk(t), _tid(t)))        # your priority order, finished ones last
    return [_task_row(t, mins) for t in rows]


def _ms(iso):
    try: return datetime.datetime.fromisoformat(iso).timestamp() * 1000
    except Exception: return None


def peek_rows(limit=4):
    """Open tasks + chapter deadlines for the corner pop-up."""
    rows = []
    for t in H['data'].get('tasks', []):
        if t.get('done'): continue
        sc = t.get('scope')
        rows.append({'t': t.get('title', ''), 'dl': _ms(t.get('dl', '')), 'p': t.get('p', 0), 'k': {'day': 'Today', 'week': 'Week'}.get(sc, 'Task'), 'src': 'g', 'id': t['id'], 'scope': sc or 'day', 'rk': t.get('rank')})
    for e in H['data'].get('exams', []):
        if focus.exam_over(e): continue
        for c in e.get('ch', []):
            if c.get('p', 0) < 100: rows.append({'t': c.get('name', ''), 'dl': _ms(str(c.get('dl', '')) + 'T23:59') if c.get('dl') else None, 'p': c.get('p', 0), 'k': e.get('name', ''), 'src': 'c', 'id': c.get('id')})
    rows.sort(key=lambda r: (r['src'] != 'g', r.get('rk') or 10 ** 6, r['k'] not in ('Today',), r['dl'] is None, r['dl'] or 0))     # your ranked goals first
    return rows[:limit]


def push(ev):
    with ELOCK:
        ev['t'] = time.time(); EVENTS.append(ev); del EVENTS[:-20]


# ---------------------------------------------------------------- window + interruption control
def window_open():
    """Real OS check (is a Buddy window on screen?) - falls back to the page heartbeat. Prevents duplicate windows."""
    try:
        if H.get('win_open'): return bool(H['win_open']())
    except Exception: pass
    return time.time() - SEEN['t'] < 20


def productive_now():
    try: return bool(H.get('prod') and H['prod']())
    except Exception: return False


def ensure_window():
    """Opens Buddy by itself - except over a productive app / video / site: there it only leaves one quiet notification
    (the message waits in the queue and shows when you open Buddy)."""
    if productive_now() and not window_open():
        if time.time() - SEEN.get('quietnote', 0) > 600 and H.get('notify'):
            SEEN['quietnote'] = time.time()
            try: H['notify']('Buddy has a message for you. Open it whenever you are ready.')
            except Exception: pass
        return
    if not window_open() and time.time() - SEEN['opened'] > 10:
        SEEN['opened'] = time.time()
        try: H['open']()
        except Exception as e: print('buddy window failed:', e)


def _nudges():
    n = st()['nudges']
    if n.get('d') != day_key(): n.clear(); n.update(d=day_key(), n=0, c=0)
    return n


def allow(force=False):
    """Interaction budget: minimum gap and a daily cap, set by the Quiet / Balanced / Chatty level."""
    if force: return True
    gap, cap = LEVELS.get(st()['profile'].get('level', 'balanced'), LEVELS['balanced'])
    n = _nudges()
    if n.get('c', 0) >= cap: return False
    if window_open(): gap = gap / 3                                          # already talking: inline messages are less intrusive
    return time.time() - GATE['t'] >= gap * 60


def mark():
    GATE['t'] = time.time(); n = _nudges(); n['c'] = n.get('c', 0) + 1


def engaged():
    """Only treat things as distractions when the student actually set something up (goal or focus timer)."""
    try:
        p = H['data'].get('pomo') or {}
        if p.get('running') and p.get('mode') == 'focus': return True
        return bool(H['streak']()[2].get('name'))
    except Exception: return False


# ---------------------------------------------------------------- distractions
def dlist():
    return H['data'].setdefault('distractions', [])


def on_offtask(minutes, offgoal=False, goal=''):
    """Returns True if Buddy handled the alert (shown OR deliberately skipped), so no extra plain pop-ups appear."""
    p = st()['profile']
    if not p.get('enabled', True): return False
    n = _nudges()
    if not engaged() and minutes < 30: return True                          # nothing set up: not a "distraction"
    if not allow(): return True
    n['n'] += 1; mark()
    a = H['now']() or {}
    what = ((a.get('title') if a.get('kind') in ('browser', 'youtube') and a.get('title') else a.get('app')) or 'something else')[:40]
    ev = {'type': 'offtask', 'minutes': int(minutes), 'what': what, 'n': n['n'], 'offgoal': bool(offgoal), 'goal': goal}
    if not offgoal:
        d = {'id': uid(), 't': int(time.time() * 1000), 'app': (a.get('app') or '')[:40], 'title': (a.get('title') or '')[:80], 'min': int(minutes), 'goal': goal, 'answer': '', 'verdict': 'asked', 'outcome': '', 'at': 0}
        dlist().append(d); del dlist()[:-500]; ev.update(type='distract', did=d['id'])
    push(ev); ensure_window(); H['save']()
    return True


# ---------------------------------------------------------------- quiet mode, bank of things that happened while quiet
BANK = {}                                   # things Buddy held back while you were on a productive site; told joyfully when you open the bot again


def quiet():
    try: return bool(H.get('quiet') and H['quiet']())
    except Exception: return False


def new_site_min():
    return max(1, int(st()['profile'].get('newSiteMin', 20) or 20))


# ---------------------------------------------------------------- new site / app review: ask "is this aligned with your goal?" once it has real time on it
REV = {'t': 0.0, 'stats': {}, 'ask_t': 0.0, 'n': 0, 'd': '', 'snooze': {}, 'batch_d': ''}


def rescan(force=False):
    """Refresh the list of never-reviewed sites / apps (at most once a minute)."""
    if not H.get('sites'): return REV['stats']
    if force or time.time() - REV['t'] > 60:
        try: REV['stats'] = H['sites'](); REV['t'] = time.time()
        except Exception as e: print('site scan failed:', e)
    return REV['stats']


def due_sites():
    """Unreviewed sites / apps past the review threshold (custom minutes in settings), most time first, minus the ones snoozed with 'Later'."""
    m = new_site_min(); now = time.time()
    return sorted((r for r in rescan().values() if r['min'] >= m and REV['snooze'].get(r['key'], 0) < now), key=lambda r: -r['min'])


def review_tick(now, is_quiet):
    p = st()['profile']
    if not p.get('enabled', True) or not p.get('newSiteAsk', True) or is_quiet or not H['idle_ok'](): return
    if REV['d'] != day_key(): REV.update(d=day_key(), n=0)
    stats = rescan()
    batch = max(5, int(p.get('newSiteBatch', 50) or 50))
    if len(stats) > batch and REV['batch_d'] != day_key() and window_open():              # more than 50 new sites piled up: offer one quick clean-up (once a day)
        REV['batch_d'] = day_key(); push({'type': 'reviewbatch', 'count': len(stats)}); return
    nudge = max(3, int(p.get('newSiteNudge', 10) or 10)); pend = sum(1 for r in stats.values() if r['min'] >= 1)
    if REV.get('nday') != day_key(): REV.update(nday=day_key(), nn=0)
    if pend >= nudge and REV['nn'] < 2 and now - REV.get('nt', 0) > 7200 and window_open():       # a pile is building: two soft reminders a day, 2 h apart
        REV['nt'] = now; REV['nn'] += 1; push({'type': 'reviewnudge', 'count': pend}); return
    if REV['n'] >= 4 or now - REV.get('ask_t', 0) < 600: return                                  # max 4 questions a day, 10 min apart
    d = due_sites()
    if not d: return
    r = d[0]; REV.update(ask_t=now, n=REV['n'] + 1)
    sg = (autorev.A(H['data'])['sug'] or {}).get(r['key']) if H.get('data') else None
    push({'type': 'newsite', 'key': r['key'], 'what': r['name'], 'minutes': int(r['min']), **({'sug': {'c': sg['c'], 'links': sg.get('links', [])}} if sg else {})}); ensure_window()


def review_answer(key, verdict, silent=False):
    r = REV['stats'].get(key) or rescan(True).get(key) or {}                  # grab the display name BEFORE the review removes it from the "new" list
    if verdict == 'accept':                                                   # took auto-review's suggestion
        with H['lock']: autorev.feedback(H['data'], key, 'accept')
        REV['stats'].pop(key, None); H['save']()
        reply, emo = algo.compose('review_yes', actx({'what': r.get('name') or key.split(':', 1)[-1], 'goal': (H['streak']()[2] or {}).get('name', '') if H.get('streak') else ''}))
        if not silent: log('assistant', reply, 'system')
        return {'ok': True, 'reply': reply, 'emotion': emo, 'src': 'system'}
    ok = bool(H.get('review') and H['review'](key, verdict)) if verdict != 'later' else True
    REV['stats'].pop(key, None) if verdict != 'later' else None
    name = r.get('name') or (key.split(':', 1)[-1] if key else 'that')
    if verdict == 'later': REV['snooze'][key] = time.time() + 1800
    goal = (H['streak']()[2] or {}).get('name', '') if H.get('streak') else ''
    kind = {'aligned': 'review_yes', 'prod': 'review_prod', 'no': 'review_no', 'later': 'review_later'}.get(verdict, 'review_later')
    reply, emo = algo.compose(kind, actx({'what': name, 'goal': goal}))
    if not silent: log('assistant', reply, 'system')
    H['save']()
    return {'ok': ok, 'reply': reply, 'emotion': emo, 'src': 'system'}


# ---------------------------------------------------------------- streak protection (timer shown in Buddy's window)
GUARD = {'ep': 0, 'warned': False}


def guard_state():
    try: g = H['guard']() if H.get('guard') else None
    except Exception: g = None
    return g


def guard_tick(now):
    """One warning (chat message + window) when 60 s are left to save a streak of 10+ min. The timer itself is always visible in the window."""
    g = guard_state()
    if not g: GUARD['warned'] = False; return
    if g['left'] <= 60 and g['streak'] >= 10 and not GUARD['warned'] and st()['profile'].get('enabled', True):
        GUARD['warned'] = True; push({'type': 'streakwarn', 'minutes': g['streak'], 'left': g['left']}); ensure_window()


# ---------------------------------------------------------------- welcome back: what you did while Buddy was quiet
SEENW = {'t': 0.0}


def welcome(since_ms):
    """Joyful summary of the time since you last looked: goal-linked sites / apps with timestamps. None if there is nothing worth saying."""
    if not H.get('away'): return None
    rep_ = H['away'](since_ms)
    b = dict(BANK); BANK.clear()
    if rep_['on'] < 5 and not b.get('dailygoal'): return None
    try: live, best, goal = H['streak']()
    except Exception: live, best, goal = 0, 0, {}
    peak = max(int(b.get('streak', 0) or 0), live)
    kind = 'welcome_big' if b.get('dailygoal') else 'welcome_streak' if peak >= 60 else 'welcome'
    raw = actx({'on_min': rep_['on'], 'streak': peak})
    reply, emo = algo.compose(kind, raw)
    log('assistant', reply, 'system'); H['save']()
    return {'reply': reply, 'emotion': emo, 'big': bool(b.get('dailygoal')), 'report': rep_, 'src': 'system'}


# ---------------------------------------------------------------- task -> exam chapter progress (syllabus link)
def sync_progress(save_after=False):
    """Task % and chapter % follow the work (links.sync_progress): a task linked to a chapter drives it, time on linked sites / apps / the Timer moves
    tasks with an estimate and chapters with a study estimate. Returns True if anything changed."""
    changed = links.normalize(H['data'])
    changed = links.sync_progress(H['data'], _mins()) or changed
    if changed and save_after: H['save']()
    return changed


def on_goal_finished(r):
    """The current goal was finished (or deleted): links.housekeeping already moved the goal on. Tell the student what is next."""
    if not st()['profile'].get('enabled', True): return
    nx = r.get('next') or {}
    push({'type': 'goaldone', 'what': (r.get('done') or {}).get('name', 'your goal'), 'next': nx.get('name', ''), 'nextid': nx.get('id', ''), 'nextkind': nx.get('kind', ''),
          'nextwhy': (r.get('why') or '')[:160], 'gone': bool(r.get('gone'))})
    if not quiet() and allow(): mark(); ensure_window()


def on_data_note(note, source=''):
    """Startup: the data file was damaged and restored from a backup (or could not be read). Buddy says so, so nothing disappears silently."""
    nice = source
    m = re.search(r'(\d{8})', source or '')
    if m:
        try: nice = datetime.datetime.strptime(m.group(1), '%Y%m%d').strftime('%d %b')
        except Exception: pass
    elif re.search(r'recent-(\d+)', source or ''):
        try: nice = datetime.datetime.fromtimestamp(int(re.search(r'recent-(\d+)', source).group(1))).strftime('%d %b, %H:%M')
        except Exception: pass
    elif 'latest' in (source or ''): nice = 'the Documents backup'
    push({'type': 'restored' if note.startswith('restored') else 'dataproblem', 'what': nice})
    SEEN['opened'] = 0; ensure_window()


# ---------------------------------------------------------------- smart break reminder
BRK = {'i': 0, 't': 0.0, 'until': 0.0, 'chk': 0.0}
BRK_STEPS = (0, 15, 40, 70)                                                 # minutes after the first reminder (then every 30 min more)


def break_check(now):
    """Break reminder (Settings > Break reminder). Fires only when ALL of this is true:
    - screen work has been unbroken for N min (productive / unreviewed time; unproductive time never counts and a pause longer than the streak-gap resets it)
    - you are really there (not idle, tracking not paused) and no Pomodoro is running (the timer has its own focus / break prompts)
    - not snoozed, and at least 10 min since the last one. If ignored it comes back after +15, +40, +70 min of the same stretch, not every few minutes.
    """
    m = int(H['data'].get('breakMin', 50) or 0)
    if not m or not H.get('stretch'): return
    mins = H['stretch']()
    if mins < 1: BRK['i'] = 0; return                                      # you stepped away: start over
    if (H['data'].get('pomo') or {}).get('running'): return
    if not H['idle_ok']() or now < BRK['until'] or now - BRK['t'] < 600: return
    i = BRK['i']; need = m + (BRK_STEPS[i] if i < len(BRK_STEPS) else BRK_STEPS[-1] + 30 * (i - len(BRK_STEPS) + 1))
    if mins < need: return
    BRK.update(i=i + 1, t=now)
    if quiet():                                                              # on a productive site: no window, no voice, just a silent tray toast
        if H.get('notify'): H['notify'](f"{int(mins)} minutes of non-stop work. A short break (water, stretch) keeps you sharp.")
    elif st()['profile'].get('enabled', True):
        push({'type': 'breaktime', 'minutes': int(mins), 'n': i}); ensure_window()
    elif H.get('notify'):
        H['notify'](f"{int(mins)} minutes of non-stop work. Time for a short break: stand up, drink water, rest your eyes.")


def tick():
    """Called every few seconds by the tracker loop."""
    p = st()['profile']
    if SPEAK['on'] and time.time() - SPEAK['t'] > 90: duck(False)           # safety: never leave media paused
    if time.time() - BRK['chk'] > 20:
        BRK['chk'] = time.time()
        try: break_check(BRK['chk'])
        except Exception as e: print('break check failed:', e)
    if not p.get('enabled', True): return
    k = day_key(); now = time.time(); q = quiet()
    if not (SEEN['prompted'] == k or today_rec().get('checkin') or now - SEEN['start'] < 25 or q) and datetime.datetime.now().hour >= 5 and H['idle_ok']():
        SEEN['prompted'] = k
        push({'type': 'checkin'}); ensure_window(); return
    if now - SEEN['st'] < 20: return
    SEEN['st'] = now
    try: guard_tick(now); review_tick(now, q)
    except Exception as e: print('buddy tick extras failed:', e)
    _outcomes(now)
    try: live, best, goal = H['streak']()
    except Exception: return
    if SEEN['sd'] != k: SEEN.update(sd=k, ms=0, live=0, hr=0, half=False, done=False)
    try: wm = float(H['work']()); tgt = H['data'].get('target', 6) * 60
    except Exception: wm, tgt = 0, 360
    if wm >= tgt > 0 and not SEEN.get('done'):                              # the big one: daily goal reached
        SEEN['done'] = True
        if q: BANK['dailygoal'] = tgt / 60; return                          # quiet: save the big celebration for when they open the bot
        push({'type': 'dailygoal', 'hours': tgt / 60}); ensure_window(); return
    ms = live // 30 * 30
    if live >= 30 and ms > SEEN['ms']:                                      # 30 / 60 / 90 ... minute streak milestones
        SEEN['ms'] = ms
        if q: BANK['streak'] = ms
        elif allow(): mark(); push({'type': 'streak', 'minutes': ms}); (not window_open()) and H['peek']('streak', ms)
    elif SEEN['live'] >= 20 and live == 0:
        if allow(): push({'type': 'streakbreak', 'minutes': SEEN['live']})
        SEEN['ms'] = 0
    elif wm >= tgt / 2 > 0 and not SEEN.get('half') and tgt >= 120:
        SEEN['half'] = True
        if allow() and not q: mark(); push({'type': 'halfway'})
    elif int(wm // 60) > SEEN.get('hr', 0) and wm >= 60:
        SEEN['hr'] = int(wm // 60)
        if allow() and not q: mark(); push({'type': 'hour', 'hours': SEEN['hr']})
    SEEN['live'] = live
    pm = int(p.get('peekMin', 0) or 0)                                      # optional periodic corner card (off by default)
    if pm and not q and engaged() and H['idle_ok']() and now - SEEN['peek'] > pm * 60 and not window_open() and allow():
        SEEN['peek'] = now; mark(); H['peek']('peek')


def _outcomes(now):
    """Did the nudge work? Returned to the goal within 15 min = returned, otherwise ignored."""
    for d in dlist()[-12:]:
        if d.get('outcome') or d['verdict'] == 'asked' and now * 1000 - d['t'] < 600000: continue
        if d['verdict'] == 'important': d['outcome'] = 'allowed'
        elif d['verdict'] == 'break': d['outcome'] = 'break'
        elif now * 1000 - (d.get('at') or d['t']) > 60000 and H['off']() < 1: d['outcome'] = 'returned'
        elif now * 1000 - (d.get('at') or d['t']) > 1200000: d['outcome'] = 'ignored'


def on_cfg_change(old, new):
    """Dashboard saved new data (exam / chapter / task): let Buddy react (only when the window is already open)."""
    if not st()['profile'].get('enabled', True): return
    oe = {e['id'] for e in old.get('exams', [])}; ne = [e for e in new.get('exams', []) if e.get('id') not in oe]
    och = {c['id'] for e in old.get('exams', []) for c in e.get('ch', [])}
    nch = [(e, c) for e in new.get('exams', []) for c in e.get('ch', []) if c.get('id') not in och]
    ot = {t['id'] for t in old.get('tasks', [])}; nt = [t for t in new.get('tasks', []) if t.get('id') not in ot]
    desc = []
    for e in ne: desc.append(f"a new exam: {e.get('name')} on {str(e.get('date'))[:10]}")
    for e, c in nch: desc.append(f"a new chapter '{c.get('name')}' for {e.get('name')} (deadline {c.get('dl')})")
    for t in nt: desc.append(f"a new task: {t.get('title')}")
    if desc:
        push({'type': 'newdata', 'desc': '; '.join(desc)[:300]})
        if window_open(): return                                            # shown inline, never opens a new window for this


# ---------------------------------------------------------------- media ducking (pause videos / music while Buddy talks)
def _others_playing():
    if os.name != 'nt': return False
    try:
        import comtypes; comtypes.CoInitialize()
        from pycaw.pycaw import AudioUtilities, IAudioMeterInformation
        for s in AudioUtilities.GetAllSessions():
            if not s.Process or s.Process.pid == os.getpid(): continue
            if s._ctl.QueryInterface(IAudioMeterInformation).GetPeakValue() > 0.002: return True
    except Exception as e: print('audio probe unavailable:', e); return False
    return False


def _media_key():
    try:
        u = __import__('ctypes').windll.user32; u.keybd_event(0xB3, 0, 0, 0); u.keybd_event(0xB3, 0, 2, 0)   # VK_MEDIA_PLAY_PAUSE
    except Exception: pass


def duck(on):
    """on=True: pause whatever is playing (only if something really is). on=False: resume exactly what we paused."""
    if on:
        SPEAK.update(on=True, t=time.time())
        if not st()['profile'].get('duck', True) or SPEAK['paused']: return
        if time.time() - SPEAK['dash'] < 6: time.sleep(1.0)                  # let the dashboard's own focus sound stop first
        if _others_playing(): _media_key(); SPEAK['paused'] = True
    else:
        if SPEAK['paused']: _media_key(); SPEAK['paused'] = False
        SPEAK['on'] = False


# ---------------------------------------------------------------- AI plumbing (mask/discover/model_list kept above)
def est_tokens(x):
    return int(len(x) / 3.5) + 1                                            # deliberately pessimistic


def call_ai(messages, max_tokens=220, timeout=22, total=50, temperature=0.85):
    """Try every saved key until one answers. gsk_ keys use Groq (fast, free tier), the others OpenRouter's free models. Returns text or None."""
    keys = [k for k in st()['keys'] if k]
    if not keys: return None
    deadline = time.time() + total
    plan = [(k, GROQ, m) for k in keys if k.startswith('gsk_') for m in GROQ_MODELS]
    ok = [k for k in keys if not k.startswith('gsk_')]
    if ok: plan += [(k, API, m) for m in model_list(extra=False) + [m for m in discover_models() if m not in model_list(extra=False)][:3] for k in ok]
    for key, base, model in plan:
        if time.time() > deadline: return None
        if COOL.get(key, 0) > time.time() or COOL.get(key + model, 0) > time.time(): continue
        body = json.dumps({'model': model, 'messages': messages, 'max_tokens': max_tokens, 'temperature': temperature}).encode()
        hdr = {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': 'RizeBuddy'}
        if base == API: hdr.update({'HTTP-Referer': 'http://127.0.0.1', 'X-Title': 'Rize Buddy'})
        try:
            js = json.load(urllib.request.urlopen(urllib.request.Request(base + '/chat/completions', body, hdr), timeout=timeout))
            txt = ((js.get('choices') or [{}])[0].get('message') or {}).get('content') or ''
            txt = re.sub(r'<think>.*?</think>', '', txt, flags=re.S).strip()
            if txt: return txt
            COOL[key + model] = time.time() + 300
        except urllib.error.HTTPError as e:
            if e.code in (401, 402, 403): COOL[key] = time.time() + 3600
            elif e.code == 429: COOL[key + model] = time.time() + 120
            else: COOL[key + model] = time.time() + 600
            print('buddy ai', base.split('/')[2], model, e.code)
        except Exception as e:
            COOL[key + model] = time.time() + 60; print('buddy ai', model, e)
    return None


def system_core(p):
    n = p.get('name') or 'the student'
    hi = "The student speaks Hindi: when they write Hindi, reply in simple Devanagari Hindi (English words are fine) so the voice reads it naturally. " if (p.get('lang') or '').startswith('hi') else ''
    return (hi + f"You are {p['buddyName']}, a warm upbeat study-buddy robot on {n}'s laptop ({p['grade']}). Texting style: 1-3 short sentences, mirror their slang/language, 0-2 emojis. "
            "Be specific (real goal/exam/days left), give ONE tiny next step, never shame or nag. "
            "Start with ONE tag: [feel:happy] [feel:cheering] [feel:sad] [feel:disappointed] [feel:confused] [feel:shocked] [feel:winking] [feel:sleepy]. "
            "You are an AI, never claim to be human. If they mention self-harm, abuse or feeling unsafe: drop study talk, show real care, urge a trusted adult now, share helpline: " + p['helpline'] + ". "
            "Only if they state a goal or dated exam, end with one line: #DATA {\"goals_today\":[],\"goals_week\":[],\"landmarks\":[{\"name\":\"\",\"date\":\"YYYY-MM-DD\"}],\"mood\":\"\",\"fact\":\"\"}")


def context_text():
    p = st()['profile']; now = datetime.datetime.now(); L = [now.strftime('%a %d %b %H:%M')]
    try:
        live, best, goal = H['streak'](); L.append(f"goal: {goal.get('name') or 'not set'}; streak {live}m (best {best}m)")
        L.append(f"work today {int(H['work']())}m of {int(H['data'].get('target', 6) * 60)}m")
    except Exception: pass
    op = [t['title'] for t in H['data'].get('tasks', []) if not t.get('done')][:3]
    if op: L.append('open tasks: ' + '; '.join(op))
    up = landmarks_upcoming(2)
    if up: L.append('next: ' + '; '.join((f"{x['name']} {smart.eta_txt(x['ts'])}" if x.get('ts') else f"{x['name']} in {x['days']}d") + (f" ({x['prep']}% ready)" if x.get('prep') is not None else '') for x in up))
    try:
        due = [x for x in smart.deadlines(H['data']) if x['kind'] != 'exam'][:2]
        if due: L.append('due: ' + '; '.join(f"{x['name'][:30]} {smart.eta_txt(x['ts'])}" for x in due))
    except Exception: pass
    if p.get('shareApps'):
        try:
            a = H['now']() or {}; om = H['off']()
            if a.get('app') and om > 1: L.append(f"now on {a['app']} off-task {int(om)}m")
        except Exception: pass
    b = st()
    if today_rec().get('mood'): L.append('mood: ' + today_rec()['mood'])
    if b['facts']: L.append('remember: ' + '; '.join(b['facts'][-4:]))
    return 'CONTEXT: ' + ' | '.join(L)


def older_summary(skip=8):
    """Older chat condensed into one line (no extra AI call): what the student said before the recent window."""
    L = [m['c'].strip().replace('\n', ' ')[:70] for m in st()['log'][:-skip] if m['r'] == 'user'][-6:]
    return ('EARLIER the student said: ' + ' | '.join(L)) if L else ''


def fit_messages(p, hist, user_text):
    """Stateless API, so every request carries the conversation:  [static system (identical prefix every time = provider cache hits)]
    + [recent window of messages] + [last user message = live context + older-chat summary + the question]. Hard-capped at AI_BUDGET_TOKENS
    by trimming (in this order) coach rules, context, then the oldest messages."""
    rules = ' / '.join((p.get('prompts') or [])[:12])
    core, ctx, old = system_core(p), context_text(), older_summary(len(hist) + 1)
    own = own_words()
    hist = [{'role': m['role'], 'content': m['content'][:260]} for m in hist][-8:]
    user_text = (user_text or '')[:500]
    for rlim, climit in ((700, 700), (400, 500), (200, 320), (0, 200)):
        for hn in (8, 6, 4, 2, 0):
            sysmsg = core + ('\nCOACH RULES: ' + rules[:rlim] if rlim else '') + (('\nTHE STUDENT\'S OWN WORDS (use ONE of these word for word, in quotes, when it fits the moment, e.g. when motivating, when they drift or win; do not invent a new quote): ' + own) if own and rlim >= 200 else '')
            h = hist[-hn:] if hn else []
            last = ctx[:climit] + ('\n' + old[:260] if old else '') + '\nSTUDENT: ' + user_text
            if est_tokens(sysmsg) + sum(est_tokens(m['content']) for m in h) + est_tokens(last) <= AI_BUDGET_TOKENS:
                return [{'role': 'system', 'content': sysmsg}] + h + [{'role': 'user', 'content': last}]
    return [{'role': 'system', 'content': core[:1800]}, {'role': 'user', 'content': user_text[:300]}]


EVENT_TXT = {
    'streak': "[auto] They're on an unbroken {minutes}-minute focus streak. Hype them in one short line.",
    'dailygoal': "[auto] They just completed their daily goal of {hours} hours of work! Celebrate with huge energy and exclamation marks, congratulate them by name.",
    'checkin_done': "[auto] They just finished their check-in. React in 1-2 short sentences and name one concrete goal.",
    'goal_done': "[auto] They just ticked off: {desc}. Celebrate in one short line.",
}
AI_KINDS = set(EVENT_TXT)


def parse_ai(raw, default_emo):
    emo = default_emo
    mm = re.match(r'\s*\[feel:\s*(\w+)\]\s*', raw)
    if mm: emo = mm.group(1).lower(); raw = raw[mm.end():]
    raw = re.sub(r'\[feel:\s*\w+\]', '', raw)
    reply, d = parse_data(raw); apply_data(d)
    return (reply or "I'm here 🙂"), emo


def ask_ai(user_text, default_emo='happy', hist=None):
    p = st()['profile']
    raw = call_ai(fit_messages(p, hist or [], user_text))
    if raw is not None: note_own_use(raw)
    return None if raw is None else parse_ai(raw, default_emo)


def apply_data(d):
    if not isinstance(d, dict): return
    t = today_rec(); b = st()
    if isinstance(d.get('mood'), str) and d['mood'].strip(): t['mood'] = d['mood'].strip()[:30]
    for g in (d.get('goals_today') or [])[:5]: add_task(str(g), 'day')
    for g in (d.get('goals_week') or [])[:5]: add_task(str(g), 'week')
    for x in (d.get('landmarks') or [])[:3]:
        if isinstance(x, dict): add_landmark(x.get('name'), x.get('date'))
    f = d.get('fact')
    if isinstance(f, str) and f.strip() and f.strip() not in b['facts']: b['facts'] = (b['facts'] + [f.strip()[:160]])[-40:]


def log(role, text, src=''):
    """src: 'system' (algorithm, green dot) or 'ai' (live model, blue dot); stored so the dots survive a reload."""
    b = st(); b['log'].append({'t': int(time.time() * 1000), 'r': role, 'c': text, **({'src': src} if src else {})}); del b['log'][:-400]


# ---------------------------------------------------------------- quotes + algo context
def my_quotes():
    return [q for q in st()['quotes'] if q.get('kind', 'quote') in ('quote', 'motivation') and q.get('text')]


def pick_quote():
    if my_quotes(): return ''                                  # own quotes are drawn in algo._quote (quote_pool)
    if random.random() < .3: return algo.fmt_quote(dict(zip(('text', 'author'), random.choice(algo.BUILTIN_QUOTES))))
    return ''


def on_use(group, text):
    """Count every time one of the student's own quotes / lines is really said (shown in Buddy settings as used N times)."""
    kinds = ('quote', 'motivation') if group == 'quote' else (group,)
    t = (text or '').strip().lower()
    for q in st()['quotes']:
        if q.get('kind', 'quote') in kinds and q.get('text') and (q['text'].strip().lower() in t or t in q['text'].strip().lower()):
            q['used'] = q.get('used', 0) + 1; q['last'] = int(time.time() * 1000); return


algo.ON_USE = on_use


def own_words():
    """A few of the student's own quotes / lines, handed to the live AI so it uses them word for word."""
    pick_ = lambda L, n: random.sample(L, min(n, len(L)))
    q = pick_([x['text'] for x in my_quotes()], 2); d = pick_(lines_of('distract'), 1); a = pick_(lines_of('achieve'), 1)
    bits = [('QUOTES: ' + ' | '.join(q)) if q else '', ('WHEN THEY DRIFT: ' + d[0]) if d else '', ('WHEN THEY WIN: ' + a[0]) if a else '']
    return ' / '.join(x for x in bits if x)[:330]


def note_own_use(reply):
    low = (reply or '').lower()
    for q in st()['quotes']:
        t = (q.get('text') or '').strip().lower()
        if len(t) >= 12 and t[:40] in low: q['used'] = q.get('used', 0) + 1; q['last'] = int(time.time() * 1000)


def lines_of(kind):
    """The student's own lines: 'distract' = what Buddy says when you drift away, 'achieve' = when you hit a streak / complete a goal."""
    return [q['text'] for q in st()['quotes'] if q.get('kind') == kind and q.get('text')]


def nearest_exam():
    for x in landmarks_upcoming(8):
        if x.get('exam'): return {'name': x['name'], 'days': x['days'], 'prep': x.get('prep')}
    return None


def actx(event=None):
    event = event or {}; p = st()['profile']; h = datetime.datetime.now().hour
    try: goal = H['streak']()[2].get('name') or ''; live, best = H['streak']()[:2]
    except Exception: goal, live, best = '', 0, 0
    try: work = float(H['work']())
    except Exception: work = 0
    raw = dict(name=p.get('name', ''), goal=event.get('goal') or goal, exam=nearest_exam(), work=work, target=H['data'].get('target', 6), streak=live, best=best,
               buddy=p.get('buddyName', 'Buddy'), plan=algo.plan(H['data'].get('exams', []), H['data'].get('tasks', [])), open_tasks=[t.get('title', '') for t in H['data'].get('tasks', []) if not t.get('done')][:3],
               lines_distract=lines_of('distract'), lines_achieve=lines_of('achieve'), ranked_goals=[t.get('title', '') for t in algo.normalize_task_ranks(H['data'].get('tasks', []))][:5],
               quote=pick_quote(), quote_pool=[algo.fmt_quote(q) for q in my_quotes()], line_share=float(p.get('lineShare') or algo.CUSTOM_SHARE), daypart='night' if h < 5 else 'morning' if h < 12 else 'day' if h < 17 else 'evening')
    raw.update({k: v for k, v in event.items() if k not in ('goal',) or v})
    return raw


def do_chat(text='', event=None):
    """Order: crisis words -> events (algorithm, 10 % AI cheer) -> anticipated questions (algorithm, green) -> everything else goes to the live AI (blue).
    If the AI cannot answer, the student is told WHY (no key / not reachable) instead of getting a canned line."""
    b, p = st(), st()['profile']
    care = bool(text and CRISIS.search(text))
    last_bot = next((m['c'] for m in reversed(b['log']) if m['r'] == 'assistant'), '')
    if text: log('user', text)
    ev = (event or {}).get('type'); ek = 'offgoal' if ev == 'offtask' and event.get('offgoal') else ev
    if ev == 'reminder': ek = 'rem_' + str(event.get('kind', 'start'))
    elif ev == 'timerdone': ek = 'timer_focus_done' if event.get('was') == 'focus' else 'timer_break_done'
    emo, reply, used_ai, ai_state, extra = 'happy', None, False, '', {}
    if text and not care and not event and (it := smart.intent(text)):                 # "review my sites" / "smart review" / "deadlines": open the right sheet
        reply, emo = smart.intent_reply(it, H['data']); log('assistant', reply, 'system'); H['save']()
        return {'reply': reply, 'offline': False, 'ai_state': '', 'care': False, 'helpline': '', 'emotion': emo, 'ai': False, 'src': 'system', 'goal': None, 'plan': False, 'open': it}
    if event:
        ax = actx(event); ek2 = 'newsite_nogoal' if ek == 'newsite' and not ax.get('goal') else ek
        reply, emo = algo.compose(ek2 if ek2 in algo.T or ek2 in ('offtask', 'distract', 'greet') else 'default', ax)
        if ek in AI_KINDS and not event.get('force_own') and random.random() < AI_EVENT_SHARE and b['keys']:          # the 10 %
            et = EVENT_TXT[ek].format(minutes=event.get('minutes', ''), hours=event.get('hours', ''), desc=event.get('desc', ''))
            r = ask_ai(et, emo)
            if r: reply, emo = r; used_ai = True
    else:
        raw = actx(); raw['last_bot'] = last_bot
        hist = [{'role': 'user' if m['r'] == 'user' else 'assistant', 'content': m['c']} for m in b['log'][-9:-1]]
        loc = None if care else algo.local(text, raw)
        if loc: reply, emo, extra = loc
        else:
            r = ask_ai(text, 'happy', hist); used_ai = r is not None
            if r: reply, emo = r
            elif care: reply, emo = "I'm really glad you told me. You matter, and you shouldn't carry this alone. Please reach out to someone you trust right now, a parent, relative, teacher or friend.", 'sad'
            else:
                ai_state = 'nokey' if not b['keys'] else 'failed'
                reply, emo = algo.ai_unavailable(ai_state, raw)
    if care: emo = 'sad'
    src = 'ai' if used_ai else 'system'
    log('assistant', reply, src); H['save']()
    return {'reply': reply, 'offline': ai_state == 'nokey', 'ai_state': ai_state, 'care': care, 'helpline': p['helpline'] if care else '', 'emotion': emo, 'ai': used_ai, 'src': src,
            'goal': extra.get('goal'), 'plan': bool(extra.get('plan'))}


def goal_related(g):
    """Names around the current goal (its exam and the other chapters, or the nearest exam) plus open tasks: what 'relevant' means right now."""
    gid, exams, ex = (g or {}).get('id', ''), H['data'].get('exams', []), None
    if gid.startswith('g:exam:'): ex = next((e for e in exams if f"g:exam:{e['id']}" == gid), None)
    elif gid.startswith('g:chap:'): ex = next((e for e in exams if any(f"g:chap:{c['id']}" == gid for c in e.get('ch', []))), None)
    elif not gid:
        up = nearest_exam(); ex = next((e for e in exams if up and e.get('name') == up['name']), None)
    names = ([ex.get('name', '')] + [c.get('name', '') for c in ex.get('ch', []) if c.get('p', 0) < 100]) if ex else []
    names += [t.get('title', '') for t in H['data'].get('tasks', []) if not t.get('done')][:5]
    return ' '.join(n for n in names if n)[:500]


def answer_distraction(did, text):
    """The student says what they are doing. Algorithm decides if it is important in THIS context, then convinces / allows."""
    d = next((x for x in dlist() if x['id'] == did), None)
    a = H['now']() or {}
    goal = (d or {}).get('goal') or ''
    related = goal_related((H['streak']()[2] if H.get('streak') else {}))
    title, app = (d or {}).get('title') or a.get('title') or '', (d or {}).get('app') or a.get('app') or ''
    v = algo.judge(text, title, goal, related, app); used_ai = False
    if v == 'unclear' and st()['keys'] and len(text.split()) >= 3:                           # rare AI tie-break
        r = ask_ai(f"Student's goal: {goal or 'studying'}. Related exam topics / tasks: {related[:220] or 'none'}. They have '{title or app}' open and say: '{text[:200]}'. Is that really important for the goal? Reply with exactly one word: important, break or not.", 'happy')
        w = (r[0] if r else '').lower(); used_ai = r is not None
        v = 'important' if 'important' in w else 'break' if 'break' in w else 'not' if 'not' in w else 'unclear'
    raw = actx({'what': ((d or {}).get('title') or (d or {}).get('app') or 'that')[:40], 'goal': goal})
    reply, emo = algo.compose('distract_' + v, raw)
    src = 'ai' if used_ai else 'system'
    if d: d.update(answer=text[:200], verdict=v, at=int(time.time() * 1000))
    H['snooze']({'important': 15, 'break': 10, 'not': 8, 'unclear': 3}[v])
    log('user', text); log('assistant', reply, src); H['save']()
    return {'reply': reply, 'emotion': emo, 'verdict': v, 'src': src}


def after_reset(keys):
    b = st(); b['keys'] = keys or []; b['migrated'] = True
    SEEN.update(prompted='', opened=0, peek=time.time(), ms=0, live=0, sd=''); GATE['t'] = 0; BANK.clear(); REV.update(t=0.0, stats={}, snooze={}, batch_d='')
    with ELOCK: EVENTS.clear()
    COOL.clear(); st(); H['save']()


# ---------------------------------------------------------------- routes
def guard():
    return None if request.headers.get('X-Rize') == '1' else ('no', 403)


def public_state():
    if fix_ranks(): H['save']()
    b, p = st(), st()['profile']; t = today_rec()
    return {'options': focus.options(H['data']), 'profile': p, 'keys': [mask(k) for k in b['keys']], 'models': b['models'], 'today': {**t, 'goals': scoped('day')}, 'week': scoped('week'),
            'landmarks': landmarks_upcoming(8), 'log': b['log'][-40:], 'checkedIn': t.get('checkin', False), 'isMonday': datetime.date.today().weekday() == 0,
            'hasWeek': bool(scoped('week')), 'goal': (H['streak']()[2] if H.get('streak') else {}), 'streak': (H['streak']()[:2] if H.get('streak') else [0, 0]), 'stats': (H['stats']() if H.get('stats') else {'prod': 0, 'wasted': 0, 'streak': 0}), 'date': day_key(),
            'nudges': b['nudges'].get('c', 0) if b['nudges'].get('d') == day_key() else 0, 'quotes': b['quotes'], 'chaps': chap_options(), 'guard': guard_state(), 'timer': timer_state(), 'rv': review_counts()}


def review_counts():
    """How many never-reviewed sites / apps are waiting (cached scan, at most once a minute) and how many are past the review minutes: drives the badge on Buddy's review icon."""
    try:
        L = [r for r in rescan().values() if r['min'] >= 1]
        return {'n': len(L), 'due': sum(1 for r in L if r['min'] >= new_site_min()), 'thr': new_site_min()}
    except Exception: return {'n': 0, 'due': 0, 'thr': new_site_min()}


def chap_options():
    """Every open exam chapter (the syllabus) that a task can be linked to; finished exams are left out."""
    out = []
    for e in H['data'].get('exams', []):
        if focus.exam_over(e): continue
        out.append({'id': 'e:%s' % e['id'], 'name': 'Whole exam', 'exam': e.get('name', ''), 'p': round(sum(c.get('p', 0) for c in e.get('ch', [])) / len(e['ch'])) if e.get('ch') else 0})
        for c in e.get('ch', []): out.append({'id': c['id'], 'name': c.get('name', ''), 'exam': e.get('name', ''), 'p': c.get('p', 0)})
    return out


# ---------------------------------------------------------------- v12: deadlines, instant review links, smart review, refresh
def _find(kind, i):
    L = H['data'].get({'exam': 'exams', 'task': 'tasks', 'project': 'projects'}[kind], [])
    return next((x for x in L if str(x.get('id')) == str(i)), None)


@bp.get('/api/buddy/deadlines')
def r_deadlines():
    return jsonify(items=smart.deadlines(H['data']), now=int(time.time() * 1000), opts=smart.link_options(H['data']))


@bp.post('/api/buddy/deadline')
def r_deadline():
    """Set the date + TIME of an exam, a task deadline or a project deadline: {kind, id, iso 'YYYY-MM-DDTHH:MM'}. Empty iso on a project removes its deadline."""
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}; kind = c.get('kind'); iso = str(c.get('iso') or '')[:16]
    if kind not in ('exam', 'task', 'project'): return jsonify(ok=False), 400
    if iso and smart.ts_of(iso) is None: return jsonify(ok=False, err='Bad date'), 400
    with H['lock']:
        x = _find(kind, c.get('id'))
        if x is None: return jsonify(ok=False, err='Not found'), 404
        if kind == 'exam': x['date'] = iso or x.get('date')
        elif kind == 'task': x['dl'] = norm_dl(iso, x.get('scope') or 'day')
        elif iso: x['date'] = iso
        else: x.pop('date', None)
    H['save'](); REV['t'] = 0
    return jsonify(ok=True)


@bp.post('/api/buddy/taskproj')
def r_taskproj():
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}
    with H['lock']:
        t = _find_task(c.get('id'))
        if t is None: return jsonify(ok=False), 404
        t['project'] = str(c.get('project') or '') if c.get('project') in (None, '') or _find('project', c.get('project')) else t.get('project', '')
        if t['project']: t.pop('chap', None); t.pop('exam', None); t['nolink'] = True
    H['save'](); return jsonify(ok=True)


@bp.post('/api/buddy/ref')
def r_ref():
    """Reference keywords: {ex, ch?, op: add|del, words|word}. A keyword means 'this exam' / 'this chapter' (sites, apps and videos that contain it count for it)."""
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}
    with H['lock']:
        e = _find('exam', c.get('ex'))
        if e is None: return jsonify(ok=False), 404
        tg = e if c.get('ch') in (None, '') else next((x for x in e.get('ch', []) if str(x.get('id')) == str(c['ch'])), None)
        if tg is None: return jsonify(ok=False), 404
        if c.get('op') == 'del': tg['refs'] = [w for w in tg.get('refs', []) if w != str(c.get('word', '')).lower()]
        else: smart.add_refs(tg, c.get('words') if isinstance(c.get('words'), list) else str(c.get('words') or '').split(','))
        refs = tg.get('refs', [])
    H['save'](); REV['t'] = 0
    return jsonify(ok=True, refs=refs)


@bp.get('/api/buddy/rlinks')
def r_rlinks(): return jsonify(opts=[o for o in smart.link_options(H['data']) if o['gid']])


def _after_link():
    """The slow part of a link (minutes, progress, disk) runs AFTER the answer went back, so the UI never waits for it."""
    try:
        sync_progress(False)
        try: H['mins'](True)
        except Exception: pass
        H['save']()
    except Exception as e: print('after-link failed:', e)


@bp.post('/api/buddy/rlink')
def r_rlink():
    """Instantly add / remove / clear the exam, topic or task a site, app or video counts for: {key, op: add|remove|clear, id: g:exam:.. | g:chap:.. | g:task:..}."""
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}; key = str(c.get('key') or ''); op = c.get('op'); gid = str(c.get('id') or '')
    if not key or key == 'yt:shorts' or op not in ('add', 'remove', 'clear') or (op != 'clear' and not (gid.startswith('g:') and links.exists(H['data'], gid))): return jsonify(ok=False), 400
    with H['lock']: l = smart.set_link(H['data'], key, op, gid)
    REV['t'] = 0; threading.Thread(target=_after_link, daemon=True).start()
    return jsonify(ok=True, ids=l, names=smart.names_of(H['data'], l))


@bp.post('/api/buddy/refresh')
def r_refresh():
    """The refresh button: re-scan sites, recompute links / progress, return fresh state."""
    if (g := guard()): return g
    rescan(True); sync_progress(True)
    return jsonify(public_state())


@bp.post('/api/buddy/smartreview')
def r_smartreview():
    """Smart review: up to 50 new sites + the upcoming exams in ONE request to the AI (Groq / OpenRouter). Answers are stored as suggestions (nothing is applied until you accept)."""
    if (g := guard()): return g
    if not st()['keys']: return jsonify(ok=False, err='nokey')
    items = smart.candidates(rescan(True), 50)
    if not items: return jsonify(ok=True, items=[], sent=0)
    msgs, codes = smart.smart_prompt(H['data'], items)
    raw = call_ai(msgs, max_tokens=1800, timeout=60, total=100, temperature=0.2)
    if raw is None: return jsonify(ok=False, err='failed')
    res = smart.parse(raw, items, codes)
    if res is None: return jsonify(ok=False, err='badjson')
    with H['lock']:
        a = autorev.A(H['data'])
        for r in res:
            if r['key'] in H['data'].get('v', {}): continue
            a['sug'][r['key']] = {'c': r['c'], 'conf': 0.7, 'name': r['name'], 'why': 'Smart review (AI)', 'links': r['ids'], 'ai': True}
    H['save']()
    for r in res: r['links'] = smart.names_of(H['data'], r.pop('ids'))
    return jsonify(ok=True, items=res, sent=len(items))


@bp.get('/api/buddy/guard')
def r_guard(): return jsonify(guard=guard_state())


@bp.post('/api/buddy/seen')
def r_seen():
    """The Buddy window tells us when you are looking at it (focused). The gap since this is what 'welcome back' summarises."""
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}
    if c.get('focused'): b = st(); b['seen'] = int(time.time() * 1000)
    return jsonify(ok=True)


@bp.post('/api/buddy/welcome')
def r_welcome():
    if (g := guard()): return g
    b = st(); p = b['profile']; seen = b.get('seen') or 0; now = int(time.time() * 1000)
    gone = (now - seen) / 60000 if seen else 0
    if not seen or gone < max(1, int(p.get('welcomeMin', 3) or 3)): return jsonify(none=True)
    b['seen'] = now; w = welcome(seen); H['save']()
    return jsonify(w or {'none': True})


@bp.get('/api/buddy/reviews')
def r_reviews():
    L = sorted(rescan(True).values(), key=lambda r: (-(1 if r.get('sug') else 0), -r['min']))
    a = autorev.A(H['data']); sug = a['sug']
    return jsonify(items=[{'key': r['key'], 'name': r['name'], 'tag': r.get('tag', ''), 'hint': r.get('hint', ''), 'kind': r['kind'], 'min': round(r['min']), 'sug': sug.get(r['key'])} for r in L if r['min'] >= 1][:150], total=len(L), threshold=new_site_min(),
                   cov=autorev.coverage(H['data'], H['skey'], H['reviewable']) if H.get('skey') else {})


@bp.post('/api/buddy/review')
def r_review():
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}
    return jsonify(review_answer(str(c.get('key') or ''), str(c.get('verdict') or ''), bool(c.get('silent'))))


@bp.get('/api/buddy/state')
def r_state(): return jsonify(public_state())


@bp.get('/api/buddy/events')
def r_events():
    SEEN['t'] = time.time()
    with ELOCK:
        ev = [e for e in EVENTS if time.time() - e['t'] < 1800]; EVENTS.clear()
    return jsonify(ev)


@bp.post('/api/buddy/chat')
def r_chat():
    if (g := guard()): return g
    b = request.get_json(silent=True) or {}
    return jsonify(do_chat((b.get('text') or '')[:1200].strip(), b.get('event')))


@bp.post('/api/buddy/distract')
def r_distract():
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}
    return jsonify(answer_distraction(c.get('id'), (c.get('text') or '')[:300].strip()))


@bp.get('/api/distractions')
def r_dist():
    L = sorted(dlist(), key=lambda x: -x['t'])[:300]
    cnt = {k: sum(1 for x in dlist() if x.get('outcome') == k) for k in ('returned', 'ignored', 'allowed', 'break')}
    top = {}
    for x in dlist(): top[x.get('title') or x.get('app') or '?'] = top.get(x.get('title') or x.get('app') or '?', 0) + 1
    return jsonify(items=L, counts=cnt, top=sorted(top.items(), key=lambda kv: -kv[1])[:5], total=len(dlist()))


@bp.post('/api/distractions/clear')
def r_dist_clear():
    if (g := guard()): return g
    dlist().clear(); H['save'](); return jsonify(ok=True)


LINE_KINDS = ('quote', 'motivation', 'distract', 'achieve')


@bp.post('/api/buddy/quotes')
def r_quotes():
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}; b = st(); op = c.get('op')
    if op == 'add':
        t = (c.get('text') or '').strip()[:240]
        if t and not any(q['text'].lower() == t.lower() for q in b['quotes']): b['quotes'].append({'id': uid(), 'text': t, 'author': (c.get('author') or '').strip()[:60], 'kind': c.get('kind') if c.get('kind') in LINE_KINDS else 'quote'})
    elif op == 'del': b['quotes'] = [q for q in b['quotes'] if q['id'] != c.get('id')]
    elif op == 'import':
        for q in (c.get('items') or [])[:500]:
            t = str((q or {}).get('text', '')).strip()[:240]
            if t and not any(x['text'].lower() == t.lower() for x in b['quotes']): b['quotes'].append({'id': uid(), 'text': t, 'author': str(q.get('author', ''))[:60], 'kind': q.get('kind') if q.get('kind') in LINE_KINDS else 'quote'})
    H['save'](); return jsonify(quotes=b['quotes'])


@bp.post('/api/buddy/settings')
def r_settings():
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}; b, p = st(), st()['profile']
    for k in ('name', 'buddyName', 'grade', 'lang', 'helpline', 'ttsVoice'):
        if isinstance(c.get(k), str) and (c[k].strip() or k in ('name', 'ttsVoice')): p[k] = c[k].strip()[:120]
    if 'peekMin' in c: p['peekMin'] = max(0, min(240, int(c['peekMin'] or 0)))
    if c.get('level') in LEVELS: p['level'] = c['level']
    if 'devSrc' in c: p['devSrc'] = bool(c['devSrc'])
    if 'newSiteAsk' in c: p['newSiteAsk'] = bool(c['newSiteAsk'])
    if 'remindOn' in c: p['remindOn'] = bool(c['remindOn'])
    if 'overdueMin' in c: p['overdueMin'] = max(5, min(240, int(c['overdueMin'] or 30)))
    if 'newSiteMin' in c: p['newSiteMin'] = max(1, min(240, int(c['newSiteMin'] or 20)))
    if 'newSiteBatch' in c: p['newSiteBatch'] = max(5, min(500, int(c['newSiteBatch'] or 50)))
    if 'newSiteNudge' in c: p['newSiteNudge'] = max(3, min(200, int(c['newSiteNudge'] or 10)))
    if 'lineShare' in c: p['lineShare'] = max(.2, min(1.0, float(c['lineShare'] or .9)))
    if c.get('ttsEngine') in ('auto', 'chatterbox', 'browser'): p['ttsEngine'] = c['ttsEngine']
    if 'ttsExag' in c: p['ttsExag'] = max(.5, min(1.5, float(c['ttsExag'] or 1)))
    for k in ('ttsRate', 'ttsPitch'):
        if k in c: p[k] = max(.5, min(1.6, float(c[k] or 1)))
    if isinstance(c.get('prompts'), str): p['prompts'] = [x.strip()[:300] for x in c['prompts'].splitlines() if x.strip()][:12] or list(DEFAULT_PROMPTS)
    for k in ('voice', 'shareApps', 'enabled', 'duck', 'newSiteAsk', 'ttsCute'):
        if k in c: p[k] = bool(c[k])
    if isinstance(c.get('keys'), str) and c['keys'].strip():
        b['keys'] = [k.strip() for k in re.split(r'[\s,;]+', c['keys']) if k.strip()][:6]; COOL.clear()
    if isinstance(c.get('models'), str): b['models'] = [m.strip() for m in c['models'].splitlines() if m.strip()][:5]
    if c.get('clearChat'): b['log'] = []
    H['save'](); return jsonify(public_state())


@bp.post('/api/buddy/checkin')
def r_checkin():
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}; t = today_rec(); p = st()['profile']
    if (c.get('name') or '').strip(): p['name'] = c['name'].strip()[:40]
    if c.get('mood'): t['mood'] = str(c['mood'])[:60]
    if c.get('note'): t['notes'].append({'t': int(time.time() * 1000), 'c': str(c['note'])[:400]})
    for g_ in (c.get('goals') or [])[:6]: add_task(str(g_), 'day')
    for g_ in (c.get('weekGoals') or [])[:6]: add_task(str(g_), 'week')
    for x in (c.get('landmarks') or [])[:4]: add_landmark(x.get('name'), x.get('date'))
    t['checkin'] = True; H['save'](); return jsonify(public_state())


@bp.post('/api/buddy/add')
def r_add():
    """'Add update' window: a task (today / this week), a deadline, mood or note."""
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}; k, txt = c.get('kind'), (c.get('text') or '').strip()
    if not txt: return jsonify(ok=False)
    t = today_rec(); desc = txt
    chap = c.get('chap') or ''
    try: est = max(0, min(2000, int(float(c.get('est') or 0))))
    except Exception: est = 0
    rem = c.get('remind') or {}
    if k in ('day', 'week') and (rem.get('on') or rem.get('start') or rem.get('mid')):                      # validate the reminder times before saving anything
        ok, err = rmd.plan({'dl': norm_dl(c.get('dl', ''), k)}, rem.get('start') or '', rem.get('mid') or [], rem.get('ov'))
        if not ok: return jsonify(ok=False, err=err)
    rk = dict(start=rem.get('start') or '', mid=rem.get('mid') or [], ov=rem.get('ov'), remind=bool(rem.get('on') or rem.get('start') or rem.get('mid')))
    if k == 'day': add_task(txt, 'day', c.get('dl', ''), 0, chap, est, **rk); desc = f"a goal for today: {txt}"
    elif k == 'week': add_task(txt, 'week', c.get('dl', ''), 0, chap, est, **rk); desc = f"a goal for this week: {txt}"
    elif k == 'landmark':
        if not add_landmark(txt, c.get('date')): return jsonify(ok=False, err='Pick a date for it')
        desc = f"an important date: {txt} on {c.get('date')}"
    elif k == 'mood': t['mood'] = txt[:60]; desc = f"how they feel: {txt}"
    else: t['notes'].append({'t': int(time.time() * 1000), 'c': txt[:400]}); desc = f"a note: {txt}"
    sync_progress(); newid = None
    if k in ('day', 'week'):
        with H['lock']: links.auto_link_tasks(H['data'])                      # a task whose title matches an exam chapter is linked to it by itself
        sync_progress()
    if k in ('day', 'week') and c.get('makeCurrent'):
        tk = next((t for t in reversed(H['data'].get('tasks', [])) if (t.get('title') or '').lower() == txt[:200].lower()), None)
        if tk: newid = f"g:task:{tk['id']}"; focus.set_goal(H['data'], newid, tk['title'], 'task')
    H['save'](); return jsonify(ok=True, desc=desc, state=public_state())


@bp.post('/api/buddy/goal')
def r_goal():
    """Toggle / progress / delete a task shown in Buddy's lists. Everything that depends on the task follows: its chapter %, Review links, the current goal."""
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}; tasks = H['data'].setdefault('tasks', []); nxt = None
    for t in list(tasks):
        if t['id'] == c.get('id'):
            if c.get('op') == 'del': tasks.remove(t)
            elif c.get('op') == 'prog':
                t['p'] = max(0, min(100, int(c.get('p', 0)))); t['done'] = t['p'] >= 100
                if not t['done']: t['_p'] = None                                # the student set it: automatic progress re-bases from here
            else:
                t['done'] = not t.get('done')
                if t['done']: t['pBefore'] = t.get('p', 0); t['p'] = 100
                else: t['p'] = t.pop('pBefore', 0) or 0; t['_p'] = None          # un-ticking restores the progress it had (v8 reset it to 0)
            t['doneDay'] = day_key() if t.get('done') else ''
            with H['lock']: links.normalize(H['data'])
            sync_progress()
            with H['lock']: r = links.housekeeping(H['data'], focus, lambda: algo.plan(H['data'].get('exams', []), H['data'].get('tasks', [])))
            if r: on_goal_finished(r); nxt = r.get('next')
            H['save'](); return jsonify(ok=True, done=bool(t.get('done')), text=t.get('title', ''), state=public_state(), next=nxt)
    if c.get('op') == 'del':                                                    # already gone (deleted elsewhere): still clean up
        with H['lock']: links.normalize(H['data'])
        H['save']()
    return jsonify(ok=False)


@bp.post('/api/buddy/tasklink')
def r_tasklink():
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}
    for t in H['data'].get('tasks', []):
        if t['id'] == c.get('id'):
            if 'chap' in c:
                set_link(t, c.get('chap'))
            if 'est' in c:
                try: e = max(0, min(2000, int(float(c.get('est') or 0))))
                except Exception: e = 0
                if e: t['est'] = e
                else: t.pop('est', None); t.pop('_p', None)
                t['_p'] = None
    sync_progress(); H['save'](); return jsonify(ok=True, state=public_state())


@bp.post('/api/buddy/landmark/delete')
def r_lm_del():
    if (g := guard()): return g
    i = (request.get_json(silent=True) or {}).get('id'); b = st(); b['landmarks'] = [x for x in b['landmarks'] if x['id'] != i]; H['save']()
    return jsonify(public_state())


@bp.post('/api/buddy/line')
def r_line():
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}
    return jsonify(do_chat('', {'type': c.get('kind', 'streak'), 'minutes': c.get('minutes', '')}))


@bp.post('/api/buddy/snooze')
def r_snooze():
    if (g := guard()): return g
    H['snooze']((request.get_json(silent=True) or {}).get('min', 10)); return jsonify(ok=True)


@bp.post('/api/buddy/duck')
def r_duck():
    """Companion window calls this right before / after speaking: pauses other media, resumes it afterwards."""
    if (g := guard()): return g
    duck(bool((request.get_json(silent=True) or {}).get('on'))); return jsonify(ok=True, paused=SPEAK['paused'])


@bp.post('/api/sound/state')
def r_sound_state():
    if (g := guard()): return g
    if (request.get_json(silent=True) or {}).get('playing'): SPEAK['dash'] = time.time()
    return jsonify(speaking=SPEAK['on'])


@bp.post('/api/buddy/speak')
def r_speak():
    if (g := guard()): return g
    duck(True); speak_server(str((request.get_json(silent=True) or {}).get('text', ''))); threading.Timer(12, lambda: duck(False)).start(); return jsonify(ok=True)


# ---------------------------------------------------------------- natural voice: local Chatterbox Multilingual server (optional)
APPDIR = os.path.join(os.environ.get('APPDATA', '.'), 'RizeBuddy')
VOICE_PY = os.path.join(APPDIR, 'voice-env', 'Scripts', 'python.exe')
VOICE_URL = 'http://127.0.0.1:8767'
VOICE = {'t': 0.0, 'st': {}}
HINDI, BENGALI = re.compile(r'[\u0900-\u097F]'), re.compile(r'[\u0980-\u09FF]')
# emotion -> (exaggeration, cfg_weight). Higher exaggeration = more dramatic; lower cfg_weight = faster, livelier pacing
TTS_EMO = {'cheering': (.85, .30), 'happy': (.60, .45), 'winking': (.60, .42), 'shocked': (.80, .35), 'confused': (.50, .50), 'sad': (.35, .55), 'disappointed': (.38, .55), 'sleepy': (.25, .60), 'angry': (.75, .35), 'excited': (.85, .30), 'love': (.65, .40), 'surprised': (.80, .35), 'dizzy': (.50, .50), 'pouty': (.60, .40), 'thinking': (.40, .50), 'tired': (.25, .60), 'cheerful': (.70, .40)}


def voice_status(max_age=15):
    if time.time() - VOICE['t'] < max_age: return VOICE['st']
    try: s = {'running': True, **json.load(urllib.request.urlopen(VOICE_URL + '/status', timeout=1.5))}
    except Exception: s = {'running': False}
    VOICE.update(t=time.time(), st=s); return s


def voice_start():
    """Start the voice server in the background if setup-voice.bat was run once (own Python env, so the exe stays small)."""
    if os.name != 'nt' or st()['profile'].get('ttsEngine') == 'browser': return
    py = VOICE_PY.replace('python.exe', 'pythonw.exe')
    if not os.path.exists(py) or voice_status(0).get('running'): return
    try:
        src = os.path.join(getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__))), 'voice_server.py'); dst = os.path.join(APPDIR, 'voice_server.py')
        shutil.copyfile(src, dst)
        subprocess.Popen([py, dst, '--follow', 'http://127.0.0.1:8766/api/version'], creationflags=0x08000000, cwd=APPDIR)
    except Exception as e: print('voice server did not start:', e)


@bp.get('/api/buddy/tts/status')
def r_tts_status():
    s = voice_status(5)
    return jsonify(running=bool(s.get('running')), ready=bool(s.get('ready')), loading=bool(s.get('loading')), device=s.get('device', ''), error=s.get('error', ''),
                   installed=os.path.exists(VOICE_PY), engine=st()['profile'].get('ttsEngine', 'auto'))


@bp.post('/api/buddy/tts')
def r_tts():
    """Text -> WAV with Chatterbox (Hindi or English, tone from Buddy's emotion). 503 = the page falls back to the browser voice."""
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}; p = st()['profile']
    text = re.sub(r'\s+', ' ', (c.get('text') or '')).strip()[:400]
    if not text or p.get('ttsEngine') == 'browser' or BENGALI.search(text): return jsonify(ok=False), 503    # Chatterbox has no Bengali
    ex, cfg = TTS_EMO.get(c.get('emotion'), TTS_EMO['happy'])
    body = json.dumps({'text': text, 'lang': 'hi' if HINDI.search(text) else 'en', 'exaggeration': max(.25, min(1.2, ex * float(p.get('ttsExag', 1) or 1))), 'cfg_weight': cfg}).encode()
    try:
        r = urllib.request.urlopen(urllib.request.Request(VOICE_URL + '/tts', body, {'Content-Type': 'application/json'}), timeout=60)
        return Response(r.read(), mimetype='audio/wav')
    except Exception as e:
        VOICE['t'] = 0; print('voice server:', e); return jsonify(ok=False), 503


def _norm_ranks():
    """Give every upcoming exam a unique rank; True if anything changed (so it gets saved)."""
    ex = H['data'].get('exams', []); before = [e.get('rank') for e in ex]; algo.normalize_ranks(ex)
    return before != [e.get('rank') for e in ex]


def plan_state():
    if _norm_ranks() | fix_ranks(): H['save']()
    pl = algo.plan(H['data'].get('exams', []), H['data'].get('tasks', [])); mins = _mins()
    for r in pl['rows']:
        r['spent'] = round(mins.get('g:exam:%s' % r['id'], 0))
        for c in r['chapters']: c['spent'] = round(mins.get('g:chap:%s' % c['id'], 0))
    pk = pl['pick'] and {k: pl['pick'][k] for k in ('kind', 'id', 'name', 'exam', 'why')}
    return {'rows': pl['rows'], 'pick': pk, 'task': pl['task'], 'goal': (H['streak']()[2] if H.get('streak') else {}), 'day': scoped('day'), 'week': scoped('week'), 'goals': ranked_goals(),
            'prox': algo.PROX_BONUS, 'target': H['data'].get('target', 6)}


@bp.get('/api/buddy/plan')
def r_plan(): return jsonify(plan_state())


@bp.post('/api/buddy/exam-rank')
def r_exam_rank():
    """Change YOUR ranking: swap this exam's rank with its neighbour (ranks stay unique). The final priority also adds +1 for the nearest exam."""
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}; ex = H['data'].get('exams', []); order = algo.normalize_ranks(ex); ids = [str(e['id']) for e in order]; eid = str(c.get('id')); note = ''
    if eid in ids:
        i = ids.index(eid); j = i - 1 if c.get('dir') == 'up' else i + 1
        if 0 <= j < len(order): order[i]['rank'], order[j]['rank'] = order[j]['rank'], order[i]['rank']
        else: note = 'already your #1 ranking' if c.get('dir') == 'up' else 'already your lowest ranking'
    H['save'](); return jsonify({**plan_state(), 'note': note})


@bp.post('/api/buddy/breaksnooze')
def r_breaksnooze():
    if (g := guard()): return g
    BRK['until'] = time.time() + float((request.get_json(silent=True) or {}).get('min', 10)) * 60; return jsonify(ok=True)


@bp.post('/api/buddy/open')
def r_open():
    if (g := guard()): return g
    SEEN['opened'] = 0; H['open'](); return jsonify(ok=True)


@bp.get('/api/theme')
def r_theme_get(): return jsonify(theme=st()['profile'].get('theme', 'auto'))


@bp.post('/api/theme')
def r_theme_set():
    if (g := guard()): return g
    t = (request.get_json(silent=True) or {}).get('theme')
    if t in ('auto', 'light', 'dark'): st()['profile']['theme'] = t; H['save']()
    return jsonify(theme=st()['profile']['theme'])


# ---------------------------------------------------------------- goal priority order (YOUR ranking of goals, #1 = most important)
def ranked_goals():
    """Every open goal in your priority order, for the plan sheet and the dashboard."""
    mins = _mins(); op = algo.normalize_task_ranks(H['data'].get('tasks', []))
    return [{**_task_row(t, mins), 'scope': t.get('scope') or ''} for t in op]


@bp.post('/api/buddy/task-rank')
def r_task_rank():
    """Move a goal up / down in YOUR priority list (ranks stay unique). all=true moves it in the full list, otherwise within its own list (Today / This week)."""
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}; tasks = H['data'].setdefault('tasks', []); note = ''
    with H['lock']:
        op = algo.normalize_task_ranks(tasks); t = next((x for x in op if str(x.get('id')) == str(c.get('id'))), None); d = c.get('dir')
        if t is not None:
            grp = (lambda x: 0) if c.get('all') else (lambda x: x.get('scope') or '')
            same = [x for x in op if grp(x) == grp(t)]; i = same.index(t)
            if d in ('up', 'down'):
                j = i - 1 if d == 'up' else i + 1
                if 0 <= j < len(same): t['rank'], same[j]['rank'] = same[j]['rank'], t['rank']
                else: note = 'already your #1 here' if d == 'up' else 'already your lowest priority here'
            elif d == 'top': t['rank'] = 0
            elif d == 'bottom': t['rank'] = 10 ** 6
            elif d == 'to':
                try: t['rank'] = max(1, int(c.get('pos'))) - .5                       # lands just before the goal currently at that position
                except Exception: pass
            algo.normalize_task_ranks(tasks)
    H['save'](); return jsonify(ok=True, note=note, state=public_state(), goals=ranked_goals())


# ---------------------------------------------------------------- reminders
def _find_task(tid): return next((x for x in H['data'].get('tasks', []) if str(x.get('id')) == str(tid)), None)


@bp.post('/api/buddy/reminder')
def r_reminder():
    """Set / change / remove the reminder plan of a goal: start time, custom times in between, and the 'what are you doing?' prompts after the deadline."""
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}
    with H['lock']:
        t = _find_task(c.get('id'))
        if t is None: return jsonify(ok=False, err='Goal not found')
        if c.get('op') == 'clear': rmd.clear(t); ok, err = True, ''
        else:
            if c.get('dl'): t['dl'] = norm_dl(c['dl'], t.get('scope') or 'day')
            ok, err = rmd.plan(t, c.get('start') or '', c.get('mid') or [], c.get('ov'))
    if not ok: return jsonify(ok=False, err=err)
    H['save'](); return jsonify(ok=True, state=public_state())


@bp.post('/api/buddy/remind-act')
def r_remind_act():
    """Buttons on a reminder: snooze / I need more time / stop the overdue prompts for this goal."""
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}; act = c.get('act'); out = {'ok': True}
    with H['lock']:
        t = _find_task(c.get('id'))
        if t is None: return jsonify(ok=False)
        title = t.get('title', '')
        if act == 'snooze': rmd.snooze(t, c.get('min') or 10)
        elif act == 'more':
            try: m = max(5, min(1440, int(float(c.get('min') or 30))))
            except Exception: m = 30
            rmd.more_time(t, m); out['dl'] = t['dl']
        elif act == 'stop':
            if t.get('rm'): t['rm']['ov'] = 0
    H['save']()
    if act == 'more': out.update(do_chat('', {'type': 'reminder', 'kind': 'more', 'what': title[:60], 'minutes': m}))
    out['state'] = public_state(); return jsonify(out)


def answer_overdue(tid, text, code=''):
    """The student says what they are doing while a goal is overdue. The algorithm judges it against THAT goal, then encourages or convinces."""
    t = _find_task(tid)
    if t is None: return {'reply': 'That goal is gone. Nothing overdue now.', 'emotion': 'happy', 'verdict': 'important', 'src': 'system'}
    title = t.get('title', ''); a = H['now']() or {}
    v = {'working': 'important', 'break': 'break'}.get(code) or algo.judge(text, a.get('title') or '', title, goal_related((H['streak']()[2] if H.get('streak') else {})), a.get('app') or '')
    dl = rmd.ms(t.get('dl')); now = time.time() * 1000
    raw = actx({'what': title[:60], 'goal': title, 'late_t': rmd.hm((now - dl) / 60000) if dl and now > dl else '', 'every': (t.get('rm') or {}).get('ov') or 30})
    reply, emo = algo.compose({'important': 'rem_ok', 'break': 'rem_break', 'not': 'rem_not'}.get(v, 'rem_unclear'), raw)
    if v in ('break', 'important'):
        with H['lock']: rmd.snooze(t, 10 if v == 'break' else 5)
    log('user', text); log('assistant', reply, 'system'); H['save']()
    return {'reply': reply, 'emotion': emo, 'verdict': v, 'src': 'system'}


@bp.post('/api/buddy/remind-answer')
def r_remind_answer():
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}
    return jsonify(answer_overdue(c.get('id'), (c.get('text') or '')[:300].strip(), c.get('code') or ''))


REM_LABEL = {'start': 'Time to start', 'mid': 'Reminder', 'dl': 'Deadline now', 'overdue': 'Overdue'}


def reminder_tick():
    p = st()['profile']
    if not p.get('remindOn', True): return
    if not any(t.get('rm') and not t.get('done') for t in H['data'].get('tasks', [])): return
    busy = set()
    try:                                                                          # no nagging for a goal you are working on right now
        live, _, goal = H['streak']()
        if (goal.get('id') or '').startswith('g:task:') and live >= 1: busy.add(goal['id'][7:])
    except Exception: pass
    with H['lock']: evs = rmd.due(H['data'].get('tasks', []), time.time() * 1000, busy)
    if not evs: return
    H['save']()
    for e in evs: push(e)
    ensure_window()
    try:
        import winsound; winsound.MessageBeep()
    except Exception: pass
    if not window_open():                                                         # window is still loading: a tray toast makes sure it is seen
        try: H['notify']('%s: %s' % (REM_LABEL.get(evs[0]['kind'], 'Reminder'), evs[0]['title'][:80]))
        except Exception: pass


# ---------------------------------------------------------------- shared focus timer (Timer page + Buddy window + corner pop-up are one timer)
DASH = {'t': 0.0}                       # last time the dashboard's Timer page looked at the timer (it finishes blocks itself while it is open)


def timer_state():
    with H['lock']:
        p = tmr.get(H['data']); now = int(time.time() * 1000)
        return {'pomo': {k: p.get(k) for k in ('mode', 'running', 'seg', 'endAt', 'rem', 'task', 'project', 'cycle', 'act', 'cfg', 'link', 'custom')}, 'left': tmr.left(p, now), 'total': tmr.ms_for(p, p['mode']),
                'now': now, 'poms': tmr.poms_today(H['data'])}


def _timer_task_from_goal(d, goal):
    """Starting the timer from Buddy: the block is booked to the current goal (task / topic / exam), exactly like the dashboard does."""
    gid = (goal or {}).get('id') or ''
    if gid.startswith('g:task:'):
        t = _find_task(gid[7:])
        if t: tmr.set_task(d, t.get('title', ''), t.get('project', ''), 'prod')
    elif gid.startswith('g:chap:'):
        for e in d.get('exams', []):
            c = next((c for c in e.get('ch', []) if str(c.get('id')) == gid[7:]), None)
            if c: tmr.set_task(d, c.get('name', ''), '', 'study', f"{e.get('id')}:{c.get('id')}"); break
    elif gid.startswith('g:exam:'): tmr.set_task(d, (goal or {}).get('name', ''), '', 'study')


@bp.get('/api/timer')
def r_timer_get():
    if request.args.get('dash'): DASH['t'] = time.time()
    return jsonify(timer_state())


@bp.post('/api/timer')
def r_timer_post():
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}; op = c.get('op'); now = int(time.time() * 1000)
    try: goal = H['streak']()[2]
    except Exception: goal = {}
    with H['lock']:
        d = H['data']; p = tmr.get(d)
        if op == 'toggle': op = 'pause' if p['running'] else 'start'
        if op == 'start':
            if not p['running'] and p['mode'] == 'focus' and p.get('act') != 'exercise' and (goal or {}).get('id') and not c.get('keepTask') and (c.get('forceGoal') or not p.get('custom')): p['custom'] = False; _timer_task_from_goal(d, goal)
            tmr.start(d, now)
        elif op == 'pause': tmr.pause(d, now)
        elif op == 'skip': tmr.skip(d, now)
        elif op == 'stop': tmr.stop(d, now)
        elif op == 'mode': tmr.set_mode(d, c.get('mode'))
        elif op == 'extend': tmr.extend(d, max(-30, min(60, float(c.get('min') or 0))), now)
        elif op == 'task':
            t = (c.get('task') or '').strip()
            act = c.get('act') if c.get('act') in ('study', 'prod', 'exercise') else None
            tmr.set_task(d, t, c.get('project') or '', act, p.get('link') if t == p.get('task') else '', custom=bool(t))
        elif op == 'cfg': tmr.set_cfg(d, **{k: c[k] for k in ('focus', 'short', 'long', 'every', 'goal') if k in c})
    H['save'](); return jsonify(timer_state())


def timer_tick():
    now = int(time.time() * 1000)
    with H['lock']:
        if not tmr.due(H['data'], now, 30000 if time.time() - DASH['t'] < 12 else 0): return           # an open Timer page finishes the block itself (30 s grace)
        r = tmr.done(H['data'], now); cfg = tmr.get(H['data'])['cfg']
    H['save']()
    push({'type': 'timerdone', 'was': r['was'], 'next': r['next'], 'what': (r['task'] or '')[:60] if r['was'] == 'focus' else '', 'brk': cfg['long'] if r['next'] == 'long' else cfg['short'], 'minutes': cfg['focus']})
    ensure_window()
    try:
        import winsound; winsound.MessageBeep()
    except Exception: pass


def _bg():
    time.sleep(8)
    while True:
        try: reminder_tick()
        except Exception as e: print('reminder tick failed:', e)
        try: timer_tick()
        except Exception as e: print('timer tick failed:', e)
        time.sleep(5)


# ---------------------------------------------------------------- v15: "what did I miss?" gap question + small calendar
GAP_MIN = 30                                  # minutes of silence (app closed / PC off) before Buddy asks what happened
GAP_KINDS = {'sleep': ('Sleep', 'b'), 'study': ('Studied', 's'), 'college': ('College / School', 'm')}


def beat():
    """Heartbeat: remember the last moment the app was running (called every ~minute and on exit), so the next start knows when it was closed."""
    try: st()['alive'] = int(time.time() * 1000)
    except Exception: pass


def start_gap():
    """Called once at start: if the app was closed for GAP_MIN+ minutes, remember the window [closed, opened] so Buddy can ask about it."""
    b = st(); now = int(time.time() * 1000); alive = b.get('alive') or 0
    if alive and now - alive >= GAP_MIN * 60000:
        g = b.get('gap')
        b['gap'] = {'from': g['from'] if g and g.get('from') else alive, 'to': now}      # an unanswered older gap stays and grows
    b['alive'] = now; H['save']()


@bp.get('/api/buddy/gap')
def r_gap_get():
    g = st().get('gap')
    return jsonify(gap=g if g and g['to'] - g['from'] >= 10 * 60000 else None)


@bp.post('/api/buddy/gap')
def r_gap_post():
    """{action:'skip'} or {action:'answer', kind:'sleep|study|college|custom', label, from, to}. Saves a calendar block and returns what is left of the gap."""
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}; b = st(); gap = b.get('gap')
    if not gap: return jsonify(gap=None)
    if c.get('action') == 'skip': b.pop('gap', None); H['save'](); return jsonify(gap=None)
    try: a, z = int(c.get('from')), int(c.get('to'))
    except (TypeError, ValueError): return jsonify(error='bad time'), 400
    a, z = max(a, gap['from']), min(z, gap['to'])
    if z - a < 60000: return jsonify(error='Pick a time inside the gap'), 400
    kind = c.get('kind')
    label, k = GAP_KINDS.get(kind, ((str(c.get('label') or '').strip()[:80]) or 'Offline', 'f'))
    if kind == 'custom' and not (c.get('label') or '').strip(): return jsonify(error='Write what you did'), 400
    e = {'id': int(time.time() * 1000) + 1, 'start': a, 'end': z, 'task': label, 'project': '', 'kind': k, 'pomo': 0, 'note': 'logged from the away question', 'area': 'study' if k == 's' else '', 'link': None}
    with H['lock']: H['data'].setdefault('entries', []).append(e)
    gap['from'] = z
    if gap['to'] - gap['from'] < 10 * 60000: b.pop('gap', None); gap = None
    H['save'](); return jsonify(gap=gap, entry=e)


@bp.get('/api/buddy/cal')
def r_cal():
    """One day for the small calendar: logged blocks, tracked runs (>= 3 min) and deadlines."""
    try: d0 = int(request.args.get('day', 0)) or int(time.time() * 1000)
    except ValueError: d0 = int(time.time() * 1000)
    t = time.localtime(d0 / 1000); a = int(time.mktime((t.tm_year, t.tm_mon, t.tm_mday, 0, 0, 0, 0, 0, -1)) * 1000); z = a + 86400000
    D = H['data']; sk = H.get('skey')
    with H['lock']:
        ents = [{'id': e['id'], 'start': e['start'], 'end': e['end'], 'name': e.get('task') or 'Block', 'kind': e.get('kind', 'f')} for e in D.get('entries', []) if e['end'] > a and e['start'] < z]
        L = sorted([s for s in D.get('sessions', []) if s['end'] > a and s['start'] < z], key=lambda s: s['start'])
    runs = []
    for s in L:
        k = (sk(s) if sk else s.get('app', '')); nm = (s.get('app') if s.get('kind') == 'app' else s.get('title')) or k
        if runs and runs[-1]['key'] == k and s['start'] - runs[-1]['end'] <= 120000: runs[-1]['end'] = s['end']
        else: runs.append({'key': k, 'name': str(nm)[:50], 'start': s['start'], 'end': s['end']})
    runs = [r for r in runs if r['end'] - r['start'] >= 180000]
    for r in runs: r.pop('key')
    dl = [{'name': x['name'], 'ts': x['ts'], 'kind': x['kind']} for x in smart.deadlines(D) if a <= x['ts'] < z]
    return jsonify(day=a, ents=ents, runs=runs[:60], dl=dl)


@bp.post('/api/buddy/calentry')
def r_calentry():
    """{op:'add', label, kind: s|m|b|f|x, from, to} or {op:'del', id}"""
    if (g := guard()): return g
    c = request.get_json(silent=True) or {}
    if c.get('op') == 'del':
        with H['lock']: H['data']['entries'] = [e for e in H['data'].get('entries', []) if str(e.get('id')) != str(c.get('id'))]
        H['save'](); return jsonify(ok=True)
    try: a, z = int(c.get('from')), int(c.get('to'))
    except (TypeError, ValueError): return jsonify(error='bad time'), 400
    if z - a < 60000: return jsonify(error='End must be after start'), 400
    k = c.get('kind') if c.get('kind') in ('s', 'm', 'b', 'f', 'x') else 'f'
    e = {'id': int(time.time() * 1000), 'start': a, 'end': z, 'task': (str(c.get('label') or '').strip()[:80]) or {'s': 'Study', 'm': 'College / School', 'b': 'Break', 'x': 'Workout'}.get(k, 'Block'), 'project': '', 'kind': k, 'pomo': 0, 'note': '', 'area': 'study' if k == 's' else '', 'link': None}
    with H['lock']: H['data'].setdefault('entries', []).append(e)
    H['save'](); return jsonify(ok=True, entry=e)
