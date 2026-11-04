@file:OptIn(UnstableApi::class)

package com.opencut

import android.content.ContentValues
import android.content.Context
import android.graphics.*
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.ChannelMixingAudioProcessor
import androidx.media3.common.audio.ChannelMixingMatrix
import androidx.media3.common.audio.SonicAudioProcessor
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BitmapOverlay
import androidx.media3.effect.FrameDropEffect
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.Presentation
import androidx.media3.effect.SpeedChangeEffect
import androidx.media3.effect.TextureOverlay
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import com.google.common.collect.ImmutableList
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/**
 * Hardware-accelerated export (MediaCodec + OpenGL) through Media3 Transformer.
 * All Media3 API usage is isolated here so version bumps only touch this file.
 */
class ExportEngine(private val ctx: Context) {
    private val ui = Handler(Looper.getMainLooper())
    private var transformer: Transformer? = null
    private var done: ((Uri?, String?) -> Unit)? = null
    private var finished = false
    private var outFile: File? = null

    private val poll = object : Runnable {
        override fun run() {
            val t = transformer ?: return
            val h = ProgressHolder()
            if (t.getProgress(h) != Transformer.PROGRESS_STATE_NOT_STARTED) onProgress?.invoke(h.progress / 100f)
            if (!finished) ui.postDelayed(this, 200)
        }
    }
    private var onProgress: ((Float) -> Unit)? = null

    fun start(spec: String, progress: (Float) -> Unit, onDone: (Uri?, String?) -> Unit) {
        onProgress = progress; done = onDone
        ui.post {
            try { run(JSONObject(spec)) } catch (t: Throwable) { finish(null, t.message ?: t.toString()) }
        }
    }

    fun cancel() {
        ui.post { transformer?.cancel(); finish(null, "cancelled") }
    }

    private fun finish(uri: Uri?, err: String?) {
        if (finished) return
        finished = true
        ui.removeCallbacks(poll)
        done?.invoke(uri, err)
    }

    private fun volumeProcessor(v: Float): AudioProcessor =
        ChannelMixingAudioProcessor().also {
            it.putChannelMixingMatrix(ChannelMixingMatrix.create(1, 2).scaleBy(v))
            it.putChannelMixingMatrix(ChannelMixingMatrix.create(2, 2).scaleBy(v))
        }

