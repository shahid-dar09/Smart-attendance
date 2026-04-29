// ============================================================
// GLOBAL STATE
// ============================================================
let modelsLoaded = false;
let stream = null;
let currentStudent = null;
let storedDescriptor = null;
let geolocation = { lat: null, lng: null };
let verificationInProgress = false;

// ============================================================
// PAGE NAVIGATION
// ============================================================
function showPage(name) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("page-" + name).classList.add("active");
  event.target.classList.add("active");

  if (name === "dashboard") loadDashboard();
  if (name === "register") loadStudentList();
  if (name === "attendance") loadTodayRecords();
}

function downloadAttendance() {
  window.open('api/download_attendance.php', '_blank');
}
// ============================================================
// GEO-TAG
// ============================================================
function getLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        geolocation.lat = pos.coords.latitude;
        geolocation.lng = pos.coords.longitude;
      },
      () => {},
    );
  }
}
getLocation();

// ============================================================
// FACE MODELS
// ============================================================
async function loadModels() {
  const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";
  try {
    setModelStatus("loading", "Loading face recognition models...");
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    setModelStatus("ready", "✅ Models ready — face recognition active");
  } catch (e) {
    setModelStatus("error", "❌ Model load failed: " + e.message);
  }
}

function setModelStatus(state, text) {
  const dot = document.getElementById("model-dot");
  const label = document.getElementById("model-label");
  if (!dot) return;
  dot.className =
    "dot " + (state === "ready" ? "ready" : state === "error" ? "error" : "");
  label.textContent = text;
}

// ============================================================
// REGISTER
// ============================================================
function previewImage(input) {
  const preview = document.getElementById("img-preview");
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.src = e.target.result;
      preview.classList.add("show");
    };
    reader.readAsDataURL(input.files[0]);
  }
}

async function registerStudent() {
  const name = document.getElementById("reg-name").value.trim();
  const roll = document.getElementById("reg-roll").value.trim().toUpperCase();
  const dept = document.getElementById("reg-dept").value;
  const img = document.getElementById("reg-img").files[0];

  if (!name || !roll || !dept || !img) {
    showAlert("reg-alert", "All fields including image are required", "error");
    return;
  }

  const btn = document.getElementById("reg-btn");
  btn.disabled = true;
  btn.innerHTML = "<span>Registering...</span>";

  const formData = new FormData();
  formData.append("name", name);
  formData.append("roll_number", roll);
  formData.append("department", dept);
  formData.append("image", img);

  try {
    const res = await fetch("api/register.php", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    showAlert("reg-alert", data.message, data.success ? "success" : "error");
    if (data.success) {
      document.getElementById("reg-name").value = "";
      document.getElementById("reg-roll").value = "";
      document.getElementById("reg-dept").value = "";
      document.getElementById("reg-img").value = "";
      document.getElementById("img-preview").classList.remove("show");
      loadStudentList();
    }
  } catch (e) {
    showAlert("reg-alert", "Network error: " + e.message, "error");
  }

  btn.disabled = false;
  btn.innerHTML = "<span>Register Student</span>";
}

async function loadStudentList() {
  try {
    const res = await fetch("api/dashboard.php");
    const data = await res.json();
    const tbody = document.getElementById("students-tbody");
    const stats = data.student_stats || [];
    if (!stats.length) {
      tbody.innerHTML =
        '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:2rem">No students registered</td></tr>';
      return;
    }
    tbody.innerHTML = stats
      .map(
        (s) => `
      <tr>
        <td class="text-accent">${s.roll_number}</td>
        <td>${s.name}</td>
        <td class="text-muted">${s.department}</td>
        <td>${s.total_days || 0} days</td>
      </tr>`,
      )
      .join("");
  } catch (e) {}
}

// ============================================================
// ATTENDANCE — LOOKUP
// ============================================================
async function lookupStudent() {
  const roll = document.getElementById("att-roll").value.trim().toUpperCase();
  if (!roll) {
    showAlert("lookup-alert", "Enter a roll number", "warn");
    return;
  }

  showAlert("lookup-alert", "Looking up student...", "info");

  try {
    const res = await fetch(
      `api/get_student.php?roll=${encodeURIComponent(roll)}`,
    );
    const data = await res.json();

    if (!data.success) {
      showAlert("lookup-alert", data.message, "error");
      hideStudentPreview();
      return;
    }

    currentStudent = data.student;

    if (data.already_marked) {
      const cls =
        data.already_marked.status === "Present" ? "success" : "error";
      showAlert(
        "lookup-alert",
        `Attendance already marked as ${data.already_marked.status} at ${data.already_marked.time}`,
        cls,
      );
      document.getElementById("verify-btn").disabled = true;
    } else {
      showAlert(
        "lookup-alert",
        `Student found: ${data.student.name}. Start camera to verify.`,
        "success",
      );
      document.getElementById("verify-btn").disabled = !stream;
    }

    showStudentPreview(data.student);

    // Pre-load face descriptor from stored image
    loadStoredDescriptor(data.student.image_url);
  } catch (e) {
    showAlert("lookup-alert", "Error: " + e.message, "error");
  }
}

function showStudentPreview(s) {
  document.getElementById("student-thumb").src = s.image_url;
  document.getElementById("preview-name").textContent = s.name;
  document.getElementById("preview-roll").textContent =
    "Roll: " + s.roll_number;
  document.getElementById("preview-dept").textContent = s.department;
  document.getElementById("student-preview").classList.add("show");
}
function hideStudentPreview() {
  document.getElementById("student-preview").classList.remove("show");
  currentStudent = null;
  storedDescriptor = null;
}

async function loadStoredDescriptor(imageUrl) {
  if (!modelsLoaded) {
    showAlert("lookup-alert", "Models not loaded yet", "warn");
    return;
  }
  try {
    setFaceStatus("⏳ Loading stored face...");
    const img = await faceapi.fetchImage(imageUrl);
    const detection = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!detection) {
      showAlert(
        "lookup-alert",
        "⚠️ No face detected in stored image. Please re-register.",
        "warn",
      );
      storedDescriptor = null;
      return;
    }
    storedDescriptor = detection.descriptor;
    setFaceStatus("✅ Stored face loaded");
    setTimeout(() => setFaceStatus(""), 2000);
  } catch (e) {
    showAlert(
      "lookup-alert",
      "Failed to load stored face: " + e.message,
      "error",
    );
  }
}

