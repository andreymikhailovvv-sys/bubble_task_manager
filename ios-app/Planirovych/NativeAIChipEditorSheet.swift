import SwiftUI

/// Edits only allowlisted chip fields. Each write is checked against the current
/// server revision / expected payload so a stale device cannot overwrite a
/// newer task or economic operation.
struct NativeAIChipEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let proposalID: String
    let economic: Bool
    let onSaved: () -> Void

    @State private var proposal: [String: Any] = [:]
    @State private var options: [String: Any] = [:]
    @State private var taskDrafts: [Int: [String: String]] = [:]
    @State private var financeDraft: [String: String] = [:]
    @State private var loading = true
    @State private var saving = false
    @State private var errorText: String?

    private let taskKeys = [
        "title", "description", "sphereId", "dueDate", "importance",
        "urgency", "status", "location", "notifyBeforeMinutes"
    ]
    private let taskLabels = [
        "title": "Название", "description": "Описание", "sphereId": "Сектор",
        "dueDate": "Дата и время", "importance": "Важность", "urgency": "Срочность",
        "status": "Статус", "location": "Место", "notifyBeforeMinutes": "Напомнить за, мин."
    ]
    private let moneyLabels = [
        "kind": "Тип", "title": "Название", "amountMinor": "Сумма",
        "sourceAccountId": "Счёт", "targetAccountId": "Счёт зачисления",
        "accountId": "Счёт долга", "category": "Категория", "note": "Примечание",
        "direction": "Направление", "counterparty": "Контрагент",
        "accountType": "Тип счёта", "balanceMinor": "Баланс",
        "openingBalanceMinor": "Начальный баланс", "creditLimitMinor": "Кредитный лимит",
        "dueAt": "Срок возврата", "occurredAt": "Дата операции",
        "annualRateBps": "Ставка", "termMonths": "Срок, мес.",
        "isClosed": "Закрыт", "postedToAccount": "Проводить по счёту",
        "remindersEnabled": "Напоминания"
    ]

    private struct Choice: Identifiable {
        let id: String
        let title: String
    }

    var body: some View {
        NavigationStack {
            Form {
                if loading {
                    Section { ProgressView("Загрузка актуальной карточки…") }
                } else if economic {
                    economicFields
                } else {
                    taskFields
                }
                if let errorText {
                    Section {
                        Label(errorText, systemImage: "exclamationmark.triangle")
                            .font(.footnote).foregroundStyle(.orange)
                    }
                }
            }
            .navigationTitle("Изменить чип")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }.disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Сохраняем…" : "Сохранить") {
                        Task { await save() }
                    }
                    .disabled(loading || saving || !editable)
                }
            }
        }
        .task { await load() }
    }

    private var editable: Bool {
        ["PENDING", "APPLIED"].contains(proposal["status"] as? String ?? "")
    }

    private var taskFields: some View {
        let operations = proposal["operations"] as? [[String: Any]] ?? []
        return Group {
            ForEach(operations.indices, id: \.self) { index in
                let operation = operations[index]
                if let editableValues = operation["editable"] as? [String: Any] {
                    Section(operation["title"] as? String ?? "Изменение \(index + 1)") {
                        ForEach(taskKeys.filter { editableValues.keys.contains($0) }, id: \.self) { key in
                            taskField(index: index, key: key)
                        }
                    }
                }
            }
            if !operations.contains(where: { $0["editable"] is [String: Any] }) {
                Section {
                    Text("В этой карточке нет полей для редактирования.")
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var economicFields: some View {
        Group {
            if financeDraft.isEmpty {
                Section {
                    Text("У этой финансовой операции нет редактируемых полей.")
                        .foregroundStyle(.secondary)
                }
            } else {
                Section("Параметры операции") {
                    ForEach(financeDraft.keys.sorted(), id: \.self) { key in
                        fieldControl(
                            title: moneyLabels[key] ?? key,
                            value: financeBinding(key),
                            choices: moneyChoices(key)
                        )
                    }
                }
                Section {
                    Text("Изменения будут проверены на сервере. Сумма вводится в рублях, а не в копейках.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    @ViewBuilder
    private func taskField(index: Int, key: String) -> some View {
        let choices: [Choice]?
        switch key {
        case "sphereId":
            let spheres = options["spheres"] as? [[String: Any]] ?? []
            choices = [Choice(id: "", title: "Без сектора")] +
                spheres.compactMap { row -> Choice? in
                    guard let id = row["id"] as? String else { return nil }
                    return Choice(id: id, title: row["name"] as? String ?? id)
                }
        case "status":
            choices = [
                Choice(id: "TODO", title: "Не начато"),
                Choice(id: "IN_PROGRESS", title: "В работе"),
                Choice(id: "DONE", title: "Выполнено")
            ]
        case "importance", "urgency":
            choices = (1...5).map { Choice(id: String($0), title: String($0)) }
        default:
            choices = nil
        }
        fieldControl(title: taskLabels[key] ?? key, value: taskBinding(index, key),
                     choices: choices)
    }

    @ViewBuilder
    private func fieldControl(title: String, value: Binding<String>,
                              choices: [Choice]?) -> some View {
        if let choices, !choices.isEmpty {
            Picker(title, selection: value) {
                ForEach(choices) { choice in
                    Text(choice.title).tag(choice.id)
                }
            }
        } else if title == "Описание" || title == "Примечание" {
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.subheadline).foregroundStyle(.secondary)
                TextField(title, text: value, axis: .vertical)
                    .lineLimit(2...5)
            }
        } else {
            HStack {
                Text(title).font(.subheadline)
                Spacer(minLength: 8)
                TextField(title, text: value)
                    .font(.subheadline)
                    .multilineTextAlignment(.trailing)
                    .textInputAutocapitalization(.never)
            }
        }
    }

    private func taskBinding(_ index: Int, _ key: String) -> Binding<String> {
        Binding(
            get: { taskDrafts[index]?[key] ?? "" },
            set: { newValue in
                var draft = taskDrafts[index] ?? [:]
                draft[key] = newValue
                taskDrafts[index] = draft
            }
        )
    }

    private func financeBinding(_ key: String) -> Binding<String> {
        Binding(
            get: { financeDraft[key] ?? "" },
            set: { financeDraft[key] = $0 }
        )
    }

    private func moneyChoices(_ key: String) -> [Choice]? {
        switch key {
        case "kind":
            return [Choice(id: "EXPENSE", title: "Расход"),
                    Choice(id: "INCOME", title: "Доход"),
                    Choice(id: "TRANSFER", title: "Перевод")]
        case "direction":
            return [Choice(id: "OWE", title: "Я должен"),
                    Choice(id: "OWED_TO_ME", title: "Мне должны")]
        case "accountType":
            return [Choice(id: "STANDARD", title: "Денежный счёт"),
                    Choice(id: "CREDIT_CARD", title: "Кредитная карта")]
        case "isClosed", "postedToAccount", "remindersEnabled":
            return [Choice(id: "true", title: "Да"), Choice(id: "false", title: "Нет")]
        case "sourceAccountId", "targetAccountId", "accountId":
            let rows = options["accounts"] as? [[String: Any]] ?? []
            return [Choice(id: "", title: "Выбрать счёт")] + rows.compactMap { row in
                guard let id = row["id"] as? String else { return nil }
                return Choice(id: id, title: row["name"] as? String ?? id)
            }
        case "category":
            let selectedKind = financeDraft["kind"] ?? "EXPENSE"
            let presets = selectedKind == "INCOME"
                ? ["Зарплата", "Подработка", "Бизнес", "Подарки", "Проценты", "Другое"]
                : ["Продукты", "Кафе и рестораны", "Транспорт", "Жильё",
                   "Покупки", "Здоровье", "Развлечения", "Путешествия",
                   "Образование", "Другое"]
            let remote = (options["categories"] as? [[String: Any]] ?? [])
                .filter { ($0["kind"] as? String) == selectedKind }
                .compactMap { $0["name"] as? String }
            let choices = Array(Set(presets + remote + [financeDraft["category"] ?? ""]))
                .sorted()
            return choices.map { Choice(id: $0, title: $0.isEmpty ? "Без категории" : $0) }
        default: return nil
        }
    }

    private func display(_ value: Any?) -> String {
        guard let value, !(value is NSNull) else { return "" }
        if let string = value as? String { return string }
        return String(describing: value)
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let api = NativeAPI()
            async let info = api.proposalDetails(id: proposalID, economic: economic)
            async let choices = api.proposalOptions(economic: economic)
            proposal = try await info
            options = try await choices
            if economic {
                let payload = proposal["payload"] as? [String: Any] ?? [:]
                let before = proposal["before"] as? [String: Any] ?? [:]
                var combined = payload
                if (proposal["entity"] as? String) == "operation" &&
                    (proposal["action"] as? String) == "update" {
                    for key in ["kind","title","amountMinor","sourceAccountId","targetAccountId",
                                "category","note","occurredAt"] where combined[key] == nil {
                        combined[key] = before[key]
                    }
                }
                for (key, value) in combined where moneyLabels[key] != nil {
                    if key.hasSuffix("Minor"), let raw = Int64(display(value)) {
                        let sign = raw < 0 ? "-" : ""
                        let positive = abs(raw)
                        financeDraft[key] = sign + "\(positive / 100)." +
                            String(format: "%02d", positive % 100)
                    } else if ["dueAt","occurredAt","startDate","paymentDate"].contains(key) {
                        financeDraft[key] = String(display(value).prefix(10))
                    } else {
                        financeDraft[key] = display(value)
                    }
                }
            } else {
                let operations = proposal["operations"] as? [[String: Any]] ?? []
                for (index, operation) in operations.enumerated() {
                    guard let values = operation["editable"] as? [String: Any] else { continue }
                    taskDrafts[index] = values.mapValues(display)
                }
            }
            errorText = nil
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func taskValue(key: String, text: String, original: Any?) throws -> Any {
        if text == display(original) { return original ?? NSNull() }
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if ["importance", "urgency", "notifyBeforeMinutes"].contains(key) {
            guard let number = Int(value) else { throw EditorError.invalid("Поле \(key): требуется число.") }
            return number
        }
        if key == "sphereId" || key == "dueDate" {
            if value.isEmpty { return NSNull() }
            if key == "dueDate" {
                let normalized = value.replacingOccurrences(of: " ", with: "T")
                let parser = DateFormatter()
                parser.locale = Locale(identifier: "en_US_POSIX")
                parser.dateFormat = "yyyy-MM-dd'T'HH:mm"
                if let date = parser.date(from: normalized) {
                    return ISO8601DateFormatter().string(from: date)
                }
                guard ISO8601DateFormatter().date(from: value) != nil else {
                    throw EditorError.invalid("Используй дату в формате 2026-12-10 14:30.")
                }
            }
        }
        return value
    }

    private func saveTaskEdits(api: NativeAPI) async throws {
        let operations = proposal["operations"] as? [[String: Any]] ?? []
        var revision = proposal["revision"] as? String ?? ""
        guard !revision.isEmpty else { throw EditorError.invalid("Карточка устарела. Обнови чат.") }
        for (index, operation) in operations.enumerated() {
            guard let editable = operation["editable"] as? [String: Any],
                  let draft = taskDrafts[index] else { continue }
            var newValues: [String: Any] = [:]
            var changed = false
            for (key, original) in editable {
                let value = try taskValue(key: key, text: draft[key] ?? display(original),
                                          original: original)
                newValues[key] = value
                if display(value) != display(original) { changed = true }
            }
            if !changed { continue }
            let updated = try await api.editTaskProposal(
                id: proposalID, index: index, revision: revision, values: newValues
            )
            revision = updated["revision"] as? String ?? ""
            guard !revision.isEmpty else { throw EditorError.invalid("Нет новой ревизии карточки.") }
        }
    }

    private func financeValue(key: String, value: String, original: Any?) throws -> Any {
        let raw = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if key.hasSuffix("Minor") {
            let normalized = raw.replacingOccurrences(of: ",", with: ".")
            guard normalized.range(of: #"^-?\d{1,12}(?:\.\d{1,2})?$"#,
                                   options: .regularExpression) != nil else {
                throw EditorError.invalid("Сумма: рубли с максимум двумя знаками после запятой.")
            }
            let negative = normalized.hasPrefix("-")
            let parts = normalized.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
                .split(separator: ".", omittingEmptySubsequences: false)
            let rubles = String(parts[0])
            let kopecks = (parts.count > 1 ? String(parts[1]) : "").padding(toLength: 2,
                                                                           withPad: "0", startingAt: 0)
            return (negative ? "-" : "") + rubles + kopecks
        }
        if ["annualRateBps", "termMonths"].contains(key) {
            guard let n = Int(raw) else { throw EditorError.invalid("Введи целое число.") }
            return n
        }
        if ["isClosed", "postedToAccount", "remindersEnabled"].contains(key) {
            return raw == "true"
        }
        if ["dueAt", "occurredAt", "startDate", "paymentDate"].contains(key) {
            if raw.isEmpty { return NSNull() }
            guard raw.range(of: #"^\d{4}-\d{2}-\d{2}$"#,
                            options: .regularExpression) != nil else {
                throw EditorError.invalid("Дата должна быть в формате ГГГГ-ММ-ДД.")
            }
            if let old = original as? String, String(old.prefix(10)) == raw {
                return old
            }
            return raw + "T12:00:00.000Z"
        }
        if raw.isEmpty && ["category","note","lender","targetAccountId","accountId"].contains(key) {
            return NSNull()
        }
        return raw
    }

    private func saveFinanceEdits(api: NativeAPI) async throws {
        let payload = proposal["payload"] as? [String: Any] ?? [:]
        let before = proposal["before"] as? [String: Any] ?? [:]
        var newPayload = payload
        var changed = false
        for (key, value) in financeDraft {
            let existing = payload[key] ?? before[key]
            let encoded = try financeValue(key: key, value: value, original: existing)
            if display(encoded) != display(existing) { changed = true }
            newPayload[key] = encoded
        }
        if changed {
            _ = try await api.editEconomicProposal(
                id: proposalID, payload: newPayload, expectedPayload: payload
            )
        }
    }

    private func save() async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        do {
            let api = NativeAPI()
            if economic { try await saveFinanceEdits(api: api) }
            else { try await saveTaskEdits(api: api) }
            onSaved()
            dismiss()
        } catch {
            errorText = error.localizedDescription
        }
    }

    private enum EditorError: LocalizedError {
        case invalid(String)
        var errorDescription: String? {
            if case let .invalid(message) = self { return message }
            return nil
        }
    }
}
