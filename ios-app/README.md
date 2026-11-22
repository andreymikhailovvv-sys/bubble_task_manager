# Планировыч для iPhone (SwiftUI demo)

The first milestone is a **real native SwiftUI application** targeting iOS 17 and newer. It lives independently from the Android and web clients in `ios-app/`.

## What works

- Native overview with a decorative bubble workspace and completion counters.
- Tasks: category filter, add a task, mark it completed.
- Habits: mark a habit completed and view progress.
- A separate Economic module placeholder.
- Light and dark system appearances.

**This is offline sample data, not the user's real tasks.** State resets when the app is relaunched. No credentials are stored, no API calls are made and financial data is not loaded. The next milestone can add authentication and the existing API at `https://planirovych.ru/`.

## Build on GitHub (no personal Mac required)

Open Actions → **iOS SwiftUI demo** on a pull request or run it manually via **Run workflow**. The job:

1. Selects a hosted macOS runner with Xcode.
2. Installs XcodeGen and generates the Xcode project from `project.yml`.
3. Builds an **unsigned iOS Simulator app**, saving `Planirovych-iOS-Simulator.zip`.
4. Attempts to boot an iPhone Simulator, launch the app and upload `Planirovych-preview.png`.

The screenshot step is best-effort because simulator runtimes can vary on GitHub-hosted runners; failing to boot a simulator should not invalidate a successful compile.

**Simulator builds cannot be installed on a physical iPhone.** For a real device, a separate `iphoneos` build and Apple code signing / provisioning will be required. Neither Apple Developer membership nor a MacBook is required to obtain the initial Simulator build and preview.

## Local build on macOS (optional)

Install Xcode and XcodeGen, then run:

```sh
cd ios-app
xcodegen generate
xcodebuild -project Planirovych.xcodeproj -scheme Planirovych \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

No changes to production services or Android code are needed for this demo.
