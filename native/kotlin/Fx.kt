@file:OptIn(UnstableApi::class)

package com.opencut

import androidx.media3.common.Effect
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Brightness
import androidx.media3.effect.Contrast
import androidx.media3.effect.MatrixTransformation
import androidx.media3.effect.Presentation
import androidx.media3.effect.RgbMatrix
import androidx.media3.effect.ScaleAndRotateTransformation
import org.json.JSONObject

/** Per-clip look: shared by the live preview and the exporter so both render identically. */
class Fx(
    val brightness: Float,
    val contrast: Float,
    val matrix: FloatArray?, // 4x4 column-major colour matrix (rgb-linear: saturation, warmth, filters...)
    val rotation: Float,     // clockwise degrees (0/90/180/270)
    val flipX: Boolean,
    val flipY: Boolean,
    val zoom: Float,
) {
    companion object {
        fun from(o: JSONObject?): Fx {
            if (o == null) return Fx(0f, 0f, null, 0f, false, false, 1f)
            val arr = o.optJSONArray("matrix")
            val m = if (arr != null && arr.length() == 16) FloatArray(16) { arr.getDouble(it).toFloat() } else null
            return Fx(
                o.optDouble("brightness", 0.0).toFloat(),
                o.optDouble("contrast", 0.0).toFloat(),
                m,
                o.optDouble("rotation", 0.0).toFloat(),
                o.optBoolean("flipX", false),
                o.optBoolean("flipY", false),
                o.optDouble("zoom", 1.0).toFloat().coerceAtLeast(1f),
            )
        }
    }
}

class ColorMatrix(private val m: FloatArray) : RgbMatrix {
    override fun getMatrix(presentationTimeUs: Long, useHdr: Boolean): FloatArray = m
}

fun buildEffects(fx: Fx): List<Effect> {
    val out = ArrayList<Effect>()
    if (fx.contrast != 0f) out.add(Contrast(fx.contrast.coerceIn(-1f, 1f)))
    if (fx.brightness != 0f) out.add(Brightness(fx.brightness.coerceIn(-1f, 1f)))
    fx.matrix?.let { out.add(ColorMatrix(it)) }
    if (fx.rotation != 0f || fx.flipX || fx.flipY || fx.zoom != 1f) {
        out.add(
            ScaleAndRotateTransformation.Builder()
                .setScale(fx.zoom * (if (fx.flipX) -1f else 1f), fx.zoom * (if (fx.flipY) -1f else 1f))
                .setRotationDegrees(-fx.rotation)
                .build()
        )
    }
    return out
}


/**
 * Live look for the preview: the effect chain is built once and reads these values every frame, so slider drags and
 * filter changes show instantly without rebuilding the GL pipeline (what pro editors do). Rotation is the only thing that
 * changes the frame size, so it is a static effect swapped on clip transitions.
 */
class LiveFx {
    @Volatile var color: FloatArray = FloatArray(16).also { it[0] = 1f; it[5] = 1f; it[10] = 1f; it[15] = 1f }
    @Volatile var zoom = 1f
    @Volatile var flipX = false
    @Volatile var flipY = false

    fun set(fx: Fx) {
        color = fx.matrix ?: FloatArray(16).also { it[0] = 1f; it[5] = 1f; it[10] = 1f; it[15] = 1f }
        zoom = fx.zoom; flipX = fx.flipX; flipY = fx.flipY
    }
}

class LiveColor(private val live: LiveFx) : RgbMatrix {
    override fun getMatrix(presentationTimeUs: Long, useHdr: Boolean): FloatArray = live.color
}

class LiveGeometry(private val live: LiveFx) : MatrixTransformation {
    override fun getMatrix(presentationTimeUs: Long): android.graphics.Matrix {
        val m = android.graphics.Matrix()
        m.postScale(live.zoom * (if (live.flipX) -1f else 1f), live.zoom * (if (live.flipY) -1f else 1f))
        return m
    }
}

fun buildLiveEffects(live: LiveFx, rotation: Float, ratio: Float): List<Effect> {
    val out = ArrayList<Effect>()
    if (rotation != 0f) out.add(ScaleAndRotateTransformation.Builder().setRotationDegrees(-rotation).build())
    out.add(LiveColor(live))
    out.add(LiveGeometry(live))
    // identical to the exporter: fit the frame inside the canvas, letterboxed, so preview == export
    if (ratio > 0f) out.add(Presentation.createForAspectRatio(ratio, Presentation.LAYOUT_SCALE_TO_FIT))
    return out
}
