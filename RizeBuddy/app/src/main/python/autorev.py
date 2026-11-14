"""Auto-review (v9): learns how YOU sort sites, apps and videos and does most of the Review for you.

What the student used to do by hand in Review: for every new site / app / video pick Focus / Meeting / Unproductive / Other, then link the
productive ones to a topic or task. This module does both, and only asks about what it is genuinely unsure of.

Evidence (all local, no AI, no network), blended into one probability per class (f = Focus, b = Unproductive, m = Meeting, o = Other):
  1. Lexicon prior   - study tools / learning sites / dev apps vs feeds, streaming, games, shopping, meeting apps
  2. Learned model   - naive Bayes over words + character trigrams of what YOU already labelled (manual labels only, weighted by recency of use);
                       it takes over from the lexicon as your labelled examples grow (full weight at 40 examples)
  3. Topic relevance - overlap with the words of your exams, chapters and tasks (physics -> optics, lens, ...): pushes Focus up
  4. Neighbours      - the company a thing keeps: unknown pages opened inside productive stretches lean Focus (small weight)
Links (which topic / task a Focus item serves):
  - word match with the chapter / task name, and the strongest signal: what you were doing when it was open (Timer entries linked to a task or
    chapter count fully, the current goal at that moment counts half). Only linked when clearly ahead of the runner-up.
Decisions:
  - confidence >= threshold (starts at 0.80)           -> applied automatically (marked "auto", one click to change, wrong = it learns)
  - between 0.60 and the threshold                     -> shown as a suggestion with one-click "Accept"
  - below that                                         -> left for you (Buddy asks only after the usual minutes on it)
The threshold adapts to your feedback: more than 15 % wrong -> stricter; under 5 % wrong and less than half automated -> looser (floor 0.68).
"""
import bisect, math, re, time
import algo

CLASSES = ('f', 'b', 'm', 'o')
THR0, THR_MIN, THR_MAX, MIN_SEC = 0.80, 0.68, 0.93, 20

PROD = re.compile(r'wikipedia|khan ?academy|physics ?wallah|pw\.live|\bpw\b|unacademy|byju|vedantu|toppr|doubtnut|brainly|coursera|\bedx\b|udemy|nptel|swayam|ncert|diksha|geeksforgeeks|leetcode|hackerrank|codeforces|codechef|stack ?overflow|stack ?exchange|github|gitlab|w3schools|\bmdn\b|developer\.mozilla|python\.org|documentation|\bdocs\b|notion|obsidian|overleaf|desmos|geogebra|wolfram|google (docs|sheets|slides|classroom|scholar|drive)|classroom|moodle|researchgate|arxiv|jstor|britannica|aakash|allen digital|resonance|embibe|testbook|gradeup|adda247|claude|chatgpt|gemini|copilot|perplexity|grammarly|quizlet|anki|duolingo|mathway|symbolab|brilliant|ted-?ed|crash ?course|3blue1brown|veritasium|neso academy|apna college|code ?with ?harry|freecodecamp|programiz|javatpoint|tutorialspoint|\.edu\b|\.ac\.in|lecture|tutorial|one shot|oneshot|chapter|ncert|syllabus|previous year|\bpyq\b|neet|\bjee\b|\bcbse\b|\bicse\b|\bisc\b|board exam|revision|numerical|derivation|solved examples|\bmcq\b|class ?(9|10|11|12)|worksheet|mock test|lab manual|textbook', re.I)
DISTRACT = re.compile(r"instagram|facebook|\breels?\b|netflix|prime ?video|hotstar|disney\+?|zee5|sony ?liv|jio ?cinema|youtube shorts|#shorts|tiktok|snapchat|twitter|\bx\.com|reddit|9gag|pinterest|tumblr|twitch|cricbuzz|espn|cricinfo|\bipl\b|live score|dream11|pubg|bgmi|free ?fire|minecraft|roblox|steam|epic games|valorant|fortnite|genshin|chess\.com|lichess|\bmemes?\b|funny|prank|gossip|bollywood|movie|trailer|web series|anime|manga|crunchyroll|amazon\.in|flipkart|myntra|meesho|zomato|swiggy|ajio|olx|shopping|gameplay|let'?s play|walkthrough|vlog|roast|reaction|podcast|full episode|songs?\b|\blyrics?\b|music video|\bmv\b", re.I)
MEETING = re.compile(r'\bzoom\b|\bteams\b|webex|google meet|\bmeet\b|skype|\bgmeet\b', re.I)
CHAT = re.compile(r'whatsapp|telegram|discord|signal|messenger|slack|spotify|gaana|jiosaavn|apple music|wynk|vlc|media player', re.I)
APP_PROD = re.compile(r'^(code|devenv|idea\d*|pycharm\d*|webstorm\d*|clion|rider|figma|winword|excel|powerpnt|onenote|acrobat|acrord32|foxit\w*|sumatrapdf|kindle|calibre|anki|jupyter\w*|spyder|rstudio|matlab|geogebra\w*|autocad|notion|obsidian|terminal|windowsterminal|powershell|cmd|postman|notepad\+\+|sublime_text|android ?studio|studio64|blender|eclipse|netbeans|texstudio|typora|xmind|libreoffice\w*|soffice|swriter|scalc)$', re.I)


