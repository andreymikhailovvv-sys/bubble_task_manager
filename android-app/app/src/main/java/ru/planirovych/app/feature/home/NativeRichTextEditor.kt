package ru.planirovych.app.feature.home

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.content.Context
import android.util.Base64
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import org.json.JSONObject

/**
 * Editor with an explicit ready handshake. The initial HTML is embedded into
 * the local page as UTF-8 base64, so existing content does NOT depend on
 * WebViewClient.onPageFinished timing. Never emit an empty change on startup.
 */
private class RichHtmlWebView(context: Context):WebView(context){
    var initialized=false
    var applied:String?=null
    var lastEdited:String?=null
    var pending:String=""
    var onEdited:(String)->Unit={}
    var onReady:()->Unit={}
    var onFailure:(String)->Unit={}
    fun setHtml(html:String){
        pending=html
        if(initialized && html!=applied && html!=lastEdited){
            applied=html
            evaluateJavascript("window.setEditorContent("+JSONObject.quote(html)+");",null)
        }
    }
    fun finishLoading(initial:String){
        initialized=true
        applied=initial
        setHtml(pending)
        onReady()
    }
    fun changed(html:String){
        if(!initialized)return // JS initialization must never erase source content.
        lastEdited=html
        onEdited(html)
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun NativeRichTextEditor(
    value: String,
    onChange: (String) -> Unit,
    dark: Boolean,
    modifier: Modifier = Modifier,
    editorKey: String = "description"
) {
    val latestChange = rememberUpdatedState(onChange)
    var loaded by remember(editorKey,dark){mutableStateOf(false)}
    var timedOut by remember(editorKey,dark){mutableStateOf(false)}
    LaunchedEffect(editorKey,dark,loaded){
        if(!loaded){
            delay(2500)
            if(!loaded)timedOut=true
        }
    }
    key(editorKey,dark) {
        Box(modifier){
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    RichHtmlWebView(context).apply {
                        setBackgroundColor(android.graphics.Color.TRANSPARENT)
                        isVerticalScrollBarEnabled = false
                        settings.javaScriptEnabled = true
                        settings.allowFileAccess = false
                        settings.allowContentAccess = false
                        settings.blockNetworkLoads = true
                        settings.domStorageEnabled = false
                        settings.setSupportMultipleWindows(false)
                        pending=value
                        onEdited={latestChange.value(it)}
                        onReady={loaded=true;timedOut=false}
                        onFailure={message ->
                            android.util.Log.e("NativeRichEditor","Editor initialization: "+message)
                            timedOut=true
                        }
                        val web=this
                        addJavascriptInterface(object {
                            @JavascriptInterface
                            fun ready() {
                                web.post { web.finishLoading(value) }
                            }
                            @JavascriptInterface
                            fun changed(html: String) {
                                web.post { web.changed(html) }
                            }
                            @JavascriptInterface
                            fun loadFailed(message:String) {
                                web.post { web.onFailure(message) }
                            }
                        }, "NativeEditor")
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(
                                view: WebView, request: android.webkit.WebResourceRequest
                            ): Boolean = true
                        }
                        loadDataWithBaseURL(
                            "https://appassets.androidplatform.net/native-rich-editor/",
                            editorHtml(dark,value), "text/html", "UTF-8", null)
                    }
                },
                update = { view ->
                    view.onEdited={latestChange.value(it)}
                    view.onReady={loaded=true;timedOut=false}
                    view.setHtml(value)
                },
                onRelease = { view ->
                    view.removeJavascriptInterface("NativeEditor")
                    view.stopLoading()
                    view.destroy()
                }
            )
            if(!loaded){
                Surface(Modifier.fillMaxSize(),color=if(dark)Color(0xFF18243A) else Color.White){
                    Column(Modifier.fillMaxSize().padding(16.dp),
                        verticalArrangement=Arrangement.spacedBy(10.dp)){
                        if(!timedOut){
                            CircularProgressIndicator()
                            Text("Открываем редактор…",
                                color=if(dark)Color.White else Color(0xFF172238))
                        }else {
                            Text("Не удалось загрузить редактор. Исходный текст сохранён.",
                                color=if(dark)Color(0xFFF1F5F9) else Color(0xFF172238))
                        }
                        // Readable fallback instead of an empty white rectangle.
                        val original=android.text.Html.fromHtml(value,
                            android.text.Html.FROM_HTML_MODE_COMPACT).toString()
                        Text(original,maxLines=15,overflow=TextOverflow.Ellipsis,
                            color=if(dark)Color(0xFFE2E8F0) else Color(0xFF334155))
                    }
                }
            }
        }
    }
}

