"""Algorithmic Buddy brain (the "90 %" part). No network, no AI: templates + rules + the student's own quotes.

compose(kind, ctx)            -> (text, emotion)       automatic events (streaks, nudges, celebrations...)
smalltalk(text, ctx)          -> (text, emotion)|None  quick replies / chips / chit-chat that need no AI
is_question(text)             -> bool                  real questions go to the AI (short prompt)
judge(answer, activity, goal) -> verdict               'important' | 'break' | 'not' | 'unclear'
"""
import datetime, random, re

_LAST = {}


ON_USE = None               # set by buddy.py: called with (group, text) every time one of the student's own quotes / lines is actually said
_BAGS = {}


def bag(key, items):
    """Shuffle-bag: every item is used once before any repeats, so ALL of the student's own lines and quotes get their turn."""
    items = [x for x in items if x]
    if not items: return ''
    b = _BAGS.get(key)
    if not b or set(b[1]) != set(items):
        b = _BAGS[key] = [[], list(items)]
    if not b[0]:
        b[0] = list(items); random.shuffle(b[0])
        if len(items) > 1 and b[0][-1] == _LAST.get('bag:' + key): b[0].reverse()          # do not open a new round with the line that just closed the last one
    x = b[0].pop(); _LAST['bag:' + key] = x
    return x


def used(group, text):
    try:
        if ON_USE: ON_USE(group, text)
    except Exception: pass


def pick(key, options):
    """Random choice that avoids repeating the previous one for the same key."""
    opts = [o for o in options if o != _LAST.get(key)] or options
    c = random.choice(opts); _LAST[key] = c
    return c


def hm(minutes):
    m = int(round(minutes)); h, r = divmod(m, 60)
    return f'{h}h {r:02d}m' if h else f'{m} min'


def days_txt(d):
    return 'today' if d == 0 else 'tomorrow' if d == 1 else f'in {d} days'


class Ctx(dict):
    """Safe formatting context: missing keys become friendly defaults."""
    def __missing__(self, k): return ''


def _fill(t, c):
    try: return t.format_map(c)
    except Exception: return re.sub(r'\{[^}]*\}', '', t)


def _quote(c, p=.35):
    pool = c.get('quote_pool')
    if pool: p = max(p, .7)                                      # the student wrote their own quotes: use them most of the time
    if not (pool or c.get('quote')) or not (c.get('force_own') or random.random() < p): return ''
    q = bag('quotes', list(pool)) if pool else c.get('quote')   # the bag is only drawn from when a quote is really added, so every quote gets its turn
    used('quote', q); return ' ' + q


