package com.fusephone.app;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.AcknowledgePurchaseResponseListener;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {

    private BillingClient billingClient;
    private boolean isConnected = false;
    private final Map<String, ProductDetails> productCache = new ConcurrentHashMap<>();

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases(
                        PendingPurchasesParams.newBuilder()
                                .enableOneTimeProducts()
                                .build()
                )
                .build();
    }

    private void ensureConnected(@NonNull Runnable onReady, @NonNull PluginCall callForError) {
        if (isConnected && billingClient.isReady()) {
            onReady.run();
            return;
        }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    isConnected = true;
                    onReady.run();
                } else {
                    callForError.reject("Billing connect failed: code=" + billingResult.getResponseCode()
                            + " msg=" + billingResult.getDebugMessage());
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                isConnected = false;
            }
        });
    }

    @com.getcapacitor.PluginMethod
    public void initialize(final PluginCall call) {
        ensureConnected(() -> {
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        }, call);
    }

    @com.getcapacitor.PluginMethod
    public void queryProducts(final PluginCall call) {
        JSArray productIds = call.getArray("productIds");
        if (productIds == null || productIds.length() == 0) {
            call.reject("productIds is required");
            return;
        }
        final List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        try {
            for (int i = 0; i < productIds.length(); i++) {
                products.add(
                        QueryProductDetailsParams.Product.newBuilder()
                                .setProductId(productIds.getString(i))
                                .setProductType(BillingClient.ProductType.SUBS)
                                .build()
                );
            }
        } catch (JSONException e) {
            call.reject("Invalid productIds array: " + e.getMessage());
            return;
        }
        final QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(products)
                .build();

        ensureConnected(() -> billingClient.queryProductDetailsAsync(params, (billingResult, queryResult) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject("queryProductDetails failed: code=" + billingResult.getResponseCode()
                        + " msg=" + billingResult.getDebugMessage());
                return;
            }
            List<ProductDetails> details = queryResult;
            JSArray out = new JSArray();
            if (details != null) {
                for (ProductDetails pd : details) {
                    productCache.put(pd.getProductId(), pd);
                    JSObject obj = new JSObject();
                    obj.put("productId", pd.getProductId());
                    obj.put("title", pd.getTitle());
                    obj.put("name", pd.getName());
                    obj.put("description", pd.getDescription());
                    List<ProductDetails.SubscriptionOfferDetails> offers = pd.getSubscriptionOfferDetails();
                    if (offers != null && !offers.isEmpty()) {
                        ProductDetails.SubscriptionOfferDetails first = offers.get(0);
                        obj.put("offerToken", first.getOfferToken());
                        List<ProductDetails.PricingPhase> phases = first.getPricingPhases().getPricingPhaseList();
                        if (!phases.isEmpty()) {
                            ProductDetails.PricingPhase phase = phases.get(0);
                            obj.put("formattedPrice", phase.getFormattedPrice());
                            obj.put("priceCurrencyCode", phase.getPriceCurrencyCode());
                            obj.put("priceAmountMicros", phase.getPriceAmountMicros());
                        }
                    }
                    out.put(obj);
                }
            }
            JSObject ret = new JSObject();
            ret.put("products", out);
            call.resolve(ret);
        }), call);
    }

    @com.getcapacitor.PluginMethod
    public void purchase(final PluginCall call) {
        final String productId = call.getString("productId");
        final String obfuscatedAccountId = call.getString("obfuscatedAccountId");
        if (productId == null) {
            call.reject("productId is required");
            return;
        }

        ensureConnected(() -> {
            ProductDetails details = productCache.get(productId);
            if (details == null) {
                // Auto-query before launching the flow so callers can purchase
                // without a separate queryProducts() round-trip.
                List<QueryProductDetailsParams.Product> q = new ArrayList<>();
                q.add(QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(productId)
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build());
                billingClient.queryProductDetailsAsync(
                        QueryProductDetailsParams.newBuilder().setProductList(q).build(),
                        (br, qr) -> {
                            List<ProductDetails> list = qr;
                            if (br.getResponseCode() != BillingClient.BillingResponseCode.OK
                                    || list == null || list.isEmpty()) {
                                call.reject("Product " + productId + " not found in Play Console.");
                                return;
                            }
                            ProductDetails pd = list.get(0);
                            productCache.put(productId, pd);
                            launchBillingFlow(call, pd, obfuscatedAccountId);
                        }
                );
            } else {
                launchBillingFlow(call, details, obfuscatedAccountId);
            }
        }, call);
    }

    private void launchBillingFlow(PluginCall call, ProductDetails details, String obfuscatedAccountId) {
        List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) {
            call.reject("Product " + details.getProductId() + " has no base plan/offer published.");
            return;
        }
        String offerToken = offers.get(0).getOfferToken();
        BillingFlowParams.ProductDetailsParams pdp = BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(details)
                .setOfferToken(offerToken)
                .build();
        BillingFlowParams.Builder builder = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(List.of(pdp));
        if (obfuscatedAccountId != null && !obfuscatedAccountId.isEmpty()) {
            builder.setObfuscatedAccountId(obfuscatedAccountId);
        }
        // Save the call so onPurchasesUpdated can resolve it.
        bridge.saveCall(call);
        pendingPurchaseCallId = call.getCallbackId();
        BillingResult result = billingClient.launchBillingFlow(getActivity(), builder.build());
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            pendingPurchaseCallId = null;
            bridge.releaseCall(call);
            call.reject("launchBillingFlow failed: code=" + result.getResponseCode()
                    + " msg=" + result.getDebugMessage());
        }
    }

    private String pendingPurchaseCallId = null;

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult billingResult, List<Purchase> purchases) {
        PluginCall call = pendingPurchaseCallId != null ? bridge.getSavedCall(pendingPurchaseCallId) : null;

        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            if (call != null) {
                JSObject ret = new JSObject();
                ret.put("status", "userCancelled");
                call.resolve(ret);
                bridge.releaseCall(call);
            }
            pendingPurchaseCallId = null;
            return;
        }

        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null) {
            if (call != null) {
                call.reject("Purchase failed: code=" + billingResult.getResponseCode()
                        + " msg=" + billingResult.getDebugMessage());
                bridge.releaseCall(call);
            }
            pendingPurchaseCallId = null;
            return;
        }

        // Emit each purchase as a "purchaseUpdated" event so the JS layer
        // can verify with the server even for purchases that arrive outside
        // an active purchase() call (e.g. pending purchase completing later).
        for (Purchase p : purchases) {
            JSObject event = purchaseToJs(p);
            notifyListeners("purchaseUpdated", event);
        }

        if (call != null) {
            // Resolve the active call with the first (newest) purchase.
            Purchase p = purchases.get(0);
            JSObject ret = purchaseToJs(p);
            ret.put("status", "success");
            call.resolve(ret);
            bridge.releaseCall(call);
            pendingPurchaseCallId = null;
        }
    }

    private JSObject purchaseToJs(Purchase p) {
        JSObject obj = new JSObject();
        obj.put("purchaseToken", p.getPurchaseToken());
        obj.put("orderId", p.getOrderId());
        obj.put("packageName", p.getPackageName());
        obj.put("purchaseTime", p.getPurchaseTime());
        obj.put("purchaseState", p.getPurchaseState()); // 1=PURCHASED, 2=PENDING
        obj.put("acknowledged", p.isAcknowledged());
        obj.put("autoRenewing", p.isAutoRenewing());
        List<String> products = p.getProducts();
        if (!products.isEmpty()) {
            obj.put("productId", products.get(0));
        }
        if (p.getAccountIdentifiers() != null) {
            obj.put("obfuscatedAccountId", p.getAccountIdentifiers().getObfuscatedAccountId());
        }
        return obj;
    }

    @com.getcapacitor.PluginMethod
    public void acknowledge(final PluginCall call) {
        final String purchaseToken = call.getString("purchaseToken");
        if (purchaseToken == null) {
            call.reject("purchaseToken is required");
            return;
        }
        ensureConnected(() -> {
            AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
                    .setPurchaseToken(purchaseToken)
                    .build();
            billingClient.acknowledgePurchase(params, new AcknowledgePurchaseResponseListener() {
                @Override
                public void onAcknowledgePurchaseResponse(@NonNull BillingResult br) {
                    if (br.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        JSObject ret = new JSObject();
                        ret.put("ok", true);
                        call.resolve(ret);
                    } else {
                        call.reject("acknowledge failed: code=" + br.getResponseCode()
                                + " msg=" + br.getDebugMessage());
                    }
                }
            });
        }, call);
    }

    @com.getcapacitor.PluginMethod
    public void restorePurchases(final PluginCall call) {
        ensureConnected(() -> {
            QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build();
            billingClient.queryPurchasesAsync(params, (br, list) -> {
                if (br.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("restore failed: code=" + br.getResponseCode()
                            + " msg=" + br.getDebugMessage());
                    return;
                }
                JSArray arr = new JSArray();
                if (list != null) {
                    for (Purchase p : list) {
                        arr.put(purchaseToJs(p));
                        // Also fire the listener so JS can re-verify each one.
                        notifyListeners("purchaseUpdated", purchaseToJs(p));
                    }
                }
                JSObject ret = new JSObject();
                ret.put("purchases", arr);
                call.resolve(ret);
            });
        }, call);
    }

    @Override
    protected void handleOnDestroy() {
        if (billingClient != null) {
            billingClient.endConnection();
        }
        super.handleOnDestroy();
    }
}
