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
import type { ColumnDef, RowData } from '@tanstack/react-table'

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
