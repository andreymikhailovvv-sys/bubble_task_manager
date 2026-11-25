package ru.planirovych.app.data.model

import kotlinx.serialization.Serializable

@Serializable
data class SubscriptionLimit(val usedPercent: Int, val expiresAt: String, val planName: String, val allowanceMilli: Int? = null,
    val daily: SubscriptionWindow? = null, val weekly: SubscriptionWindow? = null)
@Serializable
data class SubscriptionWindow(val capMilli: Long, val remainingMilli: Long, val remainingPercent: Int, val resetsAt: String)

@Serializable
data class CurrentUser(
    val id: String,
    val email: String? = null,
    val username: String? = null,
    val name: String? = null,
    val avatarUrl: String? = null,
    val googleSub: String? = null,
    val deviceId: String? = null,
    val aiCredits: Int = 0,
    val aiCreditsMilli: Int = 0,
    val aiCreditsPeriod: String? = null,
    val subscriptionLimit: SubscriptionLimit? = null,
    val aiEfficiencyCreditsSpent: Double = 0.0,
    val aiEfficiencyCreditsPeriod: String? = null,
    val timeZone: String? = null,
    val morningAiCheckupEnabled: Boolean = false,
    val morningAiCheckupTime: String? = null,
    val efficiencyResetAt: String? = null,
    val efficiencyScore: Double = 0.0,
    val efficiencyTaskScore: Double = 0.0,
    val efficiencyHabitScore: Double = 0.0,
    val efficiencyAiScore: Double = 0.0,
    val efficiencyFocusScore: Double = 0.0,
    val efficiencyLastActivityAt: String? = null,
    val completedLessonIds: List<String> = emptyList(),
    val hasPassword: Boolean = false,
) {
    val monthlyAiBalanceLabel: String get() = subscriptionLimit?.let { "${100 - it.usedPercent.coerceIn(0,100)}%" } ?: aiCredits.toString()
    // Same server-computed remaining percentage as SubscriptionDailyRing.
    // Missing window data is unknown, not a real zero or a monthly substitute.
    val aiBalanceLabel: String get() = subscriptionLimit?.let { limit ->
        limit.daily?.let { "${it.remainingPercent.coerceIn(0,100)}%" } ?: "…"
    } ?: aiCredits.toString()
    val hasAccount: Boolean get() = !username.isNullOrBlank() || !email.isNullOrBlank() || !googleSub.isNullOrBlank() || hasPassword
    val displayName: String get() = name?.takeIf { it.isNotBlank() } ?: username ?: email ?: "Локальный профиль"
}

@Serializable data class UserResponse(val user: CurrentUser)
@Serializable data class LoginRequest(val login: String, val password: String)
@Serializable data class RegisterRequest(val login: String, val email: String, val password: String, val name: String? = null, val consentAccepted: Boolean)
@Serializable data class OkResponse(val ok: Boolean)

@Serializable
data class Sphere(val id: String, val name: String, val color: String, val icon: String? = null, val generalPrompt: String? = null)

enum class TaskType { TASK, EVENT, REMINDER }
enum class TaskStatus { TODO, IN_PROGRESS, DONE }

