package ru.planirovych.app.feature.home

import android.app.DownloadManager
import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.widget.Toast
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.Image as ImageIcon
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

/** Same visual language as the web/Mini App generating_image illustration. */
@Composable
internal fun NativeAiImageGeneratingCard(){
    val transition=rememberInfiniteTransition(label="image-creation-motion")
    val motion by transition.animateFloat(0f,1f,
        infiniteRepeatable(tween(5200,easing=FastOutSlowInEasing),RepeatMode.Reverse),
        label="image-orbs")
    Box(Modifier.fillMaxWidth().padding(top=7.dp)
        .aspectRatio(1.08f).clip(RoundedCornerShape(25.dp))
        .border(1.dp,Color(0xFF9682EA).copy(alpha=.65f),RoundedCornerShape(25.dp))){
        Canvas(Modifier.fillMaxSize()){
            drawRect(Brush.linearGradient(listOf(
                Color(0xFF192952),Color(0xFF6031A3),Color(0xFF0B556F))))
            val x=size.width;val y=size.height
            drawRoundRect(
                brush=Brush.linearGradient(listOf(Color(0xFF328BD4),Color(0xFF9675EA))),
                topLeft=Offset(-x*.04f+motion*x*.06f,y*.12f),
                size=androidx.compose.ui.geometry.Size(x*.58f,y*.54f),
                cornerRadius=CornerRadius(x*.18f,x*.18f),alpha=.82f
            )
            drawRoundRect(
                brush=Brush.linearGradient(listOf(Color(0xFF13B3E7),Color(0xFF4E7BCE))),
                topLeft=Offset(x*.48f-motion*x*.045f,y*.43f),
                size=androidx.compose.ui.geometry.Size(x*.65f,y*.57f),
                cornerRadius=CornerRadius(x*.22f,x*.22f),alpha=.82f
            )
            val spacing=25.dp.toPx()
            var py=spacing
            while(py<y){
                var px=spacing
                while(px<x){
                    drawCircle(Color.White.copy(alpha=.23f),1.dp.toPx(),Offset(px,py))
                    px+=spacing
                }
                py+=spacing
            }
        }
        Icon(Icons.Default.ImageIcon,contentDescription="Создаётся изображение",
            tint=Color.White.copy(alpha=.94f),
            modifier=Modifier.size(49.dp).align(Alignment.Center))
    }
}

