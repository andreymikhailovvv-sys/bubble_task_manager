package ru.planirovych.app.feature.home

import android.content.Context
import android.graphics.Typeface
import android.text.Editable
import android.text.Html
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.TextWatcher
import android.text.Annotation
import android.text.style.BulletSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
import android.text.style.UnderlineSpan
import android.text.style.URLSpan
import android.view.Gravity
import android.view.ViewGroup
import android.widget.EditText
import androidx.compose.foundation.*
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/**
 * Native rich editor deliberately avoids Android WebView.
 * A previous WebView implementation could show an entirely blank editing surface
 * on devices where its local HTML/JavaScript failed to render. This is a regular
 * Android EditText, so the initial content and formatting are always visible.
 *
 * Never dispatch an onChange during initial hydration. Unmodified HTML is
 * submitted exactly as it arrived from the server, including existing complex
 * HTML markup and checklist metadata.
 */
private class RichNativeEditText(context:Context):EditText(context) {
    var onHtmlEdited:(String)->Unit={}
    var hydrated=false
    var dirty=false
    var sentHtml:String?=null
    private var internalChange=false

    init {
        setSingleLine(false)
        gravity=Gravity.TOP or Gravity.START
        setPadding(15.dpPx(),13.dpPx(),15.dpPx(),18.dpPx())
        setBackgroundColor(android.graphics.Color.TRANSPARENT)
        textSize=15f
        setLineSpacing(4.dpPx().toFloat(),1f)
        isVerticalScrollBarEnabled=true
        isFocusable=true
        isFocusableInTouchMode=true
        addTextChangedListener(object:TextWatcher {
            override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){}
            override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){}
            override fun afterTextChanged(s:Editable?) {
                if(!internalChange&&hydrated)notifyContentChanged()
            }
        })
    }
    private fun Int.dpPx():Int=(this*resources.displayMetrics.density).toInt()

    fun hydrate(html:String) {
        if(hydrated)return
        internalChange=true
        try {
            val value=prepareEditorHtml(html)
            val spanned=Html.fromHtml(value,Html.FROM_HTML_MODE_COMPACT)
            val content=SpannableStringBuilder(spanned)
            // Android's HTML reader adds terminal newlines for block elements.
            while(content.isNotEmpty()&&content.last()=='\n')
                content.delete(content.length-1,content.length)
            setText(content)
            setSelection(0)
            hydrated=true
            dirty=false
            sentHtml=html
        } finally { internalChange=false }
    }

    fun notifyContentChanged(){
        if(!hydrated)return
        dirty=true
        val html=serializeRichText(text ?: return)
        sentHtml=html
        onHtmlEdited(html)
    }

    fun format(command:String) {
        val content=text ?: return
        if(!hydrated)return
        val start=minOf(selectionStart,selectionEnd).coerceIn(0,content.length)
        val end=maxOf(selectionStart,selectionEnd).coerceIn(0,content.length)
        val flags=Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
        when(command) {
            "bold","italic","underline","strike" -> {
                if(start==end)return // Same selection semantics as Mini App.
                val span=when(command){
                    "bold"->StyleSpan(Typeface.BOLD)
                    "italic"->StyleSpan(Typeface.ITALIC)
                    "underline"->UnderlineSpan()
                    else->StrikethroughSpan()
                }
                content.setSpan(span,start,end,flags)
            }
            "h1","h2","plain" -> {
                val from=content.lastIndexOf('\n',(start-1).coerceAtLeast(0))
                    .let{if(it<0)0 else it+1}
                val next=content.indexOf('\n',end).let{if(it<0)content.length else it}
                if(from>=next)return
                content.getSpans(from,next,Annotation::class.java).forEach{
                    if(it.key=="planirovych-heading")content.removeSpan(it)
                }
                content.getSpans(from,next,RelativeSizeSpan::class.java).forEach{
                    content.removeSpan(it)
                }
                if(command!="plain"){
                    content.setSpan(Annotation("planirovych-heading",command),from,next,flags)
                    content.setSpan(RelativeSizeSpan(if(command=="h1")1.65f else 1.32f),from,next,flags)
                    content.setSpan(StyleSpan(Typeface.BOLD),from,next,flags)
                }
            }
            "bullets","numbers","checks" -> {
                val from=content.lastIndexOf('\n',(start-1).coerceAtLeast(0))
                    .let{if(it<0)0 else it+1}
                val next=content.indexOf('\n',end).let{if(it<0)content.length else it}
                val selected=content.subSequence(from,next).toString()
                val converted=selected.split('\n').mapIndexed{index,line->
                    val stripped=line.replace(Regex("""^(?:[•☐☑]\s*|\d+\.\s*)"""),"")
                    when(command){
                        "bullets"->"• "+stripped
                        "numbers"->(index+1).toString()+". "+stripped
                        else->"☐ "+stripped
                    }
                }.joinToString("\n")
                content.replace(from,next,converted)
                setSelection((from+converted.length).coerceAtMost(content.length))
            }
        }
        notifyContentChanged()
    }
}

