"""Crash-safe storage for Rize Buddy (v9).

Why this exists: v8 wrote the data file without flushing it to disk and silently swallowed any load error. If Windows shut down
(or the PC lost power) at the wrong moment the file could come back empty, load() ignored it, and the next save() wrote the
EMPTY data over everything. This module fixes the whole chain:

  save   -> write temp file, flush + fsync, atomic replace (never a half-written main file)
  guard  -> never overwrite real data with an empty dataset, never save at all after a failed load
  backup -> rolling snapshots (every ~5 min, last 12) + one per day (last 30) + a key-less mirror in Documents
  load   -> main file, else the temp file, else the newest valid backup / mirror, and Buddy tells you what happened
  exit   -> final save when Windows ends the session (shutdown / restart / log off), on Ctrl-C and on normal exit
"""
import atexit, copy, datetime, glob, gzip, hashlib, json, os, sys, threading, time

DIR = os.path.join(os.environ.get('APPDATA', '.'), 'RizeBuddy')
FILE = os.path.join(DIR, 'rize-data.json')
BDIR = os.path.join(DIR, 'backups')
LOGF = os.path.join(DIR, 'rize.log')
MIRROR = os.path.join(os.path.expanduser('~'), 'Documents', 'RizeBuddy-backup')   # survives an APPDATA clean-up; synced by OneDrive if Documents is
RECENT_EVERY, RECENT_KEEP, DAILY_KEEP = 300, 12, 30
os.makedirs(BDIR, exist_ok=True)

S = {'loaded_ok': True, 'weight': 0, 'last_hash': '', 'last_backup': 0.0, 'last_mirror': 0.0, 'note': '', 'source': 'main', 'lock': threading.RLock(), 'dirty_err': 0}


def log(*a):
    """The exe runs without a console, so problems are written to %APPDATA%\\RizeBuddy\\rize.log (kept small)."""
    try:
        if os.path.exists(LOGF) and os.path.getsize(LOGF) > 400_000:
            os.replace(LOGF, LOGF + '.old')
        with open(LOGF, 'a', encoding='utf8') as f:
            f.write(time.strftime('%Y-%m-%d %H:%M:%S ') + ' '.join(str(x) for x in a) + '\n')
    except Exception:
        pass


def weight(d):
    """How much real content a dataset holds (0 = empty). Used to stop an empty dataset replacing a full one."""
    try:
        b = d.get('buddy') or {}
        return (len(d.get('sessions') or []) + 5 * len(d.get('tasks') or []) + 10 * len(d.get('exams') or []) + 3 * len(d.get('entries') or [])
                + 2 * len(d.get('v') or {}) + len(b.get('log') or []) + 5 * len(b.get('landmarks') or []))
    except Exception:
        return 0


def _valid(d):
    return isinstance(d, dict) and isinstance(d.get('sessions', []), list) and ('sessions' in d or 'v' in d or 'tasks' in d or 'exams' in d)


def read_any(path):
    """Read a .json or .json.gz data file. Returns a dict or None (missing / empty / corrupt)."""
    try:
        if not os.path.exists(path) or os.path.getsize(path) < 2: return None
        op = gzip.open if path.endswith('.gz') else open
        with op(path, 'rt', encoding='utf8') as f: d = json.load(f)
        return d.get('data') if isinstance(d, dict) and d.get('app') == 'rize-buddy' and isinstance(d.get('data'), dict) else d if _valid(d) else None
    except Exception as e:
        log('read failed', path, e); return None


def _stamp(path):
    try: return os.path.getmtime(path)
    except Exception: return 0


def backups():
    """All snapshots, newest first: [{name, path, t, kind, size, weight?}]."""
    out = []
    for p in glob.glob(os.path.join(BDIR, '*.json*')):
        n = os.path.basename(p)
        out.append({'name': n, 'path': p, 't': int(_stamp(p) * 1000), 'kind': 'daily' if n.startswith('daily-') else 'recent', 'size': os.path.getsize(p)})
    for p in glob.glob(os.path.join(MIRROR, '*.json*')):
        out.append({'name': 'mirror:' + os.path.basename(p), 'path': p, 't': int(_stamp(p) * 1000), 'kind': 'mirror', 'size': os.path.getsize(p)})
    out.sort(key=lambda x: -x['t']); return out


