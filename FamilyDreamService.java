package de.familienplaner.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.service.dreams.DreamService;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;

/**
 * Bildschirmschoner (Daydream): zeigt Uhr, Wetter und die naechsten Termine.
 * Ein Tipp blendet den Familienplan ein. Die Daten stammen aus dem internen
 * App-Speicher (familienplaner.json), die Anzeige ist dream.html.
 */
public class FamilyDreamService extends DreamService {
    private WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    public void onAttachedToWindow() {
        super.onAttachedToWindow();
        setInteractive(true);
        setFullscreen(true);
        setScreenBright(false);

        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        web.setBackgroundColor(0xFF000000);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.loadUrl("file:///android_asset/public/dream.html");
        setContentView(web);
    }

    @Override
    public void onDreamingStarted() {
        super.onDreamingStarted();
        if (web != null) web.onResume();
    }

    @Override
    public void onDreamingStopped() {
        if (web != null) web.onPause();
        super.onDreamingStopped();
    }

    @Override
    public void onDetachedFromWindow() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDetachedFromWindow();
    }

    /** Von der Webseite aufrufbar (window.Android.*), laeuft auf einem Hintergrund-Thread. */
    private class Bridge {
        @JavascriptInterface
        public String readData() {
            File f = new File(getFilesDir(), "familienplaner.json");
            if (!f.exists()) return "";
            try (InputStream in = new FileInputStream(f); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return out.toString("UTF-8");
            } catch (Exception e) {
                return "";
            }
        }

        /** Dateinamen der Fotos (JSON-Liste), nur sichere Namen aus dem App-Ordner fotos. */
        @JavascriptInterface
        public String listPhotos() {
            String[] names = new File(getFilesDir(), "fotos").list();
            if (names == null) return "[]";
            java.util.Arrays.sort(names);
            StringBuilder sb = new StringBuilder("[");
            for (String n : names) {
                if (!n.matches("[A-Za-z0-9._-]+")) continue;
                if (sb.length() > 1) sb.append(',');
                sb.append('"').append(n).append('"');
            }
            return sb.append(']').toString();
        }

        /** Ein Foto als data-URL (JPEG, base64); leer bei Fehler oder unsicherem Namen. */
        @JavascriptInterface
        public String readPhoto(String name) {
            if (name == null || !name.matches("[A-Za-z0-9._-]+")) return "";
            File f = new File(new File(getFilesDir(), "fotos"), name);
            if (!f.isFile() || f.length() > 4L * 1024 * 1024) return "";
            try (InputStream in = new FileInputStream(f); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void openApp() {
            main.post(new Runnable() {
                @Override
                public void run() {
                    Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
                    if (launch != null) {
                        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(launch);
                    }
                    finish();
                }
            });
        }

        @JavascriptInterface
        public void exit() {
            main.post(new Runnable() {
                @Override
                public void run() {
                    finish();
                }
            });
        }
    }
}
