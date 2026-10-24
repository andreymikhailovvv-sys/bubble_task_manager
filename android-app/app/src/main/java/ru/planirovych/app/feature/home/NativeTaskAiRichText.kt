package ru.planirovych.app.feature.home

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.text.ClickableText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.sp

/**
 * Inline Markdown used by the shared task AI messages. Render links inside
 * the message itself, not only separately in the sources list.
 * A small standalone parser avoids adding a WebView or Markdown dependency.
 */
private val aiInlineTokens = Regex(
    """(?s)\*\*(.+?)\*\*|__(.+?)__|\[([^\]\r\n]+)\]\((https?://[^\s)]+)\)|<a\s+href\s*=\s*["'](https?://[^"']+)["'][^>]*>(.*?)</a>|\x60([^\x60]+)\x60|https?://[^\s<>()]+""",
    RegexOption.IGNORE_CASE
)

private fun annotatedAiText(text: String, linkColor: Color): AnnotatedString =
    buildAnnotatedString {
        val normalized = text.replace(
            Regex("""(?m)^#{1,5}\s+([^\r\n]+)$"""),
            "**$1**"
        )
        var index = 0
        for (token in aiInlineTokens.findAll(normalized)) {
            append(normalized.substring(index, token.range.first))
            val bold = token.groups[1]?.value ?: token.groups[2]?.value
            val markdownLabel = token.groups[3]?.value
            val markdownUrl = token.groups[4]?.value
            val htmlUrl = token.groups[5]?.value
            val htmlLabel = token.groups[6]?.value
            val code = token.groups[7]?.value
            when {
                bold != null -> {
                    val from = length
                    append(bold)
                    addStyle(SpanStyle(fontWeight = FontWeight.Bold), from, length)
                }
                markdownLabel != null && markdownUrl != null -> {
                    val from = length
                    append(markdownLabel)
                    addStyle(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline),
                        from, length)
                    addStringAnnotation("URL", markdownUrl, from, length)
                }
                htmlLabel != null && htmlUrl != null -> {
                    val from = length
                    append(htmlLabel.replace(Regex("<[^>]*>"), ""))
                    addStyle(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline),
                        from, length)
                    addStringAnnotation("URL", htmlUrl, from, length)
                }
                code != null -> {
                    val from = length
                    append(code)
                    addStyle(SpanStyle(fontWeight = FontWeight.Medium,
                        background = linkColor.copy(alpha = .12f)), from, length)
                }
                else -> {
                    val url = token.value.trimEnd('.', ',', ';', ':', '!', '?')
                    val from = length
                    append(url)
                    addStyle(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline),
                        from, length)
                    addStringAnnotation("URL", url, from, length)
                    append(token.value.substring(url.length))
                }
            }
            index = token.range.last + 1
        }
        append(normalized.substring(index))
    }

@Composable
internal fun NativeAiFormattedMessage(text: String, textColor: Color, linkColor: Color) {
    val context = LocalContext.current
    val formatted = remember(text, linkColor) { annotatedAiText(text, linkColor) }
    ClickableText(
        text = formatted,
        style = TextStyle(color = textColor, fontSize = 13.sp, lineHeight = 20.sp),
        onClick = { offset ->
            val link = formatted.getStringAnnotations("URL", offset, offset)
                .firstOrNull()?.item ?: return@ClickableText
            val uri = Uri.parse(link)
            if (uri.scheme == "https" || uri.scheme == "http") {
                runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
            }
        }
    )
}
