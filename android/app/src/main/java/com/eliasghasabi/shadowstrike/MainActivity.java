package com.eliasghasabi.shadowstrike;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

/**
 * MainActivity with true immersive fullscreen.
 *
 * Capacitor's @capacitor/status-bar plugin only hides the status bar,
 * not the navigation bar — and the WebView still gets touch events that
 * peek the system bars. This activity applies Android's native
 * IMMERSIVE_STICKY (legacy) / WindowInsetsController.hide (API 30+)
 * at the Activity level, which is the only reliable way to make a
 * WebView-wrapped game feel like a real fullscreen game.
 *
 * We also re-apply immersive mode whenever system bars peek back in
 * (Android's standard "sticky immersive" behaviour: a swipe shows
 * the bars transiently, then we hide them again after ~2s).
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Keep the screen on during gameplay and turn off the window
        // dim — games shouldn't auto-sleep.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        applyImmersive();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Re-apply immersive whenever we get focus back — covers the
        // case where a notification panel or system dialog caused the
        // bars to reappear.
        if (hasFocus) {
            applyImmersive();
        }
    }

    /**
     * Apply the most aggressive immersive mode available on this
     * Android version. Called on create, on focus change, and after
     * any system bar visibility change via the insets listener.
     */
    private void applyImmersive() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                // Modern API (Android 11+): WindowInsetsController
                WindowInsetsController controller = getWindow().getInsetsController();
                if (controller != null) {
                    // Hide both system bars
                    controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    // BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE = the Android
                    // equivalent of IMMERSIVE_STICKY: a swipe reveals the
                    // bars transiently, then they auto-hide after ~2s.
                    controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                // Legacy API (Android 4.4 - 10): SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                View decorView = getWindow().getDecorView();
                int flags = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
                decorView.setSystemUiVisibility(flags);
                // Re-apply whenever the user swipes — sticky behaviour
                // requires the listener to re-set the flags after the
                // system temporarily reveals the bars.
                decorView.setOnSystemUiVisibilityChangeListener(visibility -> {
                    if ((visibility & View.SYSTEM_UI_FLAG_FULLSCREEN) == 0) {
                        // System bars are visible — re-apply after a tick
                        decorView.postDelayed(this::applyImmersive, 1000);
                    }
                });
            }
        } catch (Exception e) {
            // Older device or unusual config — fall back to the simplest
            // fullscreen flag we can. The WebView will still fill the
            // screen even if the system bars aren't hidden.
            try {
                getWindow().setFlags(
                        WindowManager.LayoutParams.FLAG_FULLSCREEN,
                        WindowManager.LayoutParams.FLAG_FULLSCREEN);
            } catch (Exception ignored) { }
        }
    }
}
