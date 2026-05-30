/**
 * Map backend status / type codes to localized labels.
 * @param {import('i18next').TFunction} t - i18next translate function
 * @param {string} status - API status code
 * @param {string} [context] - status.json group: order | sale | dispatch | return | finance | generic
 */
export function translateStatus(t, status, context = 'generic') {
  if (status == null || status === '') return '';
  const code = String(status);
  const scoped = t(`${context}.${code}`, { ns: 'status', defaultValue: '' });
  if (scoped) return scoped;
  const generic = t(`generic.${code}`, { ns: 'status', defaultValue: '' });
  if (generic) return generic;
  return code.replace(/_/g, ' ');
}

export function translateTransactionType(t, transactionType) {
  if (!transactionType) return '';
  const key = `transactionType.${transactionType}`;
  const label = t(key, { ns: 'status', defaultValue: '' });
  if (label) return label;
  return String(transactionType).replace(/_/g, ' ');
}

export function translateOperation(t, operation) {
  if (operation === 'add') return t('operation.add', { ns: 'status' });
  if (operation === 'subtract') return t('operation.subtract', { ns: 'status' });
  return operation || '';
}
