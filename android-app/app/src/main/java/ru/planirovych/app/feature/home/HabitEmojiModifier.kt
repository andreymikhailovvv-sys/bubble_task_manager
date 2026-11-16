package ru.planirovych.app.feature.home

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Paint

/** Gray only the glyph of a completed habit, preserving its coloured ring. */
internal fun Modifier.habitEmojiCompletionFilter(completed: Boolean): Modifier =
    if (!completed) this else drawWithContent {
        val grayscale = Paint().apply {
            colorFilter = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) })
        }
        drawContext.canvas.saveLayer(Rect(Offset.Zero, size), grayscale)
        drawContent()
        drawContext.canvas.restore()
    }
