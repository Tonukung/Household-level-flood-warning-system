
const waterHistory = [12, 16, 19, 27, 35];
const timeLabels = [
  "10:00",
  "10:05",
  "10:10",
  "10:15",
  "10:20"
];

function updateDashboard(level) {
  document.getElementById("waterLevel").textContent = level;

  let status = "";

  if (level < 20) {
    status = "ปกติ";
  } else if (level < 40) {
    status = "เฝ้าระวัง";
  } else if (level < 60) {
    status = "เสี่ยงน้ำท่วม";
  } else {
    status = "ระดับวิกฤต";
  }

  document.getElementById("riskStatus").textContent = status;
}

// สร้างกราฟจากข้อมูลจำลอง
const chart = new Chart(
  document.getElementById("waterChart"),
  {
    type: "line",
    data: {
      labels: timeLabels,
      datasets: [{
        label: "ระดับน้ำ (cm)",
        data: waterHistory,
        borderColor: "#1769aa",
        backgroundColor: "#1769aa22",
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "ระดับน้ำ (cm)"
          }
        }
      }
    }
  }
);

// ทดลองเปลี่ยนค่าระดับน้ำ
updateDashboard(35);
