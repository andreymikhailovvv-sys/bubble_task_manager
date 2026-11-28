package ru.planirovych.app.planik

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.InputType
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import ru.planirovych.app.data.repository.WorkspaceRepository
import ru.planirovych.app.feature.home.ECON_FIELDS
import ru.planirovych.app.feature.home.economicDraft
import ru.planirovych.app.feature.home.economicEditedPayload
import ru.planirovych.app.feature.home.operationTitles
import ru.planirovych.app.feature.home.proposalDescription
import ru.planirovych.app.feature.home.proposalStatusTitles
import ru.planirovych.app.feature.home.taskChipEditable
import ru.planirovych.app.feature.home.taskChipDraftPayload

/** Compact inline cards with the same authenticated, revision-checked server
 * endpoints as the regular AI chat. Never perform a mutation on card mount. */
internal class PlanikPanelProposalCards(
    private val context:Context,
    private val repository:WorkspaceRepository,
    private val scope:CoroutineScope,
    private val isValid:()->Boolean,
    private val verifyAccount:suspend ()->Unit,
    private val makeButton:(String,()->Unit)->Button,
    private val onEdit:()->Unit
) {
    private fun dp(v:Int)=(v*context.resources.displayMetrics.density).toInt()
    private fun JsonObject.string(key:String)=(this[key] as? JsonPrimitive)?.contentOrNull.orEmpty()
    private val ink=0xfff0efff.toInt()
    private val muted=0xffbbb8d5.toInt()
    private fun text(value:String,size:Float=13f,color:Int=ink,bold:Boolean=false)=TextView(context).apply{
        this.text=value;textSize=size;setTextColor(color)
        if(bold)setTypeface(typeface,Typeface.BOLD)
        setPadding(0,dp(4),0,dp(4))
        gravity=Gravity.START
    }
    private fun box()=LinearLayout(context).apply{
        orientation=LinearLayout.VERTICAL
        setPadding(dp(12),dp(10),dp(12),dp(12))
        background=GradientDrawable().apply{
            setColor(0xff20253c.toInt());cornerRadius=dp(18).toFloat()
            setStroke(dp(1),0xff62598d.toInt())
        }
    }
    private fun LinearLayout.addText(value:String,size:Float=13f,color:Int=ink,bold:Boolean=false){
        if(value.isNotBlank())addView(text(value,size,color,bold),LinearLayout.LayoutParams(-1,-2))
    }
    private fun LinearLayout.row(vararg actions:Pair<String,()->Unit>){
        val bar=LinearLayout(context).apply{gravity=Gravity.CENTER_VERTICAL}
        actions.forEachIndexed{index,(label,action)->
            bar.addView(makeButton(label,action),LinearLayout.LayoutParams(0,dp(44),1f).apply{
                if(index>0)marginStart=dp(7)
            })
        }
        addView(bar,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(7)})
    }
    private fun field(container:LinearLayout,label:String,value:String,multi:Boolean=false):EditText{
        container.addText(label,12f,muted)
        return EditText(context).apply{
            setText(value);textSize=14f;setTextColor(ink);setHintTextColor(muted)
            setSingleLine(!multi)
            inputType=InputType.TYPE_CLASS_TEXT or
                (if(multi)InputType.TYPE_TEXT_FLAG_MULTI_LINE else InputType.TYPE_TEXT_FLAG_CAP_SENTENCES)
            setPadding(dp(10),dp(8),dp(10),dp(8))
            background=GradientDrawable().apply{
                setColor(0xff151a2d.toInt());cornerRadius=dp(10).toFloat()
                setStroke(dp(1),0xff595679.toInt())
            }
            container.addView(this,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(5)})
        }
    }

    fun attach(parent:LinearLayout,response:JsonObject):Int{
        val proposals=mutableListOf<Pair<Boolean,JsonObject>>()
        (response["taskProposal"] as? JsonObject)?.let{proposals.add(false to it)}
        (response["economicProposals"] as? JsonArray).orEmpty().forEach{
            (it as? JsonObject)?.let{obj->proposals.add(true to obj)}
        }
        val distinct=proposals.filter{it.second.string("id").isNotBlank()}.distinctBy{it.first to it.second.string("id")}
        distinct.forEach{(economic,initial)->
            val tile=box()
            parent.addView(tile,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(10);bottomMargin=dp(5)})
            Card(tile,economic,initial).render()
        }
        return distinct.size
    }

    private inner class Card(private val tile:LinearLayout,private val economic:Boolean,initial:JsonObject){
        private val id=initial.string("id")
        private var data=initial
        private var busy=false
        private var error=""
        private var verified=false
        private var selected=emptySet<Int>()
        private var selectionInitialized=false
        private fun status()=data.string("status")
        private fun ops()=(data["operations"] as? JsonArray).orEmpty()
        private suspend fun latest()=if(economic)repository.economicProposal(id) else repository.getTaskAiProposal(id)
        private fun run(action:suspend ()->Unit){
            if(busy || !isValid())return
            busy=true;error=""
            tile.removeAllViews()
            tile.addText("Обновляю карточку…",14f,muted)
            scope.launch{
                try{
                    verifyAccount()
                    if(!isValid())return@launch
                    action()
                    verified=true
                    PlanikLiveUpdates.publish()
                }catch(cancel:CancellationException){throw cancel}
                catch(e:Exception){
                    error=e.message?.take(180)?:"Не удалось обновить карточку."
                    verified=false
                    if(isValid())try {
                        verifyAccount()
                        data=latest();verified=true
                    }catch(cancel:CancellationException){throw cancel}
                    catch(_:Exception){}
                }finally{
                    busy=false
                    if(isValid())render()
                }
            }
        }
        fun render(){
            tile.removeAllViews()
            tile.addText(if(economic)data.string("title").ifBlank{"Финансовое действие"} else "Предложенные изменения",16f,ink,true)
            val state=status()
            val statusText=if(state=="APPLIED" && (data["autoApplied"] as? JsonPrimitive)?.booleanOrNull==true)
                "Применено автоматически" else proposalStatusTitles[state]?:state.ifBlank{"Уточняю статус"}
            tile.addText(statusText,12f,if(state=="APPLIED")0xff82e6b3.toInt() else muted)
            if(economic){
                tile.addText(data.string("description"),14f)
                economicDraft(data).filterKeys{it !in setOf("sourceAccountId","targetAccountId","accountId")}.forEach{(key,value)->
                    if(value.isNotBlank())tile.addText((ECON_FIELDS[key]?:key)+": "+value)
                }
            }else{
                val checkup=data.string("source")=="daily_checkup"
                if(checkup && !selectionInitialized){selected=ops().indices.toSet();selectionInitialized=true}
                ops().forEachIndexed{index,entry->
                    val item=entry as? JsonObject?:return@forEachIndexed
                    val title=(operationTitles[item.string("type")]?:"Изменение")+" · "+item.string("title")
                    if(checkup && state=="PENDING"){
                        tile.addView(android.widget.CheckBox(context).apply{
                            text=title;setTextColor(ink);isChecked=index in selected
                            setOnCheckedChangeListener{_,checked->selected=if(checked)selected+index else selected-index}
                        })
                    }else tile.addText(title,14f,ink,true)
                    proposalDescription(item)?.let{tile.addText(it,13f,muted)}
                    val fields=taskChipEditable(item)
                    val description=(fields?.get("description") as? JsonPrimitive)?.contentOrNull
                    if(!description.isNullOrBlank())tile.addText(description.take(400),13f)
                }
            }
            if(error.isNotBlank())tile.addText(error,12f,0xffffb2b8.toInt())
            if(!verified){
                tile.row("Обновить карточку" to {run{data=latest()}})
                if(error.isBlank())run{data=latest()}
                return
            }
            val canEdit=if(economic)economicDraft(data).keys.any{it in economicKeys}
                else ops().any{(it as? JsonObject)?.let(::taskChipEditable)?.keys?.any{key->key in taskKeys}==true}
            when(state){
                "PENDING"->{
                    if(canEdit)tile.row("Изменить" to {edit()})
                    tile.row("Применить" to {confirm("approve")},"Отклонить" to {confirm("reject")})
                }
                "APPLIED"->{
                    if(canEdit)tile.row("Изменить" to {edit()})
                    tile.row("Отменить изменения" to {confirm("undo")})
                }
            }
        }

        private fun confirm(action:String){
            if(action=="approve" && data.string("source")=="daily_checkup" && selected.isEmpty()){
                error="Выберите хотя бы одно действие.";render();return
            }
            tile.removeAllViews()
            tile.addText(when(action){
                "approve"->"Применить изменения?"
                "reject"->"Отклонить предложение?"
                else->"Отменить ранее внесённые изменения?"
            },16f,ink,true)
            tile.row("Назад" to {render()},"Подтвердить" to {
                run{
                    data=if(economic)repository.economicProposalAction(id,action)
                    else repository.updateTaskAiProposal(id,action,
                        if(action=="approve" && data.string("source")=="daily_checkup")selected.sorted() else null)
                }
            })
        }

        private fun edit(){
            onEdit()
            tile.removeAllViews()
            tile.addText("Изменить поля",16f,ink,true)
            if(economic){
                val original=economicDraft(data)
                val inputs=original.filterKeys{it in economicKeys}.mapValues{(key,value)->
                    field(tile,ECON_FIELDS[key]?:key,value,key=="note")
                }
                tile.row("Отмена" to {render()},"Сохранить" to {
                    val values=original+inputs.mapValues{it.value.text.toString()}
                    run{
                        val edited=economicEditedPayload(values,data)
                        data=repository.editEconomicProposal(id,buildJsonObject{
                            put("payload",edited);put("expectedPayload",data["payload"]?:buildJsonObject{})
                        })
                    }
                })
            }else{
                val editors=linkedMapOf<Int,Pair<JsonObject,Map<String,EditText>>>()
                ops().forEachIndexed{index,entry->
                    val item=entry as? JsonObject?:return@forEachIndexed
                    val original=taskChipEditable(item)?:return@forEachIndexed
                    val visible=original.filterKeys{it in taskKeys}
                    if(visible.isEmpty())return@forEachIndexed
                    tile.addText(item.string("title").ifBlank{"Изменение "+(index+1)},14f,ink,true)
                    editors[index]=original to visible.mapValues{(key,value)->
                        field(tile,taskKeys[key]?:key,(value as? JsonPrimitive)?.contentOrNull.orEmpty(),key=="description")
                    }
                }
                tile.row("Отмена" to {render()},"Сохранить" to {
                    // Snapshot the text before replacing the editing controls.
                    val changes=editors.mapValues{(_,pair)->
                        val (original,inputs)=pair
                        original.toMutableMap().apply{
                            inputs.forEach{(key,input)->
                                val before=(original[key] as? JsonPrimitive)?.contentOrNull.orEmpty()
                                val after=input.text.toString()
                                if(before!=after)put(key,JsonPrimitive(after))
                            }
                        }
                    }
                    run{
                        for((index,fields) in changes){
                            val existing=(ops().getOrNull(index) as? JsonObject)?.let(::taskChipEditable)?:continue
                            val values=taskChipDraftPayload(fields)
                            if(values==existing)continue
                            val revision=data.string("revision").ifBlank{error("Карточка устарела. Обновите чат.")}
                            data=repository.editTaskAiProposal(id,buildJsonObject{
                                put("index",index);put("revision",revision);put("values",values)
                            })
                        }
                    }
                })
            }
        }
    }

    companion object {
        private val taskKeys=mapOf("title" to "Название","description" to "Описание",
            "dueDate" to "Дата и время (ISO)","location" to "Место","importance" to "Важность (1–5)",
            "urgency" to "Срочность (1–5)","notifyBeforeMinutes" to "Напоминание, мин.")
        private val economicKeys=setOf("name","title","counterparty","amountMinor","balanceMinor",
            "openingBalanceMinor","creditLimitMinor","principalMinor","paidMinor","category","note",
            "dueAt","occurredAt","startDate","paymentDate","lender","annualRateBps","termMonths")
    }
}
