"""Task reminders.

A task that has a reminder plan (task['rm']) gets Buddy pop-ups at:
  1. its START time,
  2. any CUSTOM times the student added between start and deadline,
  3. its DEADLINE,
  4. then every N minutes (default 30) AFTER the deadline while the task is still open: "you need to do this, what are you doing?"

task['rm'] = {'start': 'YYYY-MM-DDTHH:MM' | '', 'mid': [iso, ...], 'ov': minutes (0 = no overdue nagging)}
task['rf'] = what has already fired (so nothing fires twice and a restart never replays old reminders).
Pure functions, no network and no AI: the wording comes from algo.py templates.
"""
import datetime, time

LATE_GRACE = 15 * 60 * 1000          # a start / custom reminder the PC missed by more than this (it was off) is skipped silently
OVERDUE_DEFAULT = 30                 # minutes between "what are you doing?" prompts after the deadline


def ms(iso):
    try: return datetime.datetime.fromisoformat(str(iso)).timestamp() * 1000
    except Exception: return None


def iso(x):
    try: return datetime.datetime.fromisoformat(str(x)).strftime('%Y-%m-%dT%H:%M')
    except Exception: return ''


def hm(minutes):
    m = int(round(abs(minutes))); d, r = divmod(m, 1440); h, r = divmod(r, 60)
    return f'{d}d {h}h' if d else f'{h}h {r:02d}m' if h else f'{m} min'


def plan(task, start='', mid=None, ov=None):
    """Validate + store a reminder plan on a task. Returns (ok, error text)."""
    s, dl = ms(start) if start else None, ms(task.get('dl')) if task.get('dl') else None
    if start and s is None: return False, 'That start time is not valid'
    if s and dl and s >= dl: return False, 'The start time must be before the deadline'
    out = []
    for x in (mid or []):
        m = ms(x)
        if m is None: return False, 'One of the custom times is not valid'
        if s and m <= s: return False, 'Custom reminders must come after the start time'
        if dl and m >= dl: return False, 'Custom reminders must come before the deadline'
        if iso(x) not in out: out.append(iso(x))
    try: o = OVERDUE_DEFAULT if ov is None else max(0, min(240, int(float(ov))))
    except Exception: o = OVERDUE_DEFAULT
    task['rm'] = {'start': iso(start) if start else '', 'mid': sorted(out), 'ov': o}
    task['rf'] = {}                                                   # a new plan starts fresh
    return True, ''


def clear(task):
    task.pop('rm', None); task.pop('rf', None)


def summary(task):
    """Short facts for the UI."""
    rm = task.get('rm')
    if not rm: return None
    return {'start': rm.get('start', ''), 'mid': list(rm.get('mid') or []), 'ov': rm.get('ov', OVERDUE_DEFAULT)}


def _ev(t, kind, now, **kw):
    dl = ms(t.get('dl')); e = {'type': 'reminder', 'kind': kind, 'id': t['id'], 'title': t.get('title', ''), 'dl': t.get('dl', ''), 'what': t.get('title', '')[:60]}
    if dl:
        e['left_t'] = hm((dl - now) / 60000) if dl > now else ''
        e['late_t'] = hm((now - dl) / 60000) if now > dl else ''
        e['minutes'] = int(abs(dl - now) / 60000)
    e.update(kw); return e


def due(tasks, now=None, busy_ids=()):
    """Reminders that are due now. Marks them as fired (task['rf']). busy_ids: task ids the student is working on RIGHT NOW (no nagging for those)."""
    now = now or time.time() * 1000; out = []; busy = {str(x) for x in busy_ids}
    for t in tasks:
        rm = t.get('rm')
        if not rm or t.get('done'): continue
        rf = t.setdefault('rf', {})
        if rf.get('dlfor') != t.get('dl'): rf.update(dl=0, ov=0, n=0, snz=0, dlfor=t.get('dl'))        # the deadline moved: the deadline reminders start over
        s = ms(rm.get('start')) if rm.get('start') else None
        if s and not rf.get('start') and now >= s:
            rf['start'] = now
            if now - s <= LATE_GRACE: out.append(_ev(t, 'start', now))
        fm = rf.setdefault('mid', {})
        for x in rm.get('mid') or []:
            m = ms(x)
            if m and x not in fm and now >= m:
                fm[x] = now
                if now - m <= LATE_GRACE: out.append(_ev(t, 'mid', now))
        dl = ms(t.get('dl')) if t.get('dl') else None
        if dl and not rf.get('dl') and now >= dl:
            rf['dl'] = now
            if now - dl <= LATE_GRACE: out.append(_ev(t, 'dl', now))
        ov = rm.get('ov', OVERDUE_DEFAULT)
        if dl and rf.get('dl') and ov and now >= dl:
            nxt = (rf.get('ov') or dl) + ov * 60000                                                         # deadline, then every `ov` minutes
            if now >= nxt and now >= (rf.get('snz') or 0):
                rf['ov'] = now
                if str(t['id']) not in busy:
                    rf['n'] = rf.get('n', 0) + 1; out.append(_ev(t, 'overdue', now, n=rf['n'], every=ov))
    return out


def snooze(task, minutes, now=None):
    now = now or time.time() * 1000
    task.setdefault('rf', {})['snz'] = now + max(1, float(minutes)) * 60000


def more_time(task, minutes, now=None):
    """'I need more time': push the deadline out. Overdue prompts start over from the new deadline."""
    now = now or time.time() * 1000; base = max(now, ms(task.get('dl')) or now)
    task['dl'] = datetime.datetime.fromtimestamp((base + max(5, float(minutes)) * 60000) / 1000).strftime('%Y-%m-%dT%H:%M')
    return task['dl']            # rf['dlfor'] no longer matches, so the deadline + overdue reminders start over by themselves
