import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fusephone.app',
  appName: 'Fuse Phone',
  webDir: 'dist/public',
  server: {
    url: 'https://app.fusephone.com',
    cleartext: false,
  },
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    scheme: 'Fuse Phone',
    backgroundColor: '#eef1f6',
    allowsLinkPreview: false,
    allowsBackForwardNavigationGestures: true,
    scrollEnabled: true,
    overrideUserAgent: 'FusePhone-iOS Capacitor',
    webContentsDebuggingEnabled: false,
  },
  android: {
    backgroundColor: '#eef1f6',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 10000,
      launchAutoHide: false,
      backgroundColor: '#0F172A',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'LIGHT',
      overlaysWebView: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      // IMPORTANT: keep `resize: 'none'`. The Messages chat input and other
      // keyboard-aware UI subtract `info.keyboardHeight` from window.innerHeight
      // explicitly via Capacitor's `keyboardWillShow` event — that math depends
      // on the webview NOT shrinking. Switching to 'native' would double-subtract
      // and collapse those panels. Auto-scrolling focused fields above the
      // keyboard is handled in JS instead (see use-scroll-focused-into-view).
      resize: 'none',
      resizeOnFullScreen: false,
      scrollPadding: false,
    },
  },
};

export default config;
