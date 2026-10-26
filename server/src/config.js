const config = {
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3000),
  mqttUrl: process.env.MQTT_URL || "mqtt://mqtt-dashboard.com:8884",
  mqttTopic: process.env.MQTT_TOPIC || "floodwatch/demo/station-01/telemetry",
  stationId: process.env.STATION_ID || "station-01",
  databasePath: process.env.DATABASE_PATH || "data/floodwatch.sqlite",
  onlineTimeoutMs: Number(process.env.ONLINE_TIMEOUT_MS || 30_000),
  thresholds: {
    watch: Number(process.env.WATCH_LEVEL_CM || 5),
    risk: Number(process.env.RISK_LEVEL_CM || 8),
    critical: Number(process.env.CRITICAL_LEVEL_CM || 10)
  }
};

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

if (
  !Number.isFinite(config.thresholds.watch) ||
  !Number.isFinite(config.thresholds.risk) ||
  !Number.isFinite(config.thresholds.critical) ||
  config.thresholds.watch < 0 ||
  config.thresholds.watch >= config.thresholds.risk ||
  config.thresholds.risk >= config.thresholds.critical
) {
  throw new Error("Water thresholds must satisfy 0 <= WATCH_LEVEL_CM < RISK_LEVEL_CM < CRITICAL_LEVEL_CM");
}

module.exports = config;
