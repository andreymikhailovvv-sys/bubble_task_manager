package ru.planirovych.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import ru.planirovych.app.MainActivity
import ru.planirovych.app.R

/** Dedicated 1x1 launcher for a *new* Quick AI voice dictation request. */
class VoiceQuickAiWidgetProvider:AppWidgetProvider() {
    override fun onUpdate(context:Context,manager:AppWidgetManager,ids:IntArray) {
        ids.forEach { id ->
            val views=RemoteViews(context.packageName,R.layout.widget_quick_ai_voice_only)
            val intent=Intent(context,MainActivity::class.java).apply {
                action=MainActivity.ACTION_WIDGET_QUICK_AI
                putExtra(MainActivity.EXTRA_QUICK_AI_MODE,MainActivity.QUICK_AI_VOICE)
                flags=Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            // Per-widget request code: clicking this shortcut when the app is
            // already running still produces a fresh onNewIntent.
            views.setOnClickPendingIntent(R.id.widget_voice_only_target,
                PendingIntent.getActivity(context,100_000+id,intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            manager.updateAppWidget(id,views)
        }
    }
}
