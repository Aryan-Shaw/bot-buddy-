"""Links engine (v9): the one place that knows how Tasks, exam Chapters, Exams, the current Goal, Review links and the Timer fit together.

Before v9 each screen kept its own idea of this (minutes were only calculated inside the dashboard page, a finished task left the
current goal pointing at nothing, deleting a task left dangling links, Buddy and the dashboard disagreed). Everything now goes through here:

  normalize(data)            clean + repair links after ANY change (dangling ids, done <-> 100 %, task -> chapter auto link)
  minutes(data, ...)         minutes spent per task / chapter / exam (linked sites + apps, timer entries, tasks inside a chapter)
  sync_progress(data, mins)  progress that follows by itself: task % from time vs its estimate, chapter % from its tasks or its time
                             (always adjustable by hand: your value becomes the new starting point and the automation moves it from there)
  goal_ids(data, goal)       everything that counts as "work on this goal" (a task counts for its chapter, a chapter for its tasks, an exam for all)
  housekeeping(data)         current goal finished / deleted -> advance to the next best thing (returns what happened so Buddy can say it)
"""
import datetime, re, time

DAYMS = 86400000


def _s(x): return '' if x is None else str(x)


# ---------------------------------------------------------------- lookups
def chap_index(data):
    """{chapter id (str): (exam, chapter)}"""
    return {_s(c.get('id')): (e, c) for e in data.get('exams', []) for c in e.get('ch', [])}


def task_index(data):
    return {_s(t.get('id')): t for t in data.get('tasks', [])}


def exam_index(data):
    return {_s(e.get('id')): e for e in data.get('exams', [])}


def exists(data, gid):
    """Does the exam / chapter / task behind a goal id ('g:exam:..', 'g:chap:..', 'g:task:..') still exist?"""
    gid = _s(gid)
    if gid.startswith('g:task:'): return gid[7:] in task_index(data)
    if gid.startswith('g:chap:'): return gid[7:] in chap_index(data)
    if gid.startswith('g:exam:'): return gid[7:] in exam_index(data)
    return True


# ---------------------------------------------------------------- goal families
def goal_ids(data, g):
    """Ids that count as work for goal g. A task counts for its chapter, a chapter for the tasks linked to it, an exam for its chapters and their tasks.
    Returns (ids, names): names feed the keyword match, so 'Optics' on screen counts for the task 'Solve optics worksheet' too."""
    gid = _s((g or {}).get('id')); ids = {gid} if gid else set(); names = [(g or {}).get('name', '')]
    tasks, chaps, exams = task_index(data), chap_index(data), exam_index(data)
    by_chap = {}
    for t in data.get('tasks', []):
        if t.get('chap') not in (None, ''): by_chap.setdefault(_s(t['chap']), []).append(t)

    def add_chap(cid):
        if cid in chaps:
            ids.add('g:chap:' + cid); names.append(chaps[cid][1].get('name', '')); names.extend(chaps[cid][1].get('refs') or [])
            for t in by_chap.get(cid, []): ids.add('g:task:' + _s(t['id'])); names.append(t.get('title', ''))
    if gid.startswith('g:task:'):
        t = tasks.get(gid[7:])
        if t and t.get('chap') not in (None, ''): add_chap(_s(t['chap']))
    elif gid.startswith('g:chap:'): add_chap(gid[7:])
    elif gid.startswith('g:exam:'):
        e = exams.get(gid[7:])
        if e:
            names.extend(e.get('refs') or [])
            for c in e.get('ch', []): add_chap(_s(c.get('id')))
            for t in data.get('tasks', []):
                if _s(t.get('exam')) == gid[7:]: ids.add('g:task:' + _s(t['id'])); names.append(t.get('title', ''))
    if gid.startswith('g:task:'):
        t = tasks.get(gid[7:])
        if t and t.get('exam') not in (None, '') and _s(t['exam']) in exams: ids.add('g:exam:' + _s(t['exam'])); names.append(exams[_s(t['exam'])].get('name', '')); names.extend(exams[_s(t['exam'])].get('refs') or [])
    return ids, names