private val richHtmlPattern=Regex(
    """<(?:a|b|strong|i|em|u|s|del|h1|h2|p|div|br|ul|ol|li|label|input|span)(?:\s[^>]*)?>""",
    RegexOption.IGNORE_CASE
)
private fun prepareEditorHtml(raw:String):String {
    if(!richHtmlPattern.containsMatchIn(raw))
        return Html.escapeHtml(raw).replace("\n","<br>")
    // Android's Html reader does not display HTML checkbox inputs. Show them
    // as editable glyphs; preserve the untouched original HTML on save.
    return Regex("""<input\b([^>]*)>""",RegexOption.IGNORE_CASE)
        .replace(raw){match->
            if(Regex("""\bchecked(?:\b|=)""",RegexOption.IGNORE_CASE)
                    .containsMatchIn(match.groupValues[1]))"☑ " else "☐ "
        }
}

private fun escapeRichText(text:String):String=buildString {
    text.forEach { c ->
        append(when(c) {
            '&'->"&amp;"
            '<'->"&lt;"
            '>'->"&gt;"
            '"'->"&quot;"
            else->c.toString()
        })
    }
}

/** Serialize spans to the same safe HTML vocabulary used by Mini App. */
private fun serializeRichText(content:Editable):String {
    if(content.isEmpty())return ""
    val source=content.toString()
    fun inlineHtml(from:Int,to:Int):String=buildString {
        var pos=from
        while(pos<to){
            val next=content.nextSpanTransition(pos,to,android.text.style.CharacterStyle::class.java)
                .coerceAtLeast(pos+1)
            val range=content.getSpans(pos,next,android.text.style.CharacterStyle::class.java)
                .filter{content.getSpanStart(it)<=pos&&content.getSpanEnd(it)>=next}
            val bold=range.filterIsInstance<StyleSpan>()
                .any{it.style==Typeface.BOLD||it.style==Typeface.BOLD_ITALIC}
            val italic=range.filterIsInstance<StyleSpan>()
                .any{it.style==Typeface.ITALIC||it.style==Typeface.BOLD_ITALIC}
            val underline=range.any{it is UnderlineSpan}
            val strike=range.any{it is StrikethroughSpan}
            val url=range.filterIsInstance<URLSpan>().firstOrNull()
                ?.url?.takeIf{it.startsWith("https://")||it.startsWith("http://")}
            if(url!=null)append("<a href=\""+escapeRichText(url)+"\">")
            if(bold)append("<strong>")
            if(italic)append("<em>")
            if(underline)append("<u>")
            if(strike)append("<s>")
            append(escapeRichText(source.substring(pos,next)))
            if(strike)append("</s>")
            if(underline)append("</u>")
            if(italic)append("</em>")
            if(bold)append("</strong>")
            if(url!=null)append("</a>")
            pos=next
        }
    }
    val result=StringBuilder()
    var start=0
    while(start<source.length){
        val end=source.indexOf('\n',start).let{if(it<0)source.length else it}
        var bodyStart=start
        val line=source.substring(start,end)
        val listType=when {
            line.startsWith("• ")->"unordered"
            Regex("""^\d+\.\s""").containsMatchIn(line)->"ordered"
            line.startsWith("☐ ")||line.startsWith("☑ ")->"checks"
            content.getSpans(start,end,BulletSpan::class.java).isNotEmpty()->"unordered"
            else->null
        }
        if(listType=="unordered"&&line.startsWith("• "))bodyStart+=2
        if(listType=="checks")bodyStart+=2
        if(listType=="ordered")
            bodyStart+=Regex("""^\d+\.\s""").find(line)?.value?.length?:0
        val heading=content.getSpans(start,end,Annotation::class.java)
            .firstOrNull{it.key=="planirovych-heading"}?.value
            ?:content.getSpans(start,end,RelativeSizeSpan::class.java)
                .maxByOrNull{it.sizeChange}?.let{
                    if(it.sizeChange>=1.5f)"h1" else if(it.sizeChange>=1.2f)"h2" else null
                }
        val text=inlineHtml(bodyStart.coerceAtMost(end),end)
        when(listType) {
            "unordered"->result.append("<ul class=\"note-list note-list-unordered\"><li>")
                .append(text).append("</li></ul>")
            "ordered"->result.append("<ol class=\"note-list note-list-ordered\"><li>")
                .append(text).append("</li></ol>")
            "checks"->{
                val checked=line.startsWith("☑ ")
                result.append("<div class=\"note-checklist\"><div class=\"note-checkbox-item")
                if(checked)result.append(" note-checkbox-item-checked")
                result.append("\"><input type=\"checkbox\"")
                if(checked)result.append(" checked")
                result.append("><span>").append(text).append("</span></div></div>")
            }
            else->{
                val tag=if(heading=="h1")"h1" else if(heading=="h2")"h2" else "div"
                result.append("<").append(tag).append(">")
                    .append(if(text.isEmpty())"<br>" else text)
                    .append("</").append(tag).append(">")
            }
        }
        if(end==source.length)break
        start=end+1
    }
    return result.toString()
}

