import SwiftUI

enum NativeTimelineZoom: String, CaseIterable {
    case day = "День"
    case week = "Неделя"
    case month = "Месяц"
}

struct NativeTaskTimelineView: View {
    let tasks: [RemoteTask]
    let spheres: [RemoteSphere]
    let onOpenTask: (RemoteTask) -> Void
    let overdueCount: Int
    let onOpenOverdue: () -> Void

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

    private var dayView: some View {
        VStack(spacing: 0) {
            let all = events(on: anchor)
            if all.isEmpty {
                Label("Нет задач с дедлайном на этот день", systemImage: "calendar.badge.clock")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 28)
            } else {
                ForEach(0..<24, id: \.self) { hour in
                    let matching = all.filter {
                        guard let due = NativeTaskDates.parse($0.dueDate) else { return false }
                        return calendar.component(.hour, from: due) == hour
                    }
                    HStack(alignment: .top, spacing: 10) {
                        Text(String(format: "%02d:00", hour))
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                            .frame(width: 43, alignment: .trailing)
                        VStack(spacing: 7) {
                            if matching.isEmpty {
                                Rectangle().fill(Color.secondary.opacity(0.12)).frame(height: 1)
                            } else {
                                ForEach(matching) { task in taskCard(task) }
                            }
                        }
                        .padding(.bottom, matching.isEmpty ? 12 : 9)
                    }
                }
            }
        }
        .padding(15)
        .background(Color(uiColor: .secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 21))
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
