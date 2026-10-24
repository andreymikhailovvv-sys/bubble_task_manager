package ru.planirovych.app.data.model

import kotlinx.serialization.Serializable

/** Same persisted feed consumed by Mini App and browser notifications. */
@Serializable
data class AndroidSystemNotification(
    val id:String,
    val eventKey:String?=null,
    val taskId:String?=null,
    val content:String,
    val readAt:String?=null,
    val createdAt:String=""
)
@Serializable
data class AndroidSystemNotificationFeed(
    val notifications:List<AndroidSystemNotification> = emptyList(),
    val unreadCount:Int=0
)
