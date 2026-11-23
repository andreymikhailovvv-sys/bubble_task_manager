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
    let aiCredits: Int?

    var displayName: String {
        [name, username, email].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first(where: { !$0.isEmpty }) ?? "Пользователь"
    }

    var isRegistered: Bool { isGuest == false }
}

private struct AccountEnvelope: Decodable {
    let user: ServerAccount
}

struct CreditBalance: Decodable {
    let aiCreditsMilli: Int
    let aiCredits: Int
}

struct CreditUsageItem: Decodable, Identifiable {
    let key: String
    let label: String
    let creditsMilli: Int
    let children: [CreditUsageItem]?
    var id: String { key }
}

struct CreditUsageStatistics: Decodable {
    let todayCreditsMilli: Int
    let weekCreditsMilli: Int
    let monthCreditsMilli: Int
    let averageDailyCreditsMilli: Int
    let byModel: [CreditUsageItem]
    let byFeature: [CreditUsageItem]
}

private struct CreditStatisticsEnvelope: Decodable {
    let statistics: CreditUsageStatistics
}


struct RemoteSphere: Decodable, Identifiable {
    let id: String
    let name: String
    let color: String?
    let icon: String?
    let generalPrompt: String?
}

struct NativeRecurrenceSlot: Codable {
    let time: String
    let weekday: Int?
    let monthDay: Int?
}

struct NativeRecurrenceRule: Codable {
    let rrule: String
    let timezone: String
    let until: String?
    let slots: [NativeRecurrenceSlot]?
}

private struct RecurrenceParseEnvelope: Decodable {
    let summary: String
    let schedule: NativeRecurrenceRule
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
    let isRecurring: Bool?
    let recurrenceText: String?
    let recurrenceJson: NativeRecurrenceRule?
    let recurrenceSummary: String?
    let recurrenceUntil: String?

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
    let description: String?
    let details: [String]?
    let entity: String?
    let action: String?
    let autoApplied: Bool?
    let operations: [NativeProposalOperation]?
    let error: String?
    let revision: String?

    private enum CodingKeys: String, CodingKey {
        case id, status, title, description, details, entity, action, autoApplied, operations, error, revision
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        status = try? values.decodeIfPresent(String.self, forKey: .status)
        title = try? values.decodeIfPresent(String.self, forKey: .title)
        description = try? values.decodeIfPresent(String.self, forKey: .description)
        details = try? values.decodeIfPresent([String].self, forKey: .details)
        entity = try? values.decodeIfPresent(String.self, forKey: .entity)
        action = try? values.decodeIfPresent(String.self, forKey: .action)
        autoApplied = try? values.decodeIfPresent(Bool.self, forKey: .autoApplied)
        operations = try? values.decodeIfPresent([NativeProposalOperation].self, forKey: .operations)
        error = try? values.decodeIfPresent(String.self, forKey: .error)
        revision = try? values.decodeIfPresent(String.self, forKey: .revision)
    }
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

struct NativeGeneratedDocument: Codable, Identifiable {
    let id: String
    let fileName: String
    let mimeType: String
    let size: Int?
    var isImage: Bool { mimeType.hasPrefix("image/") }
}

enum NativeChatStreamEvent {
    case delta(String)
    case reset
    case status(String)
}

struct NativeChatReply {
    let answer: String
    let taskProposal: NativeAIProposal?
    let economicProposals: [NativeAIProposal]
    let generatedDocument: NativeGeneratedDocument?
    let raw: [String: Any]
}

struct RemoteChatMessage: Codable {
    let id: String?
    let role: String
    let content: String
    let taskProposal: NativeAIProposal?
    let economicProposals: [NativeAIProposal]?
    let generatedDocument: NativeGeneratedDocument?

    init(id: String?, role: String, content: String,
         taskProposal: NativeAIProposal? = nil,
         economicProposals: [NativeAIProposal]? = nil,
         generatedDocument: NativeGeneratedDocument? = nil) {
        self.id = id
        self.role = role
        self.content = content
        self.taskProposal = taskProposal
        self.economicProposals = economicProposals
        self.generatedDocument = generatedDocument
    }

