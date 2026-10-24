package ru.planirovych.app.data.model

import kotlinx.serialization.Serializable

@Serializable
data class AiCreditPack(
    val key:String,val name:String="",val creditsAmount:Int=0,
    val price:Int=0,val isActive:Boolean=true
)
@Serializable
data class AiCreditCatalog(
    val packs:List<AiCreditPack> = emptyList(),
    val purchaseAvailable:Boolean=false,val paymentProvider:String?=null
)
@Serializable
data class AiCreditPurchaseStart(
    val purchaseId:String,val status:String="",val confirmationUrl:String?=null
)
@Serializable
data class AiCreditPurchase(
    val id:String,val creditPackKey:String="",val creditsAmount:Int=0,
    val price:Int=0,val status:String="",val credited:Boolean=false
)
@Serializable
data class AiCreditPurchaseStatus(val purchase:AiCreditPurchase)
@Serializable
data class AiCreditUsageItem(val key:String="",val label:String="",val creditsMilli:Long=0)
@Serializable
data class AiCreditUsage(
    val todayCreditsMilli:Long=0,val weekCreditsMilli:Long=0,
    val monthCreditsMilli:Long=0,val averageDailyCreditsMilli:Long=0,
    val byModel:List<AiCreditUsageItem> = emptyList(),
    val byFeature:List<AiCreditUsageItem> = emptyList(),
    val trackingStartedAt:String?=null
)
@Serializable
data class AiCreditUsageResponse(val statistics:AiCreditUsage)
