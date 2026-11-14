"""Smart features (v12): deadlines with real time, instant Review links, one-call Smart Review, chat intents.

deadlines(data)          exams (date + TIME), tasks and projects with a deadline, each with an epoch-ms `ts` the window counts down to live
link_options(data)       everything a task / site can be linked to (exams, chapters, projects, open tasks)
set_link(data, key, ...) add / remove / clear the exam / topic / task links of a site, app or video (instant, no recalculation)
smart_prompt / parse     ONE request for up to 50 sites + the upcoming exams as context -> [{key, c, links}]
intent(text)             "review my sites", "smart review", "deadlines" typed in Buddy's chat open the right sheet
"""
import datetime, json, re, time
import focus


def ts_of(s):
    """ISO date / datetime (naive = local time) -> epoch ms, or None."""
    try: return int(datetime.datetime.fromisoformat(str(s).replace('Z', '+00:00')).timestamp() * 1000)
    except Exception: return None


def iso_local(ts): return datetime.datetime.fromtimestamp(ts / 1000).strftime('%Y-%m-%dT%H:%M')


def eta_txt(ts, now=None):
    d = (ts - (now or int(time.time() * 1000))) / 60000; late = d < 0; d = abs(d)
    s = '%dd %dh' % (d // 1440, d % 1440 // 60) if d >= 2880 else '%dh %dm' % (d // 60, d % 60) if d >= 60 else '%dm' % max(1, round(d))
    return ('overdue by ' + s) if late else ('in ' + s)


def _s(x): return '' if x is None else str(x)


def deadlines(data, now=None):
    """Sorted by time. Exams: date AND time, readiness, linked tasks. Tasks: the link they carry. Projects: deadline + share of done tasks."""
    now = now or int(time.time() * 1000); out = []; tasks = data.get('tasks', [])
    exams = {_s(e.get('id')): e for e in data.get('exams', [])}
    chs = {_s(c.get('id')): (e, c) for e in data.get('exams', []) for c in e.get('ch', [])}
    projs = {_s(p.get('id')): p for p in data.get('projects', [])}
    for e in data.get('exams', []):
        if focus.exam_over(e): continue
        t = ts_of(e.get('date'))
        if t is None: continue
        ch = e.get('ch') or []; cid = {_s(c.get('id')) for c in ch}
        mine = [x for x in tasks if _s(x.get('exam')) == _s(e.get('id')) or _s(x.get('chap')) in cid]
        out.append({'kind': 'exam', 'id': e.get('id'), 'name': e.get('name', 'Exam'), 'ts': t, 'iso': iso_local(t), 'prep': round(sum(c.get('p', 0) for c in ch) / len(ch)) if ch else None,
                    'tasks': len(mine), 'open': sum(1 for x in mine if not x.get('done')), 'refs': e.get('refs') or [],
                    'ch': [{'id': c.get('id'), 'name': c.get('name', ''), 'p': c.get('p', 0), 'refs': c.get('refs') or [], 'dl': c.get('dl', '')} for c in ch]})
    for x in tasks:
        if x.get('done'): continue
        t = ts_of(x.get('dl'))
        if t is None: continue
        link = lid = ''
        if _s(x.get('chap')) in chs: e, c = chs[_s(x['chap'])]; link, lid = '%s › %s' % (e.get('name', ''), c.get('name', '')), _s(x['chap'])
        elif _s(x.get('exam')) in exams: link, lid = exams[_s(x['exam'])].get('name', ''), 'e:' + _s(x['exam'])
        elif _s(x.get('project')) in projs: link, lid = '📁 ' + projs[_s(x['project'])].get('name', ''), 'p:' + _s(x['project'])
        out.append({'kind': 'task', 'id': x.get('id'), 'name': x.get('title', ''), 'ts': t, 'iso': iso_local(t), 'link': link, 'lid': lid, 'p': x.get('p', 0)})
    for p in data.get('projects', []):
        t = ts_of(p.get('date')) if p.get('date') else None
        if t is None: continue
        pt = [x for x in tasks if _s(x.get('project')) == _s(p.get('id'))]
        out.append({'kind': 'project', 'id': p.get('id'), 'name': p.get('name', 'Project'), 'ts': t, 'iso': iso_local(t),
                    'prep': round(100 * sum(1 for x in pt if x.get('done')) / len(pt)) if pt else None, 'tasks': len(pt), 'open': sum(1 for x in pt if not x.get('done'))})
    out.sort(key=lambda r: r['ts'])
    return out


def add_refs(target, words, limit=20):
    refs = target.setdefault('refs', [])
    for w in words:
        w = re.sub(r'\s+', ' ', str(w)).strip().lower()[:30]
        if w and w not in refs and len(refs) < limit: refs.append(w)
    return refs


def link_options(data):
    """[{gid, tl, name, group}]: gid = what a Review link stores (g:exam:.. / g:chap:.. / g:task:..), tl = what a task link stores (e:<exam id> / chapter id / p:<project id>)."""
    o = []
    for e in data.get('exams', []):
        if focus.exam_over(e): continue
        o.append({'gid': 'g:exam:%s' % e['id'], 'tl': 'e:%s' % e['id'], 'name': e.get('name', 'Exam'), 'group': 'Exams'})
        for c in e.get('ch', []):
            if c.get('p', 0) < 100: o.append({'gid': 'g:chap:%s' % c['id'], 'tl': _s(c['id']), 'name': '%s › %s' % (e.get('name', ''), c.get('name', '')), 'group': 'Topics'})
    for x in [t for t in data.get('tasks', []) if not t.get('done')][:15]:
        o.append({'gid': 'g:task:%s' % x['id'], 'tl': '', 'name': x.get('title', ''), 'group': 'Tasks'})
    for p in data.get('projects', []): o.append({'gid': '', 'tl': 'p:%s' % p['id'], 'name': p.get('name', 'Project'), 'group': 'Projects'})
    return o


def names_of(data, gids):
    nm = {o['gid']: o['name'] for o in link_options(data) if o['gid']}
    return [nm.get(g, g) for g in gids]


def set_link(data, key, op, gid):
    """Instant edit of one site's links. Linking an unreviewed site also marks it productive (its time can only count for a goal when it is productive)."""
    va = data.setdefault('va', {}); cur = va.get(key)
    l = [] if cur in (None, '') else list(cur) if isinstance(cur, list) else [cur]
    if op == 'add' and gid and gid not in l:
        l.append(gid)
        if key not in data.setdefault('v', {}): data['v'][key] = 'f'
    elif op == 'remove': l = [x for x in l if x != gid]
    elif op == 'clear': l = []
    if l: va[key] = l[0] if len(l) == 1 else l
    else: va.pop(key, None)
    return l


# ---------------------------------------------------------------- Smart Review: one request, up to 50 sites
def candidates(sites, limit=50):
    return sorted((r for r in (sites or {}).values() if r.get('min', 0) >= 0.5), key=lambda r: -r['min'])[:limit]


def smart_prompt(data, items, now=None):
    """Returns (messages, codes). Codes (E1, E1.2, T3) keep the answer short; codes -> goal ids."""
    now = now or int(time.time() * 1000); codes = {}; lines = []
    ups = sorted((e for e in data.get('exams', []) if not focus.exam_over(e) and ts_of(e.get('date'))), key=lambda e: ts_of(e['date']))[:5]
    for n, e in enumerate(ups, 1):
        codes['E%d' % n] = 'g:exam:%s' % e['id']; tp = []
        for m, c in enumerate([c for c in e.get('ch', []) if c.get('p', 0) < 100][:8], 1):
            codes['E%d.%d' % (n, m)] = 'g:chap:%s' % c['id']; tp.append('E%d.%d=%s%s' % (n, m, c.get('name', '')[:30], (' [' + ', '.join(c['refs'][:6]) + ']') if c.get('refs') else ''))
        lines.append('E%d %s%s %s (%s)%s' % (n, e.get('name', 'Exam')[:40], (' [' + ', '.join(e['refs'][:6]) + ']') if e.get('refs') else '', eta_txt(ts_of(e['date']), now), datetime.datetime.fromtimestamp(ts_of(e['date']) / 1000).strftime('%a %d %b %H:%M'),
                                          ('; topics: ' + ', '.join(tp)) if tp else ''))
    for n, x in enumerate([t for t in data.get('tasks', []) if not t.get('done')][:8], 1):
        codes['T%d' % n] = 'g:task:%s' % x['id']; dl = ts_of(x.get('dl'))
        lines.append('T%d %s%s' % (n, x.get('title', '')[:50], (' ' + eta_txt(dl, now)) if dl else ''))
    sysm = ('You sort a student\'s websites/apps for a study tracker. Reply with ONLY a JSON array, no prose, no markdown: [{"i":1,"c":"f","l":["E1.2"]}]. '
            'c = f (study/work/useful), b (distraction/entertainment/social), m (meeting/chat with people), o (unsure). '
            'l = codes of the exam, topic or task the item helps, ONLY when c is f and it clearly fits; prefer the exam that is sooner; otherwise []. Never invent codes.')
    user = 'NOW %s\nUPCOMING:\n%s\n\nITEMS (n. name | type | minutes):\n%s' % (datetime.datetime.fromtimestamp(now / 1000).strftime('%a %d %b %H:%M'), '\n'.join(lines) or 'none',
            '\n'.join('%d. %s | %s | %d' % (i, r['name'][:50], 'app' if r.get('kind') == 'app' else 'site', round(r['min'])) for i, r in enumerate(items, 1)))
    return [{'role': 'system', 'content': sysm}, {'role': 'user', 'content': user}], codes


def parse(raw, items, codes):
    """-> [{key, name, kind, min, c, ids}] (unsure / invalid rows dropped)."""
    try:
        a, b = raw.index('['), raw.rindex(']'); arr = json.loads(raw[a:b + 1])
    except Exception:
        return None
    out = []
    for x in arr if isinstance(arr, list) else []:
        try: i = int(x.get('i')) - 1; c = x.get('c')
        except Exception: continue
        if not (0 <= i < len(items)) or c not in ('f', 'b', 'm'): continue
        ids = [codes[k] for k in (x.get('l') or []) if isinstance(k, str) and k in codes] if c == 'f' else []
        r = items[i]; out.append({'key': r['key'], 'name': r['name'], 'kind': r.get('kind'), 'min': round(r['min']), 'c': c, 'ids': list(dict.fromkeys(ids))[:3]})
    return out


# ---------------------------------------------------------------- chat intents
def intent(text):
    t = (text or '').lower().strip()
    if len(t) > 90: return ''
    if re.search(r'\bsmart[\s-]*review\b', t): return 'smart'
    if re.search(r'\b(deadlines?|countdowns?|exam timers?|time left|how long (is )?left|when (is|are) my (exam|test)s?)\b', t): return 'deadlines'
    if re.search(r'^(please )?(review|rate)\b|\breview (my |the |these )?(sites?|apps?|websites?)\b|\bwhat am i doing\b', t): return 'now'
    return ''


def intent_reply(kind, data):
    if kind == 'smart': return "On it ✨ I'll send your top 50 new sites with your upcoming exams to the AI and show you what it suggests.", 'winking'
    if kind == 'now': return 'Here is what you have been up to 🔍 Flip any site, or link it to an exam or topic, right from the list.', 'happy'
    d = [x for x in deadlines(data) if x['kind'] != 'project'][:1]
    return ('Next up: %s %s. All your timers are here 📅' % (d[0]['name'], eta_txt(d[0]['ts'])) if d else 'No dated exams or goals yet. Add one and I will count it down 📅'), 'happy'
