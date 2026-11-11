package ru.planirovych.app.feature.home

import android.graphics.Color
import android.webkit.WebView
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView

/**
 * Identical local SVG and animation CSS, generated from PlanikMascot.tsx/CSS.
 * The invisible Compose hit target is layered ABOVE the presentation-only
 * WebView. WebView has no JavaScript or remote access and never handles input.
 */
@Composable
internal fun PlanikNativeLauncher(
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    Box(modifier.size(width = 105.dp, height = 94.dp)) {
        AndroidView(
            factory = {
                WebView(context).apply {
                    setBackgroundColor(Color.TRANSPARENT)
                    isVerticalScrollBarEnabled = false
                    isHorizontalScrollBarEnabled = false
                    settings.javaScriptEnabled = false
                    settings.allowFileAccess = true
                    settings.allowContentAccess = false
                    settings.blockNetworkLoads = true
                    loadUrl("file:///android_asset/planik_mascot.html")
                }
            },
            modifier = Modifier.fillMaxSize()
        )
        Box(Modifier.fillMaxSize()
            .clip(RoundedCornerShape(20.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .semantics { contentDescription = "Поговорить с Плаником" })
    }
}
