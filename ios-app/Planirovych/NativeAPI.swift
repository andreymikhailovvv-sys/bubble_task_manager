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
    let stats: [HabitCompletionStat]

    func amount(on dateKey: String) -> Int {
        stats.first(where: { $0.dateKey == dateKey })?.amount ?? 0
    }
}

struct RemoteChatMessage: Decodable {
    let id: String?
    let role: String
    let content: String
}

private struct ChatHistoryEnvelope: Decodable {
    let messages: [RemoteChatMessage]
}

private struct AiChatReply: Decodable {
    let answer: String
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

    func loadHabits() async throws -> [RemoteHabit] {
        try await request("habits")
    }

    func createHabit(name: String, icon: String, color: String, targetCount: Int,
                     recurrenceType: String, weekdays: [Int], intervalDays: Int?) async throws -> RemoteHabit {
        var json: [String: Any] = [
            "name": name, "icon": icon, "color": color, "targetCount": targetCount,
            "recurrenceType": recurrenceType, "weekdays": weekdays
        ]
        if let intervalDays { json["intervalDays"] = intervalDays }
        return try await request("habits", method: "POST", json: json)
    }

    func updateHabit(id: String, name: String, icon: String, color: String, targetCount: Int,
                     recurrenceType: String, weekdays: [Int], intervalDays: Int?) async throws -> RemoteHabit {
        var json: [String: Any] = [
            "name": name, "icon": icon, "color": color, "targetCount": targetCount,
            "recurrenceType": recurrenceType, "weekdays": weekdays
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

    func loadGeneralChat() async throws -> [RemoteChatMessage] {
        let result: ChatHistoryEnvelope = try await request("ai-general-chat")
        return result.messages
    }

    func sendGeneralChat(question: String, history: [RemoteChatMessage]) async throws -> String {
        let payload: [String: Any] = [
            "clientRequestId": UUID().uuidString.lowercased(),
            "question": question,
            "history": history.suffix(30).map { ["role": $0.role, "content": $0.content] },
            "projectTitle": "Личный проект",
            "chatId": "quick-ai-requests",
            "chatTitle": "Быстрые запросы",
            "userTimeZone": TimeZone.current.identifier
        ]
        let result: AiChatReply = try await request("ai-chat", method: "POST",
                                                   json: payload, timeoutInterval: 180)
        return result.answer
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
        _ relativePath: String,
        method: String = "GET",
        json: [String: Any]? = nil,
        timeoutInterval: TimeInterval = 30
    ) async throws -> T {
        guard let url = URL(string: relativePath, relativeTo: base),
              url.scheme == "https", url.host == base.host else {
            throw NativeAPIError.invalidResponse
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpShouldHandleCookies = true
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = timeoutInterval
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
            throw NativeAPIError.server(
                code: http.statusCode,
                message: serverError ?? "Ошибка сервера (HTTP \(http.statusCode))."
            )
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

private struct APIErrorEnvelope: Decodable {
    let error: String?
}
