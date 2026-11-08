package ru.planirovych.app.updates

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import ru.planirovych.app.BuildConfig
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * A user-initiated, signed APK download. Never silent-install and never use a
 * world-readable file:// URI or public Downloads storage.
 */
object AndroidApkInstaller {
    private const val DOWNLOAD_URL = "https://planirovych.ru/api/android/download"
    private const val MAX_APK_BYTES = 200L * 1024L * 1024L
    private const val APK_MIME = "application/vnd.android.package-archive"
    private const val CACHE_SUBDIRECTORY = "app-updates"

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .callTimeout(5, TimeUnit.MINUTES)
        .followRedirects(true)
        .followSslRedirects(false)
        .build()

    suspend fun download(
        context: Context,
        release: AndroidAppRelease,
        onProgress: (Int) -> Unit
    ): File = withContext(Dispatchers.IO) {
        check(!BuildConfig.DEBUG) { "Обновление APK доступно только в официальной версии" }
        val directory = File(context.cacheDir, CACHE_SUBDIRECTORY)
        if (!directory.isDirectory && !directory.mkdirs())
            throw IOException("Не удалось создать папку для обновления")

        // Only one candidate at a time. Old installer files must not accumulate.
        directory.listFiles()?.forEach { it.delete() }
        val partial = File(directory, "update.part")
        val destination = File(directory, "planirovych-update.apk")
        try {
            val request = Request.Builder().url(DOWNLOAD_URL)
                .header("Accept", APK_MIME)
                .header("Accept-Encoding", "identity")
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful)
                    throw IOException("Сервер обновлений вернул HTTP ${response.code}")
                // The API sends a redirect to the official public GitHub Release
                // asset. Do not install files returned by an unrelated host.
                val host = response.request.url.host.lowercase()
                if (response.request.url.scheme != "https" ||
                    host != "github.com" && host != "release-assets.githubusercontent.com" &&
                    host != "objects.githubusercontent.com")
                    throw IOException("Неожиданный источник файла обновления")

                val body = response.body ?: throw IOException("Пустой ответ при скачивании APK")
                val expected = body.contentLength()
                if (expected > MAX_APK_BYTES) throw IOException("Размер APK превышает допустимый")
                var downloaded = 0L
                var lastProgress = -1
                body.byteStream().use { source ->
                    partial.outputStream().buffered().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            currentCoroutineContext().ensureActive()
                            val count = source.read(buffer)
                            if (count == -1) break
                            downloaded += count
                            if (downloaded > MAX_APK_BYTES)
                                throw IOException("Размер APK превышает допустимый")
                            output.write(buffer, 0, count)
                            if (expected > 0L) {
                                val progress = ((downloaded * 100L) / expected).toInt().coerceIn(0, 100)
                                if (progress != lastProgress) {
                                    lastProgress = progress
                                    withContext(Dispatchers.Main) { onProgress(progress) }
                                }
                            }
                        }
                    }
                }
                if (downloaded == 0L || expected > 0L && expected != downloaded)
                    throw IOException("Файл APK скачан не полностью")
            }
            if (!partial.renameTo(destination))
                throw IOException("Не удалось подготовить установочный файл")
            verifyOfficialUpdate(context, destination, release.versionCode)
            destination
        } catch (error: Exception) {
            partial.delete()
            destination.delete()
            throw error
        }
    }

    /**
     * Parse APK manifest and signer before asking Android to install.
     * Android's package installer still performs its own signature verification.
     */
    @Suppress("DEPRECATION")
    private fun verifyOfficialUpdate(context: Context, file: File, expectedVersionCode: Int) {
        val pm = context.packageManager
        val flags = if (Build.VERSION.SDK_INT >= 28)
            PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val archive = pm.getPackageArchiveInfo(file.absolutePath, flags)
            ?: throw IOException("Файл не является корректной APK")
        if (archive.packageName != BuildConfig.APPLICATION_ID)
            throw IOException("APK принадлежит другому приложению")
        val archiveCode = if (Build.VERSION.SDK_INT >= 28) archive.longVersionCode
            else archive.versionCode.toLong()
        if (archiveCode != expectedVersionCode.toLong() ||
            archiveCode <= BuildConfig.VERSION_CODE.toLong())
            throw IOException("Версия APK не совпадает с опубликованным обновлением")
        val installed = pm.getPackageInfo(context.packageName, flags)
        if (signatures(archive).isEmpty() || signatures(archive) != signatures(installed))
            throw IOException("APK подписан другим ключом. Установка отменена")
    }

    @Suppress("DEPRECATION")
    private fun signatures(info: PackageInfo): Set<String> {
        val entries = if (Build.VERSION.SDK_INT >= 28)
            info.signingInfo?.apkContentsSigners else info.signatures
        return entries?.map { it.toCharsString() }?.toSet() ?: emptySet()
    }

    fun canInstall(context: Context): Boolean =
        Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls()

    fun installationPermissionIntent(context: Context): Intent =
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${context.packageName}"))

    fun showSystemInstaller(context: Context, file: File) {
        check(canInstall(context)) { "Не разрешена установка обновлений из Планировыча" }
        val uri = FileProvider.getUriForFile(
            context, "${BuildConfig.APPLICATION_ID}.update-files", file
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, APK_MIME)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(intent)
    }

    // Explicit browser fallback if the device blocks native package installation.
    fun browserDownloadIntent(): Intent =
        Intent(Intent.ACTION_VIEW, Uri.parse(DOWNLOAD_URL))
}
