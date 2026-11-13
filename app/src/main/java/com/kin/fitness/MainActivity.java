package com.kin.fitness;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/** Offline Android container with real step-counter sensor access. */
public final class MainActivity extends Activity implements SensorEventListener {
    private static final int PERMISSION_STEPS = 410;
    private static final int FILE_OPEN = 411;
    private static final int FILE_SAVE = 412;
    private static final String PREFS = "kinwalk_step_state";
    private SensorManager sensors;
    private Sensor stepCounter;
    private WebView web;
    private ValueCallback<Uri[]> uploadCallback;
    private String pendingFileContent;
    private String pendingFileMime;
    private String pendingFileName;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xFF0B1020);
        getWindow().setNavigationBarColor(0xFF0B1020);
        sensors = (SensorManager) getSystemService(SENSOR_SERVICE);
        stepCounter = sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        web = new WebView(this);
        setContentView(web);
        WebSettings cfg = web.getSettings();
        cfg.setJavaScriptEnabled(true);
        cfg.setDomStorageEnabled(true);
        cfg.setAllowFileAccess(false);
        // The user-selected backup import arrives as a content:// URI.
        cfg.setAllowContentAccess(true);
        cfg.setJavaScriptCanOpenWindowsAutomatically(false);
        cfg.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new PhoneBridge(), "KinAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri uri = req.getUrl();
                return !("https".equals(uri.getScheme()) && "kin.local".equals(uri.getHost()));
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri uri = req.getUrl();
                if ("https".equals(uri.getScheme()) && "kin.local".equals(uri.getHost())
                        && ("/".equals(uri.getPath()) || "/index.html".equals(uri.getPath()))) {
                    try {
                        InputStream stream = getAssets().open("index.html");
                        return new WebResourceResponse("text/html", "UTF-8", stream);
                    } catch (Exception ignored) { }
                }
                // Do not allow the embedded app to make external network requests.
                return new WebResourceResponse("text/plain", "UTF-8",
                        new ByteArrayInputStream(new byte[0]));
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                                       FileChooserParams params) {
                if (uploadCallback != null) uploadCallback.onReceiveValue(null);
                uploadCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(intent, FILE_OPEN);
                } catch (Exception exc) {
                    uploadCallback.onReceiveValue(null);
                    uploadCallback = null;
                }
                return true;
            }
        });
        web.loadUrl("https://kin.local/index.html");
    }

    @Override protected void onResume() {
        super.onResume();
        startSensor();
    }
    @Override protected void onPause() {
        sensors.unregisterListener(this);
        super.onPause();
    }
    @Override protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    private boolean allowed() {
        return Build.VERSION.SDK_INT < 29 ||
                checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
    }
    private boolean walkingEnabled() {
        return getPreferences(MODE_PRIVATE).getBoolean("walking_enabled", false);
    }
    private void startSensor() {
        if (stepCounter != null && allowed() && walkingEnabled()) {
            sensors.unregisterListener(this);
            sensors.registerListener(this, stepCounter, SensorManager.SENSOR_DELAY_NORMAL);
        }
    }
    private String currentDay() {
        int hourCutoff = getPreferences(MODE_PRIVATE).getInt("cutoff", 10);
        Calendar day = Calendar.getInstance();
        day.add(Calendar.HOUR_OF_DAY, -hourCutoff);
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(day.getTime());
    }

    @Override public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_STEP_COUNTER) return;
        long current = Math.round(event.values[0]);
        android.content.SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        long last = p.getLong("last", -1);
        String key = "steps_" + currentDay();
        android.content.SharedPreferences.Editor edit = p.edit();
        // First reading establishes the baseline. A lower count indicates a reboot.
        if (last >= 0 && current >= last) {
            long delta = current - last;
            long previous = p.getLong(key, 0);
            edit.putLong(key, Math.min(Integer.MAX_VALUE, previous + delta));
        }
        edit.putLong("last", current).apply();
    }
    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) { }

    private String stepsState() {
        JSONObject o = new JSONObject();
        try {
            o.put("available", stepCounter != null);
            o.put("permission", allowed());
            o.put("steps", getSharedPreferences(PREFS, MODE_PRIVATE).getLong("steps_" + currentDay(), 0));
            o.put("day", currentDay());
            o.put("note", "First reading sets a baseline. Steps since the last reading may be assigned to the day you reopen the app.");
        } catch (Exception ignored) { }
        return o.toString();
    }

    private final class PhoneBridge {
        @JavascriptInterface public String getSteps() { return stepsState(); }
        @JavascriptInterface public void setWalkingEnabled(boolean enabled) {
            getPreferences(MODE_PRIVATE).edit().putBoolean("walking_enabled", enabled).apply();
            runOnUiThread(() -> {
                if (enabled) startSensor();
                else sensors.unregisterListener(MainActivity.this);
            });
        }
        @JavascriptInterface public void requestSteps() {
            runOnUiThread(() -> {
                if (stepCounter == null || !walkingEnabled()) return;
                if (allowed()) { startSensor(); return; }
                if (Build.VERSION.SDK_INT >= 29) {
                    requestPermissions(new String[]{Manifest.permission.ACTIVITY_RECOGNITION}, PERMISSION_STEPS);
                }
            });
        }
        @JavascriptInterface public void setTrackingCutoff(int hour) {
            if (hour < 0 || hour > 23) return;
            getPreferences(MODE_PRIVATE).edit().putInt("cutoff", hour).apply();
        }
        @JavascriptInterface public void saveFile(String name, String contents, String mime) {
            runOnUiThread(() -> {
                pendingFileName = name.replaceAll("[^a-zA-Z0-9._-]", "_");
                pendingFileContent = contents;
                pendingFileMime = mime;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mime);
                intent.putExtra(Intent.EXTRA_TITLE, pendingFileName);
                startActivityForResult(intent, FILE_SAVE);
            });
        }
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] grants) {
        super.onRequestPermissionsResult(code, perms, grants);
        if (code == PERMISSION_STEPS && allowed()) startSensor();
    }
    @Override protected void onActivityResult(int code, int result, Intent intent) {
        super.onActivityResult(code, result, intent);
        if (code == FILE_OPEN && uploadCallback != null) {
            uploadCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, intent));
            uploadCallback = null;
        } else if (code == FILE_SAVE) {
            if (result == RESULT_OK && intent != null && intent.getData() != null) {
                try (OutputStream stream = getContentResolver().openOutputStream(intent.getData())) {
                    if (stream != null && pendingFileContent != null) {
                        stream.write(pendingFileContent.getBytes(StandardCharsets.UTF_8));
                    }
                } catch (Exception ignored) { }
            }
            pendingFileContent = null;
        }
    }
}
