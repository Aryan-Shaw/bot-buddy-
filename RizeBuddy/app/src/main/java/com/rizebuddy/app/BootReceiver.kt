package com.rizebuddy.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Starts tracking after the phone restarts or the app is updated (switch off in Buddy's settings: "Start automatically"). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!context.getSharedPreferences(Bridge.PREFS, Context.MODE_PRIVATE).getBoolean("autostart", true)) return
        try { TrackerService.start(context) } catch (ex: Exception) {}
    }
}
