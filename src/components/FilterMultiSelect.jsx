import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';

function normalizeOptions(options) {
  return (options || []).map((o) =>
    typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label ?? o.value },
  );
}

/**
 * Filter-toolbar multi-select with checkbox dropdown (matches FilterSearchableSelect styling).
 */
export default function FilterMultiSelect({
  values = [],
  onChange,
  options = [],
  emptyLabel = '',
  placeholder,
  'aria-label': ariaLabel,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [panelPos, setPanelPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);

  const selectedSet = useMemo(() => new Set((values || []).map(String)), [values]);
  const normalized = useMemo(() => normalizeOptions(options), [options]);

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return normalized;
    return normalized.filter((o) => String(o.label || '').toLowerCase().includes(q));
  }, [normalized, query]);

  const updatePanelPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const w = Math.max(r.width, 200);
    const width = Math.min(w, vw - 16);
    const left = Math.min(Math.max(8, r.left), vw - width - 8);
    setPanelPos({ top: r.bottom + 4, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    updatePanelPos();
    const onScrollResize = () => updatePanelPos();
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    return () => {
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [open, updatePanelPos]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (triggerRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setOpen(false);
      setQuery('');
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const display = useMemo(() => {
    if (!selectedSet.size) return '';
    const labels = normalized
      .filter((o) => selectedSet.has(String(o.value)))
      .map((o) => o.label);
    return labels.join(', ');
  }, [normalized, selectedSet]);

  const resolvedPlaceholder = placeholder || emptyLabel || '—';

  const toggleValue = (val) => {
    const key = String(val);
    const next = new Set(selectedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(Array.from(next));
  };

  const clearAll = () => onChange([]);

  const panel =
    open && panelPos
      ? createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label={ariaLabel}
            aria-multiselectable="true"
            style={{
              position: 'fixed',
              top: panelPos.top,
              left: panelPos.left,
              width: panelPos.width,
              zIndex: 10050,
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 'min(340px, calc(100vh - 96px))',
            }}
          >
            <div style={{ padding: 8, borderBottom: '1px solid #eee', flexShrink: 0 }}>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={resolvedPlaceholder}
                autoComplete="off"
                aria-label={ariaLabel}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setOpen(false);
                    setQuery('');
                    triggerRef.current?.focus();
                  }
                }}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 10px',
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
              />
            </div>
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 4,
                overflowY: 'auto',
                flex: 1,
                minHeight: 0,
              }}
            >
              {emptyLabel ? (
                <li>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      cursor: 'pointer',
                      fontSize: 13,
                      color: '#666',
                      fontStyle: 'italic',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSet.size === 0}
                      onChange={() => clearAll()}
                    />
                    {emptyLabel}
                  </label>
                </li>
              ) : null}
              {filtered.map((o) => {
                const checked = selectedSet.has(String(o.value));
                return (
                  <li key={String(o.value)}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 10px',
                        cursor: 'pointer',
                        fontSize: 13,
                        color: '#2c3e50',
                        background: checked ? '#e3f2fd' : 'transparent',
                        borderRadius: 4,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleValue(o.value)}
                      />
                      {o.label}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="filter-searchable-select">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => {
            const next = !o;
            if (next) setQuery('');
            return next;
          });
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="filter-searchable-select__trigger"
        style={{
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: display ? '#212529' : '#6c757d',
        }}
      >
        {display || resolvedPlaceholder}
      </button>
      {panel}
    </div>
  );
}
