package com.rizebuddy.app

import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import java.io.File

/** Foreground service: starts Python once (Buddy server + tracker) and keeps the process alive while the app is in the background. */
class TrackerService : Service() {
    companion object {
        const val TAG = "RizeBuddy"
        @Volatile var running = false
        @Volatile var error: String? = null

        fun start(ctx: Context) {
            val i = Intent(ctx, TrackerService::class.java)
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val open = PendingIntent.getActivity(this, 1, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(this, Bridge.CH_TRACK)
            .setSmallIcon(R.drawable.ic_stat).setContentTitle("Rize Buddy").setContentText("Tracking your study time")
            .setOngoing(true).setContentIntent(open).setPriority(NotificationCompat.PRIORITY_LOW).build()
        try {
            val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
            ServiceCompat.startForeground(this, 1, n, type)
        } catch (e: Exception) {
            Log.e(TAG, "startForeground failed", e); error = "Could not start the background service: $e"
        }
        startPython()
        return START_STICKY
    }

    @Synchronized private fun startPython() {
        if (running) return
        running = true
        Thread({
            try {
                installAssets(applicationContext)
                if (!Python.isStarted()) Python.start(AndroidPlatform(applicationContext))
                Python.getInstance().getModule("android_entry").callAttr("start", filesDir.absolutePath)
                error = null
            } catch (t: Throwable) {
                Log.e(TAG, "python start failed", t); error = t.toString(); running = false
            }
        }, "rize-python-start").start()
    }

    /** The web pages live in the APK assets; Flask serves them from files/renderer, copied again whenever the app version changes. */
    private fun installAssets(ctx: Context) {
        val prefs = ctx.getSharedPreferences(Bridge.PREFS, Context.MODE_PRIVATE)
        val ver = if (Build.VERSION.SDK_INT >= 28) ctx.packageManager.getPackageInfo(ctx.packageName, 0).longVersionCode
        else @Suppress("DEPRECATION") ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionCode.toLong()
        val dst = File(ctx.filesDir, "renderer")
        if (dst.isDirectory && prefs.getLong("assetVersion", -1) == ver) return
        dst.deleteRecursively()
        copyAsset(ctx, "renderer", dst)
        prefs.edit().putLong("assetVersion", ver).apply()
    }

    private fun copyAsset(ctx: Context, path: String, dst: File) {
        val kids = ctx.assets.list(path) ?: emptyArray()
        if (kids.isEmpty()) {
            dst.parentFile?.mkdirs()
            ctx.assets.open(path).use { i -> dst.outputStream().use { o -> i.copyTo(o) } }
        } else {
            dst.mkdirs()
            for (k in kids) copyAsset(ctx, "$path/$k", File(dst, k))
        }
    }
}