# ------------------------------------------------------------------ templates (emotion, text)
T = {
    'dailygoal': [
        ('cheering', "WOW!!! {work_h} of real work, {name}! CONGRATULATIONS!!! You just completed your goal of {target_h} hours a day!!!"),
        ('cheering', "YESSS {name}!!! {target_h} hours DONE! That is a huge win, I am SO proud of you! Congratulations!!!"),
        ('cheering', "Unbelievable, {name}!!! You hit your {target_h}-hour goal for today! Take a bow, you earned it!!!"),
    ],
    'halfway': [
        ('happy', "Halfway there, {name}! {work_h} done, {left_h} to go. You've got this."),
        ('winking', "50% of today's goal is in the bag ({work_h}). Keep the rhythm going."),
    ],
    'hour': [
        ('cheering', "{hours} hour{s} of work done today, {name}! Nice. Stretch, sip some water, then go again?"),
        ('happy', "That's {hours} full hour{s} on the clock. Solid. Quick water break, then back at it?"),
    ],
    'streak': [
        ('cheering', "{minutes} minutes unbroken! That's elite focus, {name}. One more block?"),
        ('cheering', "{minutes} min locked in on {goal}! Don't stop now, you're flying."),
        ('happy', "Look at that, {minutes} minutes without a break. This is how exams get won."),
    ],
    'streakbreak': [
        ('happy', "Your {minutes}-minute streak ended, but that was real work. Ready for a 5-minute restart?"),
        ('winking', "{minutes} focused minutes is nothing to shrug at. Want to restart with just 5?"),
    ],
    'checkin_done': [
        ('happy', "Locked in, {name}. One goal at a time today. Let's start with {goal}."),
        ('winking', "Thanks for sharing that. Plan's set. First step: {goal_or_any}."),
    ],
    'newdata': [
        ('winking', "Added. We'll handle it step by step."),
        ('happy', "Got it, it's in your plan now."),
    ],
    'goal_done': [
        ('cheering', "Yesss, that's one down, {name}!"),
        ('cheering', "Done and dusted! Checking that off feels good, right?"),
    ],
    'breaktime': [
        ('happy', "{minutes} minutes of non-stop work, {name}. Stand up, drink some water, rest your eyes for {brk} minutes. Your streak survives a short break."),
        ('winking', "Break time! {minutes} minutes in. Stretch, water, look at something far away for {brk} minutes. I'll be right here."),
    ],
    'breaktime_again': [
        ('sleepy', "Still going after {minutes} minutes! A proper {brk}-minute break now will make the next hour better, {name}."),
        ('happy', "{minutes} minutes without a pause. Your brain keeps what you learned during breaks, so take {brk} now."),
    ],
    'breaktime_exam': [
        ('happy', "{minutes} minutes in, {name}. {exam_line}A quick {brk}-minute reset (water, stretch) keeps you sharp for the rest of it."),
    ],
    'break_ok': [
        ('sleepy', "Good call. Stand up, water, look away from the screen. I'll stay quiet and your streak survives a short break."),
        ('happy', "Rest well, {name}. I won't disturb you for a few minutes."),
    ],
    'greet_morning': [('winking', "Good morning {name}! Fresh day, fresh start. What's the first thing on your list?")],
    'greet_day': [('happy', "Hey {name}! Ready to make today count? What are we working on?")],
    'greet_evening': [('happy', "Evening {name}. Still got some energy for one more focused block?")],
    'greet_night': [('sleepy', "It's late, {name}. One tiny task, then rest. Sleep is part of studying.")],
    'offtask1': [
        ('disappointed', "Hey {name}, you've been on {what} for {minutes} min. What are you up to right now?"),
        ('disappointed', "Quick check-in: {what} for {minutes} minutes. Is this part of your plan?"),
    ],
    'offtask2': [
        ('disappointed', "Still on {what} ({minutes} min). {goal_line} Can we do one 10-minute sprint?"),
        ('disappointed', "{minutes} minutes on {what}. {goal_line} Ten minutes, then you decide."),
    ],
    'offtask3': [
        ('sad', "I'm not here to nag, {name}. {goal_line} If today is a low-energy day, tell me and we'll shrink the plan."),
    ],
    'offgoal': [
        ('confused', "Nice effort, but that's not {goal}. Did the plan change, or shall we go back?"),
    ],
    'distract_important': [
        ('happy', "Fair enough, that sounds relevant to {goal}. I'll give you 15 minutes of quiet, then check back."),
        ('winking', "Okay, I trust you. If it helps {goal}, go for it. Back to the main task in 15?"),
    ],
    'distract_break': [
        ('happy', "A real break is healthy. Take 10 minutes, I'll ping you once when it's over."),
        ('sleepy', "Rest up, {name}. 10 minutes, water, stretch. I'll nudge you gently after."),
    ],
    'distract_not': [
        ('disappointed', "I get it, it's tempting. {goal_line} Just 10 minutes on {goal_or_any}, then it's yours again."),
        ('disappointed', "Be honest, {name}: will {what} matter {exam_when}? Let's do one 10-minute sprint."),
        ('sad', "That one isn't helping {goal_or_any}. {exam_line}Close it, open your book, 10 minutes. I'll count with you."),
    ],
    'distract_unclear': [
        ('confused', "Hmm, I can't tell if that helps {goal_or_any}. Is it study-related, a break, or just scrolling?"),
    ],
    'back': [
        ('cheering', "That's the spirit, {name}! Timer's yours. I'll stay quiet."),
        ('happy', "Welcome back! Let's go, one focused block."),
    ],
    'snooze': [('happy', "Okay, {minutes} more minutes. I'll check back after, no pressure.")],
    'lowenergy': [
        ('sad', "That's okay, some days are slow. Pick the smallest thing on your list and do just 10 minutes. Deal?"),
        ('happy', "Thanks for being honest. Tiny step: 10 minutes on {goal_or_any}. Start there."),
    ],
    'thanks': [('happy', "Anytime, {name}! I'm on your side."), ('winking', "Always. Now, what's next?")],
    'bye': [('winking', "Good work today, {name}. Rest well, see you tomorrow!")],
    'hi': [('winking', "Hey {name}! What's up?"), ('happy', "Hi! Good to see you. What are we doing next?")],
    'done': [('cheering', "Nice! Tell me when you want the next task."), ('cheering', "Well done! Small wins add up.")],
    'newsite': [
        ('winking', "New: {what}, {minutes} min so far. Is it productive and aligned with {goal}?"),
        ('happy', "Quick review: {what} ({minutes} min). Does it help with {goal}?"),
    ],
    'streakwarn': [
        ('shocked', "{minutes}-minute streak in danger! You have about a minute to get back to {goal}."),
        ('shocked', "Hurry, {name}! Your {minutes}-min streak breaks in about a minute. Back to {goal} to save it!"),
    ],
    'newsite_nogoal': [('winking', "New: {what}, {minutes} min so far. Productive or not?")],
    'reviewnudge': [('confused', "{count} sites/apps are waiting for your thumbs up or down. A minute now keeps your hours honest, {name}. Review them?"), ('winking', "Psst, {count} new sites/apps are still unreviewed. Want to clear them quickly?"), ('happy', "Quick tidy-up? {count} things I'm not sure about yet: productive or not?")],
    'reviewbatch': [('confused', "{count} new sites/apps are waiting for review. Clear them now? It takes about a minute.")],
    'review_yes': [('happy', "Done. {what} now counts for {goal_or_any}, and I'll stay quiet while you're on it."), ('winking', "Locked in: {what} is productive and linked to {goal_or_any}.")],
    'review_prod': [('happy', "Okay, {what} is productive, but not for {goal_or_any}. It won't add to that goal.")],
    'review_no': [('happy', "Marked {what} as unproductive. I'll keep an eye on the time.")],
    'review_later': [('winking', "No problem, I'll ask again in a while.")],
    'welcome': [
        ('cheering', "WELCOME BACK {name}!!! While I stayed quiet you put in {on_h} on {goal_or_any}! Look at everything you did:"),
        ('cheering', "YAY, you're back, {name}!!! {on_h} of focused work on {goal_or_any} while I kept silent. Here's your log:"),
    ],
    'welcome_streak': [('cheering', "WOW {name}!!! A {streak_h} streak and {on_h} on {goal_or_any}!!! I was quiet the whole time. Here's what you did:")],
    'welcome_big': [('cheering', "WOOOHOO {name}!!! You hit your {target_h}-hour daily goal while I was quiet!!! CONGRATULATIONS!!! Here's your log:")],
    'goaldone': [
        ('cheering', "DONE! \"{what}\" is finished, {name}! Next up I've set {next} as your goal. {nextwhy}"),
        ('cheering', "Yesss, \"{what}\" is complete! Moving you on to {next}. {nextwhy}"),
    ],
    'goaldone_none': [
        ('cheering', "\"{what}\" is finished, {name}, great work! Nothing else is open right now. Add an exam chapter or a task and I'll pick your next goal."),
    ],
    'goalgone': [
        ('confused', "The goal \"{what}\" was removed, so I moved you on to {next}. {nextwhy}"),
    ],
    'goalgone_none': [
        ('confused', "The goal \"{what}\" was removed and nothing else is open, so I switched you to 'anything productive'."),
    ],
    'restored': [
        ('happy', "Heads up, {name}: your data file was damaged when the PC shut down, so I brought back your newest backup ({what}). If anything looks a little old, Settings > Backups lists every copy."),
    ],
    'dataproblem': [
        ('sad', "I couldn't read your data file and found no backup, so I've paused saving to protect what's there. Please open Settings > Backups, or the data folder, before changing anything."),
    ],
    'autoreview': [
        ('winking', "I sorted {count} new sites and apps for you ({pct}% of what's new). Anything I got wrong, just tap it in Review and I'll learn."),
    ],
    # ---- reminders (start time, custom times, deadline, then every N minutes while overdue) ----
    'rem_start': [
        ('winking', "It's time to start, {name}! \"{what}\" begins now. Open it and give it a first 10 minutes."),
        ('cheering', "Start time for \"{what}\"! Let's go, {name}. Just begin, the rest follows."),
        ('happy', "Reminder: \"{what}\" starts now. One small first step and you're in."),
    ],
    'rem_mid': [
        ('happy', "Check-in on \"{what}\", {name}: {left_t} left until the deadline. How far along are you?"),
        ('winking', "Reminder: \"{what}\" is due in {left_t}. A focused block now keeps it on track."),
        ('happy', "{left_t} to go on \"{what}\". Where are you with it?"),
    ],
    'rem_dl': [
        ('shocked', "The deadline for \"{what}\" is NOW, {name}. Is it finished? If not, tell me how much more time you need."),
        ('confused', "Time's up on \"{what}\". Done, or do you need more time?"),
    ],
    'rem_overdue': [
        ('disappointed', "You need to finish \"{what}\", {name}. It was due {late_t} ago. What are you doing right now?"),
        ('disappointed', "\"{what}\" is still open and {late_t} overdue. What are you doing right now?"),
        ('sad', "Reminder #{n}: \"{what}\" was due {late_t} ago. Are you working on it? What are you doing right now?"),
    ],
    'rem_ok': [
        ('cheering', "Good, stay on \"{what}\". I'll check in again in {every} min if it's still open."),
        ('happy', "That's the way, {name}. Keep going on \"{what}\", I'll stay quiet for now."),
    ],
    'rem_not': [
        ('disappointed', "That can wait, {name}. \"{what}\" is {late_t} overdue. Give it just 10 minutes now, then you decide."),
        ('disappointed', "Be honest: will that matter more than \"{what}\"? Ten minutes on it first, I'll count with you."),
    ],
    'rem_break': [
        ('sleepy', "A real break is fine. Take 10 minutes, then \"{what}\" is next. I'll check back."),
    ],
    'rem_unclear': [
        ('confused', "Hmm, I can't tell if that helps \"{what}\" ({late_t} overdue). Are you working on it, taking a break, or something else?"),
    ],
    'rem_more': [
        ('happy', "Okay, I moved the deadline of \"{what}\" by {minutes} min. Use that time well, {name}."),
    ],
    'timer_focus_done': [
        ('cheering', "Focus block complete, {name}! {what_line}Take a {brk} minute break: stand up, drink water, look away from the screen."),
        ('cheering', "Block done! {what_line}Rest for {brk} minutes, you earned it. Then we go again."),
    ],
    'timer_break_done': [
        ('winking', "Break over, {name}! Ready for the next focus block? Press Start when you are."),
        ('happy', "Back to it? One more focused block, I'll be quiet."),
    ],
    'default': [('happy', "I'm here with you. What's on your mind?"), ('winking', "Got you. Want to pick one small thing to do next?")],
}