    private enum CodingKeys: String, CodingKey {
        case id, role, content, taskProposal, economicProposals, generatedDocument
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try? values.decodeIfPresent(String.self, forKey: .id)
        role = (try? values.decode(String.self, forKey: .role)) ?? "assistant"
        content = (try? values.decode(String.self, forKey: .content)) ?? ""
        taskProposal = try? values.decodeIfPresent(NativeAIProposal.self, forKey: .taskProposal)
        economicProposals = try? values.decodeIfPresent([NativeAIProposal].self, forKey: .economicProposals)
        generatedDocument = try? values.decodeIfPresent(NativeGeneratedDocument.self, forKey: .generatedDocument)
    }
}

private struct ChatHistoryEnvelope: Decodable {
    let messages: [RemoteChatMessage]
}

private struct AiChatReply: Decodable {
    let answer: String
    let taskProposal: NativeAIProposal?
    let economicProposals: [NativeAIProposal]?
    let generatedDocument: NativeGeneratedDocument?
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

    private func liveSessionCookies() -> [HTTPCookie] {
        (HTTPCookieStorage.shared.cookies(for: origin) ?? [])
            .filter {
                cookieNames.contains($0.name)
                    && ($0.domain == host || $0.domain == "." + host)
                    && $0.path == "/"
                    && $0.isSecure
                    && ($0.expiresDate ?? .distantPast) > Date()
            }
    }

    #if targetEnvironment(simulator)
    /// Some remote, unsigned Simulator runtimes cannot write to Keychain.
    /// Keep the server-issued session as non-persistent cookies for *this run*
    /// instead of breaking sign-in or storing tokens in UserDefaults.
    /// This is NEVER compiled into the physical-device application.
    func adoptTemporarySimulatorSession() -> Bool {
        let cookies = liveSessionCookies()
        guard cookies.contains(where: { $0.name == "btm_auth" }) else { return false }
        var temporary: [HTTPCookie] = []
        for cookie in cookies {
            guard var properties = cookie.properties else { return false }
            properties.removeValue(forKey: .expires)
            properties.removeValue(forKey: .maximumAge)
            properties[.discard] = "TRUE"
            guard let sessionCookie = HTTPCookie(properties: properties) else { return false }
            temporary.append(sessionCookie)
        }
        let storage = HTTPCookieStorage.shared
        cookies.forEach { storage.deleteCookie($0) }
        temporary.forEach { storage.setCookie($0) }
        return temporary.contains(where: { $0.name == "btm_auth" })
    }
    #endif

