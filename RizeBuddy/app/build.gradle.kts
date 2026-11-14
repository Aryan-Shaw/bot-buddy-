plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.chaquo.python")
}

android {
    namespace = "com.rizebuddy.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.rizebuddy.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 19
        versionName = "v29-android-1"
        ndk {
            // 64-bit phones (almost all since 2017), older 32-bit phones, and the Android emulator on PCs
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signed with the debug key so the release APK installs by sideloading. Use your own keystore to publish on Google Play.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging { jniLibs { useLegacyPackaging = true } }
}

chaquopy {
    defaultConfig {
        version = "3.11"
        pip {
            install("flask==3.0.3")
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.0")
}
