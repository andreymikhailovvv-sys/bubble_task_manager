import SwiftUI
import Charts
import WebKit

private enum EcoSection: String, CaseIterable, Identifiable {
    case overview = "Обзор"
    case report = "Отчёт"
    case accounts = "Счета"
    case operations = "Операции"
    case debts = "Долги и кредиты"
    case categories = "Категории"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .overview: return "square.grid.2x2"
        case .accounts: return "creditcard"
        case .operations: return "arrow.left.arrow.right"
        case .debts: return "books.vertical"
        case .report: return "chart.pie"
        case .categories: return "square.grid.2x2"
        }
    }
}

struct NativeEconomicView: View {
    @Environment(\.colorScheme) private var theme
    @ObservedObject var session: NativeWorkspaceSession
    let awaitingVoice: Bool
    let onVoiceRequested: () -> Void

    @State private var snapshot: EcoSnapshot?
    @State private var operations: [EcoOperation] = []
    @State private var nextCursor: String?
    @State private var report: EcoReport?
    @State private var serverUser: EcoServerUser?
    @State private var section: EcoSection = .overview
    @State private var editor: EcoEditorTarget?
    @State private var pendingRemoval: EcoEditorTarget?
    @State private var kindFilter = ""
    @State private var accountFilter = ""
    @State private var categoryFilter = ""
    @State private var showClosed = false
    @State private var reportPeriod = "month"
    @State private var reportOffset = 0
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var loadingOperations = false
    @State private var errorText: String?
    @State private var adjustmentNotice: String?
    @State private var financeReaction: String?
    @State private var financeReactionKey = UUID()
    @State private var economicSkin = "classic"
    @State private var deletionError: String?

    private let gold = Color(red: 0.88, green: 0.61, blue: 0.27)
    private var panel: Color {
        theme == .dark ? Color(red: 0.15, green: 0.17, blue: 0.22) : .white
    }
    private var canvas: Color {
        theme == .dark ? Color(uiColor: .systemGroupedBackground)
                       : Color(red: 0.95, green: 0.97, blue: 1)
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            ScrollView {
                VStack(alignment: .leading, spacing: 15) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("ФИНАНСОВЫЙ ПОМОЩНИК")
                                .font(.system(size: 10, weight: .bold))
                                .tracking(1.3)
                                .foregroundStyle(gold)
                            Text("Экономыч AI")
                                .font(.system(size: 25, weight: .bold, design: .rounded))
                        }
                        Spacer()
                        Button { Task { await refresh() } } label: {
                            Image(systemName: "arrow.clockwise")
                                .frame(width: 36, height: 36)
                                .background(panel, in: Circle())
                        }
                        .disabled(isLoading || isSaving)
                        .accessibilityLabel("Обновить финансовый обзор")
                    }
                    .padding(.top, 8)

