import SwiftUI

@MainActor
final class NativeWorkspaceSession: ObservableObject {
    @Published private(set) var account: ServerAccount?
    @Published private(set) var tasks: [RemoteTask] = []
    @Published private(set) var spheres: [RemoteSphere] = []
    @Published private(set) var habits: [RemoteHabit] = []
    @Published private(set) var chatMessages: [RemoteChatMessage] = []
    @Published private(set) var chatProjects: [NativeChatProject] = []
    @Published private(set) var selectedProjectID: String?
    @Published private(set) var selectedThreadID: String?
    @Published private(set) var isLoadingChat = false
    @Published private(set) var isSendingChat = false
    @Published private(set) var chatStreamText = ""
    @Published private(set) var chatProgressStatus: String?
    @Published private(set) var firstChatReactionSerial = 0
    @Published var chatError: String?
    @Published private(set) var checkingSession = true
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

    private let api = NativeAPI()
    private var didBootstrap = false

    func bootstrap() async {
        guard !didBootstrap else { return }
        didBootstrap = true
        checkingSession = true
        defer { checkingSession = false }
        do {
            account = try await api.restoreAccount()
            if account != nil { await refresh() }
        } catch {
            errorMessage = "Не удалось восстановить подключение: \(error.localizedDescription)"
        }
    }

    func login(login: String, password: String) async {
        guard !isWorking else { return }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            account = try await api.logIn(login: login, password: password)
            try await loadWorkspace()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refreshAiBalance() async {
        guard let id = account?.id else { return }
        if let profile = try? await api.restoreAccount(), profile.id == id, account?.id == id {
            account = profile
        }
    }

    func refresh() async {
        guard account != nil, !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            try await loadWorkspace()
            errorMessage = nil
        } catch {
            handle(error)
        }
    }

