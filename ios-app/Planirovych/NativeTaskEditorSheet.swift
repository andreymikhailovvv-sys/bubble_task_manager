import SwiftUI

/// Tapping the task body opens this sheet. Only the separate completion circle
/// in the lists changes task status.
struct NativeTaskEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: NativeWorkspaceSession
    let task: RemoteTask

    @State private var title = ""
    @State private var description = ""
    @State private var subtaskTitle = ""
    @State private var selectedSubtask: RemoteTask?
    @State private var showingSettings = false
    @State private var showingSubtaskInput = false
    @State private var savingSubtask = false
    @FocusState private var subtaskInputFocused: Bool

    private var children: [RemoteTask] {
        session.tasks
            .filter { $0.parentTaskId == task.id && $0.isActualTask }
            .sorted { a, b in
                if a.isComplete != b.isComplete { return !a.isComplete }
                return a.title.localizedStandardCompare(b.title) == .orderedAscending
            }
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
                    if let current = session.tasks.first(where: { $0.id == task.id }) {
                        HStack {
                            Label(NativeTaskDates.label(current.dueDate), systemImage: "calendar")
                            Spacer()
                            Text("Важность \(current.importance ?? 3)/5")
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        Button {
                            showingSettings = true
                        } label: {
                            Label("Другие настройки", systemImage: "slider.horizontal.3")
                                .font(.subheadline)
                        }
                    }
                    if task.isCollaborative == true {
                        Label("Совместная задача", systemImage: "person.2")
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Описание") {
                    TextEditor(text: $description)
                        .frame(minHeight: 145)
                        .accessibilityLabel("Редактировать описание")
                    if description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("Добавь описание или заметки.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                if task.parentTaskId == nil {
                    Section {
                        if showingSubtaskInput {
                            HStack(spacing: 10) {
                                TextField("Название подзадачи", text: $subtaskTitle)
                                    .focused($subtaskInputFocused)
                                    .submitLabel(.done)
                                    .onSubmit { Task { await addSubtask() } }
                                Button {
                                    Task { await addSubtask() }
                                } label: {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.title2)
                                }
                                .disabled(session.isWorking || subtaskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                                .accessibilityLabel("Сохранить подзадачу")
                            }
                        }
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
                                            .font(.system(size: 23))
                                            .foregroundStyle(child.isComplete ? .green : .secondary)
                                    }
                                    .buttonStyle(.plain)
                                    .disabled(session.isWorking)
                                    .accessibilityLabel(child.isComplete ? "Вернуть подзадачу" : "Завершить подзадачу")
                                    Button { selectedSubtask = child } label: {
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
                    } header: {
                        HStack {
                            Text("Подзадачи (\(children.filter { $0.isComplete }.count)/\(children.count))")
                            Spacer()
                            Button {
                                showingSubtaskInput.toggle()
                                if showingSubtaskInput { subtaskInputFocused = true }
                            } label: {
                                Image(systemName: showingSubtaskInput ? "minus.circle" : "plus.circle.fill")
                                    .font(.system(size: 19))
                            }
                            .accessibilityLabel(showingSubtaskInput ? "Скрыть создание подзадачи" : "Добавить подзадачу")
                        }
                    }
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
                ToolbarItem(placement: .primaryAction) {
                    Button { showingSettings = true } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel("Настройки задачи")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(session.isWorking ? "Сохраняем…" : "Сохранить") {
                        Task {
                            let ok = await session.saveTask(id: task.id, title: title, description: description)
                            if ok { dismiss() }
                        }
                    }
                    .disabled(!hasChanges || session.isWorking ||
                              title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .sheet(item: $selectedSubtask) { child in
                NativeTaskEditorSheet(session: session, task: child)
                    .presentationDetents([.large])
            }
            .sheet(isPresented: $showingSettings) {
                NativeTaskSettingsSheet(session: session, task: task)
                    .presentationDetents([.large])
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
            subtaskInputFocused = true
        }
    }
}
