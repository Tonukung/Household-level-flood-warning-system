
const $ = (id) => document.getElementById(id);

// ---------- MQTT SETTINGS ----------
const MQTTbroker = "mqtt-dashboard.com";
const MQTTport = 8884;
const MQTTsubscribeTopic = "floodwatch/demo/station-01/telemetry";

const client = new Paho.MQTT.Client(
  MQTTbroker,
  MQTTport,
  "web_client_" + Math.random().toString(16).slice(2)
);

// ---------- SETTINGS ----------
const FLOOD_WARNING_LEVEL = 8;  // ระดับน้ำเฝ้าระวัง (cm)
const FLOOD_CRITICAL_LEVEL = 50; // ระดับน้ำวิกฤต (cm)
const ALERT_INTERVAL = 3 * 60 * 1000; // แจ้งเตือนซ้ำทุก 3 นาที
const OFFLINE_TIMEOUT = 4 * 60 * 1000; // รอข้อมูลได้นาน 4 นาที

let waterReadingsHistory = [];
let lastMessageTime = 0;
let lastWaterReading = null;
let lastAlertTime = 0;
let currentWaterLevel = null;
let wasAboveWarningLevel = false;

// ---------- WATER LEVEL CHART ----------
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
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: "#8997a8" }
      },
      y: {
        beginAtZero: true,
        ticks: { color: "#8997a8" }
      }
    }
  }
});

// ---------- UPDATE CHART ----------
function updateChartFilter() {
  const selectedMinutes = Number($("waterPeriod").value);
  const cutoffTime = Date.now() - selectedMinutes * 60 * 1000;

  const filteredData = waterReadingsHistory.filter(
    (item) => item.timestamp >= cutoffTime
  );

  waterChart.data.labels = filteredData.map((item) => item.timeString);
  waterChart.data.datasets[0].data = filteredData.map((item) => item.level);
  waterChart.update();
}

// ---------- CALCULATE WATER RATE ----------
function calculateWaterRate(level, timestamp) {
  if (lastWaterReading === null) {
    $("waterRate").textContent = "--";
    $("timeToCritical").textContent = "--";
    return;
  }

  const elapsedMinutes =
    (timestamp - lastWaterReading.timestamp) / 60000;

  // ป้องกันการหารด้วยศูนย์
  if (elapsedMinutes <= 0) {
    return;
  }

  // อัตราการเปลี่ยนแปลง = ระดับน้ำที่เปลี่ยน / เวลาที่ผ่านไป
  const rate = (level - lastWaterReading.level) / elapsedMinutes;

  $("waterRate").textContent = rate.toFixed(2);

  // คำนวณเวลาโดยประมาณถึงระดับวิกฤต
  if (rate > 0 && level < FLOOD_CRITICAL_LEVEL) {
    const minutesRemaining =
      (FLOOD_CRITICAL_LEVEL - level) / rate;

    $("timeToCritical").textContent =
      Math.ceil(minutesRemaining);
  } else {
    $("timeToCritical").textContent = "--";
  }
}

// ---------- UPDATE RISK STATUS ----------
function updateRiskStatus(level) {
  const riskStatus = $("riskStatus");
  const riskDot = $("riskDot");
  const description = $("riskDescription");

  if (level >= FLOOD_CRITICAL_LEVEL) {
    riskStatus.textContent = "วิกฤต";
    riskDot.className = "status-dot danger";
    description.textContent = "ระดับน้ำถึงเกณฑ์วิกฤตแล้ว";
  } else if (level > FLOOD_WARNING_LEVEL) {
    riskStatus.textContent = "เฝ้าระวัง";
    riskDot.className = "status-dot warning";
    description.textContent = "";
  } else {
    riskStatus.textContent = "ปกติ";
    riskDot.className = "status-dot normal";
    description.textContent = "";
  }
}

// ---------- ADD FLOOD ALERT ----------
function addFloodAlert(waterLevel) {
  const alertList = $("alertList");
  const alertCount = $("alertCount");
  const now = new Date();

  const dateTime = now.toLocaleString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const item = document.createElement("div");
  item.className = "alert-item";

  const symbol = document.createElement("span");
  symbol.className = "alert-symbol amber-text";
  symbol.textContent = "⚠";

  const content = document.createElement("div");

  const title = document.createElement("strong");
  title.textContent = "ระดับน้ำเกินเกณฑ์เฝ้าระวัง";

  const description = document.createElement("p");
  description.textContent =
    `ตรวจพบระดับน้ำ ${waterLevel.toFixed(1)} cm ` +
    `เกินเกณฑ์ ${FLOOD_WARNING_LEVEL} cm`;

  const time = document.createElement("time");
  time.dateTime = now.toISOString();
  time.textContent = dateTime;

  content.appendChild(title);
  content.appendChild(description);
  content.appendChild(time);

  item.appendChild(symbol);
  item.appendChild(content);

  // เพิ่มรายการใหม่ไว้บนสุด
  alertList.prepend(item);

  // เก็บสูงสุด 5 รายการ ลบรายการเก่าที่สุดออก
  while (alertList.querySelectorAll(".alert-item").length > 5) {
    alertList.lastElementChild.remove();
  }

  alertCount.textContent =
    `${alertList.querySelectorAll(".alert-item").length} events`;
}