@Composable
internal fun NativeRichTextEditor(
    value:String,
    onChange:(String)->Unit,
    dark:Boolean,
    modifier:Modifier=Modifier,
    editorKey:String="description"
) {
    val latestChange by rememberUpdatedState(onChange)
    val state=remember(editorKey,dark){mutableStateOf<RichNativeEditText?>(null)}
    val ink=if(dark)Color(0xFFF1F5F9) else Color(0xFF172238)
    val border=if(dark)Color(0xFF45536D) else Color(0xFFD8E2EF)
    val surface=if(dark)Color(0xFF202C43) else Color(0xFFF8F8FF)
    Column(modifier){
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
            .background(surface).padding(horizontal=8.dp,vertical=8.dp),
            horizontalArrangement=Arrangement.spacedBy(5.dp)){
            val actions=listOf(
                Triple("T","plain","Обычный текст"),
                Triple("H1","h1","Заголовок 1"),
                Triple("H2","h2","Заголовок 2"),
                Triple("B","bold","Жирный"),
                Triple("I","italic","Курсив"),
                Triple("U","underline","Подчёркнутый"),
                Triple("S","strike","Зачёркнутый"),
                Triple("• ☰","bullets","Список точками"),
                Triple("1. ☰","numbers","Нумерованный список"),
                Triple("☑","checks","Чекбоксы")
            )
            actions.forEach{(label,command,description)->
                Surface(
                    shape=RoundedCornerShape(18.dp),
                    color=if(dark)Color(0xFF18243A) else Color.White,
                    border=BorderStroke(1.dp,border)
                ){
                    Box(Modifier.defaultMinSize(minWidth=36.dp)
                        .height(35.dp)
                        .clickable { state.value?.format(command) }
                        .padding(horizontal=9.dp),
                        contentAlignment=androidx.compose.ui.Alignment.Center){
                        Text(label,color=ink,fontSize=13.sp,
                            fontWeight=FontWeight.SemiBold,maxLines=1)
                    }
                }
            }
        }
        HorizontalDivider(color=border)
        Text("Выделите текст для форматирования или добавьте список в позиции курсора.",
            color=if(dark)Color(0xFFA5B4CA) else Color(0xFF64748B),
            fontSize=11.sp,modifier=Modifier.padding(start=12.dp,end=12.dp,top=8.dp,bottom=4.dp))
        AndroidView(modifier=Modifier.fillMaxWidth().weight(1f),
            factory={ctx->
                RichNativeEditText(ctx).apply {
                    setTextColor(if(dark)android.graphics.Color.rgb(241,245,249)
                        else android.graphics.Color.rgb(23,34,56))
                    setHintTextColor(if(dark)android.graphics.Color.rgb(165,180,202)
                        else android.graphics.Color.rgb(100,116,139))
                    hint="Пишите заметки, детали задачи, ссылки и план действий…"
                    layoutParams=ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT)
                    onHtmlEdited={latestChange(it)}
                    hydrate(value)
                    state.value=this
                }
            },
            update={view->
                view.onHtmlEdited={latestChange(it)}
                // Do not replace a user's draft when Compose recomposes.
                // Also do not overwrite old rich HTML until an actual user edit.
                if(!view.hydrated)view.hydrate(value)
            },
            onRelease={view->if(state.value===view)state.value=null}
        )
    }
}

/** Shared task/subtask full-screen native formatting sheet. */
@Composable
internal fun NativeRichDescriptionDialog(
    title:String,value:String,dark:Boolean,editorKey:String,
    onChange:(String)->Unit,onClose:()->Unit
){
    val bg=if(dark)Color(0xFF18243A) else Color.White
    val ink=if(dark)Color(0xFFF1F5F9) else Color(0xFF172238)
    Dialog(onDismissRequest=onClose,
        properties=DialogProperties(usePlatformDefaultWidth=false)){
        Surface(Modifier.fillMaxSize().imePadding()
            .padding(horizontal=9.dp,vertical=25.dp),
            shape=RoundedCornerShape(22.dp),color=bg){
            Column(Modifier.fillMaxSize()){
                Row(Modifier.fillMaxWidth().padding(start=17.dp,end=10.dp,top=9.dp,bottom=8.dp),
                    verticalAlignment=androidx.compose.ui.Alignment.CenterVertically){
                    Text(title,Modifier.weight(1f),fontSize=17.sp,
                        fontWeight=FontWeight.Bold,color=ink)
                    TextButton(onClick=onClose){Text("Готово")}
                    IconButton(onClick=onClose){
                        Icon(Icons.Default.Close,"Закрыть",tint=ink)
                    }
                }
                NativeRichTextEditor(value=value,onChange=onChange,
                    dark=dark,editorKey=editorKey,
                    modifier=Modifier.fillMaxSize())
            }
        }
    }
}
