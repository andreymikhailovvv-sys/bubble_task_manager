package ru.planirovych.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import ru.planirovych.app.R

/** Home-screen remote views cannot host an editable EditText.
 * Clicking the text-field-looking surface opens the native quick composer.
 */
class QuickAiWidgetProvider:AppWidgetProvider(){
    override fun onUpdate(context:Context,manager:AppWidgetManager,ids:IntArray){
        ids.forEach{id->
            val views=RemoteViews(context.packageName,R.layout.widget_quick_ai)
            val textIntent=Intent(context,QuickAiAskActivity::class.java).apply{
                action=QuickAiAskActivity.ACTION_TEXT
                flags=Intent.FLAG_ACTIVITY_NEW_TASK
            }
            val voiceIntent=Intent(context,QuickAiAskActivity::class.java).apply{
                action=QuickAiAskActivity.ACTION_VOICE
                flags=Intent.FLAG_ACTIVITY_NEW_TASK
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
