package expo.modules.freqplayback

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log

/**
 * A media playback foreground service that lives exactly as long as a
 * listening session.
 *
 * It plays nothing itself. Its job is to tell Android that this app is
 * playing audio for the person, so the process, CPU and Wi-Fi radio stay
 * awake while the screen is off, and to give the session a home on the lock
 * screen and in the notification shade.
 */
class ListenService : Service() {
  companion object {
    private const val TAG = "FreqListenService"
    private const val CHANNEL_ID = "freq_listening"
    private const val NOTIFICATION_ID = 7341
    private const val ACTION_START = "expo.modules.freqplayback.START"
    private const val ACTION_STOP_FROM_USER = "expo.modules.freqplayback.STOP_FROM_USER"
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_TEXT = "text"

    /** A session longer than this is almost certainly a phone left on a desk. */
    private const val WAKE_LOCK_TIMEOUT_MS = 6L * 60 * 60 * 1000

    @Volatile
    private var current: ListenService? = null

    fun start(context: Context, title: String, text: String) {
      val intent = Intent(context, ListenService::class.java)
        .setAction(ACTION_START)
        .putExtra(EXTRA_TITLE, title)
        .putExtra(EXTRA_TEXT, text)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (e: Exception) {
        // Android 12+ refuses to start a foreground service from the
        // background. Sessions start from a tap, so this only happens if the
        // app was sent to the background mid tap; audio still plays while the
        // app is in front, it just will not survive the screen going off.
        Log.w(TAG, "Could not start the listening service", e)
      }
    }

    /** Retitles the running notification, without going through an intent. */
    fun update(title: String, text: String) {
      current?.show(title, text)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, ListenService::class.java))
    }

    fun isRunning(): Boolean = current != null
  }

  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null
  private var session: MediaSession? = null
  private var title = ""
  private var text = ""

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    current = this
    createChannel()
    session = MediaSession(this, "FreqListen").apply {
      setCallback(object : MediaSession.Callback() {
        override fun onStop() = requestStop()
        // There is nothing to pause: a live frequency cannot be resumed from
        // where it was left. The lock screen's pause button ends the session.
        override fun onPause() = requestStop()
      })
      isActive = true
    }
    acquireLocks()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP_FROM_USER) {
      requestStop()
      return START_NOT_STICKY
    }
    title = intent?.getStringExtra(EXTRA_TITLE) ?: title
    text = intent?.getStringExtra(EXTRA_TEXT) ?: text
    goForeground()
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // Swiping the app away destroys the WebView that carries the audio, so
    // there is nothing left to keep alive.
    requestStop()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    current = null
    releaseLocks()
    session?.isActive = false
    session?.release()
    session = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun requestStop() {
    FreqPlaybackModule.notifyStopRequested()
    stopSelf()
  }

  private fun show(title: String, text: String) {
    this.title = title
    this.text = text
    updateSession()
    getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, buildNotification())
  }

  private fun goForeground() {
    updateSession()
    val notification = buildNotification()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      Log.w(TAG, "startForeground was refused", e)
      stopSelf()
    }
  }

  private fun updateSession() {
    session?.setMetadata(
      MediaMetadata.Builder()
        .putString(MediaMetadata.METADATA_KEY_TITLE, title)
        .putString(MediaMetadata.METADATA_KEY_ARTIST, text)
        .putString(MediaMetadata.METADATA_KEY_ALBUM, "VATSIM Listen")
        .build()
    )
    session?.setPlaybackState(
      PlaybackState.Builder()
        .setActions(PlaybackState.ACTION_STOP or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE)
        .setState(PlaybackState.STATE_PLAYING, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
        .build()
    )
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(CHANNEL_ID, "Listening", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Shows the frequency you are listening to while the app is in the background."
      setShowBadge(false)
    }
    getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
  }

  @Suppress("DEPRECATION")
  private fun buildNotification(): Notification {
    val immutable = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

    val openApp = packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      launch.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
      PendingIntent.getActivity(this, 0, launch, immutable)
    }
    val stop = PendingIntent.getService(
      this,
      1,
      Intent(this, ListenService::class.java).setAction(ACTION_STOP_FROM_USER),
      immutable
    )

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      Notification.Builder(this).setPriority(Notification.PRIORITY_LOW)
    }

    val stopAction = Notification.Action.Builder(
      Icon.createWithResource(this, R.drawable.freq_stop),
      "Stop",
      stop
    ).build()

    return builder
      .setSmallIcon(R.drawable.freq_notification)
      .setContentTitle(title)
      .setContentText(text)
      .setContentIntent(openApp)
      .setDeleteIntent(stop)
      .setOngoing(true)
      .setShowWhen(false)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_TRANSPORT)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .addAction(stopAction)
      .setStyle(
        Notification.MediaStyle()
          .setMediaSession(session?.sessionToken)
          .setShowActionsInCompactView(0)
      )
      .build()
  }

  @SuppressLint("WakelockTimeout")
  private fun acquireLocks() {
    val power = getSystemService(Context.POWER_SERVICE) as? PowerManager
    wakeLock = power?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "freq:listening")?.apply {
      setReferenceCounted(false)
      acquire(WAKE_LOCK_TIMEOUT_MS)
    }

    val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    @Suppress("DEPRECATION")
    val mode = WifiManager.WIFI_MODE_FULL_HIGH_PERF
    wifiLock = wifi?.createWifiLock(mode, "freq:listening")?.apply {
      setReferenceCounted(false)
      acquire()
    }
  }

  private fun releaseLocks() {
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null
    wifiLock?.takeIf { it.isHeld }?.release()
    wifiLock = null
  }
}