# ---------------------------------------------------------------- text -> features
def _split(key):
    k, _, rest = key.partition(':'); return k, rest


def features(key, titles=()):
    """{feature: weight}: words of the name (1), words of sample page titles (.5), character trigrams of the name (.25)."""
    kind, name = _split(key); f = {}
    for w in algo.toks(name): f['w:' + w] = 1.0
    for t in list(titles)[:5]:
        for w in algo.toks(t): f.setdefault('w:' + w, .5)
    flat = re.sub(r'[^a-z0-9]', '', name.lower())[:40]
    for i in range(max(0, len(flat) - 2)): f.setdefault('t:' + flat[i:i + 3], .25)
    f['k:' + kind] = .5
    return f


def prior(key, text):
    """Lexicon belief -> ({class: prob}, strength 0..1)."""
    kind, name = _split(key); t = (name + ' ' + text).lower()
    base = {c: .02 for c in CLASSES}
    if MEETING.search(name): base.update(m=.9); s = .9
    elif DISTRACT.search(t) and not PROD.search(name): base.update(b=.9); s = .9
    elif kind == 'app' and APP_PROD.match(name): base.update(f=.9); s = .9
    elif PROD.search(t) and not DISTRACT.search(name): base.update(f=.88 if PROD.search(name) else .72); s = .88 if PROD.search(name) else .6
    elif CHAT.search(t): base.update(o=.6, b=.25, f=.1); s = .4
    else: return {'f': .25, 'b': .25, 'm': .03, 'o': .47}, 0.0
    z = sum(base.values()); return {c: v / z for c, v in base.items()}, s


# ---------------------------------------------------------------- learned model (naive Bayes with Laplace smoothing, evidence capped so it is never over-sure)
class NB:
    def __init__(self, items):
        """items: [(features, class)]"""
        self.n = len(items); self.cc = {c: 0 for c in CLASSES}; self.fc = {c: {} for c in CLASSES}; self.tot = {c: 0.0 for c in CLASSES}; self.vocab = set()
        for f, c in items:
            self.cc[c] += 1
            for k, w in f.items():
                self.fc[c][k] = self.fc[c].get(k, 0) + w; self.tot[c] += w; self.vocab.add(k)

    def probs(self, f):
        if self.n < 8: return None
        V = max(1, len(self.vocab)); lp = {}; known = [(k, w) for k, w in f.items() if k in self.vocab]
        if not known: return None
        norm = sum(w for _, w in known); cap = min(1.0, 6.0 / max(1.0, norm))          # at most ~6 features' worth of evidence
        for c in CLASSES:
            s = math.log((self.cc[c] + 1) / (self.n + len(CLASSES)))
            for k, w in known: s += cap * w * math.log((self.fc[c].get(k, 0) + .5) / (self.tot[c] + .5 * V))
            lp[c] = s
        m = max(lp.values()); e = {c: math.exp(v - m) for c, v in lp.items()}; z = sum(e.values())
        return {c: v / z for c, v in e.items()}


