import SwiftUI
import AVFoundation

/// The microphone sends audio to the existing authenticated speech-to-text API.
/// The recorded file is kept in temporary storage and deleted after use.
@MainActor
final class ChatVoiceRecorder: NSObject, ObservableObject {
    @Published private(set) var isRecording = false
    @Published private(set) var level: CGFloat = 0
    @Published var errorMessage: String?
    private var recorder: AVAudioRecorder?
    private var meterTask: Task<Void, Never>?
    private var fileURL: URL?
    private(set) var startedAt: Date?

    func start() async {
        errorMessage = nil
        let granted = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            AVAudioSession.sharedInstance().requestRecordPermission { allowed in
                continuation.resume(returning: allowed)
            }
        }
        guard !Task.isCancelled else { return }
        guard granted else {
            errorMessage = "Разреши доступ к микрофону в настройках iPhone."
            return
        }
        do {
            let audio = AVAudioSession.sharedInstance()
            try audio.setCategory(.record, mode: .default)
            try audio.setActive(true)
            let location = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString).appendingPathExtension("m4a")
            let settings: [String: Any] = [
                AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                AVSampleRateKey: 16_000.0,
                AVNumberOfChannelsKey: 1,
                AVEncoderBitRateKey: 32_000
            ]
            let current = try AVAudioRecorder(url: location, settings: settings)
            current.isMeteringEnabled = true
            guard current.record(forDuration: 119) else {
                throw NSError(domain: "PlanirovychAudio", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "Не удалось начать запись."])
            }
            recorder = current
            fileURL = location
            startedAt = Date()
            isRecording = true
            level = 0
            meterTask?.cancel()
            meterTask = Task { [weak self] in
                while !Task.isCancelled {
                    guard let self, self.isRecording, let recorder = self.recorder else { return }
                    recorder.updateMeters()
                    let decibels = recorder.averagePower(forChannel: 0)
                    let normalized = max(0, min(1, (Double(decibels) + 47) / 43))
                    self.level = CGFloat(pow(normalized, 1.4))
                    try? await Task.sleep(nanoseconds: 40_000_000)
                }
            }
        } catch {
            errorMessage = error.localizedDescription
            _ = try? AVAudioSession.sharedInstance().setActive(false)
        }
    }

    func stop() -> (data: Data, duration: TimeInterval)? {
        guard isRecording, let location = fileURL, let startedAt else { return nil }
        let duration = min(119, Date().timeIntervalSince(startedAt))
        meterTask?.cancel()
        meterTask = nil
        level = 0
        recorder?.stop()
        recorder = nil
        isRecording = false
        self.startedAt = nil
        fileURL = nil
        _ = try? AVAudioSession.sharedInstance().setActive(false)
        defer { try? FileManager.default.removeItem(at: location) }
        guard duration > 0.1, let data = try? Data(contentsOf: location), data.count >= 100 else {
            errorMessage = "Запись пуста. Попробуй ещё раз."
            return nil
        }
        guard data.count <= 6 * 1024 * 1024 else {
            errorMessage = "Запись слишком большая. Максимум две минуты."
            return nil
        }
        return (data, duration)
    }

    func cancel() {
        meterTask?.cancel()
        meterTask = nil
        level = 0
        recorder?.stop()
        recorder = nil
        isRecording = false
        startedAt = nil
        if let fileURL { try? FileManager.default.removeItem(at: fileURL) }
        fileURL = nil
        _ = try? AVAudioSession.sharedInstance().setActive(false)
    }
}

struct NativeChatView: View {
    @ObservedObject var session: NativeWorkspaceSession
    @StateObject private var voice = ChatVoiceRecorder()
    @Environment(\.colorScheme) private var colorScheme
    @FocusState private var isComposing: Bool
    @State private var draft = ""
    @State private var sendingVoice = false
    @State private var localVoiceError: String?

