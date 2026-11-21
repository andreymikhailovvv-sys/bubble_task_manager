package ru.planirovych.app.feature.home

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * The rightmost workspace tab is fully native Compose. All finance screens and
 * editors use authenticated Retrofit endpoints, no WebView, browser session,
 * JavaScript bridge or duplicated financial calculations.
 */
@Composable
fun NativeEconomicPage(userId: String?, dark: Boolean, active: Boolean = true) {
    EconomicComposePage(userId=userId, dark=dark, active=active)
}

@Composable
internal fun EconomicSkeleton(dark:Boolean){
    val animation=rememberInfiniteTransition(label="Economic cards preview")
    val shimmer by animation.animateFloat(
        initialValue=.45f,targetValue=.85f,
        animationSpec=infiniteRepeatable(tween(1150),RepeatMode.Reverse),
        label="Economic shimmer"
    )
    val background=ecoColors(dark).background
    val panel=if(dark)Color(0xFF2C2F3B) else Color(0xFFE6E8EC)
    @Composable fun preview(width:Modifier=Modifier,height:androidx.compose.ui.unit.Dp){
        Box(width.height(height).clip(RoundedCornerShape(17.dp))
            .background(panel.copy(alpha=shimmer)))
    }
    Column(Modifier.fillMaxSize().background(background).padding(15.dp),
        verticalArrangement=Arrangement.spacedBy(13.dp)){
        Spacer(Modifier.height(12.dp))
        preview(Modifier.fillMaxWidth(.63f),28.dp)
        preview(Modifier.fillMaxWidth(),156.dp)
        preview(Modifier.fillMaxWidth(),105.dp)
        Row(horizontalArrangement=Arrangement.spacedBy(11.dp)){
            preview(Modifier.weight(1f),82.dp)
            preview(Modifier.weight(1f),99.dp)
        }
        preview(Modifier.fillMaxWidth(),80.dp)
        preview(Modifier.fillMaxWidth(),80.dp)
    }
}
