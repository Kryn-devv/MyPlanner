package app.nova.planner;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.BulletSpan;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

/**
 * The app itself: a full-screen WebView onto the saved NOVA server.
 *
 * <p>Everything a person does (signing in, signing up, planning) is the server's own web pages;
 * this class only keeps that window safe and pleasant. Pages stay in the app only when they come
 * from the saved server; the WebView gets no JavaScript bridge, no file or content access and no
 * mixed content, so a page can do nothing here that it could not do in a browser tab.
 */
public final class MainActivity extends Activity {

    private static final String STATE_WEBVIEW = "webview";

    private String baseUrl;

    private FrameLayout webHolder;
    private WebView webView;
    private ProgressBar pageProgress;
    private View errorPanel;
    private TextView errorAddress;
    private TextView errorDetail;
    private Button retryButton;

    /** The URL whose main-frame load failed, which Retry loads again. */
    private String failedUrl;

    /**
     * Set when a main-frame load fails and consumed by that load's onPageFinished. WebView
     * versions disagree on whether onReceivedError comes before or after onPageStarted, but the
     * failed load always finishes, so this is the one ordering that can be relied on.
     */
    private boolean failurePending;

    /** Whether the last page was under /app, to notice signing in or out (see LinkPolicy). */
    private Boolean lastInSignedInArea;

    /** A window.open() target that has not been routed yet; see onCreateWindow. */
    private WebView pendingPopup;

    /** Android 13+ only; null on older versions, where onBackPressed is used instead. */
    private PredictiveBack predictiveBack;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        baseUrl = ServerStore.get(this);
        if (baseUrl == null) {
            startActivity(new Intent(this, ConnectActivity.class));
            finish();
            return;
        }

        setContentView(R.layout.activity_main);
        webHolder = findViewById(R.id.web_holder);
        pageProgress = findViewById(R.id.page_progress);
        errorPanel = findViewById(R.id.error_panel);
        errorAddress = findViewById(R.id.error_address);
        errorDetail = findViewById(R.id.error_detail);
        retryButton = findViewById(R.id.error_retry);
        SystemBars.apply(this, findViewById(R.id.main_root), null);

