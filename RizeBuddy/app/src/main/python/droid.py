"""Android glue for Rize Buddy.

The Windows build watches the foreground window with ctypes, shows a tray icon and opens Edge windows. None of that exists on
Android, so tracker.install() swaps those functions for the ones below, which talk to Kotlin (com.rizebuddy.app.Bridge):
  foreground app   <- UsageStatsManager (+ optional AccessibilityService for the browser's site and the YouTube video title)
  idle             <- screen off / locked
  tray / pop-ups   <- notifications, and bringing the app to the front
"""
import json, os, re, sys, threading, time
from flask import jsonify, request

OWN_PKG = 'com.rizebuddy.app'
BROWSER_PKGS = {'com.android.chrome', 'com.chrome.beta', 'com.chrome.dev', 'com.chrome.canary', 'org.mozilla.firefox', 'org.mozilla.fenix', 'org.mozilla.firefox_beta',
                'com.brave.browser', 'com.microsoft.emmx', 'com.sec.android.app.sbrowser', 'com.opera.browser', 'com.opera.mini.native', 'com.duckduckgo.mobile.android',
                'com.kiwibrowser.browser', 'com.vivaldi.browser', 'com.google.android.apps.chrome', 'com.mi.globalbrowser', 'com.android.browser', 'org.chromium.webview_shell'}
YT_PKGS = {'com.google.android.youtube', 'app.revanced.android.youtube'}
PKG = {}            # display name -> package name of the app seen last (the tracker only passes names around)

try:
    from java import jclass
    B = jclass('com.rizebuddy.app.Bridge')
except Exception as e:      # desktop test run (no Chaquopy): tests inject their own Bridge
    B = None


def _bridge(): return B


def fg():
    """What is in front right now: dict(pkg, label, title, shell) or {}."""
    try:
        s = _bridge().foreground()
        return json.loads(s) if s else {}
    except Exception as e:
        print('foreground failed:', e); return {}


