import SwiftUI

extension Color {
    init(habitHex value: String) {
        let hex = value.trimmingCharacters(in: CharacterSet(charactersIn: "# "))
        if hex.count == 6, let rgb = UInt64(hex, radix: 16) {
            self = Color(red: Double((rgb >> 16) & 255) / 255,
                         green: Double((rgb >> 8) & 255) / 255,
                         blue: Double(rgb & 255) / 255)
        } else { self = .green }
    }
}

enum HabitCalendar {
    static var todayKey: String { dateKey(Date()) }

    static func dateKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func createdDate(_ habit: RemoteHabit) -> Date {
        guard let raw = habit.createdAt else { return Date() }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let value = formatter.date(from: raw) { return value }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: raw) ?? Date()
    }

    static func scheduled(_ habit: RemoteHabit, on date: Date) -> Bool {
        if habit.isArchived == true || habit.isAutoCompleted == true { return false }
        if let endDate = habit.endDate, dateKey(date) > String(endDate.prefix(10)) { return false }
        let calendar = Calendar.current
        let day = calendar.startOfDay(for: date)
        let created = calendar.startOfDay(for: createdDate(habit))
        if day < created { return false }
        switch habit.recurrenceType {
        case "WEEKDAYS":
            return habit.weekdays.contains(calendar.component(.weekday, from: date) - 1)
        case "INTERVAL":
            let days = calendar.dateComponents([.day], from: created, to: day).day ?? -1
            return days >= 0 && days % max(1, habit.intervalDays ?? 2) == 0
        default: return true
        }
    }

    static func scheduleLabel(_ habit: RemoteHabit) -> String {
        switch habit.recurrenceType {
        case "WEEKDAYS":
            let names = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]
            return habit.weekdays.filter { (0...6).contains($0) }.map { names[$0] }.joined(separator: ", ")
        case "INTERVAL": return "Раз в \(habit.intervalDays ?? 2) дн."
        default: return "Ежедневно"
        }
    }
}

struct NativeHabitsStrip: View {
    @Environment(\.colorScheme) private var colorScheme
    @ObservedObject var session: NativeWorkspaceSession
    @State private var showingCreate = false
    @State private var selectedHabit: RemoteHabit?

