/**
 * Resolve sidebar menu labels from labelKey via i18next.
 * @param {Array} items - MENU_ITEMS from permissions.js (with labelKey)
 * @param {import('i18next').TFunction} t - useTranslation('common') t
 */
export function translateMenuItems(items, t) {
  if (!items?.length) return [];
  return items.map((item) => {
    if (item.isDropdown) {
      return {
        ...item,
        label: t(item.labelKey),
        subItems: (item.subItems || []).map((sub) => ({
          ...sub,
          label: t(sub.labelKey),
        })),
      };
    }
    return {
      ...item,
      label: t(item.labelKey),
    };
  });
}