BUILTIN_QUOTES = [
    ("Small progress each day adds up to big results.", ""),
    ("Discipline is choosing what you want most over what you want now.", ""),
    ("You don't have to be great to start, but you have to start to be great.", "Zig Ziglar"),
    ("Done is better than perfect.", ""),
    ("The expert in anything was once a beginner.", ""),
    ("Focus on the next ten minutes, not the whole mountain.", ""),
]


# ------------------------------------------------------------------ the student's own lines (next to quotes)
# Two extra libraries, edited in Buddy settings / dashboard settings (stored with the quotes, kind 'distract' / 'achieve'):
#   distract: what Buddy says when you drift away from your goal        achieve: what Buddy says when you hit a streak or complete a goal
CUSTOM_SHARE = .9           # default for "How often Buddy uses my own lines" (Buddy settings: lineShare) when you have written some
BUILTIN_SHARE = .3          # ... and how often a built-in line is used when you have none (never replaces the big daily-goal party)
DISTRACT_KINDS = {'offtask', 'distract', 'offgoal', 'distract_not', 'distract_unclear', 'streakwarn', 'rem_overdue', 'rem_not'}
ACHIEVE_KINDS = {'dailygoal', 'streak', 'goal_done', 'goaldone', 'goaldone_none', 'welcome_big', 'welcome_streak', 'done'}
BUILTIN_DISTRACT = [
    "Future you is counting on the next ten minutes. Close the tab, {name}.",
    "This is the exact moment discipline is built. Back to {goal}.",
    "You didn't sit down to scroll. You sat down for {goal}.",
    "Tempting, yes. Worth it, no. One small step on {goal} and you win this round.",
]
BUILTIN_ACHIEVE = [
    "That's what showing up looks like, {name}. Proud of you!",
    "Consistency just paid you back. Enjoy this one!",
    "You said you'd do it, and you did. That's who you are now.",
    "Another brick in the wall, {name}. Look how far you've come!",
]