    private fun run(spec: JSONObject) {
        val w = spec.getInt("width"); val h = spec.getInt("height")
        val fps = spec.optInt("fps", 30)
        val totalMs = spec.getLong("totalMs")

        // ---- main track
        val mainItems = ArrayList<EditedMediaItem>()
        val main = spec.getJSONArray("main")
        for (i in 0 until main.length()) {
            val c = main.getJSONObject(i)
            val isImage = c.getString("kind") == "image"
            val speed = c.optDouble("speed", 1.0).toFloat()
            val vol = c.optDouble("volume", 1.0).toFloat()
            val mi = MediaItem.Builder().setUri(Uri.parse(c.getString("uri"))).also {
                if (!isImage) it.setClippingConfiguration(
                    MediaItem.ClippingConfiguration.Builder().setStartPositionMs(c.getLong("inMs")).setEndPositionMs(c.getLong("outMs")).build()
                )
            }.build()
            val vfx = ArrayList<Effect>()
            if (!isImage && speed != 1f) vfx.add(SpeedChangeEffect(speed))
            vfx.addAll(buildEffects(Fx.from(c.optJSONObject("fx"))))
            vfx.add(Presentation.createForWidthAndHeight(w, h, Presentation.LAYOUT_SCALE_TO_FIT))
            val afx = ArrayList<AudioProcessor>()
            if (!isImage && speed != 1f) afx.add(SonicAudioProcessor().also { it.setSpeed(speed); it.setPitch(1f) })
            if (vol != 1f && vol > 0f) afx.add(volumeProcessor(vol))
            val b = EditedMediaItem.Builder(mi).setEffects(Effects(afx, vfx))
            if (isImage) b.setDurationUs(c.getLong("durationMs") * 1000L).setFrameRate(fps)
            if (vol <= 0f || isImage) b.setRemoveAudio(true)
            mainItems.add(b.build())
        }
        if (mainItems.isEmpty()) throw IllegalStateException("Nothing to export")
        val mainSeq = EditedMediaItemSequence.Builder().also { sb ->
            mainItems.forEach { sb.addItem(it) }
        }.build()
        val sequences = ArrayList<EditedMediaItemSequence>()
        sequences.add(mainSeq)

        // ---- audio lanes (one sequence per row; gaps keep clips at their timeline position)
        val audio = spec.getJSONArray("audio")
        val lanes = HashMap<Int, MutableList<JSONObject>>()
        for (i in 0 until audio.length()) { val a = audio.getJSONObject(i); lanes.getOrPut(a.optInt("row", 0)) { ArrayList() }.add(a) }
        for ((_, list) in lanes.toSortedMap()) {
            list.sortBy { it.getLong("startMs") }
            val sb = EditedMediaItemSequence.Builder()
            var cursor = 0L; var any = false
            for (a in list) {
                val start = a.getLong("startMs")
                if (start >= totalMs) continue
                val dur = min(a.getLong("durationMs"), totalMs - start)
                if (dur < 50) continue
                if (start > cursor) sb.addGap((start - cursor) * 1000L)
                val inMs = a.getLong("inMs")
                val mi = MediaItem.Builder().setUri(Uri.parse(a.getString("uri"))).setClippingConfiguration(
                    MediaItem.ClippingConfiguration.Builder().setStartPositionMs(inMs).setEndPositionMs(inMs + dur).build()
                ).build()
                val vol = a.optDouble("volume", 1.0).toFloat()
                val afx = ArrayList<AudioProcessor>()
                if (vol != 1f) afx.add(volumeProcessor(vol))
                sb.addItem(EditedMediaItem.Builder(mi).setRemoveVideo(true).setEffects(Effects(afx, emptyList())).build())
                cursor = start + dur; any = true
            }
            if (any) sequences.add(sb.build())
        }

        // ---- composition-level effects: overlays (text/stickers) + frame rate
        val compVfx = ArrayList<Effect>()
        compVfx.add(FrameDropEffect.createDefaultFrameDropEffect(fps.toFloat()))
        val ovs = spec.getJSONArray("overlays")
        if (ovs.length() > 0) {
            compVfx.add(OverlayEffect(ImmutableList.of<TextureOverlay>(FrameOverlay(ctx, w, h, ovs))))
        }
        val composition = Composition.Builder(sequences).setEffects(Effects(emptyList(), compVfx)).experimentalSetForceAudioTrack(true).build()

        val enc = DefaultEncoderFactory.Builder(ctx)
            .setRequestedVideoEncoderSettings(VideoEncoderSettings.Builder().setBitrate(spec.optInt("bitrate", 12_000_000)).build())
            .setEnableFallback(true)
            .build()
        val mime = if (spec.optString("codec", "h264") == "hevc") MimeTypes.VIDEO_H265 else MimeTypes.VIDEO_H264
        val out = File(ctx.cacheDir, "opencut_${System.currentTimeMillis()}.mp4").also { outFile = it }
        val t = Transformer.Builder(ctx)
            .setVideoMimeType(mime).setAudioMimeType(MimeTypes.AUDIO_AAC).setEncoderFactory(enc)
            .addListener(object : Transformer.Listener {
                override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                    try { finish(saveToGallery(out), null) } catch (e: Throwable) { finish(null, e.message) }
                }
                override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
                    finish(null, exportException.message ?: "export error")
                }
            }).build()
        transformer = t
        t.start(composition, out.absolutePath)
        ui.post(poll)
    }

    private fun saveToGallery(f: File): Uri {
        val name = "OpenCut_${System.currentTimeMillis()}.mp4"
        val v = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, name)
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/OpenCut")
            put(MediaStore.Video.Media.IS_PENDING, 1)
        }
        val cr = ctx.contentResolver
        val uri = cr.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, v) ?: throw IllegalStateException("MediaStore insert failed")
        cr.openOutputStream(uri)!!.use { os -> f.inputStream().use { it.copyTo(os) } }
        v.clear(); v.put(MediaStore.Video.Media.IS_PENDING, 0)
        cr.update(uri, v, null, null)
        f.delete()
        return uri
    }
}

/**
 * One full-frame transparent overlay that draws every text/sticker active at the current time.
 * Rendering the whole frame ourselves keeps position/scale/rotation identical to the preview and
 * avoids depending on Media3's overlay scaling rules.
 */
class FrameOverlay(private val ctx: Context, private val W: Int, private val H: Int, items: JSONArray) : BitmapOverlay() {
    private class Ov(val o: JSONObject) {
        val start = o.getLong("startMs"); val end = o.getLong("endMs")
    }

