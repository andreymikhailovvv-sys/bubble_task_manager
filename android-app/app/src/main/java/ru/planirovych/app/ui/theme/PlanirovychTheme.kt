package ru.planirovych.app.ui.theme

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(primary=Color(0xFF7457D9), secondary=Color(0xFF0891B2), background=Color(0xFFF6F7FC), surface=Color.White, surfaceVariant=Color(0xFFF0F1F8), outline=Color(0xFFD8DAE8))
private val DarkColors = darkColorScheme(primary=Color(0xFFA78BFA), secondary=Color(0xFF22D3EE), background=Color(0xFF090D1A), surface=Color(0xFF121827), surfaceVariant=Color(0xFF1B2335), outline=Color(0xFF374158))
@Composable fun PlanirovychTheme(dark: Boolean, content: @Composable () -> Unit) { MaterialTheme(colorScheme = if(dark) DarkColors else LightColors, typography = Typography(), content = content) }
