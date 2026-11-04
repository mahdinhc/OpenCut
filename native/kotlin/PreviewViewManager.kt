package com.opencut

import com.facebook.react.bridge.ReadableMap
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class PreviewViewManager : SimpleViewManager<PreviewView>() {
    override fun getName() = "OpenCutPreview"

    override fun createViewInstance(c: ThemedReactContext) = PreviewView(c)

    @ReactProp(name = "timeline") fun setTimeline(v: PreviewView, s: String?) = v.setTimeline(s ?: "[]")
    @ReactProp(name = "ratio") fun setRatio(v: PreviewView, r: Float) = v.setRatio(r)
    @ReactProp(name = "audio") fun setAudio(v: PreviewView, s: String?) = v.setAudio(s ?: "[]")
    @ReactProp(name = "playing") fun setPlaying(v: PreviewView, b: Boolean) = v.setPlaying(b)
    @ReactProp(name = "seek") fun setSeek(v: PreviewView, m: ReadableMap?) {
        if (m != null) v.seek(m.getDouble("ms").toLong(), m.getBoolean("exact"))
    }

    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
        MapBuilder.builder<String, Any>()
            .put("onProgress", MapBuilder.of("registrationName", "onProgress"))
            .put("onEnded", MapBuilder.of("registrationName", "onEnded"))
            .put("onError", MapBuilder.of("registrationName", "onError"))
            .build()

    override fun onDropViewInstance(v: PreviewView) {
        super.onDropViewInstance(v)
        v.release()
    }
}