    private val ovs = (0 until items.length()).map { Ov(items.getJSONObject(it)) }
    private val empty: Bitmap = Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888)
    private var lastKey = "none"
    private var last: Bitmap = empty
    private val imgCache = HashMap<String, Bitmap?>()

    override fun getBitmap(presentationTimeUs: Long): Bitmap {
        val t = presentationTimeUs / 1000
        val active = ovs.indices.filter { t >= ovs[it].start && t < ovs[it].end }
        val key = active.joinToString(",")
        if (key == lastKey) return last
        lastKey = key
        if (active.isEmpty()) { last = empty; return last }
        val bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        for (i in active) draw(c, ovs[i].o)
        last = bmp
        return bmp
    }

    private fun typeface(o: JSONObject): Typeface {
        val style = when {
            o.optBoolean("bold") && o.optBoolean("italic") -> Typeface.BOLD_ITALIC
            o.optBoolean("bold") -> Typeface.BOLD
            o.optBoolean("italic") -> Typeface.ITALIC
            else -> Typeface.NORMAL
        }
        val family = when (o.optString("font", "sans")) { "serif" -> "serif"; "mono" -> "monospace"; "condensed" -> "sans-serif-condensed"; else -> "sans-serif" }
        return Typeface.create(family, style)
    }

    private fun draw(c: Canvas, o: JSONObject) {
        val alpha = (o.optDouble("opacity", 1.0) * 255).toInt().coerceIn(0, 255)
        val cp = c.save()
        if (alpha < 255) c.saveLayerAlpha(0f, 0f, W.toFloat(), H.toFloat(), alpha)
        c.translate((o.getDouble("x") * W).toFloat(), (o.getDouble("y") * H).toFloat())
        c.rotate(o.optDouble("rotation", 0.0).toFloat())
        val s = o.optDouble("scale", 1.0).toFloat(); c.scale(s, s)
        when (o.getString("type")) {
            "text" -> drawText(c, o)
            else -> if (o.optString("emoji").isNotEmpty()) drawEmoji(c, o) else drawImage(c, o)
        }
        c.restoreToCount(cp)
    }

    private fun drawText(c: Canvas, o: JSONObject) {
        val text = o.getString("text"); if (text.isEmpty()) return
        val size = (o.getDouble("size") * W).toFloat()
        val tf = typeface(o)
        val fill = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = size; color = Color.parseColor(o.optString("color", "#FFFFFF")); typeface = tf
            if (o.optBoolean("shadow")) setShadowLayer(size * 0.08f, 0f, size * 0.04f, 0xAA000000.toInt())
        }
        val align = when (o.optString("align", "center")) { "left" -> Layout.Alignment.ALIGN_NORMAL; "right" -> Layout.Alignment.ALIGN_OPPOSITE; else -> Layout.Alignment.ALIGN_CENTER }
        val maxW = (W * 0.9f).toInt()
        val probe = StaticLayout.Builder.obtain(text, 0, text.length, fill, maxW).build()
        var tw = 0f; for (i in 0 until probe.lineCount) tw = max(tw, probe.getLineWidth(i))
        val lw = ceil(tw).toInt() + 2
        val layout = StaticLayout.Builder.obtain(text, 0, text.length, fill, lw).setAlignment(align).build()
        val bg = o.optString("bg", "")
        val padX = if (bg.isNotEmpty()) size * 0.35f else 0f; val padY = if (bg.isNotEmpty()) size * 0.15f else 0f
        val bw = lw + 2 * padX; val bh = layout.height + 2 * padY
        c.translate(-bw / 2, -bh / 2)
        if (bg.isNotEmpty()) c.drawRoundRect(RectF(0f, 0f, bw, bh), size * 0.25f, size * 0.25f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor(bg) })
        c.translate(padX, padY)
        val sw = (o.optDouble("strokeWidth", 0.0) * size).toFloat()
        val sc = o.optString("strokeColor", "")
        if (sw > 0f && sc.isNotEmpty()) {
            val sp = TextPaint(fill).apply { style = Paint.Style.STROKE; strokeWidth = sw; color = Color.parseColor(sc); strokeJoin = Paint.Join.ROUND; clearShadowLayer() }
            StaticLayout.Builder.obtain(text, 0, text.length, sp, lw).setAlignment(align).build().draw(c)
        }
        layout.draw(c)
    }

    private fun drawEmoji(c: Canvas, o: JSONObject) {
        val size = (o.getDouble("size") * W).toFloat()
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = size; textAlign = Paint.Align.CENTER }
        val fm = p.fontMetrics
        c.drawText(o.getString("emoji"), 0f, -(fm.ascent + fm.descent) / 2f, p)
    }

    private fun drawImage(c: Canvas, o: JSONObject) {
        val uri = o.optString("uri"); if (uri.isEmpty()) return
        val targetW = (o.getDouble("size") * W).toInt().coerceAtLeast(16)
        val bmp = imgCache.getOrPut(uri) {
            try {
                val u = Uri.parse(uri)
                val b = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                ctx.contentResolver.openInputStream(u)?.use { BitmapFactory.decodeStream(it, null, b) }
                var s = 1; while (b.outWidth / (s * 2) >= targetW) s *= 2
                ctx.contentResolver.openInputStream(u)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = s }) }
            } catch (_: Throwable) { null }
        } ?: return
        val th = targetW * bmp.height.toFloat() / bmp.width
        c.drawBitmap(bmp, null, RectF(-targetW / 2f, -th / 2f, targetW / 2f, th / 2f), Paint(Paint.FILTER_BITMAP_FLAG))
    }
}
