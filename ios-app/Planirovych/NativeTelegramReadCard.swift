import SwiftUI

/// One-time consent for reading the selected Telegram dialog. The model cannot
/// read a conversation until the user chooses the dialog and count explicitly.
struct NativeTelegramReadCard: View {
    let draft: NativeTelegramReadDraft
    let onApprove: ([String: Any]) async -> Bool

    @State private var selectedChatID: String
    @State private var selectedName: String
    @State private var count = 20
    @State private var dialogs: [[String: Any]] = []
    @State private var loading = false
    @State private var busy = false
    @State private var approved = false
    @State private var showPicker = false
    @State private var showConfirm = false
    @State private var search = ""
    @State private var errorText: String?

    init(draft: NativeTelegramReadDraft,
         onApprove: @escaping ([String: Any]) async -> Bool) {
        self.draft = draft
        self.onApprove = onApprove
        _selectedChatID = State(initialValue: draft.chatId ?? "")
        _selectedName = State(initialValue: draft.chatName ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Доступ к переписке Telegram", systemImage: "text.bubble.fill")
                .font(.subheadline.bold())
                .foregroundStyle(.cyan)
            Text("ИИ запрашивает доступ к конкретному диалогу. Без вашего подтверждения сообщения не будут прочитаны.")
                .font(.caption)
                .foregroundStyle(.secondary)

            Button {
                showPicker = true
                if dialogs.isEmpty { Task { await load() } }
            } label: {
                HStack {
                    Text(selectedName.isEmpty ? "Выбрать: " + draft.requestedChat : selectedName)
                        .lineLimit(1)
                    Spacer()
                    Image(systemName: "chevron.down").font(.caption)
                }
                .font(.subheadline)
                .padding(11)
                .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
            }
            .disabled(approved || busy)

            Picker("Количество сообщений", selection: $count) {
                ForEach([10,20,30,50,100], id: \.self) { n in
                    Text("\(n) сообщений").tag(n)
                }
            }
            .disabled(approved || busy)

            if approved {
                Label("Доступ подтверждён", systemImage: "checkmark.shield.fill")
                    .font(.caption).foregroundStyle(.green)
            }
            if let errorText {
                Label(errorText, systemImage: "exclamationmark.triangle")
                    .font(.caption).foregroundStyle(.orange)
            }

            Button {
                showConfirm = true
            } label: {
                Label(approved ? "Продолжение запущено" : "Разрешить чтение и продолжить",
                      systemImage: "checkmark.shield")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity).padding(10)
            }
            .buttonStyle(.borderedProminent)
            .tint(.cyan)
            .disabled(approved || busy || selectedChatID.isEmpty)
        }
        .padding(13)
        .background(Color(uiColor: .secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 17))
        .sheet(isPresented: $showPicker) {
            NavigationStack {
                List {
                    if loading { ProgressView() }
                    TextField("Поиск чата", text: $search)
                    ForEach(filtered.indices, id: \.self) { i in
                        let dialog = filtered[i]
                        Button {
                            selectedChatID = dialog["id"] as? String ?? ""
                            selectedName = dialog["name"] as? String ?? "Диалог"
                            showPicker = false
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(dialog["name"] as? String ?? "Диалог")
                                Text(dialog["kind"] as? String ?? "Чат")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .navigationTitle("Telegram-чаты")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Закрыть") { showPicker = false }
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
        .confirmationDialog("Разрешить ИИ прочитать Telegram?",
                            isPresented: $showConfirm, titleVisibility: .visible) {
            Button("Разрешить \(count) сообщений") {
                Task { await continueChat() }
            }
            Button("Отмена", role: .cancel) {}
        } message: {
            Text("ИИ прочитает не более \(count) последних сообщений из «\(selectedName)» только для этого запроса.")
        }
    }

    private var filtered: [[String: Any]] {
        let needle = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return needle.isEmpty ? dialogs : dialogs.filter {
            ($0["name"] as? String ?? "").localizedCaseInsensitiveContains(needle)
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            dialogs = try await NativeAPI().telegramSendTargets()
            errorText = nil
        } catch { errorText = error.localizedDescription }
    }

    private func continueChat() async {
        guard !busy, !selectedChatID.isEmpty else { return }
        busy = true
        defer { busy = false }
        let approvedPayload: [String: Any] = [
            "requestId": draft.requestId,
            "chatId": selectedChatID,
            "count": count
        ]
        let okay = await onApprove(approvedPayload)
        if okay {
            approved = true
            errorText = nil
        } else {
            errorText = "Не удалось продолжить запрос. Обновите чат, прежде чем повторять."
        }
    }
}
