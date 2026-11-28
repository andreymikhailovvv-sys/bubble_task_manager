import SwiftUI

/// Native counterpart of Android's habit detail: daily counter, full-history
/// calendar and monthly statistics. A tap in the overview never changes progress.
struct NativeHabitDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: NativeWorkspaceSession
    let habitID: String

    @State private var month = Calendar.current.startOfDay(for: Date())
    @State private var history: [HabitCompletionStat] = []
    @State private var loading = true
    @State private var historyError: String?
    @State private var showingSettings = false

    private var habit: RemoteHabit? {
        session.habits.first(where: { $0.id == habitID })
    }
    private var calendar: Calendar { Calendar.current }
    private var today: Date { calendar.startOfDay(for: Date()) }
    private var tint: Color { Color(habitHex: habit?.color ?? "#22c55e") }
    private var monthStart: Date {
        calendar.date(from: calendar.dateComponents([.year, .month], from: month)) ?? month
    }
    private var dayCount: Int {
        calendar.range(of: .day, in: .month, for: monthStart)?.count ?? 30
    }
    private var firstOffset: Int {
        (calendar.component(.weekday, from: monthStart) + 5) % 7 // Monday-first
    }
    private var calendarCells: Int {
        ((firstOffset + dayCount + 6) / 7) * 7
    }
    private var amounts: [String: Int] {
        var values: [String: Int] = [:]
        for stat in habit?.stats ?? [] { values[stat.dateKey] = stat.amount }
        for stat in history { values[stat.dateKey] = stat.amount }
        return values
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                if let habit {
                    VStack(spacing: 19) {
                        summary(habit)
                        calendarCard(habit)
                        statistics(habit)
                    }
                    .padding(18)
                } else {
                    ContentUnavailableView("Привычка не найдена", systemImage: "exclamationmark.triangle")
                }
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Привычка")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button { showingSettings = true } label: {
                        Image(systemName: "gearshape")
                    }
                    .disabled(habit == nil)
                    .accessibilityLabel("Настройки привычки")
                }
            }
            .sheet(isPresented: $showingSettings) {
                if let habit {
                    NativeHabitEditor(session: session, habit: habit)
                        .presentationDetents([.medium, .large])
                }
            }
        }
        .task(id: habitID) { await refreshHistory() }
    }

    private func summary(_ habit: RemoteHabit) -> some View {
        let count = amounts[HabitCalendar.todayKey] ?? 0
        let fraction = min(1, Double(count) / Double(max(1, habit.targetCount)))
        return VStack(spacing: 13) {
            ZStack {
                Circle().stroke(tint.opacity(0.18), lineWidth: 7)
                Circle().trim(from: 0, to: fraction)
                    .stroke(tint, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text(habit.icon).font(.system(size: 36))
            }
            .frame(width: 96, height: 96)
            Text(habit.name).font(.title2.bold())
            Text(HabitCalendar.scheduleLabel(habit))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("Сегодня: \(count) из \(habit.targetCount)")
                .font(.subheadline.weight(.medium))
            if HabitCalendar.scheduled(habit, on: today) {
                HStack(spacing: 18) {
                    Button {
                        Task { await changeDay(habit, date: today, increment: false, amount: 1) }
                    } label: { Image(systemName: "minus.circle.fill").font(.system(size: 32)) }
                        .disabled(count <= 0 || session.isWorking)
                    Button {
                        Task { await changeDay(habit, date: today, increment: count < habit.targetCount,
                                               amount: count >= habit.targetCount ? count : habit.targetCount - count) }
                    } label: {
                        Text(count >= habit.targetCount ? "Отменить выполнение" : "Отметить выполнение")
                            .font(.subheadline.weight(.semibold))
                            .frame(minWidth: 185, minHeight: 44)
                            .foregroundStyle(.white)
                            .background(tint, in: Capsule())
                    }
                    .disabled(session.isWorking)
                    Button {
                        Task { await changeDay(habit, date: today, increment: true, amount: 1) }
                    } label: { Image(systemName: "plus.circle.fill").font(.system(size: 32)) }
                        .disabled(count >= habit.targetCount || session.isWorking)
                }
                .foregroundStyle(tint)
            } else {
                Text("Сегодня привычка не запланирована")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(22)
        .background(Color(uiColor: .secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 24))
    }

    private func calendarCard(_ habit: RemoteHabit) -> some View {
        let label = DateFormatter()
        label.locale = Locale(identifier: "ru_RU")
        label.dateFormat = "LLLL yyyy"
        return VStack(spacing: 16) {
            HStack {
                Label("Календарь", systemImage: "calendar")
                    .font(.headline)
                Spacer()
                Button {
                    if let target = calendar.date(byAdding: .month, value: -1, to: monthStart) {
                        month = target
                    }
                } label: { Image(systemName: "chevron.left") }
                    .accessibilityLabel("Предыдущий месяц")
                Text(label.string(from: monthStart).capitalized)
                    .font(.subheadline.weight(.medium))
                    .frame(minWidth: 125)
                Button {
                    if let target = calendar.date(byAdding: .month, value: 1, to: monthStart) {
                        month = target
                    }
                } label: { Image(systemName: "chevron.right") }
                    .disabled(calendar.isDate(monthStart, equalTo: today, toGranularity: .month))
                    .accessibilityLabel("Следующий месяц")
            }
            HStack(spacing: 3) {
                ForEach(["Пн","Вт","Ср","Чт","Пт","Сб","Вс"], id: \.self) { day in
                    Text(day)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 8) {
                ForEach(0..<calendarCells, id: \.self) { index in
                    if let date = calendar.date(byAdding: .day, value: index - firstOffset, to: monthStart) {
                        calendarCell(habit, date: date)
                    }
                }
            }
            HStack(spacing: 14) {
                Label("Выполнено", systemImage: "checkmark.circle.fill").foregroundStyle(tint)
                Label("Частично", systemImage: "circle.lefthalf.filled").foregroundStyle(tint)
            }
            .font(.caption2)
            if loading { ProgressView("Загрузка истории…").font(.caption) }
            if let historyError { Text(historyError).font(.caption).foregroundStyle(.orange) }
        }
        .padding(18)
        .background(Color(uiColor: .secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 24))
    }

    @ViewBuilder
    private func calendarCell(_ habit: RemoteHabit, date: Date) -> some View {
        let inside = calendar.isDate(date, equalTo: monthStart, toGranularity: .month)
        let eligible = HabitCalendar.scheduled(habit, on: date)
        let amount = amounts[HabitCalendar.dateKey(date)] ?? 0
        let completed = eligible && amount >= habit.targetCount
        let progress = inside && eligible ? min(1, max(0, CGFloat(amount) / CGFloat(max(1, habit.targetCount)))) : 0
        let canEdit = inside && eligible && date <= today && !session.isWorking && !loading
        Button {
            Task {
                await changeDay(habit, date: date, increment: !completed,
                                amount: completed ? amount : max(1, habit.targetCount - amount))
            }
        } label: {
            ZStack {
                GeometryReader { geometry in
                    VStack(spacing: 0) {
                        Spacer(minLength: 0)
                        Rectangle().fill(tint).frame(height: geometry.size.height * progress)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 10))
                Text("\(calendar.component(.day, from: date))")
                    .font(.system(size: 13, weight: completed ? .bold : .regular))
                    .foregroundStyle(inside ? Color.primary : Color.secondary.opacity(0.25))
            }
            .frame(height: 38)
            .opacity(inside && eligible ? 1 : 0.42)
        }
        .buttonStyle(.plain)
        .disabled(!canEdit)
        .accessibilityLabel("\(HabitCalendar.dateKey(date)), \(completed ? "выполнено" : "выполнено \(amount) из \(habit.targetCount)")")
    }

    private func statistics(_ habit: RemoteHabit) -> some View {
        let values = amounts
        var eligible = 0
        var complete = 0
        for day in 0..<dayCount {
            guard let date = calendar.date(byAdding: .day, value: day, to: monthStart),
                  date <= today, HabitCalendar.scheduled(habit, on: date) else { continue }
            eligible += 1
            if (values[HabitCalendar.dateKey(date)] ?? 0) >= habit.targetCount { complete += 1 }
        }
        var best = 0
        var streak = 0
        var current = 0
        let created = calendar.startOfDay(for: HabitCalendar.createdDate(habit))
        let elapsed = max(0, calendar.dateComponents([.day], from: created, to: today).day ?? 0)
        for offset in 0...min(elapsed, 3650) {
            guard let date = calendar.date(byAdding: .day, value: offset, to: created),
                  HabitCalendar.scheduled(habit, on: date) else { continue }
            if (values[HabitCalendar.dateKey(date)] ?? 0) >= habit.targetCount {
                streak += 1
                best = max(best, streak)
            } else { streak = 0 }
        }
        for offset in 0...min(elapsed, 3650) {
            guard let date = calendar.date(byAdding: .day, value: -offset, to: today),
                  date >= created, HabitCalendar.scheduled(habit, on: date) else { continue }
            if (values[HabitCalendar.dateKey(date)] ?? 0) >= habit.targetCount {
                current += 1
            } else if offset > 0 || (values[HabitCalendar.dateKey(date)] ?? 0) > 0 {
                break
            }
        }
        return VStack(alignment: .leading, spacing: 13) {
            Text("Статистика").font(.headline)
            HStack(spacing: 10) {
                metric("Выполнение", value: eligible > 0 ? "\(complete * 100 / eligible)%" : "0%",
                       icon: "chart.pie.fill")
                metric("Текущая серия", value: "\(current)", icon: "flame.fill")
            }
            HStack(spacing: 10) {
                metric("Лучшая серия", value: "\(best)", icon: "trophy.fill")
                metric("За месяц", value: "\(complete)/\(eligible)", icon: "checkmark.circle.fill")
            }
        }
        .padding(18)
        .background(Color(uiColor: .secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 24))
    }

    private func metric(_ label: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon).foregroundStyle(tint)
            Text(value).font(.title3.bold()).monospacedDigit()
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(tint.opacity(0.06), in: RoundedRectangle(cornerRadius: 15))
    }

    private func changeDay(_ habit: RemoteHabit, date: Date, increment: Bool, amount: Int) async {
        await session.changeHabitAmount(habit, dateKey: HabitCalendar.dateKey(date),
                                        increment: increment, amount: amount)
        await refreshHistory()
    }

    private func refreshHistory() async {
        loading = true
        defer { loading = false }
        do {
            history = try await session.habitHistory(id: habitID)
            historyError = nil
        } catch { historyError = error.localizedDescription }
    }
}
