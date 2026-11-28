import SwiftUI
import AppIntents

enum PlanikShortcutMode: String {
    case voice, live
}

struct PlanikShortcutRequest: Identifiable {
    let id = UUID()
    let mode: PlanikShortcutMode
    let createdAt = Date()
}

/// The intents belong to the main app target, with foreground execution.
/// A pending request survives view construction and session restoration.
@MainActor
final class PlanikShortcutRouter: ObservableObject {
    static let shared = PlanikShortcutRouter()
    @Published private(set) var pending: PlanikShortcutRequest?

    func enqueue(_ mode: PlanikShortcutMode) {
        pending = PlanikShortcutRequest(mode: mode)
    }

    func consume(_ id: UUID) {
        if pending?.id == id { pending = nil }
    }
}

struct PlanikVoiceInputIntent: AppIntent {
    static var title: LocalizedStringResource = "Голосовой ввод Планика"
    static var description = IntentDescription("Открыть Планика и сразу начать запись голосового запроса.")
    static var openAppWhenRun = true
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

    @MainActor
    func perform() async throws -> some IntentResult {
        PlanikShortcutRouter.shared.enqueue(.voice)
        return .result()
    }
}

struct PlanikLiveConversationIntent: AppIntent {
    static var title: LocalizedStringResource = "Живое общение с Плаником"
    static var description = IntentDescription("Начать разговор с голосовым ассистентом Планировыча.")
    static var openAppWhenRun = true
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

    @MainActor
    func perform() async throws -> some IntentResult {
        PlanikShortcutRouter.shared.enqueue(.live)
        return .result()
    }
}

struct PlanikAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: PlanikVoiceInputIntent(),
                    phrases: ["Голосовой ввод в \(.applicationName)", "Спросить \(.applicationName)"],
                    shortTitle: "Голосовой ввод",
                    systemImageName: "mic.fill")
        AppShortcut(intent: PlanikLiveConversationIntent(),
                    phrases: ["Живое общение в \(.applicationName)", "Поговорить с \(.applicationName)"],
                    shortTitle: "Живое общение",
                    systemImageName: "waveform")
    }
}