    func updateProfile(name: String, username: String, email: String,
                       currentPassword: String?) async -> Bool {
        guard account != nil, !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            account = try await api.updateProfile(name: name, username: username,
                                                   email: email, currentPassword: currentPassword)
            errorMessage = nil
            return true
        } catch {
            handle(error)
            return false
        }
    }

    func saveSphere(id: String?, name: String, color: String,
                    icon: String, prompt: String) async -> Bool {
        guard account != nil, !isWorking, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await api.saveSphere(id: id, name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                                     color: color, icon: icon, prompt: prompt)
            try await loadWorkspace()
            errorMessage = nil
            return true
        } catch {
            handle(error)
            return false
        }
    }

    func deleteSphere(id: String) async -> Bool {
        guard account != nil, !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await api.deleteSphere(id: id)
            try await loadWorkspace()
            errorMessage = nil
            return true
        } catch {
            handle(error)
            return false
        }
    }

    func postponeOverdueTasks(_ tasks: [RemoteTask]) async -> Bool {
        guard account != nil, !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            for task in tasks {
                try await api.postponeTaskToToday(task)
            }
            try await loadWorkspace()
            errorMessage = nil
            return true
        } catch {
            handle(error)
            return false
        }
    }

    func addTask(title: String, sphereId: String?) async -> Bool {
        guard account != nil, !isWorking else { return false }
        let cleaned = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            _ = try await api.createTask(title: cleaned, sphereId: sphereId)
            try await loadWorkspace()
            errorMessage = nil
            return true
        } catch {
            handle(error)
            return false
        }
    }

    func addPlannerEntry(title: String, type: String, dueDate: Date?,
                         sphereId: String?) async -> Bool {
        guard account != nil, !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            _ = try await api.createPlannerEntry(title: title, type: type,
                                                 dueDate: dueDate, sphereId: sphereId)
            try await loadWorkspace()
            errorMessage = nil
            return true
        } catch {
            handle(error)
            return false
        }
    }

    func saveTask(id: String, title: String, description: String) async -> Bool {
        guard account != nil, !isWorking else { return false }
        let cleaned = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            _ = try await api.updateTask(id: id, title: cleaned, description: description)
            try await loadWorkspace()
            errorMessage = nil
            return true
        } catch {
            handle(error)
            return false
        }
    }

    func saveTaskSettings(task: RemoteTask, dueDate: Date?,
                          importance: Int, urgency: Int, sphereId: String?,
                          isRecurring: Bool, recurrence: NativeRecurrenceRule?,
                          recurrenceSummary: String?) async -> Bool {
        guard account != nil, !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            _ = try await api.updateTaskSettings(id: task.id, dueDate: dueDate,
                                                 importance: importance, urgency: urgency, sphereId: sphereId,
                                                 isSubtask: task.parentTaskId != nil,
                                                 isRecurring: isRecurring, recurrence: recurrence,
                                                 recurrenceSummary: recurrenceSummary)
            try await loadWorkspace()
            errorMessage = nil
            return true
        } catch {
            handle(error)
            return false
        }
    }

    func parseRecurrence(_ text: String, taskId: String?) async throws -> (NativeRecurrenceRule, String) {
        try await api.parseRecurrence(prompt: text, taskId: taskId)
    }

    func addSubtask(title: String, parent: RemoteTask) async -> Bool {
        guard account != nil, !isWorking else { return false }
        let cleaned = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            _ = try await api.createTask(title: cleaned, sphereId: parent.sphereId,
                                         parentTaskId: parent.id)
            try await loadWorkspace()
            errorMessage = nil
            return true
        } catch {
            handle(error)
            return false
        }
    }

    func upsertHabit(id: String?, name: String, icon: String, color: String,
                     targetCount: Int, recurrenceType: String, weekdays: [Int],
                     intervalDays: Int?, reminderTimes: [String]) async -> Bool {
        guard account != nil, !isWorking else { return false }
        let cleaned = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            if let id {
                _ = try await api.updateHabit(id: id, name: cleaned, icon: icon, color: color,
                                              targetCount: targetCount, recurrenceType: recurrenceType,
                                              weekdays: weekdays, intervalDays: intervalDays,
                                              reminderTimes: reminderTimes)
            } else {
                _ = try await api.createHabit(name: cleaned, icon: icon, color: color,
                                              targetCount: targetCount, recurrenceType: recurrenceType,
                                              weekdays: weekdays, intervalDays: intervalDays,
                                              reminderTimes: reminderTimes)
            }
            habits = try await api.loadHabits()
            errorMessage = nil
            return true
        } catch {
            handle(error)
            return false
        }
    }

    func habitHistory(id: String) async throws -> [HabitCompletionStat] {
        try await api.loadHabitHistory(id: id)
    }

    func changeHabitAmount(_ habit: RemoteHabit, dateKey: String,
                           increment: Bool, amount: Int = 1) async {
        guard account != nil, !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            let updated = try await api.changeHabitAmount(habit, dateKey: dateKey,
                                                          increment: increment, amount: amount)
            if let index = habits.firstIndex(where: { $0.id == habit.id }) { habits[index] = updated }
            errorMessage = nil
        } catch { handle(error) }
    }

    func toggleHabit(_ habit: RemoteHabit, dateKey: String) async {
        guard account != nil, !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            let completed = habit.amount(on: dateKey) < habit.targetCount
            let updated = try await api.setHabitProgress(habit, dateKey: dateKey, completed: completed)
            if let index = habits.firstIndex(where: { $0.id == habit.id }) {
                habits[index] = updated
            }
            errorMessage = nil
        } catch { handle(error) }
    }

    var selectedChatProject: NativeChatProject? {
        chatProjects.first(where: { $0.id == selectedProjectID })
    }

    var selectedChatThread: NativeChatThread? {
        selectedChatProject?.chats.first(where: { $0.id == selectedThreadID })
    }

    func loadChat() async {
        guard account != nil, !isSendingChat else { return }
        isLoadingChat = true
        defer { isLoadingChat = false }
        do {
            chatProjects = try await api.loadChatProjects()
            if selectedChatThread == nil {
                let quick = chatProjects.first { $0.chats.contains(where: { $0.id == "quick-ai-requests" }) }
                let project = quick ?? chatProjects.first(where: { !$0.chats.isEmpty })
                selectedProjectID = project?.id
                selectedThreadID = project?.chats.first(where: { $0.id == "quick-ai-requests" })?.id
                    ?? project?.chats.first?.id
            }
            if let pid = selectedProjectID, let cid = selectedThreadID {
                chatMessages = try await api.loadChat(projectId: pid, chatId: cid)
            } else { chatMessages = [] }
            chatError = nil
        } catch { chatError = error.localizedDescription }
    }

    func selectChat(projectId: String, chatId: String) async {
        guard !isSendingChat, !isLoadingChat, account != nil else { return }
        selectedProjectID = projectId
        selectedThreadID = chatId
        isLoadingChat = true
        defer { isLoadingChat = false }
        do {
            chatMessages = try await api.loadChat(projectId: projectId, chatId: chatId)
            chatError = nil
        } catch { chatError = error.localizedDescription }
    }

    /// Quick-add always targets the account's quick AI conversation, never
    /// whichever project chat happens to be active in the navigation.
    func sendQuickVoiceRequest(_ question: String) async -> Bool {
        guard account != nil else { return false }
        if chatProjects.isEmpty { await loadChat() }
        if let quickProject = chatProjects.first(where: { project in
            project.chats.contains(where: { $0.id == "quick-ai-requests" })
        }) {
            if selectedThreadID != "quick-ai-requests" ||
                selectedProjectID != quickProject.id {
                await selectChat(projectId: quickProject.id, chatId: "quick-ai-requests")
            }
        }
        return await sendChat(question)
    }

    func sendChat(_ question: String) async -> Bool {
        guard account != nil, !isSendingChat, !isLoadingChat,
              let project = selectedChatProject, let thread = selectedChatThread else { return false }
        let cleaned = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return false }
        let history = chatMessages
        isSendingChat = true
        chatStreamText = ""
        chatProgressStatus = "analyzing_request"
        chatError = nil
        chatMessages.append(RemoteChatMessage(id: UUID().uuidString, role: "user", content: cleaned))
        defer {
            isSendingChat = false
            chatProgressStatus = nil
            chatStreamText = ""
        }
        var receivedFirstDelta = false
        do {
            let reply = try await api.sendChat(question: cleaned, history: history,
                                               project: project, thread: thread) { [weak self] event in
                guard let self else { return }
                switch event {
                case .delta(let delta):
                    self.chatStreamText += delta
                    if !receivedFirstDelta {
                        receivedFirstDelta = true
                        self.firstChatReactionSerial += 1
                    }
                case .reset:
                    self.chatStreamText = ""
                case .status(let status):
                    self.chatProgressStatus = status
                }
            }
            chatMessages.append(RemoteChatMessage(id: UUID().uuidString, role: "assistant",
                                                  content: reply.answer, taskProposal: reply.taskProposal,
                                                  economicProposals: reply.economicProposals,
                                                  generatedDocument: reply.generatedDocument,
                                                  assistantSettingsProposalId: reply.raw["assistantSettingsProposalId"] as? String))
            do {
                try await api.persistChatReply(projectId: project.id, chatId: thread.id,
                                               question: cleaned, reply: reply)
                chatMessages = try await api.loadChat(projectId: project.id, chatId: thread.id)
            } catch {
                chatError = "Ответ получен, но история пока не синхронизирована: \(error.localizedDescription)"
            }
            await refresh()
            return true
        } catch {
            chatError = error.localizedDescription
            return false
        }
    }

    func changeProposal(_ proposal: NativeAIProposal, economic: Bool,
                        action: String) async -> Bool {
        guard account != nil, !isSendingChat,
              let pid = selectedProjectID, let cid = selectedThreadID else { return false }
        isSendingChat = true
        defer { isSendingChat = false }
        do {
            _ = try await api.proposalAction(proposal, economic: economic, action: action)
            chatMessages = try await api.loadChat(projectId: pid, chatId: cid)
            await refresh()
            chatError = nil
            return true
        } catch {
            chatError = error.localizedDescription
            return false
        }
    }

    func transcribeVoice(data: Data, duration: TimeInterval) async throws -> String {
        try await api.transcribeVoice(data: data, duration: duration)
    }

    func toggleTask(_ task: RemoteTask) async {
        guard account != nil, !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            _ = try await api.setTaskCompleted(task, completed: !task.isComplete)
            try await loadWorkspace()
            errorMessage = nil
        } catch {
            handle(error)
        }
    }

    func logout() async {
        guard !isWorking else { return }
        isWorking = true
        await api.logOut()
        account = nil
        tasks = []
        spheres = []
        habits = []
        chatMessages = []
        chatStreamText = ""
        chatProgressStatus = nil
        chatProjects = []
        selectedProjectID = nil
        selectedThreadID = nil
        chatError = nil
        errorMessage = nil
        isWorking = false
    }

    private func loadWorkspace() async throws {
        async let workspace = api.loadWorkspace()
        async let fetchedHabits = api.loadHabits()
        let (loadedTasks, loadedSpheres) = try await workspace
        tasks = loadedTasks
        spheres = loadedSpheres
        habits = try await fetchedHabits
        await NativeHabitNotifications.syncIfAuthorized(habits)
    }

    private func handle(_ error: Error) {
        errorMessage = error.localizedDescription
        if (error as? NativeAPIError)?.isUnauthorized == true {
            // Credentials are no longer valid; never display cached account data.
            account = nil
            tasks = []
            spheres = []
            habits = []
            chatMessages = []
            chatProjects = []
            selectedProjectID = nil
            selectedThreadID = nil
        }
    }
}

