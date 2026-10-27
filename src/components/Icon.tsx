const PATHS: Record<string, string> = {
  cursor: "M5 3l13 8-5.6 1.4L10.3 19z",
  play: "M7 4l13 8-13 8z",
  multiselect: "M3 3h6M3 3v6M21 3h-6M21 3v6M3 21h6M3 21v-6M21 21h-6M21 21v-6M8 8h8v8H8z",
  duplicate: "M8 3h10a2 2 0 012 2v10M4 8h10a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2v-9a2 2 0 012-2z",
  through: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z",
  rotate: "M21 9a9 9 0 10-2 8M21 4v5h-5",
  scale: "M4 20h7M4 20v-7M4 20l8-8M20 4h-7M20 4v7M20 4l-8 8",
  arrow: "M4 20L20 4M20 4h-7M20 4v7",
  dashed: "M4 20l3-3M10 14l3-3M16 8l4-4M20 4h-7M20 4v7",
  block: "M4 20L18 6M14 2l8 8",
  motion: "M3 14c2-4 4 4 6 0s4 4 6 0 4 4 6 0",
  pencil: "M3 21l4-1 12-12-3-3L4 17zM14 5l3 3",
  connect: "M7 17a3 3 0 100-6 3 3 0 000 6zM20 9a3 3 0 100-6 3 3 0 000 6zM9.5 12.8l8-5",
  pen: "M12 20l8-14-14 8 3 1zM4 4l4 4M20 20l-4-4",
  pivot: "M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0M12 2v4M12 18v4M2 12h4M18 12h4",
  polygon: "M12 3l9 6.5-3.4 10.5H6.4L3 9.5z",
  zone: "M5 8c4-5 10-5 14 0s-1 12-7 12S1 13 5 8z",
  rect: "M3 5h18v14H3z",
  dock: "M20 20L8 8M8 8h7M8 8v7M3 21V3h18",
  ellipse: "M12 5c5 0 9 3.1 9 7s-4 7-9 7-9-3.1-9-7 4-7 9-7z",
  text: "M5 5h14M12 5v14M9 19h6",
  group: "M3 7h6v6H3zM15 11h6v6h-6zM9 10h6M12 10v4",
  ungroup: "M3 3h7v7H3zM14 14h7v7h-7z",
  front: "M12 3l6 5h-4v7h-4V8H6zM4 20h16",
  back: "M12 21l-6-5h4V9h4v7h4zM4 4h16",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  undo: "M4 9h11a5 5 0 010 10H9M4 9l4-4M4 9l4 4",
  redo: "M20 9H9a5 5 0 000 10h6M20 9l-4-4M20 9l-4 4",
  grid: "M3 9h18M3 15h18M9 3v18M15 3v18",
  download: "M12 3v12M12 15l-5-5M12 15l5-5M4 20h16",
  print: "M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  upload: "M12 21V9M12 9l-5 5M12 9l5 5M4 4h16",
  wristband: "M8 3h8l1 4H7zM8 21h8l1-4H7zM6 7h12v10H6zM9 10h6M9 13h6",
  language: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
  help: "M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.5a2.5 2.5 0 114 2c-1 .6-1.5 1.2-1.5 2.3M12 17h.01",
  save: "M4 4h12l4 4v12H4zM8 4v6h7V4M8 20v-6h8v6",
  plus: "M12 5v14M5 12h14",
  chevron: "M8 10l4 4 4-4",
  prev: "M15 6l-6 6 6 6",
  next: "M9 6l6 6-6 6",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  folder: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  table: "M3 5h18v14H3zM3 10h18M9 10v9M15 10v9",
  board: "M4 4h16v12H4zM12 16v4M8 20h8",
  paint: "M5 3h11v6H5zM8 9v3a2 2 0 002 2h1v5h-3v3",
  lock: "M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z",
  flip: "M12 3v18M8 7L4 12l4 5zM16 7l4 5-4 5z",
  align: "M12 3v18M4 8h6M14 8h6M4 16h6M14 16h6",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  check: "M4 12l5 5L20 6",
  close: "M6 6l12 12M18 6L6 18",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  sparkle: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  sort: "M8 4v16M8 20l-3-3M8 20l3-3M16 20V4M16 4l-3 3M16 4l3 3",
  users: "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M16 3.5a4 4 0 010 7M18 14a6 6 0 014 7",
  calendar: "M4 6h16v15H4zM4 10h16M8 3v5M16 3v5",
  message: "M4 4h16v12H8l-4 4zM8 9h8M8 12h5",
  ladder: "M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10",
  phone: "M5 3h4l2 5-3 2a11 11 0 006 6l2-3 5 2v4a2 2 0 01-2 2A17 17 0 013 5a2 2 0 012-2z",
  mail: "M3 5h18v14H3zM3 6l9 7 9-7",
};

export function Icon({ name, size = 18, ...rest }: { name: string; size?: number } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name] ?? PATHS.cursor} />
    </svg>
  );
}
