# Household-level-flood-warning-system
Physical Computing Project 2026 - IT KMITL

## Project Concept
ระบบตรวจวัดและเฝ้าระวังระดับน้ำบริเวณบ้านหรือถนนหน้าบ้าน โดยใช้เซนเซอร์ Ultrasonic วัดระดับน้ำ และส่งข้อมูลผ่าน Wi-Fi ไปยังเว็บไซต์ที่พัฒนาขึ้นเอง เพื่อแสดงระดับน้ำแบบเรียลไทม์ พร้อมกราฟแสดงแนวโน้มการเปลี่ยนแปลงของระดับน้ำและระบบแจ้งเตือนตามระดับความเสี่ยง

## Objective
1. เพื่อพัฒนาเว็บไซต์สำหรับแสดงระดับน้ำ กราฟแนวโน้มการเปลี่ยนแปลงของระดับน้ำ และสถานะความเสี่ยงจากน้ำท่วม
2. เพื่อคำนวณอัตราการเพิ่มขึ้นของระดับน้ำและประมาณเวลาที่น้ำอาจถึงระดับวิกฤต เพื่อช่วยให้ผู้ใช้งานประเมินสถานการณ์ล่วงหน้าได้
3. เพื่อพัฒนาระบบตรวจวัดและติดตามระดับน้ำบริเวณบ้านหรือถนนหน้าบ้านแบบเรียลไทม์ โดยใช้ Ultrasonic Sensor และ Arduino UNO R4 WiFi

## Run the MQTT dashboard

### Backend

1. Install Node.js, then install the backend packages:
   ```sh
   cd server
   npm install
   ```
2. Start the server:
   ```sh
   npm start
   ```
3. Open `http://127.0.0.1:3000`. The server hosts the dashboard and its HTTP API.

The backend subscribes to `floodwatch/demo/station-01/telemetry` on
`mqtt://mqtt-dashboard.com:8884` by default. Override `MQTT_URL`, `MQTT_TOPIC`,
`STATION_ID`, `PORT`, or `DATABASE_PATH` with environment variables if needed.
SQLite stores telemetry and alert transitions in `server/data/floodwatch.sqlite`
and keeps records until they are manually removed. The dashboard requests the
latest 1, 6, or 24 hours of readings.

### Arduino UNO R4 WiFi

1. Install the Arduino UNO R4 WiFi board package and the `LiquidCrystal_I2C`
   and `PubSubClient` libraries.
2. Copy `arduino/proj/secrets.example.h` to `arduino/proj/secrets.h`.
3. Put the Wi-Fi SSID and password in `secrets.h`, then open and upload
   `arduino/proj/proj.ino`.
4. Keep the station ID and MQTT topic consistent with the backend settings.

The Arduino publishes a JSON reading every second. `waterLevelCm` and
`distanceCm` are `null` when the ultrasonic measurement is invalid; the backend
does not treat an invalid measurement as a zero water level. MQTT receipt time
is assigned by the backend. The dashboard uses demo alert thresholds of
5 cm (watch), 8 cm (risk), and 10 cm (critical); override them with
`WATCH_LEVEL_CM`, `RISK_LEVEL_CM`, and `CRITICAL_LEVEL_CM`.

Available API endpoints are `GET /api/status`, `GET /api/latest`,
`GET /api/history?hours=1|6|24`, and `GET /api/alerts?limit=20`.

**Demo security note:** this setup uses unauthenticated, unencrypted MQTT as
requested. The broker and topic may be publicly readable or writable, so other
clients could observe or spoof demo telemetry. Do not use this configuration
for private data or safety-critical flood alerts.

## Contributor
| Student ID | Name | Topic | Profile |
|--|--|--|--|
| 68070119 | นายพัชร คงอ่ำ | Backend Developemnt & IoT Programming | <img src="./img/68070119.png" width="250">|
| 68070132 | นางสาวภัชธนสรณ์ พีรวัฒน์กุล | Frontend Development | <img src="./img/68070132.png" width="250"> |

## Source
* Chart.js guide - [https://www.chartjs.org/docs/latest/getting-started/usage.html](https://www.chartjs.org/docs/latest/getting-started/usage.html)
* Fetch API with JavaScript - [https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
* Water Level Monitoring System using Arduino - [https://github.com/sangeetham252006-eng/task-20-water-level-monitoring-system](https://github.com/sangeetham252006-eng/task-20-water-level-monitoring-system)

![Arduino IDE](https://img.shields.io/badge/Arduino%20IDE-%2300979D.svg?style=for-the-badge&logo=Arduino&logoColor=white) ![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white) ![CSS](https://img.shields.io/badge/css-%23663399.svg?style=for-the-badge&logo=CSS&logoColor=white) ![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=JavaScript&logoColor=%23F7DF1E) ![MQTT](https://img.shields.io/badge/MQTT-660066.svg?style=for-the-badge&logo=mqtt&logoColor=white) ![Chart.js](https://img.shields.io/badge/chart.js-%23F5788D.svg?style=for-the-badge&logo=chart.js&logoColor=white)