package ru.planirovych.app.planik

import android.content.Context
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.ZipInputStream

/** Official Apache-2.0 Vosk Russian small model. Download once after opt-in. */
internal object PlanikWakeModel {
    private const val NAME="vosk-model-small-ru-0.22"
    private const val URL_STRING="https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip"
    private const val MAX_DOWNLOAD=65L*1024*1024
    private const val MAX_UNPACK=250L*1024*1024

    @Synchronized
    fun ensure(context:Context, active:()->Boolean, report:(String)->Unit):File {
        val parent=File(context.noBackupFilesDir,"planik-wake-model").apply { mkdirs() }
        val target=File(parent,NAME)
        fun complete(dir:File)=File(dir,"am/final.mdl").isFile &&
            File(dir,"graph/HCLr.fst").isFile && File(dir,"graph/Gr.fst").isFile
        if(complete(target))return target
        val zip=File(parent,"model.download")
        val staging=File(parent,"unpack")
        target.deleteRecursively()
        staging.deleteRecursively()
        zip.delete()
        fun checkActive(){ if(!active())throw IOException("Cancelled") }
        try {
            checkActive()
            report("Загрузка русской модели (~45 МБ)…")
            val connection=URL(URL_STRING).openConnection() as HttpURLConnection
            connection.connectTimeout=15000
            connection.readTimeout=15000
            connection.instanceFollowRedirects=false
            try {
                check(connection.responseCode==200) { "Model download HTTP "+connection.responseCode }
                check(connection.contentLengthLong in -1L..MAX_DOWNLOAD)
                connection.inputStream.use { source ->
                    zip.outputStream().use { out ->
                        val bytes=ByteArray(64*1024)
                        var total=0L
                        while(true) {
                            checkActive()
                            val n=source.read(bytes)
                            if(n<0)break
                            total+=n
                            check(total<=MAX_DOWNLOAD)
                            out.write(bytes,0,n)
                        }
                    }
                }
            } finally { connection.disconnect() }
            report("Распаковка локальной модели…")
            staging.mkdirs()
            val root=staging.canonicalPath+File.separator
            ZipInputStream(zip.inputStream().buffered()).use { archive ->
                var total=0L
                var entries=0
                val bytes=ByteArray(64*1024)
                while(true) {
                    checkActive()
                    val item=archive.nextEntry ?: break
                    check(++entries<=512)
                    val file=File(staging,item.name).canonicalFile
                    check(file.path.startsWith(root))
                    if(item.isDirectory)file.mkdirs()
                    else {
                        file.parentFile?.mkdirs()
                        file.outputStream().use { out ->
                            while(true) {
                                checkActive()
                                val n=archive.read(bytes)
                                if(n<0)break
                                total+=n
                                check(total<=MAX_UNPACK)
                                out.write(bytes,0,n)
                            }
                        }
                    }
                    archive.closeEntry()
                }
            }
            checkActive()
            val unpacked=File(staging,NAME)
            check(complete(unpacked)) { "Incomplete model" }
            check(unpacked.renameTo(target)) { "Cannot install model" }
            return target
        } finally {
            zip.delete()
            staging.deleteRecursively()
        }
    }
}
