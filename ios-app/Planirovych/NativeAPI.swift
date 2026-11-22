import Foundation
import Security

// These structures deliberately describe only the fields used by this first
// native iOS milestone. Unknown fields from the existing API are ignored.
struct ServerAccount: Decodable, Equatable {
    let id: String
    let name: String?
    let username: String?
    let email: String?
    let isGuest: Bool?

    var displayName: String {
        [name, username, email].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first(where: { !$0.isEmpty }) ?? "Пользователь"
    }

    var isRegistered: Bool { isGuest == false }
}

private struct AccountEnvelope: Decodable {
    let user: ServerAccount
}

struct RemoteSphere: Decodable, Identifiable {
    let id: String
    let name: String
    let color: String?
}

struct RemoteTask: Decodable, Identifiable {
    let id: String
    let title: String
    let description: String?
    let sphereId: String?
    let parentTaskId: String?
    let taskType: String?
    let dueDate: String?
    let status: String
    let isCollaborative: Bool?
    let importance: Int?
    let urgency: Int?

    var isComplete: Bool { status == "DONE" }
    var isActualTask: Bool { taskType == nil || taskType == "TASK" }
}

struct HabitCompletionStat: Decodable {
    let dateKey: String
    let amount: Int
}

struct RemoteHabit: Decodable, Identifiable {
    let id: String
    let name: String
    let icon: String
    let color: String
    let targetCount: Int
    let recurrenceType: String
    let intervalDays: Int?
    let weekdays: [Int]
    let reminderTime: String?
    let reminderTimes: [String]?
    let createdAt: String?
    let endDate: String?
    let isArchived: Bool?
    let isAutoCompleted: Bool?
    let stats: [HabitCompletionStat]

    func amount(on dateKey: String) -> Int {
        stats.first(where: { $0.dateKey == dateKey })?.amount ?? 0
    }
}

struct NativeProposalOperation: Codable {
    let type: String?
    let title: String?
    let before: String?
    let after: String?
    let dueDate: String?
    let details: [String]?
}

struct NativeAIProposal: Codable, Identifiable {
    let id: String
    let status: String?
    let title: String?
    let entity: String?
    let action: String?
    let autoApplied: Bool?
    let operations: [NativeProposalOperation]?
    let error: String?
    let revision: String?
}

struct NativeChatThread: Identifiable {
    let id: String
    let title: String
    let model: String?
}

struct NativeChatProject: Identifiable {
    let id: String
    let title: String
    let color: String
    let icon: String
    let chats: [NativeChatThread]
}

struct NativeChatReply {
    let answer: String
    let taskProposal: NativeAIProposal?
    let economicProposals: [NativeAIProposal]
    let raw: [String: Any]
}

struct RemoteChatMessage: Codable {
    let id: String?
    let role: String
    let content: String
    let taskProposal: NativeAIProposal?
    let economicProposals: [NativeAIProposal]?

    init(id: String?, role: String, content: String,
         taskProposal: NativeAIProposal? = nil,
         economicProposals: [NativeAIProposal]? = nil) {
        self.id = id
        self.role = role
        self.content = content
        self.taskProposal = taskProposal
        self.economicProposals = economicProposals
    }
}

private struct ChatHistoryEnvelope: Decodable {
    let messages: [RemoteChatMessage]
}

private struct AiChatReply: Decodable {
    let answer: String
    let taskProposal: NativeAIProposal?
    let economicProposals: [NativeAIProposal]?
}

private struct VoiceTranscription: Decodable {
    let text: String
}

private struct OperationResult: Decodable {
    let ok: Bool
}

enum NativeAPIError: LocalizedError {
    case invalidResponse
    case server(code: Int, message: String)
    case noSessionCookie
    case secureStorage

    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "Сервер вернул неожиданный ответ."
        case let .server(_, message): return message
        case .noSessionCookie: return "Не удалось получить сессию. Проверьте соединение и попробуйте снова."
        case .secureStorage: return "Не удалось безопасно сохранить вход на устройстве."
        }
    }

    var isUnauthorized: Bool {
        if case let .server(code, _) = self { return code == 401 || code == 403 }
        return false
    }
}

private struct StoredSessionCookie: Codable {
    let name: String
    let value: String
    let expiresAt: Date
    let secure: Bool
}

/// Persist ONLY first-party session cookies in this-device-only iOS Keychain.
/// Never store passwords, cookies or tokens in UserDefaults or source control.
final class SessionCookieVault {
    private let service = "ru.planirovych.iosdemo.session"
    private let account = "planirovych-api-cookies"
    private let host = "planirovych.ru"
    private let cookieNames: Set<String> = ["btm_auth", "btm_device"]
    private let origin = URL(string: "https://planirovych.ru/")!

