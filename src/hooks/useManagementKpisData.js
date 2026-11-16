import { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';

export default function useManagementKpisData({
  year,
  month,
  expensesGranularity,
  marketingGranularity,
  topProductsGranularity,
  marketingCustomerGranularity,
  inventoryValueGranularity,
  enabled,
  marketingOnly = false,
  errorMessage = 'Failed to load management KPIs',
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [turnoverLoading, setTurnoverLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    const params = {
      year,
      month: month || undefined,
      expenses_granularity: expensesGranularity,
      marketing_sold_granularity: marketingGranularity,
      top_products_granularity: topProductsGranularity,
      marketing_customer_granularity: marketingCustomerGranularity,
      inventory_value_granularity: inventoryValueGranularity,
      include_turnover: false,
    };
    try {
      const res = await api.get('/dashboard/management-kpis/', { params });
      setData(res.data);
      setLoading(false);

      if (marketingOnly) {
        setTurnoverLoading(false);
        return;
      }

      setTurnoverLoading(true);
      api
        .get('/dashboard/management-kpis/', { params: { ...params, turnover_only: true } })
        .then((turnRes) => {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  capital_turnover_monthly: turnRes.data.capital_turnover_monthly,
                  roi_monthly: turnRes.data.roi_monthly,
                  snapshot: turnRes.data.snapshot,
                  turnover_pending: false,
                }
              : turnRes.data,
          );
        })
        .catch((e) => console.error('Turnover KPIs load failed', e))
        .finally(() => setTurnoverLoading(false));
    } catch (e) {
      console.error(e);
      setError(errorMessage);
      setLoading(false);
      setTurnoverLoading(false);
    }
  }, [
    year, month, expensesGranularity, marketingGranularity, topProductsGranularity,
    // Every granularity belongs here: the window is a request parameter, so a toggle left out
    // of this list changes the local state, re-renders, and shows the same data back. The
    // linter caught `inventoryValueGranularity` missing, which would have been a toggle that
    // visibly moves and does nothing.
    marketingCustomerGranularity, inventoryValueGranularity,
    enabled, marketingOnly, errorMessage,
  ]);

  useEffect(() => {
    if (enabled) load();
    else setLoading(false);
  }, [load, enabled]);

  return { data, loading, turnoverLoading, error };
}
