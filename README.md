# OpenCut

A CapCut-style mobile video editor for Android, built with React Native + native Kotlin (Media3 / MediaCodec / OpenGL).

## Architecture (why it's fast)
| Concern | Implementation |
|---|---|
| Preview | Native `ExoPlayer` (hardware decode) playing the main track as a clipped playlist; per-clip GL effects (brightness, contrast, colour matrix, rotate/flip/zoom) via `setVideoEffects`. Structural edits rebuild the playlist, parameter edits (sliders) do not. |
| Music / audio lanes | Lightweight secondary players slaved to the master clock |
| Export | Media3 `Transformer` (MediaCodec + GL), H.264/HEVC, up to 4K, 24/30/60 fps, saved to `Movies/OpenCut` |
| Text / stickers | Drawn by RN in preview, burned in at export by a single full-frame `FrameOverlay` so position/scale/rotation match |
| Timeline | Reanimated scroll handler on the UI thread; playhead follows playback imperatively (no React re-render per frame); thumbnails + waveforms generated natively and cached |
| State | Zustand, immutable snapshots → 100-step undo/redo, debounced autosave |

## Features
- Projects: create, autosave, reopen, delete (long-press)
- Gallery picker with multi-select ordering numbers (MediaStore, paged, lazy thumbnails)
- Magnetic main track: split, trim handles, long-press drag reorder, duplicate, delete, pinch-zoom timeline, scrub with fixed centre playhead
- Per-clip: speed 0.1–8× (pitch preserved), volume 0–200 %, rotate, mirror/flip, zoom/crop, 12 filters + intensity, 6 adjustments (brightness, contrast, saturation, exposure, warmth, tint), "apply to all"
- Text: presets, 4 font families, colour, outline, background, bold/italic/align/shadow; pinch/rotate/drag in preview
- Stickers (emoji) and image overlays, opacity
- Audio: import music from device, waveform, volume, split, trim, move
- Canvas ratios: 9:16, 16:9, 1:1, 4:5, 3:4, 4:3, 21:9
- Export panel: 720p/1080p/2K/4K, fps, codec, size estimate, progress, cancel, play/share

## Not implemented yet (roadmap)
Transitions, keyframes, PIP *video* overlays, reverse, freeze frame, auto-captions, voice-over recording, chroma key, masks, stabilisation, blur/vignette/sharpen effects, audio fades. Media3 has building blocks for several of these (extend `Fx.kt` / `ExportEngine.kt`).

## Build locally
```bash
bash scripts/bootstrap.sh            # generates android/ from the RN 0.76.9 template + applies native/kotlin
npx react-native run-android         # debug on a device
cd android && ./gradlew assembleRelease
```
Requirements: Node 18+, JDK 17, Android SDK 35. Only `native/kotlin/`, `scripts/` and the JS sources live in git; `android/` is generated (same approach as OpenKeys). Delete any old hand-made `android/` folder - bootstrap also does this if it has no `gradlew`.

## GitHub Actions
`.github/workflows/android.yml` runs the bootstrap, builds a release APK (arm64 + armv7), uploads it as the `OpenCut-apk` artifact and attaches it to a GitHub Release when you push a tag like `v0.1.0`.

Without secrets the release APK is signed with the debug key (fine for testing). For a properly signed build add repository secrets: `ANDROID_KEYSTORE_BASE64` (`base64 -w0 my.keystore`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

## Notes
- Min Android 10 (API 29). React Native 0.76.9, Media3 pinned to 1.5.1; all Transformer API use is in `ExportEngine.kt` if you bump versions.
- Native code was written without a compiler in the loop - expect to fix a few small compile errors on first build (most likely in `ExportEngine.kt`).
