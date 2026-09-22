package app.nova.planner;

import android.app.Activity;
import android.graphics.Insets;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;

/**
 * Draws the app edge to edge on every Android version and pads the root view by the system bars,
 * the display cutout and the on-screen keyboard.
 *
 * <p>Android 15 forces edge-to-edge on apps targeting API 35: content is laid out behind the
 * status and navigation bars, and adjustResize no longer shrinks the window for the keyboard.
 * Rather than handle that one version specially, the app opts every version into the same
 * layout and applies the insets itself, so there is one code path to get right. The padding
 * shows the root's own dark background behind the (transparent or dark) bars.
 */
final class SystemBars {

    private SystemBars() {}

    /**
     * @param onInsetsChanged run after new padding is applied, for screens that need to react to
     *     the keyboard opening (may be null).
     */
    static void apply(Activity activity, View root, Runnable onInsetsChanged) {
        Window window = activity.getWindow();
        drawBehindBars(window);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                // Clearing the "light" appearance keeps the bar icons white on the dark app.
                controller.setSystemBarsAppearance(0,
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                                | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
            }
        }

        root.setOnApplyWindowInsetsListener((view, insets) -> {
            WindowInsets result;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout()
                        | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                result = WindowInsets.CONSUMED;
            } else {
                result = padLegacy(view, insets);
            }
            if (onInsetsChanged != null) onInsetsChanged.run();
            return result;
        });
        root.requestApplyInsets();
    }

    // The calls below are deprecated, but each is still the way to do this on the versions that
    // reach it. setDecorFitsSystemWindows was deprecated in API 35 only because edge-to-edge
    // became the default there; Android 11 to 14 still need to be asked.

    @SuppressWarnings("deprecation")
    private static void drawBehindBars(Window window) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
        } else {
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    /**
     * Before API 30 the system window insets already include the keyboard when the activity uses
     * adjustResize, so this one set of numbers covers the bars and the keyboard alike.
     */
    @SuppressWarnings("deprecation")
    private static WindowInsets padLegacy(View view, WindowInsets insets) {
        view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
        return insets.consumeSystemWindowInsets();
    }
}