def own_line(kind, raw, c):
    """(text, emotion) from the student's own lines (or a built-in one, less often) for distraction / achievement moments, else None."""
    grp = 'distract' if kind in DISTRACT_KINDS else 'achieve' if kind in ACHIEVE_KINDS else ''
    if not grp: return None
    mine = [x for x in (raw.get('lines_' + grp) or []) if str(x).strip()]
    if mine: pool, share = mine, float(raw.get('line_share') or CUSTOM_SHARE)
    elif kind in ('dailygoal', 'welcome_big'): return None
    else: pool, share = (BUILTIN_DISTRACT if grp == 'distract' else BUILTIN_ACHIEVE), BUILTIN_SHARE
    if not raw.get('force_own') and random.random() >= share: return None
    src = bag('cl_' + grp, pool) if mine else pick('cl_' + grp, pool)
    line = _fill(src, c).strip()
    if not line: return None
    if mine: used(grp, src)
    if kind == 'distract': line += ' ' + pick('cl_q', ["What are you up to right now?", "What are you doing right now?"])      # the answer flow expects the question
    if kind == 'rem_overdue': line += f" \"{raw.get('what')}\" was due {raw.get('late_t') or 'a while'} ago. What are you doing right now?"          # keep the task + the question
    if kind in ('goaldone', 'goaldone_none') and raw.get('next'): line += f" Next up I've set {raw['next']} as your goal. {raw.get('nextwhy', '')}".rstrip()
    return line, ('disappointed' if grp == 'distract' else 'cheering')


def fmt_quote(q):
    if not q: return ''
    t = q.get('text', '').strip()
    return f'"{t}"' + (f" - {q['author']}" if q.get('author') else '') if t else ''


def build_ctx(raw):
    """raw: dict from buddy.py with name, goal, exam, work, target, ... -> safe Ctx with derived fields."""
    c = Ctx(raw)
    c['name'] = raw.get('name') or 'friend'
    g = raw.get('goal') or ''
    c['goal_or_any'] = g or 'your studies'
    c['goal'] = g or 'your goal'
    ex = raw.get('exam')
    if ex:
        c['exam_when'] = f"when {ex['name']} comes {days_txt(ex['days'])}"
        c['exam_line'] = f"{ex['name']} is {days_txt(ex['days'])}" + (f" and you're {ex['prep']}% ready" if ex.get('prep') is not None else '') + '. '
        c['goal_line'] = f"Your goal is {g}, and {ex['name']} is {days_txt(ex['days'])}." if g else f"{ex['name']} is {days_txt(ex['days'])}."
    else:
        c['exam_when'] = 'next week'
        c['exam_line'] = ''
        c['goal_line'] = f"Your goal right now is {g}." if g else "You said you wanted to get something done today."
    c['work_h'] = hm(raw.get('work', 0)); c['target_h'] = f"{raw.get('target', 6):g}"
    c['left_h'] = hm(max(0, raw.get('target', 6) * 60 - raw.get('work', 0)))
    c['on_h'] = hm(raw.get('on_min', 0)); c['streak_h'] = hm(raw.get('streak', 0))
    h = int(raw.get('hours', 0)); c['hours'] = h; c['s'] = '' if h == 1 else 's'
    c['what'] = raw.get('what') or 'something else'
    m = int(raw.get('minutes', 0) or 0)
    c['what_line'] = f"You finished a block on {raw['what']}. " if raw.get('what') else ''
    c['every'] = raw.get('every') or 30; c['n'] = raw.get('n') or 1
    c['brk'] = 5 if (ex and ex['days'] <= 2) or m < 75 else 10                 # shorter break when an exam is close, longer after a long stretch
    if raw.get('brk'): c['brk'] = raw['brk']
    return c


QUOTE_KINDS = {'streak', 'dailygoal', 'checkin_done', 'distract_not', 'lowenergy', 'offtask3', 'goal_done', 'goaldone', 'streakbreak', 'halfway', 'hour', 'breaktime', 'timer_focus_done', 'newdata', 'review_yes', 'welcome', 'welcome_streak'}


