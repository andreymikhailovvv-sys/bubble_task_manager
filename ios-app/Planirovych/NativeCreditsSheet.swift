import SwiftUI

struct NativeCreditsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: NativeWorkspaceSession
    @State private var balance: CreditBalance?
    @State private var statistics: CreditUsageStatistics?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var selectedTab = 0

    private var accent: Color { Color(red: 0.53, green: 0.39, blue: 0.89) }
    private var currentCredits: Double {
        if let balance { return Double(balance.aiCreditsMilli) / 1000 }
        return Double(session.account?.aiCredits ?? 0)
    }
    private var number: FloatingPointFormatStyle<Double> {
        .number.precision(.fractionLength(0...2))
            .locale(Locale(identifier: "ru_RU"))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 17) {
                    VStack(spacing: 10) {
                        Image(systemName: "circle.hexagongrid.fill")
                            .font(.system(size: 31))
                            .foregroundStyle(accent)
                        Text(session.account?.subscriptionLimit?.planName ?? "Баланс ИИ-кредитов")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text(session.account?.subscriptionLimit.map { "\($0.remainingPercent)%" } ?? currentCredits.formatted(number))
                            .font(.system(size: 41, weight: .bold, design: .rounded))
                            .monospacedDigit()
                        Text(session.account?.subscriptionLimit == nil ? "Доступно кредитов" : "Осталось месячного лимита")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let limit = session.account?.subscriptionLimit {
                            ProgressView(value: Double(limit.remainingPercent), total: 100).tint(accent)
                                .padding(.horizontal, 24)
                            Text("Использовано \(limit.usedPercent)% · до \(String(limit.expiresAt.prefix(10)))")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 23)
                    .background(Color(uiColor: .secondarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: 23))

                    if session.account?.subscriptionLimit == nil {
                    Picker("Раздел", selection: $selectedTab) {
                        Text("Обзор").tag(0)
                        Text("Статистика").tag(1)
                    }
                    .pickerStyle(.segmented)

                    if let stats = statistics {
                        if selectedTab == 0 {
                            HStack(spacing: 10) {
                                metric("Сегодня", stats.todayCreditsMilli)
                                metric("За неделю", stats.weekCreditsMilli)
                            }
                            HStack(spacing: 10) {
                                metric("За месяц", stats.monthCreditsMilli)
                                metric("В среднем за день", stats.averageDailyCreditsMilli)
                            }
                        } else {
                            breakdown("По функциям", stats.byFeature)
                            breakdown("По моделям", stats.byModel)
                        }
                    } else if isLoading {
                        ProgressView("Загружаем статистику…").padding()
                    }
                    }
                    if let errorMessage {
                        Label(errorMessage, systemImage: "exclamationmark.triangle")
                            .font(.footnote).foregroundStyle(.orange)
                    }
                }
                .padding(18)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle(session.account?.subscriptionLimit == nil ? "ИИ-кредиты" : "Лимит ИИ")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button { Task { await load() } } label: { Image(systemName: "arrow.clockwise") }
                        .disabled(isLoading)
                        .accessibilityLabel("Обновить кредиты")
                }
            }
        }
        .task { await load() }
    }

    private func metric(_ title: String, _ value: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text((Double(value) / 1000).formatted(number))
                .font(.title2.bold())
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(uiColor: .secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 17))
    }

    private func breakdown(_ title: String, _ items: [CreditUsageItem]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.headline)
            if items.isEmpty {
                Text("Расходов пока нет").font(.footnote).foregroundStyle(.secondary)
            } else {
                ForEach(items) { item in
                    HStack {
                        Text(item.label).font(.subheadline).lineLimit(2)
                        Spacer(minLength: 8)
                        Text((Double(item.creditsMilli) / 1000).formatted(number))
                            .font(.subheadline.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(uiColor: .secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 17))
    }

    private func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let api = NativeAPI()
            await session.refreshAiBalance()
            if session.account?.subscriptionLimit != nil { errorMessage = nil; return }
            async let wallet = api.creditBalance()
            async let usage = api.creditStatistics()
            balance = try await wallet
            statistics = try await usage
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