def load(default):
    """Load the best available copy. Returns (dict, note). The note is '' when the normal file loaded fine.
    Sets S['loaded_ok'] = False when the main file exists with content but could not be read AND nothing could replace it (saving is then blocked)."""
    d = read_any(FILE); note = ''; S['source'] = 'main'
    exists = os.path.exists(FILE) and os.path.getsize(FILE) > 2
    if d is None or weight(d) == 0:
        best, src = None, ''
        bl = backups(); local = [b['path'] for b in bl if b['kind'] != 'mirror']; mir = [b['path'] for b in bl if b['kind'] == 'mirror']
        for cand in [FILE + '.tmp'] + local + mir:                           # local snapshots first, the key-less Documents mirror last
            x = read_any(cand)
            if x is not None and weight(x) > 0:
                best, src = x, cand; break                                  # newest valid, non-empty copy wins
        if best is not None:
            if exists:                                                       # keep the damaged file for inspection
                try: os.replace(FILE, FILE + '.damaged-' + time.strftime('%Y%m%d-%H%M%S'))
                except Exception: pass
            d = best; S['source'] = os.path.basename(src)
            note = 'restored:' + S['source']; log('RESTORED from', src)
        elif d is None and exists:
            S['loaded_ok'] = False; note = 'unreadable'; log('main file unreadable and no backup found: saving disabled to protect it')
    if d is None: d = {}
    S['weight'] = weight(d)
    S['note'] = note
    return d, note


def _dumps(data, lock):
    """json.dumps that survives another thread changing the data while we serialise (retry, then work on a copy)."""
    for i in range(4):
        try:
            with lock: return json.dumps(data)
        except RuntimeError:                                                 # "dictionary changed size during iteration"
            time.sleep(0.05)
    with lock: return json.dumps(copy.deepcopy(data))


def _atomic_write(path, text):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf8') as f:
        f.write(text); f.flush(); os.fsync(f.fileno())                       # make sure the bytes are on disk BEFORE the swap
    os.replace(tmp, path)


def _prune(pattern, keep):
    for p in sorted(glob.glob(os.path.join(BDIR, pattern)), reverse=True)[keep:]:
        try: os.remove(p)
        except Exception: pass


def _snapshot(text, now):
    """Rolling + daily gzip snapshots in %APPDATA%\\RizeBuddy\\backups, key-less mirror in Documents."""
    h = hashlib.md5(text.encode('utf8', 'ignore')).hexdigest()
    if h != S['last_hash'] and now - S['last_backup'] >= RECENT_EVERY:
        n = os.path.join(BDIR, 'recent-%d.json.gz' % int(now))
        with gzip.open(n + '.tmp', 'wt', encoding='utf8') as f: f.write(text)
        os.replace(n + '.tmp', n); S['last_hash'] = h; S['last_backup'] = now; _prune('recent-*.json.gz', RECENT_KEEP)
    day = os.path.join(BDIR, 'daily-%s.json.gz' % datetime.date.today().strftime('%Y%m%d'))
    if not os.path.exists(day) or now - os.path.getmtime(day) > 3 * 3600:     # refreshed a few times a day, so a daily file is never stale
        with gzip.open(day + '.tmp', 'wt', encoding='utf8') as f: f.write(text)
        os.replace(day + '.tmp', day); _prune('daily-*.json.gz', DAILY_KEEP)


def _mirror(data, lock, now):
    if now - S['last_mirror'] < 600: return
    S['last_mirror'] = now
    try:
        os.makedirs(MIRROR, exist_ok=True)
        with lock: m = copy.deepcopy(data)
        (m.get('buddy') or {}).pop('keys', None)                             # API keys never leave the app folder
        _atomic_write(os.path.join(MIRROR, 'rize-data-latest.json'), json.dumps(m))
        with open(os.path.join(MIRROR, 'README.txt'), 'w', encoding='utf8') as f:
            f.write('Rize Buddy automatic backup (API keys are NOT included).\nRestore: Rize Buddy dashboard > Settings > Backups > Restore, or Import this file under Settings > Import.\n')
    except Exception as e:
        log('mirror failed', e)


def save(data, lock, allow_empty=False, force=False):
    """Returns True when written. Refuses (and says why in the log) to overwrite real data with an empty dataset or to save after a failed load."""
    with S['lock']:
        if not S['loaded_ok'] and not force:
            return False
        try:
            text = _dumps(data, lock); w = weight(data)
            if w == 0 and S['weight'] > 5 and not allow_empty:
                log('REFUSED to save an empty dataset over', S['weight'], 'items of data'); return False
            _atomic_write(FILE, text); S['weight'] = w; S['dirty_err'] = 0
            now = time.time()
            try: _snapshot(text, now)
            except Exception as e: log('snapshot failed', e)
            try: _mirror(data, lock, now)
            except Exception as e: log('mirror failed', e)
            return True
        except Exception as e:
            S['dirty_err'] += 1; log('SAVE FAILED', repr(e)); return False


