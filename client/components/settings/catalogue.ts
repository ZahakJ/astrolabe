// THE CONTROL CATALOGUE — the ten kinds a settings row may be
// (contracts/settings-design.md). One component per kind, one width each:
//
//   toggle     Toggle, a bare switch at the control column's end edge
//   segmented  SegmentedControl, 2–4 short options filling the column
//   select     Select (and the pickers on its trigger: fonts, the theme)
//   chips      Chips, several of a small set, filling the column
//   slider     a range filling the column, its value in the row's label
//   path       PathInput / ImageField, with Pick… inside the field's end
//   text       TextInput / NumberInput / the one textarea, filling the column
//   table      an editor table or composite block, the row's full width
//   action     an s-btn at the column's end edge
//   status     a muted line of what is true now
//
// A .ts file, not a part of Row.tsx, so the settings index (a .ts module the
// tests import under Node) and the tests can name the list.

export const CONTROL_KINDS = ["toggle", "segmented", "select", "chips", "slider", "path", "text", "table", "action", "status"] as const;

export type ControlKind = (typeof CONTROL_KINDS)[number];

/** The kinds a reader SETS (the browser walk sets each one and reads it back
 *  after a reload); the other three are read, pressed or edited in place. */
export const SETTABLE_KINDS: ReadonlySet<ControlKind> = new Set(["toggle", "segmented", "select", "chips", "slider", "path", "text"]);