struct ContentView: View {
    @StateObject private var session = NativeWorkspaceSession()
    @State private var showOfflineDemo = false
    @State private var subscriptionNotice: SubscriptionNotice?
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
#if DEBUG
            // Preview-only launch argument used by GitHub's iOS Simulator job.
            // Release builds never expose a shortcut around authentication.
            if let tab = Self.ciPreviewTab {
                DemoDashboardView(previewTabName: tab)
            } else {
                normalScreens
            }
#else
            normalScreens
#endif
        }
        .task {
#if DEBUG
            if Self.ciPreviewTab != nil { return }
#endif
            await session.bootstrap()
        }
        .task(id: session.account?.id) {
            guard let id = session.account?.id else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                guard !Task.isCancelled, session.account?.id == id else { return }
                if scenePhase == .active { await session.refreshAiBalance() }
            }
        }
        .task(id: session.account?.id) {
            guard let id = session.account?.id else { subscriptionNotice = nil; return }
            while !Task.isCancelled {
                if scenePhase == .active && subscriptionNotice == nil {
                    let notices = (try? await NativeAPI().subscriptionNotices()) ?? []
                    guard session.account?.id == id, !Task.isCancelled else { return }
                    let key = "subscription-notices-seen-" + id
                    let seen = Set(UserDefaults.standard.stringArray(forKey: key) ?? [])
                    if let next = notices.first(where: { !seen.contains($0.id) }) {
                        subscriptionNotice = next
                    }
                }
                try? await Task.sleep(for: .seconds(30))
            }
        }
        .alert(item: $subscriptionNotice) { notice in
            Alert(title: Text("Планировыч"), message: Text(notice.content), dismissButton: .default(Text("Понятно")) {
                guard let id = session.account?.id else { return }
                let key = "subscription-notices-seen-" + id
                let seen = UserDefaults.standard.stringArray(forKey: key) ?? []
                UserDefaults.standard.set(Array((seen + [notice.id]).suffix(100)), forKey: key)
            })
        }
        .sheet(isPresented: $showOfflineDemo) {
            DemoDashboardView()
        }
    }

