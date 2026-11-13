/*
 * The columns of the list, by how wide its panel is. At the panel's own
 * width a row is a name, how many sections are done, and the status. Wider,
 * it becomes a table: the code and the number of sections, then the split by
 * status as a bar, then one column per required attribute.
 */

export interface ListColumns {
  /** Code, and how many sections. */
  detail: boolean
  /** The sections by status, as one thin bar. */
  bar: boolean
  /** The required attributes: how many Unknown, or the value for a section. */
  attributes: readonly string[]
}

/** Room each extra column takes, in pixels, gaps included. */
export const COLUMN = {
  code: 72,
  sections: 72,
  bar: 104,
  attribute: 128,
  /** What the fixed progress column takes beyond the list's own. */
  progress: 40,
}

/** What a row needs at the very least: box, name, done count and status. */
const BASE = 300

/**
 * The columns that fit. Each group is added only when there is room for all
 * of it, so the name never gets narrower than it is in the plain list.
 */
export function listColumns(
  width: number,
  required: readonly string[]
): ListColumns {
  let room = width - BASE
  const take = (cost: number) => {
    if (room < cost) return false
    room -= cost
    return true
  }
  const detail = take(COLUMN.code + COLUMN.sections + COLUMN.progress)
  const bar = detail && take(COLUMN.bar)
  const attributes = bar ? required.filter(() => take(COLUMN.attribute)) : []
  return { detail, bar, attributes }
}

/** True when the list shows more than the plain three columns. */
export const isTable = (columns: ListColumns) => columns.detail
