package ru.planirovych.app.feature.home

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Mini App-inspired project and chat cards:
 * - project tint follows its own assigned color
 * - chat tint is cyan
 * - both themes have individually tuned background gradients.
 */
@Composable
internal fun AiSidebarGradientCard(
    active:Boolean,accent:Color,dark:Boolean,modifier:Modifier=Modifier,
    content:@Composable ColumnScope.()->Unit
){
    val shape=RoundedCornerShape(22.dp)
    val start:Color
    val end:Color
    if(dark){
        start=if(active)lerp(Color(0xFF1E293B),accent,.27f)
            else lerp(Color(0xFF232E44),accent,.055f)
        end=if(active)Color(0xFF1B263E)else Color(0xFF1A253A)
    }else{
        start=if(active)lerp(Color.White,accent,.18f)
            else lerp(Color(0xFFF8FAFC),accent,.035f)
        end=if(active)Color(0xFFFDFEFF)else Color.White
    }
    val stroke=when{
        active&&dark->lerp(Color(0xFF475569),accent,.56f)
        active->accent.copy(alpha=.45f)
        dark->Color(0xFF475569).copy(alpha=.75f)
        else->Color(0xFFCBD5E1).copy(alpha=.88f)
    }
    Column(modifier
        .shadow(if(active)7.dp else 3.dp,shape)
        .clip(shape)
        .background(Brush.linearGradient(listOf(start,end)))
        .border(1.dp,stroke,shape)
        .padding(12.dp),
        verticalArrangement=Arrangement.spacedBy(9.dp),
        content=content)
}

// The Telegram mark below is the same 24x24 SVG path as MiniApp's
// Telegram assistant project icon, not a generic airplane glyph.
private const val TELEGRAM_SVG_PATH =
    "M21.94 4.17a1.46 1.46 0 0 0-1.7-.23L2.1 11.1a1.18 1.18 0 0 0 .12 2.24l4.68 1.45 1.77 5.3a1.15 1.15 0 0 0 1.9.47l2.9-2.88 4.68 3.46a1.3 1.3 0 0 0 2.03-.76l2.18-14.6a1.52 1.52 0 0 0-.42-1.61Zm-3.88 3.9-8.2 7.47-.32 2.63-1.28-3.83 9.8-6.27Z"

@Composable
internal fun GeneralAiProjectGlyph(icon:String,size:Dp){
    if(icon!="telegram"){
        Text(icon,fontSize=(size.value*.87f).sp,color=Color.White)
        return
    }
    val shape=remember{PathParser().parsePathString(TELEGRAM_SVG_PATH).toPath()}
    Canvas(Modifier.size(size)){
        val xScale=this.size.width/24f
        val yScale=this.size.height/24f
        withTransform({scale(xScale,yScale,pivot=Offset.Zero)}){
            drawPath(shape,Color.White)
        }
    }
}
