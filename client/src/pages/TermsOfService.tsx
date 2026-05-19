import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSafeBack } from "@/hooks/use-safe-back";
import { PRICE_LABELS } from "@shared/pricing";

export default function TermsOfService() {
  const handleBack = useSafeBack("/");
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-[1000] border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} className="text-slate-900 hover:bg-slate-100" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <span className="font-display font-bold text-xl tracking-tight text-slate-900">Fuse Phone</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 text-slate-900" data-testid="text-terms-title">Terms of Service</h1>
        <p className="text-sm text-slate-600 mb-8">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <div className="prose prose-sm max-w-none space-y-6 text-slate-700">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Agreement to Terms</h2>
            <p>By accessing or using the Fuse Phone service ("Service") at fusephone.com and app.fusephone.com, you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not use the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
            <p>Fuse Phone is a customer relationship management (CRM) platform designed for small businesses. The Service includes lead and contact management, document creation (proposals, invoices, change orders), digital signatures, appointment scheduling, payment tracking, and integrations with third-party services.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Account Registration</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>You must provide accurate and complete registration information</li>
              <li>You are responsible for maintaining the security of your account credentials</li>
              <li>You must be at least 18 years old to create an account</li>
              <li>One person or entity may not maintain multiple free trial accounts</li>
              <li>You are responsible for all activity that occurs under your account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Subscription Plans and Billing</h2>
            <h3 className="text-lg font-medium mb-2">Free Trial</h3>
            <p>We may offer a free trial to new accounts. The length of the trial depends on the signup channel and any current promotion, and the exact length and end date are shown to you at signup before you confirm. As of the date of these Terms, the standard trial lengths are <strong>14 days when you subscribe on the web through Stripe</strong> and <strong>1 week when you subscribe through the Apple App Store</strong>; promotional codes may extend the trial beyond these defaults. A payment method may be required up front (for example, when subscribing through the Apple App Store) so that the subscription can renew automatically when the trial ends. At the end of the trial period, your paid subscription begins automatically at the price disclosed at signup unless you cancel before the trial ends. <strong>You can cancel or change your plan at any time during the trial</strong> — on the web from the Billing screen in your account, and on iOS from <em>Settings → [Your Name] → Subscriptions → FusePhone</em>. If you cancel during the trial you will not be charged.</p>

            <h3 className="text-lg font-medium mb-2 mt-4">Paid Plans</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Starter:</strong> {PRICE_LABELS.starterMonthly}/month - Essential CRM, signatures, unlimited photos with annotations (limited-time bonus, subject to fair use — see "Fair Use &amp; Limited-Time Bonuses" below), 10 AI estimates/month, Gmail &amp; Calendar, online booking</li>
              <li><strong>Core:</strong> {PRICE_LABELS.coreMonthly}/month - Everything in Starter plus Stripe payments, unlimited photos with annotations (limited-time bonus, subject to fair use — see "Fair Use &amp; Limited-Time Bonuses" below), 20 AI estimates/month, AI receipt scanner, basic time tracking, unlimited follow-ups</li>
              <li><strong>Elite:</strong> {PRICE_LABELS.eliteMonthly}/month - Everything in Core plus full VoIP phone system, SMS, all integrations, production rates, multi-user ({PRICE_LABELS.extraSeatMonthly} per extra seat/month), bulk campaigns, and FuseAI (AI proposals, customer sentiment, receipt info extraction, and more) included at no extra cost</li>
              <li><strong>Add-ons (Elite only):</strong> Make It Your Own custom branded portal {PRICE_LABELS.makeItYourOwnMonthly}/month; Extra user seats {PRICE_LABELS.extraSeatMonthly}/seat/month; AI Virtual Assistant {PRICE_LABELS.aiAssistantMonthly}/month for {PRICE_LABELS.aiAssistantMinutes} minutes (then {PRICE_LABELS.aiAssistantOverage}/minute)</li>
            </ul>

            <h3 className="text-lg font-medium mb-2 mt-4">Fair Use &amp; Limited-Time Bonuses</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Some features are offered as <strong>limited-time bonuses</strong> — for example, unlimited photos with annotations on every paid plan. These bonuses are not a permanent part of the plan and may be reduced, capped, replaced with a numeric quota, or removed at any time at our discretion, with reasonable advance notice in-app or by email when practical.</li>
              <li>All "unlimited" features are subject to a <strong>fair-use policy</strong>. Fair use means typical, good-faith business use by a single painting contractor and their crew for managing real customer projects. It does not include bulk archival, mass uploads of unrelated media, automated/scripted uploads, photos unrelated to your projects, resale or redistribution of storage, or any use that, in our reasonable judgment, is materially out of line with how comparable customers on the same plan use the feature.</li>
              <li>If your usage materially exceeds fair use, we may (a) contact you to discuss the usage, (b) ask you to upgrade to a higher plan, (c) impose a numeric cap on your account, (d) throttle further uploads, or (e) in extreme cases, remove or refuse to store additional content. We will use commercially reasonable efforts to give you notice before taking action that affects existing data.</li>
              <li>Photos and other uploaded content remain subject to our overall storage, retention, and acceptable-use rules. We do not guarantee unlimited storage, unlimited bandwidth, or unlimited retention of historical content under any plan.</li>
              <li>If we end a limited-time bonus or change a fair-use threshold, your existing uploaded content will not be deleted solely because of that change; future uploads may, however, be subject to the new limits.</li>
            </ul>

            <h3 className="text-lg font-medium mb-2 mt-4">How You're Billed</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Subscriptions are billed monthly and renew automatically at the end of each billing period unless you cancel at least 24 hours before the renewal date.</li>
              <li>You authorize us (or, on iOS, the App Store) to charge your payment method on a recurring basis at the then-current price for your plan and any active add-ons.</li>
              <li>Subscriptions purchased on our website are processed by Stripe. Subscriptions purchased through the App Store are processed and managed by Apple under Apple's standard subscription terms.</li>
              <li>All prices are in U.S. dollars and exclude any applicable taxes, which may be added at checkout or by Apple.</li>
            </ul>

            <h3 className="text-lg font-medium mb-2 mt-4">Upgrades</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>When you switch to a higher tier mid-period, the upgrade takes effect immediately and you gain access to the new tier right away.</li>
              <li>You will be charged the full price of the new tier on the upgrade date. The unused portion of your current tier (calculated by Apple on iOS, or by Stripe on the web) is automatically credited toward that new charge, so you only pay the difference for the days you've already used.</li>
              <li>Your billing cycle restarts on the upgrade date. Your next renewal will be one month after the upgrade, at the full price of the new tier.</li>
              <li>This proration is the standard behavior set by Apple and Stripe and cannot be disabled.</li>
            </ul>

            <h3 className="text-lg font-medium mb-2 mt-4">Downgrades</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>When you switch to a lower tier, the change takes effect at the end of your current paid billing period. You keep your current (higher) tier and any active add-ons until that date — you don't lose access immediately.</li>
              <li>No refund or prorated credit is issued for the unused portion of the higher tier. You paid for that period, so you receive the full benefit of it.</li>
              <li>On the day your current period ends, your subscription automatically renews at the lower tier's price.</li>
            </ul>

            <h3 className="text-lg font-medium mb-2 mt-4">Add-on Dependencies</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Some add-ons (currently Make It Your Own, AI Virtual Assistant, and FuseAI) require a specific base tier (Elite) to function.</li>
              <li>To downgrade to a tier that does not support an active add-on, you must first cancel the add-on. Once you cancel, both the add-on and the base-tier downgrade will take effect together at the end of your current billing period, and you will keep both until that date.</li>
              <li>Add-ons purchased through the App Store can only be cancelled by you in iOS Settings → Apple ID → Subscriptions. Apple does not allow us to cancel App Store subscriptions on your behalf.</li>
              <li>Add-ons purchased on the web can be cancelled directly from the Billing page in your account.</li>
            </ul>

            <h3 className="text-lg font-medium mb-2 mt-4">Cancellations and Refunds</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>You may cancel your subscription at any time. Cancellation takes effect at the end of your current billing period. You retain access until that date.</li>
              <li>We do not issue refunds or prorated credits for unused subscription time, partial months, accidental purchases, or unused features. All sales are final to the extent permitted by law.</li>
              <li>For purchases made through the App Store, all refund requests are handled exclusively by Apple under Apple's refund policy. We have no ability to issue refunds for App Store transactions.</li>
              <li>For web purchases, refund requests outside of these terms are reviewed at our sole discretion and are not guaranteed.</li>
            </ul>

            <h3 className="text-lg font-medium mb-2 mt-4">Promotional Offers</h3>
            <p>Promotional pricing, free-trial extensions, and discount codes apply only for the period or duration stated. Once a promotional period ends, the subscription automatically renews at the standard list price unless cancelled.</p>

            <h3 className="text-lg font-medium mb-2 mt-4">Failed Payments</h3>
            <p>If a renewal payment fails, we (or Apple) may retry the charge. If the charge cannot be collected within a reasonable retry window, your subscription may be suspended or downgraded until payment is successfully processed.</p>

            <h3 className="text-lg font-medium mb-2 mt-4">Price Changes</h3>
            <p>We may change subscription prices at any time. Price changes apply only to billing periods that begin after the change is communicated to you. We will provide notice by email or in-app at least 30 days before any price change takes effect on an existing subscription. Your continued use of the Service after a price change becomes effective constitutes acceptance of the new price.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Your Data and Content</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>You retain ownership of all data and content you upload to the Service</li>
              <li>You grant us a limited license to store, process, and display your data as needed to provide the Service</li>
              <li>You are responsible for ensuring you have the right to upload and share any content through the Service</li>
              <li>You must not upload content that is illegal, harmful, or violates the rights of others</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Use the Service for any unlawful purpose</li>
              <li>Send spam, unsolicited messages, or harassing communications through the Service</li>
              <li>Attempt to gain unauthorized access to the Service or other users' accounts</li>
              <li>Interfere with the proper operation of the Service</li>
              <li>Reverse engineer, decompile, or disassemble any aspect of the Service</li>
              <li>Use the Service to transmit malware or other harmful code</li>
              <li>Resell or redistribute the Service without our written permission</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Third-Party Integrations</h2>
            <p>The Service integrates with third-party services including Twilio, Google (Gmail, Calendar, Maps), Stripe, CompanyCam, Thumbtack, and Zapier. Your use of these integrations is subject to the respective third-party terms of service. We are not responsible for the availability, accuracy, or content of third-party services.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Digital Signatures</h2>
            <p>The Service includes digital signature functionality. While we facilitate the collection of digital signatures on documents, we make no guarantees about the legal enforceability of digital signatures in your jurisdiction. You are responsible for ensuring compliance with applicable electronic signature laws.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Service Availability</h2>
            <p>We strive to maintain high availability of the Service but do not guarantee uninterrupted access. We may perform maintenance or updates that temporarily affect service availability. We will make reasonable efforts to provide advance notice of planned downtime.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Limitation of Liability</h2>
            <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, FUSE PHONE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR BUSINESS OPPORTUNITIES, REGARDLESS OF THE CAUSE OF ACTION OR THEORY OF LIABILITY.</p>
            <p className="mt-2">Our total liability to you for any claims arising from or related to the Service shall not exceed the amount you paid us in the twelve (12) months preceding the claim.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Disclaimer of Warranties</h2>
            <p>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Account Closure, Termination, and Data Retention</h2>

            <h3 className="text-lg font-medium mb-2">Closing Your Account</h3>
            <p>You may delete your account at any time from <strong>Company Profile → Delete Account</strong> in the app, or by contacting us at support@fusephone.com. When you delete your account:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Your login is revoked immediately. You are signed out on every device.</li>
              <li>Your account enters a <strong>60-day grace period</strong>. During this window your data is preserved but inaccessible to you (except by restoring the account).</li>
              <li>Any active web (Stripe) subscription is scheduled to cancel at the end of its current paid period. You keep access to paid features through that period if you restore the account before the grace period ends.</li>
              <li>App Store (Apple) subscriptions are <strong>not</strong> cancelled by deleting your account — Apple does not allow us to cancel subscriptions on your behalf. You must cancel them yourself in iOS Settings → Apple ID → Subscriptions.</li>
              <li>Connected third-party tokens (Twilio, Google, Facebook, CompanyCam, Square, Stripe Connect, Thumbtack, Zapier, OpenPhone, etc.) are cleared so the app can no longer act on your behalf.</li>
            </ul>

            <h3 className="text-lg font-medium mb-2 mt-4">Restoring Your Account</h3>
            <p>At any time within the 60-day grace period, you can restore your account by signing back in with the same email and password. All data, settings, integrations, and subscription status are reinstated. You may also choose to permanently delete your account immediately during the grace period (skipping the 60-day wait) from the restore screen.</p>

            <h3 className="text-lg font-medium mb-2 mt-4">Permanent Deletion</h3>
            <p>If you do not restore your account within 60 days, your workspace data is permanently deleted by an automated background job. This includes: contacts, projects, documents, photos, templates, work orders, color selections, time entries, communications, call recordings, voicemails, paint orders, campaigns, scheduled messages, team members, materials, and uploaded files in object storage. Permanent deletion is <strong>not reversible</strong>.</p>

            <h3 className="text-lg font-medium mb-2 mt-4">Termination by Us</h3>
            <p>We may suspend or terminate your account, with or without notice, if you violate these Terms, fail to pay, abuse the Service, or use it in a way that creates legal, security, or reputational risk for us or our other users. The same 60-day grace and permanent-deletion process applies, except in cases of fraud, security incidents, or legal orders, where we may purge data immediately or as required by law.</p>

            <h3 className="text-lg font-medium mb-2 mt-4">Records We Are Required to Keep</h3>
            <p>Even after your workspace data is permanently deleted, we are legally required to retain a small set of records:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Billing and tax records</strong> — invoices, payment receipts, refund history, payment processor IDs, and subscription tier history. Retained for the period required by U.S. federal and state tax law (generally up to 7 years).</li>
              <li><strong>Apple and Stripe transaction identifiers</strong> — including the original Apple transaction ID and Stripe customer/subscription IDs, retained as required by Apple's and Stripe's processor agreements.</li>
              <li><strong>Records under legal hold</strong> — retained as long as needed to comply with subpoenas, court orders, ongoing disputes, fraud investigations, or regulatory requests.</li>
              <li><strong>Aggregated and anonymized data</strong> — may be retained indefinitely for analytics and Service improvement; this data cannot be used to identify you.</li>
            </ul>
            <p className="mt-2">All directly identifying personal information (name, email, profile image, password, password reset tokens, verification tokens, referral code) is stripped from these retained records during permanent deletion.</p>

            <h3 className="text-lg font-medium mb-2 mt-4">Customer Data You Collected Through the Service</h3>
            <p>You are the data controller for the contacts, leads, customers, photos, and other third-party information you upload to the Service. When your account is permanently deleted, that data is deleted along with the rest of your workspace on the timeline above. If any of your customers contact us directly to request deletion of their data, we will direct them to you.</p>

            <h3 className="text-lg font-medium mb-2 mt-4">Backups</h3>
            <p>Database backups containing your data are rotated on a regular schedule. Any residual copies in backups are overwritten in the normal course of backup rotation, generally within 90 days of permanent deletion.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">13. Changes to These Terms</h2>
            <p>We reserve the right to modify, update, or replace these Terms at any time, in our sole discretion. Non-material changes (clarifications, formatting, typo corrections, or updates that do not reduce your rights or change pricing) take effect immediately upon posting and we are not required to notify you. Material changes — including changes to pricing, billing, refund policy, cancellation rules, or your data rights — will be communicated by email, in-app notice, or both, at least 30 days before they take effect on existing subscribers (or as soon as reasonably practicable if a shorter period is required by law or by Apple's or Stripe's policies).</p>
            <p className="mt-2">The "Last updated" date at the top of this page reflects the most recent revision. Your continued use of the Service after a change becomes effective constitutes your acceptance of the updated Terms. If you do not agree to a change, your sole remedy is to stop using the Service and cancel your subscription before the change takes effect.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">14. Governing Law</h2>
            <p>These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to conflict of law principles.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">15. Referral Program</h2>
            <p>The Fuse Phone Referral Program lets eligible users invite friends in exchange for account credit. By participating you agree to these additional terms:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Eligibility.</strong> You must have an active or trialing Fuse Phone subscription to refer others. Affiliates participate in the Affiliate Program below instead.</li>
              <li><strong>Friend discount.</strong> Each newly referred user receives a $10 discount applied to their first paid month, automatically at checkout.</li>
              <li><strong>Your reward.</strong> You receive $10 in account credit after your friend's first paid invoice succeeds (excluding trial periods, refunds, or chargebacks). Credit may be applied to your Stripe billing balance or redeemed as a virtual gift card subject to availability.</li>
              <li><strong>Self-referral and fraud.</strong> Self-referrals, duplicate accounts, fake sign-ups, paid traffic that violates Stripe or carrier terms, incentivized clicks, or any abuse may result in voided rewards, account suspension, and clawback.</li>
              <li><strong>Gift card requests.</strong> Gift cards are queued and fulfilled within 5 business days. Once a request is submitted, the corresponding balance is removed from your account. Declined requests are returned to your balance.</li>
              <li><strong>Changes & termination.</strong> We may modify, pause, or terminate the program at any time. Outstanding earned credit will be honored to the extent permitted by law.</li>
              <li><strong>Tax.</strong> You are responsible for any taxes that apply to your rewards.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">16. Affiliate Program</h2>
            <p>The Fuse Phone Affiliate Program is open to approved partners who promote Fuse Phone. By applying and continuing as an Affiliate, you agree to:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Approval.</strong> Affiliate status is granted at our discretion based on your application. We may reject, pause, or terminate participation at any time.</li>
              <li><strong>Single role.</strong> You cannot participate in both the Referral Program and the Affiliate Program at the same time. Becoming an Affiliate replaces any future $10 friend-referral rewards with the affiliate commission structure below.</li>
              <li><strong>Commission.</strong> Approved Affiliates earn 10% of net subscription revenue paid by each referred customer for 12 months from that customer's first paid invoice. Trials, refunds, chargebacks, taxes, and one-time fees are excluded.</li>
              <li><strong>7-day hold.</strong> Each commission is held for 7 days after it is earned to allow for refunds and chargebacks before becoming eligible for payout.</li>
              <li><strong>Payouts.</strong> Payouts are made monthly via Stripe Connect. You must complete Stripe Connect onboarding (including bank and tax information) before any payout can be processed. Minimum payout is $25; smaller balances roll forward.</li>
              <li><strong>1099 / tax reporting.</strong> US Affiliates earning over the IRS threshold in a calendar year will receive a Form 1099. You are responsible for paying any taxes due.</li>
              <li><strong>Promotion rules.</strong> No spam, no misrepresentation, no trademark bidding on "Fuse Phone" or close variants in paid search, no cookie stuffing, no incentivized clicks, no impersonation. You must clearly disclose your affiliate relationship where required by law (FTC, etc.).</li>
              <li><strong>Fraud & clawback.</strong> Commissions tied to fraudulent, duplicate, refunded, or charged-back customers will be reversed. Repeated abuse results in termination and forfeiture of unpaid commissions.</li>
              <li><strong>No guarantee.</strong> Participation in the Affiliate Program does not guarantee any minimum earnings. Conversion rates and customer retention vary.</li>
              <li><strong>Termination.</strong> Either party may terminate the relationship at any time. Earned, eligible commissions through the termination date will be paid on the next regular cycle.</li>
              <li><strong>Changes.</strong> We may modify the commission rate, hold period, payout schedule, or any other term with at least 30 days' notice. Changes apply prospectively.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">17. Contact</h2>
            <p>For questions about these Terms, please contact us at:</p>
            <p className="mt-2">
              <strong>Email:</strong> support@fusephone.com<br />
              <strong>Website:</strong> fusephone.com
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
