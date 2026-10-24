const CRITICAL_LEVEL = 60; // ระดับวิกฤตตัวอย่าง (cm)
const MAX_LEVEL = 80;

const $ = id => document.getElementById(id);
const clamp = v => Math.max(0, Math.min(MAX_LEVEL, v));
const timeText = (date, seconds = false) =>
  date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds && { second: "2-digit" })
  });

let currentLevel = 35;

// เกณฑ์ความเสี่ยง: [ต่ำกว่า (cm), สถานะ, class ของจุดสี, คำอธิบาย]
const RISK_LEVELS = [
  [20, "ปกติ", "normal", "ระดับน้ำอยู่ในช่วงปกติ"],
  [40, "เฝ้าระวัง", "warning", "ควรติดตามระดับน้ำอย่างใกล้ชิด"],
  [CRITICAL_LEVEL, "เสี่ยงน้ำท่วม", "danger", "ควรเตรียมพร้อมรับมือสถานการณ์"],
  [Infinity, "ระดับวิกฤต", "danger", "ถึงเกณฑ์วิกฤตที่กำหนดในตัวอย่าง"]
];

// ---------- Chart ----------
const waterChart = new Chart($("waterChart"), {
  type: "line",
  data: {
    labels: ["10:00", "10:04", "10:08", "10:12", "10:16", "10:20"],
    datasets: [
      {
        label: "ระดับน้ำ (cm)",
        data: [12, 16, 19, 27, 33, 35],
        borderColor: "#2878cf",
        backgroundColor: "rgba(40, 120, 207, 0.10)",
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 6
      },
      {
        label: "ระดับวิกฤตตัวอย่าง",
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
        suggestedMax: 70,
        title: { display: true, text: "ระดับน้ำ (cm)" },
        ticks: { color: "#8997a8" }
      }
    }
  }
});

// ตั้งค่าข้อมูลกราฟทั้งหมด (เส้นวิกฤตสร้างให้ยาวเท่ากับข้อมูลอัตโนมัติ)
function setChart(labels, values) {
  waterChart.data.labels = labels;
  waterChart.data.datasets[0].data = values;
  waterChart.data.datasets[1].data = values.map(() => CRITICAL_LEVEL);
  waterChart.update();
}

setChart([...waterChart.data.labels], [...waterChart.data.datasets[0].data]);

// ---------- Dashboard ----------
function updateDashboard(level, rate) {
  currentLevel = level;

  $("waterLevel").textContent = level.toFixed(1).replace(/\.0$/, "");
  $("waterRate").textContent = `${rate > 0 ? "+" : ""}${rate.toFixed(1)}`;

  const [, status, dotClass, description] =
    RISK_LEVELS.find(([limit]) => level < limit);

  $("riskStatus").textContent = status;
  $("riskDot").className = `status-dot ${dotClass}`;
  $("riskDescription").textContent = description;

  // เวลาโดยประมาณถึงระดับวิกฤต (สมมติอัตราคงที่)
  const minutes = (CRITICAL_LEVEL - level) / rate;
  $("timeToCritical").textContent =
    level >= CRITICAL_LEVEL ? "ถึงเกณฑ์แล้ว"
    : rate <= 0 ? "ประเมินไม่ได้"
    : minutes < 1 ? "<1"
    : minutes.toFixed(1);
}

function updateTimestamp() {
  $("lastUpdated").textContent = "อัปเดตล่าสุด: " + timeText(new Date(), true);
}

// ---------- Events (จำลองข้อมูล ไม่ได้อ่านจากเซนเซอร์จริง) ----------
$("refreshBtn").addEventListener("click", () => {
  const nextLevel = clamp(currentLevel + Math.random() * 6 - 2);
  const rate = nextLevel - currentLevel; // สมมติว่าห่างกัน 1 นาที

  updateDashboard(nextLevel, rate);

  // เก็บจุดล่าสุดไม่เกิน 12 จุด
  const labels = [...waterChart.data.labels, timeText(new Date())].slice(-12);
  const values = [...waterChart.data.datasets[0].data, nextLevel].slice(-12);
  setChart(labels, values);

  updateTimestamp();
});

$("waterPeriod").addEventListener("change", e => {
  const hours = Number(e.target.value);
  const count = hours === 1 ? 6 : hours === 6 ? 8 : 12;
  const stepMs = (hours * 60 / (count - 1)) * 60000;
  const now = Date.now();

  const labels = [];
  const values = [];
  for (let i = count - 1; i >= 0; i--) {
    labels.push(timeText(new Date(now - i * stepMs)));
    values.push(clamp(currentLevel - i * 1.5 + Math.random() * 3));
  }
  setChart(labels, values);
});

// ---------- Init ----------
updateDashboard(35, 2);
updateTimestamp();