// ============================================================
// ATTENDANCE — CAMERA
// ============================================================
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
    });
    const video = document.getElementById("webcam");
    video.srcObject = stream;
    document.getElementById("cam-placeholder").style.display = "none";
    document.getElementById("cam-btn").textContent = "⏹ Stop Camera";
    document.getElementById("cam-btn").onclick = stopCamera;
    if (currentStudent && !document.getElementById("verify-btn").disabled) {
      document.getElementById("verify-btn").disabled = false;
    } else if (currentStudent) {
      document.getElementById("verify-btn").disabled = false;
    }
    startLiveFaceDetection();
  } catch (e) {
    showAlert("att-alert", "Camera access denied: " + e.message, "error");
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  document.getElementById("cam-placeholder").style.display = "flex";
  document.getElementById("cam-btn").textContent = "▶ Start Camera";
  document.getElementById("cam-btn").onclick = startCamera;
  document.getElementById("verify-btn").disabled = true;
}

async function startLiveFaceDetection() {
  const video = document.getElementById("webcam");
  const canvas = document.getElementById("overlay-canvas");
  const ctx = canvas.getContext("2d");

  async function detect() {
    if (!stream || !modelsLoaded) {
      requestAnimationFrame(detect);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const detections = await faceapi.detectAllFaces(
      video,
      new faceapi.TinyFaceDetectorOptions(),
    );
    const resized = faceapi.resizeResults(detections, {
      width: canvas.width,
      height: canvas.height,
    });

    resized.forEach((det) => {
      const { x, y, width, height } = det.box;
      ctx.strokeStyle = "#00e5a0";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);
    });

    if (detections.length > 0) setFaceStatus("✅ Face detected");
    else if (stream) setFaceStatus("👀 Looking for face...");

    if (stream) requestAnimationFrame(detect);
  }
  detect();
}

function setFaceStatus(text) {
  const el = document.getElementById("face-status");
  if (text) {
    el.textContent = text;
    el.style.display = "block";
  } else el.style.display = "none";
}

