// lib/onboardingFunnel bound to AsyncStorage (its own key; not account data, so the sign-out wipe
// leaves it — it holds step names only and goes with the next sign-in).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createFunnel } from './onboardingFunnel';

export const onboardingFunnel = createFunnel({ storage: AsyncStorage });
