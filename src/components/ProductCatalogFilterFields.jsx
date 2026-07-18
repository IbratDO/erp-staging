import React from 'react';
import FilterMultiSelect from './FilterMultiSelect';

/**
 * Shared product-attribute filters: all fields are multi-select with checkbox dropdown.
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

  return (
    <>
      {options.categories != null ? (
        <div className="filter-field">
          <label>{lbl('category', t('table.category', { defaultValue: 'Category' }))}</label>
          <FilterMultiSelect
            values={Array.isArray(filters.category) ? filters.category : filters.category ? [filters.category] : []}
            onChange={(category) => set({ category })}
            options={options.categories}
            emptyLabel={empty('category', t('filters.allCategories', { defaultValue: 'All categories' }))}
            placeholder={empty('category', t('filters.allCategories', { defaultValue: 'All categories' }))}
            aria-label={lbl('category', 'Category')}
          />
        </div>
      ) : null}

      {options.brands != null ? (
        <div className="filter-field">
          <label>{lbl('brand', t('table.brand', { defaultValue: 'Brand' }))}</label>
          <FilterMultiSelect
            values={Array.isArray(filters.brand) ? filters.brand : filters.brand ? [filters.brand] : []}
            onChange={(brand) => set({ brand })}
            options={options.brands}
            emptyLabel={empty('brand', t('filters.allBrands', { defaultValue: 'All brands' }))}
            placeholder={empty('brand', t('filters.allBrands', { defaultValue: 'All brands' }))}
            aria-label={lbl('brand', 'Brand')}
          />
        </div>
      ) : null}

      {options.models != null ? (
        <div className="filter-field">
          <label>{lbl('model', t('table.model', { defaultValue: 'Model' }))}</label>
          <FilterMultiSelect
            values={Array.isArray(filters.model) ? filters.model : filters.model ? [filters.model] : []}
            onChange={(model) => set({ model })}
            options={options.models}
            emptyLabel={empty('model', t('filters.allModels', { defaultValue: 'All models' }))}
            placeholder={empty('model', t('filters.allModels', { defaultValue: 'All models' }))}
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
          <FilterMultiSelect
            values={Array.isArray(filters.color) ? filters.color : filters.color ? [filters.color] : []}
            onChange={(color) => set({ color })}
            options={options.colors}
            emptyLabel={empty('color', t('filters.allColors', { defaultValue: 'All colors' }))}
            placeholder={empty('color', t('filters.allColors', { defaultValue: 'All colors' }))}
            aria-label={lbl('color', 'Color')}
          />
        </div>
      ) : null}
    </>
  );
}
