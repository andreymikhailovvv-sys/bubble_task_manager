import SwiftUI

/// A dedicated first-party assistant conversation attached to one root task.
/// It uses /api/tasks/:id/ai-chat, never the global project/chat selector.
struct NativeTaskAIChatView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: NativeWorkspaceSession
    let task: RemoteTask

    @State private var model = "gpt-6-luna"
    @State private var draft = ""
    @State private var messages: [RemoteChatMessage] = []
    @State private var isLoading = true
    @State private var isSending = false
    @State private var previewText = ""
    @State private var status: String?
    @State private var showRecorder = false
    @State private var voiceBusy = false
    @State private var errorText: String?
    @FocusState private var composerFocused: Bool

    private let accent = Color(red: 0.52, green: 0.41, blue: 0.92)
    private let models: [(key: String, label: String)] = [
        ("gpt-6-luna", "Luna"),
        ("gpt-6.1-terra", "Terra"),
        ("gpt-6.1-sol", "Sol")
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                taskContext
                Divider().opacity(0.7)
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 13) {
                            if isLoading {
                                ProgressView("Загружаю переписку…")
                                    .frame(maxWidth: .infinity)
                                    .padding(30)
                            } else if messages.isEmpty && !isSending {
                                welcome
                            }
                            ForEach(Array(messages.enumerated()), id: \.offset) { index, item in
                                bubble(item)
                                    .id("taskai-\(index)")
                            }
                            if isSending {
                                streamingBubble
                                    .id("taskai-stream")
                            }
                            if let errorText {
                                Label(errorText, systemImage: "exclamationmark.triangle")
                                    .font(.footnote)
                                    .foregroundStyle(.orange)
                                    .padding(10)
                            }
                        }
                        .padding(15)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: messages.count) { _, count in
                        if count > 0 {
                            proxy.scrollTo("taskai-\(count - 1)", anchor: .bottom)
                        }
                    }
                    .onChange(of: isSending) { _, sending in
                        if sending { proxy.scrollTo("taskai-stream", anchor: .bottom) }
                    }
                    .onChange(of: previewText) { _, _ in
                        proxy.scrollTo("taskai-stream", anchor: .bottom)
                    }
                    .onChange(of: status) { _, _ in
                        proxy.scrollTo("taskai-stream", anchor: .bottom)
                    }
                }
                Divider().opacity(0.7)
                composer
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("ИИ по задаче")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        ForEach(models.indices, id: \.self) { index in
                            let item = models[index]
                            Button(item.label) { model = item.key }
                        }
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "brain")
                            Text(models.first(where: { $0.key == model })?.label ?? "Luna")
                                .font(.subheadline.weight(.semibold))
                            Image(systemName: "chevron.down").font(.caption2)
                        }
                    }
                    .disabled(isSending)
                    .accessibilityLabel("Выбрать ИИ-модель для этой задачи")
                }
            }
            .sheet(isPresented: $showRecorder) {
                taskVoicePanel
                    .presentationDetents([.medium, .large])
            }
        }
        .task(id: task.id) { await load() }
    }

    private var taskContext: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 9) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(accent)
                Text("Контекст задачи").font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("GPT-6").font(.caption2).foregroundStyle(.secondary)
            }
            Text(task.title)
                .font(.subheadline.bold())
                .lineLimit(2)
            if let description = task.description, !description.isEmpty {
                Text(description)
                    .font(.caption)
                    .lineLimit(3)
                    .foregroundStyle(.secondary)
            }
            if let deadline = task.dueDate, !deadline.isEmpty {
                Label(NativeTaskDates.label(deadline), systemImage: "calendar")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 17)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(accent.opacity(0.055))
    }

    private var welcome: some View {
        VStack(spacing: 15) {
            Image(systemName: "sparkles.rectangle.stack")
                .font(.system(size: 42, weight: .ultraLight))
                .foregroundStyle(accent)
            Text("Помощник по задаче")
                .font(.title3.bold())
            Text("ИИ видит описание, подзадачи и контекст этой задачи. Можно уточнить план, спросить о сроках или попросить внести изменения.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            ForEach(["Как лучше выполнить эту задачу?",
                     "Разбей задачу на подзадачи",
                     "Найди риски и предложи план"], id: \.self) { suggestion in
                Button(suggestion) {
                    draft = suggestion
                    composerFocused = true
                }
                .font(.footnote)
                .buttonStyle(.bordered)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(26)
        .padding(.top, 45)
    }

    private func markdown(_ text: String) -> Text {
        if let rich = try? AttributedString(markdown: text,
            options: AttributedString.MarkdownParsingOptions(interpretedSyntax: .full)) {
            return Text(rich)
        }
        return Text(text)
    }

    private func bubble(_ message: RemoteChatMessage) -> some View {
        let mine = message.role == "user"
        return HStack {
            if mine { Spacer(minLength: 28) }
            VStack(alignment: .leading, spacing: 9) {
                Text(mine ? "Вы" : "Планировыч")
                    .font(.caption2.bold())
                    .foregroundStyle(mine ? Color.white.opacity(0.85) : accent)
                markdown(mine ? message.content : NativeTaskReferences.clean(message.content))
                    .font(.system(size: 15))
                    .foregroundStyle(mine ? Color.white : Color.primary)
                    .textSelection(.enabled)
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
                if !mine, let chip = message.taskProposal {
                    NativeAIProposalChip(session: session, proposal: chip, economic: false)
                }
                if !mine, let chips = message.economicProposals {
                    ForEach(chips) { item in
                        NativeAIProposalChip(session: session, proposal: item, economic: true)
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
                        await send("Продолжи исходный запрос с разрешённой историей Telegram.",
                                   telegramRead: approval)
                    }
                }
            }
            .padding(13)
            .background(mine ? accent : Color(uiColor: .secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: 18))
            if !mine { Spacer(minLength: 28) }
        }
    }

    private var streamingBubble: some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeAIProgressHeader(status: status, tint: accent)
            if status == "generating_image" || status == "editing_image" {
                Image(systemName: "photo.artframe")
                    .font(.system(size: 40, weight: .ultraLight))
                    .foregroundStyle(accent)
                    .frame(maxWidth: .infinity, minHeight: 105)
                    .background(accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
                    .symbolEffect(.pulse, options: .repeating)
            }
            if !previewText.isEmpty {
                markdown(NativeTaskReferences.clean(previewText))
                    .font(.system(size: 15))
                    .textSelection(.enabled)
            }
        }
        .padding(14)
        .background(Color(uiColor: .secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 18))
        .padding(.trailing, 30)
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 9) {
            Button {
                showRecorder = true
            } label: {
                Image(systemName: "mic.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(accent)
                    .frame(width: 38, height: 44)
            }
            .disabled(isSending || voiceBusy)
            TextField("Спросить об этой задаче", text: $draft, axis: .vertical)
                .lineLimit(1...5)
                .focused($composerFocused)
                .submitLabel(.send)
                .onSubmit { Task { await send(draft) } }
                .padding(.vertical, 9)
                .padding(.horizontal, 12)
                .background(Color(uiColor: .secondarySystemGroupedBackground),
                            in: RoundedRectangle(cornerRadius: 16))
            Button {
                Task { await send(draft) }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 31))
                    .foregroundStyle(accent)
                    .frame(width: 35, height: 44)
            }
            .disabled(isSending || isLoading ||
                      draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 12)
        .background(Color(uiColor: .systemBackground))
    }

    private var taskVoicePanel: some View {
        NativeTaskAIVoiceSheet { audio, duration in
            Task {
                voiceBusy = true
                defer { voiceBusy = false }
                do {
                    let text = try await session.transcribeVoice(data: audio, duration: duration)
                    _ = await send(text)
                } catch {
                    errorText = error.localizedDescription
                }
            }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            messages = try await NativeAPI().loadTaskAiHistory(taskId: task.id)
            errorText = nil
        } catch { errorText = error.localizedDescription }
    }

    @discardableResult
    private func send(_ text: String, telegramRead: [String: Any]? = nil) async -> Bool {
        guard !isSending, !isLoading else { return false }
        let question = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty else { return false }
        let previous = draft
        draft = ""
        composerFocused = false
        errorText = nil
        isSending = true
        status = "analyzing_request"
        previewText = ""
        if telegramRead == nil {
            messages.append(RemoteChatMessage(id: UUID().uuidString,
                                             role: "user", content: question))
        }
        defer {
            isSending = false
            status = nil
            previewText = ""
        }
        do {
            let reply = try await NativeAPI().sendTaskAI(
                taskId: task.id, question: question, model: model,
                telegramRead: telegramRead
            ) { event in
                switch event {
                case .status(let progress): status = progress
                case .delta(let part): previewText += part
                case .reset: previewText = ""
                }
            }
            messages.append(RemoteChatMessage(
                id: UUID().uuidString, role: "assistant", content: reply.answer,
                taskProposal: reply.taskProposal,
                economicProposals: reply.economicProposals,
                generatedDocument: reply.generatedDocument,
                telegramSendDraft: reply.telegramSendDraft,
                telegramReadDraft: reply.telegramReadDraft,
                mailSendDraft: reply.mailSendDraft
            ))
            do { messages = try await NativeAPI().loadTaskAiHistory(taskId: task.id) }
            catch { errorText = "Ответ получен, но история пока не обновилась." }
            await session.refresh()
            return true
        } catch {
            errorText = error.localizedDescription
            if telegramRead == nil && draft.isEmpty { draft = previous.isEmpty ? question : previous }
            return false
        }
    }
}

