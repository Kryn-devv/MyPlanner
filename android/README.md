# NOVA for Android

An Android app for your own NOVA server. It is a native shell around the web
app: the app keeps an address and opens that server's pages full screen. All
accounts and data stay on the server (your PC). Nothing is stored on the phone
except the server address and your sign-in session.

- Package: `app.nova.planner`, version 1.0.0
- Needs Android 8.0 (API 26) or newer
- No third-party code: a plain `Activity` and the system `WebView`

---

## 1. Install the APK

1. Get `NOVA-1.0.0.apk` onto the phone: download it, or copy it over USB or
   from Google Drive.
2. Tap the file. Android will say it can't install apps from this source.
   Tap **Settings** and turn on **Allow from this source** for the app you
   opened it with (Files, Chrome, Drive...). On some phones this is under
   **Settings → Apps → Special app access → Install unknown apps**.
3. Go back and tap **Install**.
4. If Play Protect warns about an unknown developer, tap **More details →
   Install anyway**. The APK is not on the Play Store, so Google doesn't know
   who built it. That is the only reason for the warning.

## 2. First run: connect to your server

**On the PC:**

1. Start NOVA as usual (`npm run build` then `npm start`, or `npm run dev`).
   Next.js prints two addresses:

   ```
   - Local:         http://localhost:3000
   - Network:       http://192.168.1.5:3000
   ```

   Use the **Network** address. `localhost` always means "this device", so on
   the phone it would point at the phone itself.

   No Network line? Open Command Prompt, run `ipconfig`, find the **IPv4
   Address** of your Wi-Fi (or Ethernet) adapter, and use
   `http://<that address>:3000`.

2. **Windows Firewall.** The first time Node.js accepts connections, Windows
   asks: "Windows Defender Firewall has blocked some features of Node.js".
   Tick **Private networks** and click **Allow access**. If the phone can't
   connect and you never saw that prompt (or clicked Cancel):
   - **Settings → Network & internet → Wi-Fi → (your network)**: set
     **Network profile type** to **Private**.
   - **Windows Security → Firewall & network protection → Allow an app
     through firewall → Change settings**: tick **Private** for
     **Node.js JavaScript Runtime**.

**On the phone:**

3. Connect to the **same Wi-Fi** as the PC. Mobile data won't work, and
   neither will a "guest" network, which usually keeps devices apart.
4. Open NOVA, type the Network address (`192.168.1.5:3000` is enough, since
   `http://` is added for you) and tap **Connect**.

The app checks that a NOVA server really answers at that address before
saving it. If it can't connect, it says why:

| Message | What to check |
|---|---|
| Couldn't reach ... | The server is running on the PC, and the phone is on the same Wi-Fi. If there's no `:3000` on the end, add it. |
| ... means this phone itself, not your PC | You entered the **Local** address (`localhost` or `127.0.0.1`). Use the **Network** one. |
| ... didn't answer in time | The PC is awake, and the firewall step above. |
| ... answered but took too long to send its page | Nothing is wrong. A server that has just started (especially `npm run dev`) prepares each page the first time it's opened. Wait a few seconds and tap **Connect** again. |
| Couldn't find ... | Spelling of a name like `my-pc.local`. Or use the IP address instead. |
| Something answered ..., but it isn't a NOVA server | The port number. Another program is using that address. |
| ... forwards to a different address | The address sends visitors somewhere else, such as `www.` or a router's login page. If the other address is your NOVA server, enter that one. |
| ... answered with an error (HTTP 500) | The terminal window on the PC where the server is running. |

An `http://` address whose server insists on `https://` (as most hosted
servers do) is checked and saved as the `https://` address automatically.

## 3. Signing in, signing up, forgotten passwords

After you connect, you see the server's own sign-in page, exactly as in a
browser:

- **Sign in** with an account you already have on that server.
- **Create an account** from the sign-in page.
- **Forgot password?** is on the sign-in page. The server emails you a reset
  link if email is set up on it. Otherwise it prints the link in the terminal
  window where the server is running on your PC. A link opened from your
  email app opens in the phone's browser, not in NOVA. Set the new password
  there, then come back to the app and sign in.

You stay signed in when you close the app or restart the phone. Uninstalling
the app, or clearing its storage, signs you out on the phone. Your data is
safe on the server.

## 4. Changing the server later

- **Long-press the NOVA icon → Change server.** You can drag that shortcut to
  the home screen too.
- Or, when the server can't be reached, the app shows **Can't reach your NOVA
  server** with **Retry** and **Change server**. The same screen appears if
  the saved server starts sending the app to a different address (for
  example, it now insists on `https://`); it names that address, so you can
  enter it with **Change server**.

The address field is filled in with the current server, so a changed IP is a
quick edit. To stop the PC's IP address from changing, reserve an address for
it in your router's settings (look for "DHCP reservation").

## 5. Honest limits

