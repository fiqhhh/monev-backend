const express = require("express");
const fs = require("fs");
const { TOKENS_FILE, MONEV_FILE } = require("../config/config");
const { all } = require("../bot/subscriptions");

function mask(s) {
  if (!s) return null;
  return s.slice(0, 6) + "..." + s.slice(-6);
}

const app = express();

app.get("/debug", (req, res) => {
  const tokens = fs.existsSync(TOKENS_FILE) ? JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8")) : null;
  const monev = fs.existsSync(MONEV_FILE) ? JSON.parse(fs.readFileSync(MONEV_FILE, "utf8")) : null;
  res.json({
    tokens: tokens ? { access_token: mask(tokens.access_token), refresh_token: mask(tokens.refresh_token), obtained_at: tokens.obtained_at } : null,
    monev: monev ? { accessToken: mask(monev.accessToken) } : null,
    subscribers: all()
  });
});

const port = process.env.DEBUG_PORT || 3001;
app.listen(port, () => console.log(`Debug server listening on http://localhost:${port}/debug`));