                    ScrollView(.horizontal) {
                        HStack(spacing: 7) {
                            ForEach(EcoSection.allCases) { tab in
                                Button {
                                    section = tab
                                    Task { await loadSection() }
                                } label: {
                                    Label(tab.rawValue, systemImage: tab.icon)
                                        .font(.system(size: 12, weight: .semibold))
                                        .padding(.horizontal, 11)
                                        .padding(.vertical, 10)
                                        .background(section == tab ? gold.opacity(0.18) : panel,
                                                    in: RoundedRectangle(cornerRadius: 12))
                                        .overlay {
                                            RoundedRectangle(cornerRadius: 12)
                                                .stroke(gold.opacity(section == tab ? 0.56 : 0.12))
                                        }
                                }
                                .foregroundStyle(section == tab ? gold : Color.primary)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .scrollIndicators(.hidden)

                    if let errorText {
                        Label(errorText, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                            .padding(12)
                            .background(panel, in: RoundedRectangle(cornerRadius: 14))
                    }

                    if isLoading && snapshot == nil {
                        VStack(spacing: 15) {
                            ProgressView()
                            Text("Загружаю финансы…").foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 100)
                    } else if let snapshot {
                        switch section {
                        case .overview: overview(snapshot)
                        case .accounts: accountsScreen(snapshot)
                        case .operations: operationsScreen(snapshot)
                        case .debts: debtsScreen(snapshot)
                        case .report: reportScreen
                        case .categories: categoriesScreen(snapshot)
                        }
                    } else {
                        ContentUnavailableView("Не удалось получить финансовые данные",
                                               systemImage: "wifi.exclamationmark")
                        Button("Повторить") { Task { await refresh() } }
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(.horizontal, 15)
                .padding(.bottom, 110)
            }
            .background(canvas)
            if let financeReaction {
                EcoMoneyMascotView(skin: economicSkin, mode: financeReaction, dark: theme == .dark)
                    .id(financeReactionKey)
                    .frame(width: 180, height: 180)
                    .padding(.trailing, 12)
                    .padding(.bottom, 76)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                    .task(id: financeReactionKey) {
                        try? await Task.sleep(for: .seconds(7))
                        if !Task.isCancelled { self.financeReaction = nil }
                    }
            }
            quickActionMenu
                .padding(.trailing, 21)
                .padding(.bottom, 24)
        }
        .overlay(alignment: .top) {
            if let adjustmentNotice {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                    Text(adjustmentNotice).font(.footnote)
                    Button { self.adjustmentNotice = nil } label: { Image(systemName: "xmark") }
                }
                .padding(12)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                .shadow(radius: 8)
                .padding(.horizontal, 12)
                .padding(.top, 8)
                .task(id: adjustmentNotice) {
                    try? await Task.sleep(for: .seconds(5))
                    if !Task.isCancelled { self.adjustmentNotice = nil }
                }
            }
        }
        .task {
            await refresh()
            if let skin = try? await NativeAPI().economicMascotSkin() { economicSkin = skin }
        }
        .sheet(item: $editor) { target in
            if let snapshot {
                NativeEconomicEditorSheet(
                    target: target, snapshot: snapshot,
                    telegramLinked: serverUser?.telegramLinked == true,
                    isSaving: isSaving,
                    onSave: { payload in await mutate(target, payload: payload) },
                    onDelete: target.raw?["id"] == nil ? nil : { pendingRemoval = target }
                )
                .presentationDetents([.large])
            }
        }
        .confirmationDialog(
            "Удалить финансовую запись?",
            isPresented: Binding(
                get: { pendingRemoval != nil },
                set: { if !$0 { pendingRemoval = nil } }
            ), titleVisibility: .visible
        ) {
            Button("Удалить навсегда", role: .destructive) {
                guard let target = pendingRemoval else { return }
                pendingRemoval = nil
                editor = nil
                Task { await delete(target) }
            }
            Button("Отмена", role: .cancel) { pendingRemoval = nil }
        } message: {
            Text("Удаление изменит финансовые данные во всех приложениях.")
        }
    }

    @ViewBuilder
    private var quickActionMenu: some View {
        Menu {
            Button(action: onVoiceRequested) {
                Label("Голосовой ввод", systemImage: "mic.fill")
            }
            Divider()
            ForEach([EcoResource.operations, .accounts, .debts, .loans, .categories]) { resource in
                Button {
                    editor = EcoEditorTarget(resource: resource)
                } label: {
                    Label("Добавить: \(resource.display.lowercased())", systemImage: resource.symbol)
                }
            }
        } label: {
            ZStack {
                Circle()
                    .fill(LinearGradient(colors: [gold, Color(red: 0.77, green: 0.40, blue: 0.13)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 59, height: 59)
                if awaitingVoice {
                    ProgressView().tint(.white).scaleEffect(1.2)
                } else {
                    Image(systemName: "plus")
                        .font(.system(size: 28, weight: .medium))
                        .foregroundStyle(.white)
                }
            }
            .shadow(color: gold.opacity(0.22), radius: 13, y: 5)
        }
        .disabled(awaitingVoice || isSaving)
        .accessibilityLabel("Добавить финансовую операцию, счёт, долг, кредит или голосовой ввод")
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 11) { content() }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(panel, in: RoundedRectangle(cornerRadius: 21))
    }

    private func sectionHeader(_ name: String, action: String? = nil,
                               onAction: (() -> Void)? = nil) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(name).font(.headline)
            Spacer(minLength: 4)
            if let action, let onAction {
                Button(action, action: onAction)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(gold)
            }
        }
    }

    private func metric(_ title: String, amount: String, icon: String,
                        tint: Color = .primary) -> some View {
        card {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(gold)
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(EcoMoney.formatted(amount))
                .font(.system(size: 19, weight: .bold, design: .rounded))
                .minimumScaleFactor(0.7)
                .lineLimit(1)
                .foregroundStyle(tint)
        }
    }

