package ru.planirovych.app.feature.home

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.text.ClickableText
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.ui.unit.TextUnit
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Surface
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
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

// Both formats are emitted by the server and handled by the Mini App.
private val aiTaskReferencePattern=Regex(
    """\[\[task_ref=([^\]]+)\]\]|\[\[task_ref:([^|\]]+)\|([^\]]+)\]\]"""
)
private data class AiTaskReference(val id:String,val fallbackLabel:String)
private fun aiTaskRefs(text:String):List<AiTaskReference> =
    aiTaskReferencePattern.findAll(text).mapNotNull{match->
        val id=(match.groups[1]?.value?:match.groups[2]?.value).orEmpty().trim()
        if(id.isEmpty())null else AiTaskReference(id,match.groups[3]?.value?.trim()
            ?.takeIf{it.isNotEmpty()}?:"Открыть задачу")
    }.toList()

private sealed interface AiTextBlock {
    data class Prose(val content:String):AiTextBlock
    data class Table(val headers:List<String>,val rows:List<List<String>>):AiTextBlock
}

/** Markdown pipe tables: require a real separator row, not simply a pipe in
 * a sentence. This is shared by both task AI and general AI chat messages.
 */
private fun parseAiTextBlocks(content:String):List<AiTextBlock>{
    val lines=content.replace("\r\n","\n").lines()
    val blocks=mutableListOf<AiTextBlock>()
    val prose=mutableListOf<String>()
    fun flush(){
        if(prose.isNotEmpty()){
            blocks.add(AiTextBlock.Prose(prose.joinToString("\n")))
            prose.clear()
        }
    }
    fun cells(line:String):List<String>{
        var result=line.trim()
        if(result.startsWith("|"))result=result.drop(1)
        if(result.endsWith("|")&&!result.endsWith("\\|"))result=result.dropLast(1)
        return result.split(Regex("""(?<!\\)\|"""))
            .map{it.trim().replace("\\|","|")}
    }
    fun isSeparator(values:List<String>):Boolean=
        values.size>=2 && values.all{
            it.matches(Regex(""":[-]{3,}:?|[-]{3,}:?""")) ||
                it.matches(Regex("""^:?-{3,}:?$"""))
        }
    var line=0
    var inFence=false
    while(line<lines.size){
        val current=lines[line]
        if(current.trimStart().startsWith("```")){
            inFence=!inFence
            prose.add(current);line++;continue
        }
        if(!inFence && line+1<lines.size){
            val headers=cells(current)
            val separator=cells(lines[line+1])
            if(headers.size>=2 && headers.size==separator.size &&
                (current.contains("|")) && isSeparator(separator)){
                flush()
                val rows=mutableListOf<List<String>>()
                line+=2
                while(line<lines.size && lines[line].contains("|") &&
                    lines[line].isNotBlank()){
                    val row=cells(lines[line])
                    if(row.size!=headers.size)break
                    rows.add(row)
                    line++
                }
                blocks.add(AiTextBlock.Table(headers,rows))
                continue
            }
        }
        prose.add(current);line++
    }
    flush()
    return blocks
}

@Composable
internal fun NativeAiFormattedMessage(text:String,textColor:Color,linkColor:Color,
    fontSize:TextUnit=13.sp,
    taskTitles:Map<String,String> = emptyMap(),
    onOpenTaskReference:((String)->Unit)?=null){
    val blocks=remember(text){parseAiTextBlocks(text)}
    Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
        blocks.forEach{block->
            when(block){
                is AiTextBlock.Prose->NativeAiProseWithTaskRefs(block.content,textColor,linkColor,
                    fontSize,taskTitles,onOpenTaskReference)
                is AiTextBlock.Table->NativeAiTable(block,textColor,linkColor,
                    taskTitles,onOpenTaskReference)
            }
        }
    }
}

