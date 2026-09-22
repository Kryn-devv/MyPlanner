package app.nova.planner;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Rect;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;

/**
 * Asks for the server address, checks that a NOVA server really answers there, and saves it.
 *
 * <p>Shown on first launch, whenever no address is saved, and from the "Change server" launcher
 * shortcut or the main screen's error panel. The address is checked before it is saved, so a
 * wrong one is explained here in a sentence rather than showing up later as a blank page.
 */
public final class ConnectActivity extends Activity {

    private View root;
    private View scroll;
    private EditText address;
    private Button connectButton;
    private View statusRow;
    private ProgressBar statusSpinner;
    private TextView statusText;

    /**
     * Bumped for every check started. A result is used only if it belongs to the latest check,
     * so a slow answer to an old address can never be saved over a newer one.
     */
    private int attempt;
    private boolean checking;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_connect);

        root = findViewById(R.id.connect_root);
        scroll = findViewById(R.id.connect_scroll);
        address = findViewById(R.id.address);
        connectButton = findViewById(R.id.connect_button);
        statusRow = findViewById(R.id.status_row);
        statusSpinner = findViewById(R.id.status_spinner);
        statusText = findViewById(R.id.status_text);

        SystemBars.apply(this, root, null);

        // When the keyboard opens the ScrollView gets shorter; keep the Connect button on screen
        // along with the field, so the person can see what to press next.
        scroll.addOnLayoutChangeListener((v, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            if (bottom - top < oldBottom - oldTop && address.hasFocus()) revealConnectButton();
        });

        if (savedInstanceState == null) {
            String saved = ServerStore.get(this);
            if (saved != null) {
                address.setText(saved);
                address.setSelection(address.length());
            }
        }

        address.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_DONE) {
                connect();
                return true;
            }
            return false;
        });
        address.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {}

            @Override
            public void afterTextChanged(Editable s) {
                // An error about the old text is misleading once the text has changed.
                if (!checking) hideStatus();
            }
        });
        connectButton.setOnClickListener(v -> connect());
    }

    private void connect() {
        if (checking) return;

        final String baseUrl;
        try {
            baseUrl = ServerAddress.normalize(address.getText().toString());
        } catch (ServerAddress.InvalidException e) {
            showError(getString(messageFor(e.problem)));
            return;
        }

        // The field keeps what was typed. The status line names the address actually tried, so
        // nobody wonders what "192.168.1.5:3000" became, and if the check fails the person
        // corrects their own text rather than a rewritten version that may have lost part of it.
        hideKeyboard();

        final int thisAttempt = ++attempt;
        setChecking(true);
        showProgress(getString(R.string.connect_checking, baseUrl));

        Thread worker = new Thread(() -> {
            ServerProbe.Result result = ServerProbe.check(baseUrl, ServerProbe.DEFAULT_TIMEOUT_MS);
            runOnUiThread(() -> onChecked(thisAttempt, result));
        }, "nova-server-check");
        // A check still waiting on a timeout must never keep the process alive on its own.
        worker.setDaemon(true);
        worker.start();
    }

    private void onChecked(int thisAttempt, ServerProbe.Result result) {
        if (thisAttempt != attempt || isFinishing() || isDestroyed()) return;
        setChecking(false);

        if (result.outcome == ServerProbe.Outcome.OK) {
            // The probe's address, not the typed one: an http address that forwards to https
            // was checked as https, and the WebView keeps only the saved origin's pages.
            ServerStore.set(this, result.baseUrl);
            // Clear the task so a MainActivity still showing the previous server is replaced,
            // not resumed.
            Intent open = new Intent(this, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            startActivity(open);
            finish();
            return;
        }
        showError(messageFor(result));
    }

    private String messageFor(ServerProbe.Result result) {
        String baseUrl = result.baseUrl;
        boolean missed = result.outcome == ServerProbe.Outcome.UNREACHABLE
                || result.outcome == ServerProbe.Outcome.TIMED_OUT
                || result.outcome == ServerProbe.Outcome.NOT_NOVA;
        if (missed && ServerAddress.isLoopback(baseUrl)) {
            // Nothing, or something other than NOVA, answered on the phone itself. Checking the
            // PC and the Wi-Fi, as the usual messages suggest, would not help: the request never
            // left the phone.
            return getString(R.string.probe_loopback, baseUrl);
        }
        switch (result.outcome) {
            case TIMED_OUT:
                return getString(R.string.probe_timed_out, baseUrl);
            case SLOW_TO_ANSWER:
                return getString(R.string.probe_slow, baseUrl);
            case FORWARDS_ELSEWHERE:
                return getString(R.string.probe_forwards_elsewhere, baseUrl, result.redirectTarget);
            case UNKNOWN_HOST:
                return getString(R.string.probe_unknown_host, baseUrl);
            case TLS_FAILED:
                return getString(R.string.probe_tls_failed, baseUrl);
            case NOT_NOVA:
                return getString(R.string.probe_not_nova, baseUrl);
            case SERVER_ERROR:
                return getString(R.string.probe_server_error, baseUrl, result.httpStatus);
            case UNREACHABLE:
            default:
                String message = getString(R.string.probe_unreachable, baseUrl);
                return ServerAddress.usesDefaultHttpPort(baseUrl)
                        ? message + " " + getString(R.string.probe_port_hint)
                        : message;
        }
    }

    private static int messageFor(ServerAddress.Problem problem) {
        switch (problem) {
            case EMPTY:
                return R.string.address_empty;
            case UNSUPPORTED_SCHEME:
                return R.string.address_unsupported_scheme;
            case IPV6_NEEDS_BRACKETS:
                return R.string.address_ipv6_brackets;
            case INVALID:
            default:
                return R.string.address_invalid;
        }
    }

    private void setChecking(boolean value) {
        checking = value;
        connectButton.setEnabled(!value);
        connectButton.setText(value ? R.string.connect_button_busy : R.string.connect_button);
        address.setEnabled(!value);
    }

    private void showProgress(String message) {
        statusSpinner.setVisibility(View.VISIBLE);
        statusText.setTextColor(getColor(R.color.nova_ink_muted));
        statusText.setText(message);
        statusRow.setVisibility(View.VISIBLE);
    }

    private void showError(String message) {
        statusSpinner.setVisibility(View.GONE);
        statusText.setTextColor(getColor(R.color.nova_critical));
        statusText.setText(message);
        statusRow.setVisibility(View.VISIBLE);
        revealConnectButton();
    }

    private void hideStatus() {
        statusRow.setVisibility(View.GONE);
        statusText.setText(null);
    }

    private void revealConnectButton() {
        // Posted so it runs after the layout pass that resized the ScrollView or showed the
        // status line; asking for a rectangle before then would scroll to stale positions.
        connectButton.post(() -> {
            int margin = Math.round(16 * getResources().getDisplayMetrics().density);
            connectButton.requestRectangleOnScreen(
                    new Rect(0, 0, connectButton.getWidth(), connectButton.getHeight() + margin));
        });
    }

    private void hideKeyboard() {
        InputMethodManager imm = getSystemService(InputMethodManager.class);
        if (imm != null) imm.hideSoftInputFromWindow(address.getWindowToken(), 0);
    }
}
