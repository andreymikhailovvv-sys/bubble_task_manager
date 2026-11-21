package ru.planirovych.app.feature.home

import android.os.SystemClock
import android.view.ViewConfiguration
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
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
import androidx.compose.ui.graphics.TransformOrigin
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
 * ACTION_DOWN softly reveals actions. A quick tap previews them for half a
 * second, then fades to a compact hint beside the FAB. Long press + slide
 * still selects on release. Popup keeps labels outside the 56dp FAB layout.
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
    var hintVisible by remember { mutableStateOf(false) }
    var previewRevision by remember { mutableIntStateOf(0) }
    val menuTransition=remember { MutableTransitionState(false) }
    val hintTransition=remember { MutableTransitionState(false) }
    val dark=MaterialTheme.colorScheme.background.luminance()<.4f
    val teal=if(dark)Color(0xFF79DDD3) else Color(0xFF177C86)
    val wire=if(dark)Color(0xFF9BDCD9) else Color(0xFF318790)
    val tile=if(dark)Color(0xFF223044) else Color(0xFFFCFDFF)
    val outline=if(dark)Color(0xFF698094) else Color(0xFFD4DEE8)
    val ink=if(dark)Color(0xFFF7FAFF) else Color(0xFF132434)
    val hover=if(dark)Color(0xFF2E515C) else Color(0xFFDDF2F0)

    LaunchedEffect(open,waiting){
        visibilityChanged(open&&!waiting)
        menuTransition.targetState=open&&!waiting
    }
    LaunchedEffect(hintVisible,waiting){
        hintTransition.targetState=hintVisible&&!waiting
    }
    // A tap is a half-second acknowledgement, not an open menu. A short
    // contextual hint appears only after the fade-out has completed.
    // Incrementing the revision cancels stale timers on a second gesture.
    LaunchedEffect(previewRevision){
        if(releasedPreview){
            delay(420)
            open=false
            selection=-2
            delay(145)
            if(!waiting){
                hintVisible=true
                delay(1650)
                hintVisible=false
            }
            releasedPreview=false
        }
    }
    LaunchedEffect(waiting){
        if(waiting){
            previewRevision++
            open=false
            releasedPreview=false
            hintVisible=false
            selection=-2
        }
    }

    fun choose(next:Int){
        if(next!=selection){
            selection=next
            if(next>=-1)haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        }
    }
    fun activate(target:Int){
        previewRevision++
        open=false
        releasedPreview=false
        hintVisible=false
        selection=-2
        if(target==-1)latestVoice()
        else latestActions.getOrNull(target)?.select?.invoke()
    }
    Box(Modifier.size(56.dp)){
        if(menuTransition.currentState || menuTransition.targetState){
            val height=(actions.size*58+86).dp
            Popup(alignment=Alignment.BottomEnd,offset=IntOffset.Zero,
                properties=PopupProperties(focusable=false,clippingEnabled=false)){
                AnimatedVisibility(
                    visibleState=menuTransition,
                    enter=fadeIn(animationSpec=tween(155))+
                        scaleIn(initialScale=.94f,
                            transformOrigin=TransformOrigin(1f,1f),
                            animationSpec=tween(170)),
                    exit=fadeOut(animationSpec=tween(125))+
                        scaleOut(targetScale=.97f,
                            transformOrigin=TransformOrigin(1f,1f),
                            animationSpec=tween(125))
                ){
                Box(Modifier.width(278.dp).height(height)){
                    Canvas(Modifier.fillMaxSize()){
                        val x=size.width-28.dp.toPx()
                        val cy=size.height-28.dp.toPx()
                        val stroke=1.8.dp.toPx()
                        fun connection(from:androidx.compose.ui.geometry.Offset,
                            to:androidx.compose.ui.geometry.Offset){
                            drawLine(wire.copy(alpha=.11f),from,to,5.dp.toPx(),
                                cap=StrokeCap.Round)
                            drawLine(wire.copy(alpha=.72f),from,to,stroke,
                                cap=StrokeCap.Round)
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
                        drawPath(path,wire.copy(alpha=.11f),
                            style=Stroke(5.dp.toPx(),cap=StrokeCap.Round))
                        drawPath(path,wire.copy(alpha=.72f),
                            style=Stroke(stroke,cap=StrokeCap.Round))
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
                            .border(0.8.dp,
                                if(chosen)teal.copy(alpha=.65f) else outline.copy(alpha=.80f),
                                RoundedCornerShape(15.dp))
                            .padding(horizontal=12.dp,vertical=9.dp),
                            verticalAlignment=Alignment.CenterVertically,
                            horizontalArrangement=Arrangement.spacedBy(10.dp)){
                            Box(Modifier.size(28.dp)
                                .clip(CircleShape)
                                .background(accent.copy(alpha=if(dark).17f else .10f)),
                                contentAlignment=Alignment.Center){
                                Icon(action.icon,null,tint=if(chosen)teal else accent,
                                    modifier=Modifier.size(17.dp))
                            }
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
                        .border(.8.dp,
                            if(chosen)teal.copy(alpha=.65f) else outline.copy(alpha=.80f),
                            CircleShape),
                        contentAlignment=Alignment.Center){
                        Icon(Icons.Default.Mic,"Голосовой ввод",
                            tint=if(chosen)teal else accent,modifier=Modifier.size(24.dp))
                    }
                }
                }
            }
        }
        if(hintTransition.currentState || hintTransition.targetState){
            Popup(alignment=Alignment.CenterEnd,
                offset=IntOffset(x=with(density){(-72).dp.roundToPx()},y=0),
                properties=PopupProperties(focusable=false,clippingEnabled=false)){
                AnimatedVisibility(
                    visibleState=hintTransition,
                    enter=fadeIn(animationSpec=tween(140))+
                        slideInHorizontally(initialOffsetX={it/8},
                            animationSpec=tween(140)),
                    exit=fadeOut(animationSpec=tween(160))
                ){
                    Surface(shape=RoundedCornerShape(12.dp),color=tile,
                        shadowElevation=3.dp,
                        border=androidx.compose.foundation.BorderStroke(
                            .75.dp,outline.copy(alpha=.8f))){
                        Text("Зажмите «+» для выбора",
                            Modifier.padding(horizontal=12.dp,vertical=9.dp),
                            color=ink,fontSize=12.sp,maxLines=1)
                    }
                }
            }
        }
        Box(Modifier.fillMaxSize().clip(CircleShape).background(accent)
            .pointerInput(waiting){
                if(waiting)return@pointerInput
                awaitEachGesture{
                    val down=awaitFirstDown(requireUnconsumed=false)
                    previewRevision++
                    open=true
                    releasedPreview=false
                    hintVisible=false
                    selection=-2
                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    val downAt=SystemClock.uptimeMillis()
                    var held=false
                    var target=-2
                    while(true){
                        val event=awaitPointerEvent()
                        val change=event.changes.firstOrNull{it.id==down.id}
                        if(change==null){
                            open=false;releasedPreview=false;hintVisible=false;selection=-2
                            break
                        }
                        if(!change.pressed){
                            val longEnough=held ||
                                SystemClock.uptimeMillis()-downAt >=
                                    ViewConfiguration.getLongPressTimeout()
                            if(longEnough){
                                if(target>=-1)activate(target)
                                else{open=false;selection=-2}
                            }else{
                                // Brief feedback, then teach the gesture beside "+".
                                selection=-2
                                releasedPreview=true
                                previewRevision++
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
                contentDescription="Добавить"
                onClick(label="Показать доступные действия"){
                    previewRevision++
                    hintVisible=false
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
