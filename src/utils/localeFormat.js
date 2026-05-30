import i18n from '../i18n';

/** Uzbekistan locale for numbers/dates in UI (backend values unchanged). */
export function getAppLocale() {
  return i18n.language === 'uz' ? 'uz-UZ' : 'en-US';
}

export function formatAppNumber(value, options = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(getAppLocale(), options);
}

export function formatAppDate(date, options = {}) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(getAppLocale(), options);
}

export function formatAppDateTime(date, options = {}) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(getAppLocale(), options);
}

/** Month filter options for dashboards (value 1-12 or ''). */
export function getMonthFilterOptions(t) {
  return [
    { value: '', label: t('months.all', { ns: 'common' }) },
    ...Array.from({ length: 12 }, (_, i) => ({
      value: String(i + 1),
      label: t(`months.${i + 1}`, { ns: 'common' }),
    })),
  ];
}
