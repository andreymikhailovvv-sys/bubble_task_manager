package ru.planirovych.app.feature.home

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
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
import androidx.compose.ui.input.pointer.consume
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.*
import kotlin.math.roundToInt

internal data class NativeHoldAction(val title:String,val icon:ImageVector,val select:()->Unit)

/** Hold, then drag left to talk or upward to choose an existing action.
 * The overlay has no blocking backdrop: the underlying scroll surface is unchanged
 * until the user performs the intentional long press.
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
    var open by remember{mutableStateOf(false)}
    var selection by remember{mutableIntStateOf(-2)}
    var offsetX by remember{mutableFloatStateOf(0f)}
    var offsetY by remember{mutableFloatStateOf(0f)}
    fun changeSelection(next:Int){
        if(next!=selection){
            selection=next
            if(next>=-1)haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        }
    }
    fun activate(index:Int){
        open=false;selection=-2
        if(index==-1)onVoice()
        else if(index in actions.indices)actions[index].select()
    }
    Box(Modifier.size(56.dp)){
        if(open){
            // Non-modal radial choices: upward stack plus the microphone on the left.
            actions.forEachIndexed{index,action->
                val chosen=selection==index
                val scale by animateFloatAsState(if(chosen)1.09f else 1f,label="action-hover")
                Row(Modifier.align(Alignment.BottomEnd)
                    .offset(y=(-(72+index*57)).dp)
                    .graphicsLayer{scaleX=scale;scaleY=scale}
                    .clip(RoundedCornerShape(24.dp))
                    .background(if(chosen)accent else MaterialTheme.colorScheme.surface)
                    .border(1.dp,accent.copy(alpha=if(chosen)1f else .35f),RoundedCornerShape(24.dp))
                    .padding(horizontal=12.dp,vertical=9.dp),
                    verticalAlignment=Alignment.CenterVertically,
                    horizontalArrangement=Arrangement.spacedBy(8.dp)){
                    Icon(action.icon,null,tint=if(chosen)foreground else accent,
                        modifier=Modifier.size(18.dp))
                    Text(action.title,fontSize=12.sp,
                        color=if(chosen)foreground else MaterialTheme.colorScheme.onSurface,
                        maxLines=1)
                }
            }
            val chosen=selection==-1
            val scale by animateFloatAsState(if(chosen)1.12f else 1f,label="voice-hover")
            Box(Modifier.align(Alignment.CenterStart).offset(x=(-87).dp)
                .graphicsLayer{scaleX=scale;scaleY=scale}
                .size(54.dp).clip(CircleShape)
                .background(if(chosen)accent else MaterialTheme.colorScheme.surface)
                .border(1.dp,accent.copy(alpha=.7f),CircleShape),
                contentAlignment=Alignment.Center){
                Icon(Icons.Default.Mic,"Голосовой ввод",tint=if(chosen)foreground else accent)
            }
        }
        Box(
            Modifier.fillMaxSize().clip(CircleShape).background(accent)
                .pointerInput(waiting){
                    if(waiting)return@pointerInput
                    detectDragGesturesAfterLongPress(
                        onDragStart={offsetX=0f;offsetY=0f;selection=-2;open=true},
                        onDrag={change,amount->
                            change.consume()
                            offsetX+=amount.x;offsetY+=amount.y
                            val next=when{
                                offsetX<(-58*unit) && kotlin.math.abs(offsetY)<(95*unit)->-1
                                offsetY<(-48*unit) && offsetX>(-66*unit)->
                                    (((-offsetY/unit)-72f)/57f).roundToInt().coerceIn(0,actions.lastIndex)
                                else->-2
                            }
                            changeSelection(next)
                        },
                        onDragEnd={
                            val target=selection
                            if(target>=-1)activate(target)
                            else {open=false;selection=-2}
                        },
                        onDragCancel={open=false;selection=-2}
                    )
                }
                .semantics{
                    contentDescription="Зажмите для выбора действия или голосового ввода"
                    onClick(label="Открыть действия"){
                        open=!open;true
                    }
                },
            contentAlignment=Alignment.Center){
            if(waiting)CircularProgressIndicator(Modifier.size(25.dp),color=foreground,strokeWidth=2.dp)
            else Icon(Icons.Default.Add,null,tint=foreground,modifier=Modifier.size(28.dp))
        }
    }
}
