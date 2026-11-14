package com.rizebuddy.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Base64
import android.util.Log
import android.view.Gravity
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** One full-screen WebView showing Buddy (and the dashboard) from the local server that TrackerService starts. */
class MainActivity : ComponentActivity() {
    companion object {
        const val BASE = "http://127.0.0.1:8766"
        const val TAG = "RizeBuddy"
    }

    private lateinit var web: WebView
    private lateinit var splash: TextView
    private val ui = Handler(Looper.getMainLooper())
    private var fileCb: ValueCallback<Array<Uri>>? = null
    private var recognizer: SpeechRecognizer? = null
    private var pendingLang: String? = null
    private var loaded = false

    private val chooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        fileCb?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
        fileCb = null
    }
    private val micPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        val lang = pendingLang; pendingLang = null
        if (ok && lang != null) beginListening(lang) else if (!ok) { sr("error", "not-allowed"); sr("end", "") }
    }
    private val notifPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Bridge.app = applicationContext

        web = WebView(this)
        splash = TextView(this).apply {
            text = "Starting Buddy…"; textSize = 16f; gravity = Gravity.CENTER
            setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.rize_bg))
            setTextColor(if ((resources.configuration.uiMode and 0x30) == 0x20) Color.WHITE else Color.parseColor("#4A3428"))
        }
        setContentView(FrameLayout(this).apply {
            addView(web, FrameLayout.LayoutParams(-1, -1))
            addView(splash, FrameLayout.LayoutParams(-1, -1))
        })

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false      // Buddy's voice and focus sound
            cacheMode = WebSettings.LOAD_NO_CACHE
            allowFileAccess = false
            setSupportZoom(false)
        }
        web.overScrollMode = View.OVER_SCROLL_NEVER
        web.addJavascriptInterface(WebBridge(), "RizeAndroid")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                val u = r.url
                if (u.host == "127.0.0.1" || u.host == "localhost") return false
                try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (e: Exception) { Log.w(TAG, "no app for $u") }
                return true
            }
            override fun onPageFinished(v: WebView, url: String) { splash.visibility = View.GONE }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { request.grant(request.resources) }
            }
            override fun onShowFileChooser(v: WebView, cb: ValueCallback<Array<Uri>>, p: FileChooserParams): Boolean {
                fileCb?.onReceiveValue(null); fileCb = cb
                return try { chooser.launch(p.createIntent()); true } catch (e: Exception) { fileCb = null; false }
            }
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else moveTaskToBack(true) }
        })

        if (Build.VERSION.SDK_INT >= 33 && !granted(Manifest.permission.POST_NOTIFICATIONS)) notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS)
        TrackerService.start(this)
        val prefs = getSharedPreferences(Bridge.PREFS, Context.MODE_PRIVATE)
        if (!Bridge.usageGranted() && !prefs.getBoolean("setupSeen", false)) startActivity(Intent(this, SetupActivity::class.java))
        waitForServer(if (intent?.getStringExtra("open") == "dash") "/" else "/companion.html")
    }

    private fun granted(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    /** Python needs a few seconds on the first start: poll the server, then load Buddy. */
    private fun waitForServer(path: String) {
        Thread({
            val until = System.currentTimeMillis() + 120_000
            while (System.currentTimeMillis() < until) {
                try {
                    val c = URL("$BASE/api/version").openConnection() as HttpURLConnection
                    c.connectTimeout = 800; c.readTimeout = 1500
                    if (c.responseCode == 200) { runOnUiThread { loaded = true; web.loadUrl(BASE + path) }; return@Thread }
                } catch (e: Exception) { /* not up yet */ }
                val err = TrackerService.error
                if (err != null) { runOnUiThread { splash.text = "Buddy could not start.\n\n$err\n\nClose the app and open it again." }; return@Thread }
                Thread.sleep(500)
            }
            runOnUiThread { splash.text = "Buddy is taking too long to start.\nClose the app and open it again." }
        }, "rize-wait").start()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (!loaded) return
        when (intent.getStringExtra("open")) {
            "buddy" -> if (web.url?.contains("companion.html") != true) web.loadUrl("$BASE/companion.html")
            "dash" -> web.loadUrl("$BASE/")
        }
    }

    override fun onResume() { super.onResume(); Bridge.visible = true }
    override fun onPause() { Bridge.visible = false; super.onPause() }

    override fun onDestroy() {
        recognizer?.destroy(); recognizer = null
        super.onDestroy()
    }

    // ---------------------------------------------------------------- voice typing (WebView has no SpeechRecognition)
    private fun sr(type: String, payload: String) {
        val js = "window.__rizeSR&&window.__rizeSR(" + JSONObject.quote(type) + "," + JSONObject.quote(payload) + ")"
        runOnUiThread { web.evaluateJavascript(js, null) }
    }

    private fun beginListening(lang: String) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            sr("error", "service-not-allowed"); sr("end", ""); Toast.makeText(this, "No speech recognition service on this phone. Please type 🙂", Toast.LENGTH_LONG).show(); return
        }
        recognizer?.destroy()
        val r = SpeechRecognizer.createSpeechRecognizer(this); recognizer = r
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(p: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(v: Float) {}
            override fun onBufferReceived(b: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(t: Int, p: Bundle?) {}
            override fun onPartialResults(b: Bundle) { b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { sr("partial", it) } }
            override fun onResults(b: Bundle) {
                b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { sr("result", it) }
                sr("end", "")
            }
            override fun onError(e: Int) {
                when (e) {
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> sr("error", "no-speech")
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> sr("error", "not-allowed")
                    SpeechRecognizer.ERROR_CLIENT -> {}
                    else -> sr("error", "network")
                }
                sr("end", "")
            }
        })
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        r.startListening(i)
    }

    // ---------------------------------------------------------------- what the pages can call (window.RizeAndroid)
    inner class WebBridge {
        @JavascriptInterface fun startListening(lang: String) = runOnUiThread {
            if (granted(Manifest.permission.RECORD_AUDIO)) beginListening(lang) else { pendingLang = lang; micPerm.launch(Manifest.permission.RECORD_AUDIO) }
        }
        @JavascriptInterface fun stopListening() = runOnUiThread { recognizer?.stopListening() }
        @JavascriptInterface fun status(): String = Bridge.status()
        @JavascriptInterface fun openSetting(what: String) = runOnUiThread { Bridge.openSetting(what) }
        @JavascriptInterface fun saveFile(name: String, base64: String, mime: String) {
            Thread {
                try { toast("Saved to Downloads: " + save(name, Base64.decode(base64, Base64.DEFAULT), mime)) }
                catch (e: Exception) { Log.e(TAG, "save failed", e); toast("Could not save the file") }
            }.start()
        }
    }

    private fun toast(t: String) = runOnUiThread { Toast.makeText(this, t, Toast.LENGTH_LONG).show() }

    /** Writes into the public Downloads folder (MediaStore on Android 10+, the app's own folder before that). */
    private fun save(rawName: String, bytes: ByteArray, mime: String): String {
        val name = rawName.replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "rize-export" }
        if (Build.VERSION.SDK_INT >= 29) {
            val v = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name); put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            }
            val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v) ?: throw IllegalStateException("no uri")
            contentResolver.openOutputStream(uri)!!.use { it.write(bytes) }
        } else {
            val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: filesDir
            java.io.File(dir, name).writeBytes(bytes)
            return java.io.File(dir, name).absolutePath
        }
        return name
    }
}
