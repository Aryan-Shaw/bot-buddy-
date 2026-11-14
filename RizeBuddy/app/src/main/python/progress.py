"""Progress map + live Review (v11).

Two read-only views built from the same linked data (links.py):

  review_now(...)     what you are doing RIGHT NOW (category, counts for your goal?, linked to what) and the last two productive and last two
                      unproductive sites / apps / videos you used before it, so a wrong label can be corrected on the spot.
  progress_tree(...)  every exam -> chapter -> task with its progress, the minutes put into it, and the reviewed sites / apps that feed it,
                      plus how much productive time is still not linked to any goal (the thing Review should shrink).
"""
import time

import links


def _names(data):
    n = {}
    for e in data.get('exams', []):
        n['g:exam:%s' % e['id']] = e.get('name', '')
        for c in e.get('ch', []): n['g:chap:%s' % c['id']] = c.get('name', '')
    for t in data.get('tasks', []): n['g:task:%s' % t['id']] = t.get('title', '')
    return n


def _vlist(x):
    return [i for i in (x if isinstance(x, list) else [x]) if isinstance(i, str) and i]


def _goal_links(data, key, names):
    return [names[i] for i in _vlist((data.get('va') or {}).get(key)) if i in names]


# ---------------------------------------------------------------- live review
def review_now(data, sessions, now_app, cat, skey, disp, ok, is_auto, now_ms=None, lookback_h=72, per_group=2, meta=None):
    """sessions: recent sessions (any order). now_app: the tracker's live window dict or None.
    cat(s) -> f|m|b|o, skey(s) -> review key, disp(s) -> readable name, ok(s) -> counts for the current goal, is_auto(key) -> labelled by auto-review."""
    now_ms = now_ms or int(time.time() * 1000); names = _names(data); since = now_ms - lookback_h * 3600000
    L = sorted((s for s in sessions if s['end'] >= since), key=lambda s: s['start'])
    t0 = time.mktime((*time.localtime(now_ms / 1000)[:3], 0, 0, 0, 0, 0, -1)) * 1000
    visits = {}; prev = None
    for s in L:
        k = skey(s); r = visits.get(k)
        if r is None: r = visits[k] = {'key': k, 'name': disp(s)[:60], 'kind': s['kind'], 'cat': cat(s), 'today': 0.0, 'v0': s['start'], 'v1': s['end'], 'vmin': 0.0}
        same = prev is not None and prev['key'] == k and s['start'] - prev['end'] <= 120000        # same thing, no real gap: one visit
        if not same: r['v0'] = s['start']; r['vmin'] = 0.0
        d = (s['end'] - s['start']) / 6e4; r['vmin'] += d; r['v1'] = s['end']; r['cat'] = cat(s)
        if s['end'] > t0: r['today'] += (s['end'] - max(s['start'], t0)) / 6e4
        r['_s'] = s; prev = {'key': k, 'end': s['end']}
    cur_key = None; now = None
    mt = lambda r: (dict(zip(('tag', 'hint'), meta(r['_s'])[1:])) if meta else {})        # kind label + raw text of the last visit, for clearer names
    last = L[-1] if L else None
    live = last is not None and now_ms - last['end'] < 180000
    if live:
        r = visits[skey(last)]; cur_key = r['key']
        now = {'key': r['key'], 'name': r['name'], 'kind': r['kind'], 'cat': r['cat'], 'min': round(r['vmin'], 1), 'today': round(r['today']), 'onGoal': bool(ok(last)),
               'links': _goal_links(data, r['key'], names), 'auto': bool(is_auto(r['key'])), 'canLabel': not r['key'].startswith('yt:shorts'), **mt(r)}
    elif now_app:
        now = {'key': '', 'name': ('%s' % now_app.get('app', ''))[:60], 'kind': 'app', 'cat': 'o', 'min': 0, 'today': 0, 'onGoal': False, 'links': [], 'auto': False, 'canLabel': False,
               'note': now_app.get('title', '')}
        if meta:
            try: nm, tag, hint = meta({'kind': 'app', 'app': now_app.get('app', ''), 'title': now_app.get('title', '')}); now.update(name=nm[:60], tag=tag, hint=hint)
            except Exception: pass
    groups = {'prod': [], 'bad': []}
    for r in sorted(visits.values(), key=lambda r: -r['v1']):
        if r['key'] == cur_key: continue
        g = 'prod' if r['cat'] in ('f', 'm') else 'bad' if r['cat'] == 'b' else None
        if not g or len(groups[g]) >= per_group: continue
        groups[g].append({'key': r['key'], 'name': r['name'], 'kind': r['kind'], 'cat': r['cat'], 'min': round(r['vmin'], 1), 'today': round(r['today']), 'agoMin': max(0, round((now_ms - r['v1']) / 60000)),
                          'links': _goal_links(data, r['key'], names), 'auto': bool(is_auto(r['key'])), 'canLabel': not r['key'].startswith('yt:shorts'), **mt(r)})
    unrev = sum(1 for r in visits.values() if r['cat'] == 'o' and r['key'] != cur_key and r['key'].split(':')[0] in ('web', 'app'))
    return {'now': now, 'productive': groups['prod'], 'unproductive': groups['bad'], 'unreviewed': unrev, 't': now_ms}


