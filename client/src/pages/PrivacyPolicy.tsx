import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSafeBack } from "@/hooks/use-safe-back";

export default function PrivacyPolicy() {
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
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 text-slate-900" data-testid="text-privacy-title">Privacy Policy</h1>
        <p className="text-sm text-slate-600 mb-8">Last updated: February 25, 2026</p>

        <div className="prose prose-sm max-w-none space-y-6 text-slate-700">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
            <p>Fuse Phone ("we," "our," or "us") operates the website fusephone.com and the application at app.fusephone.com, including native iOS and Android apps (collectively, the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>
            <p>We collect the following categories of data to provide and improve our Service:</p>

            <h3 className="text-lg font-medium mb-2 mt-4">Contact Information (Linked to Your Identity)</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Name:</strong> Your full name, collected during account creation or Google Sign-In, used for account management and display within the app.</li>
              <li><strong>Email Address:</strong> Your email address, collected during account creation or Google Sign-In, used for authentication, notifications, and service communications.</li>
              <li><strong>Phone Number:</strong> Your business phone number and your contacts' phone numbers, used for calling, SMS messaging, and communication features within the app.</li>
              <li><strong>Physical Address:</strong> Your business address and your contacts' or project addresses, used for job site management, mapping, and business documents (proposals, invoices).</li>
            </ul>

            <h3 className="text-lg font-medium mb-2 mt-4">Identifiers (Linked to Your Identity)</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>User ID:</strong> A unique identifier assigned to your account, used internally to associate your data and maintain multi-tenant data isolation.</li>
            </ul>

            <h3 className="text-lg font-medium mb-2 mt-4">User Content (Linked to Your Identity)</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Emails or Text Messages:</strong> SMS messages sent and received through the app via Twilio integration, and emails sent through Gmail integration. Used to provide communication features and maintain conversation history.</li>
              <li><strong>Photos or Videos:</strong> Project photos, document images, floor plan uploads, and photo annotations you create within the app. Used for job documentation, proposals, and project management.</li>
              <li><strong>Audio Data:</strong> Call recordings from conference calls, voicemail recordings, and call transcriptions generated via OpenAI Whisper. Used for record-keeping, AI-powered call summaries, and voicemail transcription.</li>
              <li><strong>Customer Support:</strong> Messages and interactions with our FuseAI support chat and Fuse Support page. Used to provide assistance and improve our support services.</li>
              <li><strong>Other User Content:</strong> Business documents (proposals, estimates, invoices, change orders), digital signatures, line item details, project notes, team chat messages, appointment details, and any other content you create or store within the Service.</li>
            </ul>

            <h3 className="text-lg font-medium mb-2 mt-4">Location (Not Linked to Your Identity)</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Precise Location:</strong> If you grant permission, we may access your device's location to provide map-based features such as viewing project locations on Google Maps. Location data is used only for app functionality and is not linked to your identity or stored on our servers.</li>
            </ul>

            <h3 className="text-lg font-medium mb-2 mt-4">Google Sign-In</h3>
            <p>If you sign in with Google, we receive your name, email address, and profile picture from Google. We use this information solely to create and manage your account. We do not access your Google data beyond the basic profile information needed for authentication.</p>

            <h3 className="text-lg font-medium mb-2 mt-4">Integration Data</h3>
            <p>If you connect third-party integrations (Twilio, Gmail, Google Calendar, Google Maps, CompanyCam, Thumbtack, Facebook Lead Ads, Zapier, Stripe), we store the credentials and tokens you provide to enable those integrations. We only access third-party data as needed to provide the requested features. All third-party content displayed in the app is accessed with your explicit authorization.</p>

            <h3 className="text-lg font-medium mb-2 mt-4">Automatically Collected Information</h3>
            <p>We automatically collect certain information when you use the Service, including IP address, browser type, device type, pages visited, and usage patterns. This helps us improve the Service and ensure its security.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
            <p>All data collected is used for <strong>App Functionality</strong> purposes. Specifically, we use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide, maintain, and improve the Service</li>
              <li>Create and manage your account</li>
              <li>Enable communication features (calling, SMS, email)</li>
              <li>Generate and manage business documents (proposals, invoices, estimates)</li>
              <li>Power AI features including proposal assistance, call transcription, and smart scheduling</li>
              <li>Process transactions and send related notifications</li>
              <li>Send you service-related communications (e.g., document views, signature notifications)</li>
              <li>Display project locations on maps</li>
              <li>Respond to your requests and support inquiries</li>
              <li>Monitor and analyze usage trends to improve user experience</li>
              <li>Detect, prevent, and address technical issues and security threats</li>
            </ul>
            <p className="mt-2">We do <strong>not</strong> use any collected data for tracking, advertising, or data mining purposes.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Third-Party Content and Integrations</h2>
            <p>Our app contains, displays, and accesses third-party content through authorized integrations. This includes:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Twilio:</strong> Phone calls, SMS messaging, and voicemail services</li>
              <li><strong>Google APIs:</strong> Gmail (email sending), Google Calendar (appointment sync), Google Maps (location display)</li>
              <li><strong>Stripe:</strong> Payment processing for invoices and subscriptions</li>
              <li><strong>OpenAI:</strong> AI-powered features including proposal assistance and call transcription</li>
              <li><strong>CompanyCam:</strong> Job site photo documentation</li>
              <li><strong>Thumbtack:</strong> Lead import</li>
              <li><strong>Facebook Lead Ads:</strong> Lead capture from social media campaigns</li>
              <li><strong>Zapier:</strong> Webhook-based workflow automation</li>
            </ul>
            <p className="mt-2">All third-party integrations require your explicit authorization before any data is accessed. You can disconnect any integration at any time through the Integrations settings page.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Google API Services - Limited Use Disclosure</h2>
            <p>Fuse Phone's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
            <p className="mt-2">Specifically:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>We only request access to the Google data necessary for the features you enable (profile information for sign-in, Gmail for email sending, Calendar for appointment sync)</li>
              <li>We do not use Google data for advertising or sell it to third parties</li>
              <li>We do not use Google data to build user profiles for advertising</li>
              <li>We store Google data only as long as necessary to provide our Service</li>
              <li>You can revoke Google access at any time through your Google Account settings or through our Integrations page</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Data Sharing and Disclosure</h2>
            <p>We do not sell your personal information. We do not share data with advertisers or data brokers. We may share your information only in the following circumstances:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>With your consent:</strong> When you explicitly authorize sharing (e.g., sending a document to a client, connecting a third-party integration)</li>
              <li><strong>Service providers:</strong> With trusted third-party services that help us operate the Service (e.g., hosting providers, payment processors, communication services)</li>
              <li><strong>Legal requirements:</strong> When required by law or to protect our rights, safety, or the safety of others</li>
              <li><strong>Business transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Data Security</h2>
            <p>We implement industry-standard security measures to protect your data, including:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Encryption of data in transit (HTTPS/TLS)</li>
              <li>Secure password hashing (bcrypt)</li>
              <li>Session-based authentication with secure cookies</li>
              <li>Multi-tenant data isolation (each user's data is separated)</li>
              <li>Push notification tokens stored securely and used only for app notifications</li>
              <li>Regular security reviews and updates</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Data Retention</h2>
            <p>We retain your data for as long as your account is active or as needed to provide our Service.</p>
            <p className="mt-2"><strong>If you delete your account</strong>, your account enters a 60-day grace period during which you can restore it by signing back in. After 60 days, your workspace data — including contacts, projects, documents, photos, templates, communications, call recordings, voicemails, and uploaded files — is permanently deleted by an automated background job. You can also choose to permanently delete your account immediately during the grace period instead of waiting.</p>
            <p className="mt-2"><strong>Records we are required to keep.</strong> Even after permanent deletion, we retain a minimal set of records as required by law or by our payment processors: billing and tax records (invoices, payments, refunds — generally up to 7 years under U.S. tax law), Apple and Stripe transaction identifiers (as required by Apple's and Stripe's processor agreements), records under legal hold (subpoenas, court orders, fraud investigations), and aggregated or anonymized data that cannot be used to identify you. All directly identifying personal information (name, email, profile image, password, tokens) is stripped from these retained records.</p>
            <p className="mt-2"><strong>Backups.</strong> Database backups are rotated regularly; any residual copies of deleted data are overwritten in the normal course of backup rotation, generally within 90 days.</p>
            <p className="mt-2"><strong>Project records.</strong> Call recordings and transcriptions are stored as part of your project records and are deleted when you delete the associated project or your account.</p>
            <p className="mt-2">For full details on the deletion process, including what happens to active subscriptions and connected integrations, see Section 12 of our <a href="/terms" className="underline">Terms of Service</a>.</p>
          </section>

          <section>
            <h2 id="data-rights" className="text-xl font-semibold mb-3 scroll-mt-20">9. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your data</li>
              <li>Withdraw consent for optional data processing</li>
              <li>Disconnect third-party integrations at any time</li>
              <li>Opt out of push notifications through your device settings</li>
              <li>Revoke location permissions through your device settings</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Children's Privacy</h2>
            <p>The Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the updated policy on this page and updating the "Last updated" date.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Contact Us</h2>
            <p>If you have questions about this Privacy Policy or our data practices, please contact us at:</p>
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
