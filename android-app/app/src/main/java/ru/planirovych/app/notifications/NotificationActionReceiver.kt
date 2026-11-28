package ru.planirovych.app.notifications

import android.app.Notification
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.*
import ru.planirovych.app.PlanirovychApplication
import ru.planirovych.app.R
import ru.planirovych.app.data.model.TaskStatus
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull

internal data class NotificationActionSpec(
    val habitId:String?=null,val chatId:String?=null,val openAi:Boolean=false,
    val progress:Int=0,val max:Int=0,
    val actions:List<Pair<String,String>> = emptyList()
){
    companion object{
        fun from(eventKey:String?,taskId:String?,content:String):NotificationActionSpec{
            val raw=eventKey.orEmpty()
            val key=if(raw.startsWith("android-snooze:"))raw.substringAfter(':').substringAfter(':') else raw
            val parts=key.split(':')
            if(parts.firstOrNull()=="habit-reminder" && parts.size>=3){
                val match=Regex("""Сегодня:\s*(\d+)/(\d+)""").find(content)
                val progress=match?.groupValues?.get(1)?.toIntOrNull()?:0
                val max=match?.groupValues?.get(2)?.toIntOrNull()?:0
                return NotificationActionSpec(habitId=parts[1],progress=progress,max=max,
                    actions=if(max>0&&progress>=max)emptyList() else listOf(
                        "habit_done" to if(max>1)"Отметить +1" else "Выполнено","snooze" to "Через 30 мин"))
            }
            if(!taskId.isNullOrBlank()&&(key.startsWith("reminder:")||key.endsWith(":upcoming")||key.endsWith(":overdue")))
                return NotificationActionSpec(actions=listOf("task_done" to "Выполнить","snooze" to "Через 30 мин"))
            if(key.startsWith("telegram-ai-task:")||key.startsWith("telegram-ai-reply:")||key.startsWith("telegram-ai-auto-reply:")){
                val event=key.removePrefix("telegram-ai-task:")
                val policy=event.split(':').getOrNull(1)
                val sent=key.endsWith(":sent")||content.contains("добавлены задачи")
                return NotificationActionSpec(chatId=policy?.let{"telegram-ai-assistant:"+it},openAi=true,
                    actions=when{
                        key.startsWith("telegram-ai-task:")&&!sent->listOf("proposal_approve" to "Применить","proposal_reject" to "Отклонить")
                        key.startsWith("telegram-ai-reply:")&&!sent->listOf("reply_send" to "Отправить")
                        else->emptyList()
                    })
            }
            if(key.startsWith("mail-ai-reply:")||key.startsWith("mail-ai-task:"))
                return NotificationActionSpec(openAi=true,actions=when{
                    key.startsWith("mail-ai-task:")&&!content.contains("добавлены задачи")->listOf("proposal_approve" to "Применить","proposal_reject" to "Отклонить")
                    key.startsWith("mail-ai-reply:")&&!key.endsWith(":sent")->listOf("reply_send" to "Отправить")
                    else->emptyList()
                })
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
        if(command !in setOf("task_done","habit_done","snooze","proposal_approve","proposal_reject","reply_send"))return
        if(context.getSharedPreferences("planirovych_native_notification_ids",Context.MODE_PRIVATE).getString("user",null)!=account)return
        val work=OneTimeWorkRequestBuilder<NotificationActionWorker>()
            .setInputData(workDataOf("account" to account,"id" to id,"command" to command,"taskId" to intent.getStringExtra("taskId")))
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
        fun show(message:String){
            if(prefs.getString("user",null)==account&&AndroidNotificationDelivery.canNotify(applicationContext))
                manager.notify(notificationId,Notification.Builder(applicationContext,"planirovych_system_events")
                    .setSmallIcon(R.drawable.ic_stat_planirovych).setContentTitle("Планировыч")
                    .setContentText(message).setAutoCancel(true).setOnlyAlertOnce(true).build())
        }
        try{
            if(repo.establishSession().id!=account)return Result.success()
            val message=if(command=="task_done"){
                val taskId=inputData.getString("taskId")?:return Result.failure()
                val task=repo.loadTasks().firstOrNull{it.id==taskId}?:return Result.failure()
                if(task.status!=TaskStatus.DONE)repo.updateStatus(taskId,TaskStatus.DONE)
                "Задача выполнена"
            }else repo.performNotificationAction(id,command)["message"]?.jsonPrimitive?.contentOrNull?:"Готово"
            show(message)
            return Result.success()
        }catch(e:kotlinx.coroutines.CancellationException){throw e}
        catch(e:Exception){
            // External sends and recurring task completion must not be blindly retried.
            val terminal=(e is retrofit2.HttpException && e.code() in 400..499)||command=="reply_send"||command=="task_done"||runAttemptCount>=3
            if(terminal){show("Не удалось подтвердить действие. Проверьте в приложении.");return Result.failure()}
            return Result.retry()
        }
    }
}
