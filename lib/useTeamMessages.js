// A-163: the signed-in account's team messages (newest first) for a screen, live. Shows nothing
// while the shared copy still belongs to another account (lib/teamMessages switches on refresh).
import { useEffect, useState } from 'react';
import { teamMessages } from './teamMessages';

export function useTeamMessages(userId) {
  const tm = teamMessages();
  const [snap, setSnap] = useState(() => tm.snapshot());
  useEffect(() => {
    setSnap(tm.snapshot());
    return tm.subscribe(setSnap);
  }, [tm]);
  return userId && snap.uid === userId ? snap.list : [];
}
