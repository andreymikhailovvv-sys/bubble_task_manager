import SwiftUI

struct NativeEconomicEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let target: EcoEditorTarget
    let snapshot: EcoSnapshot
    let telegramLinked: Bool
    let isSaving: Bool
    let onSave: ([String: Any]) async -> Bool
    let onDelete: (() -> Void)?

    @State private var name: String
    @State private var title: String
    @State private var positions: [EcoPositionDraft]
    @State private var amount: String
    @State private var balance: String
    @State private var paid: String
    @State private var creditLimit: String
    @State private var rate: String
    @State private var months: String
    @State private var monthlyOverride: String
    @State private var accountType: String
    @State private var kind: String
    @State private var sourceID: String
    @State private var targetID: String
    @State private var category: String
    @State private var note: String
    @State private var counterparty: String
    @State private var direction: String
    @State private var lender: String
    @State private var postedToAccount: Bool
    @State private var isPrimary: Bool
    @State private var isClosed: Bool
    @State private var remindersEnabled: Bool
    @State private var date: Date
    @State private var dueEnabled: Bool
    @State private var dueDate: Date
    @State private var paymentEnabled: Bool
    @State private var paymentDate: Date
    @State private var saving = false
    @State private var errorText: String?
    @State private var showingDelete = false

    private var editing: Bool { target.raw?["id"] as? String != nil }
    private var resource: EcoResource { target.resource }

    init(target: EcoEditorTarget, snapshot: EcoSnapshot, telegramLinked: Bool,
         isSaving: Bool, onSave: @escaping ([String: Any]) async -> Bool,
         onDelete: (() -> Void)?) {
        self.target = target
        self.snapshot = snapshot
        self.telegramLinked = telegramLinked
        self.isSaving = isSaving
        self.onSave = onSave
        self.onDelete = onDelete
        let row = target.raw ?? [:]
        let raw: (String) -> String = { key in
            guard let value = row[key], !(value is NSNull) else { return "" }
            return String(describing: value)
        }
        let today = Date()
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date: (String) -> Date? = { key in
            guard let value = row[key] as? String else { return nil }
            if let parsed = iso.date(from: value) { return parsed }
            iso.formatOptions = [.withInternetDateTime]
            return iso.date(from: value)
        }
        _name = State(initialValue: raw("name"))
        _title = State(initialValue: raw("title"))
        _positions = State(initialValue: EcoPositionDraft.read(raw("positionsJson")))
        _amount = State(initialValue: target.resource == .operations && !raw("calculation").isEmpty
            ? raw("calculation") : EcoMoney.plain(target.resource == .loans ? raw("principalMinor") : raw("amountMinor")))
        _balance = State(initialValue: EcoMoney.plain(raw("balanceMinor").isEmpty ?
                                                     raw("openingBalanceMinor") : raw("balanceMinor")))
        _paid = State(initialValue: EcoMoney.plain(raw("paidMinor")))
        _creditLimit = State(initialValue: EcoMoney.plain(raw("creditLimitMinor")))
        _rate = State(initialValue: raw("annualRateBps").isEmpty ? "0" :
                      String((Double(raw("annualRateBps")) ?? 0) / 100))
        _months = State(initialValue: raw("termMonths").isEmpty ? "12" : raw("termMonths"))
        _monthlyOverride = State(initialValue: raw("monthlyPaymentOverrideMinor").isEmpty ?
                                 "" : EcoMoney.plain(raw("monthlyPaymentOverrideMinor")))
        _accountType = State(initialValue: raw("accountType").isEmpty ? "STANDARD" : raw("accountType"))
        _kind = State(initialValue: raw("kind").isEmpty ?
                      (target.resource == .categories ? "EXPENSE" : "EXPENSE") : raw("kind"))
        let defaultAccount = snapshot.accounts.first(where: { $0.isPrimary == true })?.id
            ?? snapshot.accounts.first?.id ?? ""
        _sourceID = State(initialValue: raw("sourceAccountId").isEmpty ?
                          (raw("accountId").isEmpty ? defaultAccount : raw("accountId")) :
                          raw("sourceAccountId"))
        _targetID = State(initialValue: raw("targetAccountId"))
        _category = State(initialValue: raw("category"))
        _note = State(initialValue: raw("note"))
        _counterparty = State(initialValue: raw("counterparty"))
        _direction = State(initialValue: raw("direction").isEmpty ? "OWE" : raw("direction"))
        _lender = State(initialValue: raw("lender"))
        _postedToAccount = State(initialValue: row["postedToAccount"] as? Bool ?? false)
        _isPrimary = State(initialValue: row["isPrimary"] as? Bool ?? false)
        _isClosed = State(initialValue: row["isClosed"] as? Bool ?? false)
        _remindersEnabled = State(initialValue: row["remindersEnabled"] as? Bool ?? false)
        _date = State(initialValue: date("occurredAt") ?? date("startDate") ?? today)
        _dueEnabled = State(initialValue: row["dueAt"] != nil &&
                             !(row["dueAt"] is NSNull))
        _dueDate = State(initialValue: date("dueAt") ?? today)
        _paymentEnabled = State(initialValue: row["paymentDate"] != nil &&
                                 !(row["paymentDate"] is NSNull))
        _paymentDate = State(initialValue: date("paymentDate") ?? today)
    }

    var body: some View {
        NavigationStack {
            Form {
                switch resource {
                case .accounts: accountFields
                case .operations: operationFields
                case .debts: debtFields
                case .loans: loanFields
                case .categories: categoryFields
                }
                if let errorText {
                    Section {
                        Label(errorText, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                    }
                }
                if editing, onDelete != nil {
                    Section {
                        Button(role: .destructive) {
                            showingDelete = true
                        } label: {
                            Label("Удалить запись", systemImage: "trash")
                        }
                        .disabled(saving || isSaving)
                    }
                }
            }
            .navigationTitle(editing ? "Изменить: \(resource.display.lowercased())" :
                              "Добавить: \(resource.display.lowercased())")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Сохраняем…" : "Сохранить") {
                        Task { await submit() }
                    }
                    .disabled(saving || isSaving)
                }
            }
            .confirmationDialog("Удалить запись?", isPresented: $showingDelete,
                                titleVisibility: .visible) {
                Button("Удалить навсегда", role: .destructive) {
                    onDelete?()
                    dismiss()
                }
                Button("Отмена", role: .cancel) {}
            } message: {
                Text("Изменения отразятся на всех устройствах.")
            }
        }
    }

    private var accountFields: some View {
        Group {
            Section("Счёт") {
                TextField("Название счёта", text: $name)
                    .textInputAutocapitalization(.sentences)
                Picker("Тип счёта", selection: $accountType) {
                    Text("Денежный счёт").tag("STANDARD")
                    Text("Кредитная карта").tag("CREDIT_CARD")
                }
                if accountType == "CREDIT_CARD" {
                    moneyInput("Кредитный лимит, ₽", value: $creditLimit)
                }
                moneyInput(accountType == "CREDIT_CARD" ? "Доступный остаток, ₽" : "Баланс, ₽",
                           value: $balance)
                if editing && accountType != "CREDIT_CARD" && !isPrimary {
                    Toggle("Сделать основным", isOn: $isPrimary)
                }
            }
            Section {
                Text("Изменение баланса создаёт корректировку на сервере; существующие операции не переписываются.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var operationFields: some View {
        Group {
            Section("Операция") {
                Picker("Тип операции", selection: $kind) {
                    Text("Расход").tag("EXPENSE")
                    Text("Доход").tag("INCOME")
                    Text("Перевод между счетами").tag("TRANSFER")
                }
                TextField("Название", text: $title)
                moneyInput("Сумма, ₽", value: $amount, calculator: true)
                if EcoMoney.isExpression(amount) {
                    Text(EcoMoney.calculate(amount).map { "= " + EcoMoney.formatted($0) } ?? "Введите корректное выражение")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                accountPicker(kind == "TRANSFER" ? "Счёт списания" : "Счёт", selection: $sourceID)
                if kind == "TRANSFER" {
                    accountPicker("Счёт зачисления", selection: $targetID, except: sourceID)
                } else {
                    Picker("Категория", selection: $category) {
                        Text("Без категории").tag("")
                        let list = Array(Set(snapshot.categories
                            .filter { $0.kind == kind }.map(\.name))).sorted()
                        ForEach(list, id: \.self) { name in Text(name).tag(name) }
                    }
                }
                DatePicker("Дата и время", selection: $date, displayedComponents: [.date, .hourAndMinute])
                TextField("Примечание", text: $note, axis: .vertical)
                    .lineLimit(2...4)
            }
            Section("Позиции") {
                ForEach($positions) { $position in
                    HStack {
                        TextField("Название", text: $position.name)
                        TextField("Сумма, ₽", text: Binding(
                            get: { position.amount },
                            set: { position.amount = EcoMoney.grouped($0) }
                        ))
                        .keyboardType(.numbersAndPunctuation)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 110)
                        Button(role: .destructive) {
                            positions.removeAll { $0.id == position.id }
                        } label: { Image(systemName: "xmark.circle") }
                        .buttonStyle(.borderless)
                    }
                }
                if positions.count < 100 {
                    Button { positions.append(EcoPositionDraft()) } label: {
                        Label("Добавить позицию", systemImage: "plus")
                    }
                }
                if !positions.isEmpty {
                    Button("Использовать сумму позиций") {
                        var total: Int64 = 0
                        for position in positions {
                            guard let parsed = EcoMoney.parse(position.amount, allowZero: true, allowNegative: true),
                                  let number = Int64(parsed) else {
                                errorText = "Укажите сумму каждой позиции."
                                return
                            }
                            let (next, overflow) = total.addingReportingOverflow(number)
                            guard !overflow else { errorText = "Сумма вне допустимого диапазона."; return }
                            total = next
                        }
                        guard total > 0, total <= 999_999_999_999_999 else {
                            errorText = "Сумма позиций должна быть положительной и допустимой."
                            return
                        }
                        amount = EcoMoney.grouped(EcoMoney.plain(String(total)))
                        errorText = nil
                    }
                }
            }
        }
    }

    private var debtFields: some View {
        Group {
            Section("Долг") {
                Picker("Направление", selection: $direction) {
                    Text("Я должен").tag("OWE")
                    Text("Мне должны").tag("OWED_TO_ME")
                }
                TextField("Человек или организация", text: $counterparty)
                moneyInput("Сумма долга, ₽", value: $amount)
                moneyInput("Уже погашено, ₽", value: $paid)
                Toggle("Учитывать на счёте", isOn: $postedToAccount)
                if postedToAccount {
                    accountPicker("Счёт", selection: $sourceID)
                }
                Toggle("Указать срок возврата", isOn: $dueEnabled)
                if dueEnabled {
                    DatePicker("До", selection: $dueDate, displayedComponents: .date)
                }
                TextField("Примечание", text: $note, axis: .vertical)
                    .lineLimit(2...4)
                if editing {
                    Toggle("Долг закрыт", isOn: $isClosed)
                }
            }
        }
    }

    private var loanFields: some View {
        Group {
            Section("Кредит") {
                TextField("Название кредита", text: $name)
                TextField("Кредитор", text: $lender)
                moneyInput("Тело кредита, ₽", value: $amount)
                moneyInput("Уже погашено, ₽", value: $paid)
                HStack {
                    Text("Годовая ставка, %")
                    Spacer()
                    TextField("0", text: $rate)
                        .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                }
                Stepper("Срок: \(months) мес.", value: Binding(
                    get: { Int(months) ?? 12 },
                    set: { months = String($0) }
                ), in: 1...600)
                if !monthlyOverride.isEmpty {
                    moneyInput("Платёж по графику, ₽", value: $monthlyOverride)
                } else {
                    Button("Указать платёж вручную") { monthlyOverride = "0" }
                        .font(.subheadline)
                }
                DatePicker("Начало кредита", selection: $date, displayedComponents: .date)
                Toggle("Указать дату платежа", isOn: $paymentEnabled)
                if paymentEnabled {
                    DatePicker("Дата платежа", selection: $paymentDate, displayedComponents: .date)
                }
                Toggle("Напоминать о платеже через Telegram", isOn: $remindersEnabled)
                    .disabled(!telegramLinked || !paymentEnabled)
                if !telegramLinked {
                    Text("Для Telegram-напоминаний подключите бота Планировыча.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if editing {
                    Toggle("Кредит закрыт", isOn: $isClosed)
                }
            }
        }
    }

    private var categoryFields: some View {
        Section("Категория") {
            Picker("Тип", selection: $kind) {
                Text("Расход").tag("EXPENSE")
                Text("Доход").tag("INCOME")
            }
            TextField("Название категории", text: $name)
        }
    }

    private func moneyInput(_ label: String, value: Binding<String>, calculator: Bool = false) -> some View {
        HStack {
            Text(label).font(.subheadline)
            Spacer(minLength: 7)
            TextField("0,00", text: Binding(get: { value.wrappedValue }, set: { value.wrappedValue = EcoMoney.grouped($0) }))
                .keyboardType(calculator ? .numbersAndPunctuation : .decimalPad)
                .multilineTextAlignment(.trailing)
                .font(.subheadline.monospacedDigit())
        }
    }

    private func accountPicker(_ label: String, selection: Binding<String>,
                               except: String? = nil) -> some View {
        Picker(label, selection: selection) {
            Text("Выберите счёт").tag("")
            ForEach(snapshot.accounts.filter { $0.id != except }) { account in
                Text(account.name).tag(account.id)
            }
        }
    }

    private func iso(_ date: Date, utc: Bool = false) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        if utc {
            let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
            let noon = Calendar(identifier: .gregorian).date(from: DateComponents(
                timeZone: TimeZone(secondsFromGMT: 0),
                year: parts.year, month: parts.month, day: parts.day,
                hour: 12, minute: 0
            )) ?? date
            return formatter.string(from: noon)
        }
        return formatter.string(from: date)
    }

    private func requiredMoney(_ text: String, zero: Bool = false,
                               negative: Bool = false) throws -> String {
        guard let value = EcoMoney.parse(text, allowZero: zero, allowNegative: negative) else {
            throw ValidationError.invalid("Укажите корректную сумму (до двух знаков после запятой).")
        }
        return value
    }

    private func payload() throws -> [String: Any] {
        switch resource {
        case .accounts:
            let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard (1...60).contains(trimmed.count) else { throw ValidationError.invalid("Название счёта: до 60 символов.") }
            let minor = try requiredMoney(balance, zero: true, negative: accountType != "CREDIT_CARD")
            var values: [String: Any] = [
                "name": trimmed, "accountType": accountType, "balanceMinor": minor,
                "creditLimitMinor": NSNull()
            ]
            if accountType == "CREDIT_CARD" {
                let limit = try requiredMoney(creditLimit)
                guard (Int64(minor) ?? -1) >= 0, (Int64(minor) ?? -1) <= (Int64(limit) ?? 0) else {
                    throw ValidationError.invalid("Остаток кредитной карты должен быть между нулём и лимитом.")
                }
                values["creditLimitMinor"] = limit
            }
            if editing && isPrimary && accountType == "STANDARD" { values["isPrimary"] = true }
            return values

        case .operations:
            guard ["INCOME","EXPENSE","TRANSFER"].contains(kind),
                  !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  title.count <= 160 else { throw ValidationError.invalid("Введите название операции до 160 символов.") }
            guard !sourceID.isEmpty else { throw ValidationError.invalid("Выберите счёт.") }
            if kind == "TRANSFER" && (targetID.isEmpty || targetID == sourceID) {
                throw ValidationError.invalid("Для перевода выберите другой счёт зачисления.")
            }
            guard let calculated = EcoMoney.calculate(amount) else {
                throw ValidationError.invalid("Укажите корректную сумму или завершённое выражение.")
            }
            let lines = try positions.filter { !$0.name.isEmpty || !$0.amount.isEmpty }.map { position -> [String: String] in
                let name = position.name.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty, name.count <= 160 else { throw ValidationError.invalid("Укажите название позиции до 160 символов.") }
                return ["name": name, "amountMinor": try requiredMoney(position.amount, zero: true, negative: true)]
            }
            let lineData = try JSONSerialization.data(withJSONObject: lines, options: [.sortedKeys])
            return [
                "kind": kind, "title": title.trimmingCharacters(in: .whitespacesAndNewlines),
                "amountMinor": calculated,
                "positionsJson": String(decoding: lineData, as: UTF8.self),
                "calculation": EcoMoney.isExpression(amount) ? amount as Any : NSNull(),
                "sourceAccountId": sourceID,
                "targetAccountId": kind == "TRANSFER" ? targetID : NSNull(),
                "category": kind == "TRANSFER" || category.isEmpty ? NSNull() : category,
                "note": note.isEmpty ? NSNull() : note,
                "occurredAt": iso(date)
            ]

        case .debts:
            guard !counterparty.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  counterparty.count <= 100 else {
                throw ValidationError.invalid("Укажите имя должника или организации до 100 символов.")
            }
            let total = try requiredMoney(amount)
            let repaid = try requiredMoney(paid, zero: true)
            guard (Int64(repaid) ?? 0) <= (Int64(total) ?? 0) else {
                throw ValidationError.invalid("Погашенная сумма не может превышать долг.")
            }
            if postedToAccount && sourceID.isEmpty { throw ValidationError.invalid("Выберите счёт учёта долга.") }
            var values: [String: Any] = [
                "direction": direction,
                "counterparty": counterparty.trimmingCharacters(in: .whitespacesAndNewlines),
                "amountMinor": total, "paidMinor": isClosed ? total : repaid,
                "postedToAccount": postedToAccount,
                "accountId": postedToAccount ? sourceID : NSNull(),
                "dueAt": dueEnabled ? iso(dueDate, utc: true) : NSNull(),
                "note": note.isEmpty ? NSNull() : note
            ]
            if editing { values["isClosed"] = isClosed }
            return values

        case .loans:
            guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  name.count <= 100 else { throw ValidationError.invalid("Введите название кредита.") }
            let total = try requiredMoney(amount)
            let repaid = try requiredMoney(paid, zero: true)
            guard (Int64(repaid) ?? 0) <= (Int64(total) ?? 0) else {
                throw ValidationError.invalid("Погашение не может превышать сумму кредита.")
            }
            guard let rateValue = Decimal(string: rate.replacingOccurrences(of: ",", with: ".")),
                  rateValue >= 0, rateValue <= 1000,
                  let monthsValue = Int(months), (1...600).contains(monthsValue) else {
                throw ValidationError.invalid("Ставка: 0–1000%, срок: 1–600 месяцев.")
            }
            let bps = NSDecimalNumber(decimal: rateValue * 100).intValue
            var values: [String: Any] = [
                "name": name.trimmingCharacters(in: .whitespacesAndNewlines),
                "lender": lender.isEmpty ? NSNull() : lender,
                "principalMinor": total,
                "paidMinor": isClosed ? total : repaid,
                "annualRateBps": bps,
                "termMonths": monthsValue,
                "monthlyPaymentOverrideMinor": monthlyOverride.isEmpty
                    ? NSNull() : try requiredMoney(monthlyOverride),
                "startDate": iso(date),
                "paymentDate": paymentEnabled ? iso(paymentDate, utc: true) : NSNull(),
                "remindersEnabled": remindersEnabled && paymentEnabled && telegramLinked
            ]
            if editing { values["isClosed"] = isClosed }
            return values

        case .categories:
            let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard (1...60).contains(trimmed.count) else {
                throw ValidationError.invalid("Укажите название категории до 60 символов.")
            }
            return ["name": trimmed, "kind": kind]
        }
    }

    private func submit() async {
        guard !saving else { return }
        do {
            let values = try payload()
            errorText = nil
            saving = true
            let saved = await onSave(values)
            saving = false
            if saved { dismiss() }
            else {
                errorText = "Не удалось сохранить. Проверьте сообщение в финансовом обзоре."
            }
        } catch {
            saving = false
            errorText = error.localizedDescription
        }
    }

    private enum ValidationError: LocalizedError {
        case invalid(String)
        var errorDescription: String? {
            if case let .invalid(message) = self { return message }
            return nil
        }
    }
}
