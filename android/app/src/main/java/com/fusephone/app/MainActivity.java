package com.fusephone.app;

import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "FusePhoneMain";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseApp.initializeApp(this);
                Log.i(TAG, "FirebaseApp initialized explicitly in MainActivity");
            } else {
                Log.i(TAG, "FirebaseApp was already auto-initialized");
            }
        } catch (Throwable t) {
            Log.e(TAG, "FirebaseApp.initializeApp failed", t);
        }

        registerPlugin(PlayBillingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
