import React from 'react';
import FilterSearchableSelect from './FilterSearchableSelect';
import FilterMultiSelect from './FilterMultiSelect';

/**
 * Shared product-attribute filters: searchable dropdowns + model free-text + size multi-select.
 */
export default function ProductCatalogFilterFields({
  filters,
  onFiltersChange,
  options,
  t,
  fieldLabels = {},
  emptyLabels = {},
}) {
  const set = (patch) => onFiltersChange({ ...filters, ...patch });

  const lbl = (key, fallback) => fieldLabels[key] ?? fallback;
  const empty = (key, fallback) => emptyLabels[key] ?? fallback;

  const modelSearchPlaceholder = t('filters.modelSearch', { ns: 'common', defaultValue: 'Search model…' });
  const modelSearchApply = t('filters.modelSearchApply', { ns: 'common', defaultValue: 'Search for "{{query}}"' });
  const searchApply = t('filters.searchApply', { ns: 'common', defaultValue: 'Search for "{{query}}"' });

  return (
    <>
      {options.categories != null ? (
        <div className="filter-field">
          <label>{lbl('category', t('table.category', { defaultValue: 'Category' }))}</label>
          <FilterSearchableSelect
            value={filters.category}
            onChange={(category) => set({ category })}
            options={options.categories}
            emptyLabel={empty('category', t('filters.allCategories', { defaultValue: 'All categories' }))}
            placeholder={empty('category', t('filters.allCategories', { defaultValue: 'All categories' }))}
            allowFreeText
            freeTextApplyLabel={searchApply}
            aria-label={lbl('category', 'Category')}
          />
        </div>
      ) : null}

      {options.brands != null ? (
        <div className="filter-field">
          <label>{lbl('brand', t('table.brand', { defaultValue: 'Brand' }))}</label>
          <FilterSearchableSelect
            value={filters.brand}
            onChange={(brand) => set({ brand })}
            options={options.brands}
            emptyLabel={empty('brand', t('filters.allBrands', { defaultValue: 'All brands' }))}
            placeholder={empty('brand', t('filters.allBrands', { defaultValue: 'All brands' }))}
            allowFreeText
            freeTextApplyLabel={searchApply}
            aria-label={lbl('brand', 'Brand')}
          />
        </div>
      ) : null}

      {options.models != null ? (
        <div className="filter-field">
          <label>{lbl('model', t('table.model', { defaultValue: 'Model' }))}</label>
          <FilterSearchableSelect
            value={filters.model}
            onChange={(model) => set({ model })}
            options={options.models}
            emptyLabel={empty('model', t('filters.allModels', { defaultValue: 'All models' }))}
            placeholder={modelSearchPlaceholder}
            allowFreeText
            freeTextApplyLabel={modelSearchApply}
            aria-label={lbl('model', 'Model')}
          />
        </div>
      ) : null}

      {options.sizes != null ? (
        <div className="filter-field">
          <label>{lbl('size', t('table.size', { defaultValue: 'Size' }))}</label>
          <FilterMultiSelect
            values={filters.sizes ?? []}
            onChange={(sizes) => set({ sizes })}
            options={options.sizes}
            emptyLabel={empty('size', t('filters.allSizes', { defaultValue: 'All sizes' }))}
            placeholder={empty('size', t('filters.allSizes', { defaultValue: 'All sizes' }))}
            aria-label={lbl('size', 'Size')}
          />
        </div>
      ) : null}

      {options.colors != null ? (
        <div className="filter-field">
          <label>{lbl('color', t('table.color', { defaultValue: 'Color' }))}</label>
          <FilterSearchableSelect
            value={filters.color}
            onChange={(color) => set({ color })}
            options={options.colors}
            emptyLabel={empty('color', t('filters.allColors', { defaultValue: 'All colors' }))}
            placeholder={empty('color', t('filters.allColors', { defaultValue: 'All colors' }))}
            allowFreeText
            freeTextApplyLabel={searchApply}
            aria-label={lbl('color', 'Color')}
          />
        </div>
      ) : null}
    </>
  );
}
