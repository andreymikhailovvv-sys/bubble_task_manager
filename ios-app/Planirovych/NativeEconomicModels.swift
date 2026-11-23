import Foundation

struct EcoAccount: Codable, Identifiable {
    let id: String
    let name: String
    let accountType: String?
    let balanceMinor: String?
    let openingBalanceMinor: String?
    let creditLimitMinor: String?
    let isPrimary: Bool?
}

struct EcoOperation: Codable, Identifiable {
    let id: String
    let kind: String
    let title: String
    let amountMinor: String
    let sourceAccountId: String?
    let targetAccountId: String?
    let category: String?
    let note: String?
    let occurredAt: String?
    let isAdjustment: Bool?
    let debtId: String?
}

struct EcoDebt: Codable, Identifiable {
    let id: String
    let counterparty: String
    let direction: String?
    let amountMinor: String
    let paidMinor: String
    let isClosed: Bool?
    let postedToAccount: Bool?
    let accountId: String?
    let dueAt: String?
    let note: String?
}

struct EcoLoan: Codable, Identifiable {
    let id: String
    let name: String
    let lender: String?
    let principalMinor: String
    let paidMinor: String
    let annualRateBps: Int?
    let termMonths: Int?
    let monthlyPaymentOverrideMinor: String?
    let startDate: String?
    let paymentDate: String?
    let remindersEnabled: Bool?
    let isClosed: Bool?
}

struct EcoCategory: Codable, Identifiable {
    let id: String
    let kind: String
    let name: String
}

struct EcoTotals: Decodable {
    let balanceMinor: String
    let monthIncomeMinor: String
    let monthExpenseMinor: String
    let operationCount: Int
    let topExpenseCategory: String?
    let topExpenseCategoryMinor: String?
}

struct EcoSnapshot: Decodable {
    let accounts: [EcoAccount]
    let totals: EcoTotals
    let recent: [EcoOperation]
    let categories: [EcoCategory]
    let debts: [EcoDebt]
    let loans: [EcoLoan]
}

struct EcoOperationsEnvelope: Decodable {
    let operations: [EcoOperation]
    let nextCursor: String?
}

struct EcoReportGroup: Decodable {
    let totalMinor: String
    let categories: [EcoReportCategory]
}

struct EcoReportCategory: Codable, Identifiable {
    let name: String
    let amountMinor: String
    var id: String { name }
}

struct EcoReport: Decodable {
    let period: String
    let offset: Int
    let start: String
    let end: String
    let expense: EcoReportGroup
    let income: EcoReportGroup
}

struct EcoSessionEnvelope: Decodable {
    let user: EcoServerUser
}

struct EcoServerUser: Decodable {
    let telegramLinked: Bool
}

/// Money is stored on the server in integer minor units, never a Double.
enum EcoMoney {
    static func decimal(_ minor: String?) -> Decimal {
        let raw = Decimal(string: minor ?? "0", locale: Locale(identifier: "en_US_POSIX")) ?? 0
        return raw / Decimal(100)
    }

    static func formatted(_ minor: String?) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "RUB"
        formatter.locale = Locale(identifier: "ru_RU")
        formatter.maximumFractionDigits = 2
        formatter.minimumFractionDigits = 0
        return formatter.string(from: NSDecimalNumber(decimal: decimal(minor))) ?? "0 ₽"
    }

    static func parse(_ value: String, allowZero: Bool = false, allowNegative: Bool = false) -> String? {
        // Russian currency formatting uses non-breaking spaces as grouping
        // separators. Strip Unicode whitespace before converting to minor units.
        let clean = value.components(separatedBy: .whitespacesAndNewlines)
            .joined().replacingOccurrences(of: ",", with: ".")
        guard clean.range(of: #"^-?\d{1,12}(?:\.\d{1,2})?$"#,
                          options: .regularExpression) != nil else { return nil }
        let negative = clean.hasPrefix("-")
        if negative && !allowNegative { return nil }
        let components = clean.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
            .split(separator: ".", omittingEmptySubsequences: false)
        guard let rubles = Int64(components[0]) else { return nil }
        let cents = components.count > 1
            ? Int64(String(components[1]).padding(toLength: 2, withPad: "0", startingAt: 0))
            : 0
        guard let fraction = cents, rubles <= 9_999_999_999_999 else { return nil }
        let sum = rubles * 100 + fraction
        if sum == 0 && !allowZero { return nil }
        return String(negative ? -sum : sum)
    }

    static func plain(_ minor: String?) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 2
        formatter.locale = Locale(identifier: "ru_RU")
        return formatter.string(from: NSDecimalNumber(decimal: decimal(minor))) ?? "0"
    }
}

enum EcoResource: String, CaseIterable, Identifiable {
    case operations, accounts, debts, loans, categories
    var id: String { rawValue }
    var display: String {
        switch self {
        case .operations: return "Операция"
        case .accounts: return "Счёт"
        case .debts: return "Долг"
        case .loans: return "Кредит"
        case .categories: return "Категория"
        }
    }
    var symbol: String {
        switch self {
        case .operations: return "arrow.left.arrow.right"
        case .accounts: return "creditcard"
        case .debts: return "person.crop.circle.badge.clock"
        case .loans: return "banknote"
        case .categories: return "square.grid.2x2"
        }
    }
}

struct EcoEditorTarget: Identifiable {
    let id: String
    let resource: EcoResource
    let raw: [String: Any]?
    init(resource: EcoResource, raw: [String: Any]? = nil) {
        self.resource = resource
        self.raw = raw
        self.id = (raw?["id"] as? String).map { resource.rawValue + ":" + $0 } ?? resource.rawValue
    }
}
