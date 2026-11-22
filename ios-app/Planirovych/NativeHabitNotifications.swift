import Foundation
import UserNotifications

/// Schedules real local iOS alerts for the saved habit reminder times.
/// Daily/weekday rules repeat indefinitely. Interval rules use a rolling
/// 40-day window, rescheduled whenever the workspace is refreshed.
@MainActor
enum NativeHabitNotifications {
    private static let prefix = "planirovych.habit."

    static func requestAndSync(_ habits: [RemoteHabit]) async -> Bool {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if granted { await sync(habits) }
        return granted
    }

    static func syncIfAuthorized(_ habits: [RemoteHabit]) async {
        let center = UNUserNotificationCenter.current()
        let settings: UNNotificationSettings = await withCheckedContinuation { (continuation: CheckedContinuation<UNNotificationSettings, Never>) in
            center.getNotificationSettings { continuation.resume(returning: $0) }
        }
        if settings.authorizationStatus == .authorized ||
            settings.authorizationStatus == .provisional ||
            settings.authorizationStatus == .ephemeral {
            await sync(habits)
        }
    }

    private static func sync(_ habits: [RemoteHabit]) async {
        let center = UNUserNotificationCenter.current()
        let existing: [UNNotificationRequest] = await withCheckedContinuation { (continuation: CheckedContinuation<[UNNotificationRequest], Never>) in
            center.getPendingNotificationRequests { continuation.resume(returning: $0) }
        }
        center.removePendingNotificationRequests(
            withIdentifiers: existing.filter { $0.identifier.hasPrefix(prefix) }.map(\.identifier)
        )

        for habit in habits where habit.isArchived != true && habit.isAutoCompleted != true {
            let times = habit.reminderTimes?.isEmpty == false
                ? habit.reminderTimes ?? [] : (habit.reminderTime.map { [$0] } ?? [])
            for (index, time) in times.enumerated() {
                let parts = time.split(separator: ":")
                guard parts.count == 2,
                      let hour = Int(parts[0]), let minute = Int(parts[1]),
                      (0...23).contains(hour), (0...59).contains(minute) else { continue }
                let body = UNMutableNotificationContent()
                body.title = "Планировыч · \(habit.name)"
                body.body = "Пора отметить привычку \(habit.icon)"
                body.sound = .default
                let tag = prefix + habit.id + "." + String(index) + "."

                switch habit.recurrenceType {
                case "WEEKDAYS":
                    for weekday in habit.weekdays where (0...6).contains(weekday) {
                        let match = DateComponents(hour: hour, minute: minute, weekday: weekday + 1)
                        let trigger = UNCalendarNotificationTrigger(dateMatching: match, repeats: true)
                        let request = UNNotificationRequest(identifier: tag + String(weekday),
                                                            content: body, trigger: trigger)
                        try? await center.add(request)
                    }
                case "INTERVAL":
                    var planned = 0
                    let start = Calendar.current.startOfDay(for: Date())
                    for offset in 0..<40 {
                        if planned >= 12 { break }
                        guard let date = Calendar.current.date(byAdding: .day, value: offset, to: start),
                              HabitCalendar.scheduled(habit, on: date) else { continue }
                        var components = Calendar.current.dateComponents([.year, .month, .day], from: date)
                        components.hour = hour
                        components.minute = minute
                        guard let fireAt = Calendar.current.date(from: components),
                              fireAt > Date() else { continue }
                        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
                        try? await center.add(UNNotificationRequest(
                            identifier: tag + HabitCalendar.dateKey(date), content: body, trigger: trigger))
                        planned += 1
                    }
                default:
                    let match = DateComponents(hour: hour, minute: minute)
                    let trigger = UNCalendarNotificationTrigger(dateMatching: match, repeats: true)
                    try? await center.add(UNNotificationRequest(
                        identifier: tag + "daily", content: body, trigger: trigger))
                }
            }
        }
    }
}
