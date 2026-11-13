/**
 * Tutorials: one guide per screen, listing every button on it and what it
 * does. The same data drives three things, so they never drift apart:
 * - the "?" help on each screen (components/Tour.tsx, PageHelp),
 * - the guided tour that spotlights each button in turn (Tour),
 * - the Tutorials page (pages/Tutorials.tsx), with its button finder.
 *
 * A step's `target` is a CSS selector. Most point at a `data-tour` attribute
 * (`tour("id")`) so restyling a button doesn't break its tour. The tour skips
 * a step whose target isn't on screen (a signed-out coach, a phone layout, a
 * bar that only shows while drawing); the "?" list still shows it. `open`
 * lists buttons the tour clicks, in order, to bring a target on screen (a
 * menu, a dialog), and `close` is clicked when the tour moves past them.
 * Pure data: no React, no DOM.
 */

export type GuideStep = {
  title: string;
  text: string;
  target?: string;
  open?: string[];
  close?: string;
};

export type GuideSection = { heading: string; steps: GuideStep[] };

export type Guide = {
  id: string;
  title: string;
  /** Where the tour runs. A query string picks a tab (Front Office, My team). */
  path: string;
  /** One line for the Tutorials page and the top of the "?" help. */
  intro: string;
  /** Who it's for or when to use it, shown on the Tutorials page. */
  when: string;
  sections: GuideSection[];
};

/** Selector for an element marked `data-tour="id"`. */
export const tour = (id: string) => `[data-tour="${id}"]`;

const EXTRAS = '[aria-controls="dz-more-menu"]';
const GRIDDY_OPEN = ".gd-launch";
/** On phones the tools panel is a sheet behind the thumb bar's Tools button, and the play panel is in Extras. */
const RAIL = { open: ['.dz-dock button[aria-controls="dz-tools"]'], close: ".dz-sheet-head .dz-top-btn" };
const SIDE = { open: [EXTRAS, tour("dz-details")], close: ".dz-side-head .dz-top-btn" };
const GRIDDY_CLOSE = '.gd-head button[aria-label^="Close"]';

/** Steps every signed-in screen shares: the side menu, the help button and Griddy. */
const SHELL: GuideSection = {
  heading: "On every screen",
  steps: [
    {
      title: "Side menu",
      text: "Every tool in one list: the Vault, Upload, Playbooks, My team, Front Office, Assignments, Call Sheet, Coverage report, Practice, Wristbands, Starter plays, Playbook language and More tools. On a phone, the menu button at the top left opens it.",
      target: "#rail-nav .rail-group:nth-of-type(2)",
    },
    {
      title: "Draft a play",
      text: "The cyan button at the top of the menu opens a fresh play in the Designer from any screen.",
      target: '#rail-nav a[href="/build"]',
    },
    {
      title: "Your playbooks as folders",
      text: "Every playbook and its plays, like folders on a computer. Click a play to open it, + to start a new play in that folder, or drag a play onto a folder to add it.",
      target: "#rail-nav .rail-tree",
    },
    {
      title: "Account, plans and help",
      text: "Plans compares what each plan includes, Your account holds your profile, plan and backups, Tutorials teaches every screen, and Help & feedback reaches a person.",
      target: '#rail-nav a[href="/account"]',
    },
    {
      title: "Help on this screen",
      text: "The ? button lists every button on the screen you're on, and Show me around walks you through them one at a time.",
      target: tour("page-help"),
    },
    {
      title: "Ask Griddy",
      text: "Your coaching assistant, in the corner of every screen. Call a play and he draws it, ask what beats Cover 2, paste a list of plays, or have him change every play in your Vault at once.",
      target: GRIDDY_OPEN,
    },
  ],
};

