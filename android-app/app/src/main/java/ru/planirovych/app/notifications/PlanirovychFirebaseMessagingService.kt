package ru.planirovych.app.notifications

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.runBlocking

/**
 * Handles data-only FCM messages. Server owns all reminder deadlines.
 * Expected string fields: notificationId, userId, content, taskId, eventKey.
 * Do not add a "notification" payload on the sender, or Android may show
 * an automatic second notification outside our account/duplicate checks.
 */
class PlanirovychFirebaseMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data.isEmpty()) return
        try {
            // Firebase runs this on a worker thread; display locally immediately.
            // No network call is made in this time-sensitive callback.
            runBlocking { AndroidNotificationDelivery.deliverPush(applicationContext, message.data) }
        } catch (error: Exception) {
            Log.w("PlanirovychFCM", "Unable to display a received system event", error)
        }
    }

    override fun onNewToken(token: String) {
        // Device token registration with our server is implemented in the
        // next (server-backed) push delivery PR; never log this token.
        AndroidNotificationDelivery.enqueueRefresh(applicationContext)
    }
}
