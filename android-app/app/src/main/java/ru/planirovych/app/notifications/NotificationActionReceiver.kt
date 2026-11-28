package ru.planirovych.app.notifications

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.net.Uri
import ru.planirovych.app.MainActivity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.*
import ru.planirovych.app.PlanirovychApplication
import ru.planirovych.app.R
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull

internal data class NotificationActionSpec(
    val habitId:String?=null,val chatId:String?=null,val openAi:Boolean=false,
    val progress:Int=0,val max:Int=0,
    val actions:List<Pair<String,String>> = emptyList(),val status:String?=null,val preview:String?=null,
    val replyHash:String?=null,val taskChat:Boolean=false,val hide:Boolean=false,val loanId:String?=null,val actionHash:String?=null
){
    companion object{
        fun from(eventKey:String?,taskId:String?,content:String,metadata:String?=null):NotificationActionSpec{
            if(!metadata.isNullOrBlank())runCatching{
                val json=org.json.JSONObject(metadata)
                fun str(key:String)=json.optString(key,"").takeIf{it.isNotBlank() && it!="null"}
                val labels=mapOf("task_done" to "Выполнить","habit_done" to if(json.optInt("max")>1)"Отметить +1" else "Выполнено",
                    "snooze" to "Через 30 мин","proposal_approve" to "Применить","proposal_reject" to "Отклонить",
                    "reply_send" to "Отправить","economic_approve" to "Подтвердить","economic_reject" to "Пропустить")
                val commands=json.optJSONArray("commands")
                val buttons=if(commands==null)emptyList() else (0 until commands.length()).mapNotNull{index->
                    val command=commands.optString(index);labels[command]?.let{command to it}
                }.take(2)
                NotificationActionSpec(habitId=str("habitId"),chatId=str("chatId"),openAi=json.optBoolean("openAi"),
                    progress=json.optInt("progress"),max=json.optInt("max"),actions=buttons,status=str("status"),
                    preview=str("preview"),replyHash=str("replyHash"),taskChat=json.optBoolean("taskChat"),hide=json.optBoolean("hide"),loanId=str("loanId"),actionHash=str("actionHash"))
            }.getOrNull()?.let{return it}
            val raw=eventKey.orEmpty()
            val key=if(raw.startsWith("android-snooze:"))raw.substringAfter(':').substringAfter(':') else raw
            val parts=key.split(':')
            if(parts.firstOrNull()=="habit-reminder" && parts.size>=3){
                val match=Regex("""Сегодня:\s*(\d+)/(\d+)""").find(content)
                val progress=match?.groupValues?.get(1)?.toIntOrNull()?:0
                val max=match?.groupValues?.get(2)?.toIntOrNull()?:0
                return NotificationActionSpec(habitId=parts[1],progress=progress,max=max)
            }
            if(!taskId.isNullOrBlank()&&(key.startsWith("reminder:")||key.endsWith(":upcoming")||key.endsWith(":overdue")))
                return NotificationActionSpec()
            // Old-server fallback must not offer unverified assistant mutations.
            if(key.startsWith("telegram-ai-")||key.startsWith("mail-ai-"))return NotificationActionSpec(openAi=true)
            if(key.startsWith("monitoring:"))return NotificationActionSpec(taskChat=true)
            if(key.startsWith("economic-repeat:")||key.startsWith("ai-checkup:"))return NotificationActionSpec(openAi=true)
            return NotificationActionSpec()
        }
    }
}

class NotificationActionReceiver:BroadcastReceiver(){
    override fun onReceive(context:Context,intent:Intent){
        val account=intent.getStringExtra("account")?:return
        val id=intent.getStringExtra("id")?:return
        val command=intent.getStringExtra("command")?:return
        if(command !in setOf("task_done","habit_done","snooze","proposal_approve","proposal_reject","reply_send","economic_approve","economic_reject"))return
        if(context.getSharedPreferences("planirovych_native_notification_ids",Context.MODE_PRIVATE).getString("user",null)!=account)return
        val work=OneTimeWorkRequestBuilder<NotificationActionWorker>()
            .setInputData(workDataOf("account" to account,"id" to id,"command" to command,"taskId" to intent.getStringExtra("taskId"),"replyHash" to intent.getStringExtra("replyHash"),"actionHash" to intent.getStringExtra("actionHash")))
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        WorkManager.getInstance(context).enqueueUniqueWork("notification-action:"+account+":"+id,ExistingWorkPolicy.KEEP,work)
    }
}

class NotificationActionWorker(context:Context,params:WorkerParameters):CoroutineWorker(context,params){
    override suspend fun doWork():Result{
        val account=inputData.getString("account")?:return Result.failure()
        val id=inputData.getString("id")?:return Result.failure()
        val command=inputData.getString("command")?:return Result.failure()
        val prefs=applicationContext.getSharedPreferences("planirovych_native_notification_ids",Context.MODE_PRIVATE)
        if(prefs.getString("user",null)!=account)return Result.success()
        val repo=(applicationContext as PlanirovychApplication).repository
        val manager=applicationContext.getSystemService(NotificationManager::class.java)
        val notificationId=(account+":"+id).hashCode()
        val open=PendingIntent.getActivity(applicationContext,notificationId,
            Intent(applicationContext,MainActivity::class.java).apply{
                data=Uri.parse("planirovych://notification/"+Uri.encode(id))
                flags=Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
        fun show(message:String,progress:Int=0,max:Int=0){
            if(prefs.getString("user",null)==account&&AndroidNotificationDelivery.canNotify(applicationContext))
                manager.notify(notificationId,Notification.Builder(applicationContext,"planirovych_system_events")
                    .setSmallIcon(R.drawable.ic_stat_planirovych).setContentTitle("Планировыч")
                    .setContentText(message).apply{if(max>0)setProgress(max,progress.coerceIn(0,max),false)}
                    .apply{if(open!=null){setContentIntent(open);addAction(Notification.Action.Builder(null,"Открыть",open).build())}}
                    .setVisibility(Notification.VISIBILITY_PRIVATE).setAutoCancel(true).setOnlyAlertOnce(true).build())
        }
        try{
            if(repo.establishSession().id!=account)return Result.success()
            val result=repo.performNotificationAction(id,command,account,inputData.getString("replyHash"),inputData.getString("actionHash"))
            val message=result["message"]?.jsonPrimitive?.contentOrNull?:"Готово"
            val progress=result["progress"]?.jsonPrimitive?.contentOrNull?.toIntOrNull()?:0
            val max=result["max"]?.jsonPrimitive?.contentOrNull?.toIntOrNull()?:0
            show(if(max>0)"$message · $progress/$max" else message,progress,max)
            return Result.success()
        }catch(e:kotlinx.coroutines.CancellationException){throw e}
        catch(e:Exception){
            // External sends and recurring task completion must not be blindly retried.
            val terminal=(e is retrofit2.HttpException && e.code() in 400..499)||command=="reply_send"||command=="task_done"||command=="economic_approve"||runAttemptCount>=3
            if(terminal){show("Не удалось подтвердить действие. Проверьте в приложении.");return Result.failure()}
            return Result.retry()
        }
    }
}
