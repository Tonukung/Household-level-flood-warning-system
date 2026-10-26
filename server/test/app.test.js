const test = require("node:test");
const assert = require("node:assert/strict");
const createApp = require("../src/app");

test("serves API data and rejects invalid history ranges", async t => {
  const sample = {
    stationId: "station-01",
    receivedAt: Date.now(),
    waterLevelCm: 6,
    distanceCm: 9,
    gasAdc: 420,
    gasDigital: "HIGH",
    waterDetected: true,
    gasAnomaly: false,
    distanceValid: true
  };
  const store = {
    latest: () => sample,
    previousValidReading: () => ({ ...sample, receivedAt: sample.receivedAt - 1_000 }),
    history: () => [sample],
    alerts: () => []
  };
  const config = {
    stationId: "station-01",
    thresholds: { watch: 5, risk: 8, critical: 10 },
    onlineTimeoutMs: 30_000
  };
  const server = createApp({ store, config, isMqttConnected: () => true });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const [configResponse, latestResponse, historyResponse, invalidResponse, pageResponse] =
    await Promise.all([
      fetch(`${baseUrl}/api/config`),
      fetch(`${baseUrl}/api/latest`),
      fetch(`${baseUrl}/api/history?hours=6`),
      fetch(`${baseUrl}/api/history?hours=2`),
      fetch(baseUrl)
    ]);

  assert.equal(configResponse.status, 200);
  assert.equal((await configResponse.json()).thresholds.critical, 10);
  assert.equal((await latestResponse.json()).reading.waterLevelCm, 6);
  assert.equal((await historyResponse.json()).readings.length, 1);
  assert.equal(invalidResponse.status, 400);
  assert.equal(pageResponse.status, 200);
  assert.match(pageResponse.headers.get("content-type"), /text\/html/);
});