export const GUIDES: Guide[] = [
  {
    id: "designer",
    title: "Designer",
    path: "/build",
    intro: "Draw a play: players, routes, blocks, zones and notes on a real field.",
    when: "Start here. Every play in GridIronVault is drawn or checked here.",
    sections: [
      {
        heading: "Top bar",
        steps: [
          {
            title: "Play name",
            text: "The play you're editing. Name it in Details on the right; the name goes on every card and PDF.",
            target: ".dz-top .dz-name",
          },
          {
            title: "Previous and next play",
            text: "Steps through the plays in the playbook you opened (or your whole Vault). Unsaved changes are saved first. Keys: [ and ].",
            target: ".dz-top .dz-step",
          },
          {
            title: "Work tabs",
            text: "Designer, Playbook, Wristbands and Call Sheet. They remember the play, playbook and Call Sheet you were on, so one click takes you to the same game plan. Unsaved changes are saved first.",
            target: ".dz-top .worktabs",
          },
          {
            title: "Zoom and Fit",
            text: "The slider zooms the field. Fit sizes the whole field to the screen again. Ctrl + scroll or a trackpad pinch zooms around the pointer; on a phone, pinch.",
            target: ".dz-top .dz-zoom, .dz-top .dz-fit",
          },
          {
            title: "Details",
            text: "Opens the play panel on the right: name, formation, type, tags, notes, the opponent front and the rules check.",
            target: '.dz-top .dz-wide[aria-controls="play-details"]',
          },
          {
            title: "Run play",
            text: "Animates every route from the snap so you can check timing. You can set it beside game film, and run it against a defense from there.",
            target: tour("dz-run"),
          },
          {
            title: "Export",
            text: "Download the play as a PNG, JPEG, PDF or PowerPoint slide, or print it as a wristband card. Sizes and DPI follow your plan.",
            target: tour("dz-export"),
          },
          {
            title: "Undo and redo",
            text: "Takes back the last change, a whole drag at a time, and puts it back again (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z; ⌘ on a Mac). The floating tools and Extras have them too.",
            target: tour("dz-undo"),
          },
          {
            title: "Save play",
            text: "Keeps the play in your Vault. Signed in, it also goes to your account so it's on every device. It reads Saved when nothing has changed, and Live with … when you're drawing with your staff.",
            target: tour("dz-save"),
          },
          {
            title: "Extras",
            text: "Everything else, in one drop-down: Edit, Field, Play, Go to and Help. A dot shows on it while route depths or a Vs defense overlay is on.",
            target: EXTRAS,
          },
          {
            title: "Help on this screen",
            text: "This list, any time. Show me around walks the buttons one at a time, and the 6 quick moves are short animated lessons.",
            target: tour("page-help"),
          },
        ],
      },
      {
        heading: "Extras menu",
        steps: [
          {
            title: "Undo, redo, clean up",
            text: "Undo and Redo (Ctrl+Z, Ctrl+Shift+Z). Clean up lines straightens wobbly routes into clean legs. Route depths prints each route's depth in yards on the field. Select all picks everything.",
            target: tour("dz-more-edit"),
            open: [EXTRAS],
            close: EXTRAS,
          },
          {
            title: "Field",
            text: "Field picks half, full, red zone, flag 30×70 or blank; routes keep their depth in yards when you switch. View from the defense turns the whole play half a circle about the ball so you can draw it from the other end (half, full and blank fields). Vs defense lays a defense under the play. Field controls sets snap to grid, hash marks, yard-line contrast and the league rule lines.",
            target: tour("dz-more-field"),
            open: [EXTRAS],
            close: EXTRAS,
          },
          {
            title: "Coverage check",
            text: "Runs this play against Cover 1, 2, 3, 4 and man and shows who gets open, read by read.",
            target: tour("dz-coverage"),
            open: [EXTRAS],
            close: EXTRAS,
          },
          {
            title: "Turn this offense into a defense",
            text: "Reads the offense on the field (personnel, trips or 2x2, where the strength is) and drops a front and coverage that fit it, lined up on the real blockers by technique, with every defender's gap, technique or coverage job written under him. A defense already on the field is replaced; Undo brings it back. Also on the Sets tab's Defense list.",
            target: tour("dz-match-defense"),
            open: [EXTRAS],
            close: EXTRAS,
          },
          {
            title: "New play, setup, live, flip",
            text: "New play… starts another play, and asks to save this one first if it has changes. New play setup turns the name-personnel-formation questions on or off. Draw this live with my staff opens the play for your Front Office to edit at the same time. Flip and save as a new play makes the mirror image.",
            target: tour("dz-play"),
            open: [EXTRAS],
            close: EXTRAS,
          },
          {
            title: "Add to playbook",
            text: "Add to playbook… files this play in a playbook you have. Add to a new playbook… lets you type a name, makes the playbook and puts the play in it in one step. A play with unsaved changes is saved first.",
            target: tour("dz-add-book"),
            open: [EXTRAS],
            close: EXTRAS,
          },
          {
            title: "Go to",
            text: "Upload a whiteboard photo, More tools and Back to the Vault. On narrow screens the work tabs live here too.",
            target: tour("dz-more-goto"),
            open: [EXTRAS],
            close: EXTRAS,
          },
          {
            title: "Help",
            text: "Your tools: show or hide trims the tools panel to what you use. How the designer works plays the 6 quick moves. Coach tips turns the small hint bubbles on or off.",
            target: tour("dz-more-help"),
            open: [EXTRAS],
            close: EXTRAS,
          },
        ],
      },
      {
        heading: "Tools panel (left)",
        steps: [
          {
            title: "Modes",
            text: "How a press on the field behaves. Select (V) picks and moves. Multi-select adds to the selection, Duplicate copies what you drag, Click-through picks what's underneath, Rotate and Scale turn and size the selection around a pivot or anchor.",
            target: ".dz-modes", ...RAIL,
          },
          {
            title: "Tool sets",
            text: "Draw (lines and shapes), Routes (the route library), Players (offense and defense), Sets (formations, defenses, layers, saved format) and the folder icon for your playbooks. Arrow keys move between them.",
            target: ".dz-tabs", ...RAIL,
          },
          {
            title: "Draw: lines and shapes",
            text: "Route arrow (solid, for runs and routes), Dashed (ball flight, motion, man coverage), Block (T-line), Motion (wavy), 3-point arc (wheels, fades), Freehand, Auto-connect (glued between two players), Bezier pen and Pivot point. Shapes: Polygon, Coverage zone, Rectangle, Ellipse and Text. Number keys 1–9 and 0 pick them.",
            target: "#dz-tabpanel", ...RAIL,
          },
          {
            title: "Routes, Players, Sets, Plays",
            text: "Routes: pick a route from the tree, then click a player and it's drawn from him. Players: Offense or Defense, then tap a position to drop it or drag it to a spot. Sets: Formations drops a whole offense (5v5, 7v7, 11-man), Defense lines up a front and coverage, Layers lists everything (including locked and hidden items), Saved play format copies one play's look to others. Plays: your playbook folders.",
            target: ".dz-tabs", ...RAIL,
          },
          {
            title: "Show or hide tools",
            text: "Too many tools? Hide the ones you don't use. Nothing is deleted and every tool comes back from here. How it works plays the 6 quick moves.",
            target: ".dz-rail-foot", ...RAIL,
          },
          {
            title: "Style card",
            text: "Color, weight, dash, curve and line ends for whatever is selected, or for the next line you draw. Wristband bold makes lines and players heavy enough to read on a 4-inch card. Ctrl+Alt+C copies a style and Ctrl+Alt+V pastes it.",
            target: ".dz-style", ...RAIL,
          },
        ],
      },
      {
        heading: "The field",
        steps: [
          {
            title: "Griddy bar",
            text: "Type or say a call (“Trips right, X go, Z post, H flat”) and Griddy draws it. Check the chips, then Yes, draw it. The mic keeps listening until you tap Done.",
            target: ".builder-main .pa-bar",
          },
          {
            title: "Field",
            text: "Click a player to pick him (his routes light up), drag to move him and his routes follow. Right-click (or press and hold) for Duplicate, Delete, Lock, Send to back and more. Double-click or Enter finishes a line; Esc stops drawing.",
            target: ".builder-stage",
          },
          {
            title: "Floating tools",
            text: "A small bar over the field: Select, Route, Dashed, Block and Text; 1st read, 2nd read, Checkdown and Defense colors; every color; line weights; Undo and Redo. Drag the grip to move it, collapse it, or dock it in the corner.",
            target: ".dz-float",
          },
          {
            title: "Drawing bar",
            text: "Shows while a line tool is on: Finish line, Undo point, Scrap, Line (L), 3-point arc (A), Snap (S), Ortho (O), Polar (P), Freehand (F) and Exit drawing (Esc).",
            target: ".dz-drawbar",
          },
          {
            title: "Selection bar",
            text: "Shows while something is selected, so phones and tablets get Duplicate, Delete, Lock and the rest without a right-click. Done clears the selection.",
            target: ".dz-selbar",
          },
          {
            title: "Status line",
            text: "Says what just happened and what the tool is waiting for, the Vs defense showing (× hides it), and how many elements are on the field and selected.",
            target: ".dz-status",
          },
          {
            title: "Edge tabs",
            text: "Hide on each side tucks the tools panel or the play panel away for more field; Show tools and Show play pull them back. Ctrl+\\ hides or shows both.",
            target: ".dz-edge-left",
          },
          {
            title: "Thumb bar (phones)",
            text: "Tools opens the tools sheet, then Select, Route, Players and zoom, right under your thumb.",
            target: ".dz-dock",
          },
        ],
      },
      {
        heading: "Play panel (right)",
        steps: [
          {
            title: "Play intel",
            text: "Name, formation, type (run, pass, defense, special), personnel, field, coaching notes and labels. Write the talking points for me adds each player's job to the notes.",
            target: "#play-details", ...SIDE,
          },
          {
            title: "Opponent front and Rules check",
            text: "Opponent front shows a stock 11-man front and coverage, a 5-on-5 flag look or one of your saved defenses under the play. Rules check reads the drawing against your league's rules (players a side, blocking, QB runs, no-run zones, rushers, motion); Show me on the field picks what to fix.",
            target: "#play-details", ...SIDE,
          },
          {
            title: "Selection, presets, notes, arrange",
            text: "With something picked, its own settings show here (label, size, color, first read, route tag). Player presets save a look for a letter, Player notes write one player's job, and Arrange aligns, distributes, flips, groups and layers.",
            target: "#play-details", ...SIDE,
          },
        ],
      },
      {
        heading: "Keyboard",
        steps: [
          { title: "Pick tools", text: "V select · L straight route · A 3-point arc · F freehand · 1–9, 0 the line and shape tools · X text · Esc back to Select." },
          { title: "Edit", text: "Ctrl+Z undo · Ctrl+Shift+Z redo · Ctrl+C / Ctrl+V copy and paste (even onto another play) · Ctrl+D duplicate · Delete removes · Ctrl+Alt+C / Ctrl+Alt+V copy and paste a style · N / Shift+N select the next or previous element on the field · arrow keys move what is selected, its routes with it (Shift for a bigger step)." },
          { title: "Move around", text: "[ and ] previous and next play · Ctrl + scroll zoom · Ctrl+\\ hide or show both panels · Enter finishes a line." },
        ],
      },
    ],
  },
  {
    id: "coverage-check",
    title: "Coverage check",
    path: "/build",
    intro: "Run the play you're drawing against a live defense and see who gets open.",
    when: "Before you put a pass play on the Call Sheet: find out which coverages it beats.",
    sections: [
      {
        heading: "Open it",
        steps: [
          {
            title: "Extras → Coverage check",
            text: "In the Designer, open Extras and pick Coverage check: who gets open. Run play also has Run it against a defense.",
            target: tour("dz-coverage"),
            open: [EXTRAS],
            close: EXTRAS,
          },
        ],
      },
      {
        heading: "Inside the check",
        steps: [
          {
            title: "Looks",
            text: "One chip per defense (Cover 1, 2, 3, 4, man, and the flag looks for 5v5 or 7v7), colored by how the play does: green beats it, amber is close, red is covered.",
            target: ".cov .cov-looks",
            open: [EXTRAS, tour("dz-coverage")],
            close: ".cov .rp-top button",
          },
          {
            title: "Run it",
            text: "Play runs the snap: receivers follow your routes, zone defenders drop and squeeze, man defenders trail, rushers chase the QB. Speed slows it down. Ball out at sets the throw at 1.6 s, the default for your format, or 3.0 s.",
            target: ".cov .rp-bar",
            open: [EXTRAS, tour("dz-coverage")],
            close: ".cov .rp-top button",
          },
          {
            title: "The table",
            text: "Read order, player, route, space to the nearest defender at the throw, and open, tight or covered. The QB's best throw is highlighted.",
            target: ".cov .rp-right",
            open: [EXTRAS, tour("dz-coverage")],
            close: ".cov .rp-top button",
          },
          {
            title: "Show it on the field",
            text: "The Show … on the field button lays this defense under your play (Vs defense) so you can adjust a route against it. Back to drawing closes the check.",
            target: ".cov .rp-top",
            open: [EXTRAS, tour("dz-coverage")],
            close: ".cov .rp-top button",
          },
          {
            title: "It's a teaching model",
            text: "It reads the routes you drew, at the depths you drew them. Real defenders guess and cheat; use it to find the plays worth repping, then trust your film.",
          },
        ],
      },
    ],
  },
  {
    id: "griddy",
    title: "Griddy",
    path: "/vault",
    intro: "Your coaching assistant: draws plays, edits your whole Vault, builds call sheets and answers football questions.",
    when: "Any time typing a sentence beats clicking through every play.",
    sections: [
      {
        heading: "Talk to Griddy",
        steps: [
          {
            title: "Ask Griddy",
            text: "Opens Griddy from any screen. In the Designer he's the bar above the field instead.",
            target: GRIDDY_OPEN,
          },
          {
            title: "Starters and quick picks",
            text: "Draw a play, Recolor a letter, Swap a letter, Flip plays, Route colors, Call sheet, Find plays, Paste a playbook, What beats it, Game plan, Scout defense and Gap fits. A pick types a starter into the box for you to finish; nothing sends until you press Send.",
            target: ".gd-panel .gd-starters, .gd-panel .gd-picks",
            open: [GRIDDY_OPEN],
            close: GRIDDY_CLOSE,
          },
          {
            title: "Message box",
            text: "Type anything: “Draw Trips Right, X bubble, Z go”, “Make every Y in my Vault yellow”, “Move my red zone plays to the full field”, “What beats Cover 3?”. Enter sends; Shift+Enter starts a new line.",
            target: ".gd-panel .gd-compose-row",
            open: [GRIDDY_OPEN],
            close: GRIDDY_CLOSE,
          },
          {
            title: "Attach, talk, send",
            text: "The upload button attaches a list of plays (text or CSV) or a whiteboard photo. The mic lets you say it; it keeps listening until you tap Done. Send asks Griddy.",
            target: ".gd-panel .gd-send",
            open: [GRIDDY_OPEN],
            close: GRIDDY_CLOSE,
          },
          {
            title: "New conversation and close",
            text: "+ starts a fresh conversation; × closes the panel. Griddy keeps the conversation while you move between screens.",
            target: ".gd-panel .gd-head",
            open: [GRIDDY_OPEN],
            close: GRIDDY_CLOSE,
          },
        ],
      },
      {
        heading: "What he hands back",
        steps: [
          { title: "Play cards", text: "A drawn play shows as a card. Yes, draw it puts it on the Designer's field (or opens a new play); nothing is saved until you save." },
          { title: "Import cards", text: "Paste a whole playbook and Griddy splits it into plays. The card reads each one, shows them, and saves the ones you keep into a named playbook." },
          { title: "Bulk edit cards", text: "Recolor, swap letters, restyle lines or text, change the field, flip, rename, retag or file plays across the whole Vault, a playbook or a filter. The card previews every play it touches; Apply makes the change and Undo puts it back." },
          { title: "Call sheet cards", text: "Griddy picks Vault plays per situation and the card builds a Call Sheet with every row linked to its diagram." },
          { title: "Coverage answers", text: "Ask “what beats Cover 2?” and he answers from the Coverage check on your own plays, never from guesswork." },
        ],
      },
    ],
  },
  {
    id: "vault",
    title: "The Vault",
    path: "/vault",
    intro: "Every play you've drawn, plus the plays other coaches shared.",
    when: "Find a play, export a batch, or file plays into a playbook.",
    sections: [
      {
        heading: "Top bar",
        steps: [
          { title: "Call Sheet", text: "Opens your game plan.", target: '.topbar a[href="/grid"]' },
          { title: "Draft a play", text: "Opens a fresh play in the Designer.", target: '.topbar a[href="/build"]' },
        ],
      },
      {
        heading: "Find plays",
        steps: [
          {
            title: "Your plays or Shared by coaches",
            text: "Your plays is your own Vault. Shared by coaches lists plays other coaches made public; Copy to my Vault makes one yours to edit.",
            target: tour("vault-tabs"),
          },
          {
            title: "Ready-to-Go playbook",
            text: "Adds a complete 5v5 playbook (Spread, Trips & Bunch, Twins, Misdirection & Run) to your Vault in one click. It disappears once you have it.",
            target: ".vault-ready",
          },
          {
            title: "Saved play format",
            text: "Format plays, then click any play to give it the look you saved in the Designer (colors, weights, labels). Undo puts the last one back.",
            target: ".vault-format",
          },
          {
            title: "Search, filter, sort",
            text: "Search names, formations and labels. Narrow by formation or type (pass, run, defense, special), and sort. Sorting never changes what's in the Vault. Clear filters shows everything again.",
            target: ".page > .filters",
          },
          { title: "Labels", text: "Each label you've used becomes a chip. Click one to show only those plays.", target: ".page > .chip-row" },
        ],
      },
      {
        heading: "Each play",
        steps: [
          {
            title: "Play card",
            text: "The check box picks the play for a batch. Open edits it in the Designer, Export downloads or prints it, the folder adds it to a playbook (one you have or a new one you name), and the bin deletes it (Undo on the message brings it back; a signed-in delete is kept for 30 days). This browser means it isn't on your account yet: sign in and save it.",
            target: ".play-grid .play-card",
          },
          {
            title: "Batch bar",
            text: "Pick plays and this bar appears: Add to playbook, Add to new playbook (type a name and they go straight in), Export or print them together, or Clear the picks.",
            target: ".bulk-bar",
          },
        ],
      },
    ],
  },
  {
    id: "playbooks",
    title: "Playbooks",
    path: "/playbooks",
    intro: "Group plays into books the way you install them: by week, level or situation.",
    when: "Building an install, a red zone package, or a packet to print.",
    sections: [
      {
        heading: "Top bar",
        steps: [
          { title: "Work tabs", text: "Designer, Playbook, Wristbands and Call Sheet, carrying the playbook you're on.", target: ".worktabs" },
          { title: "New playbook", text: "Name it, describe it and pick its color.", target: tour("new-playbook") },
        ],
      },
      {
        heading: "Each playbook",
        steps: [
          {
            title: "Open",
            text: "Shows the plays in order. Move up and Move down set the install order (and the printed packet's order), Edit opens the Designer, and × takes a play out of the book without deleting it.",
            target: ".book-actions",
          },
          { title: "Add plays", text: "Search your Vault and add plays. A play can live in more than one book.", target: ".book-actions" },
          { title: "Assignments", text: "One player's job on every play in this book, as a printable position sheet.", target: ".book-actions" },
          { title: "Print", text: "Every play in the book as one PDF packet (diagram on top, notes below) or a wristband run.", target: ".book-actions" },
          {
            title: "Player link",
            text: "One link and QR code that opens this book on your players' phones, each with their own job highlighted and the Griddy Quiz. Players never see the rest of your Vault.",
            target: ".book-actions",
          },
          { title: "Rename and delete", text: "Delete removes the book only (Undo on the message brings it back). The plays stay in your Vault.", target: ".book-actions" },
          {
            title: "Not in a playbook yet",
            text: "Plays that aren't in any book. Add them all to a new playbook names one and files every one of them in it.",
            target: tour("pb-file-unfiled"),
          },
        ],
      },
    ],
  },
  {
    id: "callsheet",
    title: "Call Sheet",
    path: "/grid",
    intro: "Your game plan as a spreadsheet: situations, calls and diagrams, ready to print or put on wristbands.",
    when: "Game week. Line up openers, third downs and red zone calls.",
    sections: [
      {
        heading: "Top bar",
        steps: [
          { title: "Print", text: "Shows a print preview first: the sheet on landscape paper, with the paint colors and every column fitted to the page. Minimized rows and columns stay off. Print from the bar at the top, or Close.", target: tour("sheet-print") },
          { title: "Wristbands", text: "Opens the wristband builder with this sheet's calls, numbered as they are here.", target: '.topbar a[href^="/wristbands"]' },
          { title: "New sheet, Delete, Save sheet", text: "Start another sheet, delete this one (Undo on the message brings it back), or save it to your account so it's on every device.", target: tour("sheet-save") },
        ],
      },
      {
        heading: "Toolbar",
        steps: [
          { title: "Name and switch", text: "Click the name to rename the sheet. With more than one sheet, the drop-down switches between them.", target: '[aria-label="Call sheet name"]' },
          { title: "Paint mode", text: "Turn it on, pick a color, then click any cell (or a row's grip for the whole row). Clear all paint is under the sheet.", target: tour("sheet-paint") },
          { title: "Find", text: "Shows only the rows that match what you type.", target: '[aria-label="Find in this call sheet"]' },
          { title: "Compact, hide empty, minimize", text: "Compact tightens the rows, Hide empty rows hides blank ones, and Minimize every row folds each row to one line. Nothing is deleted; Show everything brings it all back.", target: tour("sheet-view") },
          { title: "Renumber", text: "Numbers the # column 1, 2, 3 in your order so wristband numbers match.", target: tour("sheet-renumber") },
          { title: "Ask Griddy", text: "Types a call-sheet request into Griddy for you to finish: he picks Vault plays per situation and you review it before anything is saved.", target: tour("sheet-griddy") },
          { title: "Add column, add row", text: "A new column at the end or a new row at the bottom.", target: tour("sheet-add") },
        ],
      },
      {
        heading: "The sheet",
        steps: [
          {
            title: "Column headers",
            text: "Click a header to sort (Back to my order undoes it), rename it, drag the dots to move it (or Tab to the dots and press ← →), minimize it to a thin strip, or remove it.",
            target: ".grid-wrap thead",
          },
          {
            title: "Rows",
            text: "Type freely; each column learns what you enter and offers it back (Tab accepts). Type a play's name from your Vault and the row links to its diagram. Each row can open its play, link a play, move up or down, minimize, copy, add a row below, or be removed.",
            target: ".grid-wrap tbody",
          },
        ],
      },
    ],
  },
  {
    id: "wristbands",
    title: "Wristbands",
    path: "/wristbands",
    intro: "Print quarterback wristband cards from a Call Sheet or a playbook.",
    when: "The night before the game.",
    sections: [
      {
        heading: "Print",
        steps: [
          { title: "Call sheet", text: "A coach's sheet listing every call with its number and card, to match the wristbands. Opens in the print preview, where you print or download it.", target: ".wb-head-actions" },
          { title: "Print cards", text: "Opens the print preview: every page of the real PDF, exactly as it prints, with a warning if a player or route will be cut off. Print or Download PDF from there.", target: tour("wb-print") },
        ],
      },
      {
        heading: "Set up the card",
        steps: [
          { title: "One-click styles", text: "Sideline 2×4, Wristband bold and Best for this card set many options at once. Your card size stays; fine-tune anything below.", target: '[aria-labelledby="wb-presets"]' },
          { title: "Pull plays from", text: "A Call Sheet, a playbook, or Pick plays by hand.", target: tour("wb-source") },
          { title: "Numbering", text: "Use the Call Sheet's numbers, 1, 2, 3 in print order, by card, or card spots like A1, A2. A warning shows when two boxes share a number.", target: '[aria-labelledby="wb-numbering"]' },
          { title: "Card size", text: "Real wristband windows by maker, or Custom to type your own size.", target: '[aria-labelledby="wb-card-size"]' },
          { title: "Plays per card", text: "Columns × rows. A note warns when a box is too short to read and offers the densest grid that still reads.", target: '[aria-labelledby="wb-grid"]' },
          { title: "Diagram", text: "Fit (crop to the players or the whole field), line weight, field markings and rule lines. Same size in every box makes players, routes and yard lines match across the card; Field size, Player icons and Route lines change every box at once.", target: '[aria-labelledby="wb-look"]' },
          { title: "Card colors", text: "Pick a color set (Team colors, Black and white, Navy and gold and more), then change the header, its words, the number tab, the numbers or the lines. The preview and the print match.", target: tour("wb-colors") },
          { title: "Each box shows", text: "Number, name, formation and the label style.", target: '[aria-labelledby="wb-shows"]' },
          { title: "Header, paper and copies", text: "Header and border text (with {team}, {card} and the rest), paper size or one card per page, cut marks, and how many copies of each card.", target: '[aria-labelledby="wb-text"]' },
        ],
      },
      {
        heading: "Preview",
        steps: [
          {
            title: "Card layout",
            text: "Shown at actual size. Drag a box to move a call, or use the arrows. Click a header to edit its text. Print preview shows every printed page. Every sheet carries a 1-inch scale bar; if it doesn't measure an inch, your printer is set to Fit to page.",
            target: ".wb-body > :last-child",
          },
        ],
      },
    ],
  },
  {
    id: "upload",
    title: "Upload plays",
    path: "/upload",
    intro: "Turn a whiteboard photo, screenshot, scanned binder, PDF or PowerPoint into editable plays.",
    when: "Moving an old playbook in.",
    sections: [
      {
        heading: "Bring plays in",
        steps: [
          { title: "Drop plays here", text: "Drop JPG, PNG, HEIC, PDF or PPTX files, or press Ctrl+V anywhere on the page.", target: ".up-drop" },
          { title: "Choose files and paste", text: "Choose files opens your computer or phone; Paste from clipboard takes a copied image.", target: ".up-drop-acts" },
          { title: "Check before it saves", text: "Each play is found, redrawn on the field and shown for you to check. Check and fix opens it to correct a route; nothing saves until you press Save. A PDF's plays file into a new playbook named after the file." },
        ],
      },
      {
        heading: "Fix a read and keep going",
        steps: [
          { title: "Fix the read", text: "Under Check and fix: change who a board mark is, his route, block or motion and which way it breaks, add a player the read missed or drop one it made up. For a defense, each defender's responsibility and the coverage. A player with no line behind the center is read as the quarterback." },
          { title: "The green check", text: "A play you checked wears a green Checked. Plays saved without a check show Needs a check in the Vault until you save them in the Designer (or press Looks right: mark as checked)." },
          { title: "Leave while it reads", text: "Pages keep being read when you leave; a bar at the bottom shows how far it got and brings you back. Send to my Vault to check later files every play as Needs a check when it's done." },
          { title: "What the reader learned", text: "Every fix teaches the reader how your boards are written, for your next read. Forget one or all here.", target: ".up-memory" },
        ],
      },
    ],
  },
  {
    id: "assignments",
    title: "Assignments",
    path: "/assignments",
    intro: "One player's job on every play in a playbook, printed as a position sheet.",
    when: "Install week: hand every player their own sheet.",
    sections: [
      {
        heading: "Pick who and what",
        steps: [
          { title: "Playbook and player", text: "Pick a playbook (or the whole Vault), then a letter. His routes are spotlighted and everyone else is greyed out.", target: ".asg-pick" },
          { title: "Roster", text: "Who wears each letter: a name and number print on that player's sheet. My team can fill it from your depth chart.", target: ".asg-roster" },
          { title: "Print every player and Print", text: "Print previews this player's sheet; Print every player previews one sheet per offensive player. Print from the bar at the top.", target: ".topbar" },
        ],
      },
    ],
  },
  {
    id: "coverage",
    title: "Coverage report",
    path: "/coverage",
    intro: "Every pass play in your Vault run against Cover 1, 2, 3, 4 and man.",
    when: "Game planning: what's your best call against the coverage you'll see?",
    sections: [
      {
        heading: "Read the report",
        steps: [
          { title: "Plays from", text: "Run the whole Vault or one playbook.", target: ".cvr-book" },
          { title: "Best calls per look", text: "For each format (11-man, 7v7, 5v5) and each coverage, your best three calls. Add to a new playbook files those calls in a book named for the look (change the name if you like).", target: ".cvr-best" },
          { title: "Every play", text: "Each play and the looks it beats. Click a name to open it in the Designer and run its Coverage check.", target: ".cvr-table" },
        ],
      },
    ],
  },
  {
    id: "practice",
    title: "Practice",
    path: "/practice",
    intro: "Build tonight's practice script and print scout cards.",
    when: "Before practice.",
    sections: [
      {
        heading: "Build the script",
        steps: [
          { title: "Script name and start time", text: "Each period gets a clock time from the start time and the minutes before it.", target: ".pr-top" },
          { title: "Periods", text: "Name each period, set its minutes, add a coaching point, then add plays one at a time or a whole playbook. Remove takes the period out.", target: ".pr-period" },
          { title: "Add period", text: "A new 10-minute period at the end.", target: ".pr-add" },
          { title: "Print script and scout cards", text: "Print script previews the timed plan. Print scout cards previews one diagram card per play, two per row, for the scout team. Print from the bar at the top.", target: ".topbar" },
        ],
      },
    ],
  },
  {
    id: "myteam",
    title: "My team and branding",
    path: "/roster",
    intro: "Your roster, depth chart and team branding, without a Front Office.",
    when: "Setting up a season: names, numbers, starters, logo and colors.",
    sections: [
      {
        heading: "Team",
        steps: [
          { title: "Text the team", text: "Counts of the players and phone numbers you can text, the Text the team button, and the last texts you sent. You write one message, pick who it is for, and send it from your own phone in groups of 8. Only contacts marked OK to text are included.", target: "[data-tour='text-team']" },
          { title: "Your teams", text: "One button per team you coach, each with its own roster, depth chart and player documents. New team starts another; Remove this team deletes the open one after asking.", target: ".myteam-teams" },
          { title: "Team details", text: "Team name, level and season. The player count updates as you add players.", target: ".myteam-info" },
          { title: "Assignments and Front Office", text: "Jump to the position sheets, or to a Front Office if you coach more than one team or share with assistants.", target: ".page-head .fo-actions" },
        ],
      },
      {
        heading: "Team branding",
        steps: [
          { title: "Name and logo", text: "The name on the field and prints. Add logo reads a PNG, JPG, WebP, GIF or SVG and pulls its two main colors.", target: ".brand-form" },
          { title: "Colors and presets", text: "Primary and second color, or pick a preset pair.", target: ".brand-presets" },
          { title: "Where it shows", text: "Logo at midfield, end zones in team colors (red zone and flag fields), and on wristbands and PDFs. Back to GridIronVault colors resets it. The preview shows the result.", target: ".brand-preview" },
        ],
      },
      {
        heading: "Roster and depth chart",
        steps: [
          { title: "Tabs", text: "Roster and Depth chart.", target: ".hub-tabs" },
          { title: "Roster", text: "Add player, Import spreadsheet (open an Excel .xlsx or .xls file or a CSV, or paste the rows: Dad and Mom columns, middle name, grad year and uniform sizes come across), Download CSV and Print a contact sheet. Open a player for their picture, uniform sizes, contacts, up to three guardians, medical notes, and documents such as physicals and birth certificates. Tick players and press Remove selected, or the X on a row, to take them off. Only you see it.", target: ".hub-panel .hub-head .fo-actions" },
          { title: "Depth chart", text: "Offense, defense and special teams. Start from a preset (flag 5/7, 11-man), drag or arrow players into order, tap a player's circle to add their picture, and Starters to Assignments sends each lettered spot's starter to the position sheets.", target: ".hub-tabs" },
        ],
      },
    ],
  },
  {
    id: "frontoffice",
    title: "Front Office",
    path: "/front-office",
    intro: "Run a league or program: share master playbooks with your coaches, and run teams.",
    when: "Directors and head coaches with a staff. Joining one is free.",
    sections: [
      {
        heading: "Playbooks & coaches",
        steps: [
          { title: "Sign in first", text: "The Front Office lives on your account, so it opens once you sign in. Joining one a director invited you to is free on every plan.", target: '.empty a[href="/signin"]' },
          { title: "Tabs", text: "Playbooks & coaches, Draw together, Roster, Depth chart, Schedule, Messages and Files.", target: '[aria-label="Front Office sections"]' },
          { title: "Invites waiting for you", text: "Join a Front Office a director invited you to, or decline.", target: '[aria-labelledby="fo-invites"]' },
          { title: "Shared with you", text: "Master playbooks your director shared. Open shows the plays; Clone to my Vault copies them into a new playbook of yours. The master never changes.", target: '[aria-labelledby="fo-shared"]' },
          { title: "Run your own", text: "Name it and start. Then invite coaches by email (they join when they sign in with that address), share playbook snapshots, send the latest version, stop sharing, rename or close it.", target: '[aria-labelledby="fo-mine"]' },
        ],
      },
      {
        heading: "Teams",
        steps: [
          { title: "Team picker", text: "The director adds teams and picks each staff. Coaches see the teams they're on. Team settings renames it or changes the staff.", target: ".hub-teams" },
          { title: "Roster and depth chart", text: "The same roster and depth chart as My team, shared with the team's staff." },
          { title: "Schedule", text: "Games, practices and meetings on a month grid or a list. Weekly repeats, scores and the won-lost record, cancel without deleting, an .ics download for phone calendars, and a game's Call Sheet one click away." },
          { title: "Messages", text: "A coaches' board and announcements to players and families. Families sign up for texts themselves from the team's link; until email and texting are set up, you get mailto and text links and copy buttons." },
          { title: "Files", text: "Folders of documents for a team or the whole Front Office: upload, rename, download and delete. 5 MB a file." },
        ],
      },
    ],
  },
  {
    id: "drawtogether",
    title: "Draw together",
    path: "/front-office?tab=live",
    intro: "Coaches in one Front Office edit the same play at the same time.",
    when: "Install meetings and game-week tweaks with your staff, from anywhere.",
    sections: [
      {
        heading: "Live plays",
        steps: [
          { title: "Sign in first", text: "The Front Office lives on your account, so it opens once you sign in. Joining one a director invited you to is free on every plan.", target: '.empty a[href="/signin"]' },
          { title: "Start a live play", text: "Name it and start a blank play, or open a play in the Designer and pick Extras → Draw this live with my staff.", target: '[aria-labelledby="fo-live"] form' },
          { title: "Open and delete", text: "Open a live play to draw; everyone in it sees changes a moment later and the top bar says who's there. The director or the coach who started it can delete it.", target: '[aria-labelledby="fo-live"]' },
          { title: "Keep a copy", text: "Inside a live play, Extras → Save a copy to my Vault keeps your own copy. It comes with the Staff plan; the director's plan decides and coaches join free." },
        ],
      },
    ],
  },
  {
    id: "starters",
    title: "Starter plays",
    path: "/starters",
    intro: "Fifty-six ready-made plays to copy and make your own.",
    when: "Filling a playbook fast, or learning a concept.",
    sections: [
      {
        heading: "Browse and copy",
        steps: [
          { title: "Search and filter", text: "Search names and concepts; filter by type.", target: ".search-box" },
          { title: "Preview", text: "Click a play for Why it works, Best against (from the Coverage check) and Who does what.", target: ".play-grid .play-thumb" },
          { title: "Copy or open", text: "Copy to your Vault makes an editable copy; Open in the designer copies it and opens it; the folder copies it into a playbook you have or a new one you name. The starter itself never changes.", target: ".play-grid .play-actions" },
          { title: "Batch", text: "Pick several, then Copy them all, Copy to new playbook (name it and they land in it), or Export them together.", target: ".bulk-bar" },
        ],
      },
    ],
  },
  {
    id: "language",
    title: "Playbook language",
    path: "/language",
    intro: "Teach GridIronVault (and Griddy) your own names for formations, routes and calls.",
    when: "Your system says “Blaze” for Trips Right? Teach it once.",
    sections: [
      {
        heading: "Your terms",
        steps: [
          { title: "Suggestions", text: "Words you use often in your Vault. Teach it or Ignore.", target: ".lang-suggest" },
          { title: "Teach a term", text: "The term, what it means, and its type (formation, route, call).", target: ".topbar .btn-primary" },
          { title: "See what it means", text: "The picture beside each term. Hover for a quick look; click or tap for the full diagram, and pick a play from your Vault to show it your way.", target: ".lang-thumb" },
          { title: "The list", text: "Filter by type. Edit renames any term, starter ones too (Griddy reads your word); Delete has Undo.", target: ".lang-table" },
        ],
      },
    ],
  },
  {
    id: "account",
    title: "Your account",
    path: "/account",
    intro: "Your profile, plan, what you've used, and your data.",
    when: "Changing plans, backing up, or signing out.",
    sections: [
      {
        heading: "Account",
        steps: [
          { title: "Coach profile", text: "Your name and sign-in. Sign out, or Delete account (permanent: plays, playbooks and Call Sheets on the account go with it).", target: tour("acct-profile") },
          { title: "Your plan", text: "What your plan includes. Compare plans, switch plans, manage billing in Stripe, or pause instead of cancelling (1, 2, 3 or 6 months).", target: tour("acct-plan") },
          { title: "What you have used", text: "Plays, playbooks, Call Sheets and Griddy messages against your plan's limits.", target: tour("acct-usage") },
          { title: "Your data", text: "Download a backup (every play, book and sheet in one file), Forget autocomplete, or Clear this browser's workspace.", target: tour("acct-data") },
        ],
      },
    ],
  },
  {
    id: "tools",
    title: "More tools",
    path: "/tools",
    intro: "The formation and defense libraries, the route tree and the other Designer tools, one click each.",
    when: "Looking for a tool you saw once.",
    sections: [
      {
        heading: "Tools",
        steps: [
          { title: "Griddy", text: "Ask Griddy opens him with your request.", target: ".tools-grid .tools-card" },
          { title: "Every tool", text: "Each card says what the tool does and opens it.", target: ".tools-grid" },
        ],
      },
    ],
  },
];

