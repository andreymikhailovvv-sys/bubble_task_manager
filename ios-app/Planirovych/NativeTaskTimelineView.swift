import SwiftUI

enum NativeTimelineZoom: String, CaseIterable {
    case day = "День"
    case week = "Неделя"
    case month = "Месяц"
}

struct NativeTaskTimelineView: View {
    let tasks: [RemoteTask]
    let spheres: [RemoteSphere]
    let habits: [RemoteHabit]
    let onOpenTask: (RemoteTask) -> Void
    let onOpenHabit: (RemoteHabit) -> Void
    let overdueCount: Int
    let onOpenOverdue: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var zoom: NativeTimelineZoom = .day
    @State private var anchor = Calendar.current.startOfDay(for: Date())

    private var calendar: Calendar { Calendar.current }
    private var periodStart: Date {
        switch zoom {
        case .day: return calendar.startOfDay(for: anchor)
        case .week:
            let weekday = calendar.component(.weekday, from: anchor)
            return calendar.date(byAdding: .day, value: -((weekday + 5) % 7), to: calendar.startOfDay(for: anchor)) ?? anchor
        case .month:
            return calendar.date(from: calendar.dateComponents([.year, .month], from: anchor)) ?? anchor
        }
    }
    private var title: String {
        let format = DateFormatter()
        format.locale = Locale(identifier: "ru_RU")
        switch zoom {
        case .day: format.dateFormat = "d MMMM, EEEE"
        case .week: format.dateFormat = "d MMMM"
        case .month: format.dateFormat = "LLLL yyyy"
        }
        if zoom == .week, let end = calendar.date(byAdding: .day, value: 6, to: periodStart) {
            return "\(format.string(from: periodStart)) – \(format.string(from: end))"
        }
        return format.string(from: periodStart).capitalized
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Picker("Масштаб", selection: $zoom) {
                    ForEach(NativeTimelineZoom.allCases, id: \.self) { item in
                        Text(item.rawValue).tag(item)
                    }
                }
                .pickerStyle(.segmented)
                Button("Сегодня") {
                    anchor = calendar.startOfDay(for: Date())
                }
                .font(.caption2.weight(.semibold))
            }

            HStack(spacing: 8) {
                HStack(spacing: 3) {
                    Button {
                        move(-1)
                    } label: {
                        Image(systemName: "chevron.left").frame(width: 25, height: 48)
                    }
                    .accessibilityLabel("Предыдущий период")
                    Spacer(minLength: 0)
                    VStack(spacing: 2) {
                        Text(title)
                            .font(.system(size: 12, weight: .semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.78)
                        Text(zoom == .day ? "Выбранный день" :
                             zoom == .week ? "Выбранная неделя" : "Выбранный месяц")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .multilineTextAlignment(.center)
                    Spacer(minLength: 0)
                    Button {
                        move(1)
                    } label: {
                        Image(systemName: "chevron.right").frame(width: 25, height: 48)
                    }
                    .accessibilityLabel("Следующий период")
                }
                .frame(maxWidth: .infinity)
                .background(Color.purple.opacity(0.08),
                            in: RoundedRectangle(cornerRadius: 14))
                .overlay {
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color.purple.opacity(0.23), lineWidth: 1)
                }
                Button(action: onOpenOverdue) {
                    HStack(spacing: 5) {
                        Image(systemName: "clock.badge.exclamationmark")
                            .font(.system(size: 17))
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Просроченные")
                            Text("задачи")
                        }
                        .font(.system(size: 9, weight: .semibold))
                        .lineLimit(1)
                    }
                    .foregroundStyle(Color(red: 0.74, green: 0.32, blue: 0.47))
                    .frame(width: 115, height: 51)
                    .background(Color.pink.opacity(0.08),
                                in: RoundedRectangle(cornerRadius: 14))
                    .overlay {
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(Color.pink.opacity(0.25), lineWidth: 1)
                    }
                    .overlay(alignment: .topTrailing) {
                        if overdueCount > 0 {
                            Text("\(min(overdueCount, 99))")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 3)
                                .background(Color.red, in: Capsule())
                                .offset(x: 4, y: -6)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Просроченные задачи: \(overdueCount)")
            }
            .buttonStyle(.plain)

            switch zoom {
            case .day: dayView
            case .week: weekView
            case .month: monthView
            }
        }
    }

