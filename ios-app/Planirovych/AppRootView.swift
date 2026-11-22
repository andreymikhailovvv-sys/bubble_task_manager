import SwiftUI

@MainActor
final class NativeWorkspaceSession: ObservableObject {
    @Published private(set) var account: ServerAccount?
    @Published private(set) var tasks: [RemoteTask] = []
    @Published private(set) var spheres: [RemoteSphere] = []
    @Published private(set) var habits: [RemoteHabit] = []
    @Published private(set) var chatMessages: [RemoteChatMessage] = []
    @Published private(set) var isSendingChat = false
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
                     intervalDays: Int?) async -> Bool {
        guard account != nil, !isWorking else { return false }
        let cleaned = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            if let id {
                _ = try await api.updateHabit(id: id, name: cleaned, icon: icon, color: color,
                                              targetCount: targetCount, recurrenceType: recurrenceType,
                                              weekdays: weekdays, intervalDays: intervalDays)
            } else {
                _ = try await api.createHabit(name: cleaned, icon: icon, color: color,
                                              targetCount: targetCount, recurrenceType: recurrenceType,
                                              weekdays: weekdays, intervalDays: intervalDays)
            }
            habits = try await api.loadHabits()
            errorMessage = nil
            return true
        } catch {
            handle(error)
            return false
        }
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

    func loadChat() async {
        guard account != nil, !isSendingChat else { return }
        do {
            chatMessages = try await api.loadGeneralChat()
            chatError = nil
        } catch {
            chatError = error.localizedDescription
        }
    }

    func sendChat(_ question: String) async -> Bool {
        guard account != nil, !isSendingChat else { return false }
        let cleaned = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return false }
        isSendingChat = true
        chatError = nil
        defer { isSendingChat = false }
        do {
            let answer = try await api.sendGeneralChat(question: cleaned, history: chatMessages)
            // Update immediately, then prefer the server-owned, synchronized dialogue.
            chatMessages.append(RemoteChatMessage(id: nil, role: "user", content: cleaned))
            chatMessages.append(RemoteChatMessage(id: nil, role: "assistant", content: answer))
            if let history = try? await api.loadGeneralChat() { chatMessages = history }
            await refresh()
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
        }
    }
}

struct ContentView: View {
    @StateObject private var session = NativeWorkspaceSession()
    @State private var showOfflineDemo = false

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
        return ["overview", "tasks", "habits", "economic"].contains(tab) ? tab : nil
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
