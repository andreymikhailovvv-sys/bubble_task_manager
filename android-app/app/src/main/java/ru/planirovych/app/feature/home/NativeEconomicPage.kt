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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.AccountBalanceWallet
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
            setBackgroundColor(android.graphics.Color.rgb(22,21,28))
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
                        view?.evaluateJavascript(
                            "(function(){return !!document.querySelector('.econ-mobile-workspace .econ-main');})()"
                        ){ result->
                            if(result=="true")stage="ready"
                            else if(attempt<12 && stage=="loading")view?.postDelayed({verify(attempt+1)},650)
                            else if(stage=="loading"){
                                stage="error"
                                detail="Не удалось открыть финансовый обзор. Проверьте авторизацию и обновите страницу."
                            }
                        }
                    }
                    view?.postDelayed({verify(0)},450)
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
                .addQueryParameter("mobile","1").build().toString())
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
    LaunchedEffect(userId,origin,browser){syncSession(false)}
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
        if(stage!="ready"){
            Column(modifier=Modifier.fillMaxSize(),
                verticalArrangement=Arrangement.Center,
                horizontalAlignment=Alignment.CenterHorizontally){
                if(stage=="loading"){
                    CircularProgressIndicator(color=gold)
                    Spacer(Modifier.height(12.dp))
                    Text("Загружаем Экономыч AI…",
                        color=if(dark)Color(0xFFF2D8B0) else Color(0xFF754A1A))
                    if(progress in 1..99)LinearProgressIndicator(
                        progress={progress/100f},
                        modifier=Modifier.width(180.dp).padding(top=12.dp),
                        color=gold
                    )
                } else {
                    Icon(Icons.Default.AccountBalanceWallet,null,tint=gold)
                    Spacer(Modifier.height(10.dp))
                    Text(if(stage=="conflict")"Аккаунты различаются" else detail,
                        color=if(dark)Color(0xFFF2D8B0) else Color(0xFF754A1A))
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
