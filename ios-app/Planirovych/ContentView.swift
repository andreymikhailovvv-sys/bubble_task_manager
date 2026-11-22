import SwiftUI

private enum DemoTab: String, CaseIterable, Identifiable {
    case overview = "Общая"
    case tasks = "Задачи"
    case habits = "Привычки"
    case economic = "Экономыч"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .overview: return "square.grid.2x2.fill"
        case .tasks: return "checklist"
        case .habits: return "circle.hexagongrid.fill"
        case .economic: return "rublesign.circle.fill"
        }
    }
}

struct DemoDashboardView: View {
    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var store = DemoStore()
    @State private var selectedTab: DemoTab = .overview
    @State private var selectedArea: TaskArea?
    @State private var presentingNewTask = false

    // Used only to select the initial screen in CI's simulator screenshots.
    // Regular launches still start on the overview.
    init(previewTabName: String? = nil) {
        let tab: DemoTab
        switch previewTabName {
        case "tasks": tab = .tasks
        case "habits": tab = .habits
        case "economic": tab = .economic
        default: tab = .overview
        }
        _selectedTab = State(initialValue: tab)
    }

    private var dark: Bool { colorScheme == .dark }
    private var background: Color {
        dark ? Color(red: 0.075, green: 0.085, blue: 0.13) : Color(red: 0.95, green: 0.96, blue: 0.985)
    }
    private var cardBackground: Color {
        dark ? Color(red: 0.14, green: 0.15, blue: 0.22) : .white
    }
    private var secondaryText: Color { dark ? .white.opacity(0.64) : .black.opacity(0.55) }
    private let violet = Color(red: 0.55, green: 0.49, blue: 0.97)

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    switch selectedTab {
                    case .overview: overviewContent
                    case .tasks: tasksContent
                    case .habits: habitsContent
                    case .economic: economicContent
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 22)
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)

            bottomNavigation
        }
        .background(background.ignoresSafeArea())
        .sheet(isPresented: $presentingNewTask) {
            NewDemoTaskSheet { title, area in
                store.addTask(title: title, area: area)
            }
            .presentationDetents([.medium])
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 14)
                    .fill(violet.opacity(0.16))
                    .frame(width: 44, height: 44)
                Image(systemName: "sparkles.rectangle.stack.fill")
                    .font(.system(size: 22, weight: .medium))
                    .foregroundStyle(violet)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Планировыч")
                    .font(.system(size: 23, weight: .bold, design: .rounded))
                Text("Нативный iOS • демо")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(secondaryText)
            }
            Spacer()
            Button {
                presentingNewTask = true
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.primary)
                    .frame(width: 42, height: 42)
                    .background(cardBackground, in: Circle())
            }
            .accessibilityLabel("Добавить демо-задачу")
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 14)
        .background(background)
    }

    private var overviewContent: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Ваш день, под контролем")
                    .font(.system(size: 27, weight: .bold, design: .rounded))
                    .fixedSize(horizontal: false, vertical: true)
                Text("Первый взгляд на Планировыч для iPhone")
                    .font(.subheadline)
                    .foregroundStyle(secondaryText)
                Text("ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.2)
                    .foregroundStyle(violet)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(violet.opacity(0.12), in: Capsule())
                    .padding(.top, 4)
            }

            HStack(spacing: 12) {
                metricCard(title: "Задачи", value: "\(store.completedTaskCount)/\(store.tasks.count)", symbol: "checkmark.circle.fill", tint: violet)
                metricCard(title: "Привычки", value: "\(store.completedHabitCount)/\(store.habits.count)", symbol: "flame.fill", tint: .orange)
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text("Пространство задач")
                        .font(.headline)
                    Spacer()
                    Text("Демо")
                        .font(.caption)
                        .foregroundStyle(secondaryText)
                }
                bubbleCanvas
            }
            .padding(18)
            .background(cardBackground, in: RoundedRectangle(cornerRadius: 24))

            HStack {
                Text("Ближайшие задачи")
                    .font(.headline)
                Spacer()
                Button("Все задачи") { selectedTab = .tasks }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(violet)
            }

            VStack(spacing: 10) {
                ForEach(store.tasks.prefix(3)) { task in
                    taskRow(task)
                }
            }
        }
    }

    private func metricCard(title: String, value: String, symbol: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(tint)
            Text(value)
                .font(.system(size: 29, weight: .bold, design: .rounded))
                .monospacedDigit()
            Text(title)
                .font(.caption)
                .foregroundStyle(secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(cardBackground, in: RoundedRectangle(cornerRadius: 22))
    }

    private var bubbleCanvas: some View {
        ZStack {
            Circle()
                .stroke(violet.opacity(0.13), lineWidth: 1.5)
                .frame(width: 230, height: 230)
            Circle()
                .stroke(violet.opacity(0.08), lineWidth: 1)
                .frame(width: 166, height: 166)

            bubble(title: "Работа", symbol: "briefcase.fill", color: TaskArea.work.tint, size: 115)
                .offset(x: -55, y: -40)
            bubble(title: "Личное", symbol: "heart.fill", color: TaskArea.personal.tint, size: 96)
                .offset(x: 75, y: -15)
            bubble(title: "Идеи", symbol: "lightbulb.fill", color: TaskArea.ideas.tint, size: 81)
                .offset(x: 8, y: 78)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 265)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Демонстрация пузырей: Работа, Личное, Идеи")
    }

    private func bubble(title: String, symbol: String, color: Color, size: CGFloat) -> some View {
        VStack(spacing: 6) {
            Image(systemName: symbol).font(.system(size: 23))
            Text(title).font(.system(size: 12, weight: .semibold))
        }
        .foregroundStyle(.white)
        .frame(width: size, height: size)
        .background(
            Circle().fill(
                LinearGradient(
                    colors: [color.opacity(0.96), color.opacity(0.64)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        )
        .overlay(Circle().stroke(.white.opacity(0.20), lineWidth: 1))
        .shadow(color: color.opacity(0.28), radius: 18, y: 8)
    }

    private var tasksContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            pageHeading(title: "Задачи", subtitle: "Создавай, отмечай и организуй")
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    filterButton("Все", selected: selectedArea == nil) { selectedArea = nil }
                    ForEach(TaskArea.allCases) { area in
                        filterButton(area.rawValue, selected: selectedArea == area) { selectedArea = area }
                    }
                }
            }
            .scrollIndicators(.hidden)

            let filtered = store.tasks.filter { selectedArea == nil || $0.area == selectedArea }
            if filtered.isEmpty {
                Text("В этой сфере пока нет задач")
                    .foregroundStyle(secondaryText)
                    .frame(maxWidth: .infinity)
                    .padding(28)
                    .background(cardBackground, in: RoundedRectangle(cornerRadius: 20))
            } else {
                ForEach(filtered) { task in taskRow(task) }
            }

            Button {
                presentingNewTask = true
            } label: {
                Label("Добавить задачу", systemImage: "plus.circle.fill")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(16)
                    .foregroundStyle(violet)
                    .background(violet.opacity(0.10), in: RoundedRectangle(cornerRadius: 18))
            }
        }
    }

    private func filterButton(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(selected ? .white : (dark ? Color.white : Color.primary))
                .padding(.horizontal, 17)
                .padding(.vertical, 11)
                .background(selected ? violet : cardBackground, in: Capsule())
        }
    }

    private func taskRow(_ task: DemoTask) -> some View {
        Button { store.toggleTask(id: task.id) } label: {
            HStack(spacing: 13) {
                Image(systemName: task.area.symbol)
                    .font(.system(size: 18))
                    .foregroundStyle(task.area.tint)
                    .frame(width: 42, height: 42)
                    .background(task.area.tint.opacity(0.13), in: RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 6) {
                    Text(task.title)
                        .font(.system(size: 14, weight: .semibold))
                        .strikethrough(task.completed)
                        .foregroundStyle(task.completed ? secondaryText : Color.primary)
                        .multilineTextAlignment(.leading)
                    Text("\(task.area.rawValue) · \(task.due)")
                        .font(.caption)
                        .foregroundStyle(secondaryText)
                }
                Spacer(minLength: 6)
                Image(systemName: task.completed ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 23))
                    .foregroundStyle(task.completed ? Color.green : secondaryText)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(cardBackground, in: RoundedRectangle(cornerRadius: 19))
        }
        .buttonStyle(.plain)
    }

    private var habitsContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            pageHeading(title: "Привычки", subtitle: "Маленькие шаги каждый день")
            VStack(alignment: .leading, spacing: 8) {
                Text("Сегодня выполнено")
                    .font(.subheadline)
                    .foregroundStyle(secondaryText)
                Text("\(store.completedHabitCount) из \(store.habits.count)")
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                ProgressView(value: Double(store.completedHabitCount), total: Double(store.habits.count))
                    .tint(.green)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(cardBackground, in: RoundedRectangle(cornerRadius: 22))

            HStack(alignment: .top, spacing: 6) {
                ForEach(store.habits) { habit in
                    Button {
                        store.toggleHabit(id: habit.id)
                    } label: {
                        VStack(spacing: 9) {
                            ZStack {
                                Circle()
                                    .stroke(habit.completed ? Color.green : violet.opacity(0.25), lineWidth: 5)
                                    .frame(width: 78, height: 78)
                                Image(systemName: habit.symbol)
                                    .font(.system(size: 24))
                                    .foregroundStyle(habit.completed ? Color.green : violet)
                            }
                            Text(habit.title)
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Color.primary)
                                .lineLimit(1)
                            Text("\(habit.streak) дн.")
                                .font(.caption2)
                                .foregroundStyle(secondaryText)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
            .background(cardBackground, in: RoundedRectangle(cornerRadius: 22))

            Text("Нажми на круг привычки, чтобы изменить её выполнение.")
                .font(.footnote)
                .foregroundStyle(secondaryText)
        }
    }

    private var economicContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            pageHeading(title: "Экономыч", subtitle: "Финансы под контролем")
            VStack(alignment: .leading, spacing: 14) {
                Image(systemName: "wallet.bifold.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(.orange)
                    .frame(width: 68, height: 68)
                    .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 20))
                Text("Нативный финансовый модуль")
                    .font(.title3.bold())
                Text("В этой демонстрации реальные счета и операции не загружаются. Подключим существующий API Экономыча на следующем этапе.")
                    .font(.subheadline)
                    .foregroundStyle(secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(22)
            .background(cardBackground, in: RoundedRectangle(cornerRadius: 24))
        }
    }

    private func pageHeading(title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title)
                .font(.system(size: 30, weight: .bold, design: .rounded))
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(secondaryText)
        }
    }

    private var bottomNavigation: some View {
        HStack(spacing: 4) {
            ForEach(DemoTab.allCases) { tab in
                Button { selectedTab = tab } label: {
                    VStack(spacing: 5) {
                        Image(systemName: tab.symbol)
                            .font(.system(size: 20, weight: .semibold))
                            .frame(height: 24)
                        Text(tab.rawValue)
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundStyle(selectedTab == tab ? violet : secondaryText)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selectedTab == tab ? [.isSelected] : [])
            }
        }
        .padding(.horizontal, 10)
        .background(cardBackground)
        .overlay(alignment: .top) { Divider().opacity(0.35) }
    }
}

private struct NewDemoTaskSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var area: TaskArea = .work
    let onSave: (String, TaskArea) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Новая задача") {
                    TextField("Название задачи", text: $title)
                        .submitLabel(.done)
                    Picker("Сфера", selection: $area) {
                        ForEach(TaskArea.allCases) { area in
                            Text(area.rawValue).tag(area)
                        }
                    }
                }
                Section {
                    Text("Это демо: изменения сохраняются только до закрытия приложения.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Добавить задачу")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Добавить") {
                        onSave(title, area)
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
