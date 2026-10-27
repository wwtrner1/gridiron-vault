import type { FieldView } from "./types";

/*
 * Field measurements shared by the drawing code (field.tsx) and pure code the
 * API function also loads (fieldConvert, bulkEdit), so neither pulls in React.
 */

/** How far in from the canvas edge each field view draws its sidelines. */
export const fieldInset = (view: FieldView) => (view === "flag" ? 96 : 34);

/** Yard spacing for each view, in canvas units per 5 yards. */
export const SPACING: Record<FieldView, number> = {
  full: 48,
  half: 72,
  redzone: 104,
  flag: 60,
  blank: 0,
};
/** Canvas units per yard in a view (0 for the whiteboard), for distance read-outs. */
export const unitsPerYard = (view: FieldView) => SPACING[view] / 5;
