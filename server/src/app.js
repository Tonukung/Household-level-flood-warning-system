const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const frontendRoot = path.resolve(__dirname, "../../code");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(data));
}

function createApp({ store, config, isMqttConnected }) {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");

    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    if (url.pathname === "/api/config") {
      sendJson(response, 200, {
        stationId: config.stationId,
        thresholds: config.thresholds,
        onlineTimeoutMs: config.onlineTimeoutMs
      });
      return;
    }

    if (url.pathname === "/api/status") {
      const latest = store.latest();
      const lastReceivedAt = latest?.receivedAt ?? null;
      sendJson(response, 200, {
        mqttConnected: isMqttConnected(),
        deviceOnline: lastReceivedAt !== null &&
          Date.now() - lastReceivedAt <= config.onlineTimeoutMs,
        lastReceivedAt
      });
      return;
    }

    if (url.pathname === "/api/latest") {
      sendJson(response, 200, {
        reading: store.latest(),
        previousValidReading: store.previousValidReading()
      });
      return;
    }

    if (url.pathname === "/api/history") {
      const hours = Number(url.searchParams.get("hours") || 1);
      if (![1, 6, 24].includes(hours)) {
        sendJson(response, 400, { error: "hours must be 1, 6, or 24" });
        return;
      }
      sendJson(response, 200, {
        readings: store.history(Date.now() - hours * 60 * 60 * 1000)
      });
      return;
    }

    if (url.pathname === "/api/alerts") {
      const requestedLimit = Number(url.searchParams.get("limit") || 20);
      if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 50) {
        sendJson(response, 400, { error: "limit must be an integer from 1 to 50" });
        return;
      }
      sendJson(response, 200, { alerts: store.alerts(requestedLimit) });
      return;
    }

    let relativePath;
    try {
      relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    } catch {
      sendJson(response, 400, { error: "Invalid URL path" });
      return;
    }
    const filePath = path.resolve(frontendRoot, relativePath);
    if (filePath !== frontendRoot && !filePath.startsWith(frontendRoot + path.sep)) {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        sendJson(response, error.code === "ENOENT" ? 404 : 500, { error: "File could not be read" });
        return;
      }
      response.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
        "Cache-Control": "no-cache"
      });
      response.end(content);
    });
  });
}

module.exports = createApp;
