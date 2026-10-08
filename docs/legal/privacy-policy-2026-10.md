# DoseTrace — Privacy Policy

Last updated: October 8, 2026

Outcom ("we", "us") operates the DoseTrace mobile app for iPhone and Android. This policy explains what information the app handles, where it goes and what you can do about it. DoseTrace is a personal journal and a calculator. It does not give medical advice.

## 1. Information you give us

**Account.** Your email address, or the account details Apple or Google share when you choose "Continue with Apple" or "Continue with Google" (your email, or an Apple private relay address, and the name you allow). If you use email, your password is handled by our authentication provider and never stored in readable form.

**Profile (you choose what to fill in).** Name, birth month and year, country, sex assigned at birth, height, weight, body-fat percentage and body measurements, activity level, wellness goals, and whether you work with a healthcare provider. The app uses these to personalize the screens and to run its calculators.

**Health and journal data.** The protocols you create (compounds, doses, schedules, reminder times), the doses you log (taken, skipped, injection sites), vials and bottles, lab results, vaccination records, food-log entries with their estimated nutrition values, weigh-ins, "Your real numbers" results, and the notes you write.

## 2. Where your information is kept

Your data is saved in a database on your phone. When you have an account, it is also synced to our cloud database hosted by **Supabase** (United States), so it is backed up and available on your other devices. Data is encrypted in transit (TLS) and encrypted at rest by our hosting provider. Sign-in tokens are kept in your phone's secure storage.

Signing out removes your DoseTrace data from that phone; it stays in your account and comes back when you sign in again.

## 3. How we use it

Only to run DoseTrace for you: show your journal, calculate your numbers, schedule your reminders, sync your devices, and keep your account working. We do not sell your information, we do not show ads, and we do not share your health data with insurers, employers, advertisers or data brokers.

## 4. Reminders and notifications

Dose, vial, food-log and check-in reminders are scheduled **on your phone**. To keep reminders arriving on Android even when you do not open the app (Android can pause apps that are not opened), our server sends your Android phone **one silent message a day**. It contains no text and no health data; it only asks the app to refresh the reminders already on your phone.

To deliver notifications we store a device notification token with your account. Notifications pass through **Expo** (our push service), **Google Firebase Cloud Messaging** on Android and **Apple Push Notification service** on iPhone. You can turn reminders off, or use Silent mode, in Settings at any time.

## 5. AI features (optional, only with your permission)

You may choose to use AI to save typing: scanning a lab report, a vaccination card or a vial label, describing your meals in the AI food log, or answering the protocol assistant's questions. Only then, and only after you agree in the app (we ask again when a new kind of data would be sent), the photo, PDF or text you chose is sent to **Anthropic PBC** (United States) to extract or estimate the values. Anthropic processes it only for that request, does not use it to train its models, and keeps it only briefly for abuse monitoring. The AI never interprets your results and never gives medical, dosing or dietary advice. You can always type the information yourself instead. We keep a count of how many AI requests you made (for the monthly limits), not the content.

## 6. Purchases

Subscriptions are paid through the **Apple App Store** or **Google Play**; we never see your card. **RevenueCat** tells the app whether your subscription is active; it receives your DoseTrace account ID and your purchase history from the store.

## 7. App usage information (you can turn it off)

To improve the app we record anonymous usage events (for example, that a screen was opened or a dose was logged) in our own Supabase database, with a random ID of the installation — never your account ID and never health details such as compound names, doses or search text. You can turn this off in Settings › Data & privacy.

## 8. How long we keep it

As long as your account exists. A protocol you delete stays in "Recently deleted" for 7 days so you can restore it, then it is removed. **Deleting your account** in Settings permanently removes your synced data and your sign-in from our servers; data on your phone is removed when you uninstall the app or sign out.

## 9. Your choices and rights

You can see, change and delete your data in the app, and delete your whole account from Settings. You can also write to us to ask for a copy of your data or for its deletion. Depending on where you live (for example the EU, the UK, Brazil or California) you have rights to access, correct, delete and port your data and to object to its use; we honor these requests for everyone.

## 10. International transfer

Our providers process data in the United States. When you use DoseTrace from another country, your data is transferred there with the protections described in this policy.

## 11. Children

DoseTrace is for adults only. You confirm you are 18 or older when you create your account. If we learn that a minor's data was collected, we delete it.

## 12. Security

We use technical and organizational safeguards (encryption, row-level access rules so each account can read only its own data, secure token storage). No system is completely secure; tell us at hello@dosetrace.io if you notice a problem.

## 13. Changes

When this policy changes we update the date above and show the change in the app.

## 14. Contact

Outcom — hello@dosetrace.io