    private var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }

    @discardableResult
    func restore() -> Bool {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let cookies = try? JSONDecoder().decode([StoredSessionCookie].self, from: data)
        else { return false }

        let valid = cookies.filter { $0.expiresAt > Date() && cookieNames.contains($0.name) }
        guard valid.contains(where: { $0.name == "btm_auth" }) else {
            clear()
            return false
        }
        for cookie in valid {
            var properties: [HTTPCookiePropertyKey: Any] = [
                .name: cookie.name,
                .value: cookie.value,
                .domain: host,
                .path: "/",
                .expires: cookie.expiresAt,
                HTTPCookiePropertyKey("HttpOnly"): "TRUE"
            ]
            if cookie.secure { properties[.secure] = "TRUE" }
            if let restored = HTTPCookie(properties: properties) {
                HTTPCookieStorage.shared.setCookie(restored)
            }
        }
        return true
    }

    func save() throws {
        let cookies = (HTTPCookieStorage.shared.cookies(for: origin) ?? [])
            .filter {
                cookieNames.contains($0.name)
                    && ($0.domain == host || $0.domain == "." + host)
                    && $0.path == "/"
                    && $0.isSecure
                    && ($0.expiresDate ?? .distantPast) > Date()
            }
        guard cookies.contains(where: { $0.name == "btm_auth" }) else {
            throw NativeAPIError.noSessionCookie
        }

        let records = cookies.compactMap { cookie -> StoredSessionCookie? in
            guard let expiration = cookie.expiresDate else { return nil }
            return StoredSessionCookie(name: cookie.name, value: cookie.value,
                                       expiresAt: expiration, secure: cookie.isSecure)
        }
        let data = try JSONEncoder().encode(records)
        SecItemDelete(query as CFDictionary)
        var insertion = query
        insertion[kSecValueData as String] = data
        insertion[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(insertion as CFDictionary, nil) == errSecSuccess else {
            throw NativeAPIError.secureStorage
        }
    }

    func clear() {
        for cookie in HTTPCookieStorage.shared.cookies(for: origin) ?? []
        where cookieNames.contains(cookie.name)
            && (cookie.domain == host || cookie.domain == "." + host) {
            HTTPCookieStorage.shared.deleteCookie(cookie)
        }
        SecItemDelete(query as CFDictionary)
    }
}

/// Existing server contract: cookie-based login and shared /api/tasks, /api/spheres.
/// All requests remain first-party HTTPS; no production API changes are necessary.
@MainActor
final class NativeAPI {
    private let vault = SessionCookieVault()
    private let base = URL(string: "https://planirovych.ru/api/")!
    // Explicitly accept first-party Set-Cookie headers from our HTTPS API.
    // URLSession's browser-oriented default cookie policy can reject them.
    private lazy var http: URLSession = {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        return URLSession(configuration: config)
    }()

    func restoreAccount() async throws -> ServerAccount? {
        guard vault.restore() else { return nil }
        do {
            let response: AccountEnvelope = try await request("auth/me")
            guard response.user.isRegistered else {
                vault.clear()
                return nil
            }
            try vault.save()
            return response.user
        } catch {
            if (error as? NativeAPIError)?.isUnauthorized == true {
                vault.clear()
                return nil
            }
            throw error
        }
    }

    func logIn(login: String, password: String) async throws -> ServerAccount {
        vault.clear()
        let response: AccountEnvelope = try await request(
            "auth/login", method: "POST", json: ["login": login, "password": password]
        )
        guard response.user.isRegistered else { throw NativeAPIError.noSessionCookie }
        do {
            try vault.save()
        } catch {
            vault.clear()
            throw error
        }
        return response.user
    }

    func logOut() async {
        // Remote logout may fail offline. Local credentials must still be revoked.
        do {
            let _: OperationResult = try await request("auth/logout", method: "POST")
        } catch { /* local logout is authoritative for this device */ }
        vault.clear()
    }

    func loadWorkspace() async throws -> ([RemoteTask], [RemoteSphere]) {
        async let tasks: [RemoteTask] = request("tasks")
        async let spheres: [RemoteSphere] = request("spheres")
        return try await (tasks, spheres)
    }

    func createTask(title: String, sphereId: String?, parentTaskId: String? = nil) async throws -> RemoteTask {
        var payload: [String: Any] = ["title": title, "importance": 1]
        if let sphereId { payload["sphereId"] = sphereId }
        if let parentTaskId { payload["parentTaskId"] = parentTaskId }
        return try await request("tasks", method: "POST", json: payload)
    }

