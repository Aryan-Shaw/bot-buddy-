"""Entry point called from Kotlin (TrackerService) through Chaquopy: android_entry.start(files_dir)."""
import os, sys, threading

_started = False


def start(files_dir):
    """Starts the tracker, Buddy and the local web server (127.0.0.1:8766) on background threads and returns at once."""
    global _started
    if _started: return True
    _started = True
    os.environ['RIZE_ANDROID'] = '1'
    os.environ['APPDATA'] = files_dir            # store.py keeps everything in <APPDATA>/RizeBuddy
    os.environ['HOME'] = files_dir
    os.environ['RIZE_BASE'] = files_dir          # tracker serves <files_dir>/renderer (copied from the APK assets by Kotlin)
    import tracker, droid
    droid.android_main(tracker)
    return True
