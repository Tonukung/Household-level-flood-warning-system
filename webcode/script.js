const $ = id => document.getElementById(id);

// --- ตั้งค่า MQTT สำหรับหน้าเว็บ (ใช้พอร์ต WebSocket 8884 และ SSL) ---
const MQTTbroker = 'mqtt-dashboard.com';
const MQTTport = 8884;
const MQTTsubscribeTopic = 'floodwatch/demo/station-01/telemetry';

// สร้าง Client ID สุ่มสำหรับเว็บ
const client = new Paho.MQTT.Client(MQTTbroker, MQTTport, "web_client_" + parseInt(Math.random() * 1000, 10));

let waterReadingsHistory = []; // เก็บข้อมูลประวัติทั้งหมดพร้อม timestamp
let lastMessageTime = 0;       // เก็บเวลาที่ได้รับข้อมูลล่าสุด
const OFFLINE_TIMEOUT = 10000; // กำหนด 10 วินาทีถ้าไม่มีข้อมูลถือว่า Offline

// ตั้งค่ากราฟ Chart.js
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
      x: { grid: { display: false }, ticks: { color: "#8997a8" } },
      y: { beginAtZero: true, ticks: { color: "#8997a8" } }
    }
  }
});

// ฟังก์ชันอัปเดตกราฟโดยกรองตามช่วงเวลาที่เลือก (1, 5 หรือ 10 นาที)
function updateChartFilter() {
  const selectedMinutes = parseInt($("waterPeriod").value, 10); 
  const now = new Date().getTime();
  const cutoffTime = now - (selectedMinutes * 60 * 1000);

  const filteredData = waterReadingsHistory.filter(item => item.timestamp >= cutoffTime);

  waterChart.data.labels = filteredData.map(item => item.timeString);
  waterChart.data.datasets[0].data = filteredData.map(item => item.level);
  waterChart.update();
}

// ฟังก์ชันเมื่อการเชื่อมต่อ MQTT หลุด
client.onConnectionLost = function (responseObject) {
  console.log("Connection lost: " + responseObject.errorMessage);
  $("mqttConnection").textContent = "MQTT OFFLINE";
  $("mqttConnection").className = "demo-badge offline";
  // หมายเหตุ: เราไม่เคลียร์ค่าตัวเลขหน้าจอ เพื่อให้ค่าล่าสุดค้างไว้
};

// ฟังก์ชันเมื่อมีข้อความส่งมาจาก Arduino ผ่าน MQTT
client.onMessageArrived = function (message) {
  console.log("Received payload: " + message.payloadString);

  try {
    const data = JSON.parse(message.payloadString);
    const now = new Date();
    const timeString = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    // บันทึกเวลาที่ได้รับข้อมูลล่าสุด
    lastMessageTime = now.getTime();

    // 1. อัปเดตสถานะเชื่อมต่อบนเว็บเป็น ONLINE
    $("mqttConnection").textContent = "MQTT ONLINE";
    $("mqttConnection").className = "demo-badge";
    $("deviceStatus").textContent = "ONLINE";
    $("deviceStatus").className = "demo-badge";
    $("lastUpdated").textContent = `อัปเดตล่าสุด: ${timeString}`;


    if (
      typeof data.waterLevelCm === "number" &&
      Number.isFinite(data.waterLevelCm)
    ) {
      const level = data.waterLevelCm;

      // อัปเดตระดับน้ำปัจจุบัน
      $("waterLevel").textContent = level.toFixed(1);
      $("waterSourceNote").textContent = "รับข้อมูลจากเซนเซอร์แล้ว";

      // ตรวจสอบว่าเกิน 8 cm หรือไม่
      const isAboveWarning = level > FLOOD_WARNING_LEVEL;

      if (isAboveWarning) {
        $("riskStatus").textContent = "เฝ้าระวัง";
        $("riskDot").className = "status-dot warning";
        $("riskDescription").textContent =
          "ระดับน้ำเกิน 8 cm ควรติดตามสถานการณ์";

        // สร้างแจ้งเตือนเฉพาะตอนเริ่มเกินเกณฑ์
        if (wasAboveWarningLevel !== true) {
          addFloodAlert(level);
        }
      } else {
        $("riskStatus").textContent = "ปกติ";
        $("riskDot").className = "status-dot normal";
        $("riskDescription").textContent =
          "ระดับน้ำยังไม่เกินเกณฑ์ 8 cm";
      }

      // จำสถานะไว้ตรวจสอบข้อมูลครั้งถัดไป
      wasAboveWarningLevel = isAboveWarning;

      // บันทึกข้อมูลลงกราฟ
      const now = new Date();

      waterReadingsHistory.push({
        timestamp: now.getTime(),
        timeString: now.toLocaleTimeString("th-TH", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        }),
        level: level
      });

      // เก็บประวัติกราฟย้อนหลังไม่เกิน 15 นาที
      const maxAgeTime = now.getTime() - 15 * 60 * 1000;

      waterReadingsHistory = waterReadingsHistory.filter(
        item => item.timestamp >= maxAgeTime
      );

      updateChartFilter();
    }


    // 3. อัปเดตค่าเซนเซอร์แก๊ส MQ-135
    if (data.gasAdc !== undefined) {
      $("gasValue").textContent = data.gasAdc;
      $("gasConnection").textContent = "รับข้อมูลแล้ว";
      $("gasSensorStatus").textContent = "รับข้อมูลแล้ว";
    }

    // 4. บันทึกข้อมูลลงในประวัติพร้อม Timestamp
    waterReadingsHistory.push({
      timestamp: now.getTime(),
      timeString: timeString,
      level: data.waterLevelCm
    });

    const maxAgeTime = now.getTime() - (15 * 60 * 1000);
    waterReadingsHistory = waterReadingsHistory.filter(item => item.timestamp >= maxAgeTime);

    updateChartFilter();

  } catch (e) {
    console.error("Failed to parse JSON message:", e);
  }
};