def compose(kind, raw):
    """Return (text, emotion) for an automatic event."""
    c = build_ctx(raw)
    key = kind
    if kind == 'greet': key = 'greet_' + c.get('daypart', 'day')
    if kind == 'offtask': key = 'offtask' + str(min(3, max(1, int(raw.get('n', 1) or 1))))
    if kind == 'distract': key = 'offtask1'
    if kind in ('goaldone', 'goalgone'):
        key = kind + ('' if raw.get('next') else '_none')
        if kind == 'goaldone' and raw.get('gone') and raw.get('next'): key = 'goalgone'
        if kind == 'goaldone' and raw.get('gone') and not raw.get('next'): key = 'goalgone_none'
    if kind == 'breaktime':
        ex = c.get('exam')
        key = 'breaktime_again' if int(raw.get('n', 0) or 0) >= 1 else 'breaktime_exam' if ex and ex['days'] <= 3 and random.random() < .6 else 'breaktime'
    own = own_line(kind, raw, c)
    if own: return (own[0] + (_quote(c, .35) if kind in QUOTE_KINDS else ''), own[1])            # your own line, and sometimes one of your quotes after it
    opts = T.get(key) or T['default']
    emo, text = pick(key, opts)
    out = _fill(text, c)
    if kind in QUOTE_KINDS or kind.startswith('greet'):
        out += _quote(c, .45 if kind == 'dailygoal' else .35)
    return out.strip(), emo


# ------------------------------------------------------------------ chit-chat that needs no AI
Q_START = re.compile(r"^(what|why|how|when|where|who|which|can you|could you|will you|do you|does|is |are |explain|tell me|solve|define|help me|give me|show me|teach|difference|meaning)", re.I)


def is_question(t):
    t = (t or '').strip()
    return '?' in t or bool(Q_START.match(t)) or len(t.split()) >= 14


def smalltalk(text, raw):
    """Fast intent matching for chips / short statements. Returns (text, emotion) or None (-> AI)."""
    t = (text or '').lower().strip()
    if not t: return None
    c = build_ctx(raw)

    def r(key): e, x = pick(key, T[key]); return _fill(x, c).strip(), e
    if is_question(t) and not re.match(r"^(i'?m back|back to)", t): return None
    if re.search(r"i'?m back|let'?s go|back to my goal|right, back|restarting|ok restarting|give me 5 minutes", t):
        return r('back')
    m = re.search(r'(\d+)\s*(more )?min', t)
    if re.search(r'give me.*min|more minutes|few minutes', t):
        c['minutes'] = m.group(1) if m else '10'; return r('snooze')
    if re.search(r"not feeling|can'?t focus|no motivation|tired|exhausted|so bored|low energy|burnt|burned", t): return r('lowenergy')
    if re.search(r'^(taking|going for|starting|having) (a |my )?(\d+ ?(min(ute)?s? )?)?(break|rest)|thanks! taking a break', t): return r('break_ok')
    if re.search(r'^(thanks|thank you|thx|ty)\b', t): return r('thanks')
    if re.search(r'^(bye|good ?night|gn|see you|cya|done for (the )?day)', t): return r('bye')
    if re.search(r'^(hi|hello|hey|yo|hii+|namaste|sup)\b', t) and len(t.split()) <= 4: return r('hi')
    if re.search(r'^(done|finished|completed|i did it)\b', t): return r('done')
    if re.search(r'needed a break|i needed a break', t): return r('distract_break')
    return None


# ------------------------------------------------------------------ distraction judge
# Is what the student says (and what is really on screen) relevant to THEIR current goal / exam? Scored, not a plain keyword check.
BREAK = re.compile(r'\b(break|rest|lunch|dinner|breakfast|eat|eating|water|tea|coffee|stretch|walk|tired|snack|nap|toilet|washroom|relax|refresh)\b', re.I)
STUDY = re.compile(r'\b(study|studying|learn|learning|notes?|lecture|tutorial|assignment|homework|exam|chapter|revision|revise|revising|practice|practising|problems?|doubts?|solve|solving|research|reference|project|formulas?|syllabus|textbook|class|course|ncert|pdf|paper|questions?|numericals?|derivation|theory|mcq|mock|test)\b', re.I)
IMPORTANT = re.compile(r'\b(urgent|emergency|important|parent|mom|dad|mother|father|teacher|sir|madam|school|college|deadline|submit|submission|call|doctor|bank|form|fee)\b', re.I)
SLACK = re.compile(r'\b(scroll|scrolling|bored|nothing|timepass|time pass|just|reels|shorts|meme|memes|game|gaming|chat|chatting|insta|instagram|netflix|movie|series|random|idk|dunno|youtube shorts|cricket|ipl)\b', re.I)
SLACK_SCREEN = re.compile(r'instagram|reels|netflix|prime video|hotstar|9gag|reddit|facebook|twitter|\bx\.com|snapchat|tiktok|youtube shorts|#shorts|twitch|steam|valorant|minecraft|roblox|fortnite|pubg|free ?fire|ipl|cricbuzz|memes?\b', re.I)
STUDY_TOOLS = re.compile(r'claude|chatgpt|gemini|copilot|wolfram|desmos|geogebra|khan ?academy|byju|vedantu|unacademy|physics ?wallah|wikipedia|stack ?overflow|github|leetcode|geeksforgeeks|w3schools|notion|obsidian|onenote|anki|quizlet|coursera|nptel|scholar|\.pdf|docs?\b|sheets?\b|word|excel|powerpoint|code|pycharm|visual studio|jupyter', re.I)
NEG_STUDY = re.compile(r"\b(not|no|nothing|never|n't|dont|don't|isn't|isnt|nope)\b\W+(?:\w+\W+){0,2}?(study|studying|related|relevant|work|working|helping|for it|for my goal)", re.I)
STOP = set('the and for with that this from have your you are was were what when how why who which about into then than them they their there here been being will would could should can but its our out any all get got has had him her his she too very more most some such only own same also over under again while through during before after above below doing right now like want need going gonna still little bit really actually something stuff thing things'.split())
# a few words that mean the same subject, so "numericals on optics" matches "Physics: Light" without the student repeating the title
SUBJECTS = {
    'physics': 'physics newton motion force energy optics light lens mirror wave current circuit magnet electric thermodynamics gravity momentum numerical',
    'chemistry': 'chemistry organic inorganic periodic reaction mole acid base salt bond element compound equilibrium',
    'math': 'math maths mathematics algebra calculus integral derivative trigonometry geometry matrix probability statistics equation',
    'biology': 'biology cell genetics dna enzyme photosynthesis human body plant evolution ecology botany zoology',
    'computer': 'computer programming code python java javascript algorithm data structure database network software dsa coding',
    'english': 'english grammar essay literature poem comprehension vocabulary writing',
    'history': 'history civilization empire revolution war independence dynasty',
    'economics': 'economics demand supply market gdp inflation trade budget',
    'accounts': 'accounts accounting ledger journal balance sheet audit',
}


