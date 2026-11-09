plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.google.services)
}

// Use ONE permanently backed-up release keystore. No credentials or keys in Git.
val releaseStorePath = providers.gradleProperty("PLANIROVYCH_RELEASE_STORE_FILE")
    .orElse(providers.environmentVariable("PLANIROVYCH_RELEASE_STORE_FILE")).orNull
val releaseStorePassword = providers.gradleProperty("PLANIROVYCH_RELEASE_STORE_PASSWORD")
    .orElse(providers.environmentVariable("PLANIROVYCH_RELEASE_STORE_PASSWORD")).orNull
val releaseKeyAlias = providers.gradleProperty("PLANIROVYCH_RELEASE_KEY_ALIAS")
    .orElse(providers.environmentVariable("PLANIROVYCH_RELEASE_KEY_ALIAS")).orNull
val releaseKeyPassword = providers.gradleProperty("PLANIROVYCH_RELEASE_KEY_PASSWORD")
    .orElse(providers.environmentVariable("PLANIROVYCH_RELEASE_KEY_PASSWORD")).orNull
val hasReleaseSigning = listOf(releaseStorePath,releaseStorePassword,releaseKeyAlias,
    releaseKeyPassword).all { !it.isNullOrBlank() }

android {
    namespace = "ru.planirovych.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "ru.planirovych.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 8
        versionName = "1.0.6"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "API_BASE_URL", "\"${project.findProperty("API_BASE_URL") ?: "https://planirovych.ru/"}\"")
    }
    signingConfigs {
        if(hasReleaseSigning) {
            create("planirovychRelease") {
                storeFile = file(requireNotNull(releaseStorePath))
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }
    buildTypes {
        debug { applicationIdSuffix = ".debug"; versionNameSuffix = "-debug" }
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Android Studio's Generate Signed APK wizard also works if these
            // variables are absent. Never create or auto-commit a signing key.
            if(hasReleaseSigning) signingConfig=signingConfigs.getByName("planirovychRelease")
        }
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    // ActivityResult Lint requires Fragment >= 1.3.0 on the resolved release classpath.
    implementation(libs.androidx.fragment)
    implementation(libs.androidx.lifecycle.runtime)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.retrofit.core)
    implementation(libs.retrofit.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.androidx.datastore)
    implementation("androidx.work:work-runtime-ktx:2.12.0")
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