def _mix(a, b, wb):
    return {c: (1 - wb) * a[c] + wb * b[c] for c in CLASSES}


def _norm(p):
    z = sum(p.values()) or 1; return {c: v / z for c, v in p.items()}


# ---------------------------------------------------------------- topics
def topic_vocab(data):
    """Words of the exams, open chapters and open tasks (+ the vocabulary of the subjects they mention) -> {word: weight 1 direct | .5 subject}."""
    vocab = {}
    names = []
    for e in data.get('exams', []):
        if _over(e): continue
        names.append(e.get('name', '') + ' ' + ' '.join(e.get('refs') or []))
        for c in e.get('ch', []):
            if (c.get('p', 0) or 0) < 100: names.append(c.get('name', '') + ' ' + ' '.join(c.get('refs') or []))
    for t in data.get('tasks', []):
        if not t.get('done'): names.append(t.get('title', ''))
    for n in names:
        for w in algo.toks(n, True): vocab[w] = 1.0
    direct = set(vocab)
    for w in algo.expand(direct) - direct: vocab.setdefault(w, .5)
    return vocab


def _over(e):
    try: return algo._over(e)
    except Exception: return False


def relevance(feat, vocab):
    hits = sum(vocab[k[2:]] for k in feat if k.startswith('w:') and k[2:] in vocab)
    return min(1.0, hits / 2.0)


# ---------------------------------------------------------------- goals an item could serve
def goal_candidates(data):
    """[(goal id, name, tokens)] for open tasks, open chapters, exams (not over)."""
    out = []
    for t in data.get('tasks', []):
        if not t.get('done'): out.append(('g:task:%s' % t['id'], t.get('title', ''), algo.toks(t.get('title', ''), True), 0))
    for e in data.get('exams', []):
        if _over(e): continue
        en = algo.toks(e.get('name', '') + ' ' + ' '.join(e.get('refs') or []), True)
        out.append(('g:exam:%s' % e['id'], e.get('name', ''), en, 2))
        for c in e.get('ch', []):
            if (c.get('p', 0) or 0) < 100: out.append(('g:chap:%s' % c['id'], c.get('name', ''), algo.toks(c.get('name', '') + ' ' + ' '.join(c.get('refs') or []), True), 1))
    return out


def name_score(feat, g):
    """How well the words of an item match this goal: direct name words count fully, the subject's wider vocabulary half."""
    gid, name, toks, _lvl = g
    if not toks: return 0.0
    ex = algo.expand(toks); hits = 0.0
    for k in feat:
        if not k.startswith('w:'): continue
        w = k[2:]
        if w in toks: hits += 1.0
        elif w in ex: hits += .35
    return hits / (hits + 1.0) if hits else 0.0


def evidence(data, sessions, cls_of, skey, days=30):
    """{item key: {goal id: minutes}} of what the student was doing while the item was open: Timer entries linked to a task / chapter (x1),
    the current goal at that moment (x.5). Only items classed Focus are counted."""
    import links, focus
    since = time.time() * 1000 - days * 86400000; ev = {}
    iv = []
    for gid, L in links._ivals(data).items():
        for a, b in L: iv.append((a, b, gid))
    iv.sort(); starts = [x[0] for x in iv]
    for s in sessions:
        if s['end'] < since: continue
        k = skey(s)
        if cls_of(k) != 'f': continue
        d = (s['end'] - s['start']) / 6e4; row = ev.setdefault(k, {})
        i = bisect.bisect_right(starts, s['end']) - 1; n = 0
        while i >= 0 and n < 12 and iv[i][1] > s['start'] - 6 * 3600000:
            a, b, gid = iv[i]; ov = (min(b, s['end']) - max(a, s['start'])) / 6e4
            if ov > 0: row[gid] = row.get(gid, 0) + ov
            i -= 1; n += 1
        g = focus.goal_at(data, s['start'])
        if g.get('id', '').startswith('g:'): row[g['id']] = row.get(g['id'], 0) + d * .5
    return ev