# ---------------------------------------------------------------- minutes per task / chapter / exam
def _ivals(data):
    """Timer entries (the dashboard / Buddy Timer) as {goal id: [(start, end)]}. A break entry never counts as study.
    An entry belongs to a task by its id (taskId, filled in by normalize()), so renaming a task never loses its time; the title is only a fallback."""
    iv = {}; tasks = data.get('tasks', []); by_title = {}; ids = {_s(t['id']) for t in tasks}
    for t in tasks: by_title.setdefault((t.get('title') or '').strip(), []).append(_s(t['id']))
    for e in data.get('entries', []):
        if e.get('kind') in ('b', 'x'): continue
        a, b = e.get('start'), e.get('end')
        if not isinstance(a, (int, float)) or not isinstance(b, (int, float)) or b <= a: continue
        if e.get('taskId') not in (None, '') and _s(e['taskId']) in ids: iv.setdefault('g:task:' + _s(e['taskId']), []).append((a, b))
        elif e.get('task'):
            for tid in by_title.get((e['task'] or '').strip(), []): iv.setdefault('g:task:' + tid, []).append((a, b))
        ch = (e.get('link') or {}).get('ch')
        if ch not in (None, ''): iv.setdefault('g:chap:' + _s(ch), []).append((a, b))
    return iv


def minutes(data, sessions, cat, skey, days=120):
    """{goal id: minutes}. Own time of a task / chapter / exam = timer entries + the share of every linked site / app (a site linked to two topics splits
    its time, time the timer already logged for the same topic is never counted twice). Then a chapter also gets its tasks' time, an exam its chapters'.
    cat(s) -> 'f'|'m'|'b'|'o' and skey(s) -> review key are the tracker's own functions."""
    since = time.time() * 1000 - days * DAYMS; va = data.get('va') or {}; iv = _ivals(data); own = {}
    for gid, L in iv.items(): own[gid] = sum(b - a for a, b in L) / 6e4
    if va:
        for s in sessions:
            if s['end'] < since: continue
            k = skey(s); v = va.get(k)
            if not v: continue
            ids = [x for x in (v if isinstance(v, list) else [v]) if isinstance(x, str) and x.startswith('g:')]
            if not ids or cat(s) not in ('f', 'm'): continue
            d = (s['end'] - s['start']) / 6e4
            for gid in ids:
                ov = sum(max(0, min(b, s['end']) - max(a, s['start'])) for a, b in iv.get(gid, ())) / 6e4
                own[gid] = own.get(gid, 0) + max(0, d - min(d, ov)) / len(ids)
    out = dict(own); chaps = chap_index(data)
    for t in data.get('tasks', []):                                          # tasks inside a chapter add to the chapter
        c = _s(t.get('chap'))
        if c in chaps: out['g:chap:' + c] = out.get('g:chap:' + c, 0) + own.get('g:task:' + _s(t['id']), 0)
    exams = exam_index(data); direct = {}
    for t in data.get('tasks', []):                                          # tasks linked straight to an exam (no chapter) add to the exam
        x = _s(t.get('exam'))
        if x in exams and _s(t.get('chap')) not in chaps: direct[x] = direct.get(x, 0) + own.get('g:task:' + _s(t['id']), 0)
    for e in data.get('exams', []):
        eid = 'g:exam:' + _s(e['id']); out[eid] = own.get(eid, 0) + direct.get(_s(e['id']), 0) + sum(out.get('g:chap:' + _s(c['id']), 0) for c in e.get('ch', []))
    return {k: round(v, 1) for k, v in out.items() if v}


# ---------------------------------------------------------------- text similarity (task title <-> chapter name)
_STOP = set('the and for with from this that into your chapter topic unit part lesson solve solving revise revision study complete finish practice questions question exercise exercises notes read reading do make'.split())


def _w(text):
    out = set()
    for w in re.findall(r'[a-z0-9]+', (text or '').lower()):
        if len(w) < 3 or w in _STOP: continue
        for suf in ('ing', 'es', 's', 'ed'):
            if len(w) > len(suf) + 3 and w.endswith(suf): w = w[:-len(suf)]; break
        out.add(w)
    return out


def similarity(a, b):
    """0..1 word overlap (Dice) between two names."""
    A, B = _w(a), _w(b)
    return 0.0 if not A or not B else 2 * len(A & B) / (len(A) + len(B))


