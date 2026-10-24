package ru.planirovych.app.data.model

import kotlinx.serialization.json.*

const val QUICK_AI_THREAD_ID = "quick-ai-requests"
const val QUICK_AI_TITLE = "Быстрые запросы"
const val PERSONAL_AI_PROJECT_TITLE = "Личный проект"
const val TELEGRAM_AI_PROJECT_ID = "telegram-ai-assistant-project"

internal fun JsonObject.aiString(key:String,default:String=""):String =
    (this[key] as? JsonPrimitive)?.contentOrNull ?: default

/** Preserve unknown message and project fields when saving across app versions. */
data class GeneralAiThread(
    val id:String,
    val title:String,
    val model:String?=null,
    val modelChangedAt:String?=null,
    val messages:List<JsonObject> = emptyList(),
    val raw:JsonObject=JsonObject(emptyMap())
){
    fun toJson():JsonObject = JsonObject(raw.toMutableMap().apply{
        put("id",JsonPrimitive(id));put("title",JsonPrimitive(title))
        if(model!=null)put("model",JsonPrimitive(model))else remove("model")
        if(modelChangedAt!=null)put("modelChangedAt",JsonPrimitive(modelChangedAt))
        put("messages",JsonArray(messages))
    })
}
data class GeneralAiProject(
    val id:String,
    val title:String,
    val color:String,
    val icon:String,
    val chats:List<GeneralAiThread>,
    val raw:JsonObject=JsonObject(emptyMap())
){
    val isTelegram:Boolean get()=id==TELEGRAM_AI_PROJECT_ID
    fun toJson():JsonObject=JsonObject(raw.toMutableMap().apply{
        put("id",JsonPrimitive(id));put("title",JsonPrimitive(title))
        put("color",JsonPrimitive(color));put("icon",JsonPrimitive(icon))
        put("chats",JsonArray(chats.map{it.toJson()}))
    })
}
fun parseGeneralAiProjects(raw:JsonObject):List<GeneralAiProject>{
    val projects=(raw["projects"] as? JsonArray).orEmpty()
    return projects.mapNotNull{p->
        val item=p as? JsonObject ?:return@mapNotNull null
        val id=item.aiString("id")
        if(id.isBlank())return@mapNotNull null
        val chats=(item["chats"] as? JsonArray).orEmpty().mapNotNull{c->
            val entry=c as? JsonObject?:return@mapNotNull null
            val chatId=entry.aiString("id")
            if(chatId.isBlank())return@mapNotNull null
            GeneralAiThread(id=chatId,title=entry.aiString("title","Новый чат"),
                model=entry.aiString("model").takeIf{it.isNotBlank()},
                modelChangedAt=entry.aiString("modelChangedAt").takeIf{it.isNotBlank()},
                messages=(entry["messages"] as? JsonArray).orEmpty()
                    .mapNotNull{it as? JsonObject},raw=entry)
        }
        GeneralAiProject(id=id,title=item.aiString("title","Проект"),
            color=item.aiString("color","#8b5cf6"),
            icon=item.aiString("icon","✨"),chats=chats,raw=item)
    }
}
fun defaultGeneralAiProjects():List<GeneralAiProject> =
    listOf(GeneralAiProject(java.util.UUID.randomUUID().toString(),
        PERSONAL_AI_PROJECT_TITLE,"#8b5cf6","✨",listOf(
            GeneralAiThread(QUICK_AI_THREAD_ID,QUICK_AI_TITLE))))

fun generalAiMessage(item:JsonObject):TaskAiChatMessage{
    val sources=(item["webSources"] as? JsonArray).orEmpty().mapNotNull{value->
        val entry=value as? JsonObject?:return@mapNotNull null
        entry.aiString("url").takeIf{it.isNotBlank()}?.let{
            entry.aiString("title",it) to it
        }
    }
    return TaskAiChatMessage(
        id=item.aiString("id").ifBlank{null},
        role=item.aiString("role","assistant"),
        content=item.aiString("content"),createdAt=item.aiString("createdAt"),
        authorName=item.aiString("authorName").ifBlank{null},
        creditsSpentMilli=(item["creditsSpentMilli"] as? JsonPrimitive)
            ?.contentOrNull?.toLongOrNull(),
        webSources=sources,taskProposal=item["taskProposal"] as? JsonObject,
        generatedDocument=item["generatedDocument"] as? JsonObject,
        telegramSendDraft=item["telegramSendDraft"] as? JsonObject,
        telegramReadDraft=item["telegramReadDraft"] as? JsonObject
    )
}
