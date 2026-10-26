const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { classifyRisk } = require("./telemetry");

class Store {
  constructor(databasePath, thresholds) {
    const resolvedPath = path.resolve(__dirname, "..", databasePath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    this.database = new Database(resolvedPath);
    this.database.pragma("journal_mode = WAL");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_id TEXT NOT NULL,
        received_at INTEGER NOT NULL,
        water_level_cm REAL,
        distance_cm REAL,
        gas_adc INTEGER NOT NULL,
        gas_digital TEXT NOT NULL,
        water_detected INTEGER NOT NULL,
        gas_anomaly INTEGER NOT NULL,
        distance_valid INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS telemetry_received_at_idx ON telemetry(received_at);
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS alerts_created_at_idx ON alerts(created_at);
    `);
    this.thresholds = thresholds;
    this.latestStatement = this.database.prepare(`
      SELECT station_id AS stationId, received_at AS receivedAt,
        water_level_cm AS waterLevelCm, distance_cm AS distanceCm,
        gas_adc AS gasAdc, gas_digital AS gasDigital,
        water_detected AS waterDetected, gas_anomaly AS gasAnomaly,
        distance_valid AS distanceValid
      FROM telemetry ORDER BY received_at DESC, id DESC LIMIT 1
    `);
    this.previousStatement = this.database.prepare(`
      SELECT water_level_cm AS waterLevelCm, gas_anomaly AS gasAnomaly
      FROM telemetry ORDER BY received_at DESC, id DESC LIMIT 1
    `);
    this.previousValidStatement = this.database.prepare(`
      SELECT station_id AS stationId, received_at AS receivedAt,
        water_level_cm AS waterLevelCm
      FROM telemetry WHERE water_level_cm IS NOT NULL
      ORDER BY received_at DESC, id DESC LIMIT 1 OFFSET 1
    `);
    this.insertTelemetry = this.database.prepare(`
      INSERT INTO telemetry (
        station_id, received_at, water_level_cm, distance_cm, gas_adc,
        gas_digital, water_detected, gas_anomaly, distance_valid
      ) VALUES (
        @stationId, @receivedAt, @waterLevelCm, @distanceCm, @gasAdc,
        @gasDigital, @waterDetected, @gasAnomaly, @distanceValid
      )
    `);
    this.insertAlert = this.database.prepare(`
      INSERT INTO alerts (station_id, created_at, severity, title, description)
      VALUES (?, ?, ?, ?, ?)
    `);
  }

  recordTelemetry(reading, receivedAt = Date.now()) {
    const previous = this.previousStatement.get();
    const transaction = this.database.transaction(() => {
      this.insertTelemetry.run({
        ...reading,
        receivedAt,
        waterDetected: Number(reading.waterDetected),
        gasAnomaly: Number(reading.gasAnomaly),
        distanceValid: Number(reading.distanceValid)
      });

      if (reading.waterLevelCm !== null) {
        const currentRisk = classifyRisk(reading.waterLevelCm, this.thresholds);
        const previousRisk = previous?.waterLevelCm === null || previous?.waterLevelCm === undefined
          ? null
          : classifyRisk(previous.waterLevelCm, this.thresholds);
        if (currentRisk !== previousRisk && currentRisk !== "normal") {
          const labels = {
            warning: ["warning", "เริ่มเฝ้าระวังระดับน้ำ", `ระดับน้ำ ${reading.waterLevelCm.toFixed(1)} cm`],
            risk: ["risk", "ระดับน้ำเข้าสู่สถานะเสี่ยง", `ระดับน้ำ ${reading.waterLevelCm.toFixed(1)} cm`],
            critical: ["critical", "ระดับน้ำถึงเกณฑ์วิกฤต", `ระดับน้ำ ${reading.waterLevelCm.toFixed(1)} cm`]
          };
          this.insertAlert.run(reading.stationId, receivedAt, ...labels[currentRisk]);
        }
      }

      if (reading.gasAnomaly && !previous?.gasAnomaly) {
        this.insertAlert.run(
          reading.stationId,
          receivedAt,
          "warning",
          "ตรวจพบสัญญาณผิดปกติจากเซนเซอร์แก๊ส",
          `ค่า MQ-135: ${reading.gasAdc} (raw)`
        );
      }
    });
    transaction();
  }

  latest() {
    const row = this.latestStatement.get();
    if (!row) return null;
    return {
      ...row,
      waterDetected: Boolean(row.waterDetected),
      gasAnomaly: Boolean(row.gasAnomaly),
      distanceValid: Boolean(row.distanceValid)
    };
  }

  previousValidReading() {
    return this.previousValidStatement.get() || null;
  }

  history(since, maxPoints = 500) {
    return this.database.prepare(`
      WITH ranked AS (
        SELECT id, station_id AS stationId, received_at AS receivedAt,
          water_level_cm AS waterLevelCm, distance_cm AS distanceCm,
          gas_adc AS gasAdc, gas_digital AS gasDigital,
          water_detected AS waterDetected, gas_anomaly AS gasAnomaly,
          distance_valid AS distanceValid,
          ROW_NUMBER() OVER (ORDER BY received_at ASC, id ASC) AS rowNumber,
          COUNT(*) OVER () AS totalCount
        FROM telemetry WHERE received_at >= @since
      )
      SELECT stationId, receivedAt, waterLevelCm, distanceCm, gasAdc,
        gasDigital, waterDetected, gasAnomaly, distanceValid
      FROM ranked
      WHERE totalCount <= @maxPoints
        OR rowNumber = 1
        OR rowNumber = totalCount
        OR CAST((rowNumber - 1) * (@maxPoints - 1) / (totalCount - 1) AS INTEGER)
          != CAST((rowNumber - 2) * (@maxPoints - 1) / (totalCount - 1) AS INTEGER)
      ORDER BY rowNumber
    `).all({ since, maxPoints }).map(row => ({
      ...row,
      waterDetected: Boolean(row.waterDetected),
      gasAnomaly: Boolean(row.gasAnomaly),
      distanceValid: Boolean(row.distanceValid)
    }));
  }

  alerts(limit) {
    return this.database.prepare(`
      SELECT station_id AS stationId, created_at AS createdAt,
        severity, title, description
      FROM alerts ORDER BY created_at DESC, id DESC LIMIT ?
    `).all(limit);
  }

  close() {
    this.database.close();
  }
}

module.exports = Store;
