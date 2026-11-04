@file:OptIn(UnstableApi::class)

package com.opencut

import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.FrameLayout
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.SeekParameters
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.facebook.react.bridge.Arguments
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import org.json.JSONArray
import kotlin.math.abs

/**
 * Native timeline preview. One ExoPlayer plays the main track as a clipped playlist (hardware
 * decoding + GL effect chain per clip). Music/voice tracks run on lightweight secondary players
 * that are slaved to the master clock.
 */
class PreviewView(private val rc: ThemedReactContext) : FrameLayout(rc) {
    private class Seg(
        val uri: String, val isImage: Boolean, val startMs: Long, val durMs: Long,
        val inMs: Long, val outMs: Long, val speed: Float, val volume: Float, val fx: Fx,
    )

    private class Aud(val id: String, val uri: String, val startMs: Long, val inMs: Long, val durMs: Long, val volume: Float)

    private val handler = Handler(Looper.getMainLooper())
    private val player: ExoPlayer = ExoPlayer.Builder(rc).build()
    private val pv = PlayerView(rc)
    private val audioPlayers = HashMap<String, ExoPlayer>()

    private var segs: List<Seg> = emptyList()
    private var auds: List<Aud> = emptyList()
    private var structKey = ""
    private var totalMs = 0L
    private var curMs = 0L
    private var wantPlaying = false
    private var lastRot = Float.NaN
    private val live = LiveFx()
    private var scrubbing = false
    private var tick = 0
    private val refresh = Runnable { forceFrame() }

    private val ticker = object : Runnable {
        override fun run() {
            val t = timelineMs()
            curMs = t
            if ((tick++ and 1) == 0) emitProgress(t)   // JS gets ~30 Hz; the timeline interpolates between events
            syncAudio(true, t)
            if (wantPlaying) handler.postDelayed(this, 16)
        }
    }

    private val measureAndLayout = Runnable {
        measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
        layout(left, top, right, bottom)
    }

