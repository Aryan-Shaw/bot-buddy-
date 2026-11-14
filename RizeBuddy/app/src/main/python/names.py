"""Readable names for apps and sites. DISPLAY ONLY: review keys (app:/web:/yt:) never change, so every label the student already gave stays valid.

nice(kind, app, title) -> (name, tag, hint)
    name  what to show in big text           ("Snipping Tool", "Claude", "Rize dashboard")
    tag   what kind of thing it is            ("App", "Website", "YouTube", "Local page")
    hint  the raw text it came from, shown small when it adds information ("ScreenClippingHost", "127.0.0.1:8766")
"""
import re

APPS = {
    'screenclippinghost': 'Snipping Tool', 'snippingtool': 'Snipping Tool', 'screensketch': 'Snip & Sketch', 'cmd': 'Command Prompt', 'conhost': 'Command Prompt',
    'powershell': 'PowerShell', 'pwsh': 'PowerShell', 'windowsterminal': 'Windows Terminal', 'wt': 'Windows Terminal', 'explorer': 'File Explorer',
    'msedge': 'Microsoft Edge', 'chrome': 'Google Chrome', 'firefox': 'Firefox', 'brave': 'Brave', 'opera': 'Opera', 'vivaldi': 'Vivaldi',
    'code': 'VS Code', 'devenv': 'Visual Studio', 'pycharm64': 'PyCharm', 'idea64': 'IntelliJ IDEA', 'notepad': 'Notepad', 'notepad++': 'Notepad++',
    'winword': 'Word', 'excel': 'Excel', 'powerpnt': 'PowerPoint', 'onenote': 'OneNote', 'outlook': 'Outlook', 'acrobat': 'Adobe Acrobat', 'acrord32': 'Adobe Reader',
    'taskmgr': 'Task Manager', 'calculatorapp': 'Calculator', 'calc': 'Calculator', 'mspaint': 'Paint', 'photos': 'Photos', 'applicationframehost': 'Windows app',
    'systemsettings': 'Windows Settings', 'searchhost': 'Windows Search', 'searchapp': 'Windows Search', 'startmenuexperiencehost': 'Start menu', 'lockapp': 'Lock screen',
    'shellexperiencehost': 'Windows shell', 'textinputhost': 'Touch keyboard', 'spotify': 'Spotify', 'discord': 'Discord', 'whatsapp': 'WhatsApp', 'telegram': 'Telegram',
    'zoom': 'Zoom', 'teams': 'Microsoft Teams', 'ms-teams': 'Microsoft Teams', 'slack': 'Slack', 'vlc': 'VLC', 'obs64': 'OBS Studio', 'steam': 'Steam',
    'python': 'Python', 'pythonw': 'Python', 'rizebuddy': 'Rize Buddy', 'anki': 'Anki', 'obsidian': 'Obsidian', 'notion': 'Notion', 'claude': 'Claude (app)',
    'wps': 'WPS Office', 'et': 'WPS Spreadsheets', 'wpp': 'WPS Presentation', 'xodo': 'Xodo', 'gimp-2.10': 'GIMP', 'photoshop': 'Photoshop',
}

