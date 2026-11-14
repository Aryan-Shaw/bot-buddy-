package com.rizebuddy.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class RizeApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Bridge.app = applicationContext
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(Bridge.CH_TRACK, "Tracking", NotificationManager.IMPORTANCE_LOW).apply {
                description = "The small notification that keeps Buddy running in the background"
                setShowBadge(false)
            })
            nm.createNotificationChannel(NotificationChannel(Bridge.CH_BUDDY, "Buddy wants to talk", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Nudges, goal reminders and check-ins from Buddy"
            })
            nm.createNotificationChannel(NotificationChannel(Bridge.CH_ALERT, "Alerts", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Streaks, break reminders and other short messages"
            })
        }
    }
}
