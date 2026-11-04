import pathlib, re, sys

main = pathlib.Path("android/app/src/main")

# ---- AndroidManifest.xml -------------------------------------------------
mf = main / "AndroidManifest.xml"
s = mf.read_text(encoding="utf-8")
perms = [
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_VISUAL_USER_SELECTED" />',
    '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
]
add = "".join("    " + p + "\n" for p in perms if p.split('"')[1] not in s)
if add:
    s = s.replace("<application", add + "    <application", 1)
if "android:largeHeap" not in s:
    s = s.replace("<application", '<application android:largeHeap="true"', 1)
if "android:screenOrientation" not in s:
    s = s.replace("<activity", '<activity android:screenOrientation="portrait"', 1)
mf.write_text(s, encoding="utf-8")

# ---- MainApplication.kt ---------------------------------------------------
files = list(main.glob("java/**/MainApplication.kt"))
if not files:
    sys.exit("MainApplication.kt not found")
p = files[0]
t = p.read_text(encoding="utf-8")
if "OpenCutPackage" not in t:
    marker = "// add(MyReactNativePackage())"
    if marker not in t:
        sys.exit("Could not patch MainApplication.kt (template changed?) - add OpenCutPackage() manually")
    p.write_text(t.replace(marker, "add(com.opencut.OpenCutPackage())"), encoding="utf-8")

# ---- root build.gradle: minSdk 29 (MediaStore paging + Media3 Transformer) --
rb = pathlib.Path("android/build.gradle")
r = rb.read_text(encoding="utf-8")
rb.write_text(re.sub(r"minSdkVersion\s*=\s*\d+", "minSdkVersion = 29", r), encoding="utf-8")

# ---- app/build.gradle -----------------------------------------------------
gr = pathlib.Path("android/app/build.gradle")
g = gr.read_text(encoding="utf-8")

if "androidx.media3" not in g:
    deps = '''dependencies {
    def media3 = "1.5.1"
    implementation("androidx.media3:media3-common:$media3")
    implementation("androidx.media3:media3-exoplayer:$media3")
    implementation("androidx.media3:media3-ui:$media3")
    implementation("androidx.media3:media3-effect:$media3")
    implementation("androidx.media3:media3-transformer:$media3")'''
    g2 = re.sub(r"dependencies\s*\{", deps, g, count=1)
    if g2 == g:
        sys.exit("Could not add Media3 to android/app/build.gradle - add it manually")
    g = g2

if "OPENCUT_KEYSTORE_FILE" not in g:
    g = re.sub(r"versionCode\s+\d+", 'versionCode Integer.parseInt(System.getenv("OPENCUT_VERSION_CODE") ?: "1")', g, count=1)
    sc = '''signingConfigs {
        release {
            def ks = System.getenv("OPENCUT_KEYSTORE_FILE")
            if (ks) {
                storeFile file(ks)
                storePassword System.getenv("OPENCUT_KEYSTORE_PASSWORD")
                keyAlias System.getenv("OPENCUT_KEY_ALIAS")
                keyPassword System.getenv("OPENCUT_KEY_PASSWORD")
            }
        }'''
    g2 = re.sub(r"signingConfigs\s*\{", sc, g, count=1)
    if g2 == g:
        sys.exit("Could not patch signingConfigs in android/app/build.gradle")
    g = g2
    old = "signingConfig signingConfigs.debug"
    i = g.rfind(old)   # the release build type comes after the debug one
    g = g[:i] + 'signingConfig System.getenv("OPENCUT_KEYSTORE_FILE") ? signingConfigs.release : signingConfigs.debug' + g[i + len(old):]

if "vectoricons" not in g:
    g += '''

project.ext.vectoricons = [iconFontNames: ['MaterialCommunityIcons.ttf']]
apply from: file("../../node_modules/react-native-vector-icons/fonts.gradle")
'''
gr.write_text(g, encoding="utf-8")
print("patched manifest, MainApplication, build.gradle")


# ---- bundled fonts (assets/fonts -> app assets) ---------------------------
import shutil
src = pathlib.Path("assets/fonts")
dst = main / "assets" / "fonts"
dst.mkdir(parents=True, exist_ok=True)
for f in src.glob("*.ttf"):
    shutil.copy2(f, dst / f.name)

# ---- Material adaptive launcher icon (+ themed/monochrome icon, Android 13+) -
res = main / "res"
(res / "drawable").mkdir(parents=True, exist_ok=True)
(res / "values").mkdir(parents=True, exist_ok=True)
(res / "mipmap-anydpi-v26").mkdir(parents=True, exist_ok=True)

FG = """<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="%(a)s" android:pathData="M42,30h24a12,12 0 0 1 12,12v24a12,12 0 0 1 -12,12H42a12,12 0 0 1 -12,-12V42a12,12 0 0 1 12,-12z"/>
    <path android:fillColor="%(b)s" android:pathData="M47,41.5v25l21,-12.5z"/>
    <path android:fillColor="%(c)s" android:pathData="M25,78.5L78.5,25l4.5,4.5L29.5,83z"/>
</vector>
"""
(res / "drawable" / "ic_launcher_foreground.xml").write_text(FG % {"a": "#25F4EE", "b": "#0B0B0F", "c": "#FE2C55"}, encoding="utf-8")
(res / "drawable" / "ic_launcher_monochrome.xml").write_text(FG % {"a": "#FFFFFF", "b": "#000000", "c": "#FFFFFF"}, encoding="utf-8")
(res / "values" / "ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">#0B0B0F</color></resources>\n', encoding="utf-8")
ADAPTIVE = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
"""
for n in ("ic_launcher.xml", "ic_launcher_round.xml"):
    (res / "mipmap-anydpi-v26" / n).write_text(ADAPTIVE, encoding="utf-8")
for d in res.glob("mipmap-*dpi"):          # drop the template's default React Native raster icons
    for f in list(d.glob("ic_launcher*")):
        f.unlink()
print("patched fonts + launcher icon")