def _stem(w):
    for suf in ('ingly', 'edly', 'ing', 'ed', 'es', 's', 'ly'):
        if len(w) > len(suf) + 3 and w.endswith(suf): return w[:-len(suf)]
    return w


def toks(text, acronyms=False):
    """Meaningful, lightly stemmed words. acronyms=True also keeps short ALL-CAPS ones (OS, AI, C++) from goal names."""
    out = {_stem(w) for w in re.findall(r'[a-z0-9]+', (text or '').lower()) if len(w) >= 3 and w not in STOP}
    if acronyms: out |= {w.lower() for w in re.findall(r'\b[A-Z]{2}\b', text or '')}
    return out


def expand(words):
    """Add the common vocabulary of the subjects mentioned (physics -> optics, lens, ...)."""
    out = set(words)
    for k, v in SUBJECTS.items():
        vs = {_stem(x) for x in v.split()}
        if _stem(k) in words or words & vs: out |= vs
    return out


def judge(answer, activity='', goal='', related='', app=''):
    """Is what they say they are doing important for THIS goal / exam? -> 'important' | 'break' | 'not' | 'unclear'.

    Evidence used (not just the sentence): the goal and exam topics, the window title / app that is really open,
    study vocabulary, negations ("not studying"), slacking words and feed / game sites.
    """
    a = (answer or '').lower().strip()
    if not a: return 'unclear'
    A, G = toks(a), expand(toks(goal, True))
    R = expand(toks(related, True)) - G
    screen = f'{activity} {app}'.lower()
    T = toks(screen)
    named_goal, named_exam = bool(A & G), bool(A & R)
    screen_goal = bool(T & (G | R)) if (G or R) else False
    neg = bool(NEG_STUDY.search(a))
    study, slack, brk, urgent = bool(STUDY.search(a)) and not neg, bool(SLACK.search(a)), bool(BREAK.search(a)), bool(IMPORTANT.search(a))
    feed = bool(SLACK_SCREEN.search(screen)) and not screen_goal
    if re.search(r'related to my goal|for my goal|part of my (plan|goal)', a) and not neg:
        return 'unclear' if feed else 'important'                 # the quick-reply chip: believe it unless the screen is clearly a feed / game
    if neg: return 'not'
    if urgent and not slack: return 'important'
    if named_goal or named_exam: return 'unclear' if (feed and slack) else 'important'     # they named the topic they are on
    if slack and not study: return 'not'
    if study:
        if screen_goal or STUDY_TOOLS.search(screen): return 'important'                  # the screen backs up the claim
        return 'not' if feed else 'important'                                             # says study but the open page is a feed / game
    if brk and not slack: return 'break'
    if screen_goal and len(a.split()) <= 6 and not feed: return 'important'                # "reading" while a topic page is open
    if len(a.split()) <= 2: return 'unclear'
    return 'not'


# ------------------------------------------------------------------ exam priorities + "what should I do next?"  (pure functions, no AI)
PROX_BONUS = 1          # dev knob: extra importance points for the exam that is nearest in time


def _over(e):
    try: dt = datetime.datetime.fromisoformat(str(e.get('date')).replace('Z', '+00:00'))
    except Exception: return False
    return dt < (datetime.datetime.now() if dt.tzinfo is None else datetime.datetime.now(datetime.timezone.utc))


def _exam_day(e):
    try: return datetime.datetime.fromisoformat(str(e.get('date')).replace('Z', '+00:00')).astimezone().date()
    except Exception: return None


def normalize_ranks(exams, today=None):
    """Every upcoming exam gets a UNIQUE rank 1..N (your order first, new / unranked exams after, soonest first). Two exams are never equally important."""
    today = today or datetime.date.today(); up = []
    for e in exams:
        d = _exam_day(e)
        if d is not None and d >= today and not _over(e): up.append((e, d))
    up.sort(key=lambda x: (x[0]['rank'] if isinstance(x[0].get('rank'), int) else 10 ** 6, x[1]))
    for i, (e, _) in enumerate(up): e['rank'] = i + 1
    return [e for e, _ in up]


def _rk(t):
    r = t.get('rank')
    return r if isinstance(r, (int, float)) and not isinstance(r, bool) else 10 ** 9


def normalize_task_ranks(tasks):
    """Every open goal (task) gets a UNIQUE priority rank 1..N: the student's own order first, new / unranked goals after (oldest first).
    Finished goals lose their rank. Returns the open tasks in rank order (#1 first)."""
    op = sorted((t for t in tasks if not t.get('done')), key=lambda t: (_rk(t), t.get('id') if isinstance(t.get('id'), (int, float)) else 0))
    for i, t in enumerate(op): t['rank'] = i + 1
    for t in tasks:
        if t.get('done'): t.pop('rank', None)
    return op


