package com.opencut

import android.app.Activity
import android.content.ContentResolver
import android.content.ContentUris
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.provider.OpenableColumns
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteOrder
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.max

class EngineModule(private val rc: ReactApplicationContext) : ReactContextBaseJavaModule(rc), ActivityEventListener {
    override fun getName() = "OpenCutEngine"

    private val io = Executors.newFixedThreadPool(3)
    private var pickPromise: Promise? = null
    private var pickKind = "audio"
    private var export: ExportEngine? = null
    private val thumbDir = File(rc.cacheDir, "oc_thumbs").also { it.mkdirs() }

    init { rc.addActivityEventListener(this) }

    @ReactMethod fun addListener(name: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    // ---- Gallery ----------------------------------------------------------------------------
    @ReactMethod
    fun getGallery(kind: String, offset: Int, limit: Int, promise: Promise) {
        io.execute {
            try {
                val types = when (kind) { "video" -> "3"; "image" -> "1"; else -> "1,3" }
                val proj = arrayOf(
                    MediaStore.Files.FileColumns._ID, MediaStore.Files.FileColumns.MEDIA_TYPE,
                    MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.WIDTH,
                    MediaStore.MediaColumns.HEIGHT, MediaStore.MediaColumns.DURATION,
                )
                val args = Bundle().apply {
                    putString(ContentResolver.QUERY_ARG_SQL_SELECTION, "${MediaStore.Files.FileColumns.MEDIA_TYPE} IN ($types)")
                    putStringArray(ContentResolver.QUERY_ARG_SORT_COLUMNS, arrayOf(MediaStore.Files.FileColumns.DATE_ADDED))
                    putInt(ContentResolver.QUERY_ARG_SORT_DIRECTION, ContentResolver.QUERY_SORT_DIRECTION_DESCENDING)
                    putInt(ContentResolver.QUERY_ARG_LIMIT, limit)
                    putInt(ContentResolver.QUERY_ARG_OFFSET, offset)
                }
                val out = Arguments.createArray()
                rc.contentResolver.query(MediaStore.Files.getContentUri("external"), proj, args, null)?.use { c ->
                    while (c.moveToNext()) {
                        val id = c.getLong(0)
                        val isVideo = c.getInt(1) == 3
                        val base = if (isVideo) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                        val m = Arguments.createMap()
                        m.putString("id", id.toString())
                        m.putString("uri", ContentUris.withAppendedId(base, id).toString())
                        m.putString("kind", if (isVideo) "video" else "image")
                        m.putString("name", c.getString(2) ?: "")
                        m.putInt("width", c.getInt(3)); m.putInt("height", c.getInt(4))
                        m.putDouble("durationMs", if (isVideo) c.getLong(5).toDouble() else 0.0)
                        out.pushMap(m)
                    }
                }
                promise.resolve(out)
            } catch (t: Throwable) { promise.reject("E_GALLERY", t) }
        }
    }

    @ReactMethod
    fun probe(uriStr: String, promise: Promise) {
        io.execute {
            try { promise.resolve(probeSync(Uri.parse(uriStr))) } catch (t: Throwable) { promise.reject("E_PROBE", t) }
        }
    }

    private fun displayName(uri: Uri): String =
        try {
            rc.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else null } ?: "media"
        } catch (_: Throwable) { "media" }