// ============================================================
// ATTENDANCE — CAPTURE & VERIFY
// ============================================================
async function captureAndVerify() {
  if (!currentStudent) {
    showAlert("att-alert", "Please lookup a student first", "warn");
    return;
  }
  if (!stream) {
    showAlert("att-alert", "Please start camera first", "warn");
    return;
  }
  if (!modelsLoaded) {
    showAlert("att-alert", "Face models not loaded", "warn");
    return;
  }
  if (!storedDescriptor) {
    showAlert(
      "att-alert",
      "Stored face not loaded. Try re-looking up the student.",
      "warn",
    );
    return;
  }
  if (verificationInProgress) return;

  verificationInProgress = true;
  const btn = document.getElementById("verify-btn");
  btn.disabled = true;
  btn.textContent = "⏳ Processing...";
  showAlert("att-alert", "🔍 Analyzing face...", "info");
  setFaceStatus("⏳ Processing face...");

  try {
    const video = document.getElementById("webcam");

    // Detect face from live video
    const liveDetection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!liveDetection) {
      showAlert(
        "att-alert",
        "❌ No face detected. Position face clearly in camera.",
        "error",
      );
      setFaceStatus("❌ No face found");
      verificationInProgress = false;
      btn.disabled = false;
      btn.textContent = "📸 Capture & Verify";
      return;
    }

    // Compare descriptors
    const distance = faceapi.euclideanDistance(
      storedDescriptor,
      liveDetection.descriptor,
    );
    const THRESHOLD = 0.45;
    const isMatch = distance < THRESHOLD;
    const matchPct = Math.round((1 - distance) * 100);

    const status = isMatch ? "Present" : "Rejected";
    const msg = isMatch
      ? `✅ MATCH! Face verified (${matchPct}% confidence). Marking Present.`
      : `❌ NO MATCH (${matchPct}% similarity, threshold 55%). Marking Rejected.`;

    showAlert("att-alert", msg, isMatch ? "success" : "error");
    setFaceStatus(isMatch ? "✅ VERIFIED" : "❌ REJECTED");

    // Mark attendance
    const payload = {
      roll_number: currentStudent.roll_number,
      status: status,
      match_score: parseFloat((1 - distance).toFixed(4)),
      latitude: geolocation.lat,
      longitude: geolocation.lng,
    };

    const res = await fetch("api/mark_attendance.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();

    if (result.success) {
      showAlert("att-alert", result.message, isMatch ? "success" : "error");
      loadTodayRecords();
      stopCamera();
    } else {
      showAlert("att-alert", result.message, "warn");
    }
  } catch (e) {
    showAlert("att-alert", "Error during verification: " + e.message, "error");
  }

  verificationInProgress = false;
  btn.disabled = false;
  btn.textContent = "📸 Capture & Verify";
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  document.getElementById("dash-load").classList.add("active");
  try {
    const res = await fetch("api/dashboard.php");
    const data = await res.json();
    if (!data.success) return;

    document.getElementById("dash-date").textContent = "Date: " + data.date;
    document.getElementById("stat-total").textContent = data.total_students;
    document.getElementById("stat-present").textContent = data.today.present;
    document.getElementById("stat-rejected").textContent = data.today.rejected;
    document.getElementById("stat-absent").textContent = data.today.absent;

    // Today table
    const tbody = document.getElementById("dash-tbody");
    const att = data.recent_attendance.filter((a) => a.date === data.date);
    if (!att.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:2rem">No attendance today</td></tr>';
    } else {
      tbody.innerHTML = att
        .map(
          (a) => `
        <tr>
          <td class="text-accent">${a.roll_number}</td>
          <td>${a.name}</td>
          <td class="text-muted">${a.department}</td>
          <td><span class="badge badge-${a.status.toLowerCase()}">${a.status}</span></td>
          <td class="text-muted">${a.time}</td>
        </tr>`,
        )
        .join("");
    }

    // Low attendance
    const lowList = document.getElementById("low-att-list");
    const low = data.student_stats.filter(
      (s) => s.total_days > 0 && parseFloat(s.percentage) < 75,
    );
    if (!low.length) {
      lowList.innerHTML =
        '<p class="text-muted" style="font-size:0.85rem">🎉 All students above 75% threshold</p>';
    } else {
      lowList.innerHTML = low
        .map(
          (s) => `
        <div class="ai-item warn" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div>
            <span style="font-weight:600">${s.name}</span>
            <span class="text-muted" style="font-size:0.78rem"> · ${s.roll_number}</span>
          </div>
          <span class="badge badge-low">${s.percentage}%</span>
        </div>`,
        )
        .join("");
    }

    // Trend chart
    renderTrendChart(data.trend);
  } catch (e) {
    console.error(e);
  }
  document.getElementById("dash-load").classList.remove("active");
}