@Composable
private fun NativeAiProseWithTaskRefs(text:String,textColor:Color,linkColor:Color,
    fontSize:TextUnit,taskTitles:Map<String,String>,onOpenTaskReference:((String)->Unit)?){
    if(onOpenTaskReference==null || !aiTaskReferencePattern.containsMatchIn(text)){
        NativeAiInlineText(text,textColor,linkColor,fontSize)
        return
    }
    val lines=remember(text){text.split("\n")}
    Column(verticalArrangement=Arrangement.spacedBy(4.dp)){
        lines.forEach{line->
            val refs=aiTaskRefs(line)
            val prose=aiTaskReferencePattern.replace(line,"").trimEnd()
            if(prose.isNotEmpty())NativeAiInlineText(prose,textColor,linkColor,fontSize)
            else if(refs.isEmpty())Spacer(Modifier.height(fontSize.value.dp))
            if(refs.isNotEmpty()){
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
                    .padding(vertical=3.dp),
                    horizontalArrangement=Arrangement.spacedBy(7.dp)){
                    refs.forEach{ref->
                        val title=taskTitles[ref.id]
                        val light=textColor.red<.5f
                        val chipBg=if(light)Color.White else Color(0xFF1B4255)
                        val chipInk=if(light)Color(0xFF172238) else Color(0xFFE0F7FF)
                        val frame=CircleShape
                        Row(Modifier
                            .clip(frame)
                            .background(chipBg)
                            .border(1.dp,if(light)Color(0xFFDCE5EE)
                                else Color(0xFF35778C),frame)
                            .clickable(enabled=title!=null){onOpenTaskReference(ref.id)}
                            .padding(horizontal=11.dp,vertical=7.dp),
                            verticalAlignment=Alignment.CenterVertically,
                            horizontalArrangement=Arrangement.spacedBy(6.dp)){
                            Text("↗",fontSize=14.sp,color=chipInk,
                                fontWeight=FontWeight.Bold)
                            Text(title?:"Задача не найдена",fontSize=11.sp,
                                fontWeight=FontWeight.SemiBold,color=chipInk,
                                maxLines=1)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NativeAiInlineText(text:String,textColor:Color,linkColor:Color,
    fontSize:TextUnit=13.sp){
    val context=LocalContext.current
    val formatted=remember(text,linkColor){annotatedAiText(text,linkColor)}
    ClickableText(
        text=formatted,
        style=TextStyle(color=textColor,fontSize=fontSize,
            lineHeight=if(fontSize.value>=14f)22.sp else 20.sp),
        onClick={offset->
            val url=formatted.getStringAnnotations("URL",offset,offset)
                .firstOrNull()?.item?:return@ClickableText
            val uri=Uri.parse(url)
            if(uri.scheme=="http"||uri.scheme=="https")
                runCatching{context.startActivity(Intent(Intent.ACTION_VIEW,uri))}
        }
    )
}

/** Intentionally sober and compact, unlike the decorative MiniApp tables.
 * The outer horizontal scroll supports wide model-produced tables without
 * truncating their columns or taking over the whole message scroll.
 */
@Composable
private fun NativeAiTable(table:AiTextBlock.Table,textColor:Color,linkColor:Color,
    taskTitles:Map<String,String>,onOpenTaskReference:((String)->Unit)?){
    val frame=RoundedCornerShape(8.dp)
    val border=textColor.copy(alpha=.18f)
    val headerBg=textColor.copy(alpha=.075f)
    val count=table.headers.size
    Box(Modifier.fillMaxWidth().clip(frame)
        .border(1.dp,border,frame)
        .horizontalScroll(rememberScrollState())){
        Column{
            Row(Modifier.background(headerBg)){
                table.headers.forEachIndexed{index,value->
                    Box(Modifier.width(142.dp).heightIn(min=39.dp)
                        .then(if(index>0)Modifier.border(
                            width=.5.dp,color=border.copy(alpha=.5f))
                            else Modifier)
                        .padding(horizontal=9.dp,vertical=8.dp),
                        contentAlignment=Alignment.CenterStart){
                        if(onOpenTaskReference!=null &&
                            aiTaskReferencePattern.containsMatchIn(value)){
                            NativeAiProseWithTaskRefs(value,textColor,linkColor,11.sp,
                                taskTitles,onOpenTaskReference)
                        }else{
                            androidx.compose.material3.Text(
                                value,color=textColor,fontSize=11.sp,
                                fontWeight=FontWeight.SemiBold,lineHeight=15.sp)
                        }
                    }
                }
            }
            HorizontalDivider(color=border,thickness=1.dp)
            table.rows.forEachIndexed{rowIndex,row->
                Row(Modifier.background(if(rowIndex%2==0)
                    Color.Transparent else textColor.copy(alpha=.024f))){
                    repeat(count){col->
                        Box(Modifier.width(142.dp).heightIn(min=38.dp)
                            .padding(horizontal=9.dp,vertical=7.dp),
                            contentAlignment=Alignment.CenterStart){
                            NativeAiProseWithTaskRefs(row.getOrElse(col){""},
                                textColor,linkColor,12.sp,taskTitles,onOpenTaskReference)
                        }
                    }
                }
                if(rowIndex<table.rows.lastIndex)
                    HorizontalDivider(color=border.copy(alpha=.65f),
                        thickness=.6.dp)
            }
        }
    }
}