    private func overview(_ data: EcoSnapshot) -> some View {
        VStack(spacing: 13) {
            card {
                Text("ФИНАНСЫ ПОД КОНТРОЛЕМ")
                    .font(.caption2.bold()).tracking(1.2).foregroundStyle(gold)
                Text("Счета, расходы, долги и кредиты")
                    .font(.title3.bold())
                Text("Все данные синхронизированы с вашим аккаунтом Планировыча.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            HStack(alignment: .top, spacing: 10) {
                metric("Общий баланс", amount: data.totals.balanceMinor,
                       icon: "wallet.pass")
                metric("Доходы за месяц", amount: data.totals.monthIncomeMinor,
                       icon: "arrow.down.left", tint: .green)
            }
            HStack(alignment: .top, spacing: 10) {
                metric("Расходы за месяц", amount: data.totals.monthExpenseMinor,
                       icon: "arrow.up.right", tint: .orange)
                card {
                    Image(systemName: "chart.bar.xaxis")
                        .font(.title3).foregroundStyle(gold)
                    Text("Главная категория").font(.caption).foregroundStyle(.secondary)
                    Text(data.totals.topExpenseCategory ?? "Нет расходов")
                        .font(.subheadline.bold()).lineLimit(1)
                    Text(EcoMoney.formatted(data.totals.topExpenseCategoryMinor))
                        .font(.caption.weight(.medium)).foregroundStyle(.secondary)
                }
            }
            card {
                sectionHeader("Мои счета", action: "Все счета") { section = .accounts }
                ForEach(data.accounts.prefix(4)) { account in
                    accountRow(account)
                }
                Button {
                    editor = EcoEditorTarget(resource: .accounts)
                } label: { Label("Добавить счёт", systemImage: "plus.circle") }
                    .font(.footnote.weight(.semibold)).foregroundStyle(gold)
            }
            card {
                sectionHeader("Расходы по категориям", action: "Отчёт") {
                    section = .report
                    Task { await loadSection() }
                }
                if let report {
                    reportMini(report.expense)
                } else {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 80)
                }
            }
            card {
                sectionHeader("Долги и кредиты", action: "Все записи") { section = .debts }
                let activeDebts = data.debts.filter { $0.isClosed != true }
                let activeLoans = data.loans.filter { $0.isClosed != true }
                if activeDebts.isEmpty && activeLoans.isEmpty {
                    Text("Активных долгов и кредитов нет")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                ForEach(activeDebts.prefix(3)) { debt in debtRow(debt) }
                ForEach(activeLoans.prefix(3)) { loan in loanRow(loan) }
            }
            card {
                sectionHeader("Последние операции", action: "Все операции") {
                    section = .operations
                    Task { await loadSection() }
                }
                if data.recent.isEmpty {
                    Text("Операций пока нет").font(.footnote).foregroundStyle(.secondary)
                }
                ForEach(data.recent.prefix(8)) { operation in operationRow(operation) }
            }
        }
    }

    private func accountsScreen(_ data: EcoSnapshot) -> some View {
        VStack(spacing: 12) {
            card {
                sectionHeader("Счета и остатки", action: "Добавить") {
                    editor = EcoEditorTarget(resource: .accounts)
                }
                Text("Остатки учитывают проведённые операции и переводы.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            ForEach(data.accounts) { account in
                card { accountRow(account) }
            }
        }
    }

    private func accountRow(_ account: EcoAccount) -> some View {
        Button {
            showEditor(account, resource: .accounts)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: account.accountType == "CREDIT_CARD" ? "creditcard.fill" : "wallet.pass.fill")
                    .font(.title3)
                    .foregroundStyle(gold)
                    .frame(width: 35, height: 35)
                    .background(gold.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 4) {
                        Text(account.name).font(.subheadline.weight(.semibold))
                        if account.isPrimary == true {
                            Image(systemName: "star.fill").font(.caption2).foregroundStyle(gold)
                        }
                    }
                    Text(account.accountType == "CREDIT_CARD" ? "Кредитная карта" : "Денежный счёт")
                        .font(.caption2).foregroundStyle(.secondary)
                    if account.accountType == "CREDIT_CARD" {
                        Text("Лимит: " + EcoMoney.formatted(account.creditLimitMinor))
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 4)
                Text(EcoMoney.formatted(account.balanceMinor))
                    .font(.subheadline.bold()).monospacedDigit().lineLimit(1)
            }
            .foregroundStyle(.primary)
            .contentShape(Rectangle())
        }.buttonStyle(.plain)
    }