/// The voice panel reuses iOS audio metering without touching global chat state.
private struct NativeTaskAIVoiceSheet: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var recorder = ChatVoiceRecorder()
    let onSend: (Data, TimeInterval) -> Void
    private let accent = Color(red: 0.52, green: 0.41, blue: 0.92)

    var body: some View {
        NavigationStack {
            VStack(spacing: 19) {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let elapsed = Int(max(0, context.date.timeIntervalSince(recorder.startedAt ?? context.date)))
                    Text(String(format: "%02d:%02d", elapsed / 60, elapsed % 60))
                        .font(.title2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                ZStack {
                    Circle().fill(accent.opacity(0.12 + Double(recorder.level) * 0.25))
                        .frame(width: 115 + recorder.level * 60,
                               height: 115 + recorder.level * 60)
                    Circle().fill(accent).frame(width: 87, height: 87)
                    Image(systemName: "mic.fill")
                        .font(.system(size: 34))
                        .foregroundStyle(.white)
                }
                .frame(height: 190)
                .animation(.easeOut(duration: 0.1), value: recorder.level)
                Text("Что нужно сделать с этой задачей?")
                    .font(.subheadline).foregroundStyle(.secondary)
                if let error = recorder.errorMessage {
                    Text(error).font(.caption).foregroundStyle(.orange)
                }
                HStack {
                    Button("Отмена") { recorder.cancel(); dismiss() }
                        .buttonStyle(.bordered)
                    Button("Отправить") {
                        if let audio = recorder.stop() {
                            onSend(audio.data, audio.duration)
                            dismiss()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(accent)
                    .disabled(!recorder.isRecording)
                }
                Spacer()
            }
            .padding(19)
            .navigationTitle("Голосовой запрос")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await recorder.start() }
        .onDisappear { recorder.cancel() }
    }
}
