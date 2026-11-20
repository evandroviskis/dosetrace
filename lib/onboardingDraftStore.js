// The onboarding's draft protocol on the phone (docs/specs/onboarding-protocol.md OB-22): the store of
// lib/onboardingDraft bound to AsyncStorage, in its own key. Not account data — nobody signed in owns
// it yet — so the SIGNED_OUT wipe (lib/signedOut) and clearOnboarding never remove it; it goes when it
// is written into the account, discarded by the person (OP-2) or expired. No network here (OB-21).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDraftStore } from './onboardingDraft';

export const draftStore = createDraftStore(AsyncStorage);
