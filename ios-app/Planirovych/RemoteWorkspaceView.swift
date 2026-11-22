import SwiftUI

private enum ConnectedTab: String, CaseIterable, Identifiable {
    case overview = "Общая"
    case tasks = "Задачи"
    case chat = "ИИ-чат"
    case economic = "Экономыч"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .overview: return "square.grid.2x2.fill"
        case .tasks: return "checklist"
        case .chat: return "bubble.left.and.bubble.right.fill"
        case .economic: return "rublesign.circle.fill"
        }
    }
}

private enum TaskOrder: String, CaseIterable {
    case urgency = "По срочности"
    case importance = "По важности"
    case dueDate = "По сроку"
}

private enum TaskDateWindow: String, CaseIterable {
    case all = "Все сроки"
    case today = "Сегодня"
    case tomorrow = "Завтра"
    case week = "7 дней"
    case overdue = "Просроченные"
    case undated = "Без срока"
}

private enum TaskDisplayMode: String, CaseIterable {
    case list = "Список"
    case timeline = "Таймлайн"
}

struct RemoteWorkspaceView: View {
    @Environment(\.colorScheme) private var colorScheme
    @ObservedObject var session: NativeWorkspaceSession
    @State private var selectedTab: ConnectedTab = .overview
    @State private var selectedSphereID: String?
    @State private var showingNewTask = false
    @State private var editingTask: RemoteTask?
    @State private var taskOrder: TaskOrder = .urgency
    @State private var dateWindow: TaskDateWindow = .all
    @State private var taskMode: TaskDisplayMode = .list
    @State private var showCompletedTasks = false

    private let accent = Color(red: 0.54, green: 0.49, blue: 0.97)

    private var background: Color {
        colorScheme == .dark
            ? Color(red: 0.075, green: 0.085, blue: 0.13)
            : Color(red: 0.95, green: 0.96, blue: 0.985)
    }

    private var card: Color {
        colorScheme == .dark ? Color(red: 0.14, green: 0.15, blue: 0.22) : .white
    }

    private var allActualTasks: [RemoteTask] { session.tasks.filter { $0.isActualTask && $0.parentTaskId == nil } }
    private var doneCount: Int { allActualTasks.filter { $0.isComplete }.count }

    var body: some View {
        VStack(spacing: 0) {
            header

             if selectedTab == .chat {
                NativeChatView(session: session)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        if let error = session.errorMessage {
                            errorBanner(error)
                        }
                        switch selectedTab {
                        case .overview: overview
                        case .tasks: taskList
                        case .chat: EmptyView()
                        case .economic:
                            upcomingModule(
                                "Экономыч",
                                symbol: "wallet.bifold.fill",
                                message: "Финансовые данные не загружаются в этой сборке. Переносим модуль отдельно, без демонстрации вымышленных балансов."
                            )
                        }
                    }
                    .padding(20)
                    .padding(.bottom, 24)
                }
                .scrollIndicators(.hidden)
                .refreshable { await session.refresh() }
            }

