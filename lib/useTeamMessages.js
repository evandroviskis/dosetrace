// A-163: the signed-in account's team messages (newest first) for a screen, live. Shows nothing
// while the shared copy still belongs to another account (lib/teamMessages switches on refresh).
import { useEffect, useState } from 'react';
import { teamMessages, listFor } from './teamMessages';

// { list, loaded }: loaded once this account's copy was read (the list screen's empty line waits for it).
export function useTeamMessageList(userId) {
  const tm = teamMessages();
  const [snap, setSnap] = useState(() => tm.snapshot());
  useEffect(() => {
    setSnap(tm.snapshot());
    return tm.subscribe(setSnap);
  }, [tm]);
  return listFor(snap, userId);
}

export function useTeamMessages(userId) {
  return useTeamMessageList(userId).list;
}