    init {
        setBackgroundColor(Color.BLACK)
        pv.useController = false
        pv.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
        pv.setShutterBackgroundColor(Color.BLACK)
        pv.player = player
        player.setVideoEffects(buildLiveEffects(live, 0f)); lastRot = 0f
        addView(pv, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        player.setSeekParameters(SeekParameters.EXACT)
        player.addListener(object : Player.Listener {
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) = applySeg(player.currentMediaItemIndex)
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) {
                    wantPlaying = false
                    handler.removeCallbacks(ticker)
                    syncAudio(false, totalMs)
                    emit("onEnded", Arguments.createMap())
                }
            }
            override fun onPlayerError(error: PlaybackException) {
                val m = Arguments.createMap(); m.putString("message", error.message ?: "playback error")
                emit("onError", m)
            }
        })
    }

    override fun requestLayout() {
        super.requestLayout()
        post(measureAndLayout)
    }

    // ---- props ------------------------------------------------------------------------------
    fun setTimeline(json: String) {
        val arr = JSONArray(json)
        val list = ArrayList<Seg>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            list.add(
                Seg(
                    o.getString("uri"), o.getString("kind") == "image", o.getLong("startMs"), o.getLong("durationMs"),
                    o.getLong("inMs"), o.getLong("outMs"), o.optDouble("speed", 1.0).toFloat(),
                    o.optDouble("volume", 1.0).toFloat(), Fx.from(o.optJSONObject("fx")),
                )
            )
        }
        segs = list
        totalMs = list.lastOrNull()?.let { it.startMs + it.durMs } ?: 0L
        val key = list.joinToString("|") { "${it.uri}@${it.inMs}-${it.outMs}:${if (it.isImage) it.durMs else 0}" }
        if (key != structKey) {
            structKey = key
            rebuild()
        } else {
            applySeg(player.currentMediaItemIndex)
        }
    }

    fun setAudio(json: String) {
        val arr = JSONArray(json)
        val list = ArrayList<Aud>()
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            list.add(Aud(o.getString("id"), o.getString("uri"), o.getLong("startMs"), o.getLong("inMs"), o.getLong("durationMs"), o.optDouble("volume", 1.0).toFloat()))
        }
        auds = list
        val ids = list.map { it.id }.toSet()
        val it = audioPlayers.entries.iterator()
        while (it.hasNext()) {
            val e = it.next()
            if (e.key !in ids) { e.value.release(); it.remove() }
        }
        syncAudio(wantPlaying, curMs)
    }

    fun setPlaying(play: Boolean) {
        wantPlaying = play
        handler.removeCallbacks(ticker)
        if (play) {
            if (player.playbackState == Player.STATE_ENDED && segs.isNotEmpty()) seek(0, true)
            player.play()
            handler.post(ticker)
        } else {
            player.pause()
            syncAudio(false, curMs)
        }
    }

    fun seek(ms: Long, exact: Boolean) {
        curMs = ms.coerceIn(0L, totalMs)
        if (segs.isEmpty()) return
        var idx = segs.indexOfLast { it.startMs <= curMs }
        if (idx < 0) idx = 0
        val s = segs[idx]
        val local = if (s.isImage) curMs - s.startMs else ((curMs - s.startMs) * s.speed).toLong()
        scrubbing = !exact
        player.setSeekParameters(if (exact) SeekParameters.EXACT else SeekParameters.CLOSEST_SYNC)
        player.seekTo(idx, local.coerceAtLeast(0L))
        applySeg(idx)
        emitProgress(curMs)
        if (!wantPlaying) syncAudio(false, curMs)
    }

    // ---- internals --------------------------------------------------------------------------
    private fun rebuild() {
        val items = segs.map { s ->
            val b = MediaItem.Builder().setUri(s.uri)
            if (s.isImage) b.setImageDurationMs(s.durMs)
            else b.setClippingConfiguration(
                MediaItem.ClippingConfiguration.Builder().setStartPositionMs(s.inMs).setEndPositionMs(s.outMs).build()
            )
            b.build()
        }
        player.setMediaItems(items, false)
        player.prepare()
        if (segs.isNotEmpty()) seek(curMs, true)
        player.playWhenReady = wantPlaying
    }

    private fun applySeg(i: Int) {
        val s = segs.getOrNull(i) ?: return
        player.playbackParameters = PlaybackParameters(if (s.isImage) 1f else s.speed)
        player.volume = s.volume.coerceIn(0f, 1f)
        live.set(s.fx)                       // colour / zoom / flip: read per frame, no pipeline rebuild
        if (s.fx.rotation != lastRot) {      // rotation changes the frame size -> swap the static effect
            lastRot = s.fx.rotation
            player.setVideoEffects(buildLiveEffects(live, s.fx.rotation))
        }
        if (!wantPlaying) scheduleRefresh()
    }

    /** A paused player does not redraw on its own: re-present the current frame so edits show immediately. */
    private fun scheduleRefresh() {
        handler.removeCallbacks(refresh)
        handler.postDelayed(refresh, 30)
    }

    private fun forceFrame() {
        if (wantPlaying || segs.isEmpty() || scrubbing) return
        player.setSeekParameters(SeekParameters.EXACT)
        player.seekTo(player.currentMediaItemIndex, player.currentPosition)
    }

    private fun timelineMs(): Long {
        val i = player.currentMediaItemIndex
        val s = segs.getOrNull(i) ?: return curMs
        val p = player.currentPosition.coerceAtLeast(0L)
        val t = s.startMs + (if (s.isImage) p else (p / s.speed).toLong())
        return t.coerceAtMost(totalMs)
    }

    private fun syncAudio(playing: Boolean, t: Long) {
        for (a in auds) {
            val p = audioPlayers.getOrPut(a.id) {
                ExoPlayer.Builder(rc).build().also { it.setMediaItem(MediaItem.fromUri(a.uri)); it.prepare() }
            }
            p.volume = a.volume.coerceIn(0f, 1f)
            val inside = t >= a.startMs && t < a.startMs + a.durMs
            if (playing && inside) {
                val want = a.inMs + (t - a.startMs)
                if (!p.playWhenReady) { p.seekTo(want); p.play() }
                else if (abs(p.currentPosition - want) > 300) p.seekTo(want)
            } else if (p.playWhenReady) {
                p.pause()
            }
        }
    }

    private fun emitProgress(t: Long) {
        val m = Arguments.createMap(); m.putDouble("ms", t.toDouble()); emit("onProgress", m)
    }

    private fun emit(name: String, m: com.facebook.react.bridge.WritableMap) {
        rc.getJSModule(RCTEventEmitter::class.java).receiveEvent(id, name, m)
    }

    fun release() {
        handler.removeCallbacksAndMessages(null)
        player.release()
        audioPlayers.values.forEach { it.release() }
        audioPlayers.clear()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        player.pause()
        audioPlayers.values.forEach { it.pause() }
    }
}
