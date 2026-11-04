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