        bullet(R.id.error_cause_server, R.string.error_cause_server);
        bullet(R.id.error_cause_wifi, R.string.error_cause_wifi);
        bullet(R.id.error_cause_address, R.string.error_cause_address);
        retryButton.setOnClickListener(v -> retry());
        findViewById(R.id.error_change_server).setOnClickListener(
                v -> startActivity(new Intent(this, ConnectActivity.class)));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            predictiveBack = new PredictiveBack(this, this::goBackInWebView);
        }

        webView = createWebView();
        Bundle webState = savedInstanceState == null ? null : savedInstanceState.getBundle(STATE_WEBVIEW);
        if (webState == null || webView.restoreState(webState) == null) {
            // /app, not the bare server: signed out, the server redirects to /login by itself.
            webView.loadUrl(baseUrl + "/app");
        }
    }

    // JavaScript is the web app itself. What makes it safe here is everything around it: only the
    // saved server's pages load, and there is no JavaScript interface for a page to call into.
    @SuppressLint("SetJavaScriptEnabled")
    private WebView createWebView() {
        WebView view = new WebView(this);
        // Matches the page background, so there is no white flash before the first paint.
        view.setBackgroundColor(getColor(R.color.nova_void));

        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setGeolocationEnabled(false);
        // Honour the page's viewport tag, which allows pinch-zoom on purpose (accessibility).
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        // target=_blank and window.open() arrive through onCreateWindow, where they are routed
        // like any other link; pages cannot open windows without a tap.
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(view, false);

        view.setWebViewClient(new ShellClient());
        view.setWebChromeClient(new ShellChrome());
        webHolder.addView(view, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return view;
    }

    private final class ShellClient extends WebViewClient {

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();
            // A frame inside a page may load web content, but never launch another app.
            if (!request.isForMainFrame()) return !LinkPolicy.isWebUrl(url);
            // Only navigations that stay on the server are ever loaded, so a redirect that
            // leaves it is the server itself sending the app away: typically an http address
            // that now forwards to https, or to www. Sending that to the browser would leave a
            // blank screen here on every launch, with no error and no way to change server.
            if (request.isRedirect() && LinkPolicy.decide(baseUrl, url) != LinkPolicy.Decision.STAY) {
                showRedirectError(url);
                return true;
            }
            return route(url);
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            // A different page means the earlier failure is no longer what is on screen.
            if (failedUrl != null && !failedUrl.equals(url)) failurePending = false;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            pageProgress.setVisibility(View.GONE);
            if (failurePending) {
                failurePending = false;
            } else {
                hideError();
            }
            updateBackCallback();
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            boolean signedIn = LinkPolicy.isSignedInArea(url);
            if (lastInSignedInArea != null && lastInSignedInArea != signedIn) {
                // Signing in or out: the pages on the other side would only redirect back here,
                // so Back should leave the app rather than bounce between them.
                view.clearHistory();
            }
            lastInSignedInArea = signedIn;
            updateBackCallback();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            CharSequence description = error.getDescription();
            showError(request.getUrl().toString(), description == null ? null : description.toString());
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            // Only gateway errors get the native panel: they come from a proxy or tunnel whose
            // NOVA server behind it is down. A 404 or 500 is the web app's own error page, which
            // explains itself better than this panel could.
            int status = response.getStatusCode();
            if (request.isForMainFrame() && (status == 502 || status == 503 || status == 504)) {
                showError(request.getUrl().toString(), getString(R.string.error_detail_http, status));
            }
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            // Never proceed past a bad certificate. The panel is shown only for the server's own
            // address; a broken third-party resource just fails to load, as in a browser.
            handler.cancel();
            if (ServerAddress.isSameOrigin(baseUrl, error.getUrl())) {
                showError(error.getUrl(), getString(R.string.error_detail_certificate));
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // Without this the whole app is killed along with the renderer. A popup WebView just
            // goes; the main one is rebuilt and reopens the app's home.
            if (view != webView) {
                if (view == pendingPopup) pendingPopup = null;
                view.destroy();
                return true;
            }
            webHolder.removeView(webView);
            webView.destroy();
            webView = createWebView();
            lastInSignedInArea = null;
            webView.loadUrl(baseUrl + "/app");
            updateBackCallback();
            return true;
        }
    }

    private final class ShellChrome extends WebChromeClient {

        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            if (newProgress >= 100) {
                pageProgress.setVisibility(View.GONE);
            } else {
                pageProgress.setVisibility(View.VISIBLE);
                pageProgress.setProgress(Math.max(newProgress, 5));
            }
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            // The new window is a throwaway WebView that is never shown: it exists only to learn
            // which URL the page wanted to open, which is then routed like a tapped link.
            if (pendingPopup != null) pendingPopup.destroy();
            WebView popup = new WebView(MainActivity.this);
            pendingPopup = popup;
            popup.setWebViewClient(new PopupClient());
            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(popup);
            resultMsg.sendToTarget();
            return true;
        }

        @Override
        public void onCloseWindow(WebView window) {
            if (window == pendingPopup) {
                pendingPopup = null;
                window.destroy();
            }
        }
    }

    /**
     * Catches the first real URL a popup navigates to. Both callbacks are watched because not
     * every WebView version asks shouldOverrideUrlLoading for a new window's first load.
     */
    private final class PopupClient extends WebViewClient {
        private boolean routed;

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            take(view, request.getUrl().toString());
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            take(view, url);
        }

        private void take(WebView popup, String url) {
            // window.open() with no URL starts at about:blank; wait for the real one.
            if (routed || url == null || url.startsWith("about:")) return;
            routed = true;
            popup.stopLoading();
            if (!route(url) && webView != null) webView.loadUrl(url);
            if (popup == pendingPopup) pendingPopup = null;
            // Destroying a WebView from inside its own callback is not allowed, so wait a turn.
            // The post goes through the attached holder: the popup itself is never attached to
            // a window, and a detached view holds posted work until an attach that never comes.
            webHolder.post(popup::destroy);
        }
    }

    /**
     * Applies LinkPolicy to a main-frame navigation. Returns true when the WebView must not load
     * the URL itself (it was sent to another app, or blocked).
     */
    private boolean route(String url) {
        switch (LinkPolicy.decide(baseUrl, url)) {
            case STAY:
                return false;
            case OPEN_OUTSIDE:
                openOutside(url);
                return true;
            case BLOCK:
            default:
                return true;
        }
    }

    private void openOutside(String url) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        // Only apps that declare they may be opened from a web link (browsers, the dialer, mail
        // apps) are eligible, the same rule Chrome applies to links on a page.
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException | SecurityException e) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
        }
    }

    private void showError(String url, String detail) {
        failedUrl = url;
        failurePending = true;
        errorAddress.setText(getString(R.string.error_address, url));
        errorDetail.setText(detail);
        errorDetail.setVisibility(detail == null || detail.isEmpty() ? View.GONE : View.VISIBLE);
        retryButton.setEnabled(true);
        retryButton.setText(R.string.error_retry);
        pageProgress.setVisibility(View.GONE);
        if (errorPanel.getVisibility() != View.VISIBLE) {
            errorPanel.setVisibility(View.VISIBLE);
            errorPanel.scrollTo(0, 0);
        }
    }

    private void showRedirectError(String url) {
        ServerAddress.Origin target = ServerAddress.origin(url);
        // Retry starts again from the saved server's home; the other address is never loaded
        // here, only named, so the person can decide whether to switch to it.
        showError(baseUrl + "/app", getString(R.string.error_detail_redirect,
                target != null ? target.toBaseUrl() : url));
    }

    private void hideError() {
        errorPanel.setVisibility(View.GONE);
        failedUrl = null;
        retryButton.setEnabled(true);
        retryButton.setText(R.string.error_retry);
    }

    private void retry() {
        // The panel stays up while retrying, so the WebView's own "page not available" screen
        // underneath never flashes; a successful load takes it down.
        String url = failedUrl != null ? failedUrl : baseUrl + "/app";
        failurePending = false;
        retryButton.setEnabled(false);
        retryButton.setText(R.string.error_retrying);
        webView.loadUrl(url);
    }

    private void goBackInWebView() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        updateBackCallback();
    }

    private void updateBackCallback() {
        if (predictiveBack != null) predictiveBack.setEnabled(webView != null && webView.canGoBack());
    }

    /** Android 12 and older; from 13 on the callback above receives Back instead. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private void bullet(int viewId, int textId) {
        SpannableString text = new SpannableString(getString(textId));
        int gap = Math.round(10 * getResources().getDisplayMetrics().density);
        text.setSpan(new BulletSpan(gap, getColor(R.color.nova_accent)), 0, text.length(),
                Spanned.SPAN_INCLUSIVE_EXCLUSIVE);
        ((TextView) findViewById(viewId)).setText(text);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        // Cookies are written to disk lazily; flushing here is what keeps the sign-in session
        // when the app is swiped away or killed in the background.
        CookieManager.getInstance().flush();
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // A WebView takes its text size from the system font size only when it is created.
        // Font size changes no longer recreate this activity (see configChanges in the
        // manifest), so pass them on, as the WebView a recreation would have built does.
        if (webView != null) webView.getSettings().setTextZoom((int) (100 * newConfig.fontScale));
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        // Only needed when Android kills the process in the background; rotation and similar
        // changes keep the activity (see configChanges in the manifest).
        if (webView != null) {
            Bundle webState = new Bundle();
            webView.saveState(webState);
            outState.putBundle(STATE_WEBVIEW, webState);
        }
    }

    @Override
    protected void onDestroy() {
        if (pendingPopup != null) {
            pendingPopup.destroy();
            pendingPopup = null;
        }
        if (webView != null) {
            webHolder.removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