function renderTrendChart(trend) {
  const chart = document.getElementById("trend-chart");
  if (!trend || !trend.length) {
    chart.innerHTML =
      '<p class="text-muted" style="font-size:0.8rem">No trend data yet</p>';
    return;
  }
  const maxVal = Math.max(
    ...trend.map((d) => parseInt(d.present) + parseInt(d.rejected)),
    1,
  );
  chart.innerHTML = trend
    .map((d) => {
      const total = parseInt(d.present) + parseInt(d.rejected);
      const pH = Math.round((parseInt(d.present) / maxVal) * 55);
      const rH = Math.round((parseInt(d.rejected) / maxVal) * 55);
      const dateStr = d.date.slice(5);
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
      <div class="bar-group" style="height:55px">
        <div class="bar" style="background:var(--accent);height:${pH}px" title="Present: ${d.present}"></div>
        <div class="bar" style="background:var(--danger);height:${rH}px" title="Rejected: ${d.rejected}"></div>
      </div>
      <span style="font-size:0.65rem;color:var(--muted)">${dateStr}</span>
    </div>`;
    })
    .join("");
}

// ============================================================
// TODAY'S RECORDS (ATTENDANCE PAGE)
// ============================================================
async function loadTodayRecords() {
  document.getElementById("att-load").classList.add("active");
  try {
    const res = await fetch("api/dashboard.php");
    const data = await res.json();
    const tbody = document.getElementById("att-tbody");
    const today = data.recent_attendance;
    if (!today.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:2rem">No records today</td></tr>';
    } else {
      tbody.innerHTML = today
        .map(
          (a) => `
        <tr>
          <td class="text-accent">${a.roll_number}</td>
          <td>${a.name}</td>
          <td><span class="badge badge-${a.status.toLowerCase()}">${a.status}</span></td>
          <td class="text-muted">${a.time}</td>
          <td class="text-muted" style="font-size:0.75rem">${a.latitude ? `${parseFloat(a.latitude).toFixed(4)},${parseFloat(a.longitude).toFixed(4)}` : "—"}</td>
        </tr>`,
        )
        .join("");
    }
  } catch (e) {}
  document.getElementById("att-load").classList.remove("active");
}


// ================= AI ANALYSIS =================
async function runAIAnalysis() {
  const btn = document.getElementById("ai-btn");

  btn.disabled = true;
  btn.textContent = "⏳ Analyzing...";

  document.getElementById("ai-load").classList.add("active");
  document.getElementById("ai-results").style.display = "none";

  showAlert("ai-alert", "🤖 AI is analyzing...", "info");

  try {
    const res = await fetch("api/ai_analysis.php", {
      method: "POST"
    });

    const data = await res.json();
    console.log("AI:", data);

    renderAIResults(data);

    showAlert("ai-alert", "✅ Done!", "success");

  } catch (e) {
    console.error(e);
    showAlert("ai-alert", "❌ Error: " + e.message, "error");
  }

  btn.disabled = false;
  btn.textContent = "🤖 Analyze Now";
  document.getElementById("ai-load").classList.remove("active");
}


// ================= RENDER =================
function renderAIResults(a) {
  document.getElementById("ai-results").style.display = "block";

  const low = a.low_attendance_students || [];
  const risks = a.risk_predictions || [];
  const suspicious = a.suspicious_activity || [];
  const recs = a.recommendations || [];

  document.getElementById("ai-summary").textContent =
    a.summary || "No summary";

  document.getElementById("ai-overall").textContent =
    a.overall_percentage || "—";

  // LOW
  document.getElementById("ai-low-att").innerHTML = low.length
    ? low.map(s => `<div>${s.name} (${s.percentage})</div>`).join("")
    : "No issues";

  // RISKS
  document.getElementById("ai-risks").innerHTML = risks.length
    ? risks.map(r => `<div>${r.name}: ${r.reason}</div>`).join("")
    : "No risks";

  // SUSPICIOUS
  document.getElementById("ai-suspicious").innerHTML = suspicious.length
    ? suspicious.map(s => `<div>${s.name}: ${s.pattern}</div>`).join("")
    : "None";

  // RECOMMENDATIONS
  document.getElementById("ai-recommendations").innerHTML = recs.length
    ? recs.map(r => `<div>${r.action}</div>`).join("")
    : "None";
}

// ============================================================
// INIT
// ============================================================
loadModels();
loadDashboard();

function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;

  el.className = "alert alert-" + type + " show";
  el.textContent = msg;
}

let regStream = null;

async function startRegisterCamera() {
  try {
    regStream = await navigator.mediaDevices.getUserMedia({ video: true });

    const video = document.getElementById("reg-video");
    video.srcObject = regStream;
    video.style.display = "block";

    document.getElementById("capture-btn").style.display = "inline-block";

  } catch (e) {
    alert("Camera error: " + e.message);
  }
}

function captureRegisterPhoto() {
  const video = document.getElementById("reg-video");

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);

  canvas.toBlob((blob) => {
    const file = new File([blob], "capture.jpg", { type: "image/jpeg" });

    const dt = new DataTransfer();
    dt.items.add(file);

    document.getElementById("reg-img").files = dt.files;

    const preview = document.getElementById("img-preview");
    preview.src = URL.createObjectURL(file);
    preview.classList.add("show");
  });

  if (regStream) {
    regStream.getTracks().forEach((t) => t.stop());
  }

  document.getElementById("reg-video").style.display = "none";
  document.getElementById("capture-btn").style.display = "none";
}