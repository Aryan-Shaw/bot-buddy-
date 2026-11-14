"""Shared focus timer (Pomodoro).

It uses the very same data['pomo'] object as the dashboard's Timer page, so the Timer page, Buddy's window and the
corner pop-up are ONE timer: start it in any of them and the others follow. Finished focus / break blocks are written
to data['entries'] exactly like the dashboard does, so they count toward tasks and exam topics.

All functions expect the caller to hold the data lock and to save afterwards.
"""
import os, time


def P0():
    return {'mode': 'focus', 'running': False, 'seg': 0, 'endAt': 0, 'rem': 1500000, 'task': '', 'project': '', 'cycle': 0, 'act': 'study', 'goalDay': 0,
            'cfg': {'focus': 25, 'short': 5, 'long': 15, 'every': 4, 'goal': 4}}


def get(data):
    p = data.get('pomo')
    if not isinstance(p, dict): p = data['pomo'] = P0()
    base = P0()
    for k, v in base.items(): p.setdefault(k, v)
    if not isinstance(p.get('cfg'), dict): p['cfg'] = base['cfg']
    for k, v in base['cfg'].items(): p['cfg'].setdefault(k, v)
    return p


def ms_for(p, mode): return int(max(1, p['cfg'].get(mode, 25)) * 60000)


def left(p, now=None):
    now = now or int(time.time() * 1000)
    return max(0, p['endAt'] - now) if p.get('running') else int(p.get('rem', 0))


def _uid(): return int(time.time() * 1000) + int.from_bytes(os.urandom(2), 'big') % 1000


def close_seg(data, end, done):
    """Write the running segment as a timer entry (same fields as the dashboard's closeSeg). Segments under 30 s are dropped."""
    p = get(data); s = p.get('seg') or 0
    if not s or end - s < 30000: return None
    focus = p['mode'] == 'focus'; ex = p.get('act') == 'exercise'
    kind = 'b' if not focus else 'x' if ex else 'f' if p.get('act') == 'prod' else 's'
    ents = data.setdefault('entries', [])
    if any(e.get('start') == s and e.get('kind') == kind for e in ents[-60:]): return None          # already written (dashboard + Buddy never double-count)
    link = None
    if focus and p.get('act') == 'study' and p.get('link'):
        a = str(p['link']).split(':')
        if len(a) == 2: link = {'it': a[0], 'ch': a[1]}
    e = {'id': _uid(), 'start': s, 'end': int(end), 'task': 'Break' if not focus else 'Workout' if ex else p.get('task', ''), 'project': p.get('project', '') if focus else '',
         'kind': kind, 'pomo': 1 if done and focus else 0, 'note': '', 'area': '' if not focus or ex else (p.get('area') or ('study' if p.get('act') == 'study' else '')), 'link': link}
    ents.append(e)
    return e


def start(data, now=None):
    p = get(data)
    if p['running']: return p
    now = now or int(time.time() * 1000)
    p['running'] = True; p['endAt'] = now + int(p['rem']); p['seg'] = now
    return p


def extend(data, minutes, now=None):
    """+/- minutes on the running or paused block (cannot go below 1 minute)."""
    p = get(data); d = int(float(minutes) * 60000)
    if p['running']:
        now = now or int(time.time() * 1000); p['endAt'] = max(now + 60000, p['endAt'] + d)
    else: p['rem'] = max(60000, int(p['rem']) + d)
    return p


def pause(data, now=None):
    p = get(data)
    if not p['running']: return p
    now = now or int(time.time() * 1000); close_seg(data, now, 0)
    fin = p['mode'] == 'focus' and p.get('act') == 'exercise'
    p['rem'] = ms_for(p, 'focus') if fin else max(0, p['endAt'] - now); p['running'] = False
    return p


def _advance(p):
    if p['mode'] == 'focus':
        p['cycle'] += 1; p['mode'] = 'long' if p['cycle'] % max(1, p['cfg']['every']) == 0 else 'short'
    else: p['mode'] = 'focus'


def done(data, now=None):
    """The block ran to its end. Returns {'was': mode that just finished, 'next': new mode, ...}."""
    p = get(data); now = now or int(time.time() * 1000); was = p['mode']
    close_seg(data, p['endAt'] or now, 1); _advance(p)
    p['running'] = False; p['rem'] = ms_for(p, p['mode'])
    return {'was': was, 'next': p['mode'], 'cycle': p['cycle'], 'task': p.get('task', '')}


def skip(data, now=None):
    p = get(data); now = now or int(time.time() * 1000)
    if p['running']: close_seg(data, now, 0)
    _advance(p); p['running'] = False; p['rem'] = ms_for(p, p['mode'])
    return p


def stop(data, now=None):
    p = get(data); now = now or int(time.time() * 1000)
    if p['running']: close_seg(data, now, 0)
    p['mode'] = 'focus'; p['running'] = False; p['rem'] = ms_for(p, 'focus')
    return p


def set_mode(data, mode):
    p = get(data)
    if p['running'] or mode not in ('focus', 'short', 'long'): return p
    p['mode'] = mode; p['rem'] = ms_for(p, mode)
    return p


def set_cfg(data, **kw):
    p = get(data)
    for k in ('focus', 'short', 'long', 'every', 'goal'):
        if k in kw:
            try: p['cfg'][k] = max(1, min(240, int(float(kw[k]))))
            except Exception: pass
    if not p['running']: p['rem'] = ms_for(p, p['mode'])
    return p


def set_task(data, task='', project='', act=None, link='', custom=None):
    p = get(data)
    if p['running']: return p
    if custom is not None: p['custom'] = bool(custom)
    p['task'] = (task or '')[:120]; p['project'] = project or ''
    if act in ('study', 'prod', 'exercise'): p['act'] = act
    if link: p['link'] = link
    else: p.pop('link', None)
    return p


def due(data, now=None, grace_ms=0):
    """Has the running block passed its end (plus a grace period that lets an open dashboard finish it first)?"""
    p = get(data); now = now or int(time.time() * 1000)
    return bool(p['running'] and now >= p['endAt'] + grace_ms)


def poms_today(data, now=None):
    import datetime
    now = now or time.time(); d0 = datetime.datetime.fromtimestamp(now).replace(hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000
    return sum(1 for e in data.get('entries', []) if e.get('pomo') and (e.get('start') or 0) >= d0)
