package com.rizebuddy.app

import android.app.KeyguardManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.Manifest
import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

/**
 * Everything Python needs from Android. droid.py calls these through Chaquopy:  jclass("com.rizebuddy.app.Bridge").foreground()
 * All functions are @JvmStatic so they are plain static methods for Python.
 */
object Bridge {
    const val CH_TRACK = "tracking"
    const val CH_BUDDY = "buddy"
    const val CH_ALERT = "alerts"
    const val PREFS = "rize"

    @Volatile lateinit var app: Context
    @Volatile @JvmField var visible = false          // true while MainActivity is on screen

    private var curPkg: String? = null
    private var lastQuery = 0L
    private val labels = HashMap<String, String>()
    private var lastBuddyNote = 0L
    private var alertId = 100

    // ---------------------------------------------------------------- permissions
    @JvmStatic fun usageGranted(): Boolean = try {
        val ops = app.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= 29) ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), app.packageName)
        else @Suppress("DEPRECATION") ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), app.packageName)
        mode == AppOpsManager.MODE_ALLOWED
    } catch (e: Exception) { false }

    private fun granted(p: String) = ContextCompat.checkSelfPermission(app, p) == PackageManager.PERMISSION_GRANTED

    @JvmStatic fun status(): String {
        val pm = app.getSystemService(Context.POWER_SERVICE) as PowerManager
        return JSONObject().apply {
            put("usage", usageGranted())
            put("notifications", NotificationManagerCompat.from(app).areNotificationsEnabled())
            put("mic", granted(Manifest.permission.RECORD_AUDIO))
            put("battery", pm.isIgnoringBatteryOptimizations(app.packageName))
            put("overlay", Settings.canDrawOverlays(app))
            put("accessibility", RizeAccessibilityService.isEnabled(app))
            put("visible", visible)
        }.toString()
    }

    @JvmStatic fun openSetting(what: String) {
        val i: Intent = when (what) {
            "usage" -> Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:" + app.packageName))
            "notifications" -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, app.packageName)
            "battery" -> Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + app.packageName))
            "overlay" -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + app.packageName))
            "accessibility" -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            else -> Intent(app, SetupActivity::class.java)
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { app.startActivity(i) } catch (e: Exception) {
            try { app.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (ex: Exception) {}
        }
    }

    // ---------------------------------------------------------------- what is in front right now
    private fun label(pkg: String): String = labels.getOrPut(pkg) {
        try {
            val pm = app.packageManager
            pm.getApplicationInfo(pkg, 0).loadLabel(pm).toString()
        } catch (e: Exception) { pkg.substringAfterLast('.') }
    }

    private val launchers: Set<String> by lazy {
        val s = HashSet<String>()
        try {
            val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
            for (r in app.packageManager.queryIntentActivities(home, 0)) s.add(r.activityInfo.packageName)
        } catch (ex: Exception) {}
        s.add("com.android.systemui"); s.add("android")
        s
    }

    @Suppress("DEPRECATION")
    private fun refreshForeground() {
        val usm = app.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        val from = if (lastQuery == 0L) now - 30 * 60_000L else lastQuery - 1500
        val ev = usm.queryEvents(from, now)
        val e = UsageEvents.Event()
        while (ev.hasNextEvent()) {
            ev.getNextEvent(e)
            when (e.eventType) {
                UsageEvents.Event.MOVE_TO_FOREGROUND -> curPkg = e.packageName
                UsageEvents.Event.MOVE_TO_BACKGROUND -> if (e.packageName == curPkg) curPkg = null
            }
        }
        lastQuery = now
    }

    /** JSON: {"pkg":..,"label":..,"title":..,"shell":bool}, or "" when unknown (no permission / nothing in front). */
    @JvmStatic @Synchronized fun foreground(): String {
        if (!usageGranted()) return ""
        try { refreshForeground() } catch (e: Exception) { return "" }
        val p = curPkg ?: return ""
        val o = JSONObject().put("pkg", p).put("label", label(p)).put("shell", launchers.contains(p))
        RizeAccessibilityService.titles[p]?.let { o.put("title", it) }
        return o.toString()
    }

    /** No keyboard / mouse hook on a phone: "idle" means the screen is off or locked. */
    @JvmStatic fun idleSeconds(): Int {
        val pm = app.getSystemService(Context.POWER_SERVICE) as PowerManager
        val km = app.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        return if (!pm.isInteractive || km.isKeyguardLocked) 99999 else 0
    }

    @JvmStatic fun uiVisible(): Boolean = visible

    // ---------------------------------------------------------------- talking to the student
    private fun openMain(extra: String?): PendingIntent {
        val i = Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (extra != null) i.putExtra("open", extra)
        return PendingIntent.getActivity(app, 7, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun canNotify() = NotificationManagerCompat.from(app).areNotificationsEnabled()

    /** Buddy wants the student's attention: open the app if Android allows it, and always leave a heads-up notification. */
    @JvmStatic fun openBuddy(reason: String) {
        if (visible) return
        val now = System.currentTimeMillis()
        if (now - lastBuddyNote < 20_000) return
        lastBuddyNote = now
        if (Settings.canDrawOverlays(app)) {
            try { app.startActivity(Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("open", "buddy")) } catch (ex: Exception) {}
        }
        if (!canNotify()) return
        val pi = openMain("buddy")
        val n = NotificationCompat.Builder(app, CH_BUDDY)
            .setSmallIcon(R.drawable.ic_stat).setContentTitle("Buddy 🤖").setContentText("I have something for you. Tap to chat.")
            .setPriority(NotificationCompat.PRIORITY_HIGH).setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(pi).setAutoCancel(true)
            .setFullScreenIntent(pi, false)
            .build()
        try { NotificationManagerCompat.from(app).notify(2, n) } catch (ex: SecurityException) {}
    }

    @JvmStatic fun notify(title: String, text: String) {
        if (!canNotify()) return
        val n = NotificationCompat.Builder(app, CH_ALERT)
            .setSmallIcon(R.drawable.ic_stat).setContentTitle(title).setContentText(text).setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT).setContentIntent(openMain("buddy")).setAutoCancel(true).build()
        alertId = 100 + (alertId - 99) % 8                // keep at most a few of them on screen
        try { NotificationManagerCompat.from(app).notify(alertId, n) } catch (ex: SecurityException) {}
    }

    @JvmStatic fun setAutostart(on: Boolean) {
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("autostart", on).apply()
    }

    @JvmStatic fun openUrl(url: String) {
        try { app.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (ex: Exception) {}
    }
}