def best_links(feat, cands, ev_row, total_min):
    """-> ([goal ids], confidence, why) or ([], 0, '')"""
    sc = {}
    for g in cands:
        s = name_score(feat, g)
        if s: sc[g[0]] = (s, 'words')
    if ev_row and total_min > 0:
        tot = sum(ev_row.values())
        for gid, m in ev_row.items():
            share = m / max(total_min, tot) if tot >= 4 else 0
            if share >= .35 and share > sc.get(gid, (0,))[0]: sc[gid] = (min(.95, share + .1), 'what you were doing')
    if not sc: return [], 0.0, ''
    lvl = {g[0]: g[3] for g in cands}
    order = sorted(sc.items(), key=lambda kv: (-kv[1][0], lvl.get(kv[0], 0)))
    (g1, (s1, w1)) = order[0]; s2 = order[1][1][0] if len(order) > 1 else 0
    if s1 >= .6 and s1 - s2 >= .15: return [g1], s1, w1
    return [], 0.0, ''


# ---------------------------------------------------------------- state
def A(data):
    a = data.setdefault('auto', {})
    a.setdefault('items', {}); a.setdefault('sug', {}); a.setdefault('blocked', {}); a.setdefault('thr', THR0); a.setdefault('right', 0); a.setdefault('wrong', 0)
    a.setdefault('since', int(time.time() * 1000)); a.setdefault('on', True)
    return a


def is_auto(data, key):
    return key in A(data)['items']


def _adapt(a):
    n = a['right'] + a['wrong']
    if n >= 8:
        err = a['wrong'] / n
        if err > .15: a['thr'] = min(THR_MAX, a['thr'] + .02)
        elif err < .05: a['thr'] = max(THR_MIN, a['thr'] - .01)


def sync(data):
    """Drop auto marks the student has overridden (class changed -> counts as wrong) or deleted (purge). Returns True if anything changed."""
    a = A(data); v = data.get('v') or {}; ch = False
    for k, it in list(a['items'].items()):
        cur = v.get(k)
        if cur is None: del a['items'][k]; ch = True; continue
        cur = {'p': 'f', 'u': 'b'}.get(cur, cur)
        if cur != it['c']: del a['items'][k]; a['wrong'] += 1; ch = True; _adapt(a)
    for k in list(a['sug']):
        if k in v: del a['sug'][k]; ch = True
    return ch


def feedback(data, key, op, c=None):
    """op: 'set' (student chose class c in Review), 'unlink' (removed an auto link), 'accept' (took a suggestion), 'acceptall', 'reject' (dismiss a suggestion)."""
    a = A(data); v = data.setdefault('v', {}); va = data.setdefault('va', {})
    if op == 'acceptall':
        n = 0
        for k in list(a['sug']): n += feedback(data, k, 'accept')
        return n
    if op == 'accept':
        s = a['sug'].pop(key, None)
        if not s: return 0
        v[key] = s['c']; a['right'] += 1; _adapt(a)
        if s.get('links') and key not in va: va[key] = s['links'][0] if len(s['links']) == 1 else s['links']
        return 1
    if op == 'reject': a['sug'].pop(key, None); a['blocked'][key] = 1; return 1
    it = a['items'].pop(key, None)
    if op == 'set' and it:
        if it['c'] == c: a['right'] += 1
        else: a['wrong'] += 1
        _adapt(a)
    elif op == 'unlink':
        a['blocked'][key] = 1
        if it:
            it['links'] = []; a['items'][key] = it; a['wrong'] += 1; _adapt(a)
    a['sug'].pop(key, None)
    return 1


