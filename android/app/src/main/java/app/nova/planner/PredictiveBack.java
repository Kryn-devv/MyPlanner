package app.nova.planner;

import android.annotation.TargetApi;
import android.app.Activity;
import android.os.Build;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

/**
 * Back handling for Android 13 and later, in a class of its own so that older versions, which
 * lack these types, never load it.
 *
 * <p>The callback is registered only while the web page has somewhere to go back to. With none
 * registered the system handles Back itself, including the predictive "back to home" animation,
 * which it could not show if the app claimed every Back gesture.
 */
@TargetApi(Build.VERSION_CODES.TIRAMISU)
final class PredictiveBack {

    private final OnBackInvokedDispatcher dispatcher;
    private final OnBackInvokedCallback callback;
    private boolean registered;

    PredictiveBack(Activity activity, Runnable onBack) {
        dispatcher = activity.getOnBackInvokedDispatcher();
        callback = onBack::run;
    }

    void setEnabled(boolean enabled) {
        if (enabled == registered) return;
        if (enabled) {
            dispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback);
        } else {
            dispatcher.unregisterOnBackInvokedCallback(callback);
        }
        registered = enabled;
    }
}
