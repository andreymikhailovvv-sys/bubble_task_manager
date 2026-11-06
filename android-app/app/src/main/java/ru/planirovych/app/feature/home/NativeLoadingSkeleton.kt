package ru.planirovych.app.feature.home

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Content-shaped loading skeleton for the list workspace, not a blocking spinner. */
@Composable
internal fun NativeLoadingSkeleton(modifier:Modifier=Modifier,dark:Boolean=false) {
    val backdrop=if(dark)Color(0xFF0E192B) else Color(0xFFF0F7FF)
    val card=if(dark)Color(0xFF1B2A40) else Color.White
    val border=if(dark)Color(0xFF35445D) else Color(0xFFE1E8F2)
    val base=if(dark)Color(0xFF2D3D55) else Color(0xFFE8EFF6)
    val glow=if(dark)Color(0xFF50617A) else Color(0xFFF9FCFF)
    val transition=rememberInfiniteTransition(label="workspace-loading")
    val phase by transition.animateFloat(0f,1f,
        animationSpec=infiniteRepeatable(tween(1500),RepeatMode.Restart),
        label="skeleton-shimmer")
    val start=phase*1300f-500f
    val shimmer=Brush.linearGradient(
        colors=listOf(base,glow,base),
        start=Offset(start,0f),end=Offset(start+520f,0f)
    )
    @Composable fun Strip(width:Modifier=Modifier,height:Int=18,radius:Int=12){
        Box(width.height(height.dp)
            .background(shimmer,RoundedCornerShape(radius.dp)))
    }
    @Composable fun Card(content:@Composable ColumnScope.()->Unit){
        Surface(shape=RoundedCornerShape(25.dp),color=card,
            border=androidx.compose.foundation.BorderStroke(1.dp,border)){
            Column(Modifier.fillMaxWidth().padding(18.dp),
                verticalArrangement=Arrangement.spacedBy(13.dp),content=content)
        }
    }
    Column(modifier.fillMaxSize().background(backdrop)
        .padding(horizontal=14.dp,vertical=24.dp),
        verticalArrangement=Arrangement.spacedBy(17.dp)){
        Row(Modifier.fillMaxWidth().height(46.dp),
            horizontalArrangement=Arrangement.spacedBy(9.dp)){
            Strip(Modifier.weight(2.5f),height=46,radius=20)
            Strip(Modifier.weight(1f),height=46,radius=18)
            Strip(Modifier.weight(.7f),height=46,radius=18)
            Strip(Modifier.weight(.7f),height=46,radius=18)
        }
        Card {
            Row(Modifier.fillMaxWidth(),
                horizontalArrangement=Arrangement.SpaceBetween){
                Strip(Modifier.width(110.dp),height=25)
                Strip(Modifier.width(135.dp),height=25)
            }
            Spacer(Modifier.height(4.dp))
            Box(Modifier.size(63.dp)
                .background(shimmer,CircleShape))
            Spacer(Modifier.height(8.dp))
        }
        Row(Modifier.fillMaxWidth().height(43.dp),
            horizontalArrangement=Arrangement.spacedBy(8.dp)){
            Strip(Modifier.weight(1f),height=43)
            Strip(Modifier.weight(1.4f),height=43)
            Strip(Modifier.weight(.85f),height=43)
        }
        repeat(3){
            Card {
                Row(Modifier.fillMaxWidth(),
                    horizontalArrangement=Arrangement.SpaceBetween){
                    Strip(Modifier.width(86.dp),height=23,radius=15)
                    Box(Modifier.size(20.dp).background(shimmer,CircleShape))
                }
                Strip(Modifier.fillMaxWidth(.86f),height=22)
                Strip(Modifier.fillMaxWidth(.59f),height=16)
                Strip(Modifier.fillMaxWidth(.48f),height=16)
            }
        }
    }
}
