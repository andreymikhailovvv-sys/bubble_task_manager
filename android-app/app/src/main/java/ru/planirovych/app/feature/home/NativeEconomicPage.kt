package ru.planirovych.app.feature.home

import android.content.Intent
import android.graphics.Bitmap
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.animation.core.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.MonetizationOn
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import okhttp3.Cookie
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import ru.planirovych.app.BuildConfig
import ru.planirovych.app.core.network.PersistentCookieJar

/**
 * The overview and all forms are rendered by the SAME financial module as
 * the website and Telegram mini app. Only first-party HTTPS can navigate.
 * Different WebView/native user sessions never mix without user approval.
 */
@Composable
fun NativeEconomicPage(userId:String?,dark:Boolean) {
    val context=LocalContext.current
    val gold=Color(0xFFF4A943)
    val origin=remember { BuildConfig.API_BASE_URL.toHttpUrlOrNull()
        ?.newBuilder()?.encodedPath("/")?.query(null)?.build() }
    var stage by remember(userId){mutableStateOf("loading")}
    var detail by remember(userId){mutableStateOf("")}
    var conflict by remember(userId){mutableStateOf(false)}
    var progress by remember(userId){mutableIntStateOf(0)}
    val browser=remember(userId){
        WebView(context).apply {
            settings.javaScriptEnabled=true
            settings.domStorageEnabled=true
            settings.allowFileAccess=false
            settings.allowContentAccess=false
            settings.setSupportMultipleWindows(false)
            settings.mixedContentMode=android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            isVerticalScrollBarEnabled=false
            setBackgroundColor(if(dark) android.graphics.Color.rgb(22,21,28) else android.graphics.Color.WHITE)
            webChromeClient=object:WebChromeClient(){
                override fun onProgressChanged(view:WebView?,newProgress:Int){ progress=newProgress }
            }
            webViewClient=object:WebViewClient(){
                override fun shouldOverrideUrlLoading(view:WebView?,request:WebResourceRequest):Boolean {
                    val target=request.url
                    val allowed=target.scheme=="https" &&
                        target.host.equals(origin?.host,ignoreCase=true) &&
                        target.path?.startsWith("/economic")==true
                    if(!allowed && request.isForMainFrame && target.scheme=="https"){
                        context.startActivity(Intent(Intent.ACTION_VIEW,target)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                    return !allowed
                }
                override fun onPageStarted(view:WebView?,url:String?,favicon:Bitmap?){
                    stage="loading"
                }
                override fun onPageFinished(view:WebView?,url:String?){
                    fun verify(attempt:Int){
                        // Verify actual financial content, NOT an optional mobile CSS
                        // class. The old check showed a false error *over* balances.
                        // The JS fallback also hides desktop chrome if an older
                        // website bundle is briefly served by the deployment.
                        val check = """
                            (function(){
                              var root=document.querySelector('.econ-root');
                              var main=document.querySelector('.econ-root .econ-main');
                              if(root && main && !root.classList.contains('econ-mobile-workspace')){
                                root.classList.add('econ-mobile-workspace');
                                if(!document.getElementById('android-economic-fallback')){
                                  var css=document.createElement('style');
                                  css.id='android-economic-fallback';
                                  css.textContent='.econ-mobile-workspace .module-rail,.econ-mobile-workspace .econ-nav,.econ-mobile-workspace .econ-mascot,.econ-mobile-workspace .econ-assistant{display:none!important}.econ-mobile-workspace .econ-shell{padding-left:0!important;display:block!important}.econ-mobile-workspace .econ-main{width:100%!important;max-width:100%!important}';
                                  document.head.appendChild(css);
                                }
                              }
                              return main ? 'ready' : 'waiting';
                            })();
                        """.trimIndent()
                        view?.evaluateJavascript(check){result->
                            if(result=="\"ready\"")stage="ready"
                            else if(attempt<50 && stage=="loading")
                                view.postDelayed({verify(attempt+1)},650)
                            else if(stage=="loading"){
                                stage="error"
                                detail="Страница финансов не завершила загрузку. Проверьте подключение и повторите."
                            }
                        }
                    }
                    view?.postDelayed({verify(0)},300)
                }
                override fun onReceivedError(view:WebView?,request:WebResourceRequest?,error:WebResourceError?){
                    if(request?.isForMainFrame==true){
                        stage="error";detail="Не удалось загрузить Экономыч AI. Проверьте интернет."
                    }
                }
            }
        }
    }
    DisposableEffect(browser){
        onDispose { browser.stopLoading();browser.webChromeClient=null;browser.destroy() }
    }
    fun webPairs(value:String)=value.split(';').mapNotNull{
        val part=it.trim();val idx=part.indexOf('=')
        if(idx>0)part.substring(0,idx) to part.substring(idx+1) else null
    }.filter{it.first=="btm_auth" || it.first=="btm_device"}
    fun syncSession(allowReplacement:Boolean){
        val host=origin
        if(host==null || host.scheme!="https"){
            stage="error";detail="Экономыч доступен только по HTTPS.";return
        }
        if(userId.isNullOrBlank()){
            stage="error";detail="Войдите в аккаунт Планировыча.";return
        }
        val cookies=PersistentCookieJar(context).loadForRequest(host)
            .filter{it.name=="btm_auth" || it.name=="btm_device"}
        if(cookies.isEmpty()){
            stage="error";detail="Не удалось получить сессию Android.";return
        }
        val manager=CookieManager.getInstance()
        val site=host.toString()
        manager.setAcceptCookie(true)
        manager.setAcceptThirdPartyCookies(browser,false)
        val previous=webPairs(manager.getCookie(site).orEmpty())
        val expected=cookies.map{it.name to it.value}
        if(!allowReplacement && previous.isNotEmpty() &&
            (previous.size!=expected.size || previous.toSet()!=expected.toSet())){
            conflict=true;stage="conflict";return
        }
        conflict=false;stage="loading"
        fun finish(){
            val current=webPairs(manager.getCookie(site).orEmpty())
            if(current.size!=expected.size || current.toSet()!=expected.toSet()){
                stage="error";detail="Не удалось синхронизировать сессию с Android.";return
            }
            manager.flush()
            browser.loadUrl(host.newBuilder().encodedPath("/economic")
                .addQueryParameter("mobile","1")
                .addQueryParameter("mobileTheme",if(dark)"dark" else "light")
                .build().toString())
        }
        fun install(index:Int){
            if(index==cookies.size){finish();return}
            manager.setCookie(site,cookies[index].toString()){browser.post{install(index+1)}}
        }
        val names=listOf("btm_auth","btm_device")
        fun remove(index:Int){
            if(index==names.size){install(0);return}
            manager.setCookie(site,names[index]+"=; Max-Age=0; Path=/"){
                browser.post{remove(index+1)}
            }
        }
        remove(0)
    }
    LaunchedEffect(userId,origin,browser,dark){
        browser.setBackgroundColor(if(dark) android.graphics.Color.rgb(22,21,28) else android.graphics.Color.WHITE)
        syncSession(false)
    }
    if(conflict){
        AlertDialog(
            onDismissRequest={conflict=false},
            title={Text("Другой аккаунт в веб-части")},
            text={Text("Веб-часть хранит сессию другого аккаунта. Она останется без изменений, пока вы явно не выберете аккаунт Android. Данные не объединяются.")},
            confirmButton={TextButton(onClick={syncSession(true)}){Text("Использовать Android")}},
            dismissButton={TextButton(onClick={conflict=false}){Text("Отмена")}},
            containerColor=if(dark)Color(0xFF29252B) else Color(0xFFFFF8F0)
        )
    }
    Box(Modifier.fillMaxSize()){
        AndroidView(factory={browser},modifier=Modifier.fillMaxSize())
        // The native FAB opens the existing React operation editor.
        if(stage=="ready"){
            FloatingActionButton(
                onClick={
                    browser.evaluateJavascript(
                        "document.querySelector('[data-economic-create-operation]')?.click();",null)
                },
                modifier=Modifier.align(Alignment.BottomEnd).padding(end=18.dp,bottom=18.dp),
                shape=CircleShape,
                containerColor=Color(0xFFF5A52E),
                contentColor=Color(0xFF2B1B08),
                elevation=FloatingActionButtonDefaults.elevation(defaultElevation=6.dp)
            ){
                Icon(Icons.Default.Add,"Новая операция",modifier=Modifier.size(27.dp))
            }
        }
        // An opaque shimmer, not a translucent spinner/error over actual
        // financial data. The overlay disappears only once real content exists.
        when(stage){
            "loading" -> EconomicSkeleton(dark)
            "ready" -> Unit
            else -> Column(
                modifier=Modifier.fillMaxSize()
                    .background(if(dark)Color(0xFF15151C) else Color(0xFFF7F8FA))
                    .padding(25.dp),
                verticalArrangement=Arrangement.Center,
                horizontalAlignment=Alignment.CenterHorizontally
            ){
                Icon(Icons.Default.MonetizationOn,null,tint=gold)
                Spacer(Modifier.height(12.dp))
                Text(if(stage=="conflict")"Аккаунты различаются" else detail,
                    color=if(dark)Color(0xFFF2D8B0) else Color(0xFF754A1A))
                if(stage!="conflict"){
                    Spacer(Modifier.height(12.dp))
                    TextButton(onClick={syncSession(false)}){
                        Icon(Icons.Default.Refresh,null)
                        Spacer(Modifier.width(6.dp))
                        Text("Повторить")
                    }
                }
            }
        }
    }
}

@Composable
private fun EconomicSkeleton(dark:Boolean){
    val animation=rememberInfiniteTransition(label="Economic cards preview")
    val shimmer by animation.animateFloat(
        initialValue=.45f,targetValue=.85f,
        animationSpec=infiniteRepeatable(tween(1150),RepeatMode.Reverse),
        label="Economic shimmer"
    )
    val background=if(dark)Color(0xFF15151C) else Color(0xFFF7F8FA)
    val panel=if(dark)Color(0xFF57412F) else Color(0xFFE6E8EC)
    @Composable fun preview(width:Modifier=Modifier,height:androidx.compose.ui.unit.Dp){
        Box(width.height(height).clip(RoundedCornerShape(17.dp))
            .background(panel.copy(alpha=shimmer)))
    }
    Column(Modifier.fillMaxSize().background(background).padding(15.dp),
        verticalArrangement=Arrangement.spacedBy(13.dp)){
        Spacer(Modifier.height(12.dp))
        preview(Modifier.fillMaxWidth(.63f),28.dp)
        preview(Modifier.fillMaxWidth(),142.dp)
        preview(Modifier.fillMaxWidth(),105.dp)
        Row(horizontalArrangement=Arrangement.spacedBy(11.dp)){
            preview(Modifier.weight(1f),99.dp)
            preview(Modifier.weight(1f),99.dp)
        }
        preview(Modifier.fillMaxWidth(),80.dp)
        preview(Modifier.fillMaxWidth(),80.dp)
    }
}