def restore(name):
    """Return the data inside a snapshot (by name from backups()), or None."""
    for b in backups():
        if b['name'] == name: return read_any(b['path'])
    return None


def wipe_backups():
    """'Delete all data' also deletes the safety copies (the student asked for everything to go)."""
    for b in backups():
        try: os.remove(b['path'])
        except Exception: pass
    for p in glob.glob(FILE + '.damaged-*'):
        try: os.remove(p)
        except Exception: pass
    S['last_hash'] = ''; S['weight'] = 0


def snapshot_now(data, lock):
    """Force a labelled snapshot right now (used before imports, restores and resets so they can be undone)."""
    try:
        text = _dumps(data, lock)
        n = os.path.join(BDIR, 'recent-%d.json.gz' % int(time.time()))
        with gzip.open(n, 'wt', encoding='utf8') as f: f.write(text)
        _prune('recent-*.json.gz', RECENT_KEEP + 4); return True
    except Exception as e:
        log('snapshot_now failed', e); return False


# ---------------------------------------------------------------- final save when Windows shuts down
def install_exit_hooks(final_save):
    """final_save() is called on normal exit, Ctrl-C / console close and - the important one - when Windows ends the session."""
    done = {'x': False}

    def once(*a):
        if done['x']: return
        done['x'] = True
        try: final_save()
        except Exception as e: log('final save failed', e)
        done['x'] = False                                                    # allow a later call (shutdown can be cancelled)
    atexit.register(once)
    if os.name != 'nt': return
    import ctypes
    from ctypes import wintypes as wt
    k32, u32 = ctypes.windll.kernel32, ctypes.windll.user32
    try: k32.SetProcessShutdownParameters(0x3FF, 0)                          # be told about shutdown early, so we finish before Windows kills us
    except Exception: pass
    try:
        HANDLER = ctypes.WINFUNCTYPE(wt.BOOL, wt.DWORD)
        h = HANDLER(lambda ev: (once(), False)[1]); install_exit_hooks._h = h; k32.SetConsoleCtrlHandler(h, True)
    except Exception as e: log('ctrl handler failed', e)

    def pump():
        try:
            WNDPROC = ctypes.WINFUNCTYPE(ctypes.c_ssize_t, wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM)

            def proc(hwnd, msg, wp, lp):
                if msg == 0x0011:                                            # WM_QUERYENDSESSION: Windows is about to shut down / log off
                    once(); return 1
                if msg == 0x0016 and wp:                                     # WM_ENDSESSION (really ending)
                    once(); return 0
                return u32.DefWindowProcW(hwnd, msg, wp, lp)
            cb = WNDPROC(proc); install_exit_hooks._cb = cb

            class WC(ctypes.Structure):
                _fields_ = [('style', wt.UINT), ('lpfnWndProc', WNDPROC), ('cbClsExtra', ctypes.c_int), ('cbWndExtra', ctypes.c_int), ('hInstance', wt.HANDLE),
                            ('hIcon', wt.HANDLE), ('hCursor', wt.HANDLE), ('hbrBackground', wt.HANDLE), ('lpszMenuName', wt.LPCWSTR), ('lpszClassName', wt.LPCWSTR)]
            u32.DefWindowProcW.argtypes = [wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM]; u32.DefWindowProcW.restype = ctypes.c_ssize_t
            u32.CreateWindowExW.restype = wt.HWND
            u32.CreateWindowExW.argtypes = [wt.DWORD, wt.LPCWSTR, wt.LPCWSTR, wt.DWORD, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wt.HWND, wt.HANDLE, wt.HANDLE, wt.LPVOID]
            wc = WC(); wc.lpfnWndProc = cb; wc.hInstance = k32.GetModuleHandleW(None); wc.lpszClassName = 'RizeBuddyShutdownWatcher'
            u32.RegisterClassW(ctypes.byref(wc))
            hw = u32.CreateWindowExW(0, wc.lpszClassName, 'RizeBuddyShutdownWatcher', 0, 0, 0, 0, 0, None, None, wc.hInstance, None)   # hidden top-level window (message-only windows get no shutdown messages)
            msg = wt.MSG()
            while u32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
                u32.TranslateMessage(ctypes.byref(msg)); u32.DispatchMessageW(ctypes.byref(msg))
        except Exception as e:
            log('shutdown watcher failed', repr(e))
    threading.Thread(target=pump, daemon=True).start()