    private func operationsScreen(_ data: EcoSnapshot) -> some View {
        VStack(spacing: 12) {
            card {
                sectionHeader("История операций", action: "Добавить") {
                    editor = EcoEditorTarget(resource: .operations)
                }
                Text("Доходы, расходы, переводы и движения по долгам")
                    .font(.footnote).foregroundStyle(.secondary)
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        Menu {
                            Button("Все виды") { kindFilter = ""; Task { await fetchOperations() } }
                            ForEach(["INCOME", "EXPENSE", "TRANSFER"], id: \.self) { kind in
                                Button(kindLabel(kind)) { kindFilter = kind; Task { await fetchOperations() } }
                            }
                        } label: {
                            Label(kindFilter.isEmpty ? "Все виды" : kindLabel(kindFilter),
                                  systemImage: "line.3.horizontal.decrease")
                        }
                        Menu {
                            Button("Все счета") { accountFilter = ""; Task { await fetchOperations() } }
                            ForEach(data.accounts) { account in
                                Button(account.name) {
                                    accountFilter = account.id
                                    Task { await fetchOperations() }
                                }
                            }
                        } label: {
                            Label(data.accounts.first(where: { $0.id == accountFilter })?.name ?? "Все счета",
                                  systemImage: "creditcard")
                        }
                        Menu {
                            Button("Все категории") { categoryFilter = ""; Task { await fetchOperations() } }
                            ForEach(Array(Set(data.categories.map(\.name))).sorted(), id: \.self) { name in
                                Button(name) {
                                    categoryFilter = name
                                    Task { await fetchOperations() }
                                }
                            }
                        } label: {
                            Label(categoryFilter.isEmpty ? "Категории" : categoryFilter,
                                  systemImage: "square.grid.2x2")
                        }
                    }
                    .font(.caption)
                }
                .scrollIndicators(.hidden)
            }