    private var card: Color {
        colorScheme == .dark ? Color(red: 0.14, green: 0.15, blue: 0.22) : .white
    }
    private var today: [RemoteHabit] { session.habits.filter { HabitCalendar.scheduled($0, on: Date()) } }
    private var later: [RemoteHabit] { session.habits.filter { !HabitCalendar.scheduled($0, on: Date()) } }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Label("Привычки", systemImage: "circle.hexagongrid.fill")
                    .font(.headline)
                Spacer()
                Text("\(today.filter { $0.amount(on: HabitCalendar.todayKey) >= $0.targetCount }.count)/\(today.count)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                Button { showingCreate = true } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(Color.green)
                }
                .accessibilityLabel("Создать привычку")
            }

            if session.habits.isEmpty {
                Text("Создай первую привычку. Она появится здесь и на других устройствах.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 10)
            } else {
                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: 16) {
                        ForEach(today) { habit in item(habit, scheduledToday: true) }
                        if !today.isEmpty && !later.isEmpty {
                            RoundedRectangle(cornerRadius: 1)
                                .fill(Color.secondary.opacity(0.23))
                                .frame(width: 1, height: 79)
                        }
                        ForEach(later) { habit in item(habit, scheduledToday: false) }
                    }
                    .padding(.vertical, 5)
                }
                .scrollIndicators(.hidden)
            }
        }
        .padding(18)
        .background(card, in: RoundedRectangle(cornerRadius: 24))
        .sheet(isPresented: $showingCreate) {
            NativeHabitEditor(session: session, habit: nil)
                .presentationDetents([.medium, .large])
        }
        .sheet(item: $selectedHabit) { habit in
            NativeHabitDetailSheet(session: session, habitID: habit.id)
                .presentationDetents([.large])
        }
    }

    private func item(_ habit: RemoteHabit, scheduledToday: Bool) -> some View {
        let tint = Color(habitHex: habit.color)
        let amount = habit.amount(on: HabitCalendar.todayKey)
        let fraction = min(1.0, Double(amount) / Double(max(habit.targetCount, 1)))
        return Button { selectedHabit = habit } label: {
            VStack(spacing: 7) {
                ZStack {
                    Circle()
                        .stroke(tint.opacity(0.18), lineWidth: 5)
                    Circle()
                        .trim(from: 0, to: scheduledToday ? fraction : 0)
                        .stroke(tint, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text(habit.icon).font(.system(size: 24))
                }
                .frame(width: 60, height: 60)
                .padding(3)
                .overlay(alignment: .topTrailing) {
                    if !scheduledToday {
                        Image(systemName: "calendar")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(tint)
                            .padding(5)
                            .background(card, in: Circle())
                            .offset(x: 5, y: -6)
                    }
                }
                Text(habit.name)
                    .font(.system(size: 11, weight: .medium))
                    .lineLimit(1)
                    .foregroundStyle(.primary)
                    .frame(width: 78)
            }
            .frame(width: 78)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Открыть привычку \(habit.name), выполнено \(amount) из \(habit.targetCount)")
    }
}

struct NativeHabitEditor: View {
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
    @State private var reminderEnabled: Bool
    @State private var reminderDates: [Date]
    @State private var showNotificationWarning = false

    private let emojiOptions = ["✨","💪","🏃","📚","📖","🧘","💧","🥗","😴","🚴","🎯","💻","📝","🎨","🎹","☀️","🌱","❤️","🧠","🦷","🚶","🏊","🏋️","☕️","💊","🧹","💰","📅","🐶","⛳️","🚗","🌙","🔥","🎵","📵","🫶"]
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
        let times = (habit?.reminderTimes?.isEmpty == false ? habit?.reminderTimes : habit?.reminderTime.map { [$0] }) ?? []
        _reminderEnabled = State(initialValue: !times.isEmpty)
        let parser = DateFormatter()
        parser.dateFormat = "HH:mm"
        let parsed = times.compactMap(parser.date(from:))
        _reminderDates = State(initialValue: parsed.isEmpty
            ? [parser.date(from: "09:00") ?? Date()] : parsed)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Привычка") {
                    TextField("Название", text: $name)
                    HStack {
                        Text("Эмодзи").foregroundStyle(.secondary)
                        Spacer()
                        Text(icon).font(.system(size: 30))
                    }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 9) {
                        ForEach(emojiOptions, id: \.self) { item in
                            Button { icon = item } label: {
                                Text(item).font(.system(size: 23))
                                    .frame(maxWidth: .infinity, minHeight: 37)
                                    .background(icon == item ? Color.green.opacity(0.16) : Color.clear,
                                                in: RoundedRectangle(cornerRadius: 8))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Выбрать эмодзи \(item)")
                        }
                    }
                    Stepper("Повторений в день: \(targetCount)", value: $targetCount, in: 1...99)
                }
                Section("Цвет") {
                    HStack(spacing: 10) {
                        ForEach(palette, id: \.self) { item in
                            Button { color = item } label: {
                                Circle().fill(Color(habitHex: item))
                                    .frame(width: 30, height: 30)
                                    .overlay {
                                        if color.lowercased() == item {
                                            Image(systemName: "checkmark")
                                                .font(.caption.bold()).foregroundStyle(.white)
                                        }
                                    }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                Section("Расписание") {
                    Picker("Повторять", selection: $recurrenceType) {
                        Text("Каждый день").tag("DAILY")
                        Text("По дням недели").tag("WEEKDAYS")
                        Text("Через интервал").tag("INTERVAL")
                    }
                    if recurrenceType == "WEEKDAYS" {
                        HStack(spacing: 4) {
                            ForEach(days.indices, id: \.self) { idx in
                                let day = days[idx]
                                Button {
                                    if weekdays.contains(day.0) { weekdays.remove(day.0) }
                                    else { weekdays.insert(day.0) }
                                } label: {
                                    Text(day.1).font(.system(size: 11, weight: .semibold))
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 10)
                                        .foregroundStyle(weekdays.contains(day.0) ? Color.white : Color.primary)
                                        .background(weekdays.contains(day.0) ? Color.green : Color.secondary.opacity(0.12),
                                                    in: RoundedRectangle(cornerRadius: 8))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    if recurrenceType == "INTERVAL" {
                        Stepper("Каждые \(intervalDays) дн.", value: $intervalDays, in: 1...365)
                    }
                }
                Section("Уведомления") {
                    Toggle("Напоминать о привычке", isOn: $reminderEnabled)
                    if reminderEnabled {
                        ForEach(reminderDates.indices, id: \.self) { index in
                            HStack(spacing: 8) {
                                DatePicker("Напоминание \(index + 1)", selection: $reminderDates[index],
                                           displayedComponents: .hourAndMinute)
                                    .datePickerStyle(.compact)
                                if reminderDates.count > 1 {
                                    Button(role: .destructive) {
                                        reminderDates.remove(at: index)
                                    } label: {
                                        Image(systemName: "minus.circle.fill")
                                    }
                                    .accessibilityLabel("Удалить напоминание \(index + 1)")
                                }
                            }
                        }
                        Button {
                            guard reminderDates.count < 12 else { return }
                            let next = Calendar.current.date(byAdding: .hour, value: 1,
                                                             to: reminderDates.last ?? Date()) ?? Date()
                            reminderDates.append(next)
                        } label: {
                            Label("Добавить напоминание", systemImage: "plus.circle.fill")
                        }
                        .disabled(reminderDates.count >= 12)
                        Text("Можно назначить до 12 напоминаний в разное время.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                if let error = session.errorMessage {
                    Section { Text(error).font(.footnote).foregroundStyle(.orange) }
                }
            }
            .navigationTitle(habit == nil ? "Новая привычка" : "Настроить привычку")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(session.isWorking ? "Сохраняем…" : "Сохранить") {
                        Task {
                            let clock = DateFormatter()
                            clock.dateFormat = "HH:mm"
                            clock.locale = Locale(identifier: "en_US_POSIX")
                            let times = reminderEnabled
                                ? Array(Set(reminderDates.map(clock.string(from:)))).sorted()
                                : []
                            let ok = await session.upsertHabit(
                                id: habit?.id, name: name, icon: icon, color: color,
                                targetCount: targetCount, recurrenceType: recurrenceType,
                                weekdays: recurrenceType == "WEEKDAYS" ? Array(weekdays).sorted() : [],
                                intervalDays: recurrenceType == "INTERVAL" ? intervalDays : nil,
                                reminderTimes: times
                            )
                            if ok {
                                if reminderEnabled {
                                    let granted = await NativeHabitNotifications.requestAndSync(session.habits)
                                    if !granted { showNotificationWarning = true }
                                    else { dismiss() }
                                } else {
                                    dismiss()
                                }
                            }
                        }
                    }
                    .disabled(session.isWorking ||
                              name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                              (recurrenceType == "WEEKDAYS" && weekdays.isEmpty))
                }
            }
        }
        .alert("Уведомления отключены", isPresented: $showNotificationWarning) {
            Button("Понятно") { dismiss() }
        } message: {
            Text("Время сохранено. Чтобы iPhone показывал напоминания, разреши уведомления Планировычу в настройках.")
        }
    }
}
