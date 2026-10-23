import java.net.URI
import java.util.Properties

plugins { id("com.android.application") }

/*
 * Trusted Web Activity de MisFinanzas.
 * La URL de la app web se define al compilar:  ./build-apk.sh https://misfinanzas.tudominio.cl
 * (o -PtwaUrl=...). Debe ser HTTPS y publicar /.well-known/assetlinks.json con la huella de la firma.
 */
val twaUrl: String = (project.findProperty("twaUrl") as String?) ?: "https://misfinanzas.example.com/"
val twaUri = URI(twaUrl)
require(twaUri.scheme == "https") { "twaUrl debe usar https" }
val twaHost: String = twaUri.host
val appVersionCode = ((project.findProperty("versionCode") as String?) ?: "1").toInt()
val appVersionName = (project.findProperty("versionName") as String?) ?: "1.0.0"

val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "cl.misfinanzas.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "cl.misfinanzas.app"
        minSdk = 24
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersionName
        manifestPlaceholders["hostName"] = twaHost
        resValue("string", "launch_url", twaUrl)
        resValue("string", "host_name", twaHost)
        resValue("string", "asset_statements",
            "[{ \\\"relation\\\": [\\\"delegate_permission/common.handle_all_urls\\\"], \\\"target\\\": {\\\"namespace\\\": \\\"web\\\", \\\"site\\\": \\\"https://$twaHost\\\"}}]")
    }

    signingConfigs {
        create("release") {
            if (keystoreProps.isNotEmpty()) {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }
    buildFeatures { resValues = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}
