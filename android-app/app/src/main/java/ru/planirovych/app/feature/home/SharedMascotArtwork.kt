package ru.planirovych.app.feature.home

import android.annotation.SuppressLint
import android.net.Uri
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.view.MotionEvent
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebResourceError
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.zIndex
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import org.json.JSONObject
import ru.planirovych.app.BuildConfig

/**
 * Render the same web artwork into a reusable software bitmap. A DOM-ready
 * marker or a visual-state callback is not proof that a transparent WebView
 * actually drew pixels, especially inside Compose / AlertDialog.
 */
private class MascotFrameView(context:android.content.Context,
    private val painted:(Boolean)->Unit):WebView(context) {
    private var frame:Bitmap?=null
    private var frameCanvas:Canvas?=null
    private var showing=false
    private var lastGoodAt=0L
    var pageReady=false
        private set
    var released=false
        private set
    private val retryDraw=Runnable{if(!released)invalidate()}

    init {
        // Never set alpha=0: Chromium may stop compositing invisible views.
        setBackgroundColor(Color.TRANSPARENT)
        setLayerType(View.LAYER_TYPE_SOFTWARE,null)
        isClickable=false
        isFocusable=false
        importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    }
    override fun onTouchEvent(event:MotionEvent?):Boolean=false

    fun setPageReady(ready:Boolean){
        if(released)return
        pageReady=ready
        if(!ready){lastGoodAt=0;publish(false)}
        invalidate()
    }
    private fun publish(value:Boolean){
        if(showing==value)return
        showing=value
        post { if(!released&&showing==value)painted(value) }
    }
    override fun onDraw(canvas:Canvas){
        if(released||!pageReady||width<=0||height<=0)return
        if(frame?.width!=width||frame?.height!=height){
            frame?.recycle()
            frame=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888)
            frameCanvas=Canvas(requireNotNull(frame))
        }
        val bitmap=frame ?: return
        bitmap.eraseColor(Color.TRANSPARENT)
        try{super.onDraw(requireNotNull(frameCanvas))}
        catch(_:RuntimeException){publish(false);return}
        // Verify actual alpha coverage, not HTML readiness. Some larger
        // outfits fill the corners; an opaque error/splash page still fails.
        if(hasMascotPixels(bitmap)){
            lastGoodAt=android.os.SystemClock.uptimeMillis()
            canvas.drawBitmap(bitmap,0f,0f,null)
            publish(true)
            removeCallbacks(retryDraw)
        }else{
            val elapsed=android.os.SystemClock.uptimeMillis()-lastGoodAt
            if(!showing||elapsed>=900L)publish(false)
            else {
                // Intentional arrival/disappearance animations may briefly
                // contain no pixels. Don't flash the fallback mid-animation.
                removeCallbacks(retryDraw)
                postDelayed(retryDraw,900L-elapsed)
            }
        }
    }
    private fun hasMascotPixels(bitmap:Bitmap):Boolean {
        val w=bitmap.width;val h=bitmap.height
        var visible=0
        var transparent=0
        // Sample the whole frame, including the edges, on an 11x11 grid.
        // Do not reject capes or helmets just because they touch corners.
        for(y in 0..10)for(x in 0..10){
            val alpha=Color.alpha(bitmap.getPixel((w-1)*x/10,(h-1)*y/10))
            if(alpha>100)visible++
            if(alpha<64)transparent++
        }
        return visible>=10 && transparent>=10
    }
    fun releaseArtwork(){
        released=true
        removeCallbacks(retryDraw)
        runCatching { stopLoading() }
        frame?.recycle();frame=null;frameCanvas=null
        destroy()
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun SharedMascotArtwork(skinId:String,dark:Boolean,mode:String,
    modifier:Modifier=Modifier){
    val latestMode by rememberUpdatedState(mode)
    var painted by remember(skinId,dark){mutableStateOf(false)}
    var rendererFailed by remember(skinId,dark){mutableStateOf(false)}
    Box(modifier){
        if(!painted||rendererFailed)NativeMascotFallback(dark,mode,skinId,Modifier.fillMaxSize().zIndex(1f))
        if(!rendererFailed)key(skinId,dark){
            AndroidView(
                modifier=Modifier.fillMaxSize(),
                factory={context->
                    val base=Uri.parse(BuildConfig.API_BASE_URL)
                    val address=base.buildUpon().path("/android-mascot").clearQuery()
                        .appendQueryParameter("skin",skinId)
                        .appendQueryParameter("theme",if(dark)"dark" else "light")
                        .appendQueryParameter("mode",mode).build()
                    MascotFrameView(context){painted=it}.apply {
                        settings.javaScriptEnabled=true
                        settings.allowFileAccess=false
                        settings.allowContentAccess=false
                        settings.javaScriptCanOpenWindowsAutomatically=false
                        settings.mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        webViewClient=object:WebViewClient(){
                            override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean =
                                request.url.scheme!="https" || request.url.host!=base.host ||
                                    request.url.encodedPath!="/android-mascot"
                            override fun onReceivedError(view:WebView,request:WebResourceRequest,error:WebResourceError){
                                if(request.isForMainFrame)setPageReady(false)
                            }
                            override fun onReceivedHttpError(view:WebView,request:WebResourceRequest,error:android.webkit.WebResourceResponse){
                                if(request.isForMainFrame)setPageReady(false)
                            }
                            override fun onRenderProcessGone(view:WebView,detail:android.webkit.RenderProcessGoneDetail):Boolean {
                                setPageReady(false)
                                rendererFailed=true
                                return true
                            }
                            override fun onPageFinished(view:WebView,url:String){
                                if(Uri.parse(url).encodedPath!="/android-mascot")return
                                fun probe(attempt:Int){
                                    if(released||attempt>=50)return
                                    view.evaluateJavascript("document.documentElement.dataset.androidMascotReady === 'true'"){value->
                                        if(released)return@evaluateJavascript
                                        if(value=="true"){
                                            view.evaluateJavascript(modeScript(latestMode),null)
                                            setPageReady(true)
                                        }else view.postDelayed({probe(attempt+1)},150)
                                    }
                                }
                                probe(0)
                            }
                        }
                        if(base.scheme=="https")loadUrl(address.toString())
                    }
                },
                onReset=null,
                onRelease={view->view.releaseArtwork()},
                update={view->
                    if(view.pageReady&&!view.released)view.evaluateJavascript(modeScript(mode),null)
                }
            )
        }
    }
}

private fun modeScript(mode:String):String =
    "window.dispatchEvent(new CustomEvent('planik-native-mode',{detail:"+JSONObject.quote(mode)+"}))"

@Composable
internal fun NativeMascotWardrobeDialog(vm:HomeViewModel,dark:Boolean,owner:String?,onClose:()->Unit){
    val state by vm.mascotWardrobe.collectAsStateWithLifecycle()
    val wardrobe=state?.takeIf{it.userId==owner}
    val scope=rememberCoroutineScope()
    var selected by remember(wardrobe?.userId){mutableStateOf(wardrobe?.plannerSkin(owner) ?: "classic")}
    var preview by remember(selected){mutableStateOf("idle")}
    var busy by remember{mutableStateOf(false)}
    var errorText by remember{mutableStateOf("")}
    val skin=wardrobe?.catalog?.firstOrNull{it.variant=="planner"&&it.id==selected}
    AlertDialog(onDismissRequest={if(!busy)onClose()},title={Text("Аксессуары и скины Планика")},
        text={
            Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
                Box(Modifier.fillMaxWidth().height(160.dp),contentAlignment=Alignment.Center){
                    if(selected=="classic") NativeMascotFallback(dark,preview,selected,Modifier.size(180.dp,150.dp))
                    else SharedMascotArtwork(selected,dark,preview,Modifier.size(180.dp,150.dp))
                }
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){
                    listOf("idle" to "Ожидание","hover" to "Приветствие","thinking" to "Думает").forEach{(mode,label)->
                        TextButton(onClick={preview=mode}){Text(label)}
                    }
                }
                if(wardrobe==null){
                    Text("Не удалось загрузить гардероб.")
                    TextButton(onClick={vm.refreshMascotWardrobe(owner)}){Text("Повторить")}
                }else LazyColumn(Modifier.heightIn(max=240.dp)){
                    items(wardrobe.catalog.filter{it.variant=="planner"}.sortedBy{it.rank},key={it.id}){item->
                        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
                            RadioButton(selected=selected==item.id,onClick={selected=item.id},enabled=!busy)
                            Column{
                                Text(item.name)
                                Text(when(item.rank){3->"Максимум";2->"Про";else->"Бесплатно"},style=MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
                skin?.let{Text(it.description,style=MaterialTheme.typography.bodySmall)}
                if(errorText.isNotBlank())Text(errorText,color=MaterialTheme.colorScheme.error)
            }
        },
        confirmButton={
            Button(enabled=!busy&&skin!=null&&skin.rank<=(wardrobe?.rank?:0),onClick={
                busy=true;errorText=""
                scope.launch{
                    try{vm.equipMascotSkin(selected);onClose()}
                    catch(e:kotlinx.coroutines.CancellationException){throw e}
                    catch(e:Exception){errorText=e.localizedMessage ?: "Не удалось применить образ"}
                    finally{busy=false}
                }
            }){Text("Применить")}
        },
        dismissButton={TextButton(enabled=!busy,onClick=onClose){Text("Закрыть")}}
    )
}
