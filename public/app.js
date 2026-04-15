const weekSelect = document.getElementById("weekSelect");
const daysGrid = document.getElementById("daysGrid");
const meta = document.getElementById("meta");
const clearWpfBtn = document.getElementById("clearWpfBtn");

const dayTemplate = document.getElementById("dayTemplate");
const eventTemplate = document.getElementById("eventTemplate");

const dayOrder = ["Mo", "Di", "Mi", "Do", "Fr"];
let selectedWpf = "";

function isWpfModule(moduleName) {
  return typeof moduleName === "string" && moduleName.includes("WPF");
}

function eventMatchesFilter(event) {
  if (!selectedWpf) return true;
  if (!isWpfModule(event.module)) return true;
  return event.module === selectedWpf;
}

function renderWeek(week) {
  daysGrid.innerHTML = "";

  for (const dayKey of dayOrder) {
    const dayData = week.days[dayKey];
    if (!dayData) continue;

    const dayNode = dayTemplate.content.cloneNode(true);
    dayNode.querySelector(".day-title").textContent = dayKey;
    dayNode.querySelector(".day-date").textContent = dayData.date;
    const eventsEl = dayNode.querySelector(".events");

    const filteredEvents = dayData.events.filter(eventMatchesFilter);

    if (!filteredEvents.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Keine Termine";
      eventsEl.appendChild(empty);
    } else {
      for (const event of filteredEvents) {
        const eventNode = eventTemplate.content.cloneNode(true);
        const eventEl = eventNode.querySelector(".event");
        eventNode.querySelector(".time").textContent = `${event.start} - ${event.end}`;
        const moduleEl = eventNode.querySelector(".module");
        moduleEl.textContent = event.module || "Allgemein";
        eventNode.querySelector(".title").textContent = event.title || "";
        eventNode.querySelector(".room").textContent = event.room
          ? `Raum: ${event.room}`
          : "Raum: -";

        if (isWpfModule(event.module)) {
          eventEl.classList.add("wpf-clickable");
          if (selectedWpf && event.module === selectedWpf) {
            eventEl.classList.add("wpf-selected");
          }
          moduleEl.title = "Klicken um dieses WPF auszuwählen";
          eventEl.addEventListener("click", () => {
            selectedWpf = event.module;
            const changeEvent = new Event("change");
            weekSelect.dispatchEvent(changeEvent);
          });
        }

        eventsEl.appendChild(eventNode);
      }
    }

    daysGrid.appendChild(dayNode);
  }
}

async function init() {
  const response = await fetch("/api/schedule");
  if (!response.ok) {
    throw new Error(`API Fehler: ${response.status}`);
  }

  const data = await response.json();
  meta.textContent = `Wochen: ${data.weekCount} | Termine: ${data.entryCount} | Stand: ${new Date(
    data.parsedAt
  ).toLocaleString("de-DE")}`;

  for (const week of data.weeks) {
    const option = document.createElement("option");
    option.value = String(week.weekNumber);
    option.textContent = `Woche ${week.weekNumber} (${week.dateRange})`;
    weekSelect.appendChild(option);
  }

  const byNumber = new Map(data.weeks.map((w) => [String(w.weekNumber), w]));
  const renderCurrentWeek = () => {
    const week = byNumber.get(weekSelect.value) || data.weeks[0];
    if (week) renderWeek(week);
    clearWpfBtn.classList.toggle("visible", Boolean(selectedWpf));
  };

  renderCurrentWeek();

  weekSelect.addEventListener("change", () => {
    renderCurrentWeek();
  });

  clearWpfBtn.addEventListener("click", () => {
    selectedWpf = "";
    renderCurrentWeek();
  });
}

init().catch((error) => {
  meta.textContent = `Fehler: ${error.message}`;
});
