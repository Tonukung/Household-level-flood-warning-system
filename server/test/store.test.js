const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Store = require("../src/store");

const thresholds = { watch: 5, risk: 8, critical: 10 };

function reading(waterLevelCm, receivedAt, gasAnomaly = false) {
  const distanceValid = waterLevelCm !== null;
  return {
    stationId: "station-01",
    waterLevelCm,
    distanceCm: distanceValid ? 15 - waterLevelCm : null,
    gasAdc: 420,
    gasDigital: "HIGH",
    waterDetected: distanceValid && waterLevelCm >= 2,
    gasAnomaly,
    distanceValid
  };
}

test("persists readings, transitions, and chart-sized history", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "floodwatch-test-"));
  const store = new Store(path.join(directory, "history.sqlite"), thresholds);
  t.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  [4, 5, 6, 8, 9, 10].forEach((level, index) => {
    store.recordTelemetry(reading(level, 1_000 + index * 1_000), 1_000 + index * 1_000);
  });

  assert.equal(store.latest().waterLevelCm, 10);
  assert.equal(store.previousValidReading().waterLevelCm, 9);
  assert.equal(store.history(0, 3).length, 3);
  assert.deepEqual(
    store.alerts(10).map(alert => alert.severity).reverse(),
    ["warning", "risk", "critical"]
  );
});

test("keeps invalid ultrasonic readings distinct from a zero level", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "floodwatch-test-"));
  const store = new Store(path.join(directory, "history.sqlite"), thresholds);
  t.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  store.recordTelemetry(reading(null, 1_000), 1_000);
  assert.equal(store.latest().waterLevelCm, null);
  assert.equal(store.latest().distanceValid, false);
});
