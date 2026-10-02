/**
 * Float the chosen rows to the top of a dropdown list.
 *
 * With a long list — sizes, colours, a few hundred products — what you have already ticked scrolls
 * out of sight, so you cannot see your own selection without hunting for it. Putting the chosen rows
 * first means the answer to "what did I pick?" is always the first thing in the panel.
 *
 * **The order within each block is the list's own order, not the order you clicked in.** Click order
 * would mean the same two sizes sit in a different place depending on which you happened to tick
 * first, and a list that cannot be predicted is slower to read than one that never moved. So the
 * chosen rows keep their relative order, the rest keep theirs, and only the split is new.
 *
 * Reordering happens *after* the search filter, so typing narrows the list and the survivors you had
 * already ticked still come first.
 *
 * A predicate that throws on a malformed row drops that row to the bottom instead of blanking the
 * whole dropdown — a picker that renders nothing is far worse than one with a row out of place.
 */
export default function selectedFirst(items, isSelected) {
  if (!Array.isArray(items)) return [];
  if (typeof isSelected !== 'function') return items.slice();

  const chosen = [];
  const rest = [];
  items.forEach((item) => {
    let hit = false;
    try {
      hit = Boolean(isSelected(item));
    } catch {
      hit = false;
    }
    (hit ? chosen : rest).push(item);
  });
  // Nothing chosen, or everything chosen, both come back out in the original order.
  return chosen.concat(rest);
}
