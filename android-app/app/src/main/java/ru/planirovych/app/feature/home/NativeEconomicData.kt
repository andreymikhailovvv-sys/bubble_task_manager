package ru.planirovych.app.feature.home

import androidx.compose.ui.graphics.Color
import kotlinx.serialization.json.*
import java.math.BigDecimal
import java.math.BigInteger
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.pow
import kotlin.math.roundToLong

/** Financial money is kept in integer kopecks, exactly as in the Economic API. */
internal fun JsonObject?.ecoText(key: String): String =
    (this?.get(key) as? JsonPrimitive)?.contentOrNull.orEmpty()
internal fun JsonObject?.ecoBool(key: String): Boolean =
    (this?.get(key) as? JsonPrimitive)?.booleanOrNull == true
internal fun JsonObject?.ecoNumber(key: String): Int =
    (this?.get(key) as? JsonPrimitive)?.intOrNull ?: 0
internal fun JsonObject?.ecoItems(key: String): List<JsonObject> =
    (this?.get(key) as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()
internal fun JsonObject?.ecoObject(key: String): JsonObject? = this?.get(key) as? JsonObject

internal fun ecoRubles(minor: String): String {
    val n = minor.toBigIntegerOrNull() ?: BigInteger.ZERO
    val absolute = n.abs()
    val whole = absolute.divide(BigInteger.valueOf(100))
    val kopecks = absolute.remainder(BigInteger.valueOf(100)).toString().padStart(2, '0')
    val grouped = java.text.NumberFormat.getIntegerInstance(Locale.forLanguageTag("ru-RU")).format(whole)
    return (if (n.signum() < 0) "−" else "") + grouped + "," + kopecks + " ₽"
}
/** Whole rubles for compact dashboard totals; ledger and editors retain kopeck precision. */
internal fun ecoWholeRubles(minor: String): String {
    val n = minor.toBigIntegerOrNull() ?: BigInteger.ZERO
    val half = BigInteger.valueOf(50)
    val rounded = n.abs().add(half).divide(BigInteger.valueOf(100))
    val grouped = java.text.NumberFormat.getIntegerInstance(Locale.forLanguageTag("ru-RU")).format(rounded)
    return (if (n.signum()<0) "−" else "") + grouped + " ₽"
}
internal fun ecoInput(minor: String): String {
    val n = minor.toBigIntegerOrNull() ?: BigInteger.ZERO
    return (if (n.signum() < 0) "-" else "") +
        n.abs().divide(BigInteger.valueOf(100)).toString() + "," +
        n.abs().remainder(BigInteger.valueOf(100)).toString().padStart(2, '0')
}
internal fun ecoParseMoney(value: String, negative: Boolean = false): String {
    val clean = value.trim().replace(Regex("[\\s\\u00a0\\u202f]"), "").replace(',', '.')
    val pattern = if (negative) Regex("-?\\d{1,12}(\\.\\d{1,2})?")
        else Regex("\\d{1,12}(\\.\\d{1,2})?")
    require(pattern.matches(clean)) { "Введите сумму в рублях, не более двух знаков после запятой" }
    return BigDecimal(clean).movePointRight(2).toBigIntegerExact().toString()
}
internal fun ecoIsoDate(day: String, utc: Boolean = false): String {
    val parsed = LocalDate.parse(day)
    return parsed.atTime(12, 0).atZone(if (utc) ZoneId.of("UTC") else ZoneId.systemDefault())
        .toInstant().toString()
}
internal fun ecoDay(iso: String): String = try {
    java.time.Instant.parse(iso).atZone(ZoneId.systemDefault()).toLocalDate().toString()
} catch (_: Exception) { iso.take(10) }
internal fun ecoDateLabel(iso: String): String = try {
    LocalDate.parse(ecoDay(iso)).format(DateTimeFormatter.ofPattern("dd.MM.yyyy"))
} catch (_: Exception) { if (iso.isBlank()) "Без даты" else iso.take(10) }
internal fun ecoKindLabel(kind: String): String = when (kind) {
    "INCOME" -> "Доход"
    "EXPENSE" -> "Расход"
    "TRANSFER" -> "Перевод"
    "DEBT_BORROWED" -> "Получено в долг"
    "DEBT_LENT" -> "Выдано в долг"
    "DEBT_REPAID" -> "Погашение долга"
    "DEBT_RETURNED" -> "Вернули долг"
    else -> "Финансовая операция"
}
internal val ecoExpenseCategories = listOf(
    "Продукты", "Кафе и рестораны", "Транспорт", "Жильё", "Покупки",
    "Здоровье", "Развлечения", "Путешествия", "Образование", "Другое"
)
internal val ecoIncomeCategories = listOf("Зарплата", "Подработка", "Бизнес", "Подарки", "Проценты", "Другое")
internal fun ecoCategories(snapshot: JsonObject, kind: String): List<String> =
    ((if (kind == "INCOME") ecoIncomeCategories else ecoExpenseCategories) +
        snapshot.ecoItems("categories").filter { it.ecoText("kind") == kind }.map { it.ecoText("name") })
        .distinct()

/** Same conventional annuity estimate as client/src/lib/economicMoney.ts. */
internal data class EcoLoanEstimate(val monthly: BigInteger, val total: BigInteger, val overpay: BigInteger)
internal fun ecoLoanEstimate(loan: JsonObject): EcoLoanEstimate {
    val principal = loan.ecoText("principalMinor").toBigIntegerOrNull() ?: BigInteger.ZERO
    val months = loan.ecoNumber("termMonths").coerceIn(1, 600)
    val monthlyRate = loan.ecoNumber("annualRateBps") / 10000.0 / 12.0
    val rubles = principal.toDouble() / 100.0
    val payment = if (monthlyRate > 0.0) {
        rubles * monthlyRate / (1.0 - (1.0 + monthlyRate).pow(-months))
    } else rubles / months
    val monthly = BigInteger.valueOf(payment.times(100.0).roundToLong())
    val total = monthly.multiply(BigInteger.valueOf(months.toLong())).max(principal)
    return EcoLoanEstimate(monthly, total, total.subtract(principal))
}
internal fun ecoProgress(paid: String, total: String): Float {
    val denominator = total.toBigIntegerOrNull() ?: BigInteger.ZERO
    val numerator = paid.toBigIntegerOrNull() ?: BigInteger.ZERO
    if (denominator.signum() <= 0) return 0f
    return numerator.multiply(BigInteger.valueOf(1000)).divide(denominator)
        .toFloat().div(1000f).coerceIn(0f, 1f)
}

internal data class EcoColors(
    val background: Color, val panel: Color, val panel2: Color, val outline: Color,
    val text: Color, val muted: Color, val gold: Color, val goldSoft: Color,
    val green: Color, val field: Color, val bannerStart: Color, val bannerEnd: Color
)
/** Keep native finance surfaces in step with client/src/EconomicApp.css mobile tokens. */
internal fun ecoColors(dark: Boolean) = if (dark) EcoColors(
    background = Color(0xFF12131B), panel = Color(0xFF1B1D28), panel2 = Color(0xFF20232F),
    outline = Color(0xFF383741), text = Color(0xFFF4EFE8), muted = Color(0xFFAAA5A1),
    gold = Color(0xFFF6A83F), goldSoft = Color(0xFFFFCE83), green = Color(0xFFA7DFB6),
    field = Color(0xFF252631), bannerStart = Color(0xFF34302D), bannerEnd = Color(0xFF633B1D)
) else EcoColors(
    background = Color(0xFFF7F8FA), panel = Color.White, panel2 = Color(0xFFF8F9FB),
    outline = Color(0xFFE2E5EA), text = Color(0xFF202A38), muted = Color(0xFF647181),
    gold = Color(0xFFDF8B25), goldSoft = Color(0xFFAE681B), green = Color(0xFF23824C),
    field = Color(0xFFF7F8FA), bannerStart = Color.White, bannerEnd = Color(0xFFFFF9F0)
)
