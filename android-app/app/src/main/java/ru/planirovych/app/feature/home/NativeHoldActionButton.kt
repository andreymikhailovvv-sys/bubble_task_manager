package ru.planirovych.app.feature.home

import android.os.SystemClock
import android.view.ViewConfiguration
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import kotlinx.coroutines.delay
import kotlin.math.abs
import kotlin.math.roundToInt

internal data class NativeHoldAction(val title:String,val icon:ImageVector,val select:()->Unit)

/**
 * ACTION_DOWN reveals the actions; a quick ACTION_UP leaves a short teaching
 * preview on-screen. Long press + slide selects on release. Popup keeps the
 * full labels visible outside the 56dp FAB's own layout constraints.
 */
@Composable
internal fun NativeHoldActionButton(
    actions:List<NativeHoldAction>,
    accent:Color,foreground:Color,
    onVoice:()->Unit,waiting:Boolean=false,
    onMenuVisibilityChange:(Boolean)->Unit={}
){
    val haptics=LocalHapticFeedback.current
    val density=LocalDensity.current
    val unit=with(density){1.dp.toPx()}
    val latestActions by rememberUpdatedState(actions)
    val latestVoice by rememberUpdatedState(onVoice)
    val visibilityChanged by rememberUpdatedState(onMenuVisibilityChange)
    var open by remember { mutableStateOf(false) }
    var selection by remember { mutableIntStateOf(-2) }
    var releasedPreview by remember { mutableStateOf(false) }
    var previewRevision by remember { mutableIntStateOf(0) }
    val dark=MaterialTheme.colorScheme.background.luminance()<.4f
    val teal=if(dark)Color(0xFF79DDD3) else Color(0xFF177C86)
    val wire=if(dark)Color(0xFF9BDCD9) else Color(0xFF318790)
    val tile=if(dark)Color(0xFF223044) else Color(0xFFFFFFFF)
    val outline=if(dark)Color(0xFFA6BACB) else Color(0xFF62768B)
    val ink=if(dark)Color(0xFFF7FAFF) else Color(0xFF132434)
    val hover=if(dark)Color(0xFF2E515C) else Color(0xFFD9F2F0)

    LaunchedEffect(open,waiting){
        visibilityChanged(open&&!waiting)
    }
    // The UI never flashes and vanishes on a normal tap: it remains visible
    // long enough to explain how to select an action.
    LaunchedEffect(releasedPreview,previewRevision){
        if(releasedPreview){
            delay(2300)
            open=false
            releasedPreview=false
            selection=-2
        }
    }
    LaunchedEffect(waiting){
        if(waiting){open=false;releasedPreview=false;selection=-2}
    }

    fun choose(next:Int){
        if(next!=selection){
            selection=next
            if(next>=-1)haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        }
    }
    fun activate(target:Int){
        open=false
        releasedPreview=false
        selection=-2
        if(target==-1)latestVoice()
        else latestActions.getOrNull(target)?.select?.invoke()
    }
    Box(Modifier.size(56.dp)){
        if(open&&!waiting){
            val height=(actions.size*58+130).dp
            Popup(alignment=Alignment.BottomEnd,offset=IntOffset.Zero,
                properties=PopupProperties(focusable=false,clippingEnabled=false)){
                Box(Modifier.width(278.dp).height(height)){
                    Canvas(Modifier.fillMaxSize()){
                        val x=size.width-28.dp.toPx()
                        val cy=size.height-28.dp.toPx()
                        val stroke=2.3.dp.toPx()
                        fun connection(from:androidx.compose.ui.geometry.Offset,
                            to:androidx.compose.ui.geometry.Offset){
                            drawLine(wire.copy(alpha=.22f),from,to,6.dp.toPx(),
                                cap=StrokeCap.Round)
                            drawLine(wire,from,to,stroke,cap=StrokeCap.Round)
                        }
                        // Connect at the top edge of the round FAB, never
                        // through its centre or behind the action labels.
                        connection(
                            androidx.compose.ui.geometry.Offset(x,cy-28.dp.toPx()),
                            androidx.compose.ui.geometry.Offset(x,size.height-72.dp.toPx()))
                        // Small, separate rounded links between adjacent chips.
                        repeat((actions.size-1).coerceAtLeast(0)){index->
                            connection(
                                androidx.compose.ui.geometry.Offset(x,
                                    size.height-(111+index*58).dp.toPx()),
                                androidx.compose.ui.geometry.Offset(x,
                                    size.height-(72+(index+1)*58).dp.toPx()))
                        }
                        // A gently curved connector from the left FAB edge
                        // to the right edge of the voice button.
                        val left=x-28.dp.toPx()
                        val right=size.width-82.dp.toPx()
                        val path=Path().apply{
                            moveTo(left,cy)
                            cubicTo(left-7.dp.toPx(),cy-5.dp.toPx(),
                                right+7.dp.toPx(),cy-5.dp.toPx(),right,cy)
                        }
                        drawPath(path,wire.copy(alpha=.22f),
                            style=Stroke(6.dp.toPx(),cap=StrokeCap.Round))
                        drawPath(path,wire,
                            style=Stroke(stroke,cap=StrokeCap.Round))
                    }
                    // Compact teaching hint above the uppermost action.
                    Surface(Modifier.align(Alignment.TopEnd).padding(top=15.dp),
                        shape=RoundedCornerShape(12.dp),color=tile,
                        border=androidx.compose.foundation.BorderStroke(
                            1.dp,outline.copy(alpha=.90f)),
                        shadowElevation=5.dp){
                        Text("Удерживайте и ведите к действию",
                            Modifier.padding(horizontal=10.dp,vertical=8.dp),
                            fontSize=11.sp,color=ink,maxLines=1)
                    }
                    actions.forEachIndexed{index,action->
                        val chosen=selection==index
                        val scale by animateFloatAsState(if(chosen)1.18f else 1f,
                            label="action-hover-$index")
                        Row(Modifier.align(Alignment.BottomEnd)
                            .offset(y=(-(72+index*58)).dp)
                            .width(226.dp)
                            .graphicsLayer{scaleX=scale;scaleY=scale}
                            .clip(RoundedCornerShape(15.dp))
                            .background(if(chosen)hover else tile)
                            .border(if(chosen)1.7.dp else 1.dp,
                                if(chosen)teal else outline,RoundedCornerShape(15.dp))
                            .padding(horizontal=13.dp,vertical=10.dp),
                            verticalAlignment=Alignment.CenterVertically,
                            horizontalArrangement=Arrangement.spacedBy(11.dp)){
                            Icon(action.icon,null,tint=if(chosen)teal else accent,
                                modifier=Modifier.size(19.dp))
                            Text(action.title,Modifier.weight(1f),fontSize=13.sp,
                                color=ink,maxLines=1,softWrap=false)
                        }
                    }
                    val chosen=selection==-1
                    val scale by animateFloatAsState(if(chosen)1.20f else 1f,label="voice-hover")
                    Box(Modifier.align(Alignment.BottomEnd).offset(x=(-82).dp)
                        .graphicsLayer{scaleX=scale;scaleY=scale}
                        .size(56.dp).clip(CircleShape)
                        .background(if(chosen)hover else tile)
                        .border(if(chosen)1.7.dp else 1.dp,
                            if(chosen)teal else outline,CircleShape),
                        contentAlignment=Alignment.Center){
                        Icon(Icons.Default.Mic,"Голосовой ввод",
                            tint=if(chosen)teal else accent,modifier=Modifier.size(24.dp))
                    }
                }
            }
        }
        Box(Modifier.fillMaxSize().clip(CircleShape).background(accent)
            .pointerInput(waiting){
                if(waiting)return@pointerInput
                awaitEachGesture{
                    val down=awaitFirstDown(requireUnconsumed=false)
                    open=true
                    releasedPreview=false
                    selection=-2
                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    val downAt=SystemClock.uptimeMillis()
                    var held=false
                    var target=-2
                    while(true){
                        val event=awaitPointerEvent()
                        val change=event.changes.firstOrNull{it.id==down.id}
                        if(change==null){
                            open=false;releasedPreview=false;selection=-2
                            break
                        }
                        if(!change.pressed){
                            if(held&&target>=-1)activate(target)
                            else{
                                // Keep the radial preview after a quick tap.
                                selection=-2
                                previewRevision++
                                releasedPreview=true
                            }
                            break
                        }
                        if(!held&&SystemClock.uptimeMillis()-downAt>=
                            ViewConfiguration.getLongPressTimeout()){
                            held=true
                            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        }
                        if(held){
                            val dx=(change.position.x-down.position.x)/unit
                            val dy=(change.position.y-down.position.y)/unit
                            target=when{
                                dx< -58f&&abs(dy)<95f -> -1
                                dy< -47f&&dx> -66f&&latestActions.isNotEmpty()->
                                    ((-dy-72f)/58f).roundToInt()
                                        .coerceIn(0,latestActions.lastIndex)
                                else->-2
                            }
                            choose(target)
                            if(target>=-1)change.consume()
                        }
                    }
                }
            }
            .semantics{
                contentDescription="Удерживайте и ведите к действию"
                onClick(label="Показать доступные действия"){
                    open=true
                    releasedPreview=true
                    previewRevision++
                    true
                }
            },contentAlignment=Alignment.Center){
            if(waiting)CircularProgressIndicator(Modifier.size(25.dp),color=foreground,strokeWidth=2.dp)
            else Icon(Icons.Default.Add,null,tint=foreground,modifier=Modifier.size(28.dp))
        }
    }
}
