import SwiftUI

struct NativeTelegramSendCard: View {
    let draft: NativeTelegramSendDraft

    @State private var recipientID: String
    @State private var recipientName: String
    @State private var targets: [[String: Any]] = []
    @State private var search = ""
    @State private var job: [String: Any]?
    @State private var isLoading = false
    @State private var isSending = false
    @State private var uncertain = false
    @State private var showConfirm = false
    @State private var showTargets = false
    @State private var errorText: String?

    init(draft: NativeTelegramSendDraft) {
        self.draft = draft
        _recipientID = State(initialValue: draft.recipientId ?? "")
        _recipientName = State(initialValue: draft.recipientName ?? "")
    }

    private var locked: Bool { isLoading || isSending || job != nil || uncertain }
    private var status: String { job?["state"] as? String ?? "" }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Отправка в Telegram", systemImage: "paperplane.fill")
                .font(.subheadline.bold())
                .foregroundStyle(.cyan)

            Text("Получатель").font(.caption).foregroundStyle(.secondary)
            Button {
                showTargets = true
                if targets.isEmpty { Task { await loadTargets() } }
            } label: {
                HStack {
                    Text(recipientName.isEmpty ? "Выберите: \(draft.requestedRecipient ?? "получатель")" : recipientName)
                        .lineLimit(1)
                    Spacer(minLength: 6)
                    Image(systemName: "chevron.down").font(.caption)
                }
                .font(.subheadline)
                .padding(12)
                .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
            }
            .disabled(locked)

            Text(draft.text)
                .font(.subheadline)
                .textSelection(.enabled)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))

            if let errorText {
                Label(errorText, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
            if !status.isEmpty {
                Text(statusLabel).font(.caption).foregroundStyle(.secondary)
            }
            if uncertain {
                Text("Результат отправки неизвестен. Проверьте Telegram перед повтором.")
                    .font(.caption).foregroundStyle(.orange)
            }

            Button {
                showConfirm = true
            } label: {
                Label(job == nil ? "Отправить сообщение" : "Отправка оформлена",
                      systemImage: "paperplane")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(10)
            }
            .buttonStyle(.borderedProminent)
            .tint(.cyan)
            .disabled(locked || recipientID.isEmpty || draft.requestId.isEmpty)
        }
        .padding(13)
        .background(Color(uiColor: .secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 17))
        .task(id: draft.requestId) { await refreshStatus() }
        .sheet(isPresented: $showTargets) {
            NavigationStack {
                List {
                    if isLoading {
                        ProgressView("Загружаю переписки")
                    }
                    TextField("Поиск получателя", text: $search)
                    Button {
                        recipientID = "saved"
                        recipientName = "Избранное"
                        showTargets = false
                    } label: {
                        Label("Избранное", systemImage: "bookmark")
                    }
                    ForEach(filteredTargets.indices, id: \.self) { index in
                        let value = filteredTargets[index]
                        Button {
                            recipientID = value["id"] as? String ?? ""
                            recipientName = value["name"] as? String ?? "Диалог"
                            showTargets = false
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(value["name"] as? String ?? "Диалог").font(.subheadline)
                                Text(value["username"] as? String ??
                                     value["kind"] as? String ?? "")
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .navigationTitle("Куда отправить")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Закрыть") { showTargets = false }
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
        .confirmationDialog("Отправить сообщение в Telegram?",
                            isPresented: $showConfirm, titleVisibility: .visible) {
            Button("Да, отправить") { Task { await send() } }
            Button("Отмена", role: .cancel) {}
        } message: {
            Text("Получатель: \(recipientName). Сообщение отправится из вашего подключённого Telegram.")
        }
    }

    private var filteredTargets: [[String: Any]] {
        let needle = search.trimmingCharacters(in: .whitespacesAndNewlines)
        if needle.isEmpty { return targets }
        return targets.filter {
            (($0["name"] as? String ?? "") + " " + ($0["username"] as? String ?? ""))
                .localizedCaseInsensitiveContains(needle)
        }
    }

    private var statusLabel: String {
        switch status {
        case "SENT": return "Отправлено в Telegram"
        case "QUEUED", "PROCESSING": return "Отправляем сообщение…"
        case "FAILED": return "Отправка не удалась. Проверьте Telegram."
        default: return "Результат отправки неизвестен. Проверьте Telegram."
        }
    }

    private func loadTargets() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            targets = try await NativeAPI().telegramSendTargets()
            errorText = nil
        } catch { errorText = error.localizedDescription }
    }

    private func refreshStatus() async {
        guard !draft.requestId.isEmpty else { return }
        do {
            let result = try await NativeAPI().telegramQuickSendStatus(requestId: draft.requestId)
            job = result
        } catch {
            // The original draft is not yet a send job. A 404 here is expected.
        }
    }

    private func send() async {
        guard !locked, !recipientID.isEmpty else { return }
        isSending = true
        defer { isSending = false }
        do {
            job = try await NativeAPI().telegramQuickSend(requestId: draft.requestId,
                                                          recipientId: recipientID,
                                                          text: draft.text)
            errorText = nil
        } catch {
            // Server might have committed the send before the response failed.
            // Query the same durable requestId instead of issuing a second POST.
            if let result = try? await NativeAPI().telegramQuickSendStatus(requestId: draft.requestId) {
                job = result
            } else {
                uncertain = true
                errorText = error.localizedDescription
            }
        }
    }
}
