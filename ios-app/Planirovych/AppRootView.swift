import SwiftUI

@MainActor
final class NativeWorkspaceSession: ObservableObject {
    @Published private(set) var account: ServerAccount?
    @Published private(set) var tasks: [RemoteTask] = []
    @Published private(set) var spheres: [RemoteSphere] = []
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
        errorMessage = nil
        isWorking = false
    }

    private func loadWorkspace() async throws {
        let (loadedTasks, loadedSpheres) = try await api.loadWorkspace()
        tasks = loadedTasks
        spheres = loadedSpheres
    }

    private func handle(_ error: Error) {
        errorMessage = error.localizedDescription
        if (error as? NativeAPIError)?.isUnauthorized == true {
            // Credentials are no longer valid; never display cached account data.
            account = nil
            tasks = []
            spheres = []
        }
    }
}

struct ContentView: View {
    @StateObject private var session = NativeWorkspaceSession()
    @State private var showOfflineDemo = false

    var body: some View {
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
        .task { await session.bootstrap() }
        .sheet(isPresented: $showOfflineDemo) {
            DemoDashboardView()
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
