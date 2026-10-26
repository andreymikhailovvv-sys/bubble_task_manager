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
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import java.util.UUID
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
    private const val PUSH_PREFS="planirovych_android_push_registration"

    private fun installationId(context:Context):String{
        val prefs=context.getSharedPreferences(PUSH_PREFS,Context.MODE_PRIVATE)
        val old=prefs.getString("installationId",null)
        if(!old.isNullOrBlank())return old
        val created=UUID.randomUUID().toString()
        prefs.edit().putString("installationId",created).commit()
        return created
    }

    private suspend fun fcmToken():String=suspendCancellableCoroutine{continuation->
        FirebaseMessaging.getInstance().token.addOnCompleteListener{task->
            if(!continuation.isActive)return@addOnCompleteListener
            val token=if(task.isSuccessful)task.result else null
            if(token.isNullOrBlank())
                continuation.resumeWithException(
                    task.exception?:IllegalStateException("FCM token unavailable"))
            else continuation.resume(token)
        }
    }

    private suspend fun registerDevice(context:Context,userId:String){
        val token=fcmToken()
        val prefs=context.getSharedPreferences(PUSH_PREFS,Context.MODE_PRIVATE)
        val now=System.currentTimeMillis()
        if(prefs.getString("registeredUser",null)==userId &&
            prefs.getString("registeredToken",null)==token &&
            now-prefs.getLong("registeredAt",0)<30*60_000L)return
        val app=context.applicationContext as PlanirovychApplication
        app.repository.registerAndroidPushDevice(installationId(context),token)
        prefs.edit().putString("registeredUser",userId)
            .putString("registeredToken",token).putLong("registeredAt",now).apply()
    }

    /** Revoke server association on logout, even if clearing the auth cookie fails. */
    suspend fun unregisterDevice(context:Context){
        mutex.withLock{
            val prefs=context.getSharedPreferences(PUSH_PREFS,Context.MODE_PRIVATE)
            val id=prefs.getString("installationId",null)
            if(!id.isNullOrBlank()){
                val app=context.applicationContext as PlanirovychApplication
                runCatching{app.repository.unregisterAndroidPushDevice(id)}
            }
            clearIdentityLocked(context)
        }
    }

    suspend fun clearIdentity(context:Context)=mutex.withLock{
        clearIdentityLocked(context)
    }

    private fun clearIdentityLocked(context:Context){
        // Called at the start of an account switch. Data-only pushes will be
        // ignored until the newly authenticated account is successfully synced.
        context.getSharedPreferences("planirovych_native_notification_ids",Context.MODE_PRIVATE)
            .edit().remove("user").remove("seen").commit()
        context.getSharedPreferences(PUSH_PREFS,Context.MODE_PRIVATE)
            .edit().remove("registeredUser").remove("registeredToken")
            .remove("registeredAt").commit()
        context.getSystemService(NotificationManager::class.java).cancelAll()
    }


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

    /**
     * FCM data-only messages are shown here rather than by Firebase's automatic
     * notification UI. Both foreground/background and WorkManager use the same
     * persistent seen-ID list to avoid duplicate Android notifications.
     */
    suspend fun deliverPush(context:Context,data:Map<String,String>){
        val id=data["notificationId"]?.takeIf{it.isNotBlank()}?:return
        val recipient=data["userId"]?.takeIf{it.isNotBlank()}?:return
        val content=data["content"]?.takeIf{it.isNotBlank()}?:return
        mutex.withLock {
            val prefs=context.getSharedPreferences(
                "planirovych_native_notification_ids",Context.MODE_PRIVATE)
            // The account is set only after successful authenticated feed sync.
            // Never leak an earlier user's push to a new account on this device.
            if(prefs.getString("user",null)!=recipient || !canNotify(context))return@withLock
            val seen=runCatching{
                val array=JSONArray(prefs.getString("seen","[]")?:"[]")
                List(array.length()){index->array.getString(index)}
            }.getOrDefault(emptyList()).toMutableList()
            if(id in seen)return@withLock
            publish(context,recipient,id,content,data["taskId"],data["eventKey"])
            seen.add(id)
            prefs.edit().putString("seen",JSONArray(seen.distinct().takeLast(SEEN_MAX)).toString()).apply()
        }
    }

    private fun publish(context:Context,account:String,id:String,content:String,
        taskId:String?,eventKey:String?){
        createChannel(context)
        val destination=Intent(context,MainActivity::class.java).apply{
            flags=Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(MainActivity.EXTRA_NOTIFICATION_TASK_ID,taskId)
            putExtra(MainActivity.EXTRA_NOTIFICATION_ID,id)
            if(eventKey?.startsWith("ai-checkup:")==true)
                putExtra(MainActivity.EXTRA_OPEN_GENERAL_AI,true)
        }
        val requestCode=(account+":"+id).hashCode()
        val pending=PendingIntent.getActivity(context,requestCode,destination,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val lines=content.lines()
        val monitoring=eventKey?.startsWith("monitoring:")==true &&
            lines.size>=2 && lines[0].isNotBlank()
        val headline=if(monitoring)lines[0].trim() else "Планировыч"
        val contextLine=if(monitoring)lines[1].trim() else content
        val expanded=if(monitoring)
            listOf(contextLine,lines.drop(2).joinToString("\n").trim())
                .filter{it.isNotBlank()}.joinToString("\n\n")
            else content
        val notification=Notification.Builder(context,CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_planirovych)
            .setContentTitle(headline)
            .setContentText(contextLine)
            .setStyle(Notification.BigTextStyle().bigText(expanded))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_REMINDER)
            .setColor(0xFF8B5CF6.toInt())
            .build()
        context.getSystemService(NotificationManager::class.java)
            .notify(requestCode,notification)
    }

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
                    publish(context,account,entry.id,entry.content,
                        entry.taskId,entry.eventKey)
                }
            }
            selected.addAll(fresh.map{it.id})
            val bounded=selected.distinct().takeLast(SEEN_MAX)
            prefs.edit().putString("user",account)
                .putString("seen",JSONArray(bounded).toString()).apply()
            // Registration runs only after an authenticated successful sync.
            // Any failure leaves existing delivery and WorkManager intact.
            runCatching{registerDevice(context,account)}

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
