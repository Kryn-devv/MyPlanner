package app.nova.planner;

import android.content.Context;
import android.content.SharedPreferences;

/** The one saved server address, in the app's private SharedPreferences. */
final class ServerStore {

    private static final String PREFS = "nova";
    private static final String KEY_BASE_URL = "server_base_url";

    private ServerStore() {}

    /**
     * The saved base URL, or null when there is none. It is re-normalized on the way out so a
     * value written by an older version of the rules can never reach the WebView unchecked.
     */
    static String get(Context context) {
        String saved = prefs(context).getString(KEY_BASE_URL, null);
        if (saved == null) return null;
        try {
            return ServerAddress.normalize(saved);
        } catch (ServerAddress.InvalidException e) {
            return null;
        }
    }

    static void set(Context context, String baseUrl) {
        prefs(context).edit().putString(KEY_BASE_URL, baseUrl).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
