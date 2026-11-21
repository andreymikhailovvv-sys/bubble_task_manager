package ru.planirovych.app.feature.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties

internal data class NativeHoldAction(val title:String,val icon:ImageVector,val select:()->Unit)

/** Click opens a persistent, accessible action menu; selecting an item or
 * tapping outside closes it. No hold gestures, preview timers or teaching hints.
 */
@Composable
internal fun NativeHoldActionButton(
    actions:List<NativeHoldAction>,
    accent:Color,foreground:Color,
    onVoice:()->Unit,waiting:Boolean=false,
    onMenuVisibilityChange:(Boolean)->Unit={}
){
    val haptics=LocalHapticFeedback.current
    val latestActions by rememberUpdatedState(actions)
    val latestVoice by rememberUpdatedState(onVoice)
    val visibilityChanged by rememberUpdatedState(onMenuVisibilityChange)
    var open by remember { mutableStateOf(false) }
    val menuTransition=remember { MutableTransitionState(false) }
    val dark=MaterialTheme.colorScheme.background.luminance()<.4f
    val wire=if(dark)Color(0xFF9BDCD9) else Color(0xFF318790)
    val tile=if(dark)Color(0xFF223044) else Color(0xFFFCFDFF)
    val outline=if(dark)Color(0xFF698094) else Color(0xFFD4DEE8)
    val ink=if(dark)Color(0xFFF7FAFF) else Color(0xFF132434)

    LaunchedEffect(open,waiting){
        val visible=open&&!waiting
        menuTransition.targetState=visible
        visibilityChanged(visible)
    }
    LaunchedEffect(waiting){if(waiting)open=false}

    fun activate(target:Int){
        open=false
        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        if(target==-1)latestVoice()
        else latestActions.getOrNull(target)?.select?.invoke()
    }

    Box(Modifier.size(56.dp)){
        if(menuTransition.currentState || menuTransition.targetState){
            val height=(actions.size*58+86).dp
            Popup(
                onDismissRequest={open=false},
                alignment=Alignment.BottomEnd,offset=IntOffset.Zero,
                properties=PopupProperties(focusable=true,clippingEnabled=false)
            ){
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
                                    size.height-(118+index*58).dp.toPx()),
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
                        Row(Modifier.align(Alignment.BottomEnd)
                            .offset(y=(-(72+index*58)).dp)
                            .width(226.dp)
                            .clip(RoundedCornerShape(15.dp))
                            .background(tile)
                            .border(.8.dp,outline.copy(alpha=.80f),
                                RoundedCornerShape(15.dp))
                            .clickable { activate(index) }
                            .padding(horizontal=12.dp,vertical=9.dp),
                            verticalAlignment=Alignment.CenterVertically,
                            horizontalArrangement=Arrangement.spacedBy(10.dp)){
                            Box(Modifier.size(28.dp)
                                .clip(CircleShape)
                                .background(accent.copy(alpha=if(dark).17f else .10f)),
                                contentAlignment=Alignment.Center){
                                Icon(action.icon,null,tint=accent,
                                    modifier=Modifier.size(17.dp))
                            }
                            Text(action.title,Modifier.weight(1f),fontSize=13.sp,
                                color=ink,maxLines=1,softWrap=false)
                        }
                    }
                    Box(Modifier.align(Alignment.BottomEnd).offset(x=(-82).dp)
                        .size(56.dp).clip(CircleShape)
                        .background(tile)
                        .border(.8.dp,outline.copy(alpha=.80f),CircleShape)
                        .clickable { activate(-1) },
                        contentAlignment=Alignment.Center){
                        Icon(Icons.Default.Mic,"Голосовой ввод",
                            tint=accent,modifier=Modifier.size(24.dp))
                    }
                }
                }
            }
        }
        Box(Modifier.fillMaxSize().clip(CircleShape).background(accent)
            .clickable(enabled=!waiting, onClickLabel="Открыть меню добавления") {
                open=!open
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            },contentAlignment=Alignment.Center){
            if(waiting)CircularProgressIndicator(Modifier.size(25.dp),color=foreground,strokeWidth=2.dp)
            else Icon(Icons.Default.Add,null,tint=foreground,modifier=Modifier.size(28.dp))
        }
    }
}
