// AD-96 B copy: lib/curveNotice wired to this app (AsyncStorage, the session's metadata, a merge
// write of one user_metadata key). Never called inside onAuthStateChange.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getCachedUser } from './supabase';
import { createCurveNotice } from './curveNotice';

const notice = createCurveNotice({ storage: AsyncStorage, writeMeta: (data) => supabase.auth.updateUser({ data }) });

// App start: the moment this phone first ran 1.3.2 (fire and forget).
export function markCurveNoticeSince() {
  return notice.markSince().catch(() => null);
}
// The Curve screen on focus: show the card? (protocols = every protocol the curve reads, ended too)
export async function curveNoticeShown(protocols) {
  try {
    const user = await getCachedUser();
    if (!user?.id) return false;
    const meta = user.user_metadata || {};
    await notice.flush(user.id, meta);
    return await notice.shouldShow({ userId: user.id, meta, protocols });
  } catch { return false; }
}
export async function dismissCurveNotice() {
  try {
    const user = await getCachedUser();
    if (user?.id) await notice.dismiss(user.id);
  } catch { /* hidden for this open anyway */ }
}
