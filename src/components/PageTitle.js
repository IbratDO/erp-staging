import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Localized page heading — uses {ns}.title by default.
 * @param {string} ns - i18n namespace (orders, sales, …)
 * @param {string} [titleKey] - key within namespace (default 'title')
 */
export default function PageTitle({ ns, titleKey = 'title', children }) {
  const { t } = useTranslation(ns);
  return <h1>{children ?? t(titleKey)}</h1>;
}
