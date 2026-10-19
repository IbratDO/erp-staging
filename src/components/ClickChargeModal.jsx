import React, { useEffect, useMemo, useRef, useState } from 'react';

import Modal from './Modal';
import './GatewayUI.css';
import { formatPlainAmount } from '../utils/currencyFormat';
import {
  newIdempotencyKey,
  nextActionFor,
  statusKey,
  suggestedAmount,
  unapplied,
} from '../utils/gatewayPayHelpers';

/**
 * Charging a customer's Click QR at the counter.
 *
 * **The scan field is a plain focused input, deliberately not `useBarcodeScanner`.** That hook
 * rebuilds each keystroke from `event.code`, so `KeyL` becomes `"L"` — which is right for this
 * shop's barcodes and destroys a QR payload containing lower-case letters. The hook already steps
 * aside while focus is in a text box, and `Pos.js` disables it whenever the payment window is open,
 * so nothing competes for the keystrokes.
 *
 * **One idempotency key per press of the charge button.** Minted when the modal opens and held
 * until a terminal reply, so a double-tap, a slow reply or a browser retry all land on one charge.
 * A key per request would make every retry a new charge, which is exactly what it exists to stop.
 *
 * **A retry is offered only after an explicit decline.** After an unresolved outcome the provider
 * may already have taken the money, so the only offer is to ask again — `nextActionFor` decides,
 * from fields the server sets, and this component does not form its own view.
 */
/**
 * How long the keystrokes must stop before a scan counts as finished.
 *
 * A wedge scanner delivers a whole payload in a few milliseconds per character, so this is an age
 * by its standards and instant to a person watching. Long enough that a slow USB scanner is not
 * cut in half; short enough that the charge feels like a consequence of the scan.
 */
const SCAN_IDLE_MS = 250;

/**
 * The shortest thing that will be treated as a scan.
 *
 * The only guard against a stray keypress becoming a payment, now that no key has to be pressed to
 * confirm one. A Click QR payload is far longer than this; a cat on the keyboard is not.
 */
const MIN_SCAN_LENGTH = 6;

