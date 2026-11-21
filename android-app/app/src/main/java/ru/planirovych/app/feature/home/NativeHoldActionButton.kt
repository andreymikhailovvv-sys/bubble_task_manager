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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import kotlin.math.abs
import kotlin.math.roundToInt

internal data class NativeHoldAction(val title:String,val icon:ImageVector,val select:()->Unit)

/** The choices are revealed on ACTION_DOWN. Releasing without selecting hides
 * the preview; holding and sliding activates a choice on ACTION_UP. A Popup
 * keeps text unconstrained by the FAB's 56dp layout width.
 */
@Composable
internal fun NativeHoldActionButton(
    actions:List<NativeHoldAction>,
    accent:Color,foreground:Color,
    onVoice:()->Unit,waiting:Boolean=false
){
    val haptics=LocalHapticFeedback.current
    val density=LocalDensity.current
    val unit=with(density){1.dp.toPx()}
    val latestActions by rememberUpdatedState(actions)
    val latestVoice by rememberUpdatedState(onVoice)
    var open by remember { mutableStateOf(false) }
    var selection by remember { mutableIntStateOf(-2) }
    val teal=Color(0xFF37B6B1)

    fun choose(next:Int){
        if(next!=selection){
            selection=next
            if(next>=-1)haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        }
    }
    fun activate(target:Int){
        open=false
        selection=-2
        if(target==-1)latestVoice()
        else latestActions.getOrNull(target)?.select?.invoke()
    }
    Box(Modifier.size(56.dp)){
        if(open && !waiting){
            // Draw in the popup, not inside a 56dp Box; otherwise every text
            // label is measured as a single letter.
            val height=(actions.size*58+86).dp
            Popup(alignment=Alignment.BottomEnd,offset=IntOffset.Zero,
                properties=PopupProperties(focusable=false,clippingEnabled=false)){
                Box(Modifier.width(254.dp).height(height)){
                    Canvas(Modifier.fillMaxSize()){
                        val x=size.width-28.dp.toPx()
                        val fabY=size.height-28.dp.toPx()
                        val firstY=size.height-92.dp.toPx()
                        val lastY=size.height-(92+(actions.size-1)*58).dp.toPx()
                        drawLine(teal.copy(alpha=.60f),start=androidx.compose.ui.geometry.Offset(x,fabY),
                            end=androidx.compose.ui.geometry.Offset(x,lastY),strokeWidth=1.8.dp.toPx())
                        // Short dashes mark each connector between the stacked actions.
                        actions.forEachIndexed{index,_->
                            val y=firstY-index*58.dp.toPx()
                            drawCircle(teal.copy(alpha=.75f),radius=2.3.dp.toPx(),
                                center=androidx.compose.ui.geometry.Offset(x,y))
                        }
                        drawLine(teal.copy(alpha=.60f),
                            start=androidx.compose.ui.geometry.Offset(x-28.dp.toPx(),fabY),
                            end=androidx.compose.ui.geometry.Offset(x-79.dp.toPx(),fabY),
                            strokeWidth=1.8.dp.toPx())
                    }
                    actions.forEachIndexed{index,action->
                        val chosen=selection==index
                        val scale by animateFloatAsState(if(chosen)1.18f else 1f,
                            label="action-hover-$index")
                        Row(Modifier.align(Alignment.BottomEnd)
                            .offset(y=(-(72+index*58)).dp)
                            .width(222.dp)
                            .graphicsLayer{scaleX=scale;scaleY=scale}
                            .clip(RoundedCornerShape(16.dp))
                            .background(MaterialTheme.colorScheme.surface)
                            .background(if(chosen)teal.copy(alpha=.19f) else Color.Transparent)
                            .border(1.dp,if(chosen)teal else MaterialTheme.colorScheme.outlineVariant,
                                RoundedCornerShape(16.dp))
                            .padding(horizontal=13.dp,vertical=10.dp),
                            verticalAlignment=Alignment.CenterVertically,
                            horizontalArrangement=Arrangement.spacedBy(11.dp)){
                            Icon(action.icon,null,tint=if(chosen)teal else accent.copy(alpha=.78f),
                                modifier=Modifier.size(19.dp))
                            Text(action.title,Modifier.weight(1f),fontSize=13.sp,
                                color=MaterialTheme.colorScheme.onSurface,maxLines=1,softWrap=false)
                        }
                    }
                    val chosen=selection==-1
                    val scale by animateFloatAsState(if(chosen)1.20f else 1f,label="voice-hover")
                    Box(Modifier.align(Alignment.BottomEnd).offset(x=(-82).dp)
                        .graphicsLayer{scaleX=scale;scaleY=scale}
                        .size(56.dp).clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surface)
                        .background(if(chosen)teal.copy(alpha=.20f) else Color.Transparent)
                        .border(1.dp,if(chosen)teal else MaterialTheme.colorScheme.outlineVariant,CircleShape),
                        contentAlignment=Alignment.Center){
                        Icon(Icons.Default.Mic,"Голосовой ввод",tint=if(chosen)teal else accent)
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
                    selection=-2
                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    val downAt=SystemClock.uptimeMillis()
                    var held=false
                    var target=-2
                    while(true){
                        val event=awaitPointerEvent()
                        val change=event.changes.firstOrNull{it.id==down.id}
                        if(change==null){
                            open=false
                            selection=-2
                            break
                        }
                        if(!change.pressed){
                            if(held && target>=-1)activate(target)
                            else{open=false;selection=-2}
                            break
                        }
                        if(!held && SystemClock.uptimeMillis()-downAt>=
                            ViewConfiguration.getLongPressTimeout()){
                            held=true
                            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        }
                        if(held){
                            val dx=(change.position.x-down.position.x)/unit
                            val dy=(change.position.y-down.position.y)/unit
                            target=when{
                                dx< -58f && abs(dy)<95f -> -1
                                dy< -47f && dx> -66f && latestActions.isNotEmpty()->
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
                contentDescription="Зажмите и проведите к действию или голосовому вводу"
            },contentAlignment=Alignment.Center){
            if(waiting)CircularProgressIndicator(Modifier.size(25.dp),color=foreground,strokeWidth=2.dp)
            else Icon(Icons.Default.Add,null,tint=foreground,modifier=Modifier.size(28.dp))
        }
    }
}