    func save() throws {
        let cookies = liveSessionCookies()
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
        let status = SecItemAdd(insertion as CFDictionary, nil)
        guard status == errSecSuccess else {
            // OSStatus only: do not log sensitive cookie contents.
            NSLog("[Planirovych] Keychain save failed (OSStatus=%d)", status)
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
        guard vault.restore() else {
            #if targetEnvironment(simulator)
            // If the previous run could not use Keychain, discard any residual
            // browser cookie storage instead of silently restoring credentials.
            vault.clear()
            #endif
            return nil
        }
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
            #if targetEnvironment(simulator)
            if let vaultError = error as? NativeAPIError {
                if case .secureStorage = vaultError,
                   vault.adoptTemporarySimulatorSession() {
                    // Server login succeeded. The cloud Simulator can use the
                    // session until restart, with no insecure token fallback.
                    return response.user
                }
            }
            #endif
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

    func creditBalance() async throws -> CreditBalance {
        try await request("auth/email/status")
    }

    func creditStatistics() async throws -> CreditUsageStatistics {
        let reply: CreditStatisticsEnvelope = try await request("credits/statistics")
        return reply.statistics
    }

    func loadWorkspace() async throws -> ([RemoteTask], [RemoteSphere]) {
        async let tasks: [RemoteTask] = request("tasks")
        async let spheres: [RemoteSphere] = request("spheres")
        return try await (tasks, spheres)
    }

    func updateProfile(name: String, username: String, email: String,
                       currentPassword: String?) async throws -> ServerAccount {
        var fields: [String: Any] = [
            "name": name, "username": username, "email": email
        ]
        if let currentPassword, !currentPassword.isEmpty {
            fields["currentPassword"] = currentPassword
        }
        let envelope: AccountEnvelope = try await request(
            "user/profile", method: "PATCH", json: fields
        )
        return envelope.user
    }

    func saveSphere(id: String?, name: String, color: String, icon: String, prompt: String) async throws {
        let fields: [String: Any] = [
            "name": name, "color": color, "icon": icon, "generalPrompt": prompt
        ]
        if let id {
            let _: RemoteSphere = try await request("spheres/\(id)", method: "PATCH", json: fields)
        } else {
            let _: RemoteSphere = try await request("spheres", method: "POST", json: fields)
        }
    }

    func deleteSphere(id: String) async throws {
        let _: OperationResult = try await request("spheres/\(id)", method: "DELETE")
    }

    func postponeTaskToToday(_ task: RemoteTask) async throws {
        guard let due = NativeTaskDates.parse(task.dueDate) else { return }
        let calendar = Calendar.current
        let today = Date()
        guard let target = calendar.date(bySettingHour: calendar.component(.hour, from: due),
            minute: calendar.component(.minute, from: due),
            second: calendar.component(.second, from: due), of: today) else { return }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let _: RemoteTask = try await request("tasks/\(task.id)", method: "PATCH",
            json: ["dueDate": iso.string(from: target)])
    }

    func createTask(title: String, sphereId: String?, parentTaskId: String? = nil) async throws -> RemoteTask {
        var payload: [String: Any] = ["title": title, "importance": 1]
        if let sphereId { payload["sphereId"] = sphereId }
        if let parentTaskId { payload["parentTaskId"] = parentTaskId }
        return try await request("tasks", method: "POST", json: payload)
    }

    func createPlannerEntry(title: String, type: String, dueDate: Date?,
                            sphereId: String?) async throws -> RemoteTask {
        guard ["TASK", "REMINDER", "EVENT"].contains(type) else {
            throw NativeAPIError.invalidResponse
        }
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw NativeAPIError.invalidResponse }
        var json: [String: Any] = [
            "title": trimmed, "taskType": type, "importance": 3, "urgency": 3
        ]
        if let dueDate {
            json["dueDate"] = ISO8601DateFormatter().string(from: dueDate)
        }
        if let sphereId { json["sphereId"] = sphereId }
        return try await request("tasks", method: "POST", json: json)
    }

    func updateTask(id: String, title: String, description: String) async throws -> RemoteTask {
        try await request("tasks/\(id)", method: "PATCH", json: [
            "title": title, "description": description
        ])
    }

    func updateTaskSettings(id: String, dueDate: Date?, importance: Int,
                            urgency: Int, sphereId: String?, isSubtask: Bool,
                            isRecurring: Bool, recurrence: NativeRecurrenceRule?,
                            recurrenceSummary: String?) async throws -> RemoteTask {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var fields: [String: Any] = [
            "dueDate": dueDate.map(iso.string(from:)) ?? NSNull(),
            "importance": max(1, min(5, importance)),
            "urgency": max(1, min(5, urgency)),
            "isRecurring": isRecurring,
            "recurrenceText": isRecurring ? (recurrenceSummary ?? "") : NSNull(),
            "recurrenceSummary": isRecurring ? (recurrenceSummary ?? "") : NSNull(),
            "recurrenceUntil": isRecurring ? (recurrence?.until as Any? ?? NSNull()) : NSNull()
        ]
        if isRecurring, let recurrence {
            let encoded = try JSONEncoder().encode(recurrence)
            fields["recurrenceJson"] = try JSONSerialization.jsonObject(with: encoded)
        } else {
            fields["recurrenceJson"] = NSNull()
        }
        if !isSubtask { fields["sphereId"] = sphereId ?? NSNull() }
        return try await request("tasks/\(id)", method: "PATCH", json: fields)
    }

    func parseRecurrence(prompt: String, taskId: String?) async throws -> (NativeRecurrenceRule, String) {
        var payload: [String: Any] = ["text": prompt, "userTimeZone": TimeZone.current.identifier]
        if let taskId { payload["taskId"] = taskId }
        let result: RecurrenceParseEnvelope = try await request(
            "ai/parse-recurrence", method: "POST", json: payload, timeoutInterval: 90
        )
        return (result.schedule, result.summary)
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

    /// Streaming NDJSON is the same transport used by Mini App and Android.
    /// The quick intro, status transitions and answer deltas arrive in order.
    func sendChat(question: String, history: [RemoteChatMessage],
                  project: NativeChatProject, thread: NativeChatThread,
                  onEvent: @escaping @MainActor (NativeChatStreamEvent) -> Void
    ) async throws -> NativeChatReply {
        let payload: [String: Any] = [
            "clientRequestId": UUID().uuidString.lowercased(),
            "question": question,
            "history": history.suffix(25).map { message in
                var item: [String: Any] = ["role": message.role, "content": message.content]
                if let doc = message.generatedDocument { item["generatedDocument"] = ["id": doc.id] }
                return item
            },
            "projectId": project.id, "projectTitle": project.title,
            "chatId": thread.id, "chatTitle": thread.title,
            "userTimeZone": TimeZone.current.identifier
        ]
        guard let url = URL(string: "ai-chat", relativeTo: base),
              url.scheme == "https", url.host == base.host else {
            throw NativeAPIError.invalidResponse
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpShouldHandleCookies = true
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 180
        request.setValue("same-origin", forHTTPHeaderField: "Sec-Fetch-Site")
        request.setValue("application/x-ndjson", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        let (bytes, response) = try await http.bytes(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NativeAPIError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw NativeAPIError.server(code: httpResponse.statusCode,
                                        message: "Сервер не принял запрос (HTTP \(httpResponse.statusCode)).")
        }
        for try await line in bytes.lines {
            try Task.checkCancellation()
            guard let rawData = line.data(using: .utf8),
                  let event = try? JSONSerialization.jsonObject(with: rawData) as? [String: Any],
                  let type = event["type"] as? String else { continue }
            switch type {
            case "delta":
                if let value = event["text"] as? String, !value.isEmpty {
                    onEvent(.delta(value))
                }
            case "reset":
                onEvent(.reset)
            case "status":
                if let value = event["status"] as? String { onEvent(.status(value)) }
            case "error":
                throw NativeAPIError.server(code: 500,
                    message: event["message"] as? String ?? "Ошибка обработки запроса ИИ.")
            case "result":
                guard let data = event["result"] as? [String: Any] else {
                    throw NativeAPIError.invalidResponse
                }
                let resultData = try JSONSerialization.data(withJSONObject: data)
                let parsed = try JSONDecoder().decode(AiChatReply.self, from: resultData)
                return NativeChatReply(answer: parsed.answer,
                                       taskProposal: parsed.taskProposal,
                                       economicProposals: parsed.economicProposals ?? [],
                                       generatedDocument: parsed.generatedDocument, raw: data)
            default: break
            }
        }
        throw NativeAPIError.server(code: 502, message: "Соединение с ИИ прервалось до завершения ответа.")
    }

    func downloadGeneratedDocument(id: String) async throws -> Data {
        guard id.count < 150, id.range(of: #"^[A-Za-z0-9_-]+$"#,
                                       options: .regularExpression) != nil else {
            throw NativeAPIError.invalidResponse
        }
        return try await requestData("ai-documents/\(id)/download", timeoutInterval: 90)
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
        if let image = reply.raw["generatedDocument"], !(image is NSNull) {
            answer["generatedDocument"] = image
        }
        messages.append(answer)
        threads[chatIndex]["messages"] = messages
        projects[projectIndex]["chats"] = threads
        _ = try await requestData("ai-chat/projects", method: "PUT", json: ["projects": projects])
    }

    private struct AutoApplyEnvelope: Decodable {
        let autoApply: Bool
    }

    func proposalDetails(id: String, economic: Bool) async throws -> [String: Any] {
        let root = economic ? "economic/assistant/proposals" : "ai/task-proposals"
        let data = try await requestData("\(root)/\(id)")
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NativeAPIError.invalidResponse
        }
        return json
    }

    func proposalAutoApply(economic: Bool) async throws -> Bool {
        let resource = economic ? "economic/assistant/preferences" : "ai/task-proposals/preferences"
        let response: AutoApplyEnvelope = try await request(resource)
        return response.autoApply
    }

    func updateProposalAutoApply(economic: Bool, value: Bool) async throws -> Bool {
        let resource = economic ? "economic/assistant/preferences" : "ai/task-proposals/preferences"
        let response: AutoApplyEnvelope = try await request(
            resource, method: economic ? "PUT" : "PATCH", json: ["autoApply": value]
        )
        return response.autoApply
    }

    func proposalOptions(economic: Bool) async throws -> [String: Any] {
        let resource = economic ? "economic/assistant/options" : "ai/task-proposals/options"
        let data = try await requestData(resource)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NativeAPIError.invalidResponse
        }
        return json
    }

    func editTaskProposal(id: String, index: Int, revision: String,
                          values: [String: Any]) async throws -> [String: Any] {
        let data = try await requestData("ai/task-proposals/\(id)", method: "PATCH", json: [
            "index": index, "revision": revision, "values": values
        ])
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NativeAPIError.invalidResponse
        }
        return json
    }

    func editEconomicProposal(id: String, payload: [String: Any],
                              expectedPayload: [String: Any]) async throws -> [String: Any] {
        let data = try await requestData("economic/assistant/proposals/\(id)", method: "PUT",
                                         json: ["payload": payload, "expectedPayload": expectedPayload])
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NativeAPIError.invalidResponse
        }
        return json
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
