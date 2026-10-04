const search = document.querySelector("[data-command-search]");
const cards = [...document.querySelectorAll("[data-command-card]")];
const filters = [...document.querySelectorAll("[data-command-filter]")];
const empty = document.querySelector("[data-command-empty]");
let activeFilter = "all";

function normalize(value) {
  return String(value || "").toLocaleLowerCase("tr-TR").normalize("NFKD");
}

function updateResults() {
  const query = normalize(search?.value).trim();
  let visible = 0;
  for (const card of cards) {
    const categoryMatch = activeFilter === "all" || card.dataset.category === activeFilter;
    const queryMatch = !query || normalize(`${card.dataset.search || ""} ${card.textContent}`).includes(query);
    card.hidden = !(categoryMatch && queryMatch);
    if (!card.hidden) visible += 1;
  }
  if (empty) empty.hidden = visible !== 0;
}

search?.addEventListener("input", updateResults);
for (const filter of filters) {
  filter.addEventListener("click", () => {
    activeFilter = filter.dataset.commandFilter || "all";
    for (const candidate of filters) candidate.setAttribute("aria-pressed", String(candidate === filter));
    updateResults();
  });
}

updateResults();