            if loadingOperations && operations.isEmpty {
                ProgressView().padding()
            }
            let list = operations.isEmpty && !loadingOperations && kindFilter.isEmpty &&
                accountFilter.isEmpty && categoryFilter.isEmpty ? data.recent : operations
            if list.isEmpty && !loadingOperations {
                Text("По выбранным фильтрам операций нет")
                    .font(.subheadline).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity).padding(25)
            }
            ForEach(list) { operation in
                card { operationRow(operation) }
            }
            if nextCursor?.isEmpty == false {
                Button {
                    Task { await loadMoreOperations() }
                } label: {
                    Text(loadingOperations ? "Загружаем…" : "Показать ещё")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity).padding(14)
                }
                .background(panel, in: RoundedRectangle(cornerRadius: 14))
                .disabled(loadingOperations)
            }
        }
    }

    private func kindLabel(_ kind: String) -> String {
        switch kind {
        case "INCOME": return "Доход"
        case "EXPENSE": return "Расход"
        case "TRANSFER": return "Перевод"
        case "DEBT_BORROWED": return "Получен долг"
        case "DEBT_RETURNED": return "Возврат долга"
        default: return "Финансовая операция"
        }
    }

    private func operationRow(_ op: EcoOperation) -> some View {
        let incoming = ["INCOME", "DEBT_BORROWED", "DEBT_RETURNED"].contains(op.kind)
        return Button {
            if op.isAdjustment != true {
                showEditor(op, resource: .operations)
            }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: incoming ? "arrow.down.left" : "arrow.up.right")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(incoming ? .green : .orange)
                    .frame(width: 36, height: 36)
                    .background((incoming ? Color.green : Color.orange).opacity(0.1),
                                in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 3) {
                    Text(op.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                    Text(([op.category, op.occurredAt.map { String($0.prefix(10)) }]
                          .compactMap { $0 }).joined(separator: " · "))
                        .font(.caption2).foregroundStyle(.secondary)
                }
                Spacer(minLength: 4)
                Text((incoming ? "+" : "−") + EcoMoney.formatted(op.amountMinor))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(incoming ? .green : .primary)
                    .monospacedDigit()
                    .lineLimit(1)
            }
            .foregroundStyle(.primary)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(op.isAdjustment == true)
    }

    private func debtsScreen(_ data: EcoSnapshot) -> some View {
        VStack(spacing: 14) {
            card {
                sectionHeader("Долги и кредиты")
                HStack {
                    Button {
                        editor = EcoEditorTarget(resource: .debts)
                    } label: { Label("Добавить долг", systemImage: "plus.circle") }
                    Spacer()
                    Button {
                        editor = EcoEditorTarget(resource: .loans)
                    } label: { Label("Добавить кредит", systemImage: "plus.circle") }
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(gold)
                Toggle("Показывать закрытые", isOn: $showClosed)
                    .font(.footnote)
            }
            card {
                sectionHeader("Долги")
                let debts = data.debts.filter { showClosed || $0.isClosed != true }
                if debts.isEmpty { Text("Долгов нет").foregroundStyle(.secondary).font(.footnote) }
                ForEach(debts) { debt in debtRow(debt) }
            }
            card {
                sectionHeader("Кредиты")
                let loans = data.loans.filter { showClosed || $0.isClosed != true }
                if loans.isEmpty { Text("Кредитов нет").foregroundStyle(.secondary).font(.footnote) }
                ForEach(loans) { loan in loanRow(loan) }
            }
        }
    }

    private func categoriesScreen(_ data: EcoSnapshot) -> some View {
        VStack(spacing: 13) {
            card {
                sectionHeader("Категории", action: "Добавить") {
                    editor = EcoEditorTarget(resource: .categories)
                }
                Text("Категории доходов и расходов используются в операциях и отчётах.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ForEach(["EXPENSE", "INCOME"], id: \.self) { kind in
                card {
                    sectionHeader(kind == "EXPENSE" ? "Расходы" : "Доходы")
                    let list = data.categories.filter { $0.kind == kind }
                    if list.isEmpty {
                        Text("Категорий нет").font(.footnote).foregroundStyle(.secondary)
                    }
                    ForEach(list) { category in
                        Button {
                            showEditor(category, resource: .categories)
                        } label: {
                            HStack {
                                Text(category.name).font(.subheadline)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption2).foregroundStyle(.tertiary)
                            }
                            .foregroundStyle(.primary)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func debtRow(_ debt: EcoDebt) -> some View {
        Button { showEditor(debt, resource: .debts) } label: {
            VStack(alignment: .leading, spacing: 9) {
                HStack {
                    Label(debt.counterparty, systemImage: "person.2")
                        .font(.subheadline.bold())
                    Spacer()
                    if debt.isClosed == true {
                        Text("Закрыт").font(.caption).foregroundStyle(.green)
                    }
                }
                Text(debt.direction == "OWED_TO_ME" ? "Мне должны" : "Я должен")
                    .font(.caption).foregroundStyle(.secondary)
                HStack {
                    Text("Всего " + EcoMoney.formatted(debt.amountMinor))
                    Spacer()
                    Text("Погашено " + EcoMoney.formatted(debt.paidMinor))
                }.font(.caption)
                ProgressView(value: min(1, max(0,
                    NSDecimalNumber(decimal: EcoMoney.decimal(debt.paidMinor)).doubleValue /
                    max(0.01, NSDecimalNumber(decimal: EcoMoney.decimal(debt.amountMinor)).doubleValue))))
                    .tint(gold)
            }
            .foregroundStyle(.primary)
        }
        .buttonStyle(.plain)
        .padding(.vertical, 5)
    }

    private func loanRow(_ loan: EcoLoan) -> some View {
        Button { showEditor(loan, resource: .loans) } label: {
            VStack(alignment: .leading, spacing: 9) {
                HStack {
                    Label(loan.name, systemImage: "banknote")
                        .font(.subheadline.bold())
                    Spacer()
                    if loan.isClosed == true { Text("Закрыт").font(.caption).foregroundStyle(.green) }
                }
                Text("Тело кредита: " + EcoMoney.formatted(loan.principalMinor))
                    .font(.subheadline)
                HStack {
                    Text("Погашено " + EcoMoney.formatted(loan.paidMinor))
                    Spacer()
                    if let rate = loan.annualRateBps {
                        Text(String(format: "%.2f%% годовых", Double(rate) / 100))
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                ProgressView(value: min(1, max(0,
                    NSDecimalNumber(decimal: EcoMoney.decimal(loan.paidMinor)).doubleValue /
                    max(0.01, NSDecimalNumber(decimal: EcoMoney.decimal(loan.principalMinor)).doubleValue))))
                    .tint(gold)
            }
            .foregroundStyle(.primary)
        }
        .buttonStyle(.plain)
        .padding(.vertical, 5)
    }

    private var reportScreen: some View {
        VStack(spacing: 13) {
            card {
                sectionHeader("Финансовая аналитика")
                HStack {
                    Menu {
                        ForEach(["week","month","year","all"], id: \.self) { period in
                            Button(periodLabel(period)) {
                                reportPeriod = period
                                reportOffset = 0
                                Task { await loadReport() }
                            }
                        }
                    } label: {
                        Label(periodLabel(reportPeriod), systemImage: "calendar")
                            .font(.subheadline)
                    }
                    Spacer()
                    Button {
                        reportOffset -= 1
                        Task { await loadReport() }
                    } label: { Image(systemName: "chevron.left") }
                    .disabled(reportPeriod == "all")
                    Text(reportOffset == 0 ? "Текущий" : "\(reportOffset)")
                        .font(.caption.monospacedDigit())
                    Button {
                        reportOffset += 1
                        Task { await loadReport() }
                    } label: { Image(systemName: "chevron.right") }
                    .disabled(reportPeriod == "all" || reportOffset >= 0)
                }
                .foregroundStyle(gold)
            }
            if let report {
                card {
                    Text("Расходы").font(.headline)
                    Text(EcoMoney.formatted(report.expense.totalMinor))
                        .font(.title2.bold())
                    reportMini(report.expense)
                    categoryDetails(report.expense)
                }
                card {
                    Text("Доходы").font(.headline)
                    Text(EcoMoney.formatted(report.income.totalMinor))
                        .font(.title2.bold())
                    reportMini(report.income)
                    categoryDetails(report.income)
                }
            } else {
                ProgressView("Загрузка отчёта…")
                    .frame(maxWidth: .infinity).padding(26)
            }
        }
    }

    private func periodLabel(_ period: String) -> String {
        switch period {
        case "week": return "Неделя"
        case "month": return "Месяц"
        case "year": return "Год"
        case "all": return "Всё время"
        default: return "Период"
        }
    }

    private func reportMini(_ group: EcoReportGroup) -> some View {
        let portions = group.categories.filter { EcoMoney.decimal($0.amountMinor) > 0 }
        return HStack(alignment: .center, spacing: 16) {
            if portions.isEmpty {
                Image(systemName: "chart.pie")
                    .font(.system(size: 40, weight: .ultraLight))
                    .foregroundStyle(gold.opacity(0.55))
                    .frame(width: 95, height: 95)
            } else {
                Chart(portions) { item in
                    SectorMark(
                        angle: .value("Сумма", NSDecimalNumber(decimal: EcoMoney.decimal(item.amountMinor)).doubleValue),
                        innerRadius: .ratio(0.65),
                        angularInset: 1
                    )
                    .foregroundStyle(by: .value("Категория", item.name))
                }
                .chartLegend(.hidden)
                .frame(width: 115, height: 115)
            }
            VStack(alignment: .leading, spacing: 7) {
                ForEach(portions.prefix(4)) { item in
                    HStack(spacing: 5) {
                        Circle().fill(gold.opacity(0.8)).frame(width: 5, height: 5)
                        Text(item.name).font(.caption).lineLimit(1)
                        Spacer(minLength: 3)
                        Text(EcoMoney.formatted(item.amountMinor))
                            .font(.caption.weight(.medium)).lineLimit(1)
                    }
                }
                if portions.isEmpty { Text("За период записей нет").font(.caption).foregroundStyle(.secondary) }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func categoryDetails(_ group: EcoReportGroup) -> some View {
        ForEach(group.categories) { item in
            HStack {
                Text(item.name).font(.subheadline)
                Spacer(minLength: 5)
                Text(EcoMoney.formatted(item.amountMinor))
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func showEditor<T: Encodable>(_ item: T, resource: EcoResource) {
        if let data = try? JSONEncoder().encode(item),
           let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            editor = EcoEditorTarget(resource: resource, raw: raw)
        }
    }

    private func mutate(_ target: EcoEditorTarget, payload: [String: Any]) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        defer { isSaving = false }
        do {
            let api = NativeAPI()
            if let id = target.raw?["id"] as? String {
                let result = try await api.economicUpdate(target.resource, id: id, payload: payload)
                if let correction = result.adjustment {
                    adjustmentNotice = "Добавлена корректирующая операция на сумму " +
                        (correction.amountMinor.hasPrefix("-") ? "" : "+") +
                        EcoMoney.formatted(correction.amountMinor) + " на счёт " + correction.accountName
                }
            } else {
                try await api.economicCreate(target.resource, payload: payload)
                if target.resource.rawValue == "operations",
                   let kind = payload["kind"] as? String,
                   ["INCOME", "EXPENSE"].contains(kind) {
                    financeReaction = kind == "INCOME" ? "income" : "expense"
                    financeReactionKey = UUID()
                }
            }
            // The write is already committed. Never retry it merely because
            // refresh failed: otherwise a finance record could be duplicated.
            editor = nil
            errorText = nil
            do { try await retrieveState() }
            catch { errorText = "Сохранено, но обновить обзор не удалось: " + error.localizedDescription }
            return true
        } catch {
            errorText = error.localizedDescription
            return false
        }
    }

    private func delete(_ target: EcoEditorTarget) async {
        guard !isSaving, let id = target.raw?["id"] as? String else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            try await NativeAPI().economicDelete(target.resource, id: id)
            do { try await retrieveState() }
            catch { errorText = "Удалено, но обзор ещё не обновился: " + error.localizedDescription }
        } catch { errorText = error.localizedDescription }
    }

    private func refresh() async {
        guard !isLoading || snapshot == nil else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            try await retrieveState()
            errorText = nil
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func retrieveState() async throws {
        let api = NativeAPI()
        async let data = api.economicSnapshot()
        async let user = api.economicSession()
        snapshot = try await data
        serverUser = try? await user
        await loadSection()
    }

    private func loadSection() async {
        if section == .operations {
            await fetchOperations()
        } else if section == .report || section == .overview {
            await loadReport()
        }
    }

    private func loadReport() async {
        do {
            report = try await NativeAPI().economicReport(
                period: section == .overview ? "month" : reportPeriod,
                offset: section == .overview ? 0 : reportOffset)
        } catch { errorText = error.localizedDescription }
    }

    private func fetchOperations() async {
        guard !loadingOperations else { return }
        loadingOperations = true
        defer { loadingOperations = false }
        do {
            let result = try await NativeAPI().economicOperations(
                kind: kindFilter.isEmpty ? nil : kindFilter,
                accountId: accountFilter.isEmpty ? nil : accountFilter,
                category: categoryFilter.isEmpty ? nil : categoryFilter)
            operations = result.operations
            nextCursor = result.nextCursor
            errorText = nil
        } catch { errorText = error.localizedDescription }
    }

    private func loadMoreOperations() async {
        guard !loadingOperations, let cursor = nextCursor, !cursor.isEmpty else { return }
        loadingOperations = true
        defer { loadingOperations = false }
        do {
            let result = try await NativeAPI().economicOperations(
                kind: kindFilter.isEmpty ? nil : kindFilter,
                accountId: accountFilter.isEmpty ? nil : accountFilter,
                category: categoryFilter.isEmpty ? nil : categoryFilter,
                cursor: cursor)
            let existing = Set(operations.map(\.id))
            operations.append(contentsOf: result.operations.filter { !existing.contains($0.id) })
            nextCursor = result.nextCursor
        } catch { errorText = error.localizedDescription }
    }
}


/// Only the mascot artwork is web-rendered; the financial workspace stays native.
private struct EcoMoneyMascotView: UIViewRepresentable {
    let skin: String
    let mode: String
    let dark: Bool

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.backgroundColor = .clear
        view.scrollView.isScrollEnabled = false
        view.isUserInteractionEnabled = false
        var parts = URLComponents(string: "https://planirovych.ru/android-mascot")
        parts?.queryItems = [
            URLQueryItem(name: "variant", value: "economic"),
            URLQueryItem(name: "skin", value: skin),
            URLQueryItem(name: "mode", value: mode),
            URLQueryItem(name: "theme", value: dark ? "dark" : "light")
        ]
        if let url = parts?.url { view.load(URLRequest(url: url)) }
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
