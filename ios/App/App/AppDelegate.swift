import UIKit
import UserNotifications
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate {

    var window: UIWindow?
    var cachedFCMToken: String?
    var pendingNotificationUrl: String?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self
        application.registerForRemoteNotifications()
        // StoreKit2Plugin is registered EXPLICITLY in
        // FuseBridgeViewController.capacitorDidLoad(). The storyboard's
        // initial view controller now points at FuseBridgeViewController
        // (a CAPBridgeViewController subclass in this target), so the
        // plugin is attached to the bridge before any JS runs.
        //
        // We previously relied on `packageClassList` auto-discovery in
        // capacitor.config.json, but on Capacitor 8 that path silently
        // failed to load this local plugin on real devices (likely a
        // Swift module-name / NSClassFromString edge case). Explicit
        // registration in capacitorDidLoad() is the documented Capacitor
        // pattern for local plugins and works reliably. StoreKit2Plugin
        // has been REMOVED from packageClassList so there's only one
        // registration path — double registration would attach two
        // Transaction.updates listeners.
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[Firebase] Failed to register for remote notifications: \(error)")
    }

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }
        print("[Firebase] FCM token received: \(token.prefix(30))...")
        cachedFCMToken = token
        injectFCMTokenIntoWebView(token: token)
    }

    func injectFCMTokenIntoWebView(token: String) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            guard let rootVC = self.window?.rootViewController else { return }
            if let bridgeVC = rootVC as? CAPBridgeViewController {
                let js = "window.__fcmToken = '\(token)'; window.__nativeDeviceToken = '\(token)'; window.__nativeDevicePlatform = 'ios'; console.log('[Firebase] FCM token injected into WebView');"
                bridgeVC.bridge?.webView?.evaluateJavaScript(js) { _, error in
                    if let error = error {
                        print("[Firebase] JS injection error: \(error)")
                        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
                            self.injectFCMTokenIntoWebView(token: token)
                        }
                    } else {
                        print("[Firebase] FCM token injected successfully")
                    }
                }
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                    self.injectFCMTokenIntoWebView(token: token)
                }
            }
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}

    func applicationDidBecomeActive(_ application: UIApplication) {
        if let token = cachedFCMToken {
            injectFCMTokenIntoWebView(token: token)
        }
        if let pendingUrl = pendingNotificationUrl {
            pendingNotificationUrl = nil
            // LOCKED — Task #37: Inject the URL with retries so we don't
            // depend on a fixed delay guess (the old 2.0s wait felt slow
            // and still missed when the JS bundle took longer). The JS
            // side polls `window.__pendingPushUrl`, so as long as we set
            // it at least once after the WebView is alive, navigation
            // succeeds. Retries handle slow boots / killed apps.
            injectPendingPushUrl(pendingUrl, attempt: 0)
        }
    }

    private func injectPendingPushUrl(_ url: String, attempt: Int) {
        // Retry schedule (cumulative): 0.3s, 1.3s, 3.3s, 6.3s, 10.3s.
        // We retry ONLY when the WebView isn't ready yet or when the JS
        // injection itself fails. Once the JS write succeeds we stop —
        // the JS side polls `window.__pendingPushUrl` (250ms forever) so
        // a late-mounting React listener still picks it up. Repeating
        // the injection after success would cause duplicate
        // `native-push-tapped` events outside the JS dedupe window and
        // re-trigger navigation. Bounded at 5 attempts (~10s budget).
        let delays: [Double] = [0.3, 1.0, 2.0, 3.0, 4.0]
        if attempt >= delays.count { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + delays[attempt]) { [weak self] in
            guard let self = self else { return }
            guard let rootVC = self.window?.rootViewController as? CAPBridgeViewController,
                  let webView = rootVC.bridge?.webView else {
                // WebView not ready yet — try again on the next tick.
                self.injectPendingPushUrl(url, attempt: attempt + 1)
                return
            }
            let escapedUrl = url.replacingOccurrences(of: "'", with: "\\'")
            let js = """
            (function() {
                try {
                    var url = '\(escapedUrl)';
                    window.__pendingPushUrl = url;
                    window.dispatchEvent(new CustomEvent('native-push-tapped', { detail: { url: url } }));
                    return true;
                } catch (e) { return false; }
            })();
            """
            webView.evaluateJavaScript(js) { [weak self] result, error in
                guard let self = self else { return }
                let succeeded = error == nil && (result as? Bool == true)
                if !succeeded {
                    // JS context not ready or threw — retry. On success,
                    // do nothing (JS poll handles late listeners).
                    self.injectPendingPushUrl(url, attempt: attempt + 1)
                }
            }
        }
    }

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}

extension AppDelegate: UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .badge, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        if let urlStr = userInfo["url"] as? String {
            let escapedUrl = urlStr.replacingOccurrences(of: "'", with: "\\'")
            let cleanUrl = escapedUrl.hasPrefix("/") ? escapedUrl : "/" + escapedUrl
            let notifJson = self.jsonString(from: userInfo)

            if let rootVC = window?.rootViewController as? CAPBridgeViewController,
               rootVC.bridge?.webView != nil {
                let js = """
                (function() {
                    var url = '\(cleanUrl)';
                    window.__pendingPushUrl = url;
                    window.dispatchEvent(new CustomEvent('native-push-tapped', { detail: { url: url, notification: \(notifJson) } }));
                })();
                """
                rootVC.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
            } else {
                pendingNotificationUrl = cleanUrl
            }
        }
        completionHandler()
    }

    private func jsonString(from dict: [AnyHashable: Any]) -> String {
        if let data = try? JSONSerialization.data(withJSONObject: dict, options: []),
           let str = String(data: data, encoding: .utf8) {
            return str
        }
        return "{}"
    }
}
