import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AmountInput from '../components/AmountInput';
import FilterPanel from '../components/FilterPanel';
import SortableTh from '../components/SortableTh';
import TableDownloadButton from '../components/TableDownloadButton';
import api from '../utils/api';
import { formatPlainAmount } from '../utils/currencyFormat';
import { formatAppDate } from '../utils/localeFormat';
import { useClientTableSort } from '../utils/tableSort';
import { usePermissions } from '../hooks/usePermissions';
import {
  canCorrect,
  correctionRefusal,
  isClosed,
  isoDate,
  num,
  receiptRefusal,
  receivedOf,
  remainingOf,
  rowTone,
  totals as sumTotals,
} from '../utils/transferPaymentsHelpers';
import './TablePage.css';
import './TransferPayments.css';

/**
 * The table's column count, so the expanded panels below a row span it.
 *
 * A literal `colSpan={9}` was repeated at four sites. Adding or removing a column left the
 * panels one cell narrow or one wide -- which does not fail, it just quietly breaks the layout
 * of the three things on this page somebody actually fills in.
 */
const COLUMNS = 9;

/**
 * How each column sorts. Module-level, so the sort hook's memo has a stable reference.
 *
 * **The money columns sort on the derived figure, not the stored one.** `remaining` is
 * `principal - received - waived`, computed in `transferPaymentsHelpers`; sorting on
 * `principal_amount` instead would order by what was promised rather than by what is still
 * owed, which is the opposite of what somebody chasing the money asked for.
 */
const SORT_ACCESSORS = {
  sale: (row) => Number(row.sale) || 0,
  sale_date: (row) => row.sale_date || '',
  customer: (row) => row.customer_name || '',
  expected: (row) => num(row.principal_amount),
  received: (row) => receivedOf(row),
  waived: (row) => num(row.waived_amount),
  remaining: (row) => remainingOf(row),
  status: (row) => row.status || '',
};

/** The typed filters wait this long after the last keystroke before the server is asked. */
const FILTER_DEBOUNCE_MS = 350;

/**
 * Perechisleniye to'lovlari — bank transfers the shop is waiting for, and what has arrived.
 *
 * The till said "the bank will pay". This is where somebody reads the statement and says what
 * actually came. Two actions, and the difference between them is the whole point:
 *
 * * **Record a receipt** is the daily act. It books som into the bank account and takes the same
 *   figure off what the organisation owes — one asset becomes another, so nothing about the
 *   shop's worth changes and no profit is posted by hand.
 * * **Correct** is a reversing entry, **never an edit in place.** A figure somebody has acted on
 *   has to stay visible: the original receipt may already have released margin into a month that
 *   has been reported. So a mistake is cancelled and the right figure entered afresh, and both
 *   lines stay in the history.
 *
 * * **Write off the remainder** is the third, and the rarest: the shop stops expecting the money.
 *   No cash moves and no loss is posted by hand — the loss is the part of the cost the receipts
 *   never covered, and it falls out of the recognition rule. Its own permission, **withheld from
 *   the accountant**: recording money that arrived and deciding to stop expecting it are
 *   different acts, and the second is the owner's.
 *
 * Every refusal here is mirrored from the server rather than invented, so an accountant is told
 * what is wrong before pressing the button instead of after. The server is still the gate; see
 * `transferPaymentsHelpers`.
 */
