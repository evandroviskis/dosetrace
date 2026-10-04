'use strict';
// A-46 extension: Today's "waiting to back up" alert — only when the phone is known to be
// offline AND changes are waiting to be pushed. Unknown connectivity (null) shows nothing.
function offlinePendingAlert({ online, pendingCount }) {
  return online === false && Number(pendingCount) > 0;
}
module.exports = { offlinePendingAlert };
