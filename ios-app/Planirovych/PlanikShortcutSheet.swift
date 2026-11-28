import SwiftUI
import AVFoundation
import WebKit

struct PlanikShortcutSheet: View {
    @ObservedObject var session: NativeWorkspaceSession
    let mode: PlanikShortcutMode
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var recorder = ChatVoiceRecorder()
    @State private var stage = "listening"
    @State private var question = ""
    @State private var answer: RemoteChatMessage?
    @State private var error: String?
    @State private var sendTask: Task<Void, Never>?
    @State private var detent: PresentationDetent = .fraction(0.48)
    @State private var liveCookies: [HTTPCookie] = []
    @State private var liveReady = false
    @State private var ownerID: String?
    private let accent = Color(red: 0.55, green: 0.43, blue: 0.91)

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Label(mode == .voice ? "Планик" : "Живое общение", systemImage: "sparkles")
                    .font(.headline)
                    .foregroundStyle(accent)
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark.circle.fill").font(.title2)
                        .foregroundStyle(.secondary)
                }.accessibilityLabel("Закрыть")
            }
            if mode == .live {
                if liveReady {
                    PlanikLiveWebPanel(cookies: liveCookies, onEnd: { dismiss() },
                                      onError: { error = $0 })
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if error == nil {
                    Spacer()
                    ProgressView("Подключаю живое общение…")
                    Spacer()
                }
            } else if stage == "listening" {
                recordingView
            } else if stage == "working" {
                Spacer(minLength: 0)
                mascot(active: true)
                Text(progressLabel).font(.headline)
                ProgressView().tint(accent)
                if !session.chatStreamText.isEmpty {
                    ScrollView { markdown(session.chatStreamText).frame(maxWidth: .infinity, alignment: .leading) }
                        .frame(maxHeight: 120)
                }
                Spacer(minLength: 0)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if !question.isEmpty { Text(question).font(.footnote).foregroundStyle(.secondary) }
                        if let answer {
                            markdown(answer.content).frame(maxWidth: .infinity, alignment: .leading)
                            if let proposal = answer.taskProposal {
                                NativeAIProposalChip(session: session, proposal: proposal, economic: false)
                            }
                            ForEach(answer.economicProposals ?? []) { proposal in
                                NativeAIProposalChip(session: session, proposal: proposal, economic: true)
                            }
                            if let doc = answer.generatedDocument, doc.isImage {
                                NativeGeneratedImageCard(document: doc)
                            }
                            if answer.assistantSettingsProposalId != nil || answer.generatedDocument != nil ||
                                answer.telegramSuggestedReply != nil || answer.mailSuggestedReply != nil {
                                Text("Остальные материалы доступны в общем ИИ-чате «Быстрые запросы».")
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
                .scrollIndicators(.hidden)
                Button("Готово") { dismiss() }
                    .buttonStyle(.borderedProminent).tint(accent)
                    .frame(maxWidth: .infinity)
            }
            if let message = error ?? recorder.errorMessage {
                Label(message, systemImage: "exclamationmark.triangle")
                    .font(.footnote).foregroundStyle(.orange)
            }
        }
        .padding(20)
        .padding(.top, 8)
        .presentationDetents([.fraction(0.48), .fraction(0.66), .large], selection: $detent)
        .presentationDragIndicator(.visible)
        .presentationContentInteraction(.resizes)
        .sensoryFeedback(.impact(weight: .light), trigger: stage)
        .task {
            ownerID = session.account?.id
            guard ownerID != nil else { dismiss(); return }
            if mode == .voice {
                guard !session.isSendingChat else { error = "Дождитесь завершения текущего запроса."; return }
                await recorder.start()
                // Endpointer uses meter activity, not speech recognition. Ignore
                // initial silence and retain an explicit Send button.
                var heard: TimeInterval = 0
                var lastSound: Date?
                while !Task.isCancelled && recorder.isRecording && stage == "listening" {
                    let now = Date()
                    if recorder.level > 0.13 {
                        heard += 0.04
                        if heard >= 0.24 { lastSound = now }
                    }
                    if let lastSound, now.timeIntervalSince(lastSound) >= 1.8 {
                        submit(); break
                    }
                    if let started = recorder.startedAt, now.timeIntervalSince(started) >= 118.5 {
                        if heard >= 0.24 { submit() } else { recorder.cancel(); error = "Речь не обнаружена." }
                        break
                    }
                    try? await Task.sleep(for: .milliseconds(40))
                }
            } else {
                detent = .fraction(0.66)
                do {
                    guard let account = try await NativeAPI().restoreAccount(), account.id == ownerID,
                          session.account?.id == ownerID, !Task.isCancelled else {
                        error = "Войдите в Планировыч для живого общения."; return
                    }
                    let origin = URL(string: "https://planirovych.ru/")!
                    let cookies = (HTTPCookieStorage.shared.cookies(for: origin) ?? []).filter {
                        ["btm_auth", "btm_device"].contains($0.name) &&
                        ($0.domain == "planirovych.ru" || $0.domain == ".planirovych.ru")
                    }
                    guard cookies.contains(where: { $0.name == "btm_auth" }) else {
                        error = "Не удалось восстановить сессию."; return
                    }
                    liveCookies = cookies
                    liveReady = true
                } catch { self.error = error.localizedDescription }
            }
        }
        .onChange(of: session.account?.id) { _, id in
            if id != ownerID { dismiss() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { recorder.cancel(); dismiss() }
        }
        .onDisappear { recorder.cancel(); sendTask?.cancel() }
    }

    private var recordingView: some View {
        VStack(spacing: 10) {
            Spacer(minLength: 0)
            mascot(active: recorder.isRecording)
            Text(recorder.isRecording ? "Слушаю…" : "Подключаю микрофон…")
                .font(.headline)
            TimelineView(.animation) { timeline in
                HStack(spacing: 3) {
                    ForEach(0..<29) { index in
                        let wave = 0.5 + 0.5 * sin(timeline.date.timeIntervalSinceReferenceDate * 8 + Double(index) * 0.48)
                        let envelope = 1 - abs(Double(index) - 14) / 16
                        Capsule().fill(LinearGradient(colors: [accent, .cyan], startPoint: .top, endPoint: .bottom))
                            .frame(width: 3, height: 5 + CGFloat(wave * envelope) * (8 + recorder.level * 28))
                    }
                }.frame(height: 42)
            }.animation(.easeOut(duration: 0.12), value: recorder.level)
            TimelineView(.periodic(from: .now, by: 1)) { timeline in
                let elapsed = max(0, Int(timeline.date.timeIntervalSince(recorder.startedAt ?? timeline.date)))
                Text(String(format: "%02d:%02d", elapsed / 60, elapsed % 60))
                    .monospacedDigit().font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            HStack {
                Button("Отмена") { recorder.cancel(); dismiss() }
                    .buttonStyle(.bordered).frame(maxWidth: .infinity)
                Button("Отправить") { submit() }
                    .buttonStyle(.borderedProminent).tint(accent)
                    .disabled(!recorder.isRecording).frame(maxWidth: .infinity)
            }.controlSize(.large)
        }
    }

    private func mascot(active: Bool) -> some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { timeline in
            let time = timeline.date.timeIntervalSinceReferenceDate
            ZStack {
                Circle().fill(accent.opacity(0.12)).frame(width: 104, height: 104)
                Circle().stroke(accent.opacity(0.25), lineWidth: 1)
                    .frame(width: 104 + recorder.level * 14, height: 104 + recorder.level * 14)
                Image(systemName: active ? "waveform.circle.fill" : "sparkles")
                    .font(.system(size: 58, weight: .medium))
                    .foregroundStyle(LinearGradient(colors: [accent, .cyan], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .offset(y: CGFloat(sin(time * 2)) * 3)
            }.frame(height: 115)
        }
    }

    private var progressLabel: String {
        switch session.chatProgressStatus {
        case "searching_tasks": return "Ищу задачи"
        case "searching_notes": return "Ищу заметки"
        case "forming_answer": return "Формирую ответ"
        case "applying_changes": return "Вношу изменения"
        default: return "Обрабатываю запрос"
        }
    }

    private func markdown(_ value: String) -> Text {
        Text((try? AttributedString(markdown: value, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(value))
    }

    private func submit() {
        guard stage == "listening", let recording = recorder.stop() else { return }
        stage = "working"
        error = nil
        sendTask = Task { @MainActor in
            do {
                let text = try await session.transcribeVoice(data: recording.data, duration: recording.duration)
                guard !Task.isCancelled, session.account?.id == ownerID else { return }
                let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !cleaned.isEmpty else { error = "Не удалось распознать запрос."; stage = "done"; return }
                question = cleaned
                let ok = await session.sendQuickVoiceRequest(cleaned)
                guard !Task.isCancelled, session.account?.id == ownerID else { return }
                if ok { answer = session.chatMessages.last(where: { $0.role == "assistant" }) }
                else { error = session.chatError ?? "Не удалось отправить запрос." }
                withAnimation(.easeInOut(duration: 0.3)) { detent = .fraction(0.66); stage = "done" }
            } catch {
                if !Task.isCancelled { self.error = error.localizedDescription; stage = "done" }
            }
        }
    }
}

/// Isolated, first-party WebKit renderer for the existing realtime experience.
/// No shared browser cookie store, no cross-origin navigation or mic grants.
private struct PlanikLiveWebPanel: UIViewRepresentable {
    let cookies: [HTTPCookie]
    let onEnd: () -> Void
    let onError: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onEnd: onEnd, onError: onError) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        web.alpha = 0
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        context.coordinator.start(web, cookies: cookies)
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        coordinator.stop()
        uiView.navigationDelegate = nil
        uiView.uiDelegate = nil
        uiView.stopLoading()
        uiView.loadHTMLString("", baseURL: nil)
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let onEnd: () -> Void
        let onError: (String) -> Void
        private var work: Task<Void, Never>?
        private var stopped = false
        private var ready = false

        init(onEnd: @escaping () -> Void, onError: @escaping (String) -> Void) {
            self.onEnd = onEnd; self.onError = onError
        }

        func start(_ web: WKWebView, cookies: [HTTPCookie]) {
            work = Task { @MainActor [weak self, weak web] in
                guard let self, let web else { return }
                let store = web.configuration.websiteDataStore.httpCookieStore
                for cookie in cookies { await store.setCookie(cookie) }
                guard !Task.isCancelled, !stopped else { return }
                web.load(URLRequest(url: URL(string: "https://planirovych.ru/android-planik?openPlanik=1")!))
                let deadline = Date().addingTimeInterval(40)
                var missing = 0
                while !Task.isCancelled && !stopped {
                    try? await Task.sleep(for: .milliseconds(300))
                    guard !Task.isCancelled, !stopped else { return }
                    let script = """
                    (function(){
                      if(!document.head)return 'pending';
                      if(!document.getElementById('ios-planik-panel')){
                        var style=document.createElement('style');style.id='ios-planik-panel';
                        style.textContent='html,body{background:transparent!important}body *{visibility:hidden!important;pointer-events:none!important}.planik-live-fullscreen,.planik-live-fullscreen *,.planik-live-compact,.planik-live-compact *{visibility:visible!important;pointer-events:auto!important}.planik-live-fullscreen{background:transparent!important}.planik-live-fullscreen::before{display:none!important}.planik-live-stage{height:100%!important;padding:4px!important}.planik-live-header{display:none!important}.planik-live-center{gap:4px!important;justify-content:center!important}.planik-live-avatar{width:120px!important;height:110px!important;margin:auto!important}.planik-live-transcript{max-height:28vh!important}.planik-live-caption{display:none!important}.planik-live-footer{padding:4px!important}';
                        document.head.appendChild(style);
                      }
                      return document.querySelector('.planik-live-fullscreen,.planik-live-compact')?'live':(document.documentElement.dataset.planikAndroid||'pending');
                    })()
                    """
                    let state = (try? await web.evaluateJavaScript(script)) as? String
                    if state == "live" {
                        missing = 0
                        if !ready { ready = true; UIView.animate(withDuration: 0.22) { web.alpha = 1 } }
                    } else if state == "ended" {
                        onEnd(); return
                    } else if state == "error" || (!ready && Date() > deadline) {
                        onError("Не удалось запустить живое общение. Проверьте микрофон и соединение.")
                        stop(); web.stopLoading(); web.loadHTMLString("", baseURL: nil); return
                    } else if ready {
                        missing += 1
                        if missing >= 5 { onEnd(); return }
                    }
                }
            }
        }

        func stop() { stopped = true; work?.cancel(); work = nil }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            if url.scheme == "about" && stopped { decisionHandler(.allow); return }
            let firstParty = url.scheme == "https" && url.host == "planirovych.ru" &&
                (url.port == nil || url.port == 443)
            let mainAllowed = navigationAction.targetFrame?.isMainFrame == true && url.path == "/android-planik"
            decisionHandler(firstParty && mainAllowed ? .allow : .cancel)
        }

        func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                     initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                     decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            let allowed = !stopped && frame.isMainFrame && origin.host == "planirovych.ru" &&
                frame.request.url?.scheme == "https" && (origin.port == 0 || origin.port == 443) &&
                type == .microphone
            decisionHandler(allowed ? .prompt : .deny)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
                     withError error: Error) {
            if !stopped { onError("Не удалось подключиться к Планикову голосовому сервису."); stop() }
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            if !stopped { onError("Голосовой компонент остановился. Вызовите Планика снова."); stop() }
        }
    }
}
