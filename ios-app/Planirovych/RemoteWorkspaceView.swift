import SwiftUI

private enum ConnectedTab: String, CaseIterable, Identifiable {
    case overview = "Общая"
    case timeline = "Таймлайн"
    case chat = "ИИ-чат"
    case economic = "Экономыч"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .overview: return "square.grid.2x2.fill"
        case .timeline: return "calendar"
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
    @State private var openedTimelineHabit: RemoteHabit?
    @State private var showCredits = false
    @State private var quickEntryKind: NativeQuickEntryKind?
    @State private var showingQuickVoice = false
    @State private var quickAIWaiting = false
    @State private var taskOrder: TaskOrder = .urgency
    @State private var dateWindow: TaskDateWindow = .all
    @State private var taskMode: TaskDisplayMode = .list
    @State private var showCompletedTasks = false
    @State private var searchExpanded = false
    @FocusState private var searchFocused: Bool
    @State private var searchQuery = ""
    @State private var showOverdue = false
    @State private var showSectorSettings = false
    @State private var showAccount = false
    @State private var showAppSettings = false
    @State private var showTaskFilters = false
    @State private var accountName = ""
    @State private var accountUsername = ""
    @State private var accountEmail = ""
    @State private var accountPassword = ""

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
    private var plannedToday: [RemoteTask] {
        allActualTasks.filter { task in
            guard let date = NativeTaskDates.parse(task.dueDate) else { return false }
            return Calendar.current.isDateInToday(date)
        }
    }
    private var overdueTasks: [RemoteTask] {
        allActualTasks.filter { task in
            guard !task.isComplete, let date = NativeTaskDates.parse(task.dueDate) else { return false }
            return date < Date()
        }.sorted {
            (NativeTaskDates.parse($0.dueDate) ?? .distantFuture) <
            (NativeTaskDates.parse($1.dueDate) ?? .distantFuture)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            if selectedTab == .economic {
                NativeEconomicView(
                    session: session, awaitingVoice: quickAIWaiting,
                    onVoiceRequested: { showingQuickVoice = true }
                )
            } else if selectedTab == .chat {
                header
                    .padding(.horizontal, 16)
                Rectangle()
                    .fill(LinearGradient(
                        colors: [background, background.opacity(0.35)],
                        startPoint: .top, endPoint: .bottom))
                    .frame(height: 9)
                NativeChatView(session: session)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        header
                        if let error = session.errorMessage {
                            errorBanner(error)
                        }
                        switch selectedTab {
                        case .overview: overview
                        case .timeline: timelineContent
                        case .chat: EmptyView()
                        case .economic: EmptyView()
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
        .overlay(alignment: .bottomTrailing) {
            if selectedTab == .overview || selectedTab == .timeline {
                quickPlusButton
                    .padding(.trailing, 22)
                    .padding(.bottom, 90)
            }
        }
        .onChange(of: session.firstChatReactionSerial) { _, _ in
            if quickAIWaiting {
                selectedTab = .chat
                quickAIWaiting = false
            }
        }
        .sheet(isPresented: $showingQuickVoice) {
            NativeQuickVoiceSheet(session: session, economic: selectedTab == .economic) { recordingData, duration in
                quickAIWaiting = true
                Task {
                    do {
                        let text = try await session.transcribeVoice(data: recordingData,
                                                                    duration: duration)
                        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                            session.chatError = "Не удалось распознать голосовой запрос."
                            quickAIWaiting = false
                            selectedTab = .chat
                            return
                        }
                        let succeeded = await session.sendQuickVoiceRequest(text)
                        if !succeeded {
                            quickAIWaiting = false
                            selectedTab = .chat
                        }
                    } catch {
                        session.chatError = error.localizedDescription
                        quickAIWaiting = false
                        selectedTab = .chat
                    }
                }
            }
            .presentationDetents([.large])
        }
        .sheet(item: $quickEntryKind) { kind in
            NativeQuickCreateSheet(session: session, kind: kind)
                .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showingNewTask) {
            NewServerTaskSheet(session: session)
                .presentationDetents([.medium])
        }
        .sheet(item: $openedTimelineHabit) { habit in
            NativeHabitDetailSheet(session: session, habitID: habit.id)
                .presentationDetents([.large])
        }
        .sheet(isPresented: $showCredits) {
            NativeCreditsSheet(session: session)
                .presentationDetents([.medium, .large])
        }
        .sheet(item: $editingTask) { task in
            NativeTaskEditorSheet(session: session, task: task)
                .presentationDetents([.large])
        }
        .sheet(isPresented: $showOverdue) {
            NavigationStack {
                List {
                    if overdueTasks.isEmpty {
                        Text("Просроченных задач нет")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(overdueTasks) { task in
                            Button {
                                showOverdue = false
                                editingTask = task
                            } label: {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(task.title).foregroundStyle(.primary)
                                    Text(String((task.dueDate ?? "").prefix(16)))
                                        .font(.caption).foregroundStyle(.red)
                                }
                            }
                        }
                    }
                }
                .navigationTitle("Просроченные задачи")
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Закрыть") { showOverdue = false }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Отложить все") {
                            Task {
                                if await session.postponeOverdueTasks(overdueTasks) {
                                    showOverdue = false
                                }
                            }
                        }
                        .disabled(overdueTasks.isEmpty || session.isWorking)
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showSectorSettings) {
            SectorSettingsSheet(session: session)
                .presentationDetents([.large])
        }
        .sheet(isPresented: $showAccount) {
            NavigationStack {
                Form {
                    Section("Данные аккаунта") {
                        TextField("Имя", text: $accountName)
                        TextField("Логин", text: $accountUsername)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        TextField("Электронная почта", text: $accountEmail)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            .autocorrectionDisabled()
                        SecureField("Текущий пароль, если требуется", text: $accountPassword)
                    }
                    Section {
                        Button("Сохранить данные") {
                            Task {
                                if await session.updateProfile(name: accountName,
                                    username: accountUsername, email: accountEmail,
                                    currentPassword: accountPassword.isEmpty ? nil : accountPassword) {
                                    showAccount = false
                                    accountPassword = ""
                                }
                            }
                        }
                        .disabled(session.isWorking || accountUsername.isEmpty || accountEmail.isEmpty)
                        if let error = session.errorMessage {
                            Text(error).font(.footnote).foregroundStyle(.red)
                        }
                    }
                    Section("ИИ-кредиты") {
                        Text("\(session.account?.aiCredits ?? 0)")
                    }
                    Section {
                        Button("Выйти из аккаунта", role: .destructive) {
                            showAccount = false
                            Task { await session.logout() }
                        }
                    }
                }
                .navigationTitle("Управление аккаунтом")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Закрыть") { showAccount = false }
                    }
                }
                .onAppear {
                    accountName = session.account?.name ?? ""
                    accountUsername = session.account?.username ?? ""
                    accountEmail = session.account?.email ?? ""
                    accountPassword = ""
                }
            }
        }
        .sheet(isPresented: $showAppSettings) {
            NavigationStack {
                Form {
                    Section("Планировыч") {
                        Button("Обновить данные") {
                            Task { await session.refresh() }
                            showAppSettings = false
                        }
                        Button("Управление аккаунтом") {
                            showAppSettings = false
                            showAccount = true
                        }
                    }
                }
                .navigationTitle("Настройки")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Закрыть") { showAppSettings = false }
                    }
                }
            }
        }
    }

    private var header: some View {
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles.rectangle.stack.fill")
                    .font(.system(size: 23))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(
                        LinearGradient(colors: [
                            Color(red: 0.46, green: 0.34, blue: 0.80),
                            Color(red: 0.23, green: 0.66, blue: 0.81)
                        ], startPoint: .topLeading, endPoint: .bottomTrailing),
                        in: RoundedRectangle(cornerRadius: 12)
                    )
                VStack(alignment: .leading, spacing: 1) {
                    Text("Планировыч")
                        .font(.system(size: 17, weight: .heavy, design: .rounded))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.83)
                    Text(session.account?.displayName ?? "Мой профиль")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Button { showAccount = true } label: {
                    Image(systemName: "person.crop.circle")
                        .font(.system(size: 22))
                        .foregroundStyle(Color(red: 0.59, green: 0.43, blue: 0.88))
                        .frame(width: 37, height: 40)
                        .background(accent.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
                }
                .accessibilityLabel("Управление аккаунтом")
                Button { showCredits = true } label: {
                    HStack(spacing: 3) {
                        Image(systemName: "circle.hexagongrid.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(Color(red: 0.83, green: 0.41, blue: 0.57))
                    Text("\(session.account?.aiCredits ?? 0)")
                        .font(.system(size: 11, weight: .bold))
                        .lineLimit(1)
                }
                .padding(.horizontal, 5)
                .frame(height: 40)
                .background(accent.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                    }
                .buttonStyle(.plain)
                .accessibilityLabel("ИИ-кредиты: открыть баланс и статистику")
                Button {
                    searchExpanded.toggle()
                } label: {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 21, weight: .medium))
                        .foregroundStyle(Color(red: 0.10, green: 0.65, blue: 0.63))
                        .frame(width: 37, height: 40)
                        .background(Color.teal.opacity(0.09),
                                    in: RoundedRectangle(cornerRadius: 12))
                }
                .accessibilityLabel("Поиск")
                Button { showAppSettings = true } label: {
                    Image(systemName: "gearshape")
                        .font(.system(size: 21, weight: .medium))
                        .foregroundStyle(Color(red: 0.77, green: 0.55, blue: 0.21))
                        .frame(width: 37, height: 40)
                        .background(Color.orange.opacity(0.08),
                                    in: RoundedRectangle(cornerRadius: 12))
                }
                .accessibilityLabel("Настройки")
            }
            if searchExpanded {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(accent)
                    TextField("Поиск по задачам", text: $searchQuery)
                        .textInputAutocapitalization(.sentences)
                        .focused($searchFocused)
                    Button { searchQuery = ""; searchExpanded = false } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                    }
                    .accessibilityLabel("Закрыть поиск")
                }
                .padding(11)
                .background(card, in: RoundedRectangle(cornerRadius: 14))
            }
        }
        .padding(.top, 10)
        .padding(.bottom, 9)
        .onChange(of: searchExpanded) { _, opened in
            if opened {
                searchFocused = true
            } else {
                searchFocused = false
            }
        }
    }

    private var overview: some View {
        VStack(alignment: .leading, spacing: 19) {
            NativeHabitsStrip(session: session)

            Text("Статистика выполнения")
                .font(.system(size: 27, weight: .bold, design: .rounded))

            HStack(spacing: 12) {
                stat("Все задачи", done: doneCount, total: allActualTasks.count,
                     symbol: "checkmark.circle.fill", color: accent)
                stat("За сегодня", done: plannedToday.filter { $0.isComplete }.count,
                     total: plannedToday.count, symbol: "calendar", color: accent)
            }

            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Сектора").font(.title3.weight(.bold))
                    Spacer()
                    Text("\(session.spheres.count)")
                        .font(.caption).foregroundStyle(.secondary)
                    Button { showSectorSettings = true } label: {
                        Image(systemName: "gearshape")
                            .font(.system(size: 19))
                            .frame(width: 32, height: 32)
                    }
                    .accessibilityLabel("Настройки секторов")
                }
                if session.spheres.isEmpty {
                    Text("Сектора пока не созданы")
                        .font(.subheadline).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity).padding(.vertical, 30)
                } else {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()),
                                        GridItem(.flexible())], spacing: 14) {
                        ForEach(session.spheres) { sphere in
                            Button {
                                selectedSphereID = selectedSphereID == sphere.id ? nil : sphere.id
                            } label: {
                                VStack(spacing: 7) {
                                    ZStack {
                                        Circle()
                                            .fill(Color(sphereHex: sphere.color).opacity(0.17))
                                            .frame(width: 75, height: 75)
                                        Circle()
                                            .fill(Color(sphereHex: sphere.color))
                                            .frame(width: 62, height: 62)
                                        Text("\(allActualTasks.filter { $0.sphereId == sphere.id && !$0.isComplete }.count)")
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
                                .padding(5)
                                .background(
                                    selectedSphereID == sphere.id ? accent.opacity(0.12) : Color.clear,
                                    in: RoundedRectangle(cornerRadius: 17)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(18)
            .background(card, in: RoundedRectangle(cornerRadius: 24))

            HStack {
                Text("Ваши задачи")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                Spacer()
                if selectedSphereID != nil {
                    Button("Все сектора") { selectedSphereID = nil }
                        .font(.caption).foregroundStyle(accent)
                }
            }

            taskList
        }
    }

    private var timelineContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Таймлайн")
                .font(.system(size: 28, weight: .bold, design: .rounded))
            NativeTaskTimelineView(
                tasks: session.tasks.filter { !$0.isComplete },
                spheres: session.spheres,
                habits: session.habits,
                onOpenTask: { task in editingTask = task },
                onOpenHabit: { habit in openedTimelineHabit = habit },
                overdueCount: overdueTasks.count,
                onOpenOverdue: { showOverdue = true }
            )
        }
    }

    private var taskList: some View {
        let filtered = allActualTasks.filter {
            (selectedSphereID == nil || $0.sphereId == selectedSphereID)
                && matchesTime($0)
                && (searchQuery.isEmpty || $0.title.localizedCaseInsensitiveContains(searchQuery)
                    || ($0.description ?? "").localizedCaseInsensitiveContains(searchQuery))
        }
        let active = sortedTasks(filtered.filter { !$0.isComplete })
        let completed = sortedTasks(filtered.filter { $0.isComplete })
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Button {
                    Task { _ = await session.postponeOverdueTasks(overdueTasks) }
                } label: {
                    Label("Отложить", systemImage: "clock")
                        .frame(maxWidth: .infinity)
                }
                .disabled(overdueTasks.isEmpty || session.isWorking)
                .accessibilityLabel("Отложить просроченные задачи")

                Button { showOverdue = true } label: {
                    VStack(spacing: 2) {
                        Text("Просроченные")
                            .lineLimit(1).minimumScaleFactor(0.75)
                        Text("задачи")
                    }
                    .frame(maxWidth: .infinity)
                    .overlay(alignment: .topTrailing) {
                        if !overdueTasks.isEmpty {
                            Text("\(overdueTasks.count)")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 3)
                                .background(.red, in: Capsule())
                                .offset(x: 8, y: -9)
                        }
                    }
                }
                .accessibilityLabel("Просроченные задачи: \(overdueTasks.count)")

                Menu {
                    Picker("Сортировка", selection: $taskOrder) {
                        ForEach(TaskOrder.allCases, id: \.self) { order in
                            Text(order.rawValue).tag(order)
                        }
                    }
                    Picker("По времени", selection: $dateWindow) {
                        ForEach(TaskDateWindow.allCases, id: \.self) { window in
                            Text(window.rawValue).tag(window)
                        }
                    }
                    Button("Сбросить фильтры") {
                        taskOrder = .urgency
                        dateWindow = .all
                        selectedSphereID = nil
                    }
                } label: {
                    Label("Фильтры", systemImage: "line.3.horizontal.decrease")
                        .frame(maxWidth: .infinity)
                }
            }
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(accent)
            .padding(.vertical, 13)
            .padding(.horizontal, 6)
            .background(card, in: RoundedRectangle(cornerRadius: 16))

            if active.isEmpty {
                emptyTasks
            } else {
                ForEach(active) { task in taskRow(task) }
            }

            if !completed.isEmpty {
                DisclosureGroup(isExpanded: $showCompletedTasks) {
                    VStack(spacing: 9) {
                        ForEach(completed) { task in taskRow(task) }
                    }.padding(.top, 9)
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

            Button { showingNewTask = true } label: {
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

    private func stat(_ label: String, done: Int, total: Int,
                      symbol: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: symbol)
                    .font(.system(size: 18))
                    .foregroundStyle(color)
                Text(label)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Text("\(done) из \(total)")
                .font(.system(size: 27, weight: .bold, design: .rounded))
                .minimumScaleFactor(0.78)
                .lineLimit(1)
                .monospacedDigit()
            ProgressView(value: Double(done), total: Double(max(1, total)))
                .tint(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(17)
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

    private var quickPlusButton: some View {
        Menu {
            Button {
                showingQuickVoice = true
            } label: {
                Label("Голосовой ввод", systemImage: "mic.fill")
            }
            Divider()
            ForEach(NativeQuickEntryKind.allCases) { kind in
                Button {
                    quickEntryKind = kind
                } label: {
                    Label(kind.rawValue, systemImage: kind.symbol)
                }
            }
        } label: {
            ZStack {
                Circle()
                    .fill(LinearGradient(colors: [
                        Color(red: 0.50, green: 0.34, blue: 0.87),
                        Color(red: 0.24, green: 0.72, blue: 0.82)
                    ], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 58, height: 58)
                if quickAIWaiting {
                    Circle()
                        .trim(from: 0.05, to: 0.8)
                        .stroke(.white.opacity(0.9), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .frame(width: 42, height: 42)
                        .rotationEffect(.degrees(quickAIWaiting ? 360 : 0))
                        .animation(.linear(duration: 1.1).repeatForever(autoreverses: false),
                                   value: quickAIWaiting)
                }
                Image(systemName: quickAIWaiting ? "sparkles" : "plus")
                    .font(.system(size: 27, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .shadow(color: Color.purple.opacity(0.25), radius: 12, y: 6)
        }
        .disabled(quickAIWaiting || session.isWorking)
        .accessibilityLabel(quickAIWaiting ? "Планировыч обрабатывает голосовой запрос" :
                            "Добавить задачу, событие, напоминание или голосовой запрос")
    }

    private var navigation: some View {
        HStack(spacing: 4) {
            ForEach(ConnectedTab.allCases) { tab in
                Button {
                    selectedTab = tab
                } label: {
                    VStack(spacing: 5) {
                        Image(systemName: tab.symbol)
                            .font(.system(size: 24, weight: .semibold))
                            .frame(height: 28)
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

private struct SectorIconOption {
    let code: String
    let title: String
    let symbol: String
}
private let sectorIconOptions: [SectorIconOption] = [
    .init(code:"briefcase",title:"Работа",symbol:"briefcase.fill"),
    .init(code:"heart",title:"Здоровье",symbol:"heart.fill"),
    .init(code:"home",title:"Дом",symbol:"house.fill"),
    .init(code:"graduation-cap",title:"Учёба",symbol:"graduationcap.fill"),
    .init(code:"dumbbell",title:"Спорт",symbol:"dumbbell.fill"),
    .init(code:"wallet",title:"Финансы",symbol:"wallet.bifold.fill"),
    .init(code:"book-open",title:"Книги",symbol:"book.fill"),
    .init(code:"palette",title:"Творчество",symbol:"paintpalette.fill"),
    .init(code:"plane",title:"Поездки",symbol:"airplane"),
    .init(code:"car",title:"Авто",symbol:"car.fill"),
    .init(code:"music",title:"Музыка",symbol:"music.note"),
    .init(code:"star",title:"Избранное",symbol:"star.fill"),
    .init(code:"target",title:"Цели",symbol:"scope"),
    .init(code:"laptop",title:"Проекты",symbol:"laptopcomputer"),
    .init(code:"users",title:"Семья",symbol:"person.2.fill"),
    .init(code:"shopping-cart",title:"Покупки",symbol:"cart.fill"),
    .init(code:"sprout",title:"Природа",symbol:"leaf.fill"),
    .init(code:"coffee",title:"Отдых",symbol:"cup.and.saucer.fill"),
    .init(code:"calendar",title:"Планы",symbol:"calendar"),
    .init(code:"lightbulb",title:"Идеи",symbol:"lightbulb.fill"),
    .init(code:"sparkles",title:"Развитие",symbol:"sparkles"),
    .init(code:"trophy",title:"Достижения",symbol:"trophy.fill"),
    .init(code:"globe",title:"Мир",symbol:"globe"),
    .init(code:"paw-print",title:"Питомцы",symbol:"pawprint.fill")
]
private func sectorIconSymbol(_ code: String?) -> String {
    sectorIconOptions.first(where: { $0.code == code })?.symbol ?? "briefcase.fill"
}

private struct SectorSettingsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: NativeWorkspaceSession
    @State private var editingID: String?
    @State private var editing = false
    @State private var name = ""
    @State private var color = Color.purple
    @State private var icon = "briefcase"
    @State private var prompt = ""
    @State private var showingDelete = false
    private let accentColor = Color(red: 0.54, green: 0.39, blue: 0.86)

    private func openEditor(_ sphere: RemoteSphere?) {
        editingID = sphere?.id
        name = sphere?.name ?? ""
        color = Color(sphereHex: sphere?.color)
        icon = sphere?.icon ?? "briefcase"
        prompt = sphere?.generalPrompt ?? ""
        editing = true
    }

    var body: some View {
        NavigationStack {
            Form {
                if editing {
                    Section("Сектор") {
                        TextField("Название", text: $name)
                        ColorPicker("Цвет", selection: $color, supportsOpacity: false)
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Иконка сектора")
                                .font(.subheadline.weight(.semibold))
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 7),
                                                     count: 4), spacing: 8) {
                                ForEach(sectorIconOptions, id: \.code) { option in
                                    let selected = icon == option.code
                                    Button {
                                        icon = option.code
                                    } label: {
                                        VStack(spacing: 6) {
                                            Image(systemName: option.symbol)
                                                .font(.system(size: 22))
                                            Text(option.title)
                                                .font(.system(size: 9, weight: .medium))
                                                .lineLimit(1)
                                                .minimumScaleFactor(0.75)
                                        }
                                        .foregroundStyle(selected ? accentColor : .secondary)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 10)
                                        .background(selected ? accentColor.opacity(0.12) : Color.secondary.opacity(0.05),
                                                    in: RoundedRectangle(cornerRadius: 12))
                                        .overlay {
                                            RoundedRectangle(cornerRadius: 12)
                                                .stroke(selected ? accentColor : Color.secondary.opacity(0.17),
                                                        lineWidth: selected ? 2 : 1)
                                        }
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel(option.title)
                                    .accessibilityAddTraits(selected ? .isSelected : [])
                                }
                            }
                        }
                        TextField("Общий промпт", text: $prompt, axis: .vertical)
                            .lineLimit(2...4)
                    }
                    Section {
                        Button("Сохранить") {
                            Task {
                                let saved = await session.saveSphere(
                                    id: editingID, name: name,
                                    color: color.toSphereHex, icon: icon, prompt: prompt
                                )
                                if saved { editing = false }
                            }
                        }
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || session.isWorking)
                    }
                    if editingID != nil {
                        Section {
                            Button("Удалить сектор", role: .destructive) {
                                showingDelete = true
                            }.disabled(session.isWorking)
                        }
                    }
                } else {
                    Section("Сектора") {
                        ForEach(session.spheres) { sphere in
                            Button {
                                openEditor(sphere)
                            } label: {
                                HStack {
                                    Image(systemName: sectorIconSymbol(sphere.icon))
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(.white)
                                        .frame(width: 30, height: 30)
                                        .background(Color(sphereHex: sphere.color), in: Circle())
                                    Text(sphere.name).foregroundStyle(.primary)
                                    Spacer()
                                    Image(systemName: "pencil").foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    Section {
                        Button {
                            openEditor(nil)
                        } label: {
                            Label("Добавить сектор", systemImage: "plus.circle.fill")
                        }
                    }
                }
                if let error = session.errorMessage {
                    Section {
                        Text(error).foregroundStyle(.red)
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle(editing ? "Редактор сектора" : "Настройки секторов")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if editing {
                        Button("Назад") { editing = false }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Готово") { dismiss() }
                }
            }
            .confirmationDialog("Удалить сектор?", isPresented: $showingDelete) {
                Button("Удалить", role: .destructive) {
                    guard let editingID else { return }
                    Task {
                        if await session.deleteSphere(id: editingID) {
                            editing = false
                        }
                    }
                }
            } message: {
                Text("Сектор будет удалён. Проверьте задачи, которые к нему относятся.")
            }
        }
    }
}

private extension Color {
    var toSphereHex: String {
        let value = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard value.getRed(&r, green: &g, blue: &b, alpha: &a) else {
            return "#8B5CF6"
        }
        return String(format: "#%02X%02X%02X",
            Int((r * 255).rounded()), Int((g * 255).rounded()), Int((b * 255).rounded()))
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
