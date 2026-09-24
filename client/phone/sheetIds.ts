// The sheets' names in the navigation's entries (nav.ts `sheets`), apart from
// the sheets themselves so that naming one does not import it: the note
// sheet and the move sheet are lazy chunks, fetched the first time they open.

export const ACTION_SHEET = "actions";
export const MOVE_SHEET = "move";
export const NOTE_SHEET = "note";
export const CONFIRM_SHEET = "confirm";
/** The tag picker (./TagPickerSheet.tsx): a note's tags, or every tag to browse. */
export const TAG_SHEET = "tags";
/** A list to pick from (./ListSheet.tsx): a book's contents. */
export const LIST_SHEET = "list";
