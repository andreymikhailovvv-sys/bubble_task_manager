import SwiftUI

struct NativeMailSendCard: View {
    let draft: NativeMailSendDraft

    @State private var mailboxID: String
    @State private var sender: String
    @State private var recipient: String
    @State private var subject: String
    @State private var bodyText: String
    @State private var accounts: [[String: Any]] = []
    @State private var recent: [String] = []
    @State private var status = "UNKNOWN"
    @State private var isLoading = true
    @State private var isSending = false
    @State private var isRewriting = false
    @State private var showConfirm = false
    @State private var showRewrite = false
    @State private var instruction = ""
    @State private var errorText: String?

    init(draft: NativeMailSendDraft) {
        self.draft = draft
        _mailboxID = State(initialValue: draft.mailboxId ?? "")
        _sender = State(initialValue: draft.sender ?? "")
        _recipient = State(initialValue: draft.recipient ?? "")
        _subject = State(initialValue: draft.subject ?? "")
        _bodyText = State(initialValue: draft.text)
    }

    private var editable: Bool {
        !isLoading && !isSending && !isRewriting &&
        (status == "PENDING" || status == "FAILED")
    }
    private var statusTitle: String {
        switch status {
        case "PENDING": return "Черновик"
        case "FAILED": return "Ошибка отправки"
        case "SENT": return "Письмо отправлено"
        default: return "Неизвестный статус: повтор заблокирован"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack {
                Label("Новое письмо", systemImage: "envelope.fill")
                    .font(.subheadline.bold())
                    .foregroundStyle(.blue)
                Spacer()
                Text(statusTitle).font(.caption2).foregroundStyle(.secondary)
            }

            Text("От кого").font(.caption).foregroundStyle(.secondary)
            Picker("Почтовый ящик", selection: $mailboxID) {
                Text("Выберите почту").tag("")
                ForEach(accounts.indices, id: \.self) { index in
                    let account = accounts[index]
                    Text(account["email"] as? String ?? "Почта")
                        .tag(account["id"] as? String ?? "")
                }
            }
            .disabled(!editable)
            .onChange(of: mailboxID) { _, value in
                sender = accounts.first(where: { $0["id"] as? String == value })?["email"] as? String ?? sender
            }

            Text("Кому").font(.caption).foregroundStyle(.secondary)
            TextField("Электронная почта получателя", text: $recipient)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textFieldStyle(.roundedBorder)
                .disabled(!editable)
            if !recent.isEmpty && editable {
                Menu {
                    ForEach(recent.prefix(30), id: \.self) { email in
                        Button(email) { recipient = email }
                    }
                } label: {
                    Label("Недавние адресаты", systemImage: "chevron.down")
                        .font(.caption)
                }
            }

            Text("Тема").font(.caption).foregroundStyle(.secondary)
            TextField("Тема", text: $subject)
                .textFieldStyle(.roundedBorder)
                .disabled(!editable)

            Text("Текст письма").font(.caption).foregroundStyle(.secondary)
            TextEditor(text: $bodyText)
                .frame(minHeight: 110, maxHeight: 210)
                .scrollContentBackground(.hidden)
                .padding(8)
                .background(Color.secondary.opacity(0.08),
                            in: RoundedRectangle(cornerRadius: 12))
                .disabled(!editable)

            if editable {
                Button {
                    showRewrite.toggle()
                } label: {
                    Label("Изменить текст с ИИ", systemImage: "sparkles")
                        .font(.caption.weight(.semibold))
                }
                if showRewrite {
                    TextField("Например: сделай короче и официальнее",
                              text: $instruction, axis: .vertical)
                        .lineLimit(2...3)
                    Button {
                        Task { await rewrite() }
                    } label: {
                        Text(isRewriting ? "Редактируем…" : "Применить")
                            .font(.caption.bold())
                    }
                    .disabled(instruction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                              isRewriting)
                }
            }

            if let errorText {
                Label(errorText, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
            if status == "UNKNOWN" {
                Text("Без подтверждённого статуса черновика отправка заблокирована, чтобы не дублировать письмо.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Button {
                showConfirm = true
            } label: {
                Label(status == "SENT" ? "Отправлено" : "Отправить письмо",
                      systemImage: "paperplane.fill")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity).padding(10)
            }
            .buttonStyle(.borderedProminent)
            .tint(.blue)
            .disabled(!editable || mailboxID.isEmpty ||
                      !recipient.contains("@") ||
                      bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(13)
        .background(Color(uiColor: .secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 17))
        .task(id: draft.id) { await load() }
        .confirmationDialog("Отправить письмо?", isPresented: $showConfirm,
                            titleVisibility: .visible) {
            Button("Да, отправить") { Task { await send() } }
            Button("Отмена", role: .cancel) {}
        } message: {
            Text("Письмо будет отправлено на \(recipient) через подключённый почтовый ящик \(sender).")
        }
    }

    private func load() async {
        guard !draft.id.isEmpty else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let api = NativeAPI()
            async let remote = api.mailDraftStatus(id: draft.id)
            async let saved = api.mailAccounts()
            async let people = api.mailRecentRecipients()
            let latest = try await remote
            status = latest["status"] as? String ?? "UNKNOWN"
            if status != "PENDING" {
                mailboxID = latest["mailboxId"] as? String ?? mailboxID
                recipient = latest["recipient"] as? String ?? recipient
                subject = latest["subject"] as? String ?? subject
                bodyText = latest["text"] as? String ?? bodyText
            }
            accounts = (try? await saved) ?? []
            recent = (try? await people) ?? []
            if mailboxID.isEmpty, let first = accounts.first {
                mailboxID = first["id"] as? String ?? ""
            }
            sender = accounts.first(where: { $0["id"] as? String == mailboxID })?["email"] as? String ?? sender
            errorText = nil
        } catch {
            status = "UNKNOWN"
            errorText = error.localizedDescription
        }
    }

    private func rewrite() async {
        guard editable else { return }
        isRewriting = true
        defer { isRewriting = false }
        do {
            bodyText = try await NativeAPI().mailRewrite(text: bodyText, instruction: instruction)
            showRewrite = false
            errorText = nil
        } catch { errorText = error.localizedDescription }
    }

    private func send() async {
        guard editable, !draft.id.isEmpty else { return }
        isSending = true
        defer { isSending = false }
        do {
            let result = try await NativeAPI().mailSend(
                id: draft.id, mailboxId: mailboxID, recipient: recipient.trimmingCharacters(in: .whitespaces),
                subject: subject, text: bodyText
            )
            status = result["status"] as? String ?? "UNKNOWN"
            if result["ok"] as? Bool == true {
                errorText = nil
            } else {
                errorText = result["message"] as? String ?? "Нет подтверждения отправки."
            }
        } catch {
            // The draft may have been sent before the HTTP error. Reload the
            // durable state instead of sending the POST a second time.
            do {
                let latest = try await NativeAPI().mailDraftStatus(id: draft.id)
                status = latest["status"] as? String ?? "UNKNOWN"
            } catch { status = "UNKNOWN" }
            errorText = error.localizedDescription
        }
    }
}
