package ru.planirovych.app.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text

/** One bounded and internally scrollable five-line text field for both AI chats. */
@Composable
internal fun NativeAiComposerInput(
    value:String,onValueChange:(String)->Unit,
    enabled:Boolean,colors:TaskChatColors,placeholder:String,
    modifier:Modifier=Modifier,onWrapped:()->Unit={}
) {
    BasicTextField(
        value=value,
        onValueChange=onValueChange,
        onTextLayout={if(it.lineCount>1)onWrapped()},
        modifier=modifier.heightIn(min=44.dp,max=124.dp).clipToBounds(),
        enabled=enabled,
        singleLine=false,
        minLines=1,
        maxLines=5,
        textStyle=TextStyle(color=colors.text,fontSize=14.sp,lineHeight=20.sp),
        cursorBrush=SolidColor(colors.accent),
        decorationBox={inner->
            Box(Modifier.fillMaxWidth()
                .heightIn(min=44.dp,max=124.dp)
                .clipToBounds()
                .padding(horizontal=10.dp,vertical=8.dp),
                contentAlignment=Alignment.CenterStart) {
                if(value.isEmpty())
                    Text(placeholder,color=colors.secondary,fontSize=14.sp,
                        lineHeight=20.sp,maxLines=2)
                inner()
            }
        }
    )
}

/**
 * On wrap, expand the text field to full width and move controls below it.
 * Keep the BasicTextField mounted at the same composition site so the cursor,
 * keyboard, selection and active voice dictation do not reset.
 */
@Composable
internal fun NativeAiComposerBar(
    value:String,onValueChange:(String)->Unit,
    enabled:Boolean,colors:TaskChatColors,placeholder:String,
    background:Color,controlBorder:Color,
    focusModifier:Modifier=Modifier,
    controlSpacing:Dp=5.dp,
    controls:@Composable RowScope.()->Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val shape=RoundedCornerShape(if(expanded)25.dp else 50.dp)
    val update:(String)->Unit={newValue->
        if(newValue.isEmpty())expanded=false
        onValueChange(newValue)
    }
    Column(Modifier.fillMaxWidth()
        .shadow(elevation=3.dp,shape=shape,
            ambientColor=Color(0x101F3F70),spotColor=Color(0x161F3F70))
        .clip(shape)
        .background(background)
        .border(1.dp,controlBorder.copy(alpha=.83f),shape)
        .padding(horizontal=8.dp,vertical=8.dp),
        verticalArrangement=Arrangement.spacedBy(if(expanded)7.dp else 0.dp)) {
        Box(Modifier.fillMaxWidth()) {
            NativeAiComposerInput(
                value=value,onValueChange=update,enabled=enabled,
                colors=colors,placeholder=placeholder,
                modifier=Modifier.fillMaxWidth()
                    // Reserve enough width for 3x44dp actions and two gaps.
                    .padding(end=if(expanded)0.dp else 144.dp)
                    .then(if(expanded)Modifier.border(
                        1.dp,colors.accent.copy(alpha=.28f),
                        RoundedCornerShape(19.dp)) else Modifier)
                    .then(focusModifier),
                onWrapped={expanded=true}
            )
            if(!expanded) {
                Row(Modifier.align(Alignment.BottomEnd),
                    horizontalArrangement=Arrangement.spacedBy(controlSpacing),
                    verticalAlignment=Alignment.Bottom,content=controls)
            }
        }
        if(expanded) {
            Row(Modifier.fillMaxWidth(),
                horizontalArrangement=Arrangement.spacedBy(controlSpacing,Alignment.End),
                verticalAlignment=Alignment.CenterVertically,content=controls)
        }
    }
}
