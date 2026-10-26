const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyRisk, validateTelemetry } = require("../src/telemetry");

const thresholds = { watch: 5, risk: 8, critical: 10 };

test("classifies readings using the configured demo thresholds", () => {
  assert.equal(classifyRisk(4.9, thresholds), "normal");
  assert.equal(classifyRisk(5, thresholds), "warning");
  assert.equal(classifyRisk(8, thresholds), "risk");
  assert.equal(classifyRisk(10, thresholds), "critical");
});

test("accepts a valid sensor payload", () => {
  const payload = {
    stationId: "station-01",
    waterLevelCm: 8.2,
    distanceCm: 6.8,
    gasAdc: 420,
    gasDigital: "HIGH",
    waterDetected: true,
    gasAnomaly: false,
    distanceValid: true
  };
  assert.deepEqual(validateTelemetry(payload, "station-01"), payload);
});

test("rejects invalid and mismatched telemetry", () => {
  const payload = {
    stationId: "station-01",
    waterLevelCm: 8,
    distanceCm: 7,
    gasAdc: 420,
    gasDigital: "HIGH",
    waterDetected: true,
    gasAnomaly: false,
    distanceValid: true
  };
  assert.throws(() => validateTelemetry({ ...payload, gasAdc: 1024 }, "station-01"), /gasAdc/);
  assert.throws(() => validateTelemetry(payload, "other-station"), /stationId/);
  assert.throws(() => validateTelemetry({ ...payload, distanceValid: false }, "station-01"), /distanceValid/);
});
