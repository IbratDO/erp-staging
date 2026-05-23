import { useEffect, useState } from 'react';
import api from '../utils/api';

/** Load CBU USD/UZS rate for split-currency payments. */
export default function useCbuExchangeRate(enabled = true) {
  const [exchangeRate, setExchangeRate] = useState(null);
  const [exchangeRateError, setExchangeRateError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setExchangeRate(null);
      setExchangeRateError(null);
      return;
    }
    let cancelled = false;
    api
      .get('/exchange-rate/')
      .then((res) => {
        if (!cancelled) {
          setExchangeRate(res.data);
          setExchangeRateError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExchangeRate(null);
          setExchangeRateError('Could not load CBU exchange rate.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { exchangeRate, exchangeRateError, cbuRate: exchangeRate?.rate ?? null };
}
