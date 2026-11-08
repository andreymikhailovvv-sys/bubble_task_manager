package ru.planirovych.app.updates

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import ru.planirovych.app.BuildConfig
import ru.planirovych.app.R
import java.net.URL
import java.util.concurrent.TimeUnit
import javax.net.ssl.HttpsURLConnection

private const val UPDATE_MANIFEST = "https://planirovych.ru/api/android/latest"
private const val UPDATE_PAGE = "https://planirovych.ru/android"
private const val PREFS = "planirovych_apk_updates"
private const val SNOOZED_CODE = "snoozed_version_code"
private const val SNOOZED_UNTIL = "snoozed_until_epoch_ms"
private const val NOTIFIED_CODE = "notified_version"
private const val LAST_NOTIFIED_AT = "last_notified_at_epoch_ms"
private val REMINDER_INTERVAL_MS = TimeUnit.HOURS.toMillis(24)
private const val UPDATE_NOTIFICATION_ID = 2710
private const val UPDATE_CHANNEL = "planirovych_app_updates"

data class AndroidAppRelease(val versionCode:Int, val versionName:String, val notes:String)

object AndroidAppUpdateChecker {
    suspend fun latest(context:Context):AndroidAppRelease? = withContext(Dispatchers.IO) {
        // Debug uses ru.planirovych.app.debug and cannot replace release APK.
        if(BuildConfig.DEBUG)return@withContext null
        val connection=URL(UPDATE_MANIFEST).openConnection() as HttpsURLConnection
        try {
            connection.connectTimeout=6_000
            connection.readTimeout=6_000
            connection.setRequestProperty("Accept","application/json")
            connection.useCaches=false
            if(connection.responseCode!=200)return@withContext null
            val raw=connection.inputStream.bufferedReader().use{it.readText()}
            val objectJson=JSONObject(raw)
            if(!objectJson.optBoolean("available",false))return@withContext null
            val code=objectJson.optInt("versionCode",-1)
            if(code<=BuildConfig.VERSION_CODE)return@withContext null
            val name=objectJson.optString("versionName","").take(48)
            val notes=objectJson.optString("notes","").take(500)
            if(code<=0 || name.isBlank())return@withContext null
            AndroidAppRelease(code,name,notes)
        }catch(_:Exception){ null }
        finally{connection.disconnect()}
    }

    /**
     * "Later" pauses reminders for this specific version for 24 hours.
     * A newer release is never hidden by an older version's snooze.
     */
    fun snoozed(context:Context,code:Int,nowMs:Long=System.currentTimeMillis()):Boolean {
        val prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE)
        return prefs.getInt(SNOOZED_CODE,0)==code &&
            nowMs < prefs.getLong(SNOOZED_UNTIL,0L)
    }

    fun snooze(context:Context,code:Int,nowMs:Long=System.currentTimeMillis()){
        context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit()
            .putInt(SNOOZED_CODE,code)
            .putLong(SNOOZED_UNTIL,nowMs+REMINDER_INTERVAL_MS)
            .apply()
        // Do not leave a background update notification visible after "Later".
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager)
            ?.cancel(UPDATE_NOTIFICATION_ID)
    }
}

@Composable
fun AndroidAppUpdateDialog(release:AndroidAppRelease,onLater:()->Unit,onUpdate:()->Unit) {
    AlertDialog(
        onDismissRequest=onLater,
        title={Text("Новая версия Планировыча")},
        text={
            Column {
                Text("Доступна версия ${release.versionName}. Обновление устанавливается поверх приложения без удаления данных.")
                if(release.notes.isNotBlank())
                    Text(release.notes,modifier=Modifier.padding(top=12.dp))
                Text("Android попросит подтвердить установку APK.",
                    modifier=Modifier.padding(top=10.dp))
                Text("«Позже» отложит напоминание на 24 часа.",
                    modifier=Modifier.padding(top=8.dp))
            }
        },
        confirmButton={TextButton(onClick=onUpdate){Text("Обновить")}},
        dismissButton={TextButton(onClick=onLater){Text("Позже")}}
    )
}

class AndroidAppUpdateWorker(context:Context,params:WorkerParameters)
    :CoroutineWorker(context,params){
    override suspend fun doWork():Result {
        if(BuildConfig.DEBUG)return Result.success()
        val release=AndroidAppUpdateChecker.latest(applicationContext)
            ?: return Result.success()
        val prefs=applicationContext.getSharedPreferences(PREFS,Context.MODE_PRIVATE)
        val now=System.currentTimeMillis()
        if(AndroidAppUpdateChecker.snoozed(applicationContext,release.versionCode,now))
            return Result.success()
        // At most one reminder per release per 24 h, not one reminder forever.
        val lastCode=prefs.getInt(NOTIFIED_CODE,0)
        val lastSentAt=prefs.getLong(LAST_NOTIFIED_AT,0L)
        if(lastCode==release.versionCode && lastSentAt>0L &&
            now>=lastSentAt && now-lastSentAt<REMINDER_INTERVAL_MS)
            return Result.success()
        if(Build.VERSION.SDK_INT>=33 && ContextCompat.checkSelfPermission(
                applicationContext,Manifest.permission.POST_NOTIFICATIONS)
            !=PackageManager.PERMISSION_GRANTED) return Result.success()

        val manager=applicationContext.getSystemService(Context.NOTIFICATION_SERVICE)
            as NotificationManager
        if(Build.VERSION.SDK_INT>=26) {
            manager.createNotificationChannel(NotificationChannel(UPDATE_CHANNEL,
                "Обновления Планировыча",NotificationManager.IMPORTANCE_DEFAULT))
        }
        val intent=Intent(Intent.ACTION_VIEW,Uri.parse(UPDATE_PAGE)).apply {
            flags=Intent.FLAG_ACTIVITY_NEW_TASK
        }
        val pending=PendingIntent.getActivity(applicationContext,2710,intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification=NotificationCompat.Builder(applicationContext,UPDATE_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_planirovych)
            .setContentTitle("Доступно обновление Планировыча")
            .setContentText("Версия ${release.versionName}. Нажмите, чтобы скачать APK с сайта.")
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        manager.notify(UPDATE_NOTIFICATION_ID,notification)
        prefs.edit()
            .putInt(NOTIFIED_CODE,release.versionCode)
            .putLong(LAST_NOTIFIED_AT,now)
            .apply()
        return Result.success()
    }
    companion object{
        fun schedule(context:Context){
            if(BuildConfig.DEBUG)return
            val request=PeriodicWorkRequestBuilder<AndroidAppUpdateWorker>(
                12,TimeUnit.HOURS
            ).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                "planirovych-android-release-check",
                ExistingPeriodicWorkPolicy.KEEP,request)
        }
    }
}
