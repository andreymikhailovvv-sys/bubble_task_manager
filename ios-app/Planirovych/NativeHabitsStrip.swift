import SwiftUI

private extension Color {
    init(habitHex value: String) {
        let hex = value.trimmingCharacters(in: CharacterSet(charactersIn: "# "))
        if hex.count == 6, let rgb = UInt64(hex, radix: 16) {
            self = Color(red: Double((rgb >> 16) & 255) / 255,
                         green: Double((rgb >> 8) & 255) / 255,
                         blue: Double(rgb & 255) / 255)
        } else {
            self = .green
        }
    }
}

private enum HabitCalendar {
    static var todayKey: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    static func dueToday(_ habit: RemoteHabit) -> Bool {
        switch habit.recurrenceType {
        case "WEEKDAYS":
            let serverWeekday = Calendar.current.component(.weekday, from: Date()) - 1
            return habit.weekdays.contains(serverWeekday)
        case "INTERVAL":
            // Align interval with the habit's creation day, as on the server.
            guard let createdAt = habit.createdAt else { return true }
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let start = iso.date(from: createdAt) ?? {
                iso.formatOptions = [.withInternetDateTime]
                return iso.date(from: createdAt)
            }()
            guard let start else { return true }
            let days = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: start),
                                                       to: Calendar.current.startOfDay(for: Date())).day ?? 0
            return days >= 0 && days % max(1, habit.intervalDays ?? 2) == 0
        default: return true
        }
    }

    static func scheduleLabel(_ habit: RemoteHabit) -> String {
        switch habit.recurrenceType {
        case "WEEKDAYS":
            let names = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]
            return habit.weekdays.map { names[$0] }.joined(separator: ", ")
        case "INTERVAL": return "Каждые \(habit.intervalDays ?? 2) дн."
        default: return "Ежедневно"
        }
    }
}

struct NativeHabitsStrip: View {
    @Environment(\.colorScheme) private var colorScheme
    @ObservedObject var session: NativeWorkspaceSession
    @State private var presentingNew = false
    @State private var editingHabit: RemoteHabit?

