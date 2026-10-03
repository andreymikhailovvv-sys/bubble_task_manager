package ru.planirovych.app.data.model

import kotlinx.serialization.Serializable

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
    val hasAccount: Boolean get() = !username.isNullOrBlank() || !email.isNullOrBlank() || !googleSub.isNullOrBlank() || hasPassword
    val displayName: String get() = name?.takeIf { it.isNotBlank() } ?: username ?: email ?: "Локальный профиль"
}

@Serializable data class UserResponse(val user: CurrentUser)
@Serializable data class LoginRequest(val login: String, val password: String)
@Serializable data class RegisterRequest(val login: String, val password: String, val name: String? = null, val consentAccepted: Boolean)
@Serializable data class OkResponse(val ok: Boolean)

@Serializable
data class Sphere(val id: String, val name: String, val color: String, val icon: String? = null, val generalPrompt: String? = null)

enum class TaskType { TASK, EVENT }
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
    val importance: Int = 0,
    val urgency: Int = 0,
    val priorityScore: Double = 0.0,
    val dueDate: String? = null,
    val status: TaskStatus = TaskStatus.TODO,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

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
