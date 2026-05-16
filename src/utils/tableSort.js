/**
 * Client-side sorting for `.data-table` rows (clicked column headers).
 */
import { useReducer, useCallback, useMemo } from 'react';

export function compareForSort(a, b) {
  const aNil = a == null || (typeof a === 'string' && a.trim() === '');
  const bNil = b == null || (typeof b === 'string' && b.trim() === '');
  if (aNil && bNil) return 0;
  if (aNil) return 1;
  if (bNil) return -1;

  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return 0;
    if (Number.isNaN(a)) return 1;
    if (Number.isNaN(b)) return -1;
    return a - b;
  }

  if (typeof a === 'number' || typeof b === 'number') {
    const na = typeof a === 'number' ? a : Number(String(a).replace(/,/g, ''));
    const nb = typeof b === 'number' ? b : Number(String(b).replace(/,/g, ''));
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  }

  const sa = String(a);
  const sb = String(b);
  const ta = /^-?[0-9.,\s]+$/.test(sa.trim().replace(/\s/g, ''));
  const tb = /^-?[0-9.,\s]+$/.test(sb.trim().replace(/\s/g, ''));
  if (ta && tb) {
    const na = Number(sa.replace(/,/g, ''));
    const nb = Number(sb.replace(/,/g, ''));
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  }

  return sa.localeCompare(sb, undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

/** @param {Record<string,(row:any)=>unknown>} accessors */
export function applySort(rows, sortCol, sortDir, accessors) {
  if (!rows?.length || !sortCol || !accessors || typeof accessors[sortCol] !== 'function') return rows || [];
  const get = accessors[sortCol];
  const sign = sortDir === 'desc' ? -1 : 1;
  return [...rows].sort((r1, r2) => compareForSort(get(r1), get(r2)) * sign);
}

const initialSort = { col: null, dir: 'asc' };

function sortReducer(state, action) {
  if (action.type === 'toggle' && action.col) {
    if (state.col !== action.col) return { col: action.col, dir: 'asc' };
    return { col: action.col, dir: state.dir === 'asc' ? 'desc' : 'asc' };
  }
  return state;
}

export function useClientTableSort(accessors) {
  const [sort, dispatch] = useReducer(sortReducer, initialSort);

  const onHeaderClick = useCallback((col) => dispatch({ type: 'toggle', col }), []);

  const sortRows = useCallback(
    (rows) => applySort(rows || [], sort.col, sort.dir, accessors || {}),
    [sort.col, sort.dir, accessors]
  );

  return useMemo(
    () => ({
      sortCol: sort.col,
      sortDir: sort.dir,
      onHeaderClick,
      sortRows,
    }),
    [sort.col, sort.dir, onHeaderClick, sortRows]
  );
}