    private let accent = Color(red: 0.54, green: 0.49, blue: 0.97)
    private var card: Color {
        colorScheme == .dark ? Color(red: 0.14, green: 0.15, blue: 0.22) : .white
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "sparkles").foregroundStyle(accent).font(.title3)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Общий чат").font(.title3.bold())
                    Text("Планировыч AI").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if session.isLoadingChat { ProgressView().controlSize(.small) }
                Button { Task { await session.loadChat() } } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 17, weight: .medium))
                        .frame(width: 38, height: 38)
                        .background(card, in: Circle())
                }
                .disabled(session.isSendingChat || session.isLoadingChat)
                .accessibilityLabel("Обновить диалог")
            }
            .padding(.horizontal, 20)
            .padding(.top, 13)
            .padding(.bottom, 5)

            projectAndChatPicker

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        if session.chatMessages.isEmpty && !session.isLoadingChat {
                            welcome
                        }
                        ForEach(Array(session.chatMessages.enumerated()), id: \.offset) { index, message in
                            messageBubble(message).id(index)
                        }
                        if session.isSendingChat {
                            aiStreamBubble.id("pending")
                        }
                        if let error = session.chatError ?? localVoiceError ?? voice.errorMessage {
                            Label(error, systemImage: "exclamationmark.triangle")
                                .font(.footnote)
                                .foregroundStyle(.orange)
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.orange.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
                                .id("error")
                        }
                    }
                    .padding(.horizontal, 17)
                    .padding(.vertical, 18)
                    Color.clear.frame(height: 1).id("chat-bottom")
                }
                .defaultScrollAnchor(.bottom)
                .onAppear { proxy.scrollTo("chat-bottom", anchor: .bottom) }
                .onChange(of: session.chatMessages.count) { _ in
                    if !session.chatMessages.isEmpty {
                        withAnimation(.easeOut(duration: 0.24)) {
                            proxy.scrollTo("chat-bottom", anchor: .bottom)
                        }
                    }
                }
                .onChange(of: session.isSendingChat) { _, sending in
                    if sending { withAnimation { proxy.scrollTo("chat-bottom", anchor: .bottom) } }
                }
                .onChange(of: session.chatStreamText) { _, _ in
                    proxy.scrollTo("chat-bottom", anchor: .bottom)
                }
                .onChange(of: session.chatProgressStatus) { _, _ in
                    proxy.scrollTo("chat-bottom", anchor: .bottom)
                }
            }

            if voice.isRecording {
                recordingPanel
            } else {
                composer
            }
        }
        .task { await session.loadChat() }
        .onDisappear { voice.cancel() }
    }

    private var projectAndChatPicker: some View {
        HStack(spacing: 9) {
            Menu {
                ForEach(session.chatProjects) { project in
                    Button {
                        if let first = project.chats.first {
                            Task { await session.selectChat(projectId: project.id, chatId: first.id) }
                        }
                    } label: {
                        Label(project.title, systemImage: project.id == session.selectedProjectID
                              ? "checkmark.folder.fill" : "folder")
                    }
                    .disabled(project.chats.isEmpty || session.isSendingChat)
                }
            } label: {
                HStack(spacing: 6) {
                    Text(session.selectedChatProject?.icon ?? "🗂️")
                    Text(session.selectedChatProject?.title ?? "Проекты")
                        .lineLimit(1)
                    Image(systemName: "chevron.down").font(.caption2)
                }
                .font(.system(size: 12, weight: .medium))
                .padding(.horizontal, 10)
                .padding(.vertical, 10)
                .background(card, in: Capsule())
            }
            .accessibilityLabel("Выбрать проект чата")

            Menu {
                if let project = session.selectedChatProject {
                    ForEach(project.chats) { thread in
                        Button {
                            Task { await session.selectChat(projectId: project.id, chatId: thread.id) }
                        } label: {
                            Label(thread.title, systemImage: thread.id == session.selectedThreadID
                                  ? "checkmark.bubble.left" : "bubble.left")
                        }
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "bubble.left.and.text.bubble.right")
                    Text(session.selectedChatThread?.title ?? "Выбрать чат")
                        .lineLimit(1)
                    Image(systemName: "chevron.down").font(.caption2)
                }
                .font(.system(size: 12, weight: .medium))
                .padding(.horizontal, 10)
                .padding(.vertical, 10)
                .background(card, in: Capsule())
            }
            .accessibilityLabel("Выбрать чат")
            Spacer(minLength: 0)
        }
        .foregroundStyle(.primary)
        .padding(.horizontal, 17)
        .padding(.bottom, 9)
        .disabled(session.isSendingChat || session.isLoadingChat)
    }

    private var welcome: some View {
        VStack(spacing: 15) {
            Image(systemName: "sparkles.rectangle.stack.fill")
                .font(.system(size: 43))
                .foregroundStyle(accent)
                .padding(.bottom, 2)
            Text("Чем помочь?")
                .font(.title2.bold())
            Text("Задачи, планы, вопросы и идеи. Общий диалог синхронизируется с Планировычем.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 22)
        .padding(.vertical, 65)
    }

    private func messageBubble(_ message: RemoteChatMessage) -> some View {
        let mine = message.role == "user"
        return HStack {
            if mine { Spacer(minLength: 36) }
            VStack(alignment: .leading, spacing: 6) {
                Text(mine ? "Вы" : "Планировыч")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(mine ? Color.white.opacity(0.8) : accent)
                markdown(mine ? message.content : NativeTaskReferences.clean(message.content))
                    .font(.system(size: 15))
                    .textSelection(.enabled)
                    .foregroundStyle(mine ? Color.white : Color.primary)
                if !mine {
                    NativeTaskReferenceButtons(session: session, content: message.content)
                }
                if !mine, let doc = message.generatedDocument {
                    if doc.isImage {
                        NativeGeneratedImageCard(document: doc)
                    } else {
                        NativeGeneratedDocumentCard(document: doc)
                    }
                }
                if !mine, let telegram = message.telegramSendDraft {
                    NativeTelegramSendCard(draft: telegram)
                }
                if !mine, let mail = message.mailSendDraft {
                    NativeMailSendCard(draft: mail)
                }
                if !mine, let read = message.telegramReadDraft {
                    NativeTelegramReadCard(draft: read) { approval in
                        await session.continueTelegramRead(approval)
                    }
                }
                if !mine, let id = message.assistantSettingsProposalId {
                    NativeAssistantSettingsCard(id: id)
                }
                if !mine, let reply = message.telegramSuggestedReply { NativeAssistantReplyCard(reply: reply, mail: false) }
                if !mine, let reply = message.mailSuggestedReply { NativeAssistantReplyCard(reply: reply, mail: true) }
                if !mine, let proposal = message.taskProposal {
                    NativeAIProposalChip(session: session, proposal: proposal, economic: false)
                }
                if !mine, let proposals = message.economicProposals {
                    ForEach(proposals) { proposal in
                        NativeAIProposalChip(session: session, proposal: proposal, economic: true)
                    }
                }
            }
            .padding(14)
            .background(mine ? accent : card, in: RoundedRectangle(cornerRadius: 18))
            if !mine { Spacer(minLength: 36) }
        }
    }

    /// Native attributed Markdown removes literal **/### markers and preserves
    /// emphasis, lists, inline links and code formatting from the AI.
    private func markdown(_ value: String) -> Text {
        if let parsed = try? AttributedString(markdown: value,
            options: AttributedString.MarkdownParsingOptions(interpretedSyntax: .full)) {
            return Text(parsed)
        }
        return Text(value)
    }

    private var aiStreamBubble: some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeAIProgressHeader(status: session.chatProgressStatus, tint: accent)
            if session.chatProgressStatus == "generating_image" ||
               session.chatProgressStatus == "editing_image" {
                ZStack {
                    RoundedRectangle(cornerRadius: 20)
                        .fill(LinearGradient(
                            colors: [accent.opacity(0.24), Color.cyan.opacity(0.10),
                                     accent.opacity(0.20)],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        ))
                    Circle().fill(accent.opacity(0.2)).frame(width: 105, height: 105).blur(radius: 10)
                    Image(systemName: "photo.artframe")
                        .font(.system(size: 38, weight: .ultraLight))
                        .foregroundStyle(accent)
                        .symbolEffect(.pulse, options: .repeating)
                }
                .frame(height: 150)
                .accessibilityLabel("ИИ создаёт изображение")
            }
            if !session.chatStreamText.isEmpty {
                markdown(NativeTaskReferences.clean(session.chatStreamText))
                    .font(.system(size: 15))
                    .textSelection(.enabled)
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(card, in: RoundedRectangle(cornerRadius: 18))
        .padding(.trailing, 25)
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            Button {
                isComposing = false
                Task { await voice.start() }
            } label: {
                Image(systemName: "mic.fill")
                    .font(.system(size: 19))
                    .foregroundStyle(accent)
                    .frame(width: 42, height: 43)
            }
            .disabled(session.isSendingChat || sendingVoice || session.selectedChatThread == nil)
            .accessibilityLabel("Записать голосовой запрос")

            TextField("Сообщение Планировычу…", text: $draft, axis: .vertical)
                .lineLimit(1...4)
                .focused($isComposing)
                .font(.system(size: 15))
                .padding(.vertical, 12)

            Button {
                Task { await submitText() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 31))
                    .foregroundStyle(accent)
                    .frame(width: 40, height: 43)
            }
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                      session.isSendingChat || sendingVoice ||
                      session.selectedChatThread == nil)
            .accessibilityLabel("Отправить сообщение")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(card, in: RoundedRectangle(cornerRadius: 20))
        .padding(.horizontal, 14)
        .padding(.bottom, 9)
    }

    private var recordingPanel: some View {
        VStack(spacing: 12) {
            TimelineView(.periodic(from: .now, by: 1)) { timeline in
                let seconds = max(0, min(119, Int(timeline.date.timeIntervalSince(voice.startedAt ?? timeline.date))))
                Text(String(format: "%02d:%02d", seconds / 60, seconds % 60))
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            ZStack {
                Circle()
                    .stroke(accent.opacity(0.12 + Double(voice.level) * 0.25), lineWidth: 2)
                    .frame(width: 100 + voice.level * 55, height: 100 + voice.level * 55)
                Circle()
                    .fill(accent.opacity(0.10 + Double(voice.level) * 0.17))
                    .frame(width: 85 + voice.level * 28, height: 85 + voice.level * 28)
                Circle()
                    .fill(accent)
                    .frame(width: 65, height: 65)
                Image(systemName: "mic.fill")
                    .font(.system(size: 28, weight: .medium))
                    .foregroundStyle(.white)
            }
            .frame(height: 120)
            .animation(.easeOut(duration: 0.11), value: voice.level)
            Text("Говорите, микрофон слушает")
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack(spacing: 35) {
                Button {
                    voice.cancel()
                } label: {
                    Label("Отмена", systemImage: "xmark")
                        .font(.subheadline.weight(.medium))
                }
                Button {
                    Task { await sendVoice() }
                } label: {
                    Label("Отправить", systemImage: "arrow.up.circle.fill")
                        .font(.subheadline.weight(.semibold))
                }
                .disabled(sendingVoice)
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.vertical, 15)
        .padding(.horizontal, 18)
        .frame(maxWidth: .infinity)
        .background(card, in: RoundedRectangle(cornerRadius: 21))
        .padding(.horizontal, 14)
        .padding(.bottom, 8)
    }

    private func submitText() async {
        let value = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        isComposing = false
        draft = ""
        if !(await session.sendChat(value)) {
            draft = value
        }
    }

    private func sendVoice() async {
        guard !sendingVoice, let recording = voice.stop() else { return }
        sendingVoice = true
        localVoiceError = nil
        defer { sendingVoice = false }
        do {
            let text = try await session.transcribeVoice(data: recording.data, duration: recording.duration)
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
            if !(await session.sendChat(text)) {
                draft = text
            }
        } catch {
            localVoiceError = error.localizedDescription
        }
    }
}

private struct NativeAssistantSettingsCard: View {
    let id: String
    @State private var proposal: NativeAssistantSettingsProposal?
    @State private var busy = false
    @State private var error = ""
    private let labels = ["summaryInstructions":"Правила сводок","suggestWhen":"Когда предлагать ответы","suggestHow":"Как предлагать ответы","autoReplyWhen":"Когда отвечать автоматически","autoReplyHow":"Как отвечать автоматически","taskCreationWhen":"Когда создавать задачи","replyMode":"Режим ответов"]
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Настройки ассистента").font(.headline)
            if let proposal {
                Text(proposal.targetLabel).font(.caption)
                ForEach(proposal.changes, id: \.field) { change in
                    Text(labels[change.field] ?? change.field).font(.caption.bold())
                    Text("Было: " + change.before).font(.caption).foregroundStyle(.secondary)
                    Text("Станет: " + change.after).font(.caption)
                }
                Button(proposal.status == "APPLIED" ? "✓ Применено" : proposal.status == "CONFLICT" ? "Настройки уже изменились" : "Подтвердить изменения") {
                    busy = true
                    Task { defer { busy = false }; do { self.proposal = try await NativeAPI().assistantSettingsProposal(id: id, apply: true) } catch { self.error = error.localizedDescription } }
                }.buttonStyle(.bordered).disabled(busy || proposal.status != "PENDING")
            }
            if !error.isEmpty { Text(error).font(.caption).foregroundStyle(.red) }
        }.padding(8).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
        .task(id: id) { do { proposal = try await NativeAPI().assistantSettingsProposal(id: id) } catch { self.error = error.localizedDescription } }
    }
}
private struct NativeAssistantReplyCard: View {
    let reply: NativeAssistantReply
    let mail: Bool
    @State private var text = ""
    @State private var status = ""
    @State private var busy = false
    @State private var error = ""
    private var pending: Bool { status == "PENDING" || (!mail && status == "FAILED") }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(mail ? "Ответ на письмо" : "Ответ в Telegram").font(.headline)
            if let recipient = reply.recipient { Text(recipient).font(.caption) }
            if let subject = reply.subject { Text(subject).font(.caption) }
            if pending { TextField("Ответ", text: $text, axis: .vertical).textFieldStyle(.roundedBorder) } else { Text(text).font(.caption) }
            Button(status == "SENT" ? "✓ Отправлено" : status == "UNKNOWN" ? "Статус неизвестен" : "Принять и отправить") {
                busy = true
                Task { defer { busy = false }; do { status = try await NativeAPI().sendAssistantReply(id: reply.eventId, text: text, mail: mail) } catch { self.error = error.localizedDescription; status = "UNKNOWN" } }
            }.buttonStyle(.bordered).disabled(!pending || busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            if !error.isEmpty { Text(error).font(.caption).foregroundStyle(.red) }
        }.padding(8).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
        .onAppear { text = reply.text; status = reply.status }
        .onChange(of: reply.status) { _, newValue in status = newValue }
    }
}