# ---------------------------------------------------------------- progress map
def progress_tree(data, mins, sessions, cat, skey, disp, days=14, sites_per=4):
    names = _names(data); since = time.time() * 1000 - days * 86400000; va = data.get('va') or {}
    smin = {}; sname = {}; scat = {}; unl = {}
    for s in sessions:
        if s['end'] < since: continue
        c = cat(s)
        if c not in ('f', 'm'): continue
        k = skey(s); d = (s['end'] - s['start']) / 6e4
        smin[k] = smin.get(k, 0) + d; sname.setdefault(k, disp(s)[:50]); scat[k] = c
    per_goal = {}                                                            # goal id -> {key: minutes}
    linked_total = 0.0
    for k, m in smin.items():
        ids = [i for i in _vlist(va.get(k)) if i.startswith('g:') and i in names]
        if not ids: unl[k] = m; continue
        linked_total += m
        for i in ids: per_goal.setdefault(i, {})[k] = m / len(ids)

    def sites(gid):
        row = per_goal.get(gid, {})
        return [{'key': k, 'name': sname.get(k, k), 'min': round(m)} for k, m in sorted(row.items(), key=lambda kv: -kv[1])[:sites_per] if m >= 1]

    def trow(t):
        gid = 'g:task:%s' % t['id']
        return {'id': t['id'], 'title': t.get('title', ''), 'p': 100 if t.get('done') else t.get('p', 0), 'done': bool(t.get('done')), 'spent': round(mins.get(gid, 0)), 'est': t.get('est') or 0,
                'sites': sites(gid), 'rank': t.get('rank') if not t.get('done') else None}
    by_chap = {}; by_exam = {}; loose = []
    for t in data.get('tasks', []):
        if t.get('chap') not in (None, ''): by_chap.setdefault(str(t['chap']), []).append(t)
        elif t.get('exam') not in (None, ''): by_exam.setdefault(str(t['exam']), []).append(t)
        else: loose.append(t)
    exams = []
    for e in data.get('exams', []):
        chs = []
        for c in e.get('ch', []):
            cid = str(c['id']); T = by_chap.get(cid, [])
            chs.append({'id': c['id'], 'name': c.get('name', ''), 'p': c.get('p', 0), 'minutes': round(mins.get('g:chap:%s' % cid, 0)), 'est': c.get('est') or 0, 'follows': len(T) if c.get('auto') else 0,
                        'autoMin': bool(c.get('autoMin')), 'dl': c.get('dl', ''), 'tasks': [trow(t) for t in T], 'sites': sites('g:chap:%s' % cid)})
        direct = by_exam.get(str(e['id']), [])
        alltasks = [t for c in chs for t in c['tasks']] + [trow(t) for t in direct]
        exams.append({'id': e['id'], 'name': e.get('name', ''), 'date': e.get('date', ''), 'prep': round(sum(c['p'] for c in chs) / len(chs)) if chs else 0, 'minutes': round(mins.get('g:exam:%s' % e['id'], 0)),
                      'tasksDone': sum(1 for t in alltasks if t['done']), 'tasksTotal': len(alltasks), 'chapters': chs, 'tasks': [trow(t) for t in direct], 'sites': sites('g:exam:%s' % e['id'])})
    unl_items = [{'key': k, 'name': sname.get(k, k), 'min': round(m), 'cat': scat.get(k)} for k, m in sorted(unl.items(), key=lambda kv: -kv[1]) if m >= 1][:8]
    unl_total = sum(unl.values()); prod_total = unl_total + linked_total
    return {'exams': exams, 'loose': [trow(t) for t in loose if not t.get('done')][:12],
            'review': {'linkedMin': round(linked_total), 'unlinkedMin': round(unl_total), 'pct': round(100 * linked_total / prod_total) if prod_total else 0, 'unlinked': unl_items, 'days': days}}