/** Signed 5-minute document links are requested on demand; no image bytes are saved in chat. */
@Composable
internal fun NativeAiGeneratedImageCard(
    documentId:String,fileName:String,
    resolveLink:(String,(String)->Unit)->Unit
){
    val context=LocalContext.current
    var previewUrl by remember(documentId){mutableStateOf<String?>(null)}
    var previewError by remember(documentId){mutableStateOf(false)}
    LaunchedEffect(documentId){
        resolveLink(documentId){link->
            val uri=Uri.parse(link)
            if(uri.scheme=="https"){
                previewUrl=uri.buildUpon().appendQueryParameter("preview","1").build().toString()
            }else previewError=true
        }
    }
    val bitmap by produceState<androidx.compose.ui.graphics.ImageBitmap?>(
        initialValue=null,previewUrl){
        val source=previewUrl
        value=if(source!=null)withContext(Dispatchers.IO){
            runCatching {
                val connection=URL(source).openConnection() as HttpURLConnection
                connection.connectTimeout=12_000
                connection.readTimeout=35_000
                try{
                    if(connection.responseCode !in 200..299)error("HTTP ${connection.responseCode}")
                    // Cap downloads before allocating bitmap memory.
                    val data=connection.inputStream.use{stream->
                        val out=java.io.ByteArrayOutputStream()
                        val buffer=ByteArray(8192)
                        var total=0
                        while(true){
                            val count=stream.read(buffer)
                            if(count<0)break
                            total+=count
                            if(total>20*1024*1024)error("Слишком большое изображение")
                            out.write(buffer,0,count)
                        }
                        out.toByteArray()
                    }
                    val options=BitmapFactory.Options().apply {inJustDecodeBounds=true}
                    BitmapFactory.decodeByteArray(data,0,data.size,options)
                    val sample=generateSequence(1){it*2}
                        .takeWhile{options.outWidth/it>1200 || options.outHeight/it>1200}
                        .lastOrNull() ?: 1
                    BitmapFactory.decodeByteArray(data,0,data.size,
                        BitmapFactory.Options().apply{inSampleSize=sample})
                        ?.asImageBitmap() ?: error("Не удалось прочитать изображение")
                }finally{connection.disconnect()}
            }.getOrNull()
        }else null
        if(source!=null && value==null)previewError=true
    }
    Box(Modifier.fillMaxWidth().padding(top=8.dp)
        .clip(RoundedCornerShape(18.dp))
        .background(Color(0xFF34306B).copy(alpha=.26f))
        .border(1.dp,Color(0xFF8B5CF6).copy(alpha=.38f),RoundedCornerShape(18.dp))){
        Column {
            Box(Modifier.fillMaxWidth().heightIn(min=175.dp,max=390.dp),
                contentAlignment=Alignment.Center){
                if(bitmap!=null){
                    val b=bitmap!!
                    Image(bitmap=b,contentDescription="Изображение, созданное ИИ",
                        modifier=Modifier.fillMaxWidth().heightIn(min=175.dp,max=390.dp),
                        contentScale=ContentScale.Fit)
                }else if(previewError){
                    Column(horizontalAlignment=Alignment.CenterHorizontally){
                        Icon(Icons.Default.ImageIcon,null,tint=Color(0xFF94A3B8))
                        Text("Не удалось загрузить превью",fontSize=12.sp,
                            color=Color(0xFF94A3B8))
                    }
                }else CircularProgressIndicator(color=Color(0xFF8B5CF6),
                    modifier=Modifier.size(27.dp),strokeWidth=2.dp)
            }
            Row(Modifier.fillMaxWidth().padding(horizontal=11.dp,vertical=8.dp),
                verticalAlignment=Alignment.CenterVertically){
                Text(fileName,Modifier.weight(1f),maxLines=1,
                    fontSize=11.sp,color=Color(0xFF94A3B8))
                FilledTonalButton(onClick={
                    // Request a NEW signed URL, not the possibly expired preview URL.
                    resolveLink(documentId){url->
                        runCatching{startImageDownload(context,url,fileName)}
                            .onSuccess{
                                Toast.makeText(context,"Скачивание началось",Toast.LENGTH_SHORT).show()
                            }.onFailure{
                                Toast.makeText(context,"Не удалось скачать изображение",Toast.LENGTH_LONG).show()
                            }
                    }
                },shape=RoundedCornerShape(12.dp)){
                    Icon(Icons.Default.FileDownload,"Скачать",
                        modifier=Modifier.size(17.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Скачать",fontSize=12.sp,fontWeight=FontWeight.Bold)
                }
            }
        }
    }
}

private fun startImageDownload(context:Context,url:String,name:String){
    val uri=Uri.parse(url)
    require(uri.scheme=="https"){"Небезопасная ссылка скачивания"}
    // Filename never becomes a path supplied by a server or a model.
    val safeName=name.substringAfterLast('/').substringAfterLast('\\')
        .replace(Regex("[^\\p{L}\\p{N}._ -]"),"_")
        .take(100).ifBlank{"image.png"}
    val request=DownloadManager.Request(uri)
        .setTitle(safeName)
        .setMimeType(when(safeName.substringAfterLast('.',"").lowercase()){
            "jpg","jpeg" -> "image/jpeg"
            "webp" -> "image/webp"
            else -> "image/png"
        })
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
    if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.Q)
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,safeName)
    else request.setDestinationInExternalFilesDir(context,Environment.DIRECTORY_DOWNLOADS,safeName)
    (context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
}
