package com.opencut

import android.content.Context
import android.graphics.Typeface
import com.facebook.react.views.text.ReactFontManager
import java.io.File

/**
 * Single source of truth for fonts. Bundled TTFs live in assets/fonts (copied by bootstrap); user fonts are copied to
 * filesDir/fonts. Every family is registered with React Native's font manager under its id so the live preview and the
 * exporter (Typeface from the same registry) render the exact same glyphs.
 */
object Fonts {
    class Family(val id: String, val label: String, val custom: Boolean, val faces: Array<Typeface>) // 0 reg, 1 bold, 2 italic, 3 bold-italic

    private val BUNDLED = listOf(
        Triple("poppins", "Poppins", "Poppins"),
        Triple("serif", "Serif", "LiberationSerif"),
        Triple("mono", "Mono", "LiberationMono"),
        Triple("condensed", "Condensed", "DejaVuSansCondensed"),
    )
    private val SUFFIX = arrayOf("Regular", "Bold", "Italic", "BoldItalic")
    private val ALIAS = mapOf("sans" to "poppins")
    private val families = LinkedHashMap<String, Family>()
    @Volatile private var ready = false

    @Synchronized
    fun init(ctx: Context) {
        if (ready) return
        for ((id, label, file) in BUNDLED) {
            try {
                val faces = Array(4) { Typeface.createFromAsset(ctx.assets, "fonts/$file-${SUFFIX[it]}.ttf") }
                register(Family(id, label, false, faces))
            } catch (_: Throwable) { /* font missing from assets: system fallback is used */ }
        }
        File(ctx.filesDir, "fonts").listFiles()?.sortedBy { it.name }?.forEach { loadCustom(it) }
        ready = true
    }

    private fun register(f: Family) {
        families[f.id] = f
        val m = ReactFontManager.getInstance()
        val styles = intArrayOf(Typeface.NORMAL, Typeface.BOLD, Typeface.ITALIC, Typeface.BOLD_ITALIC)
        for (i in 0 until 4) m.setTypeface(f.id, styles[i], f.faces[i])
    }

    /** Returns the family or throws when the file is not a valid font. */
    fun loadCustom(file: File): Family {
        val base = Typeface.createFromFile(file)
        if (base == null || base == Typeface.DEFAULT) throw IllegalArgumentException("Not a valid font file")
        val id = "custom_" + file.nameWithoutExtension.replace(Regex("[^A-Za-z0-9_]"), "_")
        val faces = arrayOf(base, Typeface.create(base, Typeface.BOLD), Typeface.create(base, Typeface.ITALIC), Typeface.create(base, Typeface.BOLD_ITALIC))
        val fam = Family(id, file.nameWithoutExtension.replace('_', ' '), true, faces)
        register(fam)
        return fam
    }

    fun list(): List<Family> = families.values.toList()

    fun typeface(id: String, bold: Boolean, italic: Boolean): Typeface {
        val f = families[ALIAS[id] ?: id] ?: families["poppins"]
        val i = (if (bold) 1 else 0) + (if (italic) 2 else 0)
        return f?.faces?.get(i) ?: Typeface.create(Typeface.DEFAULT, (if (bold) Typeface.BOLD else 0) or (if (italic) Typeface.ITALIC else 0))
    }
}