    private var card: Color {
        colorScheme == .dark ? Color(red: 0.14, green: 0.15, blue: 0.22) : .white
    }
    private var todays: [RemoteHabit] { session.habits.filter(HabitCalendar.dueToday) }
    private var upcoming: [RemoteHabit] { session.habits.filter { !HabitCalendar.dueToday($0) } }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Привычки")
                    .font(.system(size: 15, weight: .semibold))
                Text("\(todays.filter { $0.amount(on: HabitCalendar.todayKey) >= $0.targetCount }.count)/\(todays.count)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button { presentingNew = true } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(.green)
                }
                .accessibilityLabel("Добавить привычку")
            }
            .padding(.horizontal, 20)

            if session.habits.isEmpty {
                Text("Привычек пока нет. Нажми +, чтобы создать первую.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 4)
            } else {
                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: 17) {
                        ForEach(todays) { habit in
                            habitItem(habit, scheduledToday: true)
                        }
                        if !upcoming.isEmpty && !todays.isEmpty {
                            RoundedRectangle(cornerRadius: 1)
                                .fill(Color.secondary.opacity(0.24))
                                .frame(width: 1, height: 76)
                                .padding(.top, 5)
                        }
                        ForEach(upcoming) { habit in
                            habitItem(habit, scheduledToday: false)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 7)
                }
                .scrollIndicators(.hidden)
            }
        }
        .padding(.top, 14)
        .padding(.bottom, 8)
        .background(card)
        .overlay(alignment: .bottom) { Divider().opacity(0.3) }
        .sheet(isPresented: $presentingNew) {
            NativeHabitEditor(session: session, habit: nil)
                .presentationDetents([.medium, .large])
        }
        .sheet(item: $editingHabit) { habit in
            NativeHabitEditor(session: session, habit: habit)
                .presentationDetents([.medium, .large])
        }
    }

    private func habitItem(_ habit: RemoteHabit, scheduledToday: Bool) -> some View {
        let tint = Color(habitHex: habit.color)
        let amount = habit.amount(on: HabitCalendar.todayKey)
        let progress = min(1, Double(amount) / Double(max(1, habit.targetCount)))
        return VStack(spacing: 6) {
            Button {
                if scheduledToday {
                    Task { await session.toggleHabit(habit, dateKey: HabitCalendar.todayKey) }
                } else {
                    editingHabit = habit
                }
            } label: {
                ZStack {
                    Circle().stroke(tint.opacity(0.23), lineWidth: 5)
                    Circle()
                        .trim(from: 0, to: scheduledToday ? progress : 0)
                        .stroke(tint, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text(habit.icon)
                        .font(.system(size: 24))
                        .lineLimit(1)
                }
                .frame(width: 62, height: 62)
                .padding(3)
                .overlay(alignment: .topTrailing) {
                    if !scheduledToday {
                        Image(systemName: "calendar")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(tint)
                            .padding(5)
                            .background(card, in: Circle())
                            .offset(x: 7, y: -7)
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(session.isWorking)
            .accessibilityLabel(scheduledToday
                ? "\(habit.name), выполнено \(amount) из \(habit.targetCount). Изменить выполнение"
                : "\(habit.name), \(HabitCalendar.scheduleLabel(habit)). Открыть настройки")

            Button { editingHabit = habit } label: {
                Text(habit.name)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .frame(width: 78)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Настроить привычку \(habit.name)")
        }
        .frame(width: 78)
        .contextMenu {
            Button("Настроить", systemImage: "slider.horizontal.3") { editingHabit = habit }
        }
    }
}

private struct NativeHabitEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: NativeWorkspaceSession
    let habit: RemoteHabit?
    @State private var name: String
    @State private var icon: String
    @State private var color: String
    @State private var targetCount: Int
    @State private var recurrenceType: String
    @State private var intervalDays: Int
    @State private var weekdays: Set<Int>

    private let palette = ["#22c55e", "#8b5cf6", "#3b82f6", "#f97316", "#ec4899", "#eab308", "#ef4444"]
    private let days: [(Int, String)] = [(1,"Пн"),(2,"Вт"),(3,"Ср"),(4,"Чт"),(5,"Пт"),(6,"Сб"),(0,"Вс")]

    init(session: NativeWorkspaceSession, habit: RemoteHabit?) {
        self.session = session
        self.habit = habit
        _name = State(initialValue: habit?.name ?? "")
        _icon = State(initialValue: habit?.icon ?? "✨")
        _color = State(initialValue: habit?.color ?? "#22c55e")
        _targetCount = State(initialValue: habit?.targetCount ?? 1)
        _recurrenceType = State(initialValue: habit?.recurrenceType ?? "DAILY")
        _intervalDays = State(initialValue: habit?.intervalDays ?? 2)
        _weekdays = State(initialValue: Set(habit?.weekdays ?? [1,2,3,4,5,6,0]))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Привычка") {
                    TextField("Название", text: $name)
                    TextField("Эмодзи", text: $icon)
                        .lineLimit(1)
                    Stepper("Повторений: \(targetCount)", value: $targetCount, in: 1...99)
                }
                Section("Цвет") {
                    HStack(spacing: 10) {
                        ForEach(palette, id: \.self) { item in
                            Button { color = item } label: {
                                Circle().fill(Color(habitHex: item))
                                    .frame(width: 31, height: 31)
                                    .overlay {
                                        if color.lowercased() == item {
                                            Image(systemName: "checkmark")
                                                .font(.caption.bold())
                                                .foregroundStyle(.white)
                                        }
                                    }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Цвет \(item)")
                        }
                    }
                    .padding(.vertical, 4)
                }
                Section("Расписание") {
                    Picker("Повторять", selection: $recurrenceType) {
                        Text("Каждый день").tag("DAILY")
                        Text("По дням недели").tag("WEEKDAYS")
                        Text("Через интервал").tag("INTERVAL")
                    }
                    if recurrenceType == "WEEKDAYS" {
                        HStack(spacing: 5) {
                            ForEach(days.indices, id: \.self) { index in
                                let day = days[index]
                                Button {
                                    if weekdays.contains(day.0) { weekdays.remove(day.0) }
                                    else { weekdays.insert(day.0) }
                                } label: {
                                    Text(day.1)
                                        .font(.system(size: 11, weight: .semibold))
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 11)
                                        .background(weekdays.contains(day.0) ? Color.green : Color.secondary.opacity(0.12),
                                                    in: RoundedRectangle(cornerRadius: 8))
                                        .foregroundStyle(weekdays.contains(day.0) ? .white : .primary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    if recurrenceType == "INTERVAL" {
                        Stepper("Каждые \(intervalDays) дн.", value: $intervalDays, in: 1...365)
                    }
                }
                if let error = session.errorMessage {
                    Section {
                        Text(error).font(.footnote).foregroundStyle(.orange)
                    }
                }
            }
            .navigationTitle(habit == nil ? "Новая привычка" : "Настройка привычки")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(session.isWorking ? "Сохраняем…" : "Сохранить") {
                        Task {
                            let result = await session.upsertHabit(
                                id: habit?.id, name: name,
                                icon: icon.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "✨" : icon,
                                color: color, targetCount: targetCount, recurrenceType: recurrenceType,
                                weekdays: recurrenceType == "WEEKDAYS" ? Array(weekdays).sorted() : [],
                                intervalDays: recurrenceType == "INTERVAL" ? intervalDays : nil
                            )
                            if result { dismiss() }
                        }
                    }
                    .disabled(session.isWorking || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                              (recurrenceType == "WEEKDAYS" && weekdays.isEmpty))
                }
            }
        }
    }
}
