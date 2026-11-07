package expo.modules.freqplayback

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import android.util.Log
import org.json.JSONObject
import org.vosk.LibVosk
import org.vosk.LogLevel
import org.vosk.Model
import org.vosk.Recognizer
import java.io.File

/**
 * Speech to text for the frequency, entirely on the phone.
 *
 * Audio arrives as 16 kHz mono 16-bit PCM from the tap injected into the
 * Listen page, and runs through Vosk (Kaldi) with the small English model.
 * Nothing is recorded, and no audio or text leaves the device.
 *
 * Every recognizer call happens on one worker thread, in arrival order.
 */
class CaptionEngine(
  private val context: Context,
  private val emit: (event: String, body: Map<String, Any?>) -> Unit
) {
  companion object {
    private const val TAG = "FreqCaptions"
    const val MODEL_NAME = "vosk-model-small-en-us-0.15"
    const val MODEL_URL = "https://alphacephei.com/vosk/models/$MODEL_NAME.zip"
    const val SAMPLE_RATE = 16000f
  }

  private val root = File(context.filesDir, "vosk")
  private val modelDir = File(root, MODEL_NAME)

  private val thread = HandlerThread("freq-captions").apply { start() }
  private val worker = Handler(thread.looper)

  private var model: Model? = null
  private var recognizer: Recognizer? = null
  private var lastPartial = ""

  @Volatile
  private var downloading = false

  fun isModelInstalled(): Boolean = File(modelDir, ModelInstaller.COMPLETE_MARKER).exists()

  fun modelSizeBytes(): Long =
    if (!modelDir.exists()) 0 else modelDir.walkTopDown().filter { it.isFile }.sumOf { it.length() }

  /**
   * Fetches and unpacks the model (about 40 MB) into app storage. Reports
   * progress through onModelProgress; calls back with null on success or a
   * message to show the person.
   */
  fun downloadModel(done: (error: String?) -> Unit) {
    if (isModelInstalled()) return done(null)
    if (downloading) return done("The subtitle model is already downloading.")
    downloading = true

    Thread({
      try {
        ModelInstaller.install(MODEL_URL, MODEL_NAME, context.cacheDir, root) { received, total ->
          emit("onModelProgress", mapOf("received" to received.toDouble(), "total" to total.toDouble()))
        }
        done(null)
      } catch (e: Exception) {
        Log.w(TAG, "Model download failed", e)
        done("The subtitle model did not download. Check your connection and try again.")
      } finally {
        downloading = false
      }
    }, "freq-model-download").start()
  }

  fun deleteModel() {
    worker.post {
      closeRecognizer()
      modelDir.deleteRecursively()
    }
  }

  /** Loads the model and opens a recognizer. Emits onCaptionState ready, or error. */
  fun start() {
    worker.post {
      try {
        if (!isModelInstalled()) {
          emit("onCaptionState", mapOf("state" to "error", "message" to "Download the subtitle model first."))
          return@post
        }
        LibVosk.setLogLevel(LogLevel.WARNINGS)
        val m = model ?: Model(modelDir.absolutePath).also { model = it }
        if (recognizer == null) recognizer = Recognizer(m, SAMPLE_RATE)
        lastPartial = ""
        emit("onCaptionState", mapOf("state" to "ready"))
      } catch (e: Exception) {
        Log.w(TAG, "Could not start the recognizer", e)
        emit("onCaptionState", mapOf("state" to "error", "message" to "Subtitles could not start on this phone."))
      }
    }
  }

  /** One chunk of base64 PCM from the page. */
  fun feed(base64: String) {
    worker.post {
      val rec = recognizer ?: return@post
      val bytes = try {
        Base64.decode(base64, Base64.DEFAULT)
      } catch (e: IllegalArgumentException) {
        return@post
      }
      if (rec.acceptWaveForm(bytes, bytes.size)) {
        emitFinal(JSONObject(rec.result).optString("text"))
      } else {
        val partial = JSONObject(rec.partialResult).optString("partial")
        if (partial != lastPartial) {
          lastPartial = partial
          emit("onCaption", mapOf("text" to partial, "final" to false))
        }
      }
    }
  }

  /** Ends the phrase in progress, for a change of station. */
  fun flush() {
    worker.post {
      val rec = recognizer ?: return@post
      emitFinal(JSONObject(rec.finalResult).optString("text"))
      rec.reset()
    }
  }

  /** Releases the recognizer and the model (about 70 MB of memory). */
  fun stop() {
    worker.post { closeRecognizer() }
  }

  fun destroy() {
    worker.post {
      closeRecognizer()
      thread.quitSafely()
    }
  }

  private fun emitFinal(text: String) {
    lastPartial = ""
    if (text.isNotBlank()) emit("onCaption", mapOf("text" to text, "final" to true))
  }

  private fun closeRecognizer() {
    recognizer?.close()
    recognizer = null
    model?.close()
    model = null
    lastPartial = ""
  }
}
