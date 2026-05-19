import Foundation
import Capacitor
import StoreKit
import os.log

@objc(StoreKit2Plugin)
public class StoreKit2Plugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKit2Plugin"
    public let jsName = "StoreKit2"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pendingPurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPendingPurchase", returnType: CAPPluginReturnPromise),
    ]

    private var updateListenerTask: Task<Void, Error>?

    // Native logger so we can see Apple's behavior in the device Console even
    // when the Capacitor bridge drops call.resolve(). This is what answers
    // "did Apple actually return anything?" without relying on JS logs.
    private let log = OSLog(subsystem: "com.fusephone.app", category: "StoreKit2")
    private func nlog(_ msg: String) {
        os_log("%{public}@", log: self.log, type: .info, msg)
        NSLog("[StoreKit2Plugin] %@", msg)
    }

    // UserDefaults key — bulletproof recovery storage. Every transaction
    // Swift sees from product.purchase() or Transaction.updates is written
    // here BEFORE we try to call.resolve() or notifyListeners(). The JS
    // bridge can drop those messages when the WebView is briefly suspended
    // (which happens reliably while Apple's purchase sheet is on screen),
    // so JS polls pendingPurchases() on init / app resume / paywall open
    // to recover any txns that didn't make it across the bridge.
    private let pendingKey = "fp.iap.pendingTransactions.v1"
    private let pendingQueue = DispatchQueue(label: "fp.iap.pending.queue")

    public override func load() {
        nlog("load(): starting Transaction.updates listener and Transaction.unfinished sweep")
        updateListenerTask = listenForTransactions()
        // Apple's documented recovery pattern: at launch, iterate
        // Transaction.unfinished to pick up any transactions that arrived
        // while the app was closed or suspended (the updates listener only
        // fires for new updates while it is actively listening).
        Task.detached { [weak self] in
            await self?.sweepUnfinishedTransactions(reason: "launch")
        }
    }

    deinit {
        updateListenerTask?.cancel()
    }

    // MARK: - Pending-transaction persistence

    private func persistPendingTransaction(jws: String, transactionId: String, originalTransactionId: String, productId: String) {
        // ASYNC write — does NOT block the caller (Apple's Transaction.updates
        // delivery, the @MainActor purchase path, or the unfinished-sweep).
        // Previously this was .sync, which serialized the main-actor thread
        // behind UserDefaults I/O during restoreBursts. Safe because reads
        // (loadPendingTransactions, removePendingTransaction) stay on the
        // same serial queue, so ordering is preserved.
        pendingQueue.async { [weak self] in
            guard let self = self else { return }
            let defaults = UserDefaults.standard
            var arr = defaults.array(forKey: self.pendingKey) as? [[String: Any]] ?? []
            // Dedupe by transactionId — the same txn can show up via both
            // purchase() and Transaction.updates within milliseconds.
            if arr.contains(where: { ($0["transactionId"] as? String) == transactionId }) {
                return
            }
            arr.append([
                "transactionId": transactionId,
                "originalTransactionId": originalTransactionId,
                "productId": productId,
                "jws": jws,
                "ts": Date().timeIntervalSince1970 * 1000
            ])
            // Cap at 50 to avoid unbounded growth; oldest first.
            if arr.count > 50 {
                arr = Array(arr.suffix(50))
            }
            defaults.set(arr, forKey: self.pendingKey)
            self.nlog("persistPendingTransaction: txn=\(transactionId) product=\(productId) (now persisted for JS recovery)")
        }
    }

    private func loadPendingTransactions() -> [[String: Any]] {
        return pendingQueue.sync {
            return UserDefaults.standard.array(forKey: pendingKey) as? [[String: Any]] ?? []
        }
    }

    private func removePendingTransaction(transactionId: String) -> Bool {
        return pendingQueue.sync {
            let defaults = UserDefaults.standard
            var arr = defaults.array(forKey: pendingKey) as? [[String: Any]] ?? []
            let before = arr.count
            arr.removeAll { ($0["transactionId"] as? String) == transactionId }
            defaults.set(arr, forKey: pendingKey)
            return arr.count < before
        }
    }

    // Apple-documented recovery: at launch (and on demand) iterate
    // Transaction.unfinished. Persist anything we haven't seen so JS can
    // sync it. We do NOT call finish() here — finish() is called only after
    // the server confirms the entitlement, by JS via finishTransaction().
    private func sweepUnfinishedTransactions(reason: String) async {
        var count = 0
        for await result in Transaction.unfinished {
            if case .verified(let txn) = result {
                count += 1
                nlog("sweepUnfinished[\(reason)]: found unfinished txn=\(txn.id) product=\(txn.productID) originalTxn=\(txn.originalID) — persisting for JS recovery")
                persistPendingTransaction(
                    jws: result.jwsRepresentation,
                    transactionId: String(txn.id),
                    originalTransactionId: String(txn.originalID),
                    productId: txn.productID
                )
                // Also broadcast — if a JS listener is up, it can sync immediately.
                self.notifyListeners("transactionUpdated", data: [
                    "transactionId": String(txn.id),
                    "originalTransactionId": String(txn.originalID),
                    "productId": txn.productID,
                    "jws": result.jwsRepresentation,
                    "source": "unfinished-sweep"
                ])
            }
        }
        nlog("sweepUnfinished[\(reason)]: complete, persisted \(count) txn(s)")
    }

    @objc func pendingPurchases(_ call: CAPPluginCall) {
        let arr = loadPendingTransactions()
        // Strip the local "ts" before handing back to JS — JS only needs
        // the SK2Transaction shape.
        let mapped: [[String: Any]] = arr.map { entry in
            var out: [String: Any] = [:]
            if let v = entry["transactionId"] as? String { out["transactionId"] = v }
            if let v = entry["originalTransactionId"] as? String { out["originalTransactionId"] = v }
            if let v = entry["productId"] as? String { out["productId"] = v }
            if let v = entry["jws"] as? String { out["jws"] = v }
            return out
        }
        // Also opportunistically run the unfinished sweep — if JS is asking
        // for pending purchases, it's a recovery moment, so make sure we
        // haven't missed anything Apple is still holding.
        Task.detached { [weak self] in
            await self?.sweepUnfinishedTransactions(reason: "pendingPurchases-poll")
        }
        call.resolve(["transactions": mapped])
    }

    @objc func clearPendingPurchase(_ call: CAPPluginCall) {
        guard let txnId = call.getString("transactionId") else {
            call.reject("transactionId required")
            return
        }
        let cleared = removePendingTransaction(transactionId: txnId)
        call.resolve(["cleared": cleared])
    }

    // MARK: - StoreKit 2 wrappers

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let ids = call.getArray("productIds", String.self) else {
            call.reject("productIds (string[]) required")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: ids)
                let mapped: [[String: Any]] = products.map { p in
                    var obj: [String: Any] = [
                        "id": p.id,
                        "displayName": p.displayName,
                        "description": p.description,
                        "price": NSDecimalNumber(decimal: p.price).doubleValue,
                        "displayPrice": p.displayPrice
                    ]
                    obj["currencyCode"] = p.priceFormatStyle.currencyCode
                    return obj
                }
                call.resolve(["products": mapped])
            } catch {
                call.reject("getProducts failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId required")
            return
        }
        let appAccountToken = call.getString("appAccountToken")
        nlog("purchase() called: productId=\(productId) appAccountToken=\(appAccountToken ?? "nil")")

        // Apple-documented gate: bail out if the device cannot make payments
        // (parental controls, MDM restriction, etc). Without this check the
        // purchase sheet either fails silently or shows a confusing system
        // dialog. Returning a clean error lets JS surface a useful message.
        if !AppStore.canMakePayments {
            nlog("purchase(\(productId)): AppStore.canMakePayments == false — device cannot make payments (restrictions/parental controls)")
            call.resolve([
                "status": "cannotMakePayments",
                "message": "This device is not allowed to make purchases. Check Screen Time / Restrictions in Settings."
            ])
            return
        }

        // CRITICAL: run on @MainActor.
        //
        // Apple's StoreKit 2 sample code (Backyard Birds, In-App Purchase
        // sample) and the WWDC 21/22 sessions all invoke product.purchase()
        // from a MainActor context (typically a SwiftUI Button's action,
        // which is implicitly MainActor). The purchase sheet presentation
        // walks the responder chain to find a presenting UIViewController,
        // and that walk requires the main thread. When we instead start a
        // bare `Task { try await product.purchase() }` inside a CAPPlugin
        // method (which the bridge invokes from a background queue), the
        // sheet can present but the await continuation is wired to a
        // background actor. In real-world reports — including ours, where
        // logs show the call entered Swift but no result ever returned —
        // the await never resumes after the sheet dismisses.
        //
        // Pinning the entire flow to @MainActor matches Apple's reference
        // implementation exactly and removes that ambiguity.
        Task { @MainActor in
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    self.nlog("purchase(\(productId)): Product.products returned EMPTY — product not configured in App Store Connect or not available in this storefront")
                    call.reject("Product \(productId) not found in App Store")
                    return
                }
                self.nlog("purchase(\(productId)): product loaded (price=\(product.displayPrice)), calling product.purchase()...")

                var options: Set<Product.PurchaseOption> = []
                if let tokenStr = appAccountToken, let uuid = UUID(uuidString: tokenStr) {
                    options.insert(.appAccountToken(uuid))
                }

                let started = Date()
                let result = try await product.purchase(options: options)
                let elapsed = Int(Date().timeIntervalSince(started) * 1000)
                self.nlog("purchase(\(productId)): product.purchase() RETURNED after \(elapsed)ms")

                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let txn):
                        self.nlog("purchase(\(productId)): SUCCESS verified txn=\(txn.id) product=\(txn.productID) originalTxn=\(txn.originalID)")
                        // Persist FIRST so even if call.resolve() is dropped
                        // by a suspended WebView, JS can recover via
                        // pendingPurchases() on resume.
                        self.persistPendingTransaction(
                            jws: verification.jwsRepresentation,
                            transactionId: String(txn.id),
                            originalTransactionId: String(txn.originalID),
                            productId: txn.productID
                        )
                        call.resolve([
                            "status": "success",
                            "transactionId": String(txn.id),
                            "originalTransactionId": String(txn.originalID),
                            "productId": txn.productID,
                            "jws": verification.jwsRepresentation
                        ])
                    case .unverified(_, let err):
                        self.nlog("purchase(\(productId)): SUCCESS but UNVERIFIED — \(err.localizedDescription)")
                        call.reject("Apple returned an unverified transaction: \(err.localizedDescription)")
                    }
                case .userCancelled:
                    self.nlog("purchase(\(productId)): userCancelled")
                    call.resolve(["status": "userCancelled"])
                case .pending:
                    self.nlog("purchase(\(productId)): pending (Ask to Buy / SCA / etc) — Apple will deliver via Transaction.updates when approved")
                    call.resolve(["status": "pending"])
                @unknown default:
                    self.nlog("purchase(\(productId)): unknown StoreKit result enum case")
                    call.reject("Unknown StoreKit purchase result")
                }
            } catch {
                self.nlog("purchase(\(productId)): THREW \(error.localizedDescription) — full=\(error)")
                call.reject("purchase failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func restorePurchases(_ call: CAPPluginCall) {
        nlog("restorePurchases() called")
        Task {
            do {
                try await AppStore.sync()
                self.nlog("restorePurchases: AppStore.sync() complete")
                var out: [[String: Any]] = []
                for await result in Transaction.currentEntitlements {
                    if case .verified(let txn) = result {
                        var entry: [String: Any] = [
                            "transactionId": String(txn.id),
                            "originalTransactionId": String(txn.originalID),
                            "productId": txn.productID,
                            "jws": result.jwsRepresentation
                        ]
                        if let rev = txn.revocationDate {
                            entry["revocationDate"] = rev.timeIntervalSince1970 * 1000
                        }
                        out.append(entry)
                    }
                }
                self.nlog("restorePurchases: returning \(out.count) verified entitlement(s)")
                // Also sweep unfinished — restore is the user's "fix it"
                // moment, so do everything Apple gives us in one pass.
                await self.sweepUnfinishedTransactions(reason: "restorePurchases")
                call.resolve(["transactions": out])
            } catch {
                self.nlog("restorePurchases: THREW \(error.localizedDescription)")
                call.reject("restorePurchases failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard let idStr = call.getString("transactionId"), let txnId = UInt64(idStr) else {
            call.reject("transactionId (string of UInt64) required")
            return
        }
        // Remove from our pending-recovery store regardless — once the
        // server has confirmed (which is what triggers JS to call finish),
        // we don't want pendingPurchases() to keep replaying it.
        _ = self.removePendingTransaction(transactionId: idStr)
        Task {
            for await result in Transaction.all {
                if case .verified(let txn) = result, txn.id == txnId {
                    await txn.finish()
                    self.nlog("finishTransaction(\(idStr)): finish() complete")
                    call.resolve(["finished": true])
                    return
                }
            }
            self.nlog("finishTransaction(\(idStr)): txn not found in Transaction.all")
            call.resolve(["finished": false])
        }
    }

    @objc func currentEntitlements(_ call: CAPPluginCall) {
        Task {
            var out: [[String: Any]] = []
            for await result in Transaction.currentEntitlements {
                if case .verified(let txn) = result {
                    var entry: [String: Any] = [
                        "transactionId": String(txn.id),
                        "originalTransactionId": String(txn.originalID),
                        "productId": txn.productID,
                        "jws": result.jwsRepresentation,
                        "environment": "\(txn.environment)"
                    ]
                    // Surface revocationDate so JS can avoid syncing refunded
                    // entitlements as if they were active subscriptions. Apple
                    // does include some recently-revoked txns in
                    // currentEntitlements during a brief grace window.
                    if let rev = txn.revocationDate {
                        entry["revocationDate"] = rev.timeIntervalSince1970 * 1000
                    }
                    if let exp = txn.expirationDate {
                        entry["expirationDate"] = exp.timeIntervalSince1970 * 1000
                    }
                    out.append(entry)
                }
            }
            call.resolve(["transactions": out])
        }
    }

    // Self-restarting Transaction.updates listener.
    //
    // Per Apple's docs, Transaction.updates is the canonical mechanism for
    // receiving subscription renewals, refunds, family-sharing changes, and
    // any transaction completed outside the foreground purchase() call.
    // The for-await loop is supposed to run for the lifetime of the app,
    // but if it ever terminates (e.g. due to system cancellation), the
    // listener silently dies and we miss every future update. The wrapper
    // restarts the inner loop indefinitely on exit.
    private func listenForTransactions() -> Task<Void, Error> {
        return Task.detached { [weak self] in
            while !Task.isCancelled {
                self?.nlog("listenForTransactions: (re)entering Transaction.updates loop")
                for await result in Transaction.updates {
                    if case .verified(let txn) = result {
                        let env = "\(txn.environment)"
                        // Revoked transactions (refunds, family-sharing
                        // removal, etc.) come through Transaction.updates
                        // with a non-nil revocationDate. Forwarding them as
                        // "approved" would have the JS side sync a refunded
                        // txn to the server as if it were active, granting
                        // entitlement after a refund. Notify JS with a
                        // distinct event so it can react (e.g. force a
                        // subscription refresh) without treating it as a
                        // new purchase.
                        if let rev = txn.revocationDate {
                            self?.nlog("Transaction.updates: REVOKED txn=\(txn.id) product=\(txn.productID) reason=\(String(describing: txn.revocationReason)) at=\(rev) env=\(env)")
                            self?.notifyListeners("transactionRevoked", data: [
                                "transactionId": String(txn.id),
                                "originalTransactionId": String(txn.originalID),
                                "productId": txn.productID,
                                "revocationDate": rev.timeIntervalSince1970 * 1000,
                                "environment": env
                            ])
                            // Apple's docs: still call finish() on revoked
                            // txns so they don't keep redelivering. JS may
                            // also call finishTransaction; both are safe.
                            await txn.finish()
                            continue
                        }
                        self?.nlog("Transaction.updates: VERIFIED txn=\(txn.id) product=\(txn.productID) originalTxn=\(txn.originalID) env=\(env)")
                        // Persist BEFORE notifying JS — the WebView may be
                        // suspended (e.g. mid-purchase sheet) and the listener
                        // event can be silently dropped by the bridge. JS will
                        // pick this up on next pendingPurchases() poll.
                        self?.persistPendingTransaction(
                            jws: result.jwsRepresentation,
                            transactionId: String(txn.id),
                            originalTransactionId: String(txn.originalID),
                            productId: txn.productID
                        )
                        self?.notifyListeners("transactionUpdated", data: [
                            "transactionId": String(txn.id),
                            "originalTransactionId": String(txn.originalID),
                            "productId": txn.productID,
                            "jws": result.jwsRepresentation,
                            "environment": env
                        ])
                    } else if case .unverified(let txn, let err) = result {
                        self?.nlog("Transaction.updates: UNVERIFIED txn=\(txn.id) product=\(txn.productID) err=\(err.localizedDescription) — NOT forwarding to JS")
                    }
                }
                self?.nlog("listenForTransactions: Transaction.updates loop exited — restarting in 1s")
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
    }
}
