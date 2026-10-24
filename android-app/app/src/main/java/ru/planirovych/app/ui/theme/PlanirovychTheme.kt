package ru.planirovych.app.ui.theme

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Explicit foreground/background pairs prevent Material fallback tonal layers from
// rendering low-contrast chips in the native light workspace.
private val LightColors = lightColorScheme(
    primary = Color(0xFF7457D9), onPrimary = Color.White,
    secondary = Color(0xFF0369A1), onSecondary = Color.White,
    background = Color(0xFFF6F7FC), onBackground = Color(0xFF172238),
    surface = Color.White, onSurface = Color(0xFF172238),
    surfaceVariant = Color(0xFFF3F5FB), onSurfaceVariant = Color(0xFF60718B),
    outline = Color(0xFFD8E2EF), outlineVariant = Color(0xFFE6EBF3),
    surfaceTint = Color.Transparent,
)
private val DarkColors = darkColorScheme(
    primary = Color(0xFFA78BFA), onPrimary = Color(0xFF0F172A),
    secondary = Color(0xFF7DD3FC), onSecondary = Color(0xFF0F172A),
    background = Color(0xFF090D1A), onBackground = Color(0xFFF1F5F9),
    surface = Color(0xFF121827), onSurface = Color(0xFFF1F5F9),
    surfaceVariant = Color(0xFF1B283D), onSurfaceVariant = Color(0xFFA5B4CA),
    outline = Color(0xFF35455C), outlineVariant = Color(0xFF26344A),
    surfaceTint = Color.Transparent,
)
@Composable
fun PlanirovychTheme(dark: Boolean, content: @Composable () -> Unit) {
    MaterialTheme(colorScheme=if(dark) DarkColors else LightColors,
        typography=Typography(),content=content)
}
