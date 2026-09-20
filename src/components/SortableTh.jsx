import React from 'react';

/**
 * Clickable table header toggles ascending / descending sort.
 */
export default function SortableTh({
  columnId,
  sortCol,
  sortDir,
  onSort,
  children,
  className = '',
  align,
  /**
   * Refuse to sort, for a table whose rows have not all arrived.
   *
   * Sorting is client-side, so it can only order the rows already fetched. On a list that loads
   * progressively that produces a confidently wrong answer — the cheapest delivery of the fifty
   * loaded, presented as the cheapest of three hundred — and a sorted table is persuasive enough
   * that nobody thinks to doubt it. Defaults to off, so every existing caller is unaffected.
   */
  disabled = false,
  style: userStyle,
  ...rest
}) {
  const active = sortCol === columnId;
  const mergedStyle = {
    cursor: disabled ? 'default' : 'pointer',
    userSelect: 'none',
    ...(align ? { textAlign: align } : {}),
    ...(userStyle || {}),
  };
  const sort = (e) => {
    e.stopPropagation();
    if (disabled) return;
    onSort(columnId);
  };
  return (
    <th
      {...rest}
      className={
        `data-table-sortable${disabled ? ' data-table-sortable--disabled' : ''} ${className}`.trim()
      }
      style={mergedStyle}
      role="columnheader"
      scope="col"
      // The arrow stays when disabled: a refetch can begin with a sort already applied, and the
      // rows on screen really are still in that order, so hiding it would misdescribe the table.
      aria-sort={
        active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined
      }
      aria-disabled={disabled || undefined}
      onClick={sort}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          sort(e);
        }
      }}
      tabIndex={disabled ? -1 : 0}
    >
      <span style={{ verticalAlign: 'middle' }}>
        {children}
        {/*
          Classed, not bare text: the arrow is a control, not part of the column's name, and the
          CSV export strips it by that class. Without it a downloaded file had "Ism ▲" as a
          heading — and the arrow moves as you sort, so the heading changed between downloads.
        */}
        {active ? <span className="sort-indicator">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span> : ''}
      </span>
    </th>
  );
}
