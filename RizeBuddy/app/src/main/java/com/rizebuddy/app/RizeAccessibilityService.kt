package com.rizebuddy.app

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.util.concurrent.ConcurrentHashMap

/**
 * OPTIONAL. Only listens to browsers and YouTube (see res/xml/accessibility_config.xml) and only keeps two things in memory:
 * the website shown in the browser's address bar, and the title of the YouTube video on screen. Without it Buddy still works,
 * it just sees "Chrome" or "YouTube" instead of the site or the video.
 */
class RizeAccessibilityService : AccessibilityService() {
    companion object {
        val titles = ConcurrentHashMap<String, String>()
        private val URL_IDS = Regex("(url_bar|url_view|location_bar|toolbar_url|mozac_browser_toolbar_url_view|url_field|addressbaredit|search_box_text)", RegexOption.IGNORE_CASE)
        private val YT_TITLE_IDS = Regex("(/title$|/video_title$|/watch_title$)")

        fun isEnabled(ctx: Context): Boolean {
            val me = ComponentName(ctx, RizeAccessibilityService::class.java).flattenToString()
            val s = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
            return s.split(':').any { it.equals(me, ignoreCase = true) }
        }

        fun cleanUrl(raw: String): String {
            var t = raw.trim().removePrefix("https://").removePrefix("http://").removePrefix("www.")
            if (!t.contains(' ') && t.contains('.')) t = t.substringBefore('/').substringBefore('?')
            return t.take(80)
        }
    }

    private val lastRun = HashMap<String, Long>()

    override fun onAccessibilityEvent(e: AccessibilityEvent?) {
        val pkg = e?.packageName?.toString() ?: return
        val now = System.currentTimeMillis()
        if (now - (lastRun[pkg] ?: 0L) < 1200) return
        lastRun[pkg] = now
        val root = try { rootInActiveWindow } catch (ex: Exception) { null } ?: return
        try {
            if (root.packageName?.toString() != pkg) return
            if (pkg == "com.google.android.youtube") {
                findText(root, YT_TITLE_IDS, 600)?.let { titles[pkg] = it.take(150) }
            } else {
                findText(root, URL_IDS, 400)?.let { titles[pkg] = cleanUrl(it) }
            }
        } catch (ex: Exception) {
        } finally {
            try { root.recycle() } catch (ex: Exception) {}
        }
    }

    /** Breadth-first search (bounded) for the first node whose view id matches and that has text. */
    private fun findText(root: AccessibilityNodeInfo, ids: Regex, limit: Int): String? {
        val q = ArrayDeque<AccessibilityNodeInfo>()
        q.add(root)
        var seen = 0
        while (q.isNotEmpty() && seen < limit) {
            val n = q.removeFirst(); seen++
            val id = n.viewIdResourceName
            val txt = n.text?.toString()
            if (id != null && !txt.isNullOrBlank() && ids.containsMatchIn(id)) return txt
            for (i in 0 until n.childCount) n.getChild(i)?.let { q.add(it) }
        }
        return null
    }

    override fun onInterrupt() {}
}
