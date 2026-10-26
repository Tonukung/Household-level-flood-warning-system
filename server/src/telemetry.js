function classifyRisk(level, thresholds) {
  if (level < thresholds.watch) return "normal";
  if (level < thresholds.risk) return "warning";
  if (level < thresholds.critical) return "risk";
  return "critical";
}

function validateTelemetry(value, expectedStationId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Payload must be a JSON object");
  }

  if (value.stationId !== expectedStationId) {
    throw new Error("Payload stationId does not match the configured station");
  }

  const levelValid = value.waterLevelCm === null ||
    (typeof value.waterLevelCm === "number" &&
      Number.isFinite(value.waterLevelCm) &&
      value.waterLevelCm >= 0);
  const distanceValid = value.distanceCm === null ||
    (typeof value.distanceCm === "number" &&
      Number.isFinite(value.distanceCm) &&
      value.distanceCm >= 0);

  if (!levelValid || !distanceValid) {
    throw new Error("Water level and distance must be non-negative numbers or null");
  }
  if (!Number.isInteger(value.gasAdc) || value.gasAdc < 0 || value.gasAdc > 1023) {
    throw new Error("gasAdc must be an integer between 0 and 1023");
  }
  if (value.gasDigital !== "LOW" && value.gasDigital !== "HIGH") {
    throw new Error('gasDigital must be "LOW" or "HIGH"');
  }
  if (typeof value.waterDetected !== "boolean" || typeof value.gasAnomaly !== "boolean") {
    throw new Error("waterDetected and gasAnomaly must be booleans");
  }
  if (typeof value.distanceValid !== "boolean") {
    throw new Error("distanceValid must be a boolean");
  }
  if (value.distanceValid !== (value.waterLevelCm !== null && value.distanceCm !== null)) {
    throw new Error("distanceValid must match whether waterLevelCm and distanceCm are present");
  }

  return {
    stationId: value.stationId,
    waterLevelCm: value.waterLevelCm,
    distanceCm: value.distanceCm,
    gasAdc: value.gasAdc,
    gasDigital: value.gasDigital,
    waterDetected: value.waterDetected,
    gasAnomaly: value.gasAnomaly,
    distanceValid: value.distanceValid
  };
}

module.exports = { classifyRisk, validateTelemetry };