def _chap_days(c, exam_days, today):
    try: return (datetime.date.fromisoformat(str(c.get('dl'))[:10]) - today).days
    except Exception: return exam_days


def _chap_score(c, exam_days, today):
    """How much this chapter deserves the next block: importance x how much is left x deadline pressure."""
    imp = max(1, int(c.get('imp') or 1)); rem = (100 - c.get('p', 0)) / 100; d = _chap_days(c, exam_days, today)
    urg = 2.0 if d < 0 else 1.0 + min(7, max(0, 7 - d)) / 7
    return imp * (rem + .25) * urg


def plan(exams, tasks, now=None):
    """rows: exams by priority score (rank points + PROX_BONUS for the nearest exam; a tie goes to the nearer exam), each with its open chapters ranked.
    pick: the chapter (or exam) to work on now. task: an open task that is overdue or due within 12 h."""
    now = now or datetime.datetime.now(); today = now.date()
    exs = [dict(e) for e in exams]; order = normalize_ranks(exs, today); n = len(order)
    days = {id(e): (_exam_day(e) - today).days for e in order}
    nearest = min(order, key=lambda e: days[id(e)]) if n > 1 else None
    rows = []
    for e in order:
        allc = e.get('ch') or []; open_ = [c for c in allc if c.get('p', 0) < 100]
        chs = sorted(({'id': c['id'], 'name': c.get('name', ''), 'p': c.get('p', 0), 'imp': int(c.get('imp') or 1), 'dl': c.get('dl') or '', 'days': _chap_days(c, days[id(e)], today),
                       'score': round(_chap_score(c, days[id(e)], today), 2)} for c in open_), key=lambda x: -x['score'])
        pts = n - e['rank'] + 1; bonus = PROX_BONUS if e is nearest else 0
        rows.append({'id': e['id'], 'name': e.get('name', 'Exam'), 'days': days[id(e)], 'rank': e['rank'], 'pts': pts, 'bonus': bonus, 'score': pts + bonus,
                     'prep': round(sum(c.get('p', 0) for c in allc) / len(allc)) if allc else None, 'chapters': chs, 'nch': len(allc)})
    rows.sort(key=lambda r: (-r['score'], r['days']))
    pick = None
    for pos, r in enumerate(rows, 1):
        if r['chapters']:
            c = r['chapters'][0]; pick = {'kind': 'chap', 'id': f"g:chap:{c['id']}", 'name': c['name'], 'exam': r['name'], 'row': r, 'ch': c, 'pos': pos}; break
    if not pick and rows:
        r = rows[0]; pick = {'kind': 'exam', 'id': f"g:exam:{r['id']}", 'name': r['name'], 'exam': r['name'], 'row': r, 'ch': None, 'pos': 1}
    if pick: pick['why'] = _why(pick, n)
    urgent = []
    for t in tasks:
        if t.get('done'): continue
        try: h = (datetime.datetime.fromisoformat(str(t.get('dl'))) - now).total_seconds() / 3600
        except Exception: continue
        if h <= 12: urgent.append({'id': f"g:task:{t['id']}", 'name': t.get('title', ''), 'hours': round(h, 1), 'p': t.get('p', 0)})
    urgent.sort(key=lambda x: x['hours'])
    top = None                                                                 # YOUR #1 goal (unless an exam is only a day or two away: the exam wins then)
    if not (pick and pick['row']['days'] <= 2):
        op = sorted((t for t in tasks if not t.get('done')), key=lambda t: (_rk(t), t.get('id') if isinstance(t.get('id'), (int, float)) else 0))
        if op: top = {'id': f"g:task:{op[0]['id']}", 'name': op[0].get('title', ''), 'kind': 'task', 'rank': 1, 'p': op[0].get('p', 0)}
    return {'rows': rows, 'pick': pick, 'task': urgent[0] if urgent else None, 'top': top}


def _why(pick, n):
    r, c = pick['row'], pick['ch']
    pr = 'your top priority' if pick['pos'] == 1 else f"#{pick['pos']} on your priority list"
    s = f"{r['name']} is {pr} and {days_txt(r['days'])}" + (", the nearest exam (+1 importance)" if r['bonus'] else '') + (f". You're {r['prep']}% ready" if r['prep'] is not None else '')
    if c: s += f". {c['name']} is {c['p']}% done" + (f", rated {c['imp']}/5 in importance" if c['imp'] > 1 else '') + (f", deadline {days_txt(c['days'])}" if c['dl'] else '')
    else: s += ". It has no chapters yet, so add some in Exams to get a precise pick"
    return s + '.'


def _when(h):
    if h < 0: return f"overdue by {hm(-h * 60)}"
    if h < 1: return 'within the hour'
    return f"in {hm(h * 60)}"


