import SwiftUI

enum NativeTaskDates {
    static func parse(_ value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: value) { return date }
        iso.formatOptions = [.withInternetDateTime]
        return iso.date(from: value)
    }

    static func day(_ date: Date) -> Date { Calendar.current.startOfDay(for: date) }

    static func label(_ raw: String?) -> String {
        guard let date = parse(raw) else { return "Без срока" }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}

/// Manual recurrence uses exactly the server's {rrule,timezone,until,slots}
/// representation shared with the Android and browser editors.
struct NativeTaskSettingsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: NativeWorkspaceSession
    let task: RemoteTask

    @State private var deadlineEnabled: Bool
    @State private var deadline: Date
    @State private var importance: Int
    private let urgency: Int
    @State private var showingDeadline = false
    @State private var sphereID: String
    @State private var repeating: Bool
    @State private var recurrenceMethod: String
    @State private var period: String
    @State private var times: [Date]
    @State private var weekdays: Set<Int>
    @State private var monthDays: Set<Int>
    @State private var endEnabled: Bool
    @State private var untilDate: Date
    @State private var aiPrompt: String
    @State private var parsedRule: NativeRecurrenceRule?
    @State private var parsedSummary: String?
    @State private var parsing = false
    @State private var recurrenceError: String?

    private let days: [(Int, String)] = [(1,"Пн"),(2,"Вт"),(3,"Ср"),(4,"Чт"),(5,"Пт"),(6,"Сб"),(7,"Вс")]

    init(session: NativeWorkspaceSession, task: RemoteTask) {
        self.session = session
        self.task = task
        let due = NativeTaskDates.parse(task.dueDate)
        _deadlineEnabled = State(initialValue: due != nil)
        _deadline = State(initialValue: due ?? Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date())
        _importance = State(initialValue: max(1, min(5, task.importance ?? 3)))
        urgency = max(1, min(5, task.urgency ?? 3))
        _sphereID = State(initialValue: task.sphereId ?? "")

        let rule = task.recurrenceJson
        let freq = rule?.rrule.components(separatedBy: "FREQ=").dropFirst().first?
            .components(separatedBy: ";").first ?? "DAILY"
        _repeating = State(initialValue: task.isRecurring ?? false)
        _period = State(initialValue: ["DAILY", "WEEKLY", "MONTHLY"].contains(freq) ? freq : "DAILY")
        _recurrenceMethod = State(initialValue: rule?.slots == nil && task.isRecurring == true ? "ai" : "manual")
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "HH:mm"
        let parsed = (rule?.slots ?? []).compactMap { parser.date(from: $0.time) }
        _times = State(initialValue: parsed.isEmpty ? [parser.date(from: "09:00") ?? Date()] :
                       (freq == "DAILY" ? parsed : Array(parsed.prefix(1))))
        _weekdays = State(initialValue: Set((rule?.slots ?? []).compactMap(\.weekday)).isEmpty
            ? [1] : Set((rule?.slots ?? []).compactMap(\.weekday)))
        _monthDays = State(initialValue: Set((rule?.slots ?? []).compactMap(\.monthDay)).isEmpty
            ? [1] : Set((rule?.slots ?? []).compactMap(\.monthDay)))
        let savedUntil = NativeTaskDates.parse(task.recurrenceUntil ?? rule?.until)
        _endEnabled = State(initialValue: savedUntil != nil)
        _untilDate = State(initialValue: savedUntil ?? Calendar.current.date(byAdding: .month, value: 1, to: Date()) ?? Date())
        _aiPrompt = State(initialValue: task.recurrenceText ?? "")
        _parsedRule = State(initialValue: rule)
        _parsedSummary = State(initialValue: task.recurrenceSummary)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Дедлайн") {
                    Button {
                        showingDeadline = true
                    } label: {
                        HStack {
                            Label(deadlineEnabled ? deadline.formatted(date: .abbreviated, time: .shortened) : "Выбрать дату и время", systemImage: "calendar")
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption)
                        }
                    }
                    if deadlineEnabled {
                        Button("Убрать срок", role: .destructive) { deadlineEnabled = false }
                    }
                }
                Section("Приоритет") {
                    Text("Важность")
                    HStack(spacing: 8) {
                        ForEach(task.parentTaskId == nil ? Array(1...5) : Array(1...3), id: \.self) { level in
                            let colors: [Color] = task.parentTaskId == nil
                                ? [.blue, .cyan, .purple, .orange, .pink] : [.cyan, .yellow, .red]
                            Button {
                                importance = level
                            } label: {
                                Text(task.parentTaskId == nil ? String(level) : ["Низкая", "Средняя", "Высокая"][level - 1])
                                    .font(.caption.weight(.semibold))
                                    .minimumScaleFactor(0.7)
                                    .lineLimit(1)
                                    .frame(maxWidth: .infinity, minHeight: 39)
                                    .foregroundStyle(Color.primary)
                                    .background(colors[level - 1].opacity(importance == level ? 0.65 : 0.20), in: RoundedRectangle(cornerRadius: 10))
                                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(colors[level - 1], lineWidth: importance == level ? 2 : 0.5))
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(importance == level ? .isSelected : [])
                        }
                    }
                }
                .sheet(isPresented: $showingDeadline) {
                    NavigationStack {
                        Form {
                            DatePicker("Дата и время", selection: $deadline, displayedComponents: [.date, .hourAndMinute])
                                .datePickerStyle(.graphical)
                        }
                        .navigationTitle("Срок")
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Выбрать") { deadlineEnabled = true; showingDeadline = false }
                            }
                        }
                    }
                    .presentationDetents([.large])
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

                if task.parentTaskId == nil {
                Section("Повторение") {
                    Toggle("Повторять", isOn: $repeating)
                    if repeating {
                        Picker("Способ настройки", selection: $recurrenceMethod) {
                            Text("Вручную").tag("manual")
                            Text("Через ИИ").tag("ai")
                        }
                        .pickerStyle(.segmented)

                        if recurrenceMethod == "manual" {
                            Picker("Период", selection: $period) {
                                Text("Каждый день").tag("DAILY")
                                Text("Каждую неделю").tag("WEEKLY")
                                Text("Каждый месяц").tag("MONTHLY")
                            }
                            if period == "WEEKLY" {
                                VStack(alignment: .leading, spacing: 9) {
                                    Text("Дни недели").font(.subheadline)
                                    HStack(spacing: 5) {
                                        ForEach(days.indices, id: \.self) { index in
                                            let day = days[index]
                                            Button {
                                                if weekdays.contains(day.0) {
                                                    if weekdays.count > 1 { weekdays.remove(day.0) }
                                                } else {
                                                    weekdays.insert(day.0)
                                                }
                                            } label: {
                                                Text(day.1)
                                                    .font(.system(size: 11, weight: .semibold))
                                                    .frame(maxWidth: .infinity, minHeight: 36)
                                                    .background(weekdays.contains(day.0) ?
                                                                Color.teal.opacity(0.18) :
                                                                Color.secondary.opacity(0.10),
                                                                in: RoundedRectangle(cornerRadius: 8))
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                }
                            }
                            if period == "MONTHLY" {
                                VStack(alignment: .leading, spacing: 9) {
                                    Text("Дни месяца").font(.subheadline)
                                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7), spacing: 6) {
                                        ForEach(1...31, id: \.self) { day in
                                            Button {
                                                if monthDays.contains(day) {
                                                    if monthDays.count > 1 { monthDays.remove(day) }
                                                } else {
                                                    monthDays.insert(day)
                                                }
                                            } label: {
                                                Text("\(day)")
                                                    .font(.caption)
                                                    .frame(maxWidth: .infinity, minHeight: 32)
                                                    .background(monthDays.contains(day) ?
                                                                Color.teal.opacity(0.18) :
                                                                Color.secondary.opacity(0.08),
                                                                in: RoundedRectangle(cornerRadius: 7))
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                }
                            }
                            ForEach(times.indices, id: \.self) { index in
                                HStack(spacing: 8) {
                                    DatePicker("Время \(index + 1)", selection: $times[index],
                                               displayedComponents: .hourAndMinute)
                                    if times.count > 1 {
                                        Button(role: .destructive) {
                                            times.remove(at: index)
                                        } label: {
                                            Image(systemName: "minus.circle.fill")
                                        }
                                    }
                                }
                            }
                            if period == "DAILY" && times.count < 12 {
                                Button {
                                    times.append(Calendar.current.date(byAdding: .hour, value: 1,
                                                                       to: times.last ?? Date()) ?? Date())
                                } label: {
                                    Label("Добавить время", systemImage: "plus.circle.fill")
                                }
                            }
                        } else {
                            TextField("Например: каждый понедельник и пятницу в 9:00",
                                      text: $aiPrompt, axis: .vertical)
                                .lineLimit(2...4)
                            Button {
                                Task { await parseWithAI() }
                            } label: {
                                Label(parsing ? "Определяем расписание…" : "Сформировать расписание",
                                      systemImage: "sparkles")
                            }
                            .disabled(parsing || aiPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            if let parsedSummary {
                                Label(parsedSummary, systemImage: "checkmark.circle")
                                    .font(.subheadline)
                                    .foregroundStyle(.green)
                            }
                        }

                        Toggle("Дата окончания", isOn: $endEnabled)
                        if endEnabled {
                            DatePicker("Повторять до", selection: $untilDate,
                                       in: Date()..., displayedComponents: .date)
                        }
                    }
                }

                }

                if let recurrenceError {
                    Section {
                        Text(recurrenceError)
                            .font(.footnote)
                            .foregroundStyle(.orange)
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
                        Task { await save() }
                    }
                    .disabled(session.isWorking || parsing ||
                              (repeating && recurrenceMethod == "ai" && parsedRule == nil))
                }
            }
        }
    }

    private func makeManualRule() -> NativeRecurrenceRule {
        let format = DateFormatter()
        format.locale = Locale(identifier: "en_US_POSIX")
        format.dateFormat = "HH:mm"
        let clock = times.first.map(format.string(from:)) ?? "09:00"
        let slots: [NativeRecurrenceSlot]
        switch period {
        case "WEEKLY":
            slots = weekdays.sorted().map { NativeRecurrenceSlot(time: clock, weekday: $0, monthDay: nil) }
        case "MONTHLY":
            slots = monthDays.sorted().map { NativeRecurrenceSlot(time: clock, weekday: nil, monthDay: $0) }
        default:
            slots = times.map { NativeRecurrenceSlot(time: format.string(from: $0),
                                                     weekday: nil, monthDay: nil) }
        }
        return NativeRecurrenceRule(rrule: "FREQ=" + period, timezone: TimeZone.current.identifier,
                                    until: endEnabled ? ISO8601DateFormatter().string(from: untilDate) : nil,
                                    slots: slots)
    }

    private func parseWithAI() async {
        parsing = true
        defer { parsing = false }
        recurrenceError = nil
        do {
            let (rule, summary) = try await session.parseRecurrence(aiPrompt, taskId: task.id)
            parsedRule = rule
            parsedSummary = summary
        } catch {
            parsedRule = nil
            recurrenceError = error.localizedDescription
        }
    }

    private func save() async {
        let rule: NativeRecurrenceRule? = repeating
            ? (recurrenceMethod == "manual" ? makeManualRule() : parsedRule)
            : nil
        let description: String?
        if !repeating {
            description = nil
        } else if recurrenceMethod == "manual" {
            let unit = period == "DAILY" ? "день" : period == "WEEKLY" ? "неделю" : "месяц"
            description = "\(rule?.slots?.count ?? 1) раз в \(unit)"
        } else {
            description = parsedSummary
        }
        guard !repeating || rule != nil else {
            recurrenceError = "Сначала сформируй расписание с помощью ИИ."
            return
        }
        let result = await session.saveTaskSettings(
            task: task, dueDate: deadlineEnabled ? deadline : nil,
            importance: importance, urgency: urgency,
            sphereId: sphereID.isEmpty ? nil : sphereID,
            isRecurring: repeating, recurrence: rule,
            recurrenceSummary: description
        )
        if result { dismiss() }
    }
}
