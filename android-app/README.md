# Планировыч для Android

Нативный Android-клиент существующего сервиса «Планировыч». Приложение написано на Kotlin и Jetpack Compose, не использует WebView и работает с тем же cookie-based API, что и веб-клиент.

## Требования

- Android Studio с JDK 17;
- Android SDK 36;
- minSdk 26, targetSdk 36, compileSdk 36;
- интернет для первой синхронизации Gradle.

## Открытие и запуск

1. В Android Studio выберите **Open** и укажите папку `android-app` (не корень npm-проекта).
2. Дождитесь Gradle Sync.
3. Выберите устройство или эмулятор с Android 8.0+ и нажмите **Run**.

Package id release-сборки: `ru.planirovych.app`. Версия: `0.1.0` (`versionCode 1`). Debug-вариант получает suffix `.debug`.

## Backend

Production URL задан единожды через `BuildConfig.API_BASE_URL` в `app/build.gradle.kts` и по умолчанию равен `https://planirovych.ru/`. Для локальной debug-сборки его можно заменить без правки исходников:

```bash
./gradlew assembleDebug -PAPI_BASE_URL=https://example.test/
```

URL обязан оканчиваться `/`. Секреты и API-ключи приложению не нужны. Серверные auth/device cookies сохраняются приложением между запусками.

## Сборка

```bash
./gradlew assembleDebug
./gradlew test
```

Debug APK появится в `app/build/outputs/apk/debug/app-debug.apk`.

Первый этап поддерживает сессию устройства, вход, регистрацию, выход, темы, поиск и чтение сфер, задач и привычек. Изменение данных, Timeline, AI, уведомления и прочие функции запланированы на следующие этапы.

### Gradle Wrapper в текстовом виде

Система ревью этого репозитория не принимает бинарные файлы в pull request. Поэтому официальный `gradle-wrapper.jar` хранится как текстовый `gradle-wrapper.jar.base64`. Скрипты `gradlew` и `gradlew.bat` автоматически восстанавливают игнорируемый JAR при первом запуске; вручную ничего создавать не требуется.
