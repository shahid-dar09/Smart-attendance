<?php
require_once '../config.php';

// 🔑 PUT YOUR GEMINI API KEY HERE
$apiKey = "AIzaSyBMC3C_owuHlH4XW0kGDpXXtL9o-pq7muU";

// DB connection
$conn = getDB();
$today = date('Y-m-d');

// ================= FETCH DATA =================
$totalStudents = $conn->query("SELECT COUNT(*) as cnt FROM students")->fetch_assoc()['cnt'];

$todayStats = $conn->query("SELECT 
    COUNT(*) as total,
    SUM(status='Present') as present,
    SUM(status='Rejected') as rejected
    FROM attendance WHERE date='$today'")->fetch_assoc();

$studentStats = [];
$res = $conn->query("SELECT s.roll_number, s.name, s.department,
    COUNT(a.id) as total_days,
    SUM(a.status='Present') as present_days,
    ROUND(SUM(a.status='Present') * 100.0 / NULLIF(COUNT(a.id), 0), 1) as percentage
    FROM students s
    LEFT JOIN attendance a ON s.roll_number = a.roll_number
    GROUP BY s.roll_number, s.name, s.department");

while ($row = $res->fetch_assoc()) $studentStats[] = $row;

// Suspicious
$suspicious = [];
$res2 = $conn->query("SELECT roll_number, name, COUNT(*) as rejection_count 
    FROM attendance WHERE status='Rejected' 
    GROUP BY roll_number, name HAVING rejection_count >= 2");

while ($row = $res2->fetch_assoc()) $suspicious[] = $row;

// Trend
$trend = [];
$res3 = $conn->query("SELECT date, 
    SUM(status='Present') as present, 
    SUM(status='Rejected') as rejected 
    FROM attendance 
    WHERE date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    GROUP BY date ORDER BY date ASC");

while ($row = $res3->fetch_assoc()) $trend[] = $row;

$conn->close();

// ================= DATA =================
$attendanceData = [
    'total_students' => (int)$totalStudents,
    'today_present' => (int)($todayStats['present'] ?? 0),
    'today_absent' => (int)$totalStudents - (int)($todayStats['total'] ?? 0),
    'today_rejected' => (int)($todayStats['rejected'] ?? 0),
    'student_stats' => $studentStats,
    'suspicious_patterns' => $suspicious,
    'trend_7days' => $trend
];

// ================= PROMPT =================
$prompt = "Return ONLY valid JSON (no markdown).

{
  \"summary\": \"...\",
  \"overall_percentage\": \"...\",
  \"low_attendance_students\": [],
  \"risk_predictions\": [],
  \"suspicious_activity\": [],
  \"recommendations\": [],
  \"department_analysis\": []
}

DATA:
" . json_encode($attendanceData);

// ================= GEMINI =================
$url = "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=" . $apiKey;

$postData = json_encode([
    'contents' => [['parts' => [['text' => $prompt]]]],
    'generationConfig' => ['temperature' => 0.3]
]);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS => $postData
]);

$response = curl_exec($ch);
curl_close($ch);

$result = json_decode($response, true) ?: [];

// 🚨 HANDLE GEMINI ERROR (IMPORTANT)
if (isset($result['error'])) {
    echo json_encode([
        "summary" => "AI is busy (high demand). Showing latest insights.",
        "overall_percentage" => "—",
        "low_attendance_students" => [],
        "risk_predictions" => [],
        "suspicious_activity" => [],
        "recommendations" => [
            [
                "category" => "System",
                "action" => "AI service temporarily unavailable. Please try again in a few seconds."
            ]
        ],
        "department_analysis" => []
    ]);
    exit;
}

// ================= EXTRACT =================
$text = "";

// Try normal path
if (isset($result['candidates'][0]['content']['parts'][0]['text'])) {
    $text = $result['candidates'][0]['content']['parts'][0]['text'];
}

// Fallback: sometimes Gemini uses different structure
elseif (isset($result['candidates'][0]['content']['parts'])) {
    foreach ($result['candidates'][0]['content']['parts'] as $p) {
        if (isset($p['text'])) {
            $text .= $p['text'];
        }
    }
}

// If STILL empty → return debug
if (empty($text)) {
    echo json_encode([
        "summary" => "Empty AI response",
        "debug_full" => $result
    ]);
    exit;
}

// Clean markdown
$text = preg_replace('/```json|```/', '', $text);
$text = trim($text);

// Extract JSON safely
$decoded = json_decode($text, true);

if (!$decoded && preg_match('/\{[\s\S]*\}/', $text, $m)) {
    $decoded = json_decode($m[0], true);
}

// ================= FAIL SAFE =================
if (!$decoded) {
    echo json_encode([
        "summary" => "AI response failed",
        "overall_percentage" => "N/A",
        "low_attendance_students" => [],
        "risk_predictions" => [],
        "suspicious_activity" => [],
        "recommendations" => [],
        "department_analysis" => []
    ]);
    exit;
}

// ================= NORMALIZE =================

// Low attendance
foreach ($decoded['low_attendance_students'] ?? [] as &$s) {
    $s['roll'] = $s['roll'] ?? $s['roll_number'] ?? '';
    $s['dept'] = $s['dept'] ?? $s['department'] ?? '—';
    $s['percentage'] = $s['percentage'] ?? '0%';
}

// Risks
foreach ($decoded['risk_predictions'] ?? [] as &$r) {
    $r['name'] = $r['name'] ?? 'Unknown';
    $r['risk_level'] = $r['risk_level'] ?? 'Medium';
    $r['reason'] = $r['reason'] ?? $r['description'] ?? '';
}

// Suspicious
foreach ($decoded['suspicious_activity'] ?? [] as &$s) {
    $s['name'] = $s['name'] ?? 'Unknown';
    $s['pattern'] = $s['pattern'] ?? '';
}

// Recommendations
foreach ($decoded['recommendations'] ?? [] as &$r) {
    if (is_string($r)) {
        $r = ["category" => "General", "action" => $r];
    }
}

// Ensure keys
$decoded['low_attendance_students'] = $decoded['low_attendance_students'] ?? [];
$decoded['risk_predictions'] = $decoded['risk_predictions'] ?? [];
$decoded['suspicious_activity'] = $decoded['suspicious_activity'] ?? [];
$decoded['recommendations'] = $decoded['recommendations'] ?? [];
$decoded['department_analysis'] = $decoded['department_analysis'] ?? [];

echo json_encode($decoded);