package expo.modules.freqplayback

import android.Manifest
import android.content.Context
import android.os.Build
import android.os.Bundle
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

/**
 * Bridges the listening session to Android.
 *
 * The audio itself plays inside the app's WebView (VATSIM Listen). What the
 * WebView cannot do on its own is keep the process alive once the screen goes
 * off: Android throttles network and CPU for an app with nothing in the
 * foreground. This module starts a media playback foreground service for the
 * length of a session, which keeps the process, CPU and Wi-Fi awake and puts
 * a media notification (with a Stop action) on the lock screen.
 *
 * It also hosts the on-device subtitle engine (CaptionEngine): the WebView's
 * audio tap hands PCM to `feedCaptions`, and text comes back as onCaption.
 */
class FreqPlaybackModule : Module() {
  companion object {
    private var instance: WeakReference<FreqPlaybackModule>? = null

    /** Called by the service when the person taps Stop in the notification. */
    fun notifyStopRequested() {
      instance?.get()?.sendEvent("onStopRequest", Bundle())
    }
  }

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var engine: CaptionEngine? = null

  private fun captions(): CaptionEngine =
    engine ?: CaptionEngine(context.applicationContext) { event, body -> sendEvent(event, body) }
      .also { engine = it }

  override fun definition() = ModuleDefinition {
    Name("FreqPlayback")

    Events("onStopRequest", "onCaption", "onCaptionState", "onModelProgress")

    OnCreate {
      instance = WeakReference(this@FreqPlaybackModule)
    }

    OnDestroy {
      // The JS runtime is going away (reload or app closed), so nothing is
      // left to play. Never leave an orphaned foreground service behind.
      ListenService.stop(context)
      engine?.destroy()
      engine = null
      instance = null
    }

    Function("start") { title: String, text: String ->
      ListenService.start(context, title, text)
    }

    Function("update") { title: String, text: String ->
      ListenService.update(title, text)
    }

    Function("stop") {
      ListenService.stop(context)
    }

    Function("isRunning") {
      ListenService.isRunning()
    }

    // Subtitles

    Function("isCaptionModelInstalled") {
      captions().isModelInstalled()
    }

    Function("captionModelSize") {
      captions().modelSizeBytes().toDouble()
    }

    AsyncFunction("downloadCaptionModel") { promise: Promise ->
      captions().downloadModel { error ->
        if (error == null) promise.resolve(true) else promise.reject("ERR_MODEL_DOWNLOAD", error, null)
      }
    }

    Function("deleteCaptionModel") {
      captions().deleteModel()
    }

    Function("startCaptions") {
      captions().start()
    }

    Function("feedCaptions") { pcmBase64: String ->
      engine?.feed(pcmBase64)
    }

    Function("flushCaptions") {
      engine?.flush()
    }

    Function("stopCaptions") {
      engine?.stop()
    }

    AsyncFunction("requestNotificationPermission") { promise: Promise ->
      // Below Android 13 notifications need no runtime permission.
      val needsAsking = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
      val permissions = appContext.permissions
      if (!needsAsking || permissions == null) {
        promise.resolve(!needsAsking)
      } else {
        permissions.askForPermissions(
          PermissionsResponseListener { result ->
            val granted = result[Manifest.permission.POST_NOTIFICATIONS]?.status == PermissionsStatus.GRANTED
            promise.resolve(granted)
          },
          Manifest.permission.POST_NOTIFICATIONS
        )
      }
    }
  }
}
