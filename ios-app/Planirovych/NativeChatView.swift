import SwiftUI
import AVFoundation

/// The microphone sends audio to the existing authenticated speech-to-text API.
/// The recorded file is kept in temporary storage and deleted after use.
@MainActor
private final class ChatVoiceRecorder: NSObject, ObservableObject {
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
                    try? await Task.sleep(nanoseconds: 80_000_000)
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
                            HStack(spacing: 9) {
                                ProgressView()
                                Text("Планировыч отвечает…")
                                    .font(.subheadline).foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 8)
                            .id("pending")
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
                }
                .defaultScrollAnchor(.bottom)
                .onChange(of: session.chatMessages.count) { _ in
                    if !session.chatMessages.isEmpty {
                        withAnimation(.easeOut(duration: 0.24)) {
                            proxy.scrollTo(session.chatMessages.count - 1, anchor: .bottom)
                        }
                    }
                }
                .onChange(of: session.isSendingChat) { isSending in
                    if isSending {
                        withAnimation { proxy.scrollTo("pending", anchor: .bottom) }
                    }
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
                Text(message.content)
                    .font(.system(size: 15))
                    .textSelection(.enabled)
                    .foregroundStyle(mine ? Color.white : Color.primary)
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
