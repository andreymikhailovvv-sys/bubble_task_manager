package ru.planirovych.app.notifications

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.work.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import ru.planirovych.app.MainActivity
import ru.planirovych.app.PlanirovychApplication
import ru.planirovych.app.R
import java.util.concurrent.TimeUnit

private const val CHANNEL_ID="planirovych_system_events"
private const val WORK_NAME="planirovych_system_events_polling"
private const val SEEN_MAX=250

/**
 * No duplicate reminder producer. This reads the exact persisted server feed
 * used by Mini App/browser. It never marks notifications read on the server.
 */
object AndroidNotificationDelivery {
    private val mutex=Mutex()

    fun schedule(context:Context){
        val constraints=Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED).build()
        val work=PeriodicWorkRequestBuilder<SystemNotificationWorker>(
            15,TimeUnit.MINUTES)
            .setConstraints(constraints).build()
        WorkManager.getInstance(context.applicationContext)
            .enqueueUniquePeriodicWork(
                WORK_NAME,ExistingPeriodicWorkPolicy.UPDATE,work)
    }
    fun enqueueRefresh(context:Context){
        WorkManager.getInstance(context.applicationContext)
            .enqueueUniqueWork("planirovych_notifications_now",
                ExistingWorkPolicy.KEEP,
                OneTimeWorkRequestBuilder<SystemNotificationWorker>()
                    .setConstraints(Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .build())
    }
    fun canNotify(context:Context):Boolean=
        Build.VERSION.SDK_INT<33 ||
            ContextCompat.checkSelfPermission(context,
                Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED

    private fun createChannel(context:Context){
        val manager=context.getSystemService(NotificationManager::class.java)
        val channel=NotificationChannel(CHANNEL_ID,"События Планировыча",
            NotificationManager.IMPORTANCE_DEFAULT).apply{
                description="Напоминания, задачи, события, совместная работа и уведомления ИИ"
                enableVibration(true)
            }
        manager.createNotificationChannel(channel)
    }
    suspend fun refresh(context:Context){
        mutex.withLock{
            val app=context.applicationContext as PlanirovychApplication
            val user=app.repository.establishSession()
            val feed=app.repository.loadSystemNotifications()
            val prefs=context.getSharedPreferences(
                "planirovych_native_notification_ids",Context.MODE_PRIVATE)
            val account=user.id
            val lastAccount=prefs.getString("user",null)
            val previously=prefs.getString("seen",null)
            val ids=runCatching{
                val array=JSONArray(previously?:"[]")
                List(array.length()){index->array.getString(index)}
            }.getOrDefault(emptyList()).toMutableList()
            val firstSync=lastAccount!=account || previously==null
            val selected=if(firstSync)mutableListOf<String>() else ids
            if(firstSync && lastAccount!=null && lastAccount!=account){
                context.getSystemService(NotificationManager::class.java).cancelAll()
            }
            val fresh=feed.notifications
                .filter{it.id.isNotBlank()&&it.content.isNotBlank()}
                .filterNot{it.id in selected}
            // Initial connection is a baseline: don't flood the notification tray
            // with historical events, which may go back days or weeks.
            if(!firstSync && canNotify(context)){
                createChannel(context)
                fresh.filter{it.readAt==null}.forEach{entry->
                    val destination=Intent(context,MainActivity::class.java).apply{
                        flags=Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                        putExtra(MainActivity.EXTRA_NOTIFICATION_TASK_ID,entry.taskId)
                        putExtra(MainActivity.EXTRA_NOTIFICATION_ID,entry.id)
                        if(entry.eventKey?.startsWith("ai-checkup:")==true)
                            putExtra(MainActivity.EXTRA_OPEN_GENERAL_AI,true)
                    }
                    val requestCode=(account+":"+entry.id).hashCode()
                    val pending=PendingIntent.getActivity(context,requestCode,
                        destination,PendingIntent.FLAG_UPDATE_CURRENT or
                            PendingIntent.FLAG_IMMUTABLE)
                    val notification=Notification.Builder(context,CHANNEL_ID)
                        .setSmallIcon(R.drawable.ic_stat_planirovych)
                        .setContentTitle("Планировыч")
                        .setContentText(entry.content)
                        .setStyle(Notification.BigTextStyle().bigText(entry.content))
                        .setContentIntent(pending)
                        .setAutoCancel(true)
                        .setCategory(Notification.CATEGORY_REMINDER)
                        .setColor(0xFF8B5CF6.toInt())
                        .build()
                    context.getSystemService(NotificationManager::class.java)
                        .notify(requestCode,notification)
                }
            }
            selected.addAll(fresh.map{it.id})
            val bounded=selected.distinct().takeLast(SEEN_MAX)
            prefs.edit().putString("user",account)
                .putString("seen",JSONArray(bounded).toString()).apply()
        }
    }
}

class SystemNotificationWorker(context:Context,params:WorkerParameters):
    CoroutineWorker(context,params){
    override suspend fun doWork():Result=try{
        withContext(Dispatchers.IO){
            AndroidNotificationDelivery.refresh(applicationContext)
        }
        Result.success()
    }catch(e:Exception){
        // No unauthenticated notifications. An expired session shouldn't
        // trigger infinite retry loops; a later foreground refresh retries.
        if(e is retrofit2.HttpException&&
            (e.code()==401||e.code()==403))Result.success()
        else Result.retry()
    }
}
