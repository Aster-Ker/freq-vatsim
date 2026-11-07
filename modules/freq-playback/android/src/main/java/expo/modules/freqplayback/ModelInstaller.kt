package expo.modules.freqplayback

import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.util.zip.ZipInputStream

/**
 * Downloads a zipped speech model and unpacks it into place. Plain Kotlin and
 * java.*, with no Android types, so it can be tested off device.
 *
 * The finished folder only appears, with a completion marker, once the whole
 * archive has unpacked, so an interrupted download never looks installed.
 */
object ModelInstaller {
  const val COMPLETE_MARKER = ".complete"

  fun install(
    url: String,
    modelName: String,
    cacheDir: File,
    root: File,
    onProgress: (received: Long, total: Long) -> Unit
  ): File {
    val target = File(root, modelName)
    val zip = File(cacheDir, "$modelName.zip")
    val staging = File(root, "staging")
    try {
      root.mkdirs()
      download(url, zip, onProgress)
      staging.deleteRecursively()
      unzip(zip, staging)
      val unpacked = File(staging, modelName)
      if (!File(unpacked, "am/final.mdl").exists()) throw IllegalStateException("The archive did not contain $modelName.")
      target.deleteRecursively()
      if (!unpacked.renameTo(target)) throw IllegalStateException("Could not move the model into place.")
      File(target, COMPLETE_MARKER).writeText("ok")
      return target
    } finally {
      zip.delete()
      staging.deleteRecursively()
    }
  }

  private fun download(from: String, target: File, onProgress: (Long, Long) -> Unit) {
    var uri = URI(from)
    var connection: HttpURLConnection
    var redirects = 0
    while (true) {
      connection = (uri.toURL().openConnection() as HttpURLConnection).apply {
        connectTimeout = 15_000
        readTimeout = 30_000
        instanceFollowRedirects = false
      }
      val code = connection.responseCode
      if (code in 300..399 && redirects < 5) {
        uri = uri.resolve(connection.getHeaderField("Location"))
        connection.disconnect()
        redirects++
        continue
      }
      if (code != 200) throw IllegalStateException("HTTP $code")
      break
    }

    val total = connection.contentLengthLong
    var received = 0L
    var lastReport = 0L
    try {
      connection.inputStream.use { input ->
        FileOutputStream(target).use { output ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            output.write(buffer, 0, n)
            received += n
            val now = System.currentTimeMillis()
            if (now - lastReport > 250) {
              lastReport = now
              onProgress(received, total)
            }
          }
        }
      }
    } finally {
      connection.disconnect()
    }
    if (total > 0 && received != total) throw IllegalStateException("Download ended early ($received of $total bytes).")
    onProgress(received, received)
  }

  private fun unzip(zip: File, into: File) {
    into.mkdirs()
    val base = into.canonicalPath + File.separator
    ZipInputStream(zip.inputStream().buffered()).use { stream ->
      while (true) {
        val entry = stream.nextEntry ?: break
        val out = File(into, entry.name)
        // Refuse entries that would land outside the target (zip slip).
        if (!out.canonicalPath.startsWith(base)) throw SecurityException("Unsafe entry ${entry.name}")
        if (entry.isDirectory) {
          out.mkdirs()
        } else {
          out.parentFile?.mkdirs()
          FileOutputStream(out).use { stream.copyTo(it) }
        }
      }
    }
  }
}