struct NativeAIWaitingIcon: View {
    let tint: Color
    var body: some View {
        TimelineView(.animation) { context in
            let phase = context.date.timeIntervalSinceReferenceDate
            ZStack {
                Circle().trim(from: 0.08, to: 0.76)
                    .stroke(tint.opacity(0.85), style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                    .rotationEffect(.degrees(phase.truncatingRemainder(dividingBy: 1.2) * 300))
                Image(systemName: "sparkles")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(tint)
                    .scaleEffect(CGFloat(0.9 + 0.1 * sin(phase * 5)))
            }
        }
        .accessibilityHidden(true)
    }
}

struct NativeAIProgressHeader: View {
    let status: String?
    let tint: Color
    var body: some View {
        HStack(spacing: 12) {
            NativeAIWaitingIcon(tint: tint).frame(width: 30, height: 30)
            VStack(alignment: .leading, spacing: 6) {
                Text(Self.label(status))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .id(status ?? "")
                    .transition(.opacity)
                    .animation(.easeInOut(duration: 0.22), value: status)
                TimelineView(.animation) { context in
                    HStack(spacing: 5) {
                        ForEach(0..<3) { index in
                            let wave = (sin(context.date.timeIntervalSinceReferenceDate * 5 - Double(index) * 1.5) + 1) / 2
                            Capsule().fill(tint.opacity(0.25 + 0.75 * wave))
                                .frame(width: 17, height: 4)
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }
    static func label(_ code: String?) -> String {
        guard let code else { return "Анализирую запрос" }
        if code.hasPrefix("reading_file:") || code.hasPrefix("reading_attachment:") {
            let name = String(code.split(separator: ":", maxSplits: 1).last ?? "")
            return "Изучаю документ «\(name.prefix(70))»"
        }
        switch code {
        case "analyzing_request": return "Анализирую запрос"
        case "using_chat_history": return "Учитываю историю диалога"
        case "searching_workspace": return "Ищу в задачах и заметках"
        case "searching_tasks": return "Ищу задачи"
        case "searching_notes": return "Ищу заметки"
        case "searching_subtasks": return "Ищу подзадачи"
        case "listing_tasks": return "Собираю список задач"
        case "reading_task": return "Изучаю задачу"
        case "reading_note": return "Читаю заметку"
        case "reading_subtask": return "Изучаю подзадачу"
        case "checking_sectors": return "Проверяю сектора"
        case "searching_files": return "Ищу файл"
        case "reading_file": return "Изучаю документ"
        case "reading_attachment": return "Изучаю вложение"
        case "searching_web": return "Ищу в интернете"
        case "analyzing_web_results": return "Изучаю найденные источники"
        case "analyzing_retrieved_context": return "Анализирую найденные данные"
        case "forming_answer": return "Формирую ответ"
        case "applying_changes": return "Вношу изменения"
        case "generating_image": return "Создаю изображение"
        case "editing_image": return "Редактирую изображение"
        case "generating_document", "creating_document": return "Создаю документ"
        case "editing_document": return "Редактирую документ"
        default: return "Работаю над запросом"
        }
    }


}

enum NativeTaskReferences {
    private static let pattern = #"\[\[task_ref(?:=([^\]]+)|:([^|\]]+)\|([^\]]+))\]\]"#
    struct Reference: Identifiable {
        let id: String
        let label: String?
    }
    static func parse(_ content: String) -> [Reference] {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        var seen = Set<String>()
        return regex.matches(in: content, range: NSRange(content.startIndex..., in: content)).compactMap { match in
            func capture(_ index: Int) -> String? {
                Range(match.range(at: index), in: content).map { String(content[$0]) }
            }
            guard let id = (capture(1) ?? capture(2))?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !id.isEmpty, seen.insert(id).inserted else { return nil }
            return Reference(id: id, label: capture(3))
        }
    }
    static func clean(_ content: String) -> String {
        content.replacingOccurrences(of: pattern, with: "$3", options: .regularExpression)
            .replacingOccurrences(of: #"\[\[file_ref=[^\]]+\]\]"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct NativeTaskReferenceButtons: View {
    @ObservedObject var session: NativeWorkspaceSession
    let content: String
    @State private var opened: RemoteTask?
    @State private var error: String?
    @State private var loading = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(NativeTaskReferences.parse(content)) { ref in
                let target = session.tasks.first { $0.id == ref.id }
                Button {
                    Task {
                        loading = true
                        defer { loading = false }
                        error = nil
                        if let target { opened = target; return }
                        await session.refresh()
                        opened = session.tasks.first { $0.id == ref.id }
                        if opened == nil { error = "Задача недоступна или удалена." }
                    }
                } label: {
                    Label(target?.title ?? ref.label ?? "Открыть задачу",
                          systemImage: target?.parentTaskId == nil ? "arrow.up.right.square" : "list.bullet.indent")
                        .font(.caption.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .disabled(loading)
            }
            if let error { Text(error).font(.caption2).foregroundStyle(.secondary) }
        }
        .sheet(item: $opened) { task in
            NativeTaskEditorSheet(session: session, task: task)
                .presentationDetents([.large])
        }
    }
}