def auto_link_tasks(data):
    """A task without a chapter gets linked to the exam chapter its title clearly matches (best >= .5 and clearly ahead of the runner-up).
    The student can remove the link; a task they unlinked ('nolink') is never auto-linked again. Returns True if anything changed."""
    changed = False; cands = []
    for e in data.get('exams', []):
        for c in e.get('ch', []):
            if c.get('p', 0) < 100: cands.append((_s(c['id']), c.get('name', ''), e.get('name', '')))
    if not cands: return False
    for t in data.get('tasks', []):
        if t.get('done') or t.get('nolink') or t.get('chap') not in (None, '') or t.get('exam') not in (None, ''): continue
        sc = sorted(((max(similarity(t.get('title', ''), n), similarity(t.get('title', ''), n + ' ' + en) * .9), cid) for cid, n, en in cands), reverse=True)
        if sc and sc[0][0] >= .5 and (len(sc) == 1 or sc[0][0] - sc[1][0] >= .2):
            t['chap'] = sc[0][1] if not sc[0][1].isdigit() else int(sc[0][1]); t['autoChap'] = True; changed = True
    return changed


# ---------------------------------------------------------------- repair
def normalize(data, today=None):
    """Repair every link after any change. Returns True if something was fixed."""
    changed = False; today = today or datetime.date.today().isoformat()
    chaps = chap_index(data)
    for t in data.get('tasks', []):
        if t.get('done') and t.get('p') != 100: t['p'] = 100; changed = True
        if not t.get('done') and (t.get('p') or 0) >= 100: t['done'] = True; changed = True
        if t.get('done') and not t.get('doneDay'): t['doneDay'] = today; changed = True
        if not t.get('done') and t.get('doneDay'): t['doneDay'] = ''; changed = True
        if t.get('chap') not in (None, '') and _s(t['chap']) not in chaps: t.pop('chap', None); t.pop('autoChap', None); changed = True     # chapter / exam was deleted
        if t.get('exam') not in (None, '') and (_s(t['exam']) not in exam_index(data) or t.get('chap') not in (None, '')): t.pop('exam', None); changed = True   # exam deleted, or a chapter is the closer link
        if t.get('est') is not None and not isinstance(t['est'], (int, float)):
            try: t['est'] = max(0, float(t['est']))
            except Exception: t.pop('est', None); changed = True
    by_title = {}
    for t in data.get('tasks', []): by_title.setdefault((t.get('title') or '').strip(), []).append(t)
    tid = task_index(data)
    for e in data.get('entries', []):                                        # Timer entries follow their task by id (survives renames); old ones are matched by title once
        if e.get('taskId') not in (None, ''):
            t = tid.get(_s(e['taskId']))
            if t is None: e.pop('taskId', None); changed = True
            elif e.get('task') != t.get('title'): e['task'] = t.get('title', ''); changed = True
        elif e.get('task') and e['task'] not in ('Break', 'Workout'):
            L = by_title.get((e['task'] or '').strip(), [])
            if len(L) == 1: e['taskId'] = L[0]['id']; changed = True
    va = data.get('va') or {}
    for k in list(va):                                                       # Review links to things that no longer exist
        v = va[k]; L = v if isinstance(v, list) else [v]
        keep = [x for x in L if not (isinstance(x, str) and x.startswith('g:') and not exists(data, x))]
        if len(keep) != len(L):
            changed = True
            if keep: va[k] = keep if len(keep) > 1 else keep[0]
            else: del va[k]
    if auto_link_tasks(data): changed = True
    return changed


