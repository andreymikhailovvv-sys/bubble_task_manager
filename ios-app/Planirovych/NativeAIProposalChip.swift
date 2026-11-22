import SwiftUI

/// Real proposal records from /api/ai-chat, never generated display-only chips.
/// All apply/reject/undo actions go through owner-scoped existing server routes.
struct NativeAIProposalChip: View {
    @ObservedObject var session: NativeWorkspaceSession
    let proposal: NativeAIProposal
    let economic: Bool

    @State private var awaitingConfirmation: String?
    @State private var busy = false
    @State private var lastAction: String?
    @State private var localError: String?

    private let finance = Color(red: 0.85, green: 0.53, blue: 0.14)
    private let tasks = Color(red: 0.47, green: 0.39, blue: 0.91)
    private var tint: Color { economic ? finance : tasks }
    private var status: String {
        switch lastAction {
        case "approve": return "APPLIED"
        case "reject": return "REJECTED"
        case "undo": return "UNDONE"
        default: return proposal.status ?? "PENDING"
        }
    }
    private var title: String {
        if economic {
            let kind: String
            switch proposal.entity {
            case "operation": kind = "операция"
            case "account": kind = "счёт"
            case "category": kind = "категория"
            case "debt": kind = "долг"
            case "loan": kind = "кредит"
            default: kind = "финансовая запись"
            }
            return (proposal.action == "create" ? "Новая " : "Изменение: ") + kind
        }
        return "Изменения задач"
    }
    private var statusText: String {
        switch status {
        case "PENDING": return "Ожидает подтверждения"
        case "APPLYING": return "Применяется"
        case "APPLIED": return proposal.autoApplied == true ? "Применено автоматически" : "Применено"
        case "REJECTED": return "Отклонено"
        case "UNDONE": return "Отменено"
        case "CONFLICT": return "Конфликт изменений"
        case "FAILED": return "Не удалось применить"
        default: return status
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack(spacing: 9) {
                Image(systemName: economic ? "creditcard.fill" : "checklist")
                    .foregroundStyle(tint)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text(statusText)
                        .font(.caption2)
                        .foregroundStyle(status == "APPLIED" ? Color.green : Color.secondary)
                }
                Spacer()
                if status == "APPLIED" {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
            }

            if !economic, let operations = proposal.operations, !operations.isEmpty {
                ForEach(Array(operations.enumerated()), id: \.offset) { _, operation in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(operation.title ?? humanTaskAction(operation.type))
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.primary)
                        if let after = operation.after, !after.isEmpty {
                            Text(after).font(.caption).foregroundStyle(.secondary)
                        } else if let due = operation.dueDate, !due.isEmpty {
                            Text("Срок: \(due.prefix(16))").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(tint.opacity(0.07), in: RoundedRectangle(cornerRadius: 10))
                }
            } else if let rawTitle = proposal.title, !rawTitle.isEmpty {
                Text(rawTitle).font(.subheadline).foregroundStyle(.primary)
            }

            if economic {
                if let description = proposal.description, !description.isEmpty {
                    Text(description)
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let details = proposal.details, !details.isEmpty {
                    ForEach(Array(details.enumerated()), id: \.offset) { _, detail in
                        Text("• " + detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            if let error = proposal.error ?? localError {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            if status == "PENDING" {
                HStack(spacing: 10) {
                    Button {
                        awaitingConfirmation = "approve"
                    } label: {
                        Label("Подтвердить", systemImage: "checkmark.circle")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(tint)
                    Button("Отклонить") {
                        awaitingConfirmation = "reject"
                    }
                    .buttonStyle(.bordered)
                }
                .disabled(busy || session.isSendingChat)
            } else if status == "APPLIED" {
                Button {
                    awaitingConfirmation = "undo"
                } label: {
                    Label("Отменить действие", systemImage: "arrow.uturn.backward")
                        .font(.subheadline)
                }
                .disabled(busy || session.isSendingChat)
            }
        }
        .padding(13)
        .background(Color(uiColor: .secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 17))
        .overlay(RoundedRectangle(cornerRadius: 17).stroke(tint.opacity(0.19)))
        .confirmationDialog("Действие Планировыча",
                            isPresented: Binding(get: { awaitingConfirmation != nil },
                                                 set: { if !$0 { awaitingConfirmation = nil } }),
                            titleVisibility: .visible) {
            if let action = awaitingConfirmation {
                Button(action == "approve" ? "Применить изменения" :
                       action == "reject" ? "Отклонить" : "Отменить изменения",
                       role: action == "reject" || action == "undo" ? .destructive : nil) {
                    awaitingConfirmation = nil
                    Task { await perform(action) }
                }
            }
            Button("Не сейчас", role: .cancel) { awaitingConfirmation = nil }
        } message: {
            Text("Изменения будут выполнены на сервере и синхронизированы со всеми устройствами.")
        }
    }

    private func humanTaskAction(_ type: String?) -> String {
        switch type {
        case "create_task": return "Создать задачу"
        case "update_task": return "Изменить задачу"
        case "create_subtask": return "Создать подзадачу"
        case "create_event": return "Создать событие"
        case "create_reminder": return "Создать напоминание"
        case "create_habit": return "Создать привычку"
        default: return "Действие с задачей"
        }
    }

    private func perform(_ action: String) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        let success = await session.changeProposal(proposal, economic: economic, action: action)
        if success { lastAction = action; localError = nil }
        else { localError = session.chatError ?? "Не удалось выполнить действие." }
    }
}
