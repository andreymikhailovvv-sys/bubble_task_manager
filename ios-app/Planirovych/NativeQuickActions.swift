import SwiftUI

enum NativeQuickEntryKind: String, CaseIterable, Identifiable {
    case task = "Задача"
    case reminder = "Напоминание"
    case event = "Событие"

    var id: String { rawValue }
    var serverType: String {
        switch self {
        case .task: return "TASK"
        case .reminder: return "REMINDER"
        case .event: return "EVENT"
        }
    }
    var symbol: String {
        switch self {
        case .task: return "checkmark.circle"
        case .reminder: return "bell"
        case .event: return "calendar.badge.plus"
        }
    }
}

struct NativeQuickCreateSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: NativeWorkspaceSession
    let kind: NativeQuickEntryKind

    @State private var title = ""
    @State private var selectedSphereID = ""
    @State private var hasDate = false
    @State private var selectedDate = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()

    var body: some View {
        NavigationStack {
            Form {
                Section(kind.rawValue) {
                    TextField("Название", text: $title, axis: .vertical)
                        .lineLimit(1...3)
                    if kind != .reminder {
                        Toggle("Назначить дату", isOn: $hasDate)
                    }
                    if kind == .reminder || hasDate {
                        DatePicker("Дата и время", selection: $selectedDate,
                                   displayedComponents: [.date, .hourAndMinute])
                    }
                }
                Section("Сектор") {
                    Picker("Сектор", selection: $selectedSphereID) {
                        Text("Без сектора").tag("")
                        ForEach(session.spheres) { sphere in
                            Text(sphere.name).tag(sphere.id)
                        }
                    }
                }
                if let error = session.errorMessage {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .font(.footnote).foregroundStyle(.orange)
                    }
                }
            }
            .navigationTitle("Добавить: \(kind.rawValue.lowercased())")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(session.isWorking ? "Сохраняем…" : "Создать") {
                        Task {
                            let okay = await session.addPlannerEntry(
                                title: title, type: kind.serverType,
                                dueDate: kind == .reminder || hasDate ? selectedDate : nil,
                                sphereId: selectedSphereID.isEmpty ? nil : selectedSphereID
                            )
                            if okay { dismiss() }
                        }
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                              session.isWorking)
                }
            }
        }
        .onAppear { hasDate = kind == .reminder || kind == .event }
    }
}

struct NativeQuickVoiceSheet: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var recorder = ChatVoiceRecorder()
    @ObservedObject var session: NativeWorkspaceSession
    let onSubmitted: (String) -> Void

    @State private var processing = false
    @State private var errorText: String?
    private let purple = Color(red: 0.55, green: 0.43, blue: 0.91)

    private let samples = [
        "Добавь задачу позвонить клиенту завтра",
        "Напомни оплатить счёт в пятницу",
        "Перенеси встречу на понедельник",
        "Запиши расход 1200 рублей на такси",
        "Найди просроченные задачи"
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    Text("Голосовой ввод")
                        .font(.title2.bold())

                    TimelineView(.periodic(from: .now, by: 1)) { timeline in
                        let elapsed = max(0, min(119, Int(timeline.date.timeIntervalSince(
                            recorder.startedAt ?? timeline.date
                        ))))
                        Text(String(format: "%02d:%02d", elapsed / 60, elapsed % 60))
                            .font(.system(size: 23, weight: .medium, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }

                    ZStack {
                        Circle().stroke(purple.opacity(0.10 + Double(recorder.level) * 0.30),
                                        lineWidth: 3)
                            .frame(width: 140 + recorder.level * 60,
                                   height: 140 + recorder.level * 60)
                        Circle().fill(purple.opacity(0.13 + Double(recorder.level) * 0.22))
                            .frame(width: 120 + recorder.level * 34,
                                   height: 120 + recorder.level * 34)
                        Circle().fill(purple).frame(width: 92, height: 92)
                        Image(systemName: "mic.fill")
                            .font(.system(size: 38))
                            .foregroundStyle(.white)
                    }
                    .frame(height: 210)
                    .animation(.easeOut(duration: 0.12), value: recorder.level)

                    Text(processing ? "Распознаю запись…" :
                         recorder.isRecording ? "Слушаю вас" : "Подключаю микрофон…")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Примеры голосовых команд")
                            .font(.subheadline.bold())
                        ForEach(samples, id: \.self) { sample in
                            Label(sample, systemImage: "sparkle")
                                .font(.system(size: 12.5))
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(17)
                    .background(Color(uiColor: .secondarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: 19))

                    if let error = errorText ?? recorder.errorMessage {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                    }

                    HStack(spacing: 14) {
                        Button(role: .cancel) {
                            recorder.cancel()
                            dismiss()
                        } label: {
                            Label("Отмена", systemImage: "xmark")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.bordered)
                        Button {
                            Task { await send() }
                        } label: {
                            if processing {
                                ProgressView().frame(maxWidth: .infinity, minHeight: 44)
                            } else {
                                Label("Отправить", systemImage: "arrow.up")
                                    .frame(maxWidth: .infinity, minHeight: 44)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(purple)
                        .disabled(!recorder.isRecording || processing)
                    }
                }
                .padding(20)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Планировыч AI")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await recorder.start() }
        .onDisappear { recorder.cancel() }
    }

    private func send() async {
        guard !processing, let recorded = recorder.stop() else { return }
        processing = true
        defer { processing = false }
        do {
            let text = try await session.transcribeVoice(data: recorded.data,
                                                         duration: recorded.duration)
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                errorText = "Не удалось распознать речь."
                return
            }
            onSubmitted(text)
            dismiss()
        } catch {
            errorText = error.localizedDescription
        }
    }
}
