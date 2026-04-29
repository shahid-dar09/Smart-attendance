<?php
require_once '../config.php';

$roll_number = trim($_GET['roll'] ?? '');

if (empty($roll_number)) {
    echo json_encode(['success' => false, 'message' => 'Roll number required']);
    exit;
}

$conn = getDB();
$stmt = $conn->prepare("SELECT roll_number, name, department, image_path FROM students WHERE roll_number = ?");
$stmt->bind_param("s", $roll_number);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    echo json_encode(['success' => false, 'message' => 'Student not found. Please register first.']);
    $stmt->close();
    $conn->close();
    exit;
}

$student = $result->fetch_assoc();
$stmt->close();

// Check if already marked today
$today = date('Y-m-d');
$stmt2 = $conn->prepare("SELECT status, time FROM attendance WHERE roll_number = ? AND date = ?");
$stmt2->bind_param("ss", $roll_number, $today);
$stmt2->execute();
$attResult = $stmt2->get_result();
$alreadyMarked = null;
if ($attResult->num_rows > 0) {
    $alreadyMarked = $attResult->fetch_assoc();
}
$stmt2->close();
$conn->close();

// Build absolute image URL
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'];
$baseDir = dirname(dirname($_SERVER['SCRIPT_NAME']));
$imageUrl = $protocol . '://' . $host . rtrim($baseDir, '/') . '/' . $student['image_path'];

echo json_encode([
    'success' => true,
    'student' => [
        'roll_number' => $student['roll_number'],
        'name' => $student['name'],
        'department' => $student['department'],
        'image_url' => $imageUrl,
    ],
    'already_marked' => $alreadyMarked
]);