    func updateTask(id: String, title: String, description: String) async throws -> RemoteTask {
        try await request("tasks/\(id)", method: "PATCH", json: [
            "title": title, "description": description
        ])
    }

    func updateTaskSettings(id: String, dueDate: Date?, importance: Int,
                            urgency: Int, sphereId: String?, isSubtask: Bool) async throws -> RemoteTask {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var fields: [String: Any] = [
            "dueDate": dueDate.map(iso.string(from:)) ?? NSNull(),
            "importance": max(1, min(5, importance)),
            "urgency": max(1, min(5, urgency))
        ]
        if !isSubtask { fields["sphereId"] = sphereId ?? NSNull() }
        return try await request("tasks/\(id)", method: "PATCH", json: fields)
    }

    func loadHabits() async throws -> [RemoteHabit] {
        try await request("habits")
    }

    func createHabit(name: String, icon: String, color: String, targetCount: Int,
                     recurrenceType: String, weekdays: [Int], intervalDays: Int?,
                     reminderTimes: [String]) async throws -> RemoteHabit {
        var json: [String: Any] = [
            "name": name, "icon": icon, "color": color, "targetCount": targetCount,
            "recurrenceType": recurrenceType, "weekdays": weekdays,
            "reminderTimes": reminderTimes
        ]
        if let intervalDays { json["intervalDays"] = intervalDays }
        return try await request("habits", method: "POST", json: json)
    }

    func updateHabit(id: String, name: String, icon: String, color: String, targetCount: Int,
                     recurrenceType: String, weekdays: [Int], intervalDays: Int?,
                     reminderTimes: [String]) async throws -> RemoteHabit {
        var json: [String: Any] = [
            "name": name, "icon": icon, "color": color, "targetCount": targetCount,
            "recurrenceType": recurrenceType, "weekdays": weekdays,
            "reminderTimes": reminderTimes
        ]
        if let intervalDays { json["intervalDays"] = intervalDays }
        return try await request("habits/\(id)", method: "PATCH", json: json)
    }

    func setHabitProgress(_ habit: RemoteHabit, dateKey: String, completed: Bool) async throws -> RemoteHabit {
        let current = habit.amount(on: dateKey)
        let endpoint = completed ? "complete" : "uncomplete"
        let amount = completed ? max(1, habit.targetCount - current) : max(1, current)
        return try await request("habits/\(habit.id)/\(endpoint)",
                                 method: "POST", json: ["dateKey": dateKey, "amount": amount])
    }

    func loadHabitHistory(id: String) async throws -> [HabitCompletionStat] {
        try await request("habits/\(id)/history")
    }

    func changeHabitAmount(_ habit: RemoteHabit, dateKey: String,
                           increment: Bool, amount: Int) async throws -> RemoteHabit {
        try await request("habits/\(habit.id)/\(increment ? "complete" : "uncomplete")",
                          method: "POST", json: ["dateKey": dateKey, "amount": max(1, amount)])
    }

    func loadChatProjects() async throws -> [NativeChatProject] {
        let data = try await requestData("ai-chat/projects")
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let raw = json["projects"] as? [[String: Any]] else { throw NativeAPIError.invalidResponse }
        return raw.compactMap { project in
            guard let id = project["id"] as? String else { return nil }
            let conversations = (project["chats"] as? [[String: Any]] ?? []).compactMap { chat -> NativeChatThread? in
                guard let chatId = chat["id"] as? String else { return nil }
                return NativeChatThread(id: chatId, title: chat["title"] as? String ?? "Чат",
                                        model: chat["model"] as? String)
            }
            return NativeChatProject(id: id, title: project["title"] as? String ?? "Проект",
                                     color: project["color"] as? String ?? "#8b5cf6",
                                     icon: project["icon"] as? String ?? "✨", chats: conversations)
        }
    }