    private fun probeSync(uri: Uri): WritableMap {
        val m = Arguments.createMap()
        m.putString("uri", uri.toString()); m.putString("name", displayName(uri))
        val mime = rc.contentResolver.getType(uri) ?: ""
        if (mime.startsWith("image/")) {
            val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            rc.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, o) }
            m.putString("kind", "image"); m.putInt("width", o.outWidth); m.putInt("height", o.outHeight)
            m.putDouble("durationMs", 0.0); m.putBoolean("hasAudio", false)
            return m
        }
        val r = MediaMetadataRetriever()
        try {
            r.setDataSource(rc, uri)
            val dur = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull() ?: 0.0
            var w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
            var h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
            val rot = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
            if (rot == 90 || rot == 270) { val t = w; w = h; h = t }
            val hasVideo = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO) == "yes"
            m.putString("kind", if (hasVideo || mime.startsWith("video/")) "video" else "audio")
            m.putDouble("durationMs", dur); m.putInt("width", w); m.putInt("height", h)
            m.putBoolean("hasAudio", r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO) == "yes")
        } finally { r.release() }
        return m
    }

    // ---- Thumbnails / frames ----------------------------------------------------------------
    @ReactMethod
    fun getFrames(uriStr: String, kind: String, times: ReadableArray, w: Int, h: Int, promise: Promise) {
        io.execute {
            val uri = Uri.parse(uriStr)
            val out = Arguments.createArray()
            var r: MediaMetadataRetriever? = null
            try {
                for (i in 0 until times.size()) {
                    val t = times.getDouble(i).toLong()
                    val f = File(thumbDir, Integer.toHexString("$uriStr|${if (kind == "image") 0 else t}|$w|$h".hashCode()) + ".jpg")
                    if (!f.exists()) {
                        var bmp: Bitmap? = null
                        if (kind == "image") {
                            val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                            rc.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, o) }
                            var s = 1
                            while (o.outWidth / (s * 2) >= w && o.outHeight / (s * 2) >= h) s *= 2
                            val o2 = BitmapFactory.Options().apply { inSampleSize = s }
                            bmp = rc.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, o2) }
                        } else {
                            if (r == null) r = MediaMetadataRetriever().also { it.setDataSource(rc, uri) }
                            bmp = r.getScaledFrameAtTime(t * 1000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, w, h)
                                ?: r.getFrameAtTime(t * 1000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                        }
                        if (bmp != null) { FileOutputStream(f).use { bmp.compress(Bitmap.CompressFormat.JPEG, 82, it) }; bmp.recycle() }
                    }
                    out.pushString(if (f.exists()) "file://" + f.absolutePath else "")
                }
                promise.resolve(out)
            } catch (t: Throwable) { promise.reject("E_FRAMES", t) }
            finally { try { r?.release() } catch (_: Throwable) {} }
        }
    }

    // ---- Waveform ---------------------------------------------------------------------------
    @ReactMethod
    fun getWaveform(uriStr: String, buckets: Int, promise: Promise) {
        io.execute {
            try {
                val peaks = DoubleArray(buckets)
                val ex = MediaExtractor()
                ex.setDataSource(rc, Uri.parse(uriStr), null)
                var idx = -1; var fmt: MediaFormat? = null
                for (i in 0 until ex.trackCount) {
                    val f = ex.getTrackFormat(i)
                    if (f.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) { idx = i; fmt = f; break }
                }
                if (idx >= 0 && fmt != null && fmt.containsKey(MediaFormat.KEY_DURATION)) {
                    ex.selectTrack(idx)
                    val durUs = fmt.getLong(MediaFormat.KEY_DURATION).coerceAtLeast(1L)
                    val codec = MediaCodec.createDecoderByType(fmt.getString(MediaFormat.KEY_MIME)!!)
                    codec.configure(fmt, null, null, 0); codec.start()
                    val info = MediaCodec.BufferInfo()
                    var inEos = false; var outEos = false
                    while (!outEos) {
                        if (!inEos) {
                            val i = codec.dequeueInputBuffer(5000)
                            if (i >= 0) {
                                val n = ex.readSampleData(codec.getInputBuffer(i)!!, 0)
                                if (n < 0) { codec.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inEos = true }
                                else { codec.queueInputBuffer(i, 0, n, ex.sampleTime, 0); ex.advance() }
                            }
                        }
                        val o = codec.dequeueOutputBuffer(info, 5000)
                        if (o >= 0) {
                            val sb = codec.getOutputBuffer(o)!!.order(ByteOrder.nativeOrder()).asShortBuffer()
                            val b = ((info.presentationTimeUs.toDouble() / durUs) * buckets).toInt().coerceIn(0, buckets - 1)
                            var mx = 0; var k = 0
                            while (k < sb.limit()) { mx = max(mx, abs(sb.get(k).toInt())); k += 16 }
                            peaks[b] = max(peaks[b], mx / 32768.0)
                            codec.releaseOutputBuffer(o, false)
                            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outEos = true
                        }
                    }
                    codec.stop(); codec.release()
                }
                ex.release()
                val top = (peaks.maxOrNull() ?: 1.0).coerceAtLeast(1e-6)
                val arr = Arguments.createArray()
                for (p in peaks) arr.pushDouble(p / top)
                promise.resolve(arr)
            } catch (t: Throwable) { promise.reject("E_WAVE", t) }
        }
    }

    // ---- File picker (music etc.) -----------------------------------------------------------
    @ReactMethod
    fun pickFile(mime: String, promise: Promise) {
        val act = currentActivity
        if (act == null) { promise.reject("E_NO_ACTIVITY", "no activity"); return }
        pickPromise = promise
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE); type = mime
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        act.startActivityForResult(i, 7701)
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != 7701) return
        val p = pickPromise ?: return
        pickPromise = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) { p.resolve(null); return }
        io.execute {
            try {
                try { rc.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Throwable) {}
                p.resolve(probeSync(uri))
            } catch (t: Throwable) { p.reject("E_PICK", t) }
        }
    }

    override fun onNewIntent(intent: Intent?) {}

    // ---- Export -----------------------------------------------------------------------------
    @ReactMethod
    fun startExport(spec: String, promise: Promise) {
        val e = ExportEngine(rc)
        export = e
        e.start(
            spec,
            { p -> rc.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("OpenCutExportProgress", p.toDouble()) },
            { uri, err -> if (uri != null) promise.resolve(uri.toString()) else promise.reject("E_EXPORT", err ?: "export failed") },
        )
    }

    @ReactMethod fun cancelExport() { export?.cancel() }

    @ReactMethod
    fun openVideo(uri: String) {
        val i = Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(uri), "video/*")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        rc.startActivity(i)
    }

    @ReactMethod
    fun shareVideo(uri: String) {
        val send = Intent(Intent.ACTION_SEND).setType("video/mp4").putExtra(Intent.EXTRA_STREAM, Uri.parse(uri))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        rc.startActivity(Intent.createChooser(send, "Share").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