def advise(raw):
    """'What should I do next?' answered from the data. Returns (text, emotion, extra) where extra may hold a goal to offer."""
    c = build_ctx(raw); pl = raw.get('plan') or {}; pick, task = pl.get('pick'), pl.get('task'); nm = c['name']
    close = bool(pick and pick['row']['days'] <= 2); top = pl.get('top')
    if task and not close:
        t = f"Do this first, {nm}: \"{task['name']}\" is due {_when(task['hours'])}."
        if pick: t += f" After that: {pick['name']} for {pick['exam']}."
        return t + ' One 25-minute block, then tell me how it went.', 'happy', {'goal': {'id': task['id'], 'name': task['name'], 'kind': 'task'}, 'plan': True}
    if top and not (task and top['id'] == task['id']):                  # your own ranking: the goal you put first
        t = f"Your #1 priority goal is \"{top['name']}\", {nm}. Start there."
        if pick: t += f" After that: {pick['name']} for {pick['exam']}."
        return t + ' One 25-minute block, then tell me how it went.', 'winking', {'goal': {'id': top['id'], 'name': top['name'], 'kind': 'task'}, 'plan': True}
    if pick:
        t = f"Next up: {pick['name']}" + ('' if pick['kind'] == 'exam' else f" ({pick['exam']})") + f". {pick['why']}"
        if task: t += f" Also, \"{task['name']}\" is due {_when(task['hours'])}."
        return t + ' One 25-minute block, then tell me how it went.', 'winking', {'goal': {'id': pick['id'], 'name': pick['name'], 'kind': pick['kind']}, 'plan': True}
    ot = [x for x in (raw.get('open_tasks') or [])][:1]
    if ot: return f"No exams yet, so start with your task: {ot[0]}. One 25-minute block?", 'happy', {}
    return "Your list is empty, so I can't pick yet. Add an exam with its chapters (or a task with the + button), rank your exams, and I'll tell you exactly what to do next.", 'confused', {'plan': True}


def priorities_text(raw):
    c = build_ctx(raw); rows = (raw.get('plan') or {}).get('rows') or []; goals = raw.get('ranked_goals') or []
    out = []
    if goals: out.append(f"Your goals by priority, {c['name']}:\n" + '\n'.join(f"{i}. {g}" for i, g in enumerate(goals[:5], 1)))
    if rows:
        L = [f"{i}. {r['name']}: priority score {r['score']}" + (' (+1 nearest)' if r['bonus'] else '') + f", {days_txt(r['days'])}" + (f", {r['prep']}% ready" if r['prep'] is not None else '') for i, r in enumerate(rows[:4], 1)]
        out.append(f"Your exam priorities:\n" + '\n'.join(L))
    if not out: return "No goals or upcoming exams yet. Add a goal with the + button (or an exam in the dashboard), rank them, and I'll prioritise for you."
    return '\n\n'.join(out) + "\nTap the plan button to re-rank."


def ai_unavailable(state, raw):
    nm = build_ctx(raw)['name']
    if state == 'nokey':
        return (f"That's a question for my AI brain, {nm}, and it isn't connected yet. Add a free OpenRouter key in Settings (gear icon) and I can answer anything. "
                "Meanwhile ask me \"what should I do next?\" and I'll plan from your exams."), 'confused'
    return ("My AI brain didn't answer (free limit reached or no internet). Try again in a minute, or check your keys in Settings. "
            "Want me to pick your next task from your exams meanwhile? Just say \"what should I do next?\""), 'sad'


NEXT_RE = re.compile(r"what (should|shall|do|can|could) (i|we) (do|study|work|start|learn|revise|read)|what('?s| is)? ?(my )?next\b|what now|what to (do|study|revise|learn)|which (chapter|topic) (should|do|to)|where (should|do|to) i start|plan my (day|study|evening|morning)|suggest (me )?(a |some )?(task|chapter|topic|something)|what('s| is) (on )?the (plan|agenda)|kya (karu|padhu|padhun)", re.I)
PRIO_RE = re.compile(r"priorit|\brank(ing)?\b|most important|which exam|exam order|show (me )?(my )?(goals|plan|exams|priorities)|\bmy (plan|goals|exams)\b|what('s| is) (urgent|important)", re.I)
NAME_RE = re.compile(r"(your|ur|u r|you are) name|who are (you|u)\b|what (are|r) (you|u) called|what do i call you", re.I)
HOW_RE = re.compile(r"how are (u|you)|how r (u|you)|how('s| is) it going|how('s| is) life|what'?s up|wassup", re.I)
AFFIRM_RE = re.compile(r"^(yes+|yeah|yep|yup|ok(ay)?|sure|please|haan|ha|do it|go ahead|let'?s do it)\b", re.I)


def local(text, raw):
    """Anticipated questions answered by the system (green). Returns (reply, emotion, extra) or None -> goes to the AI (blue)."""
    t = (text or '').lower().strip()
    if not t: return None
    c = build_ctx(raw)
    if NEXT_RE.search(t) or (AFFIRM_RE.match(t) and len(t.split()) <= 4 and (raw.get('last_bot') or '').strip().endswith('?')): return advise(raw)
    if PRIO_RE.search(t): return priorities_text(raw), 'happy', {'plan': True}
    nm, hw = bool(NAME_RE.search(t)), bool(HOW_RE.search(t))
    if nm or hw:
        b = raw.get('buddy') or 'Buddy'
        out = ("I'm doing great, thanks for asking! " if hw else '') + (f"I'm {b}, your study buddy robot. " if nm else '') + "What are we working on?"
        return out, 'winking', {}
    if AFFIRM_RE.match(t) and len(t.split()) <= 3:                       # a bare 'ok / yes' that answers nothing we asked
        return pick('ack', ["Nice. Shout when you finish the block, or ask me what's next.", "Got it. I'm here when you're done, just say what's next.", "Sounds good. Go for it, I'll stay quiet."]), 'happy', {}
    sm = smalltalk(text, raw)
    return (sm[0], sm[1], {}) if sm else None
