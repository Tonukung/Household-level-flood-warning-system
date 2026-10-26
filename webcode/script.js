const $ = id => document.getElementById(id);
const REFRESH_INTERVAL_MS = 2000;

const timeText = (date, seconds = false) =>
  date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds && { second: "2-digit" })
  });

let config;
let refreshing = false;

const waterChart = new Chart($("waterChart"), {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "ระดับน้ำ (cm)",
        data: [],
        borderColor: "#2878cf",
        backgroundColor: "rgba(40, 120, 207, 0.10)",
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 6
      },
      {
        label: "ระดับวิกฤต",
        data: [],
        borderColor: "#e05252",
        borderDash: [6, 5],
        borderWidth: 1.5,
        pointRadius: 0
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 6, color: "#8997a8" } },
      y: {
        beginAtZero: true,
        suggestedMax: 12,
        title: { display: true, text: "ระดับน้ำ (cm)" },
        ticks: { color: "#8997a8" }
      }
    }
  }
});

function setChart(readings) {
  const validReadings = readings.filter(reading => reading.waterLevelCm !== null);
  waterChart.data.labels = validReadings.map(reading => timeText(new Date(reading.receivedAt)));
  waterChart.data.datasets[0].data = validReadings.map(reading => reading.waterLevelCm);
  waterChart.data.datasets[1].data =
    validReadings.map(() => config.thresholds.critical);
  waterChart.update();
}

function updateDashboard(reading, previousReading, readings) {
  if (!reading) {
    $("waterLevel").textContent = "--";
    $("waterRate").textContent = "--";
    $("timeToCritical").textContent = "--";
    $("riskStatus").textContent = "รอข้อมูล";
    $("riskDot").className = "status-dot offline";
    $("riskDescription").textContent = "ยังไม่ได้รับข้อมูลจากเซนเซอร์";
    $("waterSourceNote").textContent = "รอข้อมูลจากเซนเซอร์";
    $("gasValue").textContent = "--";
    $("gasConnection").textContent = "รอข้อมูล";
    $("gasStatus").textContent = "รอข้อมูลจากเซนเซอร์";
    $("gasDescription").textContent = "ยังไม่ได้รับค่าจาก MQ-135";
    $("waterSensorStatus").textContent = "รอข้อมูล";
    $("gasSensorStatus").textContent = "รอข้อมูล";
    setChart([]);
    return;
  }

  let rate = 0;
  if (reading.waterLevelCm !== null && previousReading) {
    const elapsedMinutes = (reading.receivedAt - previousReading.receivedAt) / 60_000;
    if (elapsedMinutes > 0) {
      rate = (reading.waterLevelCm - previousReading.waterLevelCm) / elapsedMinutes;
    }
  }

  const validLevel = reading.waterLevelCm !== null;
  $("waterLevel").textContent = validLevel
    ? reading.waterLevelCm.toFixed(1).replace(/\.0$/, "")
    : "--";
  $("waterRate").textContent = validLevel
    ? `${rate > 0 ? "+" : ""}${rate.toFixed(1)}`
    : "--";

  if (!validLevel) {
    $("riskStatus").textContent = "อ่านค่าไม่ได้";
    $("riskDot").className = "status-dot offline";
    $("riskDescription").textContent = "ตรวจสอบการวางเซนเซอร์ Ultrasonic";
    $("timeToCritical").textContent = "ประเมินไม่ได้";
  } else if (reading.waterLevelCm < config.thresholds.watch) {
    $("riskStatus").textContent = "ปกติ";
    $("riskDot").className = "status-dot normal";
    $("riskDescription").textContent = "ระดับน้ำอยู่ในช่วงปกติ";
  } else if (reading.waterLevelCm < config.thresholds.risk) {
    $("riskStatus").textContent = "เฝ้าระวัง";
    $("riskDot").className = "status-dot warning";
    $("riskDescription").textContent = "ควรติดตามระดับน้ำอย่างใกล้ชิด";
  } else if (reading.waterLevelCm < config.thresholds.critical) {
    $("riskStatus").textContent = "เสี่ยงน้ำท่วม";
    $("riskDot").className = "status-dot danger";
    $("riskDescription").textContent = "ควรเตรียมพร้อมรับมือสถานการณ์";
  } else {
    $("riskStatus").textContent = "ระดับวิกฤต";
    $("riskDot").className = "status-dot danger";
    $("riskDescription").textContent = "ระดับน้ำถึงเกณฑ์วิกฤตเดโม";
  }

  if (validLevel && reading.waterLevelCm >= config.thresholds.critical) {
    $("timeToCritical").textContent = "ถึงเกณฑ์แล้ว";
  } else if (!validLevel || rate <= 0) {
    $("timeToCritical").textContent = "ประเมินไม่ได้";
  } else {
    const minutes = (config.thresholds.critical - reading.waterLevelCm) / rate;
    $("timeToCritical").textContent = minutes < 1 ? "<1" : minutes.toFixed(1);
  }

  $("waterSourceNote").textContent = reading.distanceValid
    ? `ข้อมูลจริงจาก ${reading.stationId}`
    : "เซนเซอร์ Ultrasonic อ่านระยะไม่ได้";
  $("gasValue").textContent = reading.gasAdc;
  $("gasConnection").textContent = "รับข้อมูลแล้ว";
  $("gasSensorStatus").textContent = "รับข้อมูลแล้ว";
  $("waterSensorStatus").textContent = reading.distanceValid
    ? "ทำงานปกติ"
    : "อ่านค่าไม่ได้";
  $("gasStatus").textContent = reading.gasAnomaly
    ? "พบสัญญาณผิดปกติ"
    : "ไม่พบสัญญาณผิดปกติ";
  $("gasDescription").textContent = reading.gasAnomaly
    ? `MQ-135 digital output แจ้งเตือน; ค่า raw ${reading.gasAdc} ไม่ใช่ผลยืนยันคุณภาพน้ำ`
    : `ค่า MQ-135 raw ${reading.gasAdc}; ไม่ใช่ผลยืนยันคุณภาพน้ำ`;

  setChart(readings);
}