def install(T):
    """Replace the Windows-only functions of tracker module T. Called once, at the end of tracker.py."""
    T.BROWSERS = re.compile(r'^(chrome|firefox|brave|edge|opera|opera mini|vivaldi|samsung internet|duckduckgo|kiwi browser|mi browser|browser)$', re.I)

    def idle_seconds():
        try: return float(_bridge().idleSeconds())
        except Exception: return 0.0

    def active_window():
        j = fg()
        if not j: return None
        pkg, label = j.get('pkg', ''), j.get('label') or j.get('pkg', '')
        if pkg == OWN_PKG: return ('rizebuddy', 'Rize Buddy')            # Buddy's own screen: tracker shows "viewing - not counted"
        if j.get('shell'): return ('launcher', '')
        PKG[label] = pkg
        return (label, j.get('title', '') or '')

    def is_shell(name, title=''):
        return (name or '').strip().lower() in ('launcher', 'android system', 'system ui', 'systemui')

    def top_app_window(): return None

    def classify(name, title):
        pkg = PKG.get(name, ''); title = (title or '').strip()
        if pkg in YT_PKGS:
            return {'app': name, 'title': re.sub(r'\s[-–—]\s*YouTube$', '', title) or 'YouTube (video not visible)', 'kind': 'youtube', 'site': ''}
        if pkg in BROWSER_PKGS:
            title = re.sub(r'^\(\d+\)\s*', '', title)
            if re.search(r'(^|\.)youtube\.com|youtu\.be', title, re.I) and not re.search(r'\s[-–—]\s', title):
                return {'app': name, 'title': 'YouTube home' if re.fullmatch(r'(m\.|www\.)?youtube\.com/?', title, re.I) else title, 'kind': 'youtube', 'site': ''}
            return {'app': name, 'title': title or name, 'kind': 'browser', 'site': ''}
        return {'app': name, 'title': title or name, 'kind': 'app', 'site': ''}

    def tray_notify(msg):
        try: _bridge().notify('Rize Buddy', str(msg))
        except Exception as e: print('notify failed:', e)

    def notify_offtask(m):
        try:
            if T.buddy.on_offtask(m, T.offgoal_now(), T.focus.F(T.data)['goal']['name']): return
        except Exception as e: print('buddy offtask failed:', e)
        tray_notify(f'You have been off-task for {m} minutes. Ready to get back to work?')

    def open_buddy(*a):
        try: _bridge().openBuddy('')
        except Exception as e: print('open buddy failed:', e)

    def buddy_open():
        try: return bool(_bridge().uiVisible())
        except Exception: return False

    def open_peek(kind='peek', arg=''):
        try:
            if kind == 'streak': _bridge().notify('🔥 %s-minute focus streak!' % arg, 'Keep going, you are on a roll.')
            else:
                g = T.focus.F(T.data)['goal']['name'] if T.focus.F(T.data).get('goal') else ''
                _bridge().notify('Rize Buddy', '%d min on your goal today%s' % (round(T.work_minutes()), (' · ' + g) if g else ''))
        except Exception as e: print('peek failed:', e)

    def open_ui(*a, page=''):
        if page in T.PAGE_IDS: T.NAVREQ.update(seq=T.NAVREQ['seq'] + 1, page=page, t=time.time())
        open_buddy()

    def open_freeze(sec, what, mins, goal, head='', body=''):
        if T.productive_now(): return
        tray_notify(body or head or f'You have been on {what} for {mins} min. Back to {goal}?')

    def apply_autostart(on):
        try: _bridge().setAutostart(bool(on)); return True, ''
        except Exception as e: return False, str(e)

    def open_ai_browser():
        try: _bridge().openUrl(T.data.get('aiLast') or 'https://gemini.google.com')
        except Exception as e: print('open url failed:', e)

    for f in (idle_seconds, active_window, is_shell, top_app_window, classify, tray_notify, notify_offtask, open_buddy, buddy_open, open_peek, open_ui,
              open_freeze, apply_autostart, open_ai_browser):
        setattr(T, f.__name__, f)

    @T.web.get('/api/android/status')
    def android_status():
        try: return jsonify(json.loads(_bridge().status()))
        except Exception as e: return jsonify(error=str(e))

    @T.web.post('/api/android/open')
    def android_open():
        if request.headers.get('X-Rize') != '1': return 'no', 403
        what = (request.get_json(silent=True) or {}).get('what', '')
        try: _bridge().openSetting(what)
        except Exception as e: return jsonify(ok=False, error=str(e))
        return jsonify(ok=True)


def android_main(T):
    """Same start-up as tracker.main() without the tray icon, the 'already running' check and the Windows registry."""
    T.load(); T.data['pausedUntil'] = 0
    with T.lock: T.links.normalize(T.data); T.autorev.A(T.data)
    T.store.install_exit_hooks(lambda: (T.buddy.beat(), T.store.save(T.data, T.lock)))
    if not T.data.get('autoInit'): T.data['autoInit'] = True; T.data['autostart'] = True
    T.apply_autostart(bool(T.data.get('autostart')))
    T.save()
    T.buddy.init(T.data, T.lock, T.save, T.work_minutes, T.offtask_minutes, lambda: T.now, T.open_buddy, T.idle_ok, T.snooze, T.streak_now, T.open_peek,
                 win_open=T.buddy_open, stretch=T.work_stretch, notify=T.tray_notify, stats=T.stats_today, quiet=T.quiet_now, guard=T.streak_guard,
                 sites=T.site_stats, away=T.away_report, review=T.review_site, prod=T.productive_now)
    T.buddy.H['mins'] = T.link_minutes; T.buddy.H['skey'] = T.skey; T.buddy.H['reviewable'] = T.reviewable
    T.buddy.start_gap()
    if T.LOAD['note']: T.buddy.on_data_note(T.LOAD['note'], T.store.S['source'])
    threading.Thread(target=T.loop, daemon=True, name='rize-loop').start()
    threading.Thread(target=T.maintain, daemon=True, name='rize-maintain').start()
    threading.Thread(target=lambda: T.web.run('127.0.0.1', T.PORT, threaded=True, use_reloader=False), daemon=True, name='rize-web').start()
