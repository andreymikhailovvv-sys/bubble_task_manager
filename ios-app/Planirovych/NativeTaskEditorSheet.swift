import SwiftUI

/// Tap the task body to edit; completion is a separate, explicit control.
struct NativeTaskEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: NativeWorkspaceSession
    let task: RemoteTask

    @State private var title = ""
    @State private var description = ""
    @State private var subtaskTitle = ""
    @State private var selectedSubtask: RemoteTask?
    @State private var savingSubtask = false

    private var children: [RemoteTask] {
        session.tasks.filter { $0.parentTaskId == task.id && $0.isActualTask }
    }
    private var hasChanges: Bool {
        title.trimmingCharacters(in: .whitespacesAndNewlines) != task.title ||
        description != (task.description ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Задача") {
                    TextField("Название", text: $title, axis: .vertical)
                        .lineLimit(1...3)
                    if let due = task.dueDate {
                        Label(String(due.prefix(10)), systemImage: "calendar")
                            .foregroundStyle(.secondary)
                    }
                    if task.isCollaborative == true {
                        Label("Совместная задача", systemImage: "person.2")
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Описание") {
                    TextEditor(text: $description)
                        .frame(minHeight: 145)
                        .accessibilityLabel("Редактировать описание задачи")
                    if description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("Добавь описание, заметки или инструкции.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    if children.isEmpty {
                        Text("Подзадач пока нет")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(children) { child in
                            HStack(spacing: 12) {
                                Button {
                                    Task { await session.toggleTask(child) }
                                } label: {
                                    Image(systemName: child.isComplete ? "checkmark.circle.fill" : "circle")
                                        .font(.system(size: 24))
                                        .foregroundStyle(child.isComplete ? .green : .secondary)
                                }
                                .buttonStyle(.plain)
                                .disabled(session.isWorking)
                                .accessibilityLabel(child.isComplete ? "Вернуть подзадачу" : "Завершить подзадачу")

                                Button {
                                    selectedSubtask = child
                                } label: {
                                    Text(child.title)
                                        .strikethrough(child.isComplete)
                                        .foregroundStyle(.primary)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    HStack {
                        TextField("Новая подзадача", text: $subtaskTitle)
                            .submitLabel(.done)
                            .onSubmit { Task { await addSubtask() } }
                        Button {
                            Task { await addSubtask() }
                        } label: {
                            Image(systemName: "plus.circle.fill")
                                .font(.title2)
                        }
                        .disabled(session.isWorking || subtaskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityLabel("Добавить подзадачу")
                    }
                } header: {
                    Text("Подзадачи (\(children.filter { $0.isComplete }.count)/\(children.count))")
                } footer: {
                    Text("Отметка слева завершает подзадачу. Нажатие на название открывает её.")
                }

                if let error = session.errorMessage {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle(task.parentTaskId == nil ? "Задача" : "Подзадача")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(session.isWorking ? "Сохраняем…" : "Сохранить") {
                        Task {
                            let ok = await session.saveTask(id: task.id, title: title, description: description)
                            if ok { dismiss() }
                        }
                    }
                    .disabled(!hasChanges || session.isWorking || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .sheet(item: $selectedSubtask) { child in
                NativeTaskEditorSheet(session: session, task: child)
            }
            .onAppear {
                title = task.title
                description = task.description ?? ""
            }
        }
    }

    private func addSubtask() async {
        guard !savingSubtask else { return }
        savingSubtask = true
        defer { savingSubtask = false }
        if await session.addSubtask(title: subtaskTitle, parent: task) {
            subtaskTitle = ""
        }
    }
}