function updateConnection(status) {
  const mqttBadge = $("mqttConnection");
  mqttBadge.textContent = status.mqttConnected ? "MQTT ONLINE" : "MQTT OFFLINE";
  mqttBadge.className = status.mqttConnected
    ? "demo-badge"
    : "demo-badge offline";

  $("deviceStatus").textContent = status.deviceOnline ? "ONLINE" : "OFFLINE";
  $("deviceStatus").className = status.deviceOnline
    ? "demo-badge"
    : "demo-badge offline";
  $("deviceDot").className = status.deviceOnline
    ? "online-dot"
    : "online-dot offline";
  $("deviceMiniStatus").textContent = status.deviceOnline
    ? "เชื่อมต่อแล้ว"
    : "ไม่มีข้อมูลล่าสุด";
}

function renderAlerts(alerts) {
  const list = $("alertList");
  list.replaceChildren();
  $("alertCount").textContent = `${alerts.length} events`;

  const symbols = {
    warning: ["!", "amber-text"],
    risk: ["!", "amber-text"],
    critical: ["!", "amber-text"]
  };

  for (const alert of alerts) {
    const [symbol, symbolClass] = symbols[alert.severity] || ["i", "teal-text"];
    const item = document.createElement("div");
    item.className = "alert-item";

    const icon = document.createElement("span");
    icon.className = `alert-symbol ${symbolClass}`;
    icon.textContent = symbol;

    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = alert.title;
    const description = document.createElement("p");
    description.textContent = alert.description;
    details.append(title, description);

    const time = document.createElement("time");
    time.dateTime = new Date(alert.createdAt).toISOString();
    time.textContent = timeText(new Date(alert.createdAt));
    item.append(icon, details, time);
    list.append(item);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function refreshDashboard() {
  if (refreshing || !config) return;
  refreshing = true;
  try {
    const hours = $("waterPeriod").value;
    const [status, latest, history, alerts] = await Promise.all([
      fetchJson("/api/status"),
      fetchJson("/api/latest"),
      fetchJson(`/api/history?hours=${encodeURIComponent(hours)}`),
      fetchJson("/api/alerts?limit=20")
    ]);

    updateConnection(status);
    updateDashboard(latest.reading, latest.previousValidReading, history.readings);
    renderAlerts(alerts.alerts);
    $("lastUpdated").textContent = status.lastReceivedAt
      ? `อัปเดตล่าสุด: ${timeText(new Date(status.lastReceivedAt), true)}`
      : "ยังไม่ได้รับข้อมูลจากอุปกรณ์";
  } catch (error) {
    console.error("Dashboard refresh failed:", error);
    $("mqttConnection").textContent = "BACKEND OFFLINE";
    $("mqttConnection").className = "demo-badge offline";
    $("deviceStatus").textContent = "OFFLINE";
    $("deviceStatus").className = "demo-badge offline";
    $("deviceDot").className = "online-dot offline";
    $("deviceMiniStatus").textContent = "เชื่อมต่อ backend ไม่ได้";
    $("lastUpdated").textContent = "เชื่อมต่อ backend ไม่ได้";
  } finally {
    refreshing = false;
  }
}

$("refreshBtn").addEventListener("click", refreshDashboard);
$("waterPeriod").addEventListener("change", refreshDashboard);

fetchJson("/api/config")
  .then(apiConfig => {
    config = apiConfig;
    $("thresholdLegend").textContent = `ระดับวิกฤต ${config.thresholds.critical} cm`;
    waterChart.data.datasets[1].label = `ระดับวิกฤต ${config.thresholds.critical} cm`;
    refreshDashboard();
    window.setInterval(refreshDashboard, REFRESH_INTERVAL_MS);
  })
  .catch(error => {
    console.error("Could not load backend configuration:", error);
    $("mqttConnection").textContent = "BACKEND OFFLINE";
    $("mqttConnection").className = "demo-badge offline";
    $("lastUpdated").textContent = "เชื่อมต่อ backend ไม่ได้";
  });

const navLinks = document.querySelectorAll(".nav-link");

navLinks.forEach(link => {
  link.addEventListener("click", () => {
    // เอาสถานะ active ออกจากทุกเมนู
    navLinks.forEach(item => {
      item.classList.remove("active");
    });

    // เพิ่มสถานะ active ให้เมนูที่คลิก
    link.classList.add("active");
  });
});