            navigation
        }
        .background(background.ignoresSafeArea())
        .sheet(isPresented: $showingNewTask) {
            NewServerTaskSheet(session: session)
                .presentationDetents([.medium])
        }
        .sheet(item: $editingTask) { task in
            NativeTaskEditorSheet(session: session, task: task)
                .presentationDetents([.large])
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "sparkles.rectangle.stack.fill")
                .font(.system(size: 23))
                .foregroundStyle(accent)
                .frame(width: 43, height: 43)
                .background(accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 13))

            VStack(alignment: .leading, spacing: 3) {
                Text("Планировыч")
                    .font(.system(size: 23, weight: .bold, design: .rounded))
                Text(session.account?.displayName ?? "Аккаунт")
                    .lineLimit(1)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 6)

            if session.isWorking { ProgressView().padding(.trailing, 6) }

            Button { showingNewTask = true } label: {
                Image(systemName: "plus")
                    .font(.system(size: 19, weight: .semibold))
                    .frame(width: 41, height: 41)
                    .background(card, in: Circle())
            }
            .disabled(session.isWorking)
            .accessibilityLabel("Добавить задачу")

            Menu {
                Button {
                    Task { await session.refresh() }
                } label: {
                    Label("Обновить", systemImage: "arrow.clockwise")
                }
                Button(role: .destructive) {
                    Task { await session.logout() }
                } label: {
                    Label("Выйти из аккаунта", systemImage: "rectangle.portrait.and.arrow.right")
                }
            } label: {
                Image(systemName: "person.crop.circle")
                    .font(.system(size: 24))
                    .foregroundStyle(accent)
                    .frame(width: 41, height: 41)
                    .background(card, in: Circle())
            }
            .accessibilityLabel("Настройки аккаунта")
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 13)
        .background(background)
    }

    private var overview: some View {
        VStack(alignment: .leading, spacing: 19) {
            NativeHabitsStrip(session: session)

            VStack(alignment: .leading, spacing: 7) {
                Text("Ваши задачи")
                    .font(.system(size: 29, weight: .bold, design: .rounded))
                Text("Сферы и задачи в одном пространстве")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 12) {
                stat("Всего", value: "\(allActualTasks.count)", symbol: "checklist", color: accent)
                stat("Выполнено", value: "\(doneCount)", symbol: "checkmark.circle.fill", color: .green)
            }

            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Сферы")
                        .font(.headline)
                    Spacer()
                    Text("\(session.spheres.count)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if session.spheres.isEmpty {
                    Text("Сферы пока не созданы")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 30)
                } else {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                        ForEach(session.spheres) { sphere in
                            Button {
                                selectedSphereID = sphere.id
                                selectedTab = .tasks
                            } label: {
                                VStack(spacing: 7) {
                                    ZStack {
                                        Circle()
                                            .fill(Color(sphereHex: sphere.color).opacity(0.17))
                                            .frame(width: 75, height: 75)
                                        Circle()
                                            .fill(Color(sphereHex: sphere.color))
                                            .frame(width: 62, height: 62)
                                        Text("\(allActualTasks.filter { $0.sphereId == sphere.id }.count)")
                                            .font(.title3.bold())
                                            .foregroundStyle(.white)
                                    }
                                    Text(sphere.name)
                                        .font(.caption.weight(.medium))
                                        .lineLimit(2)
                                        .multilineTextAlignment(.center)
                                        .foregroundStyle(.primary)
                                }
                                .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(18)
            .background(card, in: RoundedRectangle(cornerRadius: 24))

            HStack {
                Text("Задачи")
                    .font(.headline)
                Spacer()
                Button("Все задачи") {
                    selectedSphereID = nil
                    selectedTab = .tasks
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(accent)
            }

            if allActualTasks.isEmpty {
                emptyTasks
            } else {
                ForEach(Array(allActualTasks.prefix(5))) { task in
                    taskRow(task)
                }
            }
        }
    }

    private var taskList: some View {
        let filtered = allActualTasks.filter {
            (selectedSphereID == nil || $0.sphereId == selectedSphereID)
                && matchesTime($0)
        }
        let active = sortedTasks(filtered.filter { !$0.isComplete })
        let completed = sortedTasks(filtered.filter { $0.isComplete })
        return VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Задачи")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                    Text("Управление задачами и сроками")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    showingNewTask = true
                } label: {
                    Image(systemName: "plus.circle.fill").font(.title2)
                }
                .disabled(session.isWorking)
                .accessibilityLabel("Создать задачу")
            }

            Picker("Отображение", selection: $taskMode) {
                ForEach(TaskDisplayMode.allCases, id: \.self) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
            .pickerStyle(.segmented)

            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    filter("Все", id: nil)
                    ForEach(session.spheres) { sphere in
                        filter(sphere.name, id: sphere.id, tint: Color(sphereHex: sphere.color))
                    }
                }
                .padding(.vertical, 3)
            }
            .scrollIndicators(.hidden)

            HStack(spacing: 10) {
                Menu {
                    Picker("Сортировка", selection: $taskOrder) {
                        ForEach(TaskOrder.allCases, id: \.self) { order in
                            Text(order.rawValue).tag(order)
                        }
                    }
                } label: {
                    Label(taskOrder.rawValue, systemImage: "arrow.up.arrow.down")
                        .font(.system(size: 12, weight: .semibold))
                        .padding(10)
                        .background(card, in: Capsule())
                }

                Menu {
                    Picker("По времени", selection: $dateWindow) {
                        ForEach(TaskDateWindow.allCases, id: \.self) { window in
                            Text(window.rawValue).tag(window)
                        }
                    }
                } label: {
                    Label(dateWindow.rawValue, systemImage: "calendar")
                        .font(.system(size: 12, weight: .semibold))
                        .padding(10)
                        .background(card, in: Capsule())
                }
            }
            .foregroundStyle(accent)

            if taskMode == .timeline {
                NativeTaskTimelineView(tasks: active, spheres: session.spheres) { task in
                    editingTask = task
                }
            } else if active.isEmpty {
                emptyTasks
            } else {
                ForEach(active) { task in taskRow(task) }
            }

            if !completed.isEmpty {
                DisclosureGroup(isExpanded: $showCompletedTasks) {
                    VStack(spacing: 9) {
                        ForEach(completed) { task in taskRow(task) }
                    }
                    .padding(.top, 9)
                } label: {
                    HStack {
                        Label("Выполненные", systemImage: "checkmark.circle.fill")
                            .font(.subheadline.weight(.semibold))
                        Spacer()
                        Text("\(completed.count)")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
                .tint(accent)
                .padding(15)
                .background(card, in: RoundedRectangle(cornerRadius: 18))
            }

            if taskMode == .list {
                Button {
                    showingNewTask = true
                } label: {
                    Label("Создать задачу", systemImage: "plus.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(16)
                        .foregroundStyle(accent)
                        .background(accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 18))
                }
                .disabled(session.isWorking)
            }
        }
    }

    private func matchesTime(_ task: RemoteTask) -> Bool {
        let calendar = Calendar.current
        let now = Date()
        let today = calendar.startOfDay(for: now)
        let deadline = NativeTaskDates.parse(task.dueDate)
        switch dateWindow {
        case .all: return true
        case .undated: return deadline == nil
        case .today: return deadline.map { calendar.isDate($0, inSameDayAs: today) } ?? false
        case .tomorrow:
            guard let tomorrow = calendar.date(byAdding: .day, value: 1, to: today) else { return false }
            return deadline.map { calendar.isDate($0, inSameDayAs: tomorrow) } ?? false
        case .week:
            guard let end = calendar.date(byAdding: .day, value: 7, to: today),
                  let deadline else { return false }
            return deadline >= today && deadline < end
        case .overdue: return deadline.map { $0 < now } ?? false
        }
    }

    private func sortedTasks(_ tasks: [RemoteTask]) -> [RemoteTask] {
        tasks.sorted { lhs, rhs in
            let priorityA: Int
            let priorityB: Int
            switch taskOrder {
            case .urgency:
                priorityA = lhs.urgency ?? 3
                priorityB = rhs.urgency ?? 3
            case .importance:
                priorityA = lhs.importance ?? 3
                priorityB = rhs.importance ?? 3
            case .dueDate:
                priorityA = 0
                priorityB = 0
            }
            if priorityA != priorityB { return priorityA > priorityB }
            let dateA = NativeTaskDates.parse(lhs.dueDate) ?? .distantFuture
            let dateB = NativeTaskDates.parse(rhs.dueDate) ?? .distantFuture
            if dateA != dateB { return dateA < dateB }
            return lhs.title.localizedStandardCompare(rhs.title) == .orderedAscending
        }
    }

    private func stat(_ label: String, value: String, symbol: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(color)
            Text(value)
                .font(.system(size: 29, weight: .bold, design: .rounded))
                .monospacedDigit()
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(card, in: RoundedRectangle(cornerRadius: 22))
    }

    private func filter(_ title: String, id: String?, tint: Color? = nil) -> some View {
        let sphereTint = tint ?? accent
        return Button {
            selectedSphereID = id
        } label: {
            HStack(spacing: 7) {
                if tint != nil {
                    Circle().fill(sphereTint).frame(width: 8, height: 8)
                }
                Text(title)
            }
            .font(.subheadline.weight(.medium))
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(selectedSphereID == id ? sphereTint.opacity(0.18) : card, in: Capsule())
            .overlay(Capsule().stroke(selectedSphereID == id ? sphereTint.opacity(0.60) : Color.clear, lineWidth: 1))
            .foregroundStyle(selectedSphereID == id ? sphereTint : Color.primary)
        }
        .buttonStyle(.plain)
    }

    private func taskRow(_ task: RemoteTask) -> some View {
        let sphere = session.spheres.first { $0.id == task.sphereId }
        let tint = sphere.map { Color(sphereHex: $0.color) } ?? accent
        return HStack(spacing: 10) {
            Button {
                Task { await session.toggleTask(task) }
            } label: {
                Image(systemName: task.isComplete ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 25))
                    .foregroundStyle(task.isComplete ? .green : tint)
                    .frame(width: 35, height: 46)
            }
            .buttonStyle(.plain)
            .disabled(session.isWorking)
            .accessibilityLabel(task.isComplete ? "Вернуть задачу \(task.title)" : "Завершить задачу \(task.title)")

            Button {
                editingTask = task
            } label: {
                VStack(alignment: .leading, spacing: 5) {
                    Text(task.title)
                        .font(.system(size: 14, weight: .semibold))
                        .strikethrough(task.isComplete)
                        .foregroundStyle(task.isComplete ? Color.secondary : Color.primary)
                        .multilineTextAlignment(.leading)
                    HStack(spacing: 5) {
                        Circle().fill(tint).frame(width: 7, height: 7)
                        Text(sphere?.name ?? "Без сферы")
                        if task.isCollaborative == true { Text("· Совместная") }
                        if let due = task.dueDate { Text("· \(String(due.prefix(10)))") }
                    }
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                }
                .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Открыть задачу \(task.title)")
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 15)
        .padding(.vertical, 8)
        .background(card, in: RoundedRectangle(cornerRadius: 19))
    }

    private var emptyTasks: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle")
                .font(.system(size: 32))
                .foregroundStyle(accent)
            Text("Здесь пока нет задач")
                .font(.headline)
            Text("Создай первую или выбери другую сферу.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(30)
        .background(card, in: RoundedRectangle(cornerRadius: 22))
    }

    private func upcomingModule(_ title: String, symbol: String, message: String) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title)
                .font(.system(size: 30, weight: .bold, design: .rounded))
            VStack(alignment: .leading, spacing: 14) {
                Image(systemName: symbol)
                    .font(.system(size: 35))
                    .foregroundStyle(accent)
                Text("Подключение в следующей версии")
                    .font(.title3.bold())
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(24)
            .background(card, in: RoundedRectangle(cornerRadius: 24))
        }
    }

    private func errorBanner(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Label(message, systemImage: "exclamationmark.triangle")
                .font(.subheadline)
                .foregroundStyle(.orange)
            Button("Повторить") {
                Task { await session.refresh() }
            }
            .disabled(session.isWorking)
            .font(.caption.weight(.bold))
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.11), in: RoundedRectangle(cornerRadius: 16))
    }

    private var navigation: some View {
        HStack(spacing: 4) {
            ForEach(ConnectedTab.allCases) { tab in
                Button {
                    selectedTab = tab
                } label: {
                    VStack(spacing: 5) {
                        Image(systemName: tab.symbol)
                            .font(.system(size: 20, weight: .semibold))
                            .frame(height: 24)
                        Text(tab.rawValue)
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundStyle(selectedTab == tab ? accent : .secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selectedTab == tab ? [.isSelected] : [])
            }
        }
        .padding(.horizontal, 10)
        .background(card)
        .overlay(alignment: .top) { Divider().opacity(0.35) }
    }
}

private struct NewServerTaskSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: NativeWorkspaceSession
    @State private var title = ""
    @State private var sphereID = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Задача") {
                    TextField("Название", text: $title)
                        .submitLabel(.done)
                    Picker("Сфера", selection: $sphereID) {
                        Text("Без сферы").tag("")
                        ForEach(session.spheres) { sphere in
                            Text(sphere.name).tag(sphere.id)
                        }
                    }
                }
                Section {
                    Text("Задача сразу сохранится на сервере и будет видна в Android и веб-версии.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Новая задача")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(session.isWorking ? "Сохраняем…" : "Сохранить") {
                        Task {
                            let saved = await session.addTask(
                                title: title, sphereId: sphereID.isEmpty ? nil : sphereID
                            )
                            if saved { dismiss() }
                        }
                    }
                    .disabled(session.isWorking || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

private extension Color {
    init(sphereHex: String?) {
        let hex = (sphereHex ?? "").trimmingCharacters(in: CharacterSet(charactersIn: "# "))
        guard hex.count == 6, let value = UInt64(hex, radix: 16) else {
            self = Color(red: 0.54, green: 0.49, blue: 0.97)
            return
        }
        self = Color(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
