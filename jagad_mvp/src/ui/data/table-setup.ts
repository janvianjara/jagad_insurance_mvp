import {
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
} from '@tanstack/react-table'
import type { ColumnDef, RowData, TableFeatures } from '@tanstack/react-table'

/**
 * The feature set every queue in this product needs, and nothing else.
 *
 * TanStack Table v9 installs state and instance APIs per registered feature, so
 * this object is what makes `column.getIsSorted()`, `row.getIsSelected()` and
 * `column.getCanHide()` exist at all. Filtering and pagination are deliberately
 * absent: filters live in the URL and are applied before the data reaches the
 * table, and `<Pagination>` is a presentational control over a page the caller
 * already sliced.
 */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
  rowSelectionFeature,
  columnVisibilityFeature,
})

export type DataTableFeatures = typeof dataTableFeatures

/**
 * A column definition for `<DataTable>`. Build these with
 * `dataTableColumns<Row>()`, which pins the feature set for you.
 */
export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData, unknown>

/**
 * Column helper bound to the DataTable feature set.
 *
 * @example
 * const column = dataTableColumns<Inquiry>()
 * const columns = column.columns([
 *   column.accessor('systemNo', { header: 'Reference' }),
 *   column.accessor('customer', { header: 'Customer' }),
 * ])
 */
export function dataTableColumns<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>()
}

/**
 * Per-column meta this product reads. Declared through TanStack's own module
 * augmentation so `meta` stays typed at every call site rather than becoming an
 * `any` bag.
 */
declare module '@tanstack/react-table' {
  /*
   * The three parameters are unused here and cannot be dropped: an augmenting
   * declaration has to match the arity and constraints of the interface it
   * reopens, or it declares a different type instead of extending this one.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TFeatures extends TableFeatures, TData extends RowData, TValue> {
    /**
     * Opt this column out of `collapseConstantColumns`.
     *
     * Set it where the column's SAMENESS is the message. The payout queue's GST
     * columns read "not recorded" in every row because no record in the model
     * carries GST against a commission line (FR-14.7) — folding them into a
     * caption would turn a deliberate disclosure into an absence, which is the
     * one thing this product's money surfaces may not do.
     *
     * Leave it unset everywhere else. A column that happens to be constant today
     * and varies tomorrow needs no annotation: the rule is re-evaluated per page.
     */
    readonly alwaysShow?: boolean
  }
}