# ---------------------------------------------------------------- the pass
def run(data, lock, skey, disp, reviewable, now_ms=None):
    """One pass over the last 30 days of sessions. Applies confident decisions, records suggestions. Returns a small summary."""
    now_ms = now_ms or int(time.time() * 1000); a = A(data)
    if not a.get('on', True): return {'applied': 0, 'suggested': 0}
    with lock:
        sync(data); since = now_ms - 30 * 86400000
        sess = [s for s in data.get('sessions', []) if s['end'] >= since]
        v = dict(data.get('v') or {}); va = dict(data.get('va') or {}); tasks_ct = len(data.get('tasks', []))
        vocab = topic_vocab(data); cands = goal_candidates(data); auto_items = dict(a['items'])
    seen = {}
    for s in sess:
        if not reviewable(s): continue
        k = skey(s)
        if k == 'yt:shorts': continue
        r = seen.setdefault(k, {'sec': 0.0, 'titles': [], 'first': s['start'], 'last': s['end']})
        r['sec'] += (s['end'] - s['start']) / 1000; r['last'] = max(r['last'], s['end'])
        t = s.get('title') or ''
        if s['kind'] == 'browser' and t not in r['titles'] and len(r['titles']) < 5: r['titles'].append(t)
    # training set: only labels the student gave (an auto label is not evidence)
    train = []
    for k, c in v.items():
        c = {'p': 'f', 'u': 'b'}.get(c, c)
        if c not in CLASSES or k in auto_items or k == 'yt:shorts': continue
        r = seen.get(k); train.append((features(k, r['titles'] if r else ()), c))
    nb = NB(train); wnb = min(.8, len(train) / 40.0) if nb.n >= 8 else 0.0
    # neighbours: what the minutes around an item usually are
    cls_of = lambda k: ({'p': 'f', 'u': 'b'}.get(v.get(k), v.get(k)) or (auto_items.get(k) or {}).get('c'))
    order = sorted(sess, key=lambda s: s['start']); nbr = {}
    for i, s in enumerate(order):
        k = skey(s)
        if cls_of(k): continue
        for j in (i - 1, i + 1):
            if 0 <= j < len(order):
                o = order[j]; gap = abs((o['start'] if j > i else s['start']) - (s['end'] if j > i else o['end']))
                if gap <= 120000 and cls_of(skey(o)) in ('f', 'b'): d = nbr.setdefault(k, [0.0, 0.0]); d[0 if cls_of(skey(o)) == 'f' else 1] += 1
    ev = evidence(data, sess, lambda k: cls_of(k), skey)
    applied = suggested = 0; thr = a['thr']; out_items = {}; out_sug = {}; new_links = {}
    for k, r in seen.items():
        total_min = r['sec'] / 60
        feat = features(k, r['titles']); text = ' '.join(r['titles'])
        have = cls_of(k)
        if have is None and r['sec'] >= MIN_SEC:
            pr, strength = prior(k, text)
            p = pr
            pn = nb.probs(feat)
            if pn is not None and wnb > 0:                                          # product of experts: agreement raises confidence, disagreement lowers it
                p = _norm({c: pr[c] * (max(pn[c], 1e-4) ** wnb) for c in CLASSES})
            rel = relevance(feat, vocab)
            if rel > 0: p = _norm({**p, 'f': p['f'] + .3 * rel * (1 - p['f'])})
            if strength < .8 and k in nbr:
                nf, nbd = nbr[k]; tot = nf + nbd
                if tot >= 2: ratio = nf / tot; p = _norm({**p, 'f': p['f'] * (1 + .25 * (ratio - .5)), 'b': p['b'] * (1 - .25 * (ratio - .5))})
            top = sorted(p.items(), key=lambda kv: -kv[1]); c1, p1 = top[0]; p2 = top[1][1]
            if a['blocked'].get(k): continue
            if p1 >= thr and p1 - p2 >= .25: out_items[k] = {'c': c1, 'conf': round(p1, 2), 't': now_ms, 'name': disp_name(k, r), 'why': _why(k, r, strength, pn, rel), 'links': []}; have = c1
            elif p1 >= .6 and p1 - p2 >= .2: out_sug[k] = {'c': c1, 'conf': round(p1, 2), 'name': disp_name(k, r), 'why': _why(k, r, strength, pn, rel), 'links': []}
        # links: for every Focus item (automatic or the student's own) that has no link yet
        if have == 'f' and k not in va and not a['blocked'].get(k):
            ids, conf, why = best_links(feat, cands, ev.get(k), total_min)
            if ids:
                if k in out_items: out_items[k]['links'] = ids; out_items[k]['lwhy'] = why
                elif k in out_sug: out_sug[k]['links'] = ids
                elif k not in new_links and total_min >= 1: new_links[k] = {'ids': ids, 'why': why, 'conf': conf}
    with lock:
        for k, it in out_items.items():
            if k in data['v']: continue
            data['v'][k] = it['c']; a['items'][k] = it; applied += 1
            if it['links'] and k not in data.setdefault('va', {}): data['va'][k] = it['links'][0]
        for k, nl in new_links.items():                                            # the student's own Focus item, link added by us
            if k in data['v'] and k not in data.setdefault('va', {}):
                data['va'][k] = nl['ids'][0]; a['items'].setdefault(k, {'c': {'p': 'f'}.get(data['v'][k], data['v'][k]), 'conf': round(nl['conf'], 2), 't': now_ms, 'name': k.split(':', 1)[-1][:60], 'why': 'link only', 'links': nl['ids'], 'lwhy': nl['why'], 'linkOnly': True}); applied += 1
        keep = {k: x for k, x in a['sug'].items() if x.get('ai') and k not in data['v']}                  # Smart-review suggestions survive the rebuild
        a['sug'] = {k: s for k, s in out_sug.items() if k not in data['v']}
        for k, x in keep.items(): a['sug'].setdefault(k, x)
        suggested = len(a['sug'])
        a['last'] = now_ms
    return {'applied': applied, 'suggested': suggested}