#if DEBUG
    private static var ciPreviewTab: String? {
        let args = ProcessInfo.processInfo.arguments
        guard let flag = args.firstIndex(of: "--ci-preview-tab"),
              args.indices.contains(flag + 1) else { return nil }
        let tab = args[flag + 1]
        return ["overview", "timeline", "chat", "economic"].contains(tab) ? tab : nil
    }
#endif

    private var normalScreens: some View {
        Group {
            if session.checkingSession {
                VStack(spacing: 16) {
                    Image(systemName: "sparkles.rectangle.stack.fill")
                        .font(.system(size: 45))
                        .foregroundStyle(.purple)
                    ProgressView("Проверяем сессию")
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if session.account != nil {
                RemoteWorkspaceView(session: session)
            } else {
                NativeLoginView(
                    isWorking: session.isWorking,
                    errorMessage: session.errorMessage,
                    onLogin: { login, password in
                        Task { await session.login(login: login, password: password) }
                    },
                    onShowDemo: { showOfflineDemo = true }
                )
            }
        }
    }
}

private struct NativeLoginView: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var login = ""
    @State private var password = ""

    let isWorking: Bool
    let errorMessage: String?
    let onLogin: (String, String) -> Void
    let onShowDemo: () -> Void

    private var isValid: Bool {
        !login.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Spacer(minLength: 45)

                ZStack {
                    RoundedRectangle(cornerRadius: 24)
                        .fill(Color.purple.opacity(0.16))
                        .frame(width: 76, height: 76)
                    Image(systemName: "sparkles.rectangle.stack.fill")
                        .font(.system(size: 39))
                        .foregroundStyle(.purple)
                }

                VStack(alignment: .leading, spacing: 9) {
                    Text("Планировыч")
                        .font(.system(size: 39, weight: .bold, design: .rounded))
                    Text("Теперь на iPhone")
                        .font(.title3.weight(.medium))
                        .foregroundStyle(.secondary)
                    Text("Войди в свой аккаунт, чтобы увидеть настоящие задачи и сферы, синхронизированные с Android и сайтом.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.top, 3)
                }

                VStack(spacing: 14) {
                    HStack {
                        Image(systemName: "person.crop.circle")
                            .frame(width: 26)
                            .foregroundStyle(.secondary)
                        TextField("Логин или почта", text: $login)
                            .textContentType(.username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.emailAddress)
                            .submitLabel(.next)
                    }
                    .padding(17)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))

                    HStack {
                        Image(systemName: "lock")
                            .frame(width: 26)
                            .foregroundStyle(.secondary)
                        SecureField("Пароль", text: $password)
                            .textContentType(.password)
                            .submitLabel(.go)
                            .onSubmit(submit)
                    }
                    .padding(17)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))

                    if let errorMessage {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button(action: submit) {
                        HStack(spacing: 10) {
                            if isWorking { ProgressView().tint(.white) }
                            Text(isWorking ? "Подключаемся…" : "Войти")
                                .font(.headline)
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(Color.purple, in: RoundedRectangle(cornerRadius: 18))
                    }
                    .disabled(!isValid || isWorking)
                    .opacity(isValid && !isWorking ? 1 : 0.58)
                }
                .padding(.top, 12)

                Button(action: onShowDemo) {
                    Label("Посмотреть офлайн-демо", systemImage: "eye")
                        .frame(maxWidth: .infinity)
                        .font(.subheadline.weight(.medium))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.purple)
                .padding(.vertical, 10)

                Text("Для входа используется действующий сервер planirovych.ru. Пароль не сохраняется, сессионные данные защищены Keychain.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer(minLength: 20)
            }
            .padding(.horizontal, 25)
            .frame(maxWidth: 540)
            .frame(maxWidth: .infinity)
        }
        .background(
            LinearGradient(
                colors: colorScheme == .dark
                    ? [Color(red: 0.09, green: 0.09, blue: 0.17), Color(red: 0.14, green: 0.12, blue: 0.22)]
                    : [Color(red: 0.95, green: 0.96, blue: 1.0), Color(red: 0.90, green: 0.90, blue: 0.99)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
        )
    }

    private func submit() {
        guard isValid && !isWorking else { return }
        onLogin(login.trimmingCharacters(in: .whitespacesAndNewlines), password)
    }
}
