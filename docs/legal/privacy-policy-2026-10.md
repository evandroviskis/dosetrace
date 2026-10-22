# DoseTrace — Privacy Policy

Last updated: October 22, 2026

Outcom ("we", "us") operates the DoseTrace mobile app for iPhone and Android. This policy explains what information the app handles, where it goes, and what you can do about it. DoseTrace is a personal journal and a calculator. It does not give medical advice.

## 1. Information you give us

**Account.** Your email address, or the account details Apple or Google share when you choose "Continue with Apple" or "Continue with Google" (your email, or an Apple private relay address, and the name you allow). Apple and Google run that sign-in for us. If you sign in with Apple, we keep a token from Apple on our server so that we can end your Apple sign-in when you delete your account. If you use email, your password is handled by our authentication provider and never stored in readable form.

**Profile (needed to use the app).** Name, birth month and year, country, sex assigned at birth, your goals, activity level, what you track (peptides, hormones / TRT, GLP-1 / weight loss, oral supplements), and whether you work with a healthcare provider. The app asks for all of these before you can use it, and uses them to personalize the screens and to run its calculators. In the calculators you can also enter your height, weight, body-fat percentage, and body measurements.

**Health and journal data.** The protocols you create (compounds, doses, schedules, reminder times), the doses you log (taken, skipped, injection sites), vials and bottles, lab results, vaccination records, food-log entries with their estimated nutrition values, weigh-ins, "Reality check" results, and the notes you write.

## 2. Where your information is kept

Your data is saved in a database on your phone. When you have an account, it is also synced to our cloud database hosted by **Supabase** (United States), so it is backed up and available on your other devices. Data is encrypted in transit (TLS) and encrypted at rest by our hosting provider. Sign-in tokens are kept in your phone's secure storage.

Signing out removes your DoseTrace records from the app on that phone; they stay in your account and come back when you sign in again. Files you exported stay where they were saved.

## 3. How we use it

Only to run DoseTrace for you: show your journal, calculate your numbers, schedule your reminders, sync your devices, and keep your account working. We do not sell your information, we do not show ads, and we do not share your health data with insurers, employers, advertisers, or data brokers.

## 4. Reminders and notifications

Dose, vial, food-log, and check-in reminders are scheduled on your phone. To keep reminders arriving on Android even when you do not open the app (Android can pause apps that are not opened), our server sends your Android phone one silent message a day. It contains no text and no health data; it only asks the app to refresh the reminders already on your phone.

To deliver notifications we store a device notification token with your account. Notifications pass through **Expo** (our push service), **Google Firebase Cloud Messaging** on Android and **Apple Push Notification service** on iPhone. You can turn reminders off, or use Silent mode, in Settings at any time.

**Messages from the DoseTrace team.** We may send your account a short message about your account or support (for example, that your Premium access was unlocked or that a problem you reported was fixed). It arrives as a notification, unless notifications are off or Silent mode is on, and it is also shown inside the app, in Settings › Support › Team messages. We never use these messages for health, dose, or treatment advice. The messages are stored with your account and deleted when you delete it; we also record when each one was sent, to how many devices, and when you read it. To write the notification title in your language, the app saves your app language with your account. Messages we write to you may be translated by our AI provider.

## 5. AI features (optional, only with your permission)

You may choose to use AI to save typing: scanning a lab report, a vaccination card, or a vial label, describing your meals in the AI food log, or answering the protocol assistant's questions. Only then, and only after you agree in the app (we ask again when a new kind of data would be sent), the photo, PDF, or text you chose is sent to **Anthropic PBC** (United States) to extract or estimate the values. Anthropic acts as our processor for this task only: it processes what you sent only for that request, does not use it to train its models, and deletes it within 30 days, keeping it longer only where needed to enforce its usage policy or the law. The AI never interprets your results and never gives medical, dosing, or dietary advice. You can always type the information yourself instead. We keep a count of how many AI requests you made (for the limits: scans per month, the AI food log per day, and the protocol assistant per week), not the content.

## 6. Purchases

Subscriptions are paid through the **Apple App Store** or **Google Play**; we never see your card. **RevenueCat** tells the app whether your subscription is active; it receives your DoseTrace account ID and your purchase history from the store. Our server also asks **RevenueCat** whether you have Premium, to apply your plan's monthly AI limits.

## 7. App usage information (you can turn it off)

To improve the app we record usage events (for example, that a screen was opened or a dose was logged) in our own **Supabase** database, with a random ID of the installation. They are not linked to your account: never your account ID, and never health details such as compound names, doses, or search text. This is on until you turn it off: you can switch off "Usage analytics" at any time in Settings › Data & privacy.

## 8. How long we keep it

As long as your account exists. A protocol you delete goes to "Recently deleted" and stays there, so you can restore it, until you choose "Delete forever". Delete forever erases its content (name, doses, schedule, notes) and its dose logs and vials; only a small marker remains (an ID, its type, its colour and its dates) so that your other phones know it was deleted. Deleting your account in Settings permanently removes your synced data and your sign-in from our servers; data on your phone is removed when you uninstall the app or sign out.

## 9. Your choices and rights

You can see, change, and delete your data in the app, and delete your whole account from Settings. "Download my data" in Settings exports your records; for anything it does not include, or to ask for deletion, write to us at hello@dosetrace.io. Depending on where you live (for example the EU, the UK, Brazil, or California) you have rights to access, correct, delete, and port your data and to object to its use; we honor these requests for everyone.

## 10. International transfer

Our providers process data in the United States. When you use DoseTrace from another country, your data is transferred there with the protections described in this policy.

## 11. Children

DoseTrace is for adults only: you must be 18 or older to use it. If we learn that a minor's data was collected, we delete it.

## 12. Security

We use technical and organizational safeguards (encryption, row-level access rules so each account can read only its own data, secure token storage). No system is completely secure; tell us at hello@dosetrace.io if you notice a problem.

## 13. Changes

When this policy changes, we update this text and the date above.

## 14. Contact

Outcom — hello@dosetrace.io