# ---------------------------------------------------------------- progress that follows by itself
def sync_progress(data, mins=None):
    """Task % and chapter % follow the work by themselves. Returns True if anything changed.

    Task:    done = 100. With an estimate ('est' minutes) progress = what the student last set + time worked since / estimate (max 95: finishing is the
             student's call). Setting the slider by hand re-bases it, so the automation never fights the student.
    Chapter: tasks linked to it move the chapter from the value YOU last set (slider / Buddy / quick look), all tasks done = 100. No tasks but a
             study estimate ('est' minutes) -> same time rule. Neither -> the manual slider stays."""
    mins = mins or {}; changed = False
    for t in data.get('tasks', []):
        est = t.get('est') or 0
        if t.get('done') or est <= 0:
            if t.pop('_p', None) is not None: changed = True
            continue
        spent = mins.get('g:task:' + _s(t['id']), 0)
        if t.get('_p') is None or t.get('p') != t.get('_p'):                 # first sight, or the student moved it: re-base
            t['p0'] = t.get('p', 0) or 0; t['m0'] = spent
        p = int(min(95, max(0, round(t['p0'] + (spent - t['m0']) / est * 100))))
        if p != t.get('p') or t.get('_p') != p: t['p'] = p; t['_p'] = p; changed = True
    by = {}
    for t in data.get('tasks', []):
        c = t.get('chap')
        if c not in (None, ''): by.setdefault(_s(c), []).append(100 if t.get('done') else max(0, min(100, int(t.get('p', 0) or 0))))
    for e in data.get('exams', []):
        for c in e.get('ch', []):
            cid = _s(c.get('id')); L = by.get(cid); est = c.get('est') or 0
            if L:
                avg = sum(L) / len(L); cur = c.get('p', 0) or 0
                # The chapter's own progress is YOUR number (slider, Buddy, quick look). Linked tasks then move it from there: a0 = their average when
                # you last set it, so 0 -> 100 % on the tasks takes the chapter from your value up to 100 %. Adding / removing a task or moving the
                # slider re-bases, so nothing ever jumps (v9 reset the chapter to the tasks' average and locked the slider).
                manual = c.get('_p') is not None and cur != c.get('_p')
                if c.get('_p') is None or manual or c.get('nT') != len(L):
                    if not manual and c.get('_p') is not None and cur >= 100 and avg < 100: cur = round(avg)      # unfinished work added to a "complete" chapter reopens it
                    c['p0'] = cur; c['a0'] = avg; c['nT'] = len(L)
                p0, a0 = c.get('p0', cur), c.get('a0', avg)
                if avg >= 100: p = 100
                elif avg >= a0: p = p0 + (avg - a0) * ((100 - p0) / (100 - a0) if a0 < 100 else 0)
                else: p = p0 * (avg / a0 if a0 > 0 else 0)
                p = int(max(0, min(100, round(p))))
                if c.get('p') != p or c.get('_p') != p or c.get('auto') != len(L) or c.get('autoMin'): c['p'] = p; c['_p'] = p; c['auto'] = len(L); c.pop('autoMin', None); changed = True
            elif est > 0:
                spent = mins.get('g:chap:' + cid, 0)
                if c.get('_p') is None or c.get('p') != c.get('_p'): c['p0'] = c.get('p', 0) or 0; c['m0'] = spent
                p = int(min(95, max(0, round(c['p0'] + (spent - c['m0']) / est * 100))))
                if c.get('p') != p or c.get('_p') != p or not c.get('autoMin') or c.get('auto'): c['p'] = p; c['_p'] = p; c['autoMin'] = True; c.pop('auto', None); changed = True
            elif c.get('auto') or c.get('autoMin') or c.get('_p') is not None:
                for k in ('auto', 'autoMin', '_p', 'p0', 'a0', 'nT', 'm0'): c.pop(k, None)
                changed = True
    return changed


# ---------------------------------------------------------------- the current goal follows the work
def finished(data, gid):
    """Is the exam / chapter / task behind this goal id finished (or gone, or its exam over)?"""
    gid = _s(gid)
    if not gid.startswith('g:'): return False
    if not exists(data, gid): return True
    if gid.startswith('g:task:'): return bool(task_index(data)[gid[7:]].get('done'))
    if gid.startswith('g:chap:'):
        e, c = chap_index(data)[gid[7:]]; return (c.get('p', 0) or 0) >= 100 or _exam_over(e)
    if gid.startswith('g:exam:'): return _exam_over(exam_index(data)[gid[7:]])
    return False


def _exam_over(e):
    try: dt = datetime.datetime.fromisoformat(str(e.get('date')).replace('Z', '+00:00'))
    except Exception: return False
    return dt < (datetime.datetime.now() if dt.tzinfo is None else datetime.datetime.now(datetime.timezone.utc))


def housekeeping(data, focus_mod, plan_fn):
    """When the current goal is finished or deleted, move on to what the plan says is next (or 'Anything' if there is nothing left).
    plan_fn() -> algo.plan result. Returns None or {'done': old goal, 'next': new goal or None, 'why': text}."""
    g = focus_mod.F(data)['goal']; gid = g.get('id', '')
    if not gid.startswith('g:') or not finished(data, gid): return None
    old = dict(g); missing = not exists(data, gid)
    try: pl = plan_fn() or {}
    except Exception: pl = {}
    pick = pl.get('task') or pl.get('top') or pl.get('pick')                 # urgent task, then YOUR #1 ranked goal, then the exam plan
    nxt = None
    if pick and pick['id'] != gid and not finished(data, pick['id']):
        nxt = {'id': pick['id'], 'name': pick['name'], 'kind': pick.get('kind', 'task' if pick['id'].startswith('g:task:') else 'chap')}
    focus_mod.set_goal(data, nxt['id'] if nxt else '', nxt['name'] if nxt else '', nxt['kind'] if nxt else '')
    return {'done': old, 'next': nxt, 'gone': missing, 'why': (pick or {}).get('why', '')}