    func loadChat(projectId: String, chatId: String) async throws -> [RemoteChatMessage] {
        if chatId == "quick-ai-requests" {
            let result: ChatHistoryEnvelope = try await request("ai-general-chat")
            return result.messages
        }
        guard let pid = projectId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let cid = chatId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
            throw NativeAPIError.invalidResponse
        }
        let result: ChatHistoryEnvelope = try await request("ai-chat/projects/\(pid)/chats/\(cid)/messages")
        return result.messages
    }

    func sendChat(question: String, history: [RemoteChatMessage],
                  project: NativeChatProject, thread: NativeChatThread) async throws -> NativeChatReply {
        let payload: [String: Any] = [
            "clientRequestId": UUID().uuidString.lowercased(),
            "question": question,
            "history": history.suffix(25).map { ["role": $0.role, "content": $0.content] },
            "projectId": project.id, "projectTitle": project.title,
            "chatId": thread.id, "chatTitle": thread.title,
            "userTimeZone": TimeZone.current.identifier
        ]
        let data = try await requestData("ai-chat", method: "POST", json: payload,
                                         timeoutInterval: 180)
        let result = try JSONDecoder().decode(AiChatReply.self, from: data)
        let raw = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        return NativeChatReply(answer: result.answer, taskProposal: result.taskProposal,
                               economicProposals: result.economicProposals ?? [], raw: raw)
    }

    /// Preserve other clients' unknown project/message metadata when saving.
    /// The server merges the submitted snapshot under a row lock.
    func persistChatReply(projectId: String, chatId: String,
                          question: String, reply: NativeChatReply) async throws {
        guard chatId != "quick-ai-requests" else { return } // Server owns quick-chat history.
        let data = try await requestData("ai-chat/projects")
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              var projects = json["projects"] as? [[String: Any]],
              let projectIndex = projects.firstIndex(where: { ($0["id"] as? String) == projectId }),
              var threads = projects[projectIndex]["chats"] as? [[String: Any]],
              let chatIndex = threads.firstIndex(where: { ($0["id"] as? String) == chatId }) else {
            throw NativeAPIError.invalidResponse
        }
        var messages = threads[chatIndex]["messages"] as? [[String: Any]] ?? []
        let timestamp = ISO8601DateFormatter().string(from: Date())
        messages.append(["id": UUID().uuidString, "role": "user", "content": question, "createdAt": timestamp])
        var answer: [String: Any] = [
            "id": UUID().uuidString, "role": "assistant",
            "content": reply.answer, "createdAt": timestamp
        ]
        if let proposal = reply.raw["taskProposal"], !(proposal is NSNull) {
            answer["taskProposal"] = proposal
        }
        if let proposals = reply.raw["economicProposals"], !(proposals is NSNull) {
            answer["economicProposals"] = proposals
        }
        messages.append(answer)
        threads[chatIndex]["messages"] = messages
        projects[projectIndex]["chats"] = threads
        _ = try await requestData("ai-chat/projects", method: "PUT", json: ["projects": projects])
    }

    func proposalAction(_ proposal: NativeAIProposal, economic: Bool,
                        action: String) async throws -> NativeAIProposal {
        guard ["approve", "reject", "undo"].contains(action) else { throw NativeAPIError.invalidResponse }
        let root = economic ? "economic/assistant/proposals" : "ai/task-proposals"
        return try await request("\(root)/\(proposal.id)/\(action)", method: "POST", json: [:])
    }

    func transcribeVoice(data: Data, duration: TimeInterval) async throws -> String {
        let result: VoiceTranscription = try await request("ai/audio/transcribe", method: "POST", json: [
            "audioBase64": data.base64EncodedString(),
            "mimeType": "audio/mp4",
            "durationSeconds": max(0.1, min(duration, 120))
        ], timeoutInterval: 90)
        return result.text
    }

    func setTaskCompleted(_ task: RemoteTask, completed: Bool) async throws -> RemoteTask {
        return try await request(
            "tasks/\(task.id)", method: "PATCH",
            json: ["status": completed ? "DONE" : "TODO", "collaborationScope": "me"]
        )
    }

    private func request<T: Decodable>(
        _ relativePath: String, method: String = "GET",
        json: [String: Any]? = nil, timeoutInterval: TimeInterval = 30
    ) async throws -> T {
        let data = try await requestData(relativePath, method: method,
                                         json: json, timeoutInterval: timeoutInterval)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func requestData(
        _ relativePath: String, method: String = "GET",
        json: [String: Any]? = nil, timeoutInterval: TimeInterval = 30
    ) async throws -> Data {
        guard let url = URL(string: relativePath, relativeTo: base),
              url.scheme == "https", url.host == base.host else {
            throw NativeAPIError.invalidResponse
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpShouldHandleCookies = true
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = timeoutInterval
        // Match Android's first-party native client marker. Without this header,
        // the existing CSRF guard rejects speech and proposal approvals.
        request.setValue("same-origin", forHTTPHeaderField: "Sec-Fetch-Site")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        if let json {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        let (data, response) = try await http.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw NativeAPIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let serverError = (try? JSONDecoder().decode(APIErrorEnvelope.self, from: data))?.error
            throw NativeAPIError.server(code: http.statusCode,
                                        message: serverError ?? "Ошибка сервера (HTTP \(http.statusCode)).")
        }
        return data
    }
}

private struct APIErrorEnvelope: Decodable {
    let error: String?
}