const TransferPayments = () => {
  const { t } = useTranslation(['sales', 'common']);
  const { hasPermission } = usePermissions();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState(0);

  // What the list is showing. `open` is the default, because a fully received record turns green
  // and offers nothing further, so it is only ever in the way.
  const [scope, setScope] = useState('open');
  const [saleQuery, setSaleQuery] = useState('');
  const [documentQuery, setDocumentQuery] = useState('');

  /**
   * **What the server has actually been asked for, which lags what is typed.**
   *
   * `load` is a request, and it was wired straight to the text boxes: typing `BD-77/2026` sent
   * ten GETs, any of which could answer out of order and leave the table showing the rows for a
   * prefix of what is in the box. The dropdown is deliberately *not* debounced -- a choice from
   * a list is finished the moment it is made, and waiting on it would only feel slow.
   */
  const [applied, setApplied] = useState({ sale: '', document: '' });
  useEffect(() => {
    const timer = setTimeout(() => {
      // **Returns the same object when nothing actually changed**, which is load-bearing: `load`
      // depends on this value by identity, so handing back a fresh object with identical fields
      // would refetch -- once on arrival, and again every time somebody types a character and
      // deletes it.
      setApplied((prev) => {
        const sale = saleQuery.trim();
        const document = documentQuery.trim();
        if (prev.sale === sale && prev.document === document) return prev;
        return { sale, document };
      });
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [saleQuery, documentQuery]);

  // Client-side, and honest about it: the endpoint is unpaginated, so every row the filters left
  // is already here and ordering them cannot produce a confidently wrong answer.
  const sort = useClientTableSort(SORT_ACCESSORS, { col: 'sale', dir: 'desc' });
  // The rendered table, so the download gives what is on the screen -- current filters, current
  // sort. See `utils/tableCsv`.
  const tableRef = useRef(null);

  // One row's receipt form open at a time, so there is no chance of pressing the button on one
  // row with another row's figures in the boxes. The same reasoning the Click page's id box uses.
  const [receiptFor, setReceiptFor] = useState(0);
  const [form, setForm] = useState({ amount: '', value_date: '', bank_document_no: '', notes: '' });
  // **The month lock's reason, asked for only once the server has said the period is closed.**
  // Not a field on the form from the start: a cashier recording this morning's money must never
  // see it, or the exception becomes the shape of the ordinary case.
  const [closedReason, setClosedReason] = useState('');
  const [needsClosedReason, setNeedsClosedReason] = useState(false);

  // The expanded history, and the correction box inside it — again one at a time.
  const [historyFor, setHistoryFor] = useState(0);
  const [history, setHistory] = useState(null);
  const [correctingId, setCorrectingId] = useState(0);
  const [correctionReason, setCorrectionReason] = useState('');

  const canRecord = hasPermission('transfer.record_payment');
  const canFix = hasPermission('transfer.correct');
  const canWaive = hasPermission('transfer.forgive');

  // The write-off box, kept separate from the receipt form so neither can be submitted with the
  // other's text in it -- the same reasoning the Click page uses for its two boxes.
  const [waivingFor, setWaivingFor] = useState(0);
  const [waiveReason, setWaiveReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { scope };
      if (applied.sale) params.sale = applied.sale;
      if (applied.document) params.bank_document_no = applied.document;
      const { data } = await api.get('/transfer-sales/', { params });
      // The endpoint is unpaginated, like Qarzdorlik's: these are rows somebody is chasing, and
      // there are never many open at once. `results` is read anyway so turning pagination on
      // later needs no change here.
      setRows(Array.isArray(data) ? data : (data?.results || []));
      setError('');
    } catch (err) {
      setError(err?.response?.data?.error || t('transfers.errLoad'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [scope, applied, t]);

  useEffect(() => { load(); }, [load]);

  const say = (text) => { setMessage(text); setError(''); };
  const refuse = (text) => { setError(text); setMessage(''); };

  const openReceipt = (row) => {
    setReceiptFor(row.id === receiptFor ? 0 : row.id);
    setCorrectingId(0);
    // A reason belongs to the attempt that asked for it, not to the page.
    setClosedReason('');
    setNeedsClosedReason(false);
    // Pre-filled with today and with what is still expected, because that is what the statement
    // usually says. Pre-filling is safe here precisely because both are refused when wrong: the
    // amount against the remainder, the date against today.
    setForm({
      amount: String(Math.round(remainingOf(row))),
      value_date: isoDate(),
      bank_document_no: '',
      notes: '',
    });
  };

  const submitReceipt = async (row) => {
    const refusal = receiptRefusal(row, form);
    if (refusal) {
      refuse(t(refusal.key, refusal.values));
      return;
    }
    setBusyId(row.id);
    try {
      const { data } = await api.post(`/transfer-sales/${row.id}/record_payment/`, {
        amount: form.amount,
        value_date: form.value_date || undefined,
        bank_document_no: form.bank_document_no || '',
        notes: form.notes || '',
        closed_period_reason: closedReason || undefined,
      });
      say(data?.message || t('transfers.recorded'));
      setReceiptFor(0);
      setClosedReason('');
      setNeedsClosedReason(false);
      if (historyFor === row.id) await loadHistory(row.id);
      await load();
    } catch (err) {
      const code = err?.response?.data?.code;
      // `period_closed_reason_required` means the owner may post it but has to say why, so the
      // field appears rather than the attempt simply failing. `period_closed` means they may
      // not, and no field is offered — see `period_lock.ClosedPeriodError`.
      setNeedsClosedReason(code === 'period_closed_reason_required');
      refuse(err?.response?.data?.error || t('transfers.errRecord'));
    } finally {
      setBusyId(0);
    }
  };

  const submitWaiver = async (row) => {
    if (!waiveReason.trim()) {
      refuse(t('transfers.errReasonRequired'));
      return;
    }
    // **Asks once, and names the amount being given up.** This turns an asset into a loss and
    // there is no undoing it from this page; a confirm that only asks is one people learn to
    // dismiss.
    const ok = window.confirm(t('transfers.confirmWaive', {
      amount: formatPlainAmount(remainingOf(row), 0),
      customer: row.customer_name || '',
    }));
    if (!ok) return;

    setBusyId(row.id);
    try {
      const { data } = await api.post(`/transfer-sales/${row.id}/waive/`, {
        reason: waiveReason,
      });
      say(data?.message || t('transfers.waived'));
      setWaivingFor(0);
      setWaiveReason('');
      await load();
    } catch (err) {
      refuse(err?.response?.data?.error || t('transfers.errWaive'));
    } finally {
      setBusyId(0);
    }
  };

  const loadHistory = useCallback(async (id) => {
    try {
      const { data } = await api.get(`/transfer-sales/${id}/payment_history/`);
      setHistory(data);
    } catch (err) {
      setHistory(null);
      refuse(err?.response?.data?.error || t('transfers.errHistory'));
    }
  }, [t]);

  const toggleHistory = async (row) => {
    if (historyFor === row.id) {
      setHistoryFor(0);
      setHistory(null);
      return;
    }
    setHistoryFor(row.id);
    setHistory(null);
    setCorrectingId(0);
    await loadHistory(row.id);
  };

  const submitCorrection = async (row, line) => {
    const refusal = correctionRefusal(line, correctionReason);
    if (refusal) {
      refuse(t(refusal.key));
      return;
    }
    // **Asks once, and names what is about to be undone rather than saying "are you sure".** This
    // takes money back out of the bank account; a confirm that only asks is one people learn to
    // dismiss.
    const ok = window.confirm(t('transfers.confirmCorrect', {
      amount: formatPlainAmount(num(line.amount), 0),
      id: line.id,
    }));
    if (!ok) return;

    setBusyId(row.id);
    try {
      const { data } = await api.post(`/transfer-sales/${row.id}/correct_payment/`, {
        payment: line.id,
        reason: correctionReason,
      });
      say(data?.message || t('transfers.corrected'));
      setCorrectingId(0);
      setCorrectionReason('');
      await loadHistory(row.id);
      await load();
    } catch (err) {
      refuse(err?.response?.data?.error || t('transfers.errCorrect'));
    } finally {
      setBusyId(0);
    }
  };

  const totals = sumTotals(rows);
  const visible = sort.sortRows(rows);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{t('paymentsControl.tabTransfer')}</h1>
      </div>
      <p className="page-intro">{t('transfers.intro')}</p>

      {/*
        The house filter panel, which this page was not using. It starts closed, reflows on a
        phone instead of sitting in a fixed-width row, and — the part that matters — carries a
        count of how many filters differ from how the page loaded. Filters that sat open and
        scrolled out of sight are how somebody concludes there is nothing to chase while a sale
        id is still in the box.
      */}
      <FilterPanel
        title={t('filters.title', { ns: 'common' })}
        filters={{ scope, sale: saleQuery, document: documentQuery }}
      >
        <div className="filter-toolbar">
          <div className="filter-field">
            <label htmlFor="transfer-scope">{t('transfers.filterScope')}</label>
            <select
              id="transfer-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="open">{t('transfers.scopeOpen')}</option>
              <option value="all">{t('transfers.scopeAll')}</option>
            </select>
          </div>
          <div className="filter-field">
            <label htmlFor="transfer-sale">{t('transfers.filterSale')}</label>
            <input
              id="transfer-sale"
              type="text"
              inputMode="numeric"
              value={saleQuery}
              onChange={(e) => setSaleQuery(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="12547"
            />
          </div>
          {/* The one cross-sale query. One statement line settling several sales quotes the same
              document number on each receipt — the split is made by hand, by sale, on purpose —
              so this is what answers "what did that bank line pay for?". */}
          <div className="filter-field filter-field--grow">
            <label htmlFor="transfer-document">{t('transfers.filterDocument')}</label>
            <input
              id="transfer-document"
              type="text"
              value={documentQuery}
              onChange={(e) => setDocumentQuery(e.target.value)}
              placeholder="BD-77/2026"
            />
          </div>
        </div>
      </FilterPanel>

      {/* The house banners. The success line used to be a `success-message` class that has no
          stylesheet anywhere, so it rendered as bare green text while every other page in the
          app showed a filled banner. */}
      {error ? <div className="notification-banner error">{error}</div> : null}
      {message ? <div className="notification-banner success">{message}</div> : null}

      <div className="table-card">
        <div className="table-card__toolbar table-card__toolbar--with-title">
          <h2>
            {t('transfers.tableTitle')}
            {loading ? null : (
              <span className="transfer-count">
                {t('transfers.rowCount', { count: rows.length })}
              </span>
            )}
          </h2>
          <TableDownloadButton
            tableRef={tableRef}
            filename="bank-otkazmalari"
            rowCount={visible.length}
          />
        </div>

        {loading ? (
          <div className="loading-screen">{t('actions.loadingPage', { ns: 'common' })}</div>
        ) : rows.length === 0 ? (
          <p className="form-hint">{t('transfers.empty')}</p>
        ) : (
          <div className="data-table-scroll">
            <table className="data-table data-table--wide" ref={tableRef}>
              <thead>
                <tr>
                  <SortableTh columnId="sale" sortCol={sort.sortCol} sortDir={sort.sortDir} onSort={sort.onHeaderClick}>
                    {t('transfers.colSale')}
                  </SortableTh>
                  <SortableTh columnId="sale_date" sortCol={sort.sortCol} sortDir={sort.sortDir} onSort={sort.onHeaderClick}>
                    {t('transfers.colDate')}
                  </SortableTh>
                  <SortableTh columnId="customer" sortCol={sort.sortCol} sortDir={sort.sortDir} onSort={sort.onHeaderClick}>
                    {t('transfers.colCustomer')}
                  </SortableTh>
                  <SortableTh className="transfer-num" columnId="expected" sortCol={sort.sortCol} sortDir={sort.sortDir} onSort={sort.onHeaderClick}>
                    {t('transfers.colExpected')}
                  </SortableTh>
                  <SortableTh className="transfer-num" columnId="received" sortCol={sort.sortCol} sortDir={sort.sortDir} onSort={sort.onHeaderClick}>
                    {t('transfers.colReceived')}
                  </SortableTh>
                  <SortableTh className="transfer-num" columnId="waived" sortCol={sort.sortCol} sortDir={sort.sortDir} onSort={sort.onHeaderClick}>
                    {t('transfers.colWaived')}
                  </SortableTh>
                  {/* The column somebody came here to sort by: what is still owed. */}
                  <SortableTh className="transfer-num" columnId="remaining" sortCol={sort.sortCol} sortDir={sort.sortDir} onSort={sort.onHeaderClick}>
                    {t('transfers.colRemaining')}
                  </SortableTh>
                  <SortableTh columnId="status" sortCol={sort.sortCol} sortDir={sort.sortDir} onSort={sort.onHeaderClick}>
                    {t('transfers.colStatus')}
                  </SortableTh>
                  <th>{t('transfers.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const tone = rowTone(row);
                  const busy = busyId === row.id;
                  const closed = isClosed(row);
                  const recording = receiptFor === row.id;
                  const waiving = waivingFor === row.id;
                  const showing = historyFor === row.id;
                  return (
                    <React.Fragment key={row.id}>
                      <tr className={`transfer-row transfer-row--${tone}`}>
                        <td>#{row.sale}</td>
                        <td className="transfer-nowrap">
                          {row.sale_date ? formatAppDate(row.sale_date) : '—'}
                        </td>
                        <td>{row.customer_name || '—'}</td>
                        <td className="transfer-num">{formatPlainAmount(num(row.principal_amount), 0)}</td>
                        <td className="transfer-num">{formatPlainAmount(receivedOf(row), 0)}</td>
                        <td className="transfer-num">{formatPlainAmount(num(row.waived_amount), 0)}</td>
                        {/* Emphasised, because it is the figure the page exists to show. */}
                        <td className="transfer-num transfer-num--lead">
                          {formatPlainAmount(remainingOf(row), 0)}
                        </td>
                        <td>
                          {/* A pill, not bare text. The state used to live only in a 3px band on
                              the first cell, which is all but invisible on a wide table scrolled
                              sideways — so the one thing the owner asked to be obvious was the
                              one thing that was not. The band stays; this is what carries it. */}
                          <span className={`transfer-pill transfer-pill--${row.status}`}>
                            {t(`transfers.status_${row.status}`)}
                          </span>
                        </td>
                        <td>
                          <div className="transfer-actions">
                            {/* A fully received record offers nothing further — the owner's rule.
                                The history stays reachable, because that is reading, not acting. */}
                            {canRecord && !closed ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                disabled={busy}
                                aria-expanded={recording}
                                onClick={() => openReceipt(row)}
                              >
                                {t('transfers.actRecord')}
                              </button>
                            ) : null}
                            {/* Offered only to whoever holds `transfer.forgive`, and only while
                                something is still expected: there is nothing to give up on a row
                                that is already settled. The server refuses both cases anyway. */}
                            {canWaive && !closed ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                disabled={busy}
                                aria-expanded={waiving}
                                onClick={() => {
                                  setWaivingFor(waiving ? 0 : row.id);
                                  setWaiveReason('');
                                  setReceiptFor(0);
                                }}
                              >
                                {t('transfers.actWaive')}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn btn-sm"
                              aria-expanded={showing}
                              onClick={() => toggleHistory(row)}
                            >
                              {showing ? t('transfers.actHide') : t('transfers.actHistory')}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {recording ? (
                        <tr className="transfer-expanded">
                          <td colSpan={COLUMNS}>
                            <div className="transfer-panel">
                              <h3 className="transfer-panel__title">{t('transfers.actRecord')}</h3>
                              <p className="transfer-panel__hint">
                                {t('transfers.reference', { reference: row.payment_reference })}
                              </p>
                              <div className="transfer-form">
                                <div className="transfer-field">
                                  <label htmlFor={`transfer-amount-${row.id}`}>
                                    {t('transfers.fieldAmount')}
                                  </label>
                                  {/* `wholeOnly`: the som ledger takes no tiyin, so the field
                                      refuses the decimal point outright rather than letting one
                                      be typed and then refused by the server. */}
                                  <AmountInput
                                    id={`transfer-amount-${row.id}`}
                                    wholeOnly
                                    value={form.amount}
                                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                                  />
                                  <small>{t('transfers.hintWholeSom')}</small>
                                </div>
                                <div className="transfer-field">
                                  {/* The day the money reached the bank, off the statement — not
                                      the day it is being typed. The profit belongs to the month
                                      the money arrived, and reading the typing date instead would
                                      move profit between closed months. */}
                                  <label htmlFor={`transfer-date-${row.id}`}>
                                    {t('transfers.fieldValueDate')}
                                  </label>
                                  <input
                                    id={`transfer-date-${row.id}`}
                                    type="date"
                                    max={isoDate()}
                                    value={form.value_date}
                                    onChange={(e) => setForm({ ...form, value_date: e.target.value })}
                                  />
                                  <small>{t('transfers.hintValueDate')}</small>
                                </div>
                                <div className="transfer-field">
                                  <label htmlFor={`transfer-doc-${row.id}`}>
                                    {t('transfers.fieldDocument')}
                                  </label>
                                  <input
                                    id={`transfer-doc-${row.id}`}
                                    value={form.bank_document_no}
                                    onChange={(e) => setForm({ ...form, bank_document_no: e.target.value })}
                                    placeholder="BD-77/2026"
                                  />
                                </div>
                                <div className="transfer-field transfer-field--grow">
                                  <label htmlFor={`transfer-notes-${row.id}`}>
                                    {t('transfers.fieldNotes')}
                                  </label>
                                  <input
                                    id={`transfer-notes-${row.id}`}
                                    value={form.notes}
                                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                  />
                                </div>
                                {needsClosedReason ? (
                                  <div className="transfer-field transfer-field--grow transfer-field--warn">
                                    <label htmlFor={`transfer-closed-${row.id}`}>
                                      {t('transfers.fieldClosedReason')}
                                    </label>
                                    <input
                                      id={`transfer-closed-${row.id}`}
                                      value={closedReason}
                                      onChange={(e) => setClosedReason(e.target.value)}
                                    />
                                    <small>{t('transfers.closedReasonHint')}</small>
                                  </div>
                                ) : null}
                              </div>
                              <div className="transfer-panel__actions">
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  disabled={busy}
                                  onClick={() => submitReceipt(row)}
                                >
                                  {t('transfers.actSave')}
                                </button>
                                <button
                                  type="button"
                                  className="btn"
                                  disabled={busy}
                                  onClick={() => setReceiptFor(0)}
                                >
                                  {t('actions.cancel', { ns: 'common' })}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}

                      {waiving ? (
                        <tr className="transfer-expanded">
                          <td colSpan={COLUMNS}>
                            <div className="transfer-panel transfer-panel--danger">
                              <h3 className="transfer-panel__title">{t('transfers.actWaive')}</h3>
                              <p className="transfer-panel__hint">
                                {t('transfers.waiveHint', {
                                  amount: formatPlainAmount(remainingOf(row), 0),
                                })}
                              </p>
                              <div className="transfer-form">
                                <div className="transfer-field transfer-field--grow">
                                  <label htmlFor={`transfer-waive-${row.id}`}>
                                    {t('transfers.fieldWaiveReason')}
                                  </label>
                                  <input
                                    id={`transfer-waive-${row.id}`}
                                    value={waiveReason}
                                    onChange={(e) => setWaiveReason(e.target.value)}
                                  />
                                </div>
                              </div>
                              <div className="transfer-panel__actions">
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  disabled={busy}
                                  onClick={() => submitWaiver(row)}
                                >
                                  {t('transfers.actWaiveConfirm')}
                                </button>
                                <button
                                  type="button"
                                  className="btn"
                                  disabled={busy}
                                  onClick={() => setWaivingFor(0)}
                                >
                                  {t('actions.cancel', { ns: 'common' })}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}

                      {showing ? (
                        <tr className="transfer-expanded">
                          <td colSpan={COLUMNS}>
                            <div className="transfer-panel">
                              {/*
                                The owner's three-row table from the specification. Shown above the
                                receipt history because it answers the question somebody opens the
                                row to ask -- where is this sale's money, and what has it earned --
                                where the history answers how it got there.

                                **The profit column is cost recovery, not the pro-rata split the
                                specification drew.** The owner was shown both and chose this:
                                nothing is profit until the goods cost is back, so "Olingan pul"
                                reads zero until then and rises quickly after. That is the number
                                people will query, which is why the hint under the table says so.
                              */}
                              {history?.breakdown ? (
                                <div className="transfer-breakdown">
                                  <table className="data-table transfer-breakdown__table">
                                    <thead>
                                      <tr>
                                        <th>{t('transfers.colPaymentState')}</th>
                                        <th className="transfer-num">{t('transfers.colSumma')}</th>
                                        <th className="transfer-num">{t('transfers.colGrossProfit')}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {history.breakdown.rows.map((line) => (
                                        <tr key={line.kind}>
                                          <td>{t(`transfers.row_${line.kind}`)}</td>
                                          <td className="transfer-num">
                                            {formatPlainAmount(num(line.amount_uzs), 0)}
                                          </td>
                                          <td className="transfer-num">
                                            ${formatPlainAmount(line.profit_usd)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr>
                                        <th>{t('transfers.rowTotal')}</th>
                                        <th className="transfer-num">
                                          {formatPlainAmount(num(history.breakdown.total.amount_uzs), 0)}
                                        </th>
                                        <th className="transfer-num">
                                          ${formatPlainAmount(history.breakdown.total.profit_usd)}
                                        </th>
                                      </tr>
                                    </tfoot>
                                  </table>
                                  <small className="transfer-panel__hint">
                                    {t('transfers.breakdownHint', {
                                      cost: formatPlainAmount(
                                        history.breakdown.goods_cost_usd * history.breakdown.rate, 0,
                                      ),
                                    })}
                                  </small>
                                </div>
                              ) : null}

                              <h3 className="transfer-panel__title">{t('transfers.actHistory')}</h3>
                              {history === null ? (
                                <p className="form-hint">{t('actions.loadingPage', { ns: 'common' })}</p>
                              ) : history.payments.length === 0 ? (
                                <p className="form-hint">{t('transfers.noReceipts')}</p>
                              ) : (
                                <div className="data-table-scroll">
                                  <table className="data-table">
                                    <thead>
                                      <tr>
                                        <th>{t('transfers.colValueDate')}</th>
                                        <th className="transfer-num">{t('transfers.colAmount')}</th>
                                        <th className="transfer-num">{t('transfers.colRemainingAfter')}</th>
                                        <th>{t('transfers.colDocument')}</th>
                                        <th>{t('transfers.colEnteredBy')}</th>
                                        <th>{t('transfers.colNote')}</th>
                                        <th>{t('transfers.colActions')}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {history.payments.map((line) => (
                                        <React.Fragment key={line.id}>
                                          <tr className={line.is_correction ? 'transfer-line--correction' : undefined}>
                                            <td className="transfer-nowrap">{formatAppDate(line.value_date)}</td>
                                            <td className="transfer-num">{formatPlainAmount(num(line.amount), 0)}</td>
                                            <td className="transfer-num">{formatPlainAmount(num(line.remaining_after), 0)}</td>
                                            <td>{line.bank_document_no || '—'}</td>
                                            <td>{line.created_by || '—'}</td>
                                            <td>
                                              {line.notes || '—'}
                                              {line.reversed_by ? (
                                                <span className="transfer-note-flag">
                                                  {t('transfers.wasCorrected')}
                                                </span>
                                              ) : null}
                                            </td>
                                            <td>
                                              {canFix && canCorrect(line) ? (
                                                <button
                                                  type="button"
                                                  className="btn btn-sm"
                                                  disabled={busy}
                                                  aria-expanded={correctingId === line.id}
                                                  onClick={() => {
                                                    setCorrectingId(
                                                      correctingId === line.id ? 0 : line.id,
                                                    );
                                                    setCorrectionReason('');
                                                  }}
                                                >
                                                  {t('transfers.actCorrect')}
                                                </button>
                                              ) : null}
                                            </td>
                                          </tr>
                                          {correctingId === line.id ? (
                                            <tr className="transfer-expanded">
                                              <td colSpan={7}>
                                                <div className="transfer-form">
                                                  <div className="transfer-field transfer-field--grow">
                                                    <label htmlFor={`transfer-fix-${line.id}`}>
                                                      {t('transfers.fieldReason')}
                                                    </label>
                                                    <input
                                                      id={`transfer-fix-${line.id}`}
                                                      value={correctionReason}
                                                      onChange={(e) => setCorrectionReason(e.target.value)}
                                                    />
                                                    <small>{t('transfers.hintCorrect')}</small>
                                                  </div>
                                                  <div className="transfer-panel__actions">
                                                    <button
                                                      type="button"
                                                      className="btn btn-danger"
                                                      disabled={busy}
                                                      onClick={() => submitCorrection(row, line)}
                                                    >
                                                      {t('transfers.actCorrectConfirm')}
                                                    </button>
                                                  </div>
                                                </div>
                                              </td>
                                            </tr>
                                          ) : null}
                                        </React.Fragment>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={3}>{t('transfers.totalsLabel')}</th>
                  <th className="transfer-num">{formatPlainAmount(totals.expected, 0)}</th>
                  <th className="transfer-num">{formatPlainAmount(totals.received, 0)}</th>
                  <th />
                  <th className="transfer-num">{formatPlainAmount(totals.remaining, 0)}</th>
                  <th colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransferPayments;
