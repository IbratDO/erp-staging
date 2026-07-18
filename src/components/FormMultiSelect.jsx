import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';

function normalizeOptions(options) {
  return (options || []).map((o) =>
    typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label ?? o.value },
  );
}

/**
 * Form-field multi-select that looks like a native <select> (same border/padding/font
 * as other .form-group inputs) but opens a checkbox dropdown on click.
 * Visually identical to FormSearchableSelect; difference is multiple selection via checkboxes.
 */
export default function FormMultiSelect({
  values = [],
  onChange,
  options = [],
  placeholder = '',
  emptyLabel = '',
  'aria-label': ariaLabel,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [panelPos, setPanelPos] = useState(null);
  const listboxId = useRef(`fms-lb-${Math.random().toString(36).slice(2, 9)}`).current;
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

  const display = useMemo(() => {
    if (!selectedSet.size) return '';
    return normalized
      .filter((o) => selectedSet.has(String(o.value)))
      .map((o) => o.label)
      .join(', ');
  }, [normalized, selectedSet]);

  const updatePanelPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const w = Math.max(r.width, 200);
    const width = Math.min(w, vw - 16);
    const left = Math.min(Math.max(8, r.left), vw - width - 8);
    setPanelPos({ top: r.bottom + 2, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) { setPanelPos(null); return; }
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
            id={listboxId}
            role="listbox"
            aria-multiselectable="true"
            aria-label={ariaLabel}
            style={{
              position: 'fixed',
              top: panelPos.top,
              left: panelPos.left,
              width: panelPos.width,
              zIndex: 10050,
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: 5,
              boxShadow: '0 6px 20px rgba(0,0,0,0.10)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 'min(300px, calc(100vh - 96px))',
            }}
          >
            <div style={{ padding: 6, borderBottom: '1px solid #eee', flexShrink: 0 }}>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder || ariaLabel || '…'}
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
              {(emptyLabel || placeholder) ? (
                <li>
                  <label
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', cursor: 'pointer', fontSize: 13,
                      color: '#666', fontStyle: 'italic', borderRadius: 4,
                      background: selectedSet.size === 0 ? '#e3f2fd' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSet.size === 0}
                      onChange={clearAll}
                      style={{ margin: 0 }}
                    />
                    {emptyLabel || placeholder}
                  </label>
                </li>
              ) : null}
              {filtered.map((o) => {
                const checked = selectedSet.has(String(o.value));
                return (
                  <li key={String(o.value)}>
                    <label
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 10px', cursor: 'pointer', fontSize: 13,
                        color: '#2c3e50', borderRadius: 4,
                        background: checked ? '#e3f2fd' : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleValue(o.value)}
                        style={{ margin: 0 }}
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
    <>
      <div
        ref={triggerRef}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        style={{
          padding: '10px',
          border: '1px solid #ddd',
          borderRadius: '5px',
          fontSize: '14px',
          fontFamily: 'inherit',
          background: disabled ? '#f5f5f5' : '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: display ? '#333' : '#999',
          position: 'relative',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: '20px',
          boxSizing: 'border-box',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {display || emptyLabel || placeholder || '—'}
        </span>
        <span style={{ color: '#999', fontSize: 10, marginLeft: 8, flexShrink: 0 }}>▼</span>
      </div>
      {panel}
    </>
  );
}
