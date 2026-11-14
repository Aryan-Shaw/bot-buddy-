"""Current-goal filtering + focus streaks (pure functions over data['sessions'])."""
import datetime, re, time

F = lambda d: d.setdefault('focus', {'goal': {'id': '', 'name': ''}, 'log': [], 'gap': 5})


def set_goal(d, gid='', name='', kind=''):
    f = F(d); g = {'id': gid or '', 'name': (name or '').strip()[:80], 'kind': kind or ''}
    if (g['id'], g['name']) == (f['goal'].get('id', ''), f['goal'].get('name', '')): return f['goal']
    f['goal'] = g; f['log'].append({'t': int(time.time() * 1000), **g}); del f['log'][:-300]
    return g


def goal_at(d, t):
    g = {'id': '', 'name': '', 'kind': ''}
    for x in F(d)['log']:
        if x['t'] <= t: g = x
        else: break
    return g


def exam_over(e, now=None):
    """True once the exam's date AND time have passed (the exam is completed: no countdown, no priority, not a goal)."""
    try: dt = datetime.datetime.fromisoformat(str(e.get('date')).replace('Z', '+00:00'))
    except Exception: return False
    if dt.tzinfo is None: return dt < (now or datetime.datetime.now())
    return dt < (now or datetime.datetime.now(datetime.timezone.utc))


def options(d):
    """What the student can pick as current goal: exam topics (soonest first), exams, normal tasks. Completed (past) exams are left out."""
    topics, exams, tasks = [], [], []
    for e in d.get('exams', []):
        if exam_over(e): continue
        exams.append({'id': f"g:exam:{e['id']}", 'name': e.get('name', 'Exam'), 'kind': 'exam'})
        for c in e.get('ch', []):
            if c.get('p', 0) < 100: topics.append({'id': f"g:chap:{c['id']}", 'name': c.get('name', ''), 'exam': e.get('name', ''), 'dl': c.get('dl') or '9999', 'kind': 'chap'})
    topics.sort(key=lambda x: x['dl'])
    for t in d.get('tasks', []):
        if not t.get('done'): tasks.append({'id': f"g:task:{t['id']}", 'name': t.get('title', ''), 'kind': 'task'})
    return {'topics': topics[:30], 'exams': exams[:15], 'tasks': tasks[:20]}


def _ids(d, g):
    """Review links (C.va values) that count as this goal, and the names used for the keyword match. Linked things count together (links.goal_ids):
    a task counts for its chapter, a chapter for the tasks linked to it, an exam for all of its chapters and their tasks."""
    import links
    return links.goal_ids(d, g)


def words_match(name, text):
    name = (name or '').lower().strip()
    if not name: return False
    if name in text: return True
    sig = [w for w in re.findall(r'[a-z0-9]+', name) if len(w) >= 4]
    return bool(sig) and sum(w in text for w in sig) >= max(1, (len(sig) + 1) // 2)


def vlist(v):
    """Review links of one app / site / video: '' | one id | a list of ids (an item can serve several topics / tasks)."""
    return [x for x in (v if isinstance(v, list) else [v]) if isinstance(x, str) and x]


def _area_hit(d, gid, s, v):
    """Old area-style goal: explicit link to that area, or (no explicit link) one of the area's keywords is on screen."""
    if gid in v: return True
    a = next((x for x in d.get('areas', []) if x.get('id') == gid), None)
    t = (s['app'] + ' ' + s['title']).lower()
    return bool(a) and not v and any(w.strip() and w.strip().lower() in t for w in (a.get('kw') or '').split(','))


def ok(d, s, cat, key):
    """Does this session count as work toward the CURRENT goal at the time it happened?"""
    if cat not in ('f', 'm'): return False
    g = goal_at(d, s['start'])
    if not g['id'] and not g['name']: return True
    if cat == 'm': return True
    v = vlist((d.get('va') or {}).get(key))
    ids, names = _ids(d, g)
    if any(x in ids for x in v): return True
    if g['id'] and not g['id'].startswith('g:'):                      # old area-style goal
        if _area_hit(d, g['id'], s, v): return True
    elif any(x.startswith('g:') for x in v): return False             # item explicitly linked to other topics / tasks only
    t = (s['app'] + ' ' + s['title']).lower()
    return any(words_match(n, t) for n in names)


def streak(sessions, is_ok, gap_ms, now_ms=None):
    """sessions sorted by start. Returns (best_ms, best_start, current_ms). A break longer than gap_ms ends the streak."""
    best = cur = 0; bstart = start = None; last = None
    for s in sessions:
        if not is_ok(s): continue
        if last is None or s['start'] - last > gap_ms: cur = 0; start = s['start']
        cur += s['end'] - s['start']; last = max(last or 0, s['end'])
        if cur > best: best, bstart = cur, start
    now_ms = now_ms or time.time() * 1000
    live = cur if last is not None and now_ms - last <= gap_ms else 0
    return best, bstart, live


def streak_state(sessions, is_ok, gap_ms, now_ms=None):
    """Like streak(), but also says how long the CURRENT streak can survive without aligned work.
    Returns {'cur': streak ms (even if already broken), 'since': ms since the last aligned work, 'left': ms until it breaks (<=0 = broken)}."""
    cur = 0; last = None
    for s in sessions:
        if not is_ok(s): continue
        if last is None or s['start'] - last > gap_ms: cur = 0
        cur += s['end'] - s['start']; last = max(last or 0, s['end'])
    now_ms = now_ms or time.time() * 1000
    if last is None: return {'cur': 0, 'since': 0, 'left': 0}
    since = max(0, now_ms - last)
    return {'cur': cur, 'since': since, 'left': gap_ms - since}


def by_day(sessions, tz_day):
    out = {}
    for s in sessions: out.setdefault(tz_day(s['start']), []).append(s)
    return out


def day_str(ms): return datetime.datetime.fromtimestamp(ms / 1000).strftime('%Y-%m-%d')


def report(d, is_ok_fn, days=30):
    """Max streak per day (minutes) for the last N days + today's live streak."""
    gap = F(d).get('gap', 5) * 60000; since = time.time() * 1000 - days * 86400000
    S = sorted((s for s in d['sessions'] if s['end'] >= since), key=lambda s: s['start'])
    groups = by_day(S, day_str); out = []
    for i in range(days - 1, -1, -1):
        k = (datetime.date.today() - datetime.timedelta(days=i)).isoformat()
        b, bs, live = streak(groups.get(k, []), is_ok_fn, gap)
        work = sum(s['end'] - s['start'] for s in groups.get(k, []) if is_ok_fn(s)) / 60000
        out.append({'d': k, 'best': round(b / 60000), 'at': bs, 'work': round(work), 'live': round(live / 60000) if k == day_str(time.time() * 1000) else 0})
    return out


def finished(d, gid):
    """Is the exam topic / task behind this goal id already complete (or gone)?"""
    import links
    return links.finished(d, gid)
