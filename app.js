const plays = [
  [1, "Route Tree 0–5", "Route Tree"],
  [2, "Route Tree 6–9", "Route Tree"],
  [3, "Single Back", "Single Back"],
  [4, "Single Back Play 1", "Single Back"],
  [5, "Single Back Play 2", "Single Back"],
  [6, "Single Back Play 3", "Single Back"],
  [7, "Spread", "Spread"],
  [8, "Spread Play 1", "Spread"],
  [9, "Spread Play 2", "Spread"],
  [10, "Spread Play 3", "Spread"],
  [11, "Bunch", "Bunch"],
  [12, "Bunch Play 1", "Bunch"],
  [13, "Bunch Play 2", "Bunch"],
  [14, "Bunch Play 3", "Bunch"],
  [15, "Trips", "Trips"],
  [16, "Trips Play 1", "Trips"],
  [17, "Trips Play 2", "Trips"],
  [18, "Trips Play 3", "Trips"],
  [19, "Trips Stack", "Trips Stack"],
  [20, "Trips Stack Play 1", "Trips Stack"],
  [21, "Trips Stack Play 2", "Trips Stack"],
  [22, "Trips Stack Play 3", "Trips Stack"],
  [23, "Twins", "Twins"],
  [24, "Twins Play 1", "Twins"],
  [25, "Twins Play 2", "Twins"],
  [26, "Twins Play 3", "Twins"],
  [27, "Twins Stack", "Twins Stack"],
  [28, "Twins Stack Play 1", "Twins Stack"],
  [29, "Twins Stack Play 2", "Twins Stack"],
  [30, "Twins Stack Play 3", "Twins Stack"],
  [31, "I Formation", "I Formation"],
  [32, "I Formation Play 1", "I Formation"],
  [33, "I Formation Play 2", "I Formation"],
  [34, "I Formation Play 3", "I Formation"],
  [35, "Double Back Set", "Double Back"],
  [36, "Double Back Play 1", "Double Back"],
  [37, "Double Back Play 2", "Double Back"],
  [38, "Double Back Play 3", "Double Back"],
  [39, "Single Set", "Single Set"],
  [40, "Single Set Play 1", "Single Set"],
  [41, "Single Set Play 2", "Single Set"],
  [42, "Single Set Play 3", "Single Set"],
  [43, "HB Dive", "Run Plays"],
  [44, "Crossbuck", "Run Plays"],
  [45, "End Around", "Run Plays"],
  [46, "Reverse", "Run Plays"],
  [47, "Double Reverse", "Run Plays"],
  [48, "Fake Double Reverse", "Run Plays"],
  [49, "Fake Triple Reverse", "Run Plays"],
  [50, "HB Option", "Run Plays"],
  [51, "QB Option", "Run Plays"],
  [52, "NFL FLAG Man", "Defense"],
  [53, "NFL FLAG Cover 1", "Defense"],
  [54, "NFL FLAG Cover 2", "Defense"],
  [55, "NFL FLAG Cover 3", "Defense"],
  [56, "NFL FLAG Cover 4", "Defense"],
].map(([number, name, formation]) => ({
  number,
  name,
  formation,
  image: `./cards/play-${String(number).padStart(2, "0")}.png`,
}));

const state = { query: "", formation: "All", visible: plays, selectedIndex: 0 };
const grid = document.querySelector("#play-grid");
const filters = document.querySelector("#filters");
const search = document.querySelector("#search");
const count = document.querySelector("#result-count");
const heading = document.querySelector("#library-title");
const clearButton = document.querySelector("#clear-filter");
const emptyState = document.querySelector("#empty-state");
const dialog = document.querySelector("#preview-dialog");
const previewImage = document.querySelector("#preview-image");
const previewTitle = document.querySelector("#preview-title");
const previewMeta = document.querySelector("#preview-meta");
const pixelCheck = document.querySelector("#pixel-check");
const previous = document.querySelector("#previous-play");
const next = document.querySelector("#next-play");

const formations = ["All", ...new Set(plays.map((play) => play.formation))];

function renderFilters() {
  filters.replaceChildren(...formations.map((formation) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-button${state.formation === formation ? " active" : ""}`;
    button.textContent = formation;
    button.setAttribute("aria-pressed", state.formation === formation);
    button.addEventListener("click", () => {
      state.formation = formation;
      render();
    });
    return button;
  }));
}

function openPreview(play) {
  state.selectedIndex = state.visible.findIndex((item) => item.number === play.number);
  updatePreview();
  dialog.showModal();
}

function makeCard(play) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "play-card";
  button.setAttribute("aria-label", `Open ${play.name}`);
  button.innerHTML = `
    <div class="thumb"><img src="${play.image}" alt="${play.name} route diagram" loading="lazy" width="900" height="404"></div>
    <div class="card-info"><span><strong>${play.name}</strong><small>${play.formation}</small></span><b class="card-number">${String(play.number).padStart(2, "0")}</b></div>`;
  button.addEventListener("click", () => openPreview(play));
  return button;
}

function render() {
  const normalized = state.query.trim().toLowerCase();
  state.visible = plays.filter((play) => {
    const inFormation = state.formation === "All" || play.formation === state.formation;
    const inSearch = !normalized || `${play.name} ${play.formation}`.toLowerCase().includes(normalized);
    return inFormation && inSearch;
  });
  count.textContent = state.visible.length;
  heading.textContent = state.formation === "All" ? (normalized ? "Search results" : "All formations") : state.formation;
  clearButton.hidden = state.formation === "All" && !normalized;
  emptyState.hidden = state.visible.length > 0;
  grid.hidden = state.visible.length === 0;
  grid.replaceChildren(...state.visible.map(makeCard));
  renderFilters();
}

function updatePreview() {
  const play = state.visible[state.selectedIndex];
  if (!play) return;
  previewImage.src = play.image;
  previewImage.alt = `${play.name} route diagram`;
  previewTitle.textContent = play.name;
  previewMeta.textContent = `${play.formation} · CARD ${String(play.number).padStart(2, "0")} OF 56`;
  previous.disabled = state.selectedIndex === 0;
  next.disabled = state.selectedIndex === state.visible.length - 1;
  previewImage.onload = () => {
    const ratio = previewImage.naturalWidth / previewImage.naturalHeight;
    const expected = 4.5 / 2.02;
    pixelCheck.textContent = `${previewImage.naturalWidth} × ${previewImage.naturalHeight} px · ${Math.abs(ratio - expected) < 0.002 ? "ratio verified" : "check ratio"}`;
  };
}

search.addEventListener("input", (event) => { state.query = event.target.value; render(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== search && !dialog.open) {
    event.preventDefault(); search.focus();
  }
  if (dialog.open && event.key === "ArrowLeft" && state.selectedIndex > 0) { state.selectedIndex -= 1; updatePreview(); }
  if (dialog.open && event.key === "ArrowRight" && state.selectedIndex < state.visible.length - 1) { state.selectedIndex += 1; updatePreview(); }
});
clearButton.addEventListener("click", () => { state.query = ""; state.formation = "All"; search.value = ""; render(); });
document.querySelector("#close-preview").addEventListener("click", () => dialog.close());
document.querySelector("#print-button").addEventListener("click", () => window.print());
previous.addEventListener("click", () => { if (state.selectedIndex > 0) { state.selectedIndex -= 1; updatePreview(); } });
next.addEventListener("click", () => { if (state.selectedIndex < state.visible.length - 1) { state.selectedIndex += 1; updatePreview(); } });
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

render();