// ตัวตรวจสอบสถานะ Offline (ทำงานทุกๆ 1 วินาที)
setInterval(() => {
  if (lastMessageTime > 0) {
    const elapsed = new Date().getTime() - lastMessageTime;
    if (elapsed > OFFLINE_TIMEOUT) {
      // ถ้าเกิน 10 วินาทีที่ไม่มีข้อมูลส่งมา ให้เปลี่ยนสถานะเป็น OFFLINE แต่ "ไม่ลบค่าตัวเลขเดิม"
      $("deviceStatus").textContent = "OFFLINE";
      $("deviceStatus").className = "demo-badge offline";
    }
  }
}, 1000);

// เมื่อผู้ใช้เปลี่ยนช่วงเวลาใน Dropdown ให้รีเฟรชกราฟทันที
$("waterPeriod").addEventListener("change", updateChartFilter);

// เริ่มต้นเชื่อมต่อ MQTT Broker
function connectMQTT() {
  const options = {
    timeout: 3,
    useSSL: true,
    onSuccess: function () {
      console.log("MQTT Connected successfully!");
      client.subscribe(MQTTsubscribeTopic);
      $("mqttConnection").textContent = "MQTT ONLINE";
      $("mqttConnection").className = "demo-badge";
    },
    onFailure: function (message) {
      console.log("MQTT Connection failed: " + message.errorMessage);
      $("mqttConnection").textContent = "MQTT OFFLINE";
      $("mqttConnection").className = "demo-badge offline";
      setTimeout(connectMQTT, 5000);
    }
  };
  client.connect(options);
}

// สั่งเชื่อมต่อ MQTT ทันทีที่เปิดเว็บ
connectMQTT();

$("refreshBtn").addEventListener("click", () => {
  $("lastUpdated").textContent = "รีเฟรชข้อมูลเรียบร้อย";
});


const FLOOD_WARNING_LEVEL = 8;

// จำสถานะระดับน้ำก่อนหน้า เพื่อป้องกันการแจ้งเตือนซ้ำ
let wasAboveWarningLevel = null;

// สร้างรายการแจ้งเตือน
function addFloodAlert(waterLevel) {
  const alertList = $("alertList");
  const alertCount = $("alertCount");

  const now = new Date();

  // วันที่และเวลาที่ตรวจพบ
  const dateTime = now.toLocaleString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  // สร้างกล่องแจ้งเตือน
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
    `ตรวจพบระดับน้ำ ${waterLevel.toFixed(1)} cm ซึ่งเกินเกณฑ์ ${FLOOD_WARNING_LEVEL} cm`;

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

  // นับจำนวนรายการแจ้งเตือน
  alertCount.textContent =
    `${alertList.querySelectorAll(".alert-item").length} events`;
}
