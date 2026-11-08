package ru.planirovych.app.feature.home

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text

/**
 * Same bounded multiline input for the general and per-task AI chats.
 *
 * A BasicTextField with unconstrained decoration can render long pasted text
 * over the attachment/send buttons and even outside its pill. Constrain both
 * editable text and decoration to the same five-line viewport, with Compose's
 * built-in editable scrolling for the remaining text.
 */
@Composable
internal fun NativeAiComposerInput(
    value:String, onValueChange:(String)->Unit,
    enabled:Boolean, colors:TaskChatColors, placeholder:String,
    modifier:Modifier=Modifier
) {
    BasicTextField(
        value=value,
        onValueChange=onValueChange,
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
