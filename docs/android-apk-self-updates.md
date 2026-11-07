# Публикация и обновление Android APK через сайт Планировыча

APK хранится как публичный файл GitHub Release, не на временном диске Timeweb. Сайт и приложение автоматически получают информацию о последней версии через сервер.

## Первый подписанный APK

1. После объединения PR в main в Android Studio выполните Git → Pull и откройте папку android-app.
2. Выберите Build → Generate Signed App Bundle / APK → APK. Создайте новый keystore (.jks) ВНЕ Git-репозитория. Сохраните keystore, alias и пароли в надёжном отдельном месте и сделайте офлайн-копию.
3. Соберите универсальный **release** APK, не debug. Проверьте APK через Build → Analyze APK или apksigner verify --verbose --print-certs.
4. Для первого выпуска package ID = ru.planirovych.app, versionCode = 2, versionName = 1.0.0.
5. Переименуйте готовый файл в planirovych-android.apk.
6. Откройте https://github.com/andreymikhailovvv-sys/bubble_task_manager/releases → Draft a new release. Создайте тег android-v2, заголовок «Планировыч 1.0.0», впишите изменения, прикрепите planirovych-android.apk. Нажмите Publish release (не pre-release).
7. Откройте https://planirovych.ru/android . Через максимум пять минут появится доступная версия и кнопка «Скачать APK». Проверка: https://planirovych.ru/api/android/latest , а скачивание: https://planirovych.ru/api/android/download .

До первой публикации сайт показывает «APK готовится к публикации», не фиктивную ссылку.

## Каждая следующая версия

1. Увеличьте versionCode в android-app/app/build.gradle.kts (3, затем 4, 5 ...); обновите versionName.
2. Соберите подписанный release APK тем же keystore и alias. Ни при каких обстоятельствах не создавайте другой ключ для обновления.
3. Проверьте package ID, versionCode и сертификат подписи; переименуйте APK в planirovych-android.apk.
4. Опубликуйте НОВЫЙ GitHub Release, например тег android-v3 для versionCode=3 и заголовок с новой версией, добавьте APK. Старые выпуски и их файлы не перезаписывайте.
5. Сайт автоматически начнёт отдавать новейший выпуск; Android-приложение предложит обновление при открытии или после фоновой проверки. Пользователь подтверждает установку через Android.

## Необязательная подпись через Gradle

Для автоматической подписи можно задать вне репозитория четыре переменные окружения или Gradle properties: PLANIROVYCH_RELEASE_STORE_FILE, PLANIROVYCH_RELEASE_STORE_PASSWORD, PLANIROVYCH_RELEASE_KEY_ALIAS, PLANIROVYCH_RELEASE_KEY_PASSWORD. Все четыре обязательны, если используется автоматический режим. Не коммитьте секреты и keystore.

## Важные условия

- Debug APK имеет другой package ID: ru.planirovych.app.debug. Она не обновится поверх до release. Для старых тестовых установок нужен разовый переход на официальное приложение.
- Release APK можно обновлять поверх только при одинаковом package ID, совпадающем сертификате и более высоком versionCode.
- Разрешение установки из браузера и подтверждение установки контролирует Android. Незаметная автоматическая установка не реализуется.
- Новые GitHub Releases должны иметь точные теги android-vN, а вложения точное имя planirovych-android.apk. Сервер НЕ проверяет содержимое APK: перед публикацией вы обязаны проверить подпись и versionCode.
- Сайт/приложение используют только публичные выпуски из этого репозитория; произвольные ссылки не принимаются.
- С учётом глобального расширения Android developer verification в 2027 году стоит зарегистрировать приложение и разработчика.
