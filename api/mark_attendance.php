<?php
require_once '../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$location_name = $data['location_name'] ?? '';

$roll_number = trim($data['roll_number'] ?? '');
$status = $data['status'] ?? '';
$match_score = $data['match_score'] ?? null;
$latitude = $data['latitude'] ?? null;
$longitude = $data['longitude'] ?? null;

if (empty($roll_number) || !in_array($status, ['Present', 'Rejected'])) {
    echo json_encode(['success' => false, 'message' => 'Invalid data']);
    exit;
}

$conn = getDB();

// Verify student exists (use DB value for name, not user input)
$stmt = $conn->prepare("SELECT name FROM students WHERE roll_number = ?");
$stmt->bind_param("s", $roll_number);
$stmt->execute();
$res = $stmt->get_result();
if ($res->num_rows === 0) {
    echo json_encode(['success' => false, 'message' => 'Student not found']);
    $conn->close();
    exit;
}
$student = $res->fetch_assoc();
$stmt->close();

$today = date('Y-m-d');
$now = date('H:i:s');

// Check duplicate attendance today
$stmt2 = $conn->prepare("SELECT id, status FROM attendance WHERE roll_number = ? AND date = ?");
$stmt2->bind_param("ss", $roll_number, $today);
$stmt2->execute();
$existing = $stmt2->get_result();
if ($existing->num_rows > 0) {
    $rec = $existing->fetch_assoc();
    echo json_encode(['success' => false, 'message' => "Attendance already marked as '{$rec['status']}' today."]);
    $stmt2->close();
    $conn->close();
    exit;
}
$stmt2->close();

// Insert attendance
$stmt3 = $conn->prepare(
    "INSERT INTO attendance (roll_number, name, status, date, time, latitude, longitude, match_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);
$stmt3->bind_param("sssssddd", $roll_number, $student['name'], $status, $today, $now, $latitude, $longitude, $match_score);

if ($stmt3->execute()) {
    $msg = $status === 'Present'
        ? "✅ Attendance marked PRESENT for {$student['name']}"
        : "❌ Face mismatch. Attendance marked REJECTED for {$student['name']}";
    echo json_encode(['success' => true, 'message' => $msg, 'status' => $status, 'name' => $student['name']]);
} else {
    echo json_encode(['success' => false, 'message' => 'DB error: ' . $conn->error]);
}

$stmt3->close();
$conn->close();
