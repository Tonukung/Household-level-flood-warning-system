const mqtt = require("mqtt");
const config = require("./config");
const createApp = require("./app");
const Store = require("./store");
const { validateTelemetry } = require("./telemetry");

const store = new Store(config.databasePath, config.thresholds);
const mqttClient = mqtt.connect(config.mqttUrl, {
  reconnectPeriod: 5_000,
  connectTimeout: 10_000,
  clean: true
});

mqttClient.on("connect", () => {
  console.info(`Connected to MQTT broker; subscribing to ${config.mqttTopic}`);
  mqttClient.subscribe(config.mqttTopic, { qos: 0 }, error => {
    if (error) console.error("MQTT subscription failed:", error.message);
  });
});

mqttClient.on("message", (topic, payload) => {
  if (topic !== config.mqttTopic) return;
  try {
    const parsed = JSON.parse(payload.toString("utf8"));
    const reading = validateTelemetry(parsed, config.stationId);
    store.recordTelemetry(reading);
  } catch (error) {
    console.error("Rejected MQTT telemetry:", error.message);
  }
});

mqttClient.on("error", error => {
  console.error("MQTT connection error:", error.message);
});

const server = createApp({
  store,
  config,
  isMqttConnected: () => mqttClient.connected
});

server.listen(config.port, config.host, () => {
  console.info(`FloodWatch backend listening at http://${config.host}:${config.port}`);
});

function shutdown() {
  server.close();
  mqttClient.end(false, {}, () => {
    store.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