private fun editorHtml(dark: Boolean, initialValue:String): String {
    val initial=Base64.encodeToString(initialValue.toByteArray(Charsets.UTF_8),Base64.NO_WRAP)
    val bg = if (dark) "#18243a" else "#ffffff"
    val text = if (dark) "#f1f5f9" else "#172238"
    val muted = if (dark) "#a5b4ca" else "#64748b"
    val line = if (dark) "#45536d" else "#d8e2ef"
    val toolbar = if (dark) "#202c43" else "#f8f8ff"
    val accent = if (dark) "#c4b5fd" else "#6d28d9"
    return """
<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
*{box-sizing:border-box} html,body{width:100%;height:100%;margin:0;overflow:hidden}
body{display:flex;flex-direction:column;background:$bg;color:$text;
  font-family:Roboto,"Arial",sans-serif;font-size:15px}
#tools{flex:none;display:flex;gap:6px;overflow-x:auto;align-items:center;
  padding:10px 9px;background:$toolbar;border-bottom:1px solid $line;
  scrollbar-width:none}#tools::-webkit-scrollbar{display:none}
button{min-width:37px;height:37px;flex:0 0 auto;display:grid;place-items:center;
  padding:0 9px;border-radius:19px;border:1px solid $line;
  background:$bg;color:$text;font:600 13px Roboto,Arial,sans-serif}
button:active,button:focus{border-color:$accent;color:$accent;outline:none}
#hint{flex:none;color:$muted;font-size:11px;padding:9px 13px 5px;line-height:1.4}
#edit{flex:1;min-height:0;overflow-y:auto;padding:12px 14px 32px;
  line-height:1.6;font-size:15px;outline:0;word-break:break-word;
  -webkit-user-select:text;user-select:text;white-space:normal}
#edit:empty:before{content:"Пишите заметки, детали задачи, ссылки и план действий…";
  color:$muted;pointer-events:none}
#edit h1{font-size:1.65em;line-height:1.25;margin:13px 0 8px;font-weight:700}
#edit h2{font-size:1.3em;line-height:1.3;margin:10px 0 7px;font-weight:700}
#edit p,#edit div{margin:0 0 7px}
#edit ul,#edit ol{padding-left:25px;margin:8px 0}
#edit li{padding:2px 0}#edit a{color:$accent;text-decoration:underline}
#edit .note-checklist{margin:9px 0}
#edit .note-checkbox-item{display:flex;gap:8px;align-items:flex-start;margin:5px 0}
#edit .note-checkbox-item input{flex:none;margin-top:5px;accent-color:$accent}
#edit .note-checkbox-item span{flex:1;min-width:0}
#edit .note-checkbox-item-checked span{text-decoration:line-through;color:$muted}
</style></head><body>
<div id="tools" role="toolbar" aria-label="Форматирование текста">
<button data-cmd="plain" title="Обычный текст">T</button>
<button data-cmd="h1" title="Заголовок 1">H1</button>
<button data-cmd="h2" title="Заголовок 2">H2</button>
<button data-cmd="bold" title="Жирный"><b>B</b></button>
<button data-cmd="italic" title="Курсив"><i>I</i></button>
<button data-cmd="underline" title="Подчёркнутый"><u>U</u></button>
<button data-cmd="strikeThrough" title="Зачёркнутый"><s>S</s></button>
<button data-cmd="unordered" title="Маркированный список">• ☰</button>
<button data-cmd="ordered" title="Нумерованный список">1. ☰</button>
<button data-cmd="checklist" title="Чекбоксы">☑</button>
</div>
<div id="hint">Выделите текст для форматирования или добавьте список/чекбоксы в позиции курсора.</div>
<div id="edit" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true"></div>
<script>
(function(){
'use strict';
const edit=document.getElementById('edit');
const allowed=new Set(['A','B','STRONG','I','EM','U','S','DEL','H1','H2','P',
  'DIV','BR','UL','OL','LI','LABEL','INPUT','SPAN']);
const classes=new Set(['note-list','note-list-ordered','note-list-unordered',
  'note-checklist','note-checkbox-item','note-checkbox-item-checked']);
const discard=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','TEMPLATE',
  'IMG','VIDEO','AUDIO','FORM','META','BASE','LINK']);
function cleanNode(node){
  if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent||'');
  if(node.nodeType!==Node.ELEMENT_NODE)return document.createDocumentFragment();
  const tag=node.tagName;
  if(discard.has(tag))return document.createDocumentFragment();
  const output=allowed.has(tag)?document.createElement(tag.toLowerCase()):
    document.createDocumentFragment();
  if(output.nodeType===Node.ELEMENT_NODE){
    if(tag==='INPUT'){
      if(node.getAttribute('type')!=='checkbox')return document.createDocumentFragment();
      output.setAttribute('type','checkbox');
      if(node.checked||node.hasAttribute('checked'))output.setAttribute('checked','');
    }
    if(tag==='A'){
      const href=(node.getAttribute('href')||'').trim();
      if(/^https?:\/\/[^\s]+$/i.test(href)){
        output.setAttribute('href',href);
        output.setAttribute('rel','noopener noreferrer');
        output.setAttribute('target','_blank');
      }
    }
    const safe=(node.getAttribute('class')||'').split(/\s+/)
      .filter(c=>classes.has(c));
    if(safe.length)output.setAttribute('class',safe.join(' '));
  }
  if(tag!=='INPUT')Array.from(node.childNodes).forEach(n=>output.appendChild(cleanNode(n)));
  return output;
}
function sanitize(raw){
  const parsed=new DOMParser().parseFromString('<div>'+raw+'</div>','text/html');
  const wrap=document.createElement('div');
  const source=parsed.body.firstElementChild||parsed.body;
  Array.from(source.childNodes).forEach(n=>wrap.appendChild(cleanNode(n)));
  return wrap.innerHTML;
}
function escapePlain(raw){
  const wrap=document.createElement('div');
  const parts=raw.split(/\r?\n/);
  parts.forEach((p,i)=>{if(i)wrap.appendChild(document.createElement('br'));
    wrap.appendChild(document.createTextNode(p));});
  return wrap.innerHTML;
}
window.setEditorContent=function(raw){
  const hasHtml=/<(?:a|b|strong|i|em|u|s|del|h1|h2|p|div|br|ul|ol|li|label|input|span)(?:\s[^>]*)?>/i.test(raw);
  edit.innerHTML=sanitize(hasHtml?raw:escapePlain(raw));
};
function report(){try{NativeEditor.changed(sanitize(edit.innerHTML));}catch(_e){}}
let savedRange=null;
document.addEventListener('selectionchange',()=>{
  const selection=window.getSelection();
  if(selection&&selection.rangeCount&&edit.contains(selection.anchorNode))
    savedRange=selection.getRangeAt(0).cloneRange();
});
function restore(){
  edit.focus();
  const selection=window.getSelection();
  if(savedRange&&edit.contains(savedRange.commonAncestorContainer)){
    selection.removeAllRanges();selection.addRange(savedRange);
  }
}
function caret(node){
  const sel=window.getSelection(),range=document.createRange();
  range.selectNodeContents(node);range.collapse(false);
  sel.removeAllRanges();sel.addRange(range);savedRange=range.cloneRange();
}
function checklist(){
  restore();
  const sel=window.getSelection();if(!sel.rangeCount)return;
  const range=sel.getRangeAt(0);
  const text=range.toString()||'';
  const lines=text.split(/\r?\n/).filter(Boolean);
  if(!lines.length)lines.push('');
  const box=document.createElement('div');box.className='note-checklist';
  lines.forEach(line=>{
    const item=document.createElement('div');item.className='note-checkbox-item';
    const input=document.createElement('input');input.type='checkbox';
    const span=document.createElement('span');span.textContent=line||' ';
    item.append(input,span);box.appendChild(item);
  });
  range.deleteContents();range.insertNode(box);caret(box.lastElementChild.lastElementChild);
  report();
}
document.querySelectorAll('[data-cmd]').forEach(btn=>{
  btn.addEventListener('touchstart',e=>e.preventDefault(),{passive:false});
  btn.addEventListener('mousedown',e=>e.preventDefault());
  btn.addEventListener('click',()=>{
    const cmd=btn.getAttribute('data-cmd');
    if(cmd==='checklist'){checklist();return;}
    restore();
    if(cmd==='plain'){
      document.execCommand('removeFormat',false,null);
      document.execCommand('formatBlock',false,'div');
    }else if(cmd==='h1'||cmd==='h2'){
      document.execCommand('formatBlock',false,cmd);
    }else{
      const commands={unordered:'insertUnorderedList',ordered:'insertOrderedList'};
      document.execCommand(commands[cmd]||cmd,false,null);
    }
    report();
  });
});
edit.addEventListener('paste',event=>{
  event.preventDefault();
  document.execCommand('insertText',false,
    (event.clipboardData&&event.clipboardData.getData('text/plain'))||'');
});
edit.addEventListener('click',event=>{
  if(event.target.tagName==='A')event.preventDefault();
  if(event.target.matches('input[type=checkbox]')){
    const item=event.target.closest('.note-checkbox-item');
    if(item)item.classList.toggle('note-checkbox-item-checked',event.target.checked);
    setTimeout(report,0);
  }
});
edit.addEventListener('keydown',event=>{
  if(event.key!=='Enter')return;
  const sel=window.getSelection();
  if(!sel.rangeCount)return;
  const item=sel.anchorNode.parentElement?.closest('.note-checkbox-item');
  if(!item)return;
  event.preventDefault();
  const next=document.createElement('div');next.className='note-checkbox-item';
  const checkbox=document.createElement('input');checkbox.type='checkbox';
  const text=document.createElement('span');text.append(document.createElement('br'));
  next.append(checkbox,text);item.after(next);caret(text);report();
});
edit.addEventListener('input',report);
try {
  const bytes=Uint8Array.from(atob("$initial"),c=>c.charCodeAt(0));
  window.setEditorContent(new TextDecoder('utf-8').decode(bytes));
  NativeEditor.ready();
} catch(error) {
  try{NativeEditor.loadFailed(String(error));}catch(_ignored){}
}
})();
</script></body></html>
""".trimIndent()
}

/** Full-size formatting sheet shared by task, subtask and creation editors. */
@Composable
internal fun NativeRichDescriptionDialog(
    title: String,
    value: String,
    dark: Boolean,
    editorKey: String,
    onChange: (String) -> Unit,
    onClose: () -> Unit
) {
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
                NativeRichTextEditor(
                    value=value,onChange=onChange,dark=dark,
                    editorKey=editorKey,modifier=Modifier.fillMaxSize()
                )
            }
        }
    }
}
