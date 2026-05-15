import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { productSalePickerLabel } from '../utils/productCost';
import { productMatchesSearch } from '../utils/productSearch';

/**
 * Dropdown product picker with a search field inside the open panel (not a native select).
 */
export default function ProductSearchableSelect({
  products,
  value,
  onChange,
  placeholder = 'Select a product…',
  disabled = false,
  className = '',
  triggerClassName = '',
  'aria-label': ariaLabel,
  emptyHint = null,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [panelPos, setPanelPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);

  const tableTrigger = typeof triggerClassName === 'string' && triggerClassName.includes('batch-sale-lines__control');

  const selected = useMemo(
    () => products.find((p) => String(p.id) === String(value)),
    [products, value]
  );

  const filtered = useMemo(
    () => products.filter((p) => productMatchesSearch(p, query)),
    [products, query]
  );

  const updatePanelPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const w = Math.max(r.width, 280);
    const width = Math.min(w, vw - 16);
    const left = Math.min(Math.max(8, r.left), vw - width - 8);
    const top = r.bottom + 4;
    setPanelPos({ top, left, width });
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
      const t = triggerRef.current;
      const p = panelRef.current;
      if (t?.contains(e.target) || p?.contains(e.target)) return;
      setOpen(false);
      setQuery('');
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const display = selected ? productSalePickerLabel(selected) : '';
  const noProducts = !products.length;

  const handleToggle = () => {
    if (disabled || noProducts) return;
    setOpen((o) => {
      const next = !o;
      if (next) setQuery('');
      return next;
    });
  };

  const handlePick = (id) => {
    onChange(String(id));
    setOpen(false);
    setQuery('');
  };

  const panel =
    open && panelPos && !noProducts
      ? createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label={ariaLabel || 'Products'}
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
                placeholder="Search products…"
                autoComplete="off"
                aria-label="Search products"
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
              {filtered.length === 0 ? (
                <li style={{ padding: '12px 10px', color: '#666', fontSize: 14 }}>No matches</li>
              ) : (
                filtered.map((p) => {
                  const isSel = String(p.id) === String(value);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSel}
                        onClick={() => handlePick(p.id)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 10px',
                          border: 'none',
                          background: isSel ? '#e3f2fd' : 'transparent',
                          cursor: 'pointer',
                          fontSize: 13,
                          fontFamily: 'inherit',
                          color: '#2c3e50',
                          borderRadius: 4,
                          lineHeight: 1.35,
                        }}
                      >
                        {productSalePickerLabel(p)}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body
        )
      : null;

  const triggerStyle = tableTrigger
    ? {
        width: '100%',
        textAlign: 'left',
        cursor: disabled || noProducts ? 'not-allowed' : 'pointer',
        color: display ? '#2c3e50' : '#999',
      }
    : {
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        border: '1px solid #ddd',
        borderRadius: 5,
        fontSize: 14,
        fontFamily: 'inherit',
        background: noProducts ? '#f5f5f5' : '#fff',
        cursor: disabled || noProducts ? 'not-allowed' : 'pointer',
        color: display ? '#2c3e50' : '#999',
      };

  return (
    <div className={className} style={{ position: 'relative', width: '100%' }}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || noProducts}
        onClick={handleToggle}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={triggerClassName || undefined}
        style={triggerStyle}
      >
        {noProducts ? 'No products in stock' : display || placeholder}
      </button>
      {panel}
      {emptyHint && noProducts ? (
        <div style={{ marginTop: 6, fontSize: 13 }}>{emptyHint}</div>
      ) : null}
    </div>
  );
}