const ClickChargeModal = ({
  open,
  onClose,
  dueUzs,
  payments = [],
  busy = false,
  error = '',
  lastPayment = null,
  onCharge,
  onCheck,
  labels,
}) => {
  const [amount, setAmount] = useState('');
  const [scanned, setScanned] = useState('');
  // The scan field is off-screen until somebody asks for it. Same input either way: two inputs
  // would mean two values, and the one that charged the customer would be whichever was wired up
  // last.
  const [manual, setManual] = useState(false);
  const scanRef = useRef(null);
  // Held across renders so a re-render cannot mint a second key mid-charge.
  const keyRef = useRef(null);

  const suggestion = useMemo(() => suggestedAmount(dueUzs, payments), [dueUzs, payments]);

  useEffect(() => {
    if (!open) return;
    setAmount(suggestion > 0 ? String(suggestion) : '');
    setScanned('');
    setManual(false);
    keyRef.current = newIdempotencyKey();
    // The cashier's next action is to scan, so the field is ready for it without a click.
    const id = setTimeout(() => scanRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open, suggestion]);

  const action = nextActionFor(lastPayment);
  const amountValue = parseFloat(amount);
  const amountLooksRight = Number.isFinite(amountValue) && amountValue > 0;
  const canSend = !busy && amountLooksRight && scanned.trim().length > 0;

  // Everything a charge needs, read fresh at the moment it fires rather than captured when a
  // timer or listener was set up. Without this, a cashier who edited the amount after opening the
  // window would be charged the amount it suggested when it opened.
  const live = useRef({});
  live.current = { manual, busy, amountLooksRight, amountValue, onCharge };

  // Pending idle-completion. Held in a ref so any new character can cancel it: the scan is only
  // over once the characters actually stop.
  const idleTimer = useRef(null);
  const clearIdle = () => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  };

  const send = (e, code = null) => {
    e?.preventDefault?.();
    clearIdle();
    // `code` is passed by both completion paths, because the last character and the end of the
    // scan can land in the same tick -- `scanned` may not have re-rendered yet, and charging on a
    // value one keystroke short is a failed payment with a confused customer.
    const otp = String(code ?? scanned).trim();
    if (busy || !amountLooksRight || !otp) return undefined;
    return onCharge?.({
      otpData: otp,
      amountUzs: Math.round(amountValue),
      idempotencyKey: keyRef.current,
    });
  };

  /**
   * Arm the "characters have stopped" completion.
   *
   * This is what actually fires the charge in the shop, because the scanner does not send a
   * terminating Enter. Every new character pushes the moment back, so the charge happens once, on
   * the whole payload, after the burst ends.
   */
  const queueScan = (code) => {
    clearIdle();
    const state = live.current;
    if (state.manual || state.busy) return;
    if (String(code || '').trim().length < MIN_SCAN_LENGTH) return;
    idleTimer.current = setTimeout(() => {
      idleTimer.current = null;
      const now = live.current;
      if (now.manual || now.busy || !now.amountLooksRight) return;
      now.onCharge?.({
        otpData: String(code).trim(),
        amountUzs: Math.round(now.amountValue),
        idempotencyKey: keyRef.current,
      });
    }, SCAN_IDLE_MS);
  };

  const tryAgain = () => {
    // A fresh key, because this is a genuinely new charge. Reusing the old one would be answered
    // with the previous result instead of charging.
    keyRef.current = newIdempotencyKey();
    setScanned('');
    scanRef.current?.focus();
  };

  // The scanner types into whatever has focus, so focus is pulled back after anything takes it --
  // changing the amount, dismissing an error. Skipped while the manual box is open, where the
  // cashier is deliberately typing, and while a charge is in flight.
  const armScanner = () => {
    if (manual || busy) return;
    scanRef.current?.focus();
  };

  /**
   * Collect a scan wherever focus happens to be.
   *
   * **Focus is no longer load-bearing, and that is the point.** The scan field is off-screen but
   * real, and relying on it holding focus failed in the shop: one click on the dialog background
   * sends focus to the body, and from then on the scanner types into nothing with no sign that
   * anything is wrong.
   *
   * Read from `event.key`, never `event.code`. `useBarcodeScanner` rebuilds its buffer from
   * `event.code`, where the L key reports `KeyL` and rebuilds as a capital `L` -- fine for this
   * shop's numeric barcodes, fatal for a QR payload with lower-case letters in it.
   */
  // Held in a ref so the document listener below can call the current one without being torn down
  // and re-registered on every keystroke-driven render.
  const queueRef = useRef(queueScan);
  queueRef.current = queueScan;

  // A timer still pending when the window closes would charge for a sale nobody is paying.
  useEffect(() => clearIdle, []);

  useEffect(() => {
    if (!open) return undefined;

    let buffer = '';
    let lastAt = 0;

    const onKeyDown = (e) => {
      const now = Date.now();
      const state = live.current;
      if (state.manual || state.busy) return;

      // A field is handling these itself: the amount, or the manual box. Touching them here would
      // either double-charge the keystroke or stop the amount being editable.
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      // A gap means a new scan. Stray keypresses from minutes ago must not become its prefix.
      if (now - lastAt > 1000) buffer = '';
      lastAt = now;

      if (e.key === 'Enter') {
        const code = buffer.trim();
        buffer = '';
        if (!code) return;
        e.preventDefault();
        e.stopPropagation();
        if (!state.amountLooksRight) return;
        state.onCharge?.({
          otpData: code,
          amountUzs: Math.round(state.amountValue),
          idempotencyKey: keyRef.current,
        });
        return;
      }
      // Single printable characters only, so Shift, Tab and the arrow keys are not swept in.
      if (e.key && e.key.length === 1) {
        buffer += e.key;
        // Same completion as the field's: the burst stopping is the end of the scan.
        queueRef.current(buffer);
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  if (!open) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={labels.title}
      closeLabel={labels.close}
      className="gw-dialog"
      // Set here because `Modal` applies its width as an inline style, which no class can
      // override -- the 1200px default made this small form as wide as the sale behind it and
      // pushed its left edge off the screen. Two fields and a prompt want to be narrow.
      width={460}
    >
      <p className="form-hint" style={{ marginTop: 0 }}>{labels.intro}</p>

      {payments.length ? (
        <div className="form-card" style={{ padding: 12, marginBottom: 12 }}>
          <strong style={{ fontSize: '0.92em' }}>{labels.alreadyTaken}</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.9em' }}>
            {payments.map((p) => (
              <li key={p.merchant_trans_id}>
                {formatPlainAmount(unapplied(p))} {labels.soum}
                {' — '}
                {labels[statusKey(p).replace('gateway.', '')] || p.status}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={send}>
        <div className="form-group">
          <label htmlFor="click-amount">{labels.amount}</label>
          <input
            id="click-amount"
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={armScanner}
          />
          {/* Suggested, never imposed: part of a sale can go on Click and the rest in cash. */}
          <small className="form-hint">{labels.amountHint}</small>
        </div>

        <div className="form-group">
          {/* Off-screen while scanning, a normal field once somebody asks to type. One input in
              both cases -- see the note at the top of this component. */}
          <label
            htmlFor="click-scan"
            className={manual ? undefined : 'gw-scan-hidden'}
          >
            {labels.scan}
          </label>
          <input
            id="click-scan"
            ref={scanRef}
            className={manual ? undefined : 'gw-scan-hidden'}
            type="text"
            value={scanned}
            onChange={(e) => {
              setScanned(e.target.value);
              // The scanner has no suffix, so this is what ends the scan.
              queueScan(e.target.value);
            }}
            onKeyDown={(e) => {
              // A scanner ends its payload with Enter, and that is the whole confirmation step:
              // the amount was chosen before the scanner was pointed. Swallowed here so it charges
              // and does nothing else -- the till has its own Enter shortcuts.
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                send(e, e.currentTarget.value);
              }
            }}
            onBlur={armScanner}
            autoComplete="off"
            spellCheck={false}
            aria-label={labels.scan}
          />

          {manual ? (
            <small className="form-hint">{labels.scanHint}</small>
          ) : (
            <div className="gw-scan-status" aria-live="polite">
              <span className="gw-scan-status__dot" aria-hidden="true" />
              <span>
                <strong>{busy ? labels.charging : labels.waitingForScan}</strong>
                <small className="form-hint" style={{ display: 'block', marginTop: 2 }}>
                  {labels.scanHint}
                </small>
              </span>
            </div>
          )}

          {/* Deliberately understated. The scanner is the way this is meant to work; typing is
              for a till whose scanner is broken, and for entering TEST- codes against the fake. */}
          {manual ? null : (
            <button
              type="button"
              className="gw-link-button"
              onClick={() => {
                // Cancels any pending completion: from here a person is typing deliberately, and
                // pausing to think must not charge them mid-code.
                clearIdle();
                setManual(true);
                setTimeout(() => scanRef.current?.focus(), 0);
              }}
            >
              {labels.typeByHand}
            </button>
          )}
        </div>

        {error ? <div className="error-message">{error}</div> : null}

        {lastPayment && action === 'check' ? (
          <div className="form-card" style={{ padding: 12, marginBottom: 12, background: '#fffbeb' }}>
            {/* No retry here, on purpose: Click may already have taken the money. */}
            <strong style={{ color: '#b45309' }}>{labels.unresolvedTitle}</strong>
            <p className="form-hint" style={{ marginBottom: 8 }}>{labels.unresolvedBody}</p>
            <button
              type="button"
              className="btn-edit btn-dialog"
              onClick={() => onCheck?.(lastPayment.merchant_trans_id)}
              disabled={busy}
            >
              {busy ? labels.checking : labels.check}
            </button>
          </div>
        ) : null}

        {lastPayment && action === 'retry' ? (
          <div className="form-card" style={{ padding: 12, marginBottom: 12 }}>
            <strong>{labels.declinedTitle}</strong>
            {/* **Our sentence first, Click's underneath.** Click answers in Russian and the till
                is in Uzbek, so showing only Click's wording hid the one line that says what to do
                next -- and the commonest decline by far is "the card has no money", where the next
                step is obvious once it can be read. Click's own words stay, because a cashier may
                have to repeat them to the customer or to Click's support. */}
            <p className="form-hint" style={{ marginBottom: 8 }}>
              {labels.failureText}
              {labels.failureNote ? (
                <span className="gw-provider-note">{labels.failureNote}</span>
              ) : null}
            </p>
            <button type="button" className="btn-edit btn-dialog" onClick={tryAgain}>
              {labels.tryAgain}
            </button>
          </div>
        ) : null}

        <div className="form-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn-edit btn-dialog" onClick={onClose}>
            {labels.close}
          </button>
          {/* Only in the typed path. While scanning, the scan itself charges, and a button that
              can never be reached would just be one more thing to look at. */}
          {manual ? (
            <button type="submit" className="btn-primary btn-dialog" disabled={!canSend}>
              {busy ? labels.charging : labels.chargeButton}
            </button>
          ) : null}
        </div>
      </form>
    </Modal>
  );
};

export default ClickChargeModal;
