import UIKit
import Capacitor

// Custom CAPBridgeViewController that EXPLICITLY registers StoreKit2Plugin
// during capacitorDidLoad(). This is the documented Capacitor pattern for
// registering local plugins and is bulletproof against the edge cases that
// can make `packageClassList`-based auto-discovery silently fail (Swift
// module name mismatches, dead-code stripping in release builds, etc).
//
// IMPORTANT: StoreKit2Plugin has been REMOVED from packageClassList in
// capacitor.config.json so it isn't registered twice. Double registration
// would attach two Transaction.updates listeners and double-fire every
// renewal/refund event.
@objc(FuseBridgeViewController)
public class FuseBridgeViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        bridge?.registerPluginInstance(StoreKit2Plugin())
    }
}
