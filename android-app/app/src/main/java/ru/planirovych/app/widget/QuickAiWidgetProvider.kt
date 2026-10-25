package ru.planirovych.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import ru.planirovych.app.R
import ru.planirovych.app.MainActivity

/** Android RemoteViews cannot contain a live EditText.
 * Both widget targets open the real Quick Requests chat in MainActivity,
 * rather than a second, disconnected composer activity.
 */
class QuickAiWidgetProvider:AppWidgetProvider(){
    override fun onUpdate(context:Context,manager:AppWidgetManager,ids:IntArray){
        ids.forEach{id->
            val views=RemoteViews(context.packageName,R.layout.widget_quick_ai)
            val textIntent=Intent(context,MainActivity::class.java).apply{
                action=MainActivity.ACTION_WIDGET_QUICK_AI
                putExtra(MainActivity.EXTRA_QUICK_AI_MODE,MainActivity.QUICK_AI_TEXT)
                flags=Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            val voiceIntent=Intent(context,MainActivity::class.java).apply{
                action=MainActivity.ACTION_WIDGET_QUICK_AI
                putExtra(MainActivity.EXTRA_QUICK_AI_MODE,MainActivity.QUICK_AI_VOICE)
                flags=Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            views.setOnClickPendingIntent(R.id.widget_text_target,
                PendingIntent.getActivity(context,id*2,textIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            views.setOnClickPendingIntent(R.id.widget_voice_target,
                PendingIntent.getActivity(context,id*2+1,voiceIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            manager.updateAppWidget(id,views)
        }
    }
}
