import { useTranslation } from 'react-i18next';
import { translateMenuItems } from '../utils/i18nMenu';
import { translateStatus, translateTransactionType, translateOperation } from '../utils/translateStatus';
import { getMonthFilterOptions } from '../utils/localeFormat';

/**
 * App-wide i18n helpers — wraps react-i18next with ERP-specific utilities.
 * @param {string|string[]} ns - namespace(s), e.g. 'orders' or ['common','orders']
 */
export function useAppTranslation(ns = 'common') {
  const namespaces = Array.isArray(ns) ? ns : [ns];
  // First namespace is the default for unprefixed keys (e.g. t('form.newTitle')).
  const { t, i18n } = useTranslation(namespaces);

  const tStatus = (status, context) => translateStatus(t, status, context);
  const tTxType = (type) => translateTransactionType(t, type);
  const tOp = (op) => translateOperation(t, op);

  const translateMenu = (items) => translateMenuItems(items, (key) => t(key));

  const monthOptions = getMonthFilterOptions((key, opts) => t(key, opts));

  return {
    t,
    i18n,
    language: i18n.language,
    tStatus,
    tTxType,
    tOp,
    translateMenu,
    monthOptions,
    ns: namespaces[0],
  };
}

export default useAppTranslation;
