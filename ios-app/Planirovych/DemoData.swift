import SwiftUI

// This first build is intentionally offline. No real account or financial data is used.
enum TaskArea: String, CaseIterable, Identifiable {
    case work = "Работа"
    case personal = "Личное"
    case ideas = "Идеи"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .work: return "briefcase.fill"
        case .personal: return "heart.fill"
        case .ideas: return "lightbulb.fill"
        }
    }

    var tint: Color {
        switch self {
        case .work: return Color(red: 0.52, green: 0.48, blue: 0.96)
        case .personal: return Color(red: 0.22, green: 0.71, blue: 0.62)
        case .ideas: return Color(red: 0.95, green: 0.66, blue: 0.31)
        }
    }
}

struct DemoTask: Identifiable {
    let id: UUID
    var title: String
    var area: TaskArea
    var due: String
    var completed: Bool

    init(title: String, area: TaskArea, due: String, completed: Bool = false) {
        self.id = UUID()
        self.title = title
        self.area = area
        self.due = due
        self.completed = completed
    }
}

struct DemoHabit: Identifiable {
    let id = UUID()
    var title: String
    var symbol: String
    var streak: Int
    var completed: Bool
}

@MainActor
final class DemoStore: ObservableObject {
    @Published var tasks: [DemoTask] = [
        DemoTask(title: "Подготовить презентацию проекта", area: .work, due: "Сегодня"),
        DemoTask(title: "Проверить новые задачи", area: .work, due: "Сегодня"),
        DemoTask(title: "Запланировать выходные", area: .personal, due: "Завтра"),
        DemoTask(title: "Записать идею для Планика", area: .ideas, due: "Без даты", completed: true)
    ]

    @Published var habits: [DemoHabit] = [
        DemoHabit(title: "Чтение", symbol: "book.closed.fill", streak: 7, completed: true),
        DemoHabit(title: "Зарядка", symbol: "figure.run", streak: 4, completed: false),
        DemoHabit(title: "Планирование", symbol: "calendar", streak: 12, completed: true)
    ]

    var completedTaskCount: Int { tasks.filter(\.completed).count }
    var completedHabitCount: Int { habits.filter(\.completed).count }

    func toggleTask(id: UUID) {
        guard let index = tasks.firstIndex(where: { $0.id == id }) else { return }
        tasks[index].completed.toggle()
    }

    func toggleHabit(id: UUID) {
        guard let index = habits.firstIndex(where: { $0.id == id }) else { return }
        habits[index].completed.toggle()
    }

    func addTask(title: String, area: TaskArea) {
        let cleaned = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return }
        tasks.insert(DemoTask(title: cleaned, area: area, due: "Сегодня"), at: 0)
    }
}
