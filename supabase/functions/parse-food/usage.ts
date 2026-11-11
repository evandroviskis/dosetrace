// The food-parse usage slot (ai_food_usage). Pure, no Deno imports, so it also runs
// under plain node --test (__tests__/abandonedRead.test.js).
//
// The slot is reserved BEFORE the model call, so refusals, junk and provider errors
// still count (abuse bound). The one exception: a parse that never reached the phone.
// When the request's abort signal says the client disconnected while the model was
// working (phone timeout, app closed), the slot is given back: a read counts only if
// it was delivered (founder 2026-11-11).
// A failed reservation insert never blocks the parse (fail open, logged by the caller).

export async function countIfDelivered<T>({ signal, reserve, release, work }: {
  signal?: AbortSignal | null;
  reserve: () => Promise<string | number | null>;
  release: (id: string | number) => Promise<void>;
  work: () => Promise<T>;
}): Promise<T> {
  const id = await reserve();
  const giveBackIfGone = async () => {
    if (id != null && signal?.aborted === true) await release(id).catch(() => {});
  };
  let result: T;
  try {
    result = await work();
  } catch (err) {
    await giveBackIfGone();
    throw err;
  }
  await giveBackIfGone();
  return result;
}
