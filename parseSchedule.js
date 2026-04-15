const fs = require("node:fs/promises");
const cheerio = require("cheerio");

const SOURCE_URL =
  "https://moodle.hwr-berlin.de/fb2-stundenplan/fb2-stundenplaene/wi/semester4/kursb.html";

function cleanText(value) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/([a-zäöüß])([A-ZÄÖÜ])/g, "$1 $2")
    .replace(/([A-Za-z])CL:/g, "$1 CL:")
    .replace(/(Uhr)([A-Za-z0-9])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEventBlocks(text) {
  const normalized = cleanText(text);
  const blockRegex =
    /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*Uhr\s*([^]*?)(?=\s+\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*Uhr|$)/g;
  const events = [];
  let match;

  while ((match = blockRegex.exec(normalized)) !== null) {
    const start = match[1];
    const end = match[2];
    const details = match[3].trim();

    const roomMatch = details.match(/CL:\s*([^]+?)(?=inkl\.|$)/i);
    const room = roomMatch ? cleanText(roomMatch[1]) : null;

    const pauseMatch = details.match(/inkl\.\s*([^]+?)\s*Pause/i);
    const pause = pauseMatch ? cleanText(pauseMatch[1]) : null;

    const titleOnly = details
      .replace(/CL:\s*[^]+?(\sinkl\.|$)/i, " ")
      .replace(/inkl\.\s*[^]+?\s*Pause/i, " ")
      .trim();

    const moduleSplit = titleOnly.match(/^(.+?)\s-\s(.+)$/);
    const module = moduleSplit ? cleanText(moduleSplit[1]) : null;
    const title = cleanText(moduleSplit ? moduleSplit[2] : titleOnly);

    events.push({
      start,
      end,
      module,
      title,
      room,
      pause,
    });
  }

  return events;
}

function tableToGrid($, table) {
  const grid = [];
  const spanMap = [];

  $(table)
    .find("tr")
    .each((rowIndex, row) => {
      if (!grid[rowIndex]) grid[rowIndex] = [];
      if (!spanMap[rowIndex]) spanMap[rowIndex] = [];

      let colIndex = 0;
      $(row)
        .children("th, td")
        .each((_, cell) => {
          while (spanMap[rowIndex][colIndex]) colIndex += 1;

          const text = cleanText($(cell).text());
          const rowspan = Number($(cell).attr("rowspan") || 1);
          const colspan = Number($(cell).attr("colspan") || 1);

          for (let r = 0; r < rowspan; r += 1) {
            const targetRow = rowIndex + r;
            if (!grid[targetRow]) grid[targetRow] = [];
            if (!spanMap[targetRow]) spanMap[targetRow] = [];

            for (let c = 0; c < colspan; c += 1) {
              const targetCol = colIndex + c;
              grid[targetRow][targetCol] = text;
              if (r > 0) {
                spanMap[targetRow][targetCol] = true;
              }
            }
          }

          colIndex += colspan;
        });
    });

  return grid;
}

function parseSchedule(html) {
  const $ = cheerio.load(html);
  const weekHeaders = $("body *")
    .filter((_, el) => /\d+\.\s*Studienwoche:\s*/i.test($(el).text()))
    .toArray();

  const weeks = [];

  for (const headerEl of weekHeaders) {
    const headerText = cleanText($(headerEl).text());
    const weekMatch = headerText.match(/^(\d+)\.\s*Studienwoche:\s*(.+)$/i);
    if (!weekMatch) continue;

    const weekNumber = Number(weekMatch[1]);
    const dateRange = weekMatch[2];
    const table = $(headerEl).nextAll("table").first();
    if (!table.length) continue;

    const grid = tableToGrid($, table);
    if (!grid.length) continue;

    const dayColumns = [];
    const headerRow = grid[0];
    headerRow.forEach((cellText, idx) => {
      const dayMatch = cellText.match(/^(Mo|Di|Mi|Do|Fr|Sa),\s*(.+)$/i);
      if (dayMatch) {
        dayColumns.push({
          idx,
          day: dayMatch[1],
          date: dayMatch[2],
        });
      }
    });

    const dayMap = {};
    for (const d of dayColumns) {
      dayMap[d.day] = { date: d.date, events: [] };
    }

    for (let rowIndex = 1; rowIndex < grid.length; rowIndex += 1) {
      const row = grid[rowIndex];
      for (const dayInfo of dayColumns) {
        const text = cleanText(row[dayInfo.idx] || "");
        if (!/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*Uhr/.test(text)) continue;

        const events = parseEventBlocks(text);
        for (const event of events) {
          const exists = dayMap[dayInfo.day].events.some(
            (e) =>
              e.start === event.start &&
              e.end === event.end &&
              e.title === event.title
          );
          if (!exists) {
            dayMap[dayInfo.day].events.push(event);
          }
        }
      }
    }

    weeks.push({
      weekNumber,
      dateRange,
      days: dayMap,
    });
  }

  return weeks;
}

async function fetchScheduleData(outputFile) {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Download fehlgeschlagen: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const weeks = parseSchedule(html);
  const entryCount = weeks.reduce((sum, week) => {
    return (
      sum +
      Object.values(week.days).reduce((daySum, day) => daySum + day.events.length, 0)
    );
  }, 0);

  const result = {
    source: SOURCE_URL,
    parsedAt: new Date().toISOString(),
    weekCount: weeks.length,
    entryCount,
    weeks,
  };

  if (outputFile) {
    await fs.writeFile(outputFile, JSON.stringify(result, null, 2), "utf8");
  }

  return result;
}

async function main() {
  const outputFile = process.argv[2];
  const result = await fetchScheduleData(outputFile);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fehler beim Parsen:", error.message);
    process.exit(1);
  });
}

module.exports = {
  fetchScheduleData,
};