- **It works only while the server is running and reachable.** If the PC is
  off or asleep, or NOVA isn't running, or the phone is on another network,
  the app can't show anything. There is no offline mode, because nothing is
  stored on the phone.
- **To use it anywhere** (on mobile data, at work), the server has to be
  reachable from the internet. Host NOVA online (a VPS or a hosting service,
  or a tunnel to your PC) behind **HTTPS**, and enter that `https://` address
  instead. The app trusts only publicly trusted certificates, so a
  self-signed certificate will be refused.
- **Plain `http://` is for your home network only.** Your password and
  session aren't encrypted between the phone and the PC. That is fine on
  your own Wi-Fi, but don't use an `http://` server over public Wi-Fi.
- **Updates must be signed with the same key.** Android installs a new APK
  over the old one only if both were signed with the same key. The APK you
  were given is signed with the Android debug key of the machine that built
  it. One you build yourself is signed with *your* machine's debug key (or
  your own release key; see below). If Android says "App not installed" or
  "package conflicts with an existing package", uninstall NOVA first, then
  install the new APK. You'll need to sign in again. Your data is on the
  server, so nothing is lost.

## 6. Rebuilding the APK

You need a JDK 17 or newer and the Android SDK (platform 35, build-tools
35.0.0). Android Studio installs both.

**Android Studio:** *File → Open*, pick this `android/` folder, and wait for
the Gradle sync. Then choose *Build → Select Build Variant → release* and
*Build → Build App Bundle(s) / APK(s) → Build APK(s)*.

**Command line** (from this `android/` folder):

```sh
# Tell Gradle where the Android SDK is: either set ANDROID_HOME, or create
# local.properties with a line such as
#   sdk.dir=C\:\\Users\\you\\AppData\\Local\\Android\\Sdk      (Windows)
#   sdk.dir=/home/you/Android/Sdk                             (Linux/macOS)
# Android Studio writes local.properties for you. It is gitignored.

gradlew.bat testReleaseUnitTest assembleRelease      # Windows
./gradlew testReleaseUnitTest assembleRelease        # macOS / Linux
```

The APK is written to `app/build/outputs/apk/release/app-release.apk`. The
Gradle wrapper downloads Gradle 8.14.3 the first time and checks its
checksum.

### Signing with your own key

Without a key of your own, release builds are signed with the standard
Android debug key, so they always install. They are still **not**
debuggable. To sign with your own key, so that future updates install
straight over each other:

1. Create a key once (keep the file and passwords safe; lose them and every
   future update needs an uninstall first):

   ```sh
   keytool -genkeypair -v -keystore nova-release.jks -alias nova -keyalg RSA -keysize 4096 -validity 10000
   ```

2. Copy `keystore.properties.example` to `keystore.properties` in this
   folder and fill in its four keys:

   | Key | Meaning |
   |---|---|
   | `storeFile` | Path to the `.jks` file, relative to this folder, or absolute |
   | `storePassword` | The keystore's password |
   | `keyAlias` | The alias given to `keytool` (`nova` above) |
   | `keyPassword` | The key's password (often the same as the store's) |

`keystore.properties`, `*.jks` and `*.keystore` are gitignored. Never commit
them.

---

## How it works

| File | Role |
|---|---|
| `MainActivity` | The full-screen WebView, the error panel, Back handling |
| `ConnectActivity` | The address screen and reachability check |
| `ServerAddress` | Pure Java: normalizes typed addresses and compares origins |
| `LinkPolicy` | Pure Java: which links stay in the app, open outside, or are dropped |
| `ServerProbe` | Pure Java: `GET <server>/login`, judging each redirect, classified into the messages above |
| `SystemBars` | Edge-to-edge layout with system-bar, cutout and keyboard insets |
| `PredictiveBack` | Android 13+ back callback, registered only while there is page history |
| `ServerStore` | The saved address, in private SharedPreferences |

What the WebView may and may not do:

- Only pages from the saved server (same scheme, host and port) load in the
  app. Other web links open in your browser, and `mailto:` and `tel:` links
  open in your mail and phone apps. Everything else (`intent:`, `file:`,
  `javascript:`, ...) is dropped. `target=_blank` and `window.open()` go
  through the same rules.
- There is no JavaScript bridge, no file or content access, no mixed content
  and no third-party cookies.
- Cleartext HTTP is allowed, since a LAN server has no certificate a phone
  could check. HTTPS trusts only the system's certificate authorities.
- Backup and device-to-device transfer are off, so a session cookie is never
  copied to another phone.
- Signing in or out clears the page history, so Back leaves the app instead
  of bouncing between the sign-in page and the app.
- Rotation, unfolding a foldable, and changing the font size, bold text or
  language don't reload the page, so a half-typed task survives them. The
  session cookie is flushed to disk whenever the app goes to the background.

Tests are plain JVM unit tests. The probe tests run against real sockets on
`127.0.0.1`:

```sh
./gradlew testReleaseUnitTest
```