@Serializable
data class Task(
    val id: String,
    val title: String,
    val description: String? = null,
    val sphereId: String? = null,
    val parentTaskId: String? = null,
    val taskType: TaskType = TaskType.TASK,
    val location: String? = null,
    val notifyBeforeMinutes: Int? = null,
    val isRecurring: Boolean = false,
    val recurrenceText: String? = null,
    val recurrenceJson: kotlinx.serialization.json.JsonObject? = null,
    val recurrenceSummary: String? = null,
    val recurrenceUntil: String? = null,
    val aiNotificationsEnabled: Boolean = false,
    val aiMonitoringEnabled: Boolean = false,
    val aiMonitoringModel: String? = null,
    val importance: Int = 0,
    val urgency: Int = 0,
    val priorityScore: Double = 0.0,
    val dueDate: String? = null,
    val status: TaskStatus = TaskStatus.TODO,
    val isCollaborative: Boolean = false,
    val collaborationOwner: Boolean = false,
    val collaborationColor: String? = null,
    val collaborationMembers: List<CollaborationMember> = emptyList(),
    val creatorName: String? = null,
    val creatorUserId: String? = null,
    val creatorColor: String? = null,
    val commentCount: Int = 0,
    val unreadCommentCount: Int = 0,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class CollaborationMember(
    val userId: String,
    val name: String,
    val color: String,
    val isOwner: Boolean = false
)

@Serializable
data class TaskComment(
    val id: String,
    val taskId: String,
    val userId: String,
    val authorUserId: String,
    val authorName: String,
    val authorColor: String? = null,
    val parentCommentId: String? = null,
    val content: String,
    val isOwn: Boolean = false,
    val createdAt: String,
    val updatedAt: String? = null
)
@Serializable data class TaskCommentsResponse(val comments: List<TaskComment> = emptyList())

enum class HabitRecurrenceType { DAILY, INTERVAL, WEEKDAYS }
enum class HabitDurationMode { FOREVER, UNTIL_DATE, REPEAT_COUNT }

@Serializable
data class HabitStat(val dateKey: String, val amount: Int = 0, val events: Int = 0, val completedAt: String? = null, val autoCompleted: Boolean = false)

@Serializable
data class Habit(
    val id: String,
    val name: String,
    val icon: String,
    val color: String,
    val targetCount: Int,
    val recurrenceType: HabitRecurrenceType,
    val intervalDays: Int? = null,
    val weekdays: List<Int> = emptyList(),
    val reminderTime: String? = null,
    val reminderTimes: List<String> = emptyList(),
    val durationMode: HabitDurationMode = HabitDurationMode.FOREVER,
    val endDate: String? = null,
    val totalRepeatTarget: Int? = null,
    val isAutoCompleted: Boolean = false,
    val autoCompletedAt: String? = null,
    val completedTotal: Int = 0,
    val durationRemaining: Int? = null,
    val isArchived: Boolean = false,
    val stats: List<HabitStat> = emptyList(),
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class StandaloneNote(
    val id: String,
    val title: String = "",
    val content: String = "",
    val groupId: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class TaskAttachment(
    val id: String,
    val taskId: String,
    val name: String,
    val mimeType: String,
    val size: Int,
)
@Serializable data class TaskAttachmentLink(val url: String, val fileName: String)

@Serializable
data class StandaloneNoteGroup(
    val id: String,
    val name: String,
    val color: String = "#8b5cf6",
    val sphereId: String? = null,
)

@Serializable
data class RecurrenceParseResponse(
    val summary: String,
    val schedule: kotlinx.serialization.json.JsonObject,
    val nextDueDate: String? = null,
)

/** The task chat is shared with MiniApp and the desktop site. */
data class TaskAiChatMessage(
    val id:String?=null,
    val role:String,
    val content:String,
    val createdAt:String?=null,
    val authorName:String?=null,
    val authorColor:String?=null,
    val recipientName:String?=null,
    val messageKind:String?=null,
    val monitoringTaskId:String?=null,
    val creditsSpentMilli:Long?=null,
    val webSearchUsed:Boolean = false,
    val webSources:List<Pair<String,String>> = emptyList(),
    val taskProposal: kotlinx.serialization.json.JsonObject? = null,
    val economicProposals: kotlinx.serialization.json.JsonArray?=null,
    val generatedDocument: kotlinx.serialization.json.JsonObject?=null,
    val telegramSendDraft: kotlinx.serialization.json.JsonObject?=null,
    val telegramReadDraft: kotlinx.serialization.json.JsonObject?=null,
    val mailSendDraft: kotlinx.serialization.json.JsonObject?=null,
)
data class TaskAiFile(val name:String,val mimeType:String,val bytes:ByteArray)
data class TaskAiReply(
    val answer:String,
    val taskDataChanged:Boolean=false,
    val actionReports:List<String> = emptyList(),
    val raw:kotlinx.serialization.json.JsonObject
)

@Serializable
data class TaskMonitoringTrigger(
    val id:String,
    val dueAt:String,
    val question:String="",
    val title:String?=null,
    val description:String?=null,
    val state:String=""
)
@Serializable
data class TaskMonitoringStatus(
    val id:String,
    val label:String,
    val detail:String?=null,
    val createdAt:String?=null
)

@kotlinx.serialization.Serializable
data class MascotCatalogSkin(val id:String,val variant:String,val name:String,val description:String="",val rank:Int=0)
@kotlinx.serialization.Serializable
data class MascotWardrobeState(val userId:String,val rank:Int=0,val expiresAt:String?=null,val selected:Map<String,String>,val catalog:List<MascotCatalogSkin>) {
    fun plannerSkin(owner:String?):String {
        if(owner!=userId)return "classic"
        val id=selected["planner"] ?: "classic"
        val activeRank=if(expiresAt?.let{runCatching{java.time.Instant.parse(it).isAfter(java.time.Instant.now())}.getOrDefault(false)}==true)rank else 0
        return catalog.firstOrNull{it.variant=="planner"&&it.id==id&&it.rank<=activeRank}?.id ?: "classic"
    }
}
