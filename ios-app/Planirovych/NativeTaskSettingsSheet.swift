import SwiftUI

enum NativeTaskDates {
    static func parse(_ value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: value) { return date }
        iso.formatOptions = [.withInternetDateTime]
        if let date = iso.date(from: value) { return date }
        return nil
    }

    static func day(_ date: Date) -> Date {
        Calendar.current.startOfDay(for: date)
    }

    static func label(_ raw: String?) -> String {
        guard let date = parse(raw) else { return "Без срока" }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}

/// One settings screen for a task or subtask. Subtasks inherit their sector.
struct NativeTaskSettingsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: NativeWorkspaceSession
    let task: RemoteTask

    @State private var deadlineEnabled: Bool
    @State private var deadline: Date
    @State private var importance: Int
    @State private var urgency: Int
    @State private var sphereID: String

    init(session: NativeWorkspaceSession, task: RemoteTask) {
        self.session = session
        self.task = task
        let parsed = NativeTaskDates.parse(task.dueDate)
        _deadlineEnabled = State(initialValue: parsed != nil)
        _deadline = State(initialValue: parsed ?? Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date())
        _importance = State(initialValue: max(1, min(5, task.importance ?? 3)))
        _urgency = State(initialValue: max(1, min(5, task.urgency ?? 3)))
        _sphereID = State(initialValue: task.sphereId ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Дедлайн") {
                    Toggle("Установить срок", isOn: $deadlineEnabled)
                    if deadlineEnabled {
                        DatePicker("Дата и время", selection: $deadline,
                                   displayedComponents: [.date, .hourAndMinute])
                            .datePickerStyle(.graphical)
                    }
                }
                Section("Приоритет") {
                    VStack(alignment: .leading, spacing: 9) {
                        HStack {
                            Text("Важность")
                            Spacer()
                            Text("\(importance)/5").foregroundStyle(.secondary).monospacedDigit()
                        }
                        Slider(value: Binding(get: { Double(importance) },
                                              set: { importance = Int($0.rounded()) }),
                               in: 1...5, step: 1)
                    }
                    VStack(alignment: .leading, spacing: 9) {
                        HStack {
                            Text("Срочность")
                            Spacer()
                            Text("\(urgency)/5").foregroundStyle(.secondary).monospacedDigit()
                        }
                        Slider(value: Binding(get: { Double(urgency) },
                                              set: { urgency = Int($0.rounded()) }),
                               in: 1...5, step: 1)
                    }
                }
                if task.parentTaskId == nil {
                    Section("Сектор") {
                        Picker("Сектор задачи", selection: $sphereID) {
                            Text("Без сектора").tag("")
                            ForEach(session.spheres) { sphere in
                                Text(sphere.name).tag(sphere.id)
                            }
                        }
                    }
                }
                if let error = session.errorMessage {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange).font(.footnote)
                    }
                }
            }
            .navigationTitle(task.parentTaskId == nil ? "Настройки задачи" : "Настройки подзадачи")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(session.isWorking ? "Сохраняем…" : "Сохранить") {
                        Task {
                            let saved = await session.saveTaskSettings(
                                task: task, dueDate: deadlineEnabled ? deadline : nil,
                                importance: importance, urgency: urgency,
                                sphereId: sphereID.isEmpty ? nil : sphereID
                            )
                            if saved { dismiss() }
                        }
                    }
                    .disabled(session.isWorking)
                }
            }
        }
    }
}
