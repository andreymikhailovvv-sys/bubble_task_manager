package ru.planirovych.app.feature.home

import android.graphics.Bitmap
import android.graphics.Canvas as AndroidCanvas
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.caverock.androidsvg.SVG
import kotlinx.coroutines.delay

/**
 * Website Planik's EXACT gradients, head, faceplate and eyes rendered through
 * AndroidSVG. No WebView: transparent hardware-accelerated WebView surfaces can
 * disappear behind Compose even when the touch target is still present.
 *
 * Only the small composer launcher is rendered natively. Fullscreen Realtime
 * still uses the shared live frontend so its cards/Markdown remain identical.
 */
@Composable
internal fun PlanikNativeLauncher(
    enabled: Boolean = true,
    dark: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    val frames = remember(context, dark) {
        fun render(asset: String): Bitmap? = runCatching {
            context.assets.open(asset).use { stream ->
                val picture = SVG.getFromInputStream(stream).renderToPicture(420, 375)
                val full = Bitmap.createBitmap(420, 375, Bitmap.Config.ARGB_8888).apply {
                    AndroidCanvas(this).drawPicture(picture)
                }
                // The original 345×275 web viewBox includes large transparent
                // side margins for gestures and props. Crop only those margins
                // so the touch bounds match the visible robot, not empty space.
                Bitmap.createBitmap(full, 90, 29, 255, 275).also { full.recycle() }
            }
        }.getOrNull()
        val suffix = if (dark) "" else "_light"
        Pair(render("planik_idle${suffix}.svg"), render("planik_blink${suffix}.svg"))
    }
    val pressInteraction = remember { MutableInteractionSource() }

    var blinking by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(4900)
            blinking = true
            delay(115)
            blinking = false
        }
    }
    val floatTransition = rememberInfiniteTransition(label = "planik-float")
    val floatOffset by floatTransition.animateFloat(
        initialValue = 1f,
        targetValue = -3f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1800),
            repeatMode = RepeatMode.Reverse
        ),
        label = "planik-vertical-float"
    )

    Box(
        modifier.size(width = 84.dp, height = 90.dp)
            .clip(RoundedCornerShape(24.dp))
            // No rectangular ripple overlay around the much smaller mascot.
            .clickable(
                enabled = enabled,
                interactionSource = pressInteraction,
                indication = null,
                onClick = onClick
            )
            .semantics { contentDescription = "Поговорить с Плаником" }
    ) {
        val picture = if (blinking) frames.second ?: frames.first else frames.first
        if (picture != null) {
            Image(
                bitmap = picture.asImageBitmap(),
                contentDescription = null,
                modifier = Modifier.fillMaxSize().offset(y = floatOffset.dp)
            )
        } else {
            // Fail visibly on any vendor-specific SVG decoder failure rather
            // than leaving an invisible but tappable 105 x 94 dp rectangle.
            Canvas(Modifier.fillMaxSize().offset(y = floatOffset.dp)) {
                drawRoundRect(
                    color = if (dark) Color(0xFF7776BD) else Color(0xFFAAA4E4),
                    topLeft = Offset(size.width * .22f, size.height * .26f),
                    size = androidx.compose.ui.geometry.Size(size.width * .56f, size.height * .60f),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(size.height * .22f)
                )
                drawRoundRect(
                    color = if (dark) Color(0xFF253251) else Color(0xFF4A4A7B),
                    topLeft = Offset(size.width * .30f, size.height * .40f),
                    size = androidx.compose.ui.geometry.Size(size.width * .40f, size.height * .28f),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(size.height * .12f)
                )
                drawCircle(Color(0xFFF2F4FF), radius = size.width * .025f,
                    center = Offset(size.width * .43f, size.height * .54f))
                drawCircle(Color(0xFFF2F4FF), radius = size.width * .025f,
                    center = Offset(size.width * .58f, size.height * .54f))
                drawLine(Color(0xFF9C9DDB),
                    Offset(size.width * .5f, size.height * .25f),
                    Offset(size.width * .5f, size.height * .15f), strokeWidth = 5f)
                drawCircle(Color(0xFF8BE4EB), radius = 5f,
                    center = Offset(size.width * .5f, size.height * .13f))
            }
        }
    }
}