    private func move(_ step: Int) {
        let component: Calendar.Component = zoom == .day ? .day : zoom == .week ? .weekOfYear : .month
        if let shifted = calendar.date(byAdding: component, value: step, to: anchor) {
            anchor = shifted
        }
    }

    private func events(on date: Date) -> [RemoteTask] {
        tasks.filter {
            guard let due = NativeTaskDates.parse($0.dueDate) else { return false }
            return calendar.isDate(due, inSameDayAs: date)
        }
        .sorted {
            let first = NativeTaskDates.parse($0.dueDate) ?? .distantFuture
            let second = NativeTaskDates.parse($1.dueDate) ?? .distantFuture
            return first == second ? ($0.importance ?? 3) > ($1.importance ?? 3) : first < second
        }
    }

    private func sectorTint(_ task: RemoteTask) -> Color {
        Color(habitHex: spheres.first(where: { $0.id == task.sphereId })?.color ?? "#8b5cf6")
    }

    private func taskCard(_ task: RemoteTask) -> some View {
        Button { onOpenTask(task) } label: {
            HStack(alignment: .top, spacing: 10) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(sectorTint(task))
                    .frame(width: 4)
                VStack(alignment: .leading, spacing: 5) {
                    if task.taskType == "EVENT" || task.taskType == "REMINDER" {
                        Label(task.taskType == "EVENT" ? "Событие" : "Напоминание",
                              systemImage: task.taskType == "EVENT" ? "calendar" : "bell")
                            .font(.caption2)
                            .foregroundStyle(sectorTint(task))
                    }
                    Text(task.title)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.leading)
                    HStack(spacing: 8) {
                        if let due = NativeTaskDates.parse(task.dueDate) {
                            Text(due, format: .dateTime.hour().minute())
                        }
                        Text("Важность \(task.importance ?? 3)/5")
                    }
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary)
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(sectorTint(task).opacity(0.09),
                        in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    private struct DayRecord: Identifiable {
        let id: String
        let date: Date
        let title: String
        let tint: Color
        let kind: String
        let task: RemoteTask?
        let habit: RemoteHabit?
    }

    private var dayRecords: [DayRecord] {
        var records = events(on: anchor).compactMap { task -> DayRecord? in
            guard let due = NativeTaskDates.parse(task.dueDate) else { return nil }
            let kind = task.taskType == "EVENT" ? "Событие" :
                task.taskType == "REMINDER" ? "Напоминание" :
                task.parentTaskId != nil ? "Подзадача" : "Задача"
            return DayRecord(id: task.id, date: due, title: task.title,
                             tint: sectorTint(task), kind: kind, task: task, habit: nil)
        }
        for habit in habits where HabitCalendar.scheduled(habit, on: anchor) {
            let times = habit.reminderTimes?.isEmpty == false ?
                habit.reminderTimes ?? [] : (habit.reminderTime.map { [$0] } ?? [])
            for (index, clock) in times.enumerated() {
                let parts = clock.split(separator: ":")
                guard parts.count == 2, let hour = Int(parts[0]), let minute = Int(parts[1]),
                      let date = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: anchor)
                else { continue }
                records.append(DayRecord(id: "habit-\(habit.id)-\(index)", date: date,
                                         title: habit.icon + " " + habit.name,
                                         tint: Color(habitHex: habit.color), kind: "Привычка",
                                         task: nil, habit: habit))
            }
        }
        return records.sorted { $0.date == $1.date ? $0.title < $1.title : $0.date < $1.date }
    }

    private func remainingTime(_ date: Date) -> String {
        let minutes = Int(abs(date.timeIntervalSinceNow) / 60)
        let days = minutes / 1440
        let hours = (minutes % 1440) / 60
        let remainder = minutes % 60
        let pieces = [
            days > 0 ? "\(days)д" : nil,
            hours > 0 ? "\(hours)ч" : nil,
            days == 0 && (remainder > 0 || hours == 0) ? "\(max(remainder, 1))м" : nil
        ].compactMap { $0 }
        return (date < Date() ? "Просрочено на " : "Через ") + pieces.joined(separator: " ")
    }

    private func compactDayCard(_ record: DayRecord) -> some View {
        let isSubtask = record.kind == "Подзадача"
        let isEvent = record.kind == "Событие"
        let isTimeOnly = ["Событие", "Напоминание", "Привычка"].contains(record.kind)
        let dark = colorScheme == .dark
        let tintBackground = record.tint.opacity(dark ? 0.11 : 0.045)
        let base = Color(uiColor: .secondarySystemGroupedBackground)
        let border = dark ? Color(red: 0.25, green: 0.31, blue: 0.41)
                          : Color(red: 0.88, green: 0.91, blue: 0.95)

        return Button {
            if let task = record.task { onOpenTask(task) }
            else if let habit = record.habit { onOpenHabit(habit) }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Circle().fill(record.tint)
                    .frame(width: isSubtask ? 6 : 7, height: isSubtask ? 6 : 7)
                    .padding(.top, 8)
                VStack(alignment: .leading, spacing: 5) {
                    Text(record.title)
                        .font(.system(size: isSubtask ? 12.5 : 14, weight: .semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(isTimeOnly ? record.date.formatted(date: .omitted, time: .shortened)
                         : remainingTime(record.date))
                        .font(.system(size: isSubtask ? 10.5 : 11.5, weight: .medium))
                        .foregroundStyle(record.date < Date() && !isTimeOnly ? Color.red : Color.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 15)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: isSubtask ? 54 : 62, alignment: .leading)
            .background(
                LinearGradient(colors: [tintBackground, base, base],
                               startPoint: .leading, endPoint: .trailing),
                in: RoundedRectangle(cornerRadius: 18)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 18)
                    .stroke(border, style: StrokeStyle(lineWidth: 1,
                                                      dash: isEvent ? [6, 4] : []))
            }
        }
        .buttonStyle(.plain)
        .padding(.trailing, isSubtask ? 8 : 0)
    }

    private var dayView: some View {
        let records = dayRecords
        let isToday = calendar.isDateInToday(anchor)
        let currentHour = calendar.component(.hour, from: Date())
        let scheduledHours = Set(records.map { calendar.component(.hour, from: $0.date) })
        let hours = (scheduledHours.union(isToday ? [currentHour] : [])).sorted()
        let rail = colorScheme == .dark ? Color(red: 0.27, green: 0.34, blue: 0.44)
                                        : Color(red: 0.88, green: 0.90, blue: 0.94)
        let marker = colorScheme == .dark ? Color(red: 0.61, green: 0.67, blue: 0.78)
                                          : Color(red: 0.55, green: 0.61, blue: 0.70)
        return VStack(alignment: .leading, spacing: 11) {
            if hours.isEmpty {
                Label("На выбранный день нет записей", systemImage: "calendar")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 22)
            } else {
                ForEach(hours, id: \.self) { hour in
                    HStack(alignment: .top, spacing: 0) {
                        HStack(alignment: .top, spacing: 5) {
                            Text(String(format: "%02d:00", hour))
                                .font(.system(size: 11, weight: .medium))
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                                .padding(.top, 16)
                            Spacer(minLength: 0)
                            Circle().fill(marker)
                                .frame(width: 9, height: 9)
                                .padding(.top, 19)
                                .offset(x: 4.5)
                        }
                        .frame(width: 64)
                        VStack(alignment: .leading, spacing: 9) {
                            if isToday && hour == currentHour {
                                HStack(spacing: 8) {
                                    Circle().fill(Color.purple).frame(width: 7, height: 7)
                                    Text("Сейчас · " + Date().formatted(date: .omitted, time: .shortened))
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundStyle(.purple)
                                    Rectangle().fill(Color.purple.opacity(0.45)).frame(height: 1)
                                }
                                .padding(.vertical, 9)
                            }
                            ForEach(records.filter { calendar.component(.hour, from: $0.date) == hour }) { record in
                                compactDayCard(record)
                            }
                        }
                        .padding(.leading, 13)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
        .padding(.vertical, 8)
        .background(alignment: .topLeading) {
            rail.frame(width: 1.3)
                .padding(.leading, 63.5)
                .padding(.vertical, 17)
        }
    }

    private var weekView: some View {
        ScrollView(.horizontal) {
            HStack(alignment: .top, spacing: 10) {
                ForEach(0..<7, id: \.self) { day in
                    if let date = calendar.date(byAdding: .day, value: day, to: periodStart) {
                        VStack(alignment: .leading, spacing: 9) {
                            Text(date, format: .dateTime.weekday(.abbreviated).day())
                                .font(.subheadline.weight(.semibold))
                            let matching = events(on: date)
                            if matching.isEmpty {
                                Text("Нет задач").font(.caption).foregroundStyle(.secondary)
                            } else {
                                ForEach(matching) { task in taskCard(task) }
                            }
                        }
                        .padding(13)
                        .frame(width: 184, alignment: .leading)
                        .background(Color(uiColor: .secondarySystemGroupedBackground),
                                    in: RoundedRectangle(cornerRadius: 16))
                    }
                }
            }
        }
        .scrollIndicators(.hidden)
    }

    private var monthView: some View {
        let firstDay = periodStart
        let offset = (calendar.component(.weekday, from: firstDay) + 5) % 7
        let count = calendar.range(of: .day, in: .month, for: firstDay)?.count ?? 30
        let cells = ((offset + count + 6) / 7) * 7
        return VStack(spacing: 9) {
            HStack {
                ForEach(["Пн","Вт","Ср","Чт","Пт","Сб","Вс"], id: \.self) { label in
                    Text(label).font(.caption2.weight(.medium)).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 7), spacing: 5) {
                ForEach(0..<cells, id: \.self) { index in
                    if let date = calendar.date(byAdding: .day, value: index - offset, to: firstDay) {
                        let inside = calendar.isDate(date, equalTo: firstDay, toGranularity: .month)
                        let matching = inside ? events(on: date) : []
                        Button {
                            anchor = date
                            zoom = .day
                        } label: {
                            VStack(spacing: 7) {
                                Text("\(calendar.component(.day, from: date))")
                                    .font(.system(size: 12, weight: calendar.isDateInToday(date) ? .bold : .regular))
                                    .foregroundStyle(inside ? Color.primary : Color.secondary.opacity(0.32))
                                HStack(spacing: 2) {
                                    ForEach(Array(matching.prefix(3)), id: \.id) { task in
                                        Circle().fill(sectorTint(task)).frame(width: 5, height: 5)
                                    }
                                }
                                .frame(height: 7)
                                if matching.count > 3 {
                                    Text("+\(matching.count - 3)").font(.system(size: 9))
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .frame(maxWidth: .infinity, minHeight: 54)
                            .background(calendar.isDateInToday(date) ? Color.accentColor.opacity(0.10) : Color.clear,
                                        in: RoundedRectangle(cornerRadius: 9))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            Text("Нажми на день, чтобы открыть его расписание")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding(13)
        .background(Color(uiColor: .secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 21))
    }
}
