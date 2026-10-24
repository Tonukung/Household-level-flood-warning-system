
const CRITICAL_LEVEL = 60; // ระดับวิกฤตตัวอย่าง หน่วย cm

let currentLevel = 35;
let previousLevel = 33;
let previousTime = Date.now() - 60000;

const waterHistory = [12, 16, 19, 27, 33, 35];
const labels = ["10:00", "10:04", "10:08", "10:12", "10:16", "10:20"];

const waterCanvas = document.getElementById("waterChart");

const waterChart = new Chart(waterCanvas, {
  type: "line",
  data: {
    labels: [...labels],
    datasets: [
      {
        label: "ระดับน้ำ (cm)",
        data: [...waterHistory],
        borderColor: "#2878cf",
        backgroundColor: "rgba(40, 120, 207, 0.10)",
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 6
      },
      {
        label: "ระดับวิกฤตตัวอย่าง",
        data: waterHistory.map(() => CRITICAL_LEVEL),
        borderColor: "#e05252",
        borderDash: [6, 5],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: "index"
    },
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          maxTicksLimit: 6,
          color: "#8997a8"
        }
      },
      y: {
        beginAtZero: true,
        suggestedMax: 70,
        title: {
          display: true,
          text: "ระดับน้ำ (cm)"
        },
        ticks: {
          color: "#8997a8"
        }
      }
    }
  }
});

function updateDashboard(level, rate) {
  currentLevel = level;

  document.getElementById("waterLevel").textContent =
    level.toFixed(1).replace(/\.0$/, "");

  document.getElementById("waterRate").textContent =
    `${rate > 0 ? "+" : ""}${rate.toFixed(1)}`;

  const riskStatus = document.getElementById("riskStatus");
  const riskDot = document.getElementById("riskDot");
  const riskDescription =
    document.getElementById("riskDescription");

  let status;
  let dotClass;
  let description;

  if (level < 20) {
    status = "ปกติ";
    dotClass = "normal";
    description = "ระดับน้ำอยู่ในช่วงปกติ";
  } else if (level < 40) {
    status = "เฝ้าระวัง";
    dotClass = "warning";
    description = "ควรติดตามระดับน้ำอย่างใกล้ชิด";
  } else if (level < CRITICAL_LEVEL) {
    status = "เสี่ยงน้ำท่วม";
    dotClass = "danger";
    description = "ควรเตรียมพร้อมรับมือสถานการณ์";
  } else {
    status = "ระดับวิกฤต";
    dotClass = "danger";
    description = "ถึงเกณฑ์วิกฤตที่กำหนดในตัวอย่าง";
  }

  riskStatus.textContent = status;
  riskDot.className = `status-dot ${dotClass}`;
  riskDescription.textContent = description;

  const timeElement =
    document.getElementById("timeToCritical");

  if (level >= CRITICAL_LEVEL) {
    timeElement.textContent = "ถึงเกณฑ์แล้ว";
  } else if (rate > 0) {
    const minutes = (CRITICAL_LEVEL - level) / rate;

    timeElement.textContent =
      minutes < 1 ? "<1" : minutes.toFixed(1);
  } else {
    timeElement.textContent = "ประเมินไม่ได้";
  }
}

function updateChart(level) {
  const now = new Date();

  const timeLabel = now.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit"
  });

  waterChart.data.labels.push(timeLabel);
  waterChart.data.datasets[0].data.push(level);
  waterChart.data.datasets[1].data.push(CRITICAL_LEVEL);

  // เก็บตัวอย่างล่าสุดไม่เกิน 12 จุด
  if (waterChart.data.labels.length > 12) {
    waterChart.data.labels.shift();
    waterChart.data.datasets.forEach(dataset => {
      dataset.data.shift();
    });
  }

  waterChart.update();
}

function updateTimestamp() {
  const now = new Date();

  document.getElementById("lastUpdated").textContent =
    "อัปเดตล่าสุด: " +
    now.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
}

// ปุ่มนี้เป็นการจำลองข้อมูล ไม่ได้อ่านจากเซนเซอร์จริง
document.getElementById("refreshBtn").addEventListener(
  "click",
  () => {
    previousLevel = currentLevel;
    previousTime = Date.now();

    // สุ่มให้ระดับน้ำเปลี่ยนแปลงทีละน้อย
    const change = Math.random() * 6 - 2;
    const nextLevel = Math.max(
      0,
      Math.min(80, currentLevel + change)
    );

    // ใช้เวลา 1 นาทีเป็นสมมติฐานของข้อมูลจำลอง
    const simulatedRate = nextLevel - previousLevel;

    updateDashboard(nextLevel, simulatedRate);
    updateChart(nextLevel);
    updateTimestamp();

    document.getElementById("deviceStatus").textContent =
      "Demo mode — ข้อมูลจำลอง";
  }
);

// เปลี่ยนช่วงเวลาที่แสดงในกราฟ
document.getElementById("waterPeriod").addEventListener(
  "change",
  event => {
    const hours = Number(event.target.value);

    // สร้างข้อมูลตัวอย่างสำหรับช่วงเวลาที่เลือก
    const count = hours === 1 ? 6 : hours === 6 ? 8 : 12;
    const now = new Date();

    const newLabels = [];
    const newValues = [];

    for (let i = count - 1; i >= 0; i--) {
      const pointTime = new Date(
        now.getTime() - i * (hours * 60 / (count - 1)) * 60000
      );

      newLabels.push(
        pointTime.toLocaleTimeString("th-TH", {
          hour: "2-digit",
          minute: "2-digit"
        })
      );

      newValues.push(
        Math.max(0, Math.min(80,
          currentLevel - i * 1.5 + Math.random() * 3
        ))
      );
    }

    waterChart.data.labels = newLabels;
    waterChart.data.datasets[0].data = newValues;
    waterChart.data.datasets[1].data =
      newValues.map(() => CRITICAL_LEVEL);

    waterChart.update();
  }
);

// เริ่มต้นด้วยข้อมูลจำลอง
updateDashboard(35, 2);
updateTimestamp();