/** The shared steps go last on every Shell screen's guide, so the tour ends on the menu and Griddy. */
export function stepsOf(g: Guide, shell = true): GuideSection[] {
  return shell && g.path !== "/build" ? [...g.sections, SHELL] : g.sections;
}

export const guideById = (id: string) => GUIDES.find((g) => g.id === id) ?? null;

/** The guide for a screen. Front Office's Draw together tab has its own. */
export function guideFor(pathname: string, search = ""): Guide | null {
  const tab = new URLSearchParams(search).get("tab");
  if (pathname === "/front-office" && tab === "live") return guideById("drawtogether");
  if (pathname.startsWith("/build")) return guideById("designer");
  if (pathname.startsWith("/grid")) return guideById("callsheet");
  return GUIDES.find((g) => g.path.split("?")[0] === pathname && g.id !== "griddy" && g.id !== "coverage-check") ?? null;
}

/** Where a guide's tour starts: its screen with `tour=<id>` added. */
/**
 * Screens with a recorded how-to clip in public/clips/ (<id>.webm and an <id>.jpg poster).
 * The clips are the tours themselves, recorded from the built app; re-record after a big layout change.
 */
const CLIPS = new Set(["designer", "coverage-check", "griddy", "vault", "playbooks", "callsheet", "wristbands"]);

export function clipOf(g: Guide) {
  return CLIPS.has(g.id) ? { src: `/clips/${g.id}.webm`, poster: `/clips/${g.id}.jpg` } : null;
}

export function tourHref(g: Guide) {
  return `${g.path}${g.path.includes("?") ? "&" : "?"}tour=${g.id}`;
}

/** Every step as one searchable row, for the Tutorials page's button finder. */
export function allSteps() {
  return GUIDES.flatMap((g) => g.sections.flatMap((s) => s.steps.map((step) => ({ guide: g, section: s.heading, step }))));
}
