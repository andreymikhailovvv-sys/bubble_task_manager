package ru.planirovych.app.feature.home

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.GridOn
import androidx.compose.material.icons.filled.Image as ImageIcon
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import ru.planirovych.app.data.model.TaskAiFile

private enum class AiNativeFileKind { IMAGE, WORD, EXCEL, PDF, OTHER }

private fun fileKind(name:String,mime:String=""):AiNativeFileKind {
    val extension=name.substringAfterLast('.',missingDelimiterValue="").lowercase()
    return when {
        extension in setOf("png","jpg","jpeg","webp","gif","bmp") || mime.startsWith("image/") ->
            AiNativeFileKind.IMAGE
        extension in setOf("doc","docx") || mime.contains("wordprocessingml") ->
            AiNativeFileKind.WORD
        extension in setOf("xls","xlsx","xlsm") || mime.contains("spreadsheetml") ->
            AiNativeFileKind.EXCEL
        extension=="pdf" || mime=="application/pdf" -> AiNativeFileKind.PDF
        else -> AiNativeFileKind.OTHER
    }
}

/** Decode only a small thumbnail off the UI thread, never the full 8 MB image. */
private fun thumbnail(bytes:ByteArray):ImageBitmap? = runCatching {
    val bounds=BitmapFactory.Options().apply { inJustDecodeBounds=true }
    BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
    if(bounds.outWidth<=0 || bounds.outHeight<=0)return@runCatching null
    var sample=1
    while(bounds.outWidth/sample>192 || bounds.outHeight/sample>192)sample*=2
    BitmapFactory.decodeByteArray(bytes,0,bytes.size,
        BitmapFactory.Options().apply { inSampleSize=sample; inPreferredConfig=android.graphics.Bitmap.Config.RGB_565 })
        ?.asImageBitmap()
}.getOrNull()

/** Shared between Quick AI and the task AI chat. Images have real thumbnails,
 * documents have format-specific icons. The UI never stores raw file bytes.
 */
@Composable
internal fun NativeAiAttachmentTiles(
    files:List<TaskAiFile>,colors:TaskChatColors,onRemove:(TaskAiFile)->Unit
) {
    if(files.isEmpty())return
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement=Arrangement.spacedBy(8.dp)){
        files.forEach { file ->
            key(file) {
                NativeAiFileTile(file.name,file.mimeType,file.bytes,colors,onRemove={onRemove(file)})
            }
        }
    }
}

@Composable
private fun NativeAiFileTile(name:String,mime:String,bytes:ByteArray?,
    colors:TaskChatColors,onRemove:(()->Unit)?){
    val kind=remember(name,mime){fileKind(name,mime)}
    val preview by produceState<ImageBitmap?>(initialValue=null,bytes,kind){
        value=if(kind==AiNativeFileKind.IMAGE && bytes!=null)
            withContext(Dispatchers.Default){thumbnail(bytes)}
            else null
    }
    val tint=when(kind){
        AiNativeFileKind.IMAGE -> Color(0xFF0891B2)
        AiNativeFileKind.WORD -> Color(0xFF2563EB)
        AiNativeFileKind.EXCEL -> Color(0xFF059669)
        AiNativeFileKind.PDF -> Color(0xFFE11D48)
        AiNativeFileKind.OTHER -> colors.accent
    }
    val icon=when(kind){
        AiNativeFileKind.IMAGE -> Icons.Default.ImageIcon
        AiNativeFileKind.WORD -> Icons.Default.Description
        AiNativeFileKind.EXCEL -> Icons.Default.GridOn
        AiNativeFileKind.PDF -> Icons.Default.PictureAsPdf
        AiNativeFileKind.OTHER -> Icons.Default.InsertDriveFile
    }
    Column(Modifier.width(110.dp)
        .clip(RoundedCornerShape(13.dp))
        .background(colors.panel)
        .border(1.dp,colors.border.copy(alpha=.8f),RoundedCornerShape(13.dp))
        .padding(5.dp),
        verticalArrangement=Arrangement.spacedBy(4.dp)){
        Box(Modifier.fillMaxWidth().height(74.dp)
            .clip(RoundedCornerShape(9.dp))
            .background(tint.copy(alpha=.11f)),contentAlignment=Alignment.Center){
            if(preview!=null) Image(bitmap=preview!!,contentDescription=null,
                modifier=Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
            else Column(horizontalAlignment=Alignment.CenterHorizontally,
                verticalArrangement=Arrangement.spacedBy(2.dp)){
                Icon(icon,null,tint=tint,modifier=Modifier.size(28.dp))
                Text(when(kind){
                    AiNativeFileKind.WORD -> "WORD"
                    AiNativeFileKind.EXCEL -> "EXCEL"
                    AiNativeFileKind.PDF -> "PDF"
                    AiNativeFileKind.IMAGE -> "IMG"
                    AiNativeFileKind.OTHER -> "FILE"
                },fontSize=9.sp,fontWeight=FontWeight.Bold,color=tint)
            }
            if(onRemove!=null)IconButton(onClick=onRemove,
                modifier=Modifier.align(Alignment.TopEnd).size(25.dp)
                    .background(colors.bg.copy(alpha=.86f),RoundedCornerShape(9.dp))){
                Icon(Icons.Default.Close,"Убрать файл",tint=colors.text,
                    modifier=Modifier.size(14.dp))
            }
        }
        Text(name,color=colors.text,fontSize=10.sp,maxLines=1,
            overflow=TextOverflow.Ellipsis)
    }
}

/** The saved chat transcript keeps file names but not image bytes. Match the
 * Mini App by showing file-type tiles rather than misleading text-only pills.
 */
@Composable
internal fun NativeAiMessageAttachmentTiles(names:List<String>,colors:TaskChatColors){
    if(names.isEmpty())return
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement=Arrangement.spacedBy(7.dp)){
        names.take(3).forEachIndexed { index,name ->
            key("$index:$name") { NativeAiFileTile(name,"",null,colors,onRemove=null) }
        }
    }
}

internal fun splitNativeAiMessageAttachments(content:String):Pair<String,List<String>>{
    val marker="📎 Файлы: "
    val pos=content.lastIndexOf(marker)
    if(pos<0 || (pos>0 && content.substring(0,pos).takeLast(2)!="\n\n"))return content to emptyList()
    val names=content.substring(pos+marker.length)
    if(names.contains('\n') || names.isBlank())return content to emptyList()
    return content.substring(0,pos).trimEnd() to
        names.split(", ").map{it.trim()}.filter{it.isNotBlank()}.take(3)
}
