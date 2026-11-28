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
import androidx.compose.runtime.produceState
import androidx.compose.ui.graphics.graphicsLayer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.ensureActive
import kotlin.coroutines.coroutineContext
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
 * AndroidSVG fallback. Non-classic skins use the shared web SVG/CSS artwork
 * in a software-rendered, noninteractive view with a native fallback.
 *
 * Only the small composer launcher is rendered natively. Fullscreen Realtime
 * still uses the shared live frontend so its cards/Markdown remain identical.
 */
@Composable
internal fun PlanikNativeLauncher(
    enabled: Boolean = true,
    dark: Boolean,
    mode: String = "idle",
    skinId: String = "classic",
    modifier: Modifier = Modifier,
    variant: String = "planner",
    sharedArtwork: Boolean = false,
    onClick: () -> Unit
) {
    val pressInteraction = remember { MutableInteractionSource() }
    Box(modifier.size(width = 136.dp, height = 140.dp)) {
        if(skinId=="classic"&&!sharedArtwork&&variant=="planner") NativeMascotFallback(dark,mode,skinId,Modifier.fillMaxSize())
        else SharedMascotArtwork(skinId,dark,mode,Modifier.fillMaxSize(),variant)
          // A central clickable torso lets users scroll through empty corners.
        Box(Modifier.align(Alignment.Center).offset(y = 1.dp)
            .size(width = 92.dp, height = 90.dp)
            .clip(RoundedCornerShape(22.dp))
            .clickable(enabled = enabled, interactionSource = pressInteraction,
                indication = null, onClick = onClick)
            .semantics { contentDescription = "Поговорить с Плаником" })
    }
}

/** Offline fallback for both the chat launcher and wardrobe. */
@Composable
internal fun NativeMascotFallback(dark:Boolean,mode:String,skinId:String,modifier:Modifier=Modifier,variant:String="planner") {
    val context = LocalContext.current
    val frameCount=mascotMotionFrameCount(skinId,mode)
    // Decode a small reusable sequence off the main thread. Streaming tokens
    // and animation ticks never trigger SVG parsing or bitmap allocation.
    val frames by produceState<List<Bitmap?>>(emptyList(),context,dark,mode,skinId,variant) {
        value=emptyList()
        value=withContext(Dispatchers.Default) {
            val suffix = if (dark) "" else "_light"
            val idle=context.assets.open("planik_idle${suffix}.svg").bufferedReader().use{it.readText()}
            val blink=context.assets.open("planik_blink${suffix}.svg").bufferedReader().use{it.readText()}
            List(frameCount){frame->
                coroutineContext.ensureActive()
                runCatching {
                    val alternate=frame%2==1
                    val source=if((frameCount==2&&alternate)||(frameCount>2&&frame==11))blink else idle
                    val action=nativeMascotMotionSvg(skinId,mode,frame) ?: planikActionSvg(mode, alternate)
                    val artwork=nativeMascotSkinSvg(if(variant=="economic")economicMascotPalette(source) else source, skinId, dark, mode, frame)
                        .replace("</svg>",action+"</svg>")
                    // Keep all animated accessories inside a fixed padded frame.
                    val expanded=artwork.replace(Regex("viewBox=\\\"[^\\\"]+\\\""),
                        "viewBox=\"-10 -30 450 365\"")
                    val picture=SVG.getFromString(expanded).renderToPicture(420,375)
                    Bitmap.createBitmap(420,375,Bitmap.Config.ARGB_8888).apply {
                        AndroidCanvas(this).drawPicture(picture)
                    }
                }.getOrNull()
            }
        }
    }
    var frameIndex by remember(skinId,mode){mutableStateOf(0)}
    LaunchedEffect(skinId,mode,frames) {
        if(frames.isEmpty())return@LaunchedEffect
        while(true) {
            if(frameCount==2 && mode=="idle") {
                delay(4900);frameIndex=1;delay(115);frameIndex=0
            }else {
                delay(mascotMotionFrameMillis(skinId,mode))
                frameIndex=(frameIndex+1)%frames.size
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

    // Weightlessness is a deliberate wardrobe hover preview, never chat idle.
    val orbit=if(skinId=="space"&&mode=="hover"){
        val orbitTransition=rememberInfiniteTransition(label="planik-orbit-preview")
        val rotation by orbitTransition.animateFloat(
            initialValue=0f,targetValue=360f,
            animationSpec=infiniteRepeatable(tween(7000,easing=androidx.compose.animation.core.LinearEasing),RepeatMode.Restart),
            label="planik-orbit-rotation"
        )
        rotation
    }else 0f
    Box(modifier) {
        val picture=frames.getOrNull(frameIndex) ?: frames.firstOrNull{it!=null}
        if (picture != null) {
            Image(
                bitmap = picture.asImageBitmap(),
                contentDescription = null,
                modifier = Modifier.fillMaxSize().offset(y = floatOffset.dp).graphicsLayer {
                    rotationZ=orbit
                    if(skinId=="space" && mode=="hover") { scaleX=.82f; scaleY=.82f }
                }
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
    "painting" -> {
        val tipY=if(alternate)202 else 218
        """
        <g class="planik-activity-painting">
          <path d="M132 197Q107 205 105 232" fill="none" stroke="#7777b8" stroke-width="17" stroke-linecap="round"/>
          <path d="M91 159L177 154L183 246L89 252Z" fill="#fffdf5" stroke="#c9c5e5" stroke-width="2.3"/>
          <circle cx="152" cy="183" r="9" fill="#f2c879"/>
          <path d="M98 226L119 197L134 214L149 194L173 229" fill="none" stroke="#8a9fd8" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M98 235Q134 217 173 235" fill="none" stroke="#8bc8a5" stroke-width="7"/>
          <path d="M300 196Q259 237 213 219" fill="none" stroke="#7777b8" stroke-width="17" stroke-linecap="round"/>
          <path d="M213 219L158 $tipY" stroke="#bf8f68" stroke-width="6" stroke-linecap="round"/>
          <circle cx="158" cy="$tipY" r="4" fill="#8a9fd8"/>
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

private fun economicMascotPalette(source:String):String {
    val pairs=mapOf(
        "#5e5ca3" to "#ffe1a4","#373965" to "#da9a4b","#242e51" to "#7a431c",
        "#b8b3ec" to "#ffe1a4","#928fd6" to "#da9a4b","#686cb6" to "#7a431c",
        "#9ce4f5" to "#fff0c6","#afa8ff" to "#ffd27d","#7a75ca" to "#bb742c",
        "#d5f4fa" to "#fff0c6","#c7c0fa" to "#ffd27d","#a8a0e7" to "#bb742c",
        "#212e50" to "#382b27","#141d38" to "#181923","#4a4a7b" to "#382b27",
        "#323a66" to "#181923","#88e0ed" to "#ffcd72","#8c8ed3" to "#d6a056",
        "#f1f3ff" to "#ffefce")
    return pairs.entries.fold(source){art,(from,to)->art.replace(from,to)}
}
