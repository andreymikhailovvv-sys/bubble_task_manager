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
import androidx.compose.ui.Alignment
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
    mode: String = "idle",
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    // Only decode two frames when the phase changes. A streaming token cannot
    // trigger costly SVG parsing or bitmap allocation.
    val frames = remember(context, dark, mode) {
        fun render(asset: String, alternate: Boolean): Bitmap? = runCatching {
            context.assets.open(asset).bufferedReader().use { stream ->
                val source = stream.readText()
                val artwork = source.replace("</svg>", planikActionSvg(mode, alternate) + "</svg>")
                val picture = SVG.getFromString(artwork).renderToPicture(420, 375)
                val full = Bitmap.createBitmap(420, 375, Bitmap.Config.ARGB_8888).apply {
                    AndroidCanvas(this).drawPicture(picture)
                }
                // Keep both arms and the full antenna. The old crop
                // (90,29,255,275) amputated the left edge of the mascot.
                // The new crop preserves the ~84:90 aspect ratio of the
                // composer launcher while keeping the hit area compact.
                Bitmap.createBitmap(full, 80, 12, 280, 300).also { full.recycle() }
            }
        }.getOrNull()
        val suffix = if (dark) "" else "_light"
        Pair(render("planik_idle${suffix}.svg", false), render("planik_blink${suffix}.svg", true))
    }
    val pressInteraction = remember { MutableInteractionSource() }

    var blinking by remember { mutableStateOf(false) }
    LaunchedEffect(mode) {
        blinking = false
        while (true) {
            if (mode == "idle") {
                delay(4900)
                blinking = true
                delay(115)
                blinking = false
            } else {
                delay(300)
                blinking = !blinking
            }
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

    Box(modifier.size(width = 84.dp, height = 90.dp)) {
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
          // A central clickable torso lets users scroll through empty corners.
        Box(Modifier.align(Alignment.Center).offset(y = 1.dp)
            .size(width = 58.dp, height = 56.dp)
            .clip(RoundedCornerShape(22.dp))
            .clickable(enabled = enabled, interactionSource = pressInteraction,
                indication = null, onClick = onClick)
            .semantics { contentDescription = "Поговорить с Плаником" })
    }
}

/** Small actions use the same SVG coordinate system as the website mascot.
 * These overlays do not exist at rest; frame alternation animates hands and lens. */
private fun planikActionSvg(mode: String, alternate: Boolean): String = when (mode) {
    "typing" -> {
        val leftY = if (alternate) 241 else 249
        val rightY = if (alternate) 251 else 241
        """
        <g class="planik-activity-typing">
          <path d="M156 226H275L307 280H124Z" fill="#242e54" stroke="#aaa3ef" stroke-width="2.5"/>
          <path d="M166 235H267L290 266H145Z" fill="#344270"/>
          <path d="M166 243h104M155 253h125M177 263h95" stroke="#8087c7" stroke-width="5" stroke-linecap="round" stroke-dasharray="14 7"/>
          <path d="M135 201Q148 221 177 ${leftY}" stroke="#8080c6" stroke-width="16" fill="none" stroke-linecap="round"/>
          <path d="M300 201Q280 223 252 ${rightY}" stroke="#8080c6" stroke-width="16" fill="none" stroke-linecap="round"/>
          <circle cx="177" cy="${leftY}" r="8" fill="#b6adff"/>
          <circle cx="252" cy="${rightY}" r="8" fill="#b6adff"/>
        </g>
        """
    }
    "thinking" -> {
        val handY = if (alternate) 106 else 116
        """
        <g class="planik-activity-thinking">
          <path d="M300 196Q337 183 329 147Q327 124 307 ${handY}" fill="none" stroke="#797ac0" stroke-width="17" stroke-linecap="round"/>
          <circle cx="307" cy="${handY}" r="10" fill="#aba6f0"/>
          <path d="M299 101l-5 -8M308 100v-9M316 102l5 -8" stroke="#c9c3ff" stroke-width="3" stroke-linecap="round"/>
        </g>
        """
    }
    "searching" -> {
        val lensX = if (alternate) 198 else 188
        """
        <g class="planik-activity-searching">
          <path d="M131 191Q109 195 102 212" fill="none" stroke="#7777b8" stroke-width="17" stroke-linecap="round"/>
          <rect x="80" y="151" width="103" height="100" rx="10" fill="#484d84" stroke="#b5adfc" stroke-width="2.5"/>
          <rect x="91" y="172" width="80" height="66" rx="4" fill="#e5f2ff"/>
          <path d="M100 183h61M100 194h48M100 205h58M100 216h42M100 226h52" stroke="#a2a6d9" stroke-width="3"/>
          <path d="M300 199Q272 211 245 240" fill="none" stroke="#7777b8" stroke-width="17" stroke-linecap="round"/>
          <path d="M241 238L211 216" fill="none" stroke="#a19bf0" stroke-width="10" stroke-linecap="round"/>
          <circle cx="${lensX}" cy="198" r="24" fill="#9edbec" fill-opacity=".24" stroke="#d0c8ff" stroke-width="7"/>
        </g>
        """
    }
    else -> ""
}
