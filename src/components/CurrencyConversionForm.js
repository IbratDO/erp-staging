import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../utils/api';
import useCbuExchangeRate from '../hooks/useCbuExchangeRate';
import { usdToUzs, uzsToUsd } from '../utils/saleCompletePayHelpers';

const PL_TOLERANCE_USD = 0.005;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function computeConversionPreview(direction, sourceAmount, targetAmount, rate) {
  if (!sourceAmount || !rate || rate <= 0) return null;
  let expected;
  let plUsd;
  if (direction === 'usd_to_uzs') {
    expected = usdToUzs(sourceAmount, rate);
    const actual = targetAmount != null && targetAmount > 0 ? targetAmount : expected;
    plUsd = uzsToUsd(actual - expected, rate);
  } else {
    expected = uzsToUsd(sourceAmount, rate);
    const actual = targetAmount != null && targetAmount > 0 ? targetAmount : expected;
    plUsd = actual - expected;
  }
  return {
    source_amount: sourceAmount,
    expected_target_amount: expected,
    target_amount: targetAmount != null && targetAmount > 0 ? targetAmount : expected,
    pl_effect_usd: plUsd,
    has_pl_effect: Math.abs(plUsd) > PL_TOLERANCE_USD,
  };
}

export default function CurrencyConversionForm({ onSuccess, onCancel }) {
  const { exchangeRate, exchangeRateError, cbuRate: latestCbuRate } = useCbuExchangeRate();
  const [form, setForm] = useState({
    direction: 'usd_to_uzs',
    source_amount: '',
    target_amount: '',
    conversion_date: todayIso(),
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [targetManual, setTargetManual] = useState(false);
  const [rateForDate, setRateForDate] = useState(null);
  const [rateForDateLoading, setRateForDateLoading] = useState(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  const effectiveRate = rateForDate?.rate ?? latestCbuRate;
  const rateDateLabel = rateForDate?.rate_date ?? exchangeRate?.rate_date;

  // Load CB rate for selected date when it differs from the latest stored rate (once per date change).
  useEffect(() => {
    const convDate = form.conversion_date || todayIso();
    if (!convDate) return undefined;

    if (exchangeRate?.rate_date && convDate === exchangeRate.rate_date) {
      setRateForDate(null);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setRateForDateLoading(true);
      try {
        const res = await api.post('/cash-balance/preview-conversion/', {
          direction: 'usd_to_uzs',
          source_amount: 1,
          conversion_date: convDate,
        });
        if (!cancelled) {
          setRateForDate({
            rate: res.data.cb_rate,
            rate_date: res.data.cb_rate_date,
          });
        }
      } catch {
        if (!cancelled) setRateForDate(null);
      } finally {
        if (!cancelled) setRateForDateLoading(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.conversion_date, exchangeRate?.rate_date]);

  // Auto-fill converted amount from CB rate (no API — local math only).
  useEffect(() => {
    if (targetManual || !effectiveRate) return;
    const src = parseFloat(form.source_amount);
    if (!src || src <= 0) return;
    const expected =
      form.direction === 'usd_to_uzs'
        ? usdToUzs(src, effectiveRate)
        : uzsToUsd(src, effectiveRate);
    const next = String(expected);
    setForm((f) => (f.target_amount === next ? f : { ...f, target_amount: next }));
  }, [form.direction, form.source_amount, effectiveRate, targetManual]);

  const preview = useMemo(() => {
    const src = parseFloat(form.source_amount);
    const tgt = parseFloat(form.target_amount);
    if (!src || src <= 0 || !effectiveRate) return null;
    return computeConversionPreview(
      form.direction,
      src,
      tgt > 0 ? tgt : undefined,
      effectiveRate,
    );
  }, [form.direction, form.source_amount, form.target_amount, effectiveRate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const src = parseFloat(form.source_amount);
    const tgt = parseFloat(form.target_amount);
    if (!src || src <= 0 || !tgt || tgt <= 0) {
      alert('Enter valid source and converted amounts.');
      return;
    }
    if (!effectiveRate) {
      alert('Exchange rate is not available. Try again in a moment.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/cash-balance/convert-currency/', {
        direction: form.direction,
        source_amount: src,
        target_amount: tgt,
        conversion_date: form.conversion_date || todayIso(),
        notes: form.notes.trim(),
        idempotency_key: idempotencyKey.current,
      });
      onSuccess?.();
    } catch (err) {
      alert(err.response?.data?.error || 'Conversion failed');
    } finally {
      setSubmitting(false);
    }
  };

  const srcCur = form.direction === 'usd_to_uzs' ? 'USD' : 'UZS';
  const tgtCur = form.direction === 'usd_to_uzs' ? 'UZS' : 'USD';
  const rateBusy = rateForDateLoading && form.conversion_date !== exchangeRate?.rate_date;

  return (
    <div className="form-card" style={{ marginBottom: '20px' }}>
      <h2>Currency Conversion</h2>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '12px' }}>
        Convert between USD and UZS cash buckets. Central Bank rate is used for the expected amount;
        you may adjust the received amount — any difference is recorded as conversion profit or loss in P&amp;L.
      </p>
      {exchangeRateError ? (
        <p style={{ fontSize: '0.85rem', color: '#dc3545', marginBottom: '12px' }}>{exchangeRateError}</p>
      ) : rateBusy ? (
        <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '12px' }}>Loading rate for selected date…</p>
      ) : exchangeRate?.label && !rateForDate ? (
        <p style={{ fontSize: '0.85rem', color: '#0d6efd', marginBottom: '12px' }}>{exchangeRate.label}</p>
      ) : effectiveRate ? (
        <p style={{ fontSize: '0.85rem', color: '#0d6efd', marginBottom: '12px' }}>
          1 USD = {Number(effectiveRate).toLocaleString()} UZS
          {rateDateLabel ? ` (rate as of ${rateDateLabel})` : ''}
        </p>
      ) : null}

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label>Direction</label>
            <select
              value={form.direction}
              onChange={(e) => {
                setTargetManual(false);
                setForm({
                  ...form,
                  direction: e.target.value,
                  source_amount: '',
                  target_amount: '',
                });
              }}
              required
            >
              <option value="usd_to_uzs">USD → UZS</option>
              <option value="uzs_to_usd">UZS → USD</option>
            </select>
          </div>
          <div className="form-group">
            <label>Conversion date</label>
            <input
              type="date"
              value={form.conversion_date}
              onChange={(e) => setForm({ ...form, conversion_date: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Source amount ({srcCur})</label>
            <input
              type="number"
              step={form.direction === 'usd_to_uzs' ? '0.01' : '1'}
              min="0"
              value={form.source_amount}
              onChange={(e) => {
                setTargetManual(false);
                setForm({ ...form, source_amount: e.target.value });
              }}
              required
            />
          </div>
          <div className="form-group">
            <label>Converted amount ({tgtCur})</label>
            <input
              type="number"
              step={form.direction === 'usd_to_uzs' ? '1' : '0.01'}
              min="0"
              value={form.target_amount}
              onChange={(e) => {
                setTargetManual(true);
                setForm({ ...form, target_amount: e.target.value });
              }}
              required
            />
            {preview?.expected_target_amount != null ? (
              <small style={{ color: '#666' }}>
                CB expected: {Number(preview.expected_target_amount).toLocaleString()} {tgtCur}
              </small>
            ) : null}
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows="2"
            />
          </div>
        </div>

        {preview?.has_pl_effect ? (
          <p
            style={{
              margin: '12px 0',
              padding: '10px 12px',
              background: preview.pl_effect_usd > 0 ? '#ecfdf5' : '#fef2f2',
              borderRadius: 6,
              fontSize: '0.9rem',
            }}
          >
            {preview.pl_effect_usd > 0 ? 'Conversion profit' : 'Conversion loss'}:{' '}
            <strong>
              $
              {Math.abs(preview.pl_effect_usd).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </strong>{' '}
            (recorded in Profit/Loss)
          </p>
        ) : preview?.source_amount ? (
          <p style={{ margin: '12px 0', fontSize: '0.9rem', color: '#666' }}>
            No P&amp;L effect — converted amount matches CB rate.
          </p>
        ) : null}

        <div className="form-actions">
          <button type="button" className="btn-edit" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting || rateBusy || !effectiveRate}>
            {submitting ? 'Converting…' : 'Convert'}
          </button>
        </div>
      </form>
    </div>
  );
}