SITES = {
    'claude': 'Claude', 'claude.ai': 'Claude', 'chatgpt': 'ChatGPT', 'chat.openai.com': 'ChatGPT', 'gemini': 'Gemini', 'perplexity': 'Perplexity',
    'youtube': 'YouTube', 'youtube.com': 'YouTube', 'google': 'Google', 'google search': 'Google Search', 'google docs': 'Google Docs', 'google drive': 'Google Drive',
    'google classroom': 'Google Classroom', 'google meet': 'Google Meet', 'gmail': 'Gmail', 'inbox': 'Gmail', 'github': 'GitHub', 'stack overflow': 'Stack Overflow',
    'wikipedia': 'Wikipedia', 'khan academy': 'Khan Academy', 'byju\'s': "BYJU'S", 'vedantu': 'Vedantu', 'physics wallah': 'Physics Wallah', 'unacademy': 'Unacademy',
    'instagram': 'Instagram', 'facebook': 'Facebook', 'x': 'X (Twitter)', 'twitter': 'X (Twitter)', 'reddit': 'Reddit', 'whatsapp': 'WhatsApp Web', 'netflix': 'Netflix',
    'prime video': 'Prime Video', 'hotstar': 'Hotstar', 'amazon': 'Amazon', 'flipkart': 'Flipkart', 'linkedin': 'LinkedIn', 'pinterest': 'Pinterest', 'quora': 'Quora',
    'geeksforgeeks': 'GeeksforGeeks', 'w3schools': 'W3Schools', 'javatpoint': 'Javatpoint', 'byjus': "BYJU'S", 'toppr': 'Toppr', 'ncert': 'NCERT', 'leetcode': 'LeetCode',
    'codeforces': 'Codeforces', 'stackoverflow': 'Stack Overflow', 'khanacademy': 'Khan Academy', 'instagram.com': 'Instagram', 'facebook.com': 'Facebook',
    'new tab': 'New tab', 'about:blank': 'Blank page', 'untitled': 'Untitled page',
}

LOCAL = re.compile(r'^(?:https?://)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?:[:_](\d{2,5}))?[_/\s]*(.*)$', re.I)
HOST = re.compile(r'^(?:https?://)?(?:www\.)?([a-z0-9][a-z0-9\-]*(?:\.[a-z0-9\-]+)+)(?:[:/_].*)?$', re.I)


def _words(s):
    """ScreenClippingHost -> Screen Clipping; my_app-name.exe -> My App Name."""
    s = re.sub(r'\.exe$', '', s or '', flags=re.I)
    s = re.sub(r'(?i)(host|helper)$', '', s) if len(s) > 8 else s
    s = re.sub(r'[_\-.]+', ' ', s)
    s = re.sub(r'(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s.title() if s and (s.islower() or s.isupper()) else s


def app_name(app):
    k = re.sub(r'\.exe$', '', (app or '').strip(), flags=re.I).lower()
    return APPS.get(k) or _words(app) or 'Unknown app'


def site_name(label, title=''):
    """label = what the tracker keeps as the site (last part of the tab title), title = the whole tab title."""
    raw = (label or '').strip()
    if not raw or raw in ('_', '/', '-'):
        return 'Untitled page', 'Website', 'the browser gave no page title'
    m = LOCAL.match(raw)
    if m:
        port = m.group(2) or ''
        if port == '8766': return 'Rize dashboard', 'Local page', raw
        return ('Local page (' + m.group(1) + (':' + port if port else '') + ')'), 'Local page', raw
    k = raw.lower().rstrip('/_ ')
    if k in SITES: return SITES[k], 'Website', ''
    h = HOST.match(raw)
    if h:
        host = h.group(1).lower()
        if host in SITES: return SITES[host], 'Website', host
        base = host.split('.')[-2] if host.count('.') >= 1 else host
        return SITES.get(base) or base.title(), 'Website', host
    return raw[:42], 'Website', ''


def nice(kind, app, title):
    """The student-facing name of one tracked thing."""
    if kind == 'youtube':
        return (title or 'YouTube video')[:60], 'YouTube', ''
    if kind == 'browser':
        from_tab = title or ''
        p = re.split(r'\s[-\u2013\u2014|\u00b7\u2022]\s', from_tab); last = p[-1].strip()
        label = last if len(p) > 1 and len(last) <= 26 else from_tab[:40]
        nm, tag, hint = site_name(label, from_tab)
        if (not hint and len(p) > 1 and nm.lower() == last.lower() or (not hint and len(p) > 1 and SITES.get(last.lower()) == nm)) and len(p[0].strip()) > 2:
            hint = p[0].strip()[:46]                                                   # the page you were on, when the site name alone says little
        return nm, tag, hint
    nm = app_name(app)
    raw = re.sub(r'\.exe$', '', app or '', flags=re.I)
    return nm, 'App', raw if raw and raw.lower().replace(' ', '') != nm.lower().replace(' ', '') else ''