def disp_name(k, r):
    kind, name = _split(k)
    return (name or k)[:60]


def _why(k, r, strength, pn, rel):
    bits = []
    if strength >= .85: bits.append('known kind of site / app')
    if pn is not None: bits.append('similar to things you labelled')
    if rel > 0: bits.append('matches your exam words')
    return ', '.join(bits) or 'best guess'


def coverage(data, skey, reviewable, days=14):
    """How much of the Review is being done for you: {auto, manual, pending, pct} over the new items (first seen since auto-review began)."""
    a = A(data); since = time.time() * 1000 - days * 86400000; v = data.get('v') or {}; seen = {}
    for s in data.get('sessions', []):
        if s['end'] < since or not reviewable(s): continue
        k = skey(s)
        if k == 'yt:shorts': continue
        r = seen.setdefault(k, [0.0, s['start']]); r[0] += (s['end'] - s['start']) / 1000; r[1] = min(r[1], s['start'])
    auto = man = pend = 0; au_min = ma_min = pe_min = 0.0
    for k, (sec, first) in seen.items():
        if sec < MIN_SEC: continue
        m = sec / 60
        if k in a['items']: auto += 1; au_min += m
        elif k in v:
            if first >= a['since'] - 86400000 * 2: man += 1; ma_min += m
        else: pend += 1; pe_min += m
    n = auto + man + pend
    return {'auto': auto, 'manual': man, 'pending': pend, 'pct': round(100 * auto / n) if n else 0, 'autoMin': round(au_min), 'manualMin': round(ma_min), 'pendingMin': round(pe_min),
            'suggested': len(a['sug']), 'thr': round(a['thr'], 2), 'right': a['right'], 'wrong': a['wrong']}
