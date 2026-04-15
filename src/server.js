const path = require("node:path");
const express = require("express");
const { fetchScheduleData } = require("./parseSchedule");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/schedule", async (_req, res) => {
  try {
    const data = await fetchScheduleData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: `Konnte Stundenplan nicht laden: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Stundenplan UI läuft auf http://localhost:${PORT}`);
});