// ---------- HANDLE MQTT MESSAGE ----------
client.onMessageArrived = function (message) {
  console.log("Received payload:", message.payloadString);

  try {
    const data = JSON.parse(message.payloadString);
    const now = new Date();
    const timestamp = now.getTime();

    lastMessageTime = timestamp;

    const timeString = now.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });

    $("mqttConnection").textContent = "MQTT ONLINE";
    $("mqttConnection").className = "demo-badge";
    $("deviceStatus").textContent = "ONLINE";
    $("deviceStatus").className = "demo-badge";
    $("lastUpdated").textContent = `อัปเดตล่าสุด: ${timeString}`;

    // ---------- WATER LEVEL ----------
    if (
      typeof data.waterLevelCm === "number" &&
      Number.isFinite(data.waterLevelCm)
    ) {
      const level = data.waterLevelCm;

      // คำนวณก่อนแทนที่ข้อมูลครั้งก่อน
      calculateWaterRate(level, timestamp);

      $("waterLevel").textContent = level.toFixed(1);
      $("waterSourceNote").textContent = "";
      $("waterSensorStatus").textContent = "รับข้อมูลแล้ว";

      updateRiskStatus(level);

      // บันทึกประวัติระดับน้ำเพียงครั้งเดียวต่อข้อความ
      waterReadingsHistory.push({
        timestamp: timestamp,
        timeString: timeString,
        level: level
      });

      // เก็บข้อมูลกราฟย้อนหลัง 15 นาที
      const maxAgeTime = timestamp - 15 * 60 * 1000;

      waterReadingsHistory = waterReadingsHistory.filter(
        (item) => item.timestamp >= maxAgeTime
      );

      updateChartFilter();

      currentWaterLevel = level;

      // บันทึกระดับน้ำล่าสุดไว้ใช้คำนวณครั้งถัดไป
      lastWaterReading = {
        level: level,
        timestamp: timestamp
      };

      // แจ้งเตือนทันทีเมื่อเพิ่งข้ามเกณฑ์
      if (level > FLOOD_WARNING_LEVEL && !wasAboveWarningLevel) {
        addFloodAlert(level);
        lastAlertTime = timestamp;
      }

      wasAboveWarningLevel = level > FLOOD_WARNING_LEVEL;
    }

    // ---------- GAS SENSOR ----------
    if (
      typeof data.gasAdc === "number" &&
      Number.isFinite(data.gasAdc)
    ) {
      $("gasValue").textContent = data.gasAdc;
      $("gasConnection").textContent = "รับข้อมูลแล้ว";
      $("gasSensorStatus").textContent = "รับข้อมูลแล้ว";
    }
  } catch (error) {
    console.error("Failed to parse MQTT JSON:", error);
  }
};

// ---------- MQTT CONNECTION LOST ----------
client.onConnectionLost = function (responseObject) {
  console.log(
    "Connection lost:",
    responseObject.errorMessage
  );

  $("mqttConnection").textContent = "MQTT OFFLINE";
  $("mqttConnection").className = "demo-badge offline";
};

// ---------- CHECK DEVICE STATUS & REPEAT ALERT ----------
setInterval(() => {
  const now = Date.now();

  // ตรวจสอบว่าอุปกรณ์ขาดการส่งข้อมูลนานเกินไปหรือไม่
  if (
    lastMessageTime === 0 ||
    now - lastMessageTime > OFFLINE_TIMEOUT
  ) {
    $("deviceStatus").textContent = "OFFLINE";
    $("deviceStatus").className = "demo-badge offline";

    $("waterSensorStatus").textContent = "ไม่มีข้อมูล";
    $("gasSensorStatus").textContent = "ไม่มีข้อมูล";

    $("mqttConnection").textContent = "รอข้อมูล";
    $("mqttConnection").className = "demo-badge offline";
  }

  // แจ้งเตือนซ้ำทุก 3 นาทีขณะที่ระดับน้ำยังเกินเกณฑ์
  // และข้อมูลจากอุปกรณ์ยังไม่เก่าเกินเวลาที่กำหนด
  if (
    currentWaterLevel !== null &&
    currentWaterLevel > FLOOD_WARNING_LEVEL &&
    lastMessageTime > 0 &&
    now - lastMessageTime <= OFFLINE_TIMEOUT &&
    now - lastAlertTime >= ALERT_INTERVAL
  ) {
    addFloodAlert(currentWaterLevel);
    lastAlertTime = now;
  }
}, 1000);

// ---------- CHART FILTER ----------
$("waterPeriod").addEventListener("change", updateChartFilter);

// ---------- REFRESH BUTTON ----------
$("refreshBtn").addEventListener("click", () => {
  updateChartFilter();

  if (lastMessageTime > 0) {
    $("lastUpdated").textContent =
      `ข้อมูลล่าสุด: ${new Date(lastMessageTime).toLocaleTimeString("th-TH")}`;
  } else {
    $("lastUpdated").textContent = "ยังไม่ได้รับข้อมูลจากเซนเซอร์";
  }
});

// ---------- CONNECT MQTT ----------
function connectMQTT() {
  if (client.isConnected()) {
    return;
  }

  client.connect({
    timeout: 10,
    useSSL: true,

    onSuccess: function () {
      console.log("MQTT connected");

      $("mqttConnection").textContent = "MQTT ONLINE";
      $("mqttConnection").className = "demo-badge";

      client.subscribe(MQTTsubscribeTopic, {
        onSuccess: function () {
          console.log("Subscribed:", MQTTsubscribeTopic);
        },
        onFailure: function (error) {
          console.error("Subscribe failed:", error);
        }
      });
    },

    onFailure: function (error) {
      console.error("MQTT connection failed:", error.errorMessage);

      $("mqttConnection").textContent = "MQTT OFFLINE";
      $("mqttConnection").className = "demo-badge offline";

      setTimeout(connectMQTT, 5000);
    }
  });
}

connectMQTT();
