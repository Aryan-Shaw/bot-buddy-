package com.rizebuddy.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import org.json.JSONObject

/** One screen that walks through the permissions Buddy needs. Every row shows whether it is done; the buttons open the right Android screen. */
class SetupActivity : ComponentActivity() {
    private lateinit var list: LinearLayout
    private val notifPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { render() }
    private val micPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { render() }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Bridge.app = applicationContext
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(18), dp(24), dp(18), dp(18)) }
        root.addView(TextView(this).apply { text = "Set up Rize Buddy"; textSize = 24f; setTypeface(typeface, Typeface.BOLD) })
        root.addView(TextView(this).apply {
            text = "Android needs your OK for a few things. Everything stays on your phone. Only the first one is required."
            textSize = 14f; setPadding(0, dp(6), 0, dp(14))
        })
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(list)
        root.addView(Button(this).apply {
            text = "Start Buddy"
            setOnClickListener {
                getSharedPreferences(Bridge.PREFS, Context.MODE_PRIVATE).edit().putBoolean("setupSeen", true).apply()
                startActivity(Intent(this@SetupActivity, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
                finish()
            }
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(16) })
        setContentView(ScrollView(this).apply { addView(root) })
    }

    override fun onResume() { super.onResume(); render() }

    private fun row(title: String, why: String, done: Boolean, required: Boolean, action: () -> Unit) {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(12), dp(10), dp(12), dp(10)) }
        box.addView(TextView(this).apply {
            text = (if (done) "✅  " else if (required) "⬜  " else "◻️  ") + title + (if (required) "  (required)" else "")
            textSize = 16f; setTypeface(typeface, Typeface.BOLD)
        })
        box.addView(TextView(this).apply { text = why; textSize = 13f; alpha = 0.75f; setPadding(0, dp(2), 0, dp(6)) })
        if (!done) box.addView(Button(this).apply { text = "Allow"; setOnClickListener { action() } }, LinearLayout.LayoutParams(-2, -2).apply { gravity = Gravity.START })
        list.addView(box, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(8) })
    }

    private fun render() {
        list.removeAllViews()
        val s = JSONObject(Bridge.status())
        row("Usage access", "Lets Buddy see which app is open (app name and time only), so it knows when you study and when you drift. In the list that opens, pick Rize Buddy and switch it on.",
            s.getBoolean("usage"), true) { Bridge.openSetting("usage") }
        row("Notifications", "So Buddy can nudge you, remind you of goals and show the small \"tracking\" notice.",
            s.getBoolean("notifications"), false) {
            if (Build.VERSION.SDK_INT >= 33) notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS) else Bridge.openSetting("notifications")
        }
        row("Microphone", "Only for talking to Buddy with the mic button.", s.getBoolean("mic"), false) { micPerm.launch(Manifest.permission.RECORD_AUDIO) }
        row("Run in the background without limits", "Stops Android from putting Buddy to sleep while you study. Strongly recommended, otherwise tracking can stop after a while.",
            s.getBoolean("battery"), false) { Bridge.openSetting("battery") }
        row("Display over other apps", "Lets Buddy pop up by itself when you drift off your goal. Without it Buddy sends a notification instead.",
            s.getBoolean("overlay"), false) { Bridge.openSetting("overlay") }
        row("Accessibility (browser site + YouTube video title)", "Optional. Lets Buddy read only the website address in your browser and the title of the YouTube video you watch, so it can tell a lecture from a meme. Reads nothing else, only in browsers and YouTube, nothing leaves the phone. Switch on \"Rize Buddy\" in the list.",
            s.getBoolean("accessibility"), false) { Bridge.openSetting("accessibility") }
    }
}
