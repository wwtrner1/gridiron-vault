export type ToolId =
  | "select"
  | "line"
  | "arc"
  | "dashed"
  | "block"
  | "motion"
  | "free"
  | "connect"
  | "pen"
  | "polygon"
  | "zone"
  | "rect"
  | "ellipse"
  | "text"
  | "pivot";

export type ModeId = "multiSelect" | "duplicate" | "clickThrough" | "rotate" | "scale";

export type ToolDef = {
  id: ToolId;
  icon: string;
  label: string;
  title: string;
  hint: string;
  key?: string;
};

export type ModeDef = {
  id: ModeId;
  icon: string;
  label: string;
  title: string;
  hint: string;
  key: string;
};

export const MODES: ModeDef[] = [
  {
    id: "multiSelect",
    icon: "multiselect",
    label: "Multi-select",
    title: "Multi-Select Mode",
    hint: "Click elements one after another to add them to the selection, or drag a box across the field. Shift-click does the same without leaving Select.",
    key: "M",
  },
  {
    id: "duplicate",
    icon: "duplicate",
    label: "Duplicate",
    title: "Duplicate Mode",
    hint: "Drag any element to leave the original in place and pull a copy out of it. Ideal for repeating a route across every receiver.",
    key: "D",
  },
  {
    id: "clickThrough",
    icon: "through",
    label: "Click-through",
    title: "Click-Through Mode",
    hint: "Bypass the layer hierarchy and grab a single element inside a group instead of the whole group.",
    key: "T",
  },
  {
    id: "rotate",
    icon: "rotate",
    label: "Rotate",
    title: "Rotate Mode",
    hint: "Drag anywhere on an element to spin it around its centre. Hold Shift to snap to 15-degree steps.",
    key: "R",
  },
  {
    id: "scale",
    icon: "scale",
    label: "Scale",
    title: "Scale Mode",
    hint: "Drag to resize around the anchor point you pick in the anchor grid. The opposite side stays fixed.",
    key: "S",
  },
];

export const LINE_TOOLS: ToolDef[] = [
  { id: "line", icon: "arrow", label: "Route arrow", title: "Solid line with arrow", hint: "Click to set each turn in the route, then double-click or press Enter to finish. Standard for runs and receiver routes.", key: "1" },
  { id: "dashed", icon: "dashed", label: "Dashed", title: "Dashed line with arrow", hint: "Same drawing action as the route arrow. Use it for the ball flight, motion assignments or man coverage.", key: "2" },
  { id: "block", icon: "block", label: "Block (T-line)", title: "Blocking line", hint: "Ends in a crossbar instead of an arrowhead — the standard mark for a block or a stalk.", key: "3" },
  { id: "motion", icon: "motion", label: "Motion", title: "Wavy motion line", hint: "Draws a sine wave along your clicks. Use it for pre-snap motion and jet sweeps.", key: "4" },
  { id: "arc", icon: "pen", label: "3-point arc", title: "3-point arc", hint: "Click where the route starts, a point it curves through, then where it ends. Good for wheels, swings and fades.", key: "A" },
  { id: "free", icon: "pencil", label: "Freehand", title: "Free-style line", hint: "Press and drag to draw exactly what your hand traces. The stroke is smoothed when you release.", key: "5" },
  { id: "connect", icon: "connect", label: "Auto-connect", title: "Auto-connect line", hint: "Click one player then another and the line snaps cleanly between the two players and follows them when they move.", key: "6" },
  { id: "pen", icon: "pen", label: "Bezier pen", title: "Bezier node pen", hint: "Click to place nodes, then drag the round handles afterwards to curve each segment exactly.", key: "7" },
  { id: "pivot", icon: "pivot", label: "Pivot point", title: "Pivot point", hint: "Drops a marker that becomes the rotation centre for whatever you select next.", key: "8" },
];

export const SHAPE_TOOLS: ToolDef[] = [
  { id: "polygon", icon: "polygon", label: "Polygon", title: "Polygon tool", hint: "Click each corner and close the shape on the first point. Set the side count in Properties.", key: "9" },
  { id: "zone", icon: "zone", label: "Coverage zone", title: "Coverage zone", hint: "Draws a translucent blob for a hook, flat or deep third responsibility.", key: "0" },
  { id: "rect", icon: "rect", label: "Rectangle", title: "Rectangle", hint: "Drag out a box. Hold Shift for a perfect square.", key: "" },
  { id: "ellipse", icon: "ellipse", label: "Ellipse", title: "Ellipse", hint: "Drag out an oval. Hold Shift for a circle.", key: "" },
  { id: "text", icon: "text", label: "Text", title: "Text label", hint: "Click the field and type. Turn on the boxed style in Properties for a callout.", key: "X" },
];

export const EXPORT_SIZES = [
  { id: "wristband", label: "Wristband card", w: 4.5, h: 2.02, note: "Matches the printed NFL FLAG card ratio, 4.5 × 2.02 in." },
  { id: "wristband-lg", label: "Large wristband card", w: 4.75, h: 2.5, note: "Fits a 4.75 × 2.50 in wristband window." },
  { id: "index", label: "Index card", w: 5, h: 3, note: "Classic 5 × 3 in sideline card." },
  { id: "quarter", label: "Quarter page", w: 4.25, h: 5.5, note: "Four plays per letter sheet." },
  { id: "half", label: "Half page", w: 8.5, h: 5.5, note: "Two plays per letter sheet." },
  { id: "letter-p", label: "Letter portrait", w: 8.5, h: 11, note: "Full page with notes — three-ring binder ready." },
  { id: "letter-l", label: "Letter landscape", w: 11, h: 8.5, note: "Wide field view for install meetings." },
  { id: "a4", label: "A4 portrait", w: 8.27, h: 11.69, note: "International letter equivalent." },
] as const;

export type ExportSizeId = (typeof EXPORT_SIZES)[number]["id"];
