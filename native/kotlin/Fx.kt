@file:OptIn(UnstableApi::class)

package com.opencut

import androidx.media3.common.Effect
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Brightness
import androidx.media3.effect.Contrast
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
