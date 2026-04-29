<?php
require_once '../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$name = trim($_POST['name'] ?? '');
$roll_number = trim($_POST['roll_number'] ?? '');
$department = trim($_POST['department'] ?? '');

// Validation
if (empty($name) || empty($roll_number) || empty($department)) {
    echo json_encode(['success' => false, 'message' => 'All fields are required']);
    exit;
}

if (!preg_match('/^[A-Z0-9a-z\-\_]+$/', $roll_number)) {
    echo json_encode(['success' => false, 'message' => 'Invalid roll number format']);
    exit;
}

if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(['success' => false, 'message' => 'Image upload failed or missing']);
    exit;
}

// Validate image
$allowed = ['image/jpeg', 'image/png', 'image/webp'];
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $_FILES['image']['tmp_name']);
finfo_close($finfo);

if (!in_array($mime, $allowed)) {
    echo json_encode(['success' => false, 'message' => 'Only JPG, PNG, WebP images allowed']);
    exit;
}

if ($_FILES['image']['size'] > 5 * 1024 * 1024) {
    echo json_encode(['success' => false, 'message' => 'Image must be under 5MB']);
    exit;
}

$conn = getDB();

// Check duplicate roll number
$stmt = $conn->prepare("SELECT id FROM students WHERE roll_number = ?");
$stmt->bind_param("s", $roll_number);
$stmt->execute();
if ($stmt->get_result()->num_rows > 0) {
    echo json_encode(['success' => false, 'message' => 'Roll number already registered']);
    $conn->close();
    exit;
}
$stmt->close();

// Save image
$ext = pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION) ?: 'jpg';
$filename = 'student_' . preg_replace('/[^a-z0-9]/i', '_', $roll_number) . '_' . time() . '.' . $ext;
$uploadDir = '../uploads/';
if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
$imagePath = $uploadDir . $filename;

if (!move_uploaded_file($_FILES['image']['tmp_name'], $imagePath)) {
    echo json_encode(['success' => false, 'message' => 'Failed to save image']);
    $conn->close();
    exit;
}

// Insert student
$stmt = $conn->prepare("INSERT INTO students (roll_number, name, department, image_path) VALUES (?, ?, ?, ?)");
$dbPath = 'uploads/' . $filename;
$stmt->bind_param("ssss", $roll_number, $name, $department, $dbPath);

if ($stmt->execute()) {
    echo json_encode(['success' => true, 'message' => "Student '$name' registered successfully!", 'roll_number' => $roll_number]);
} else {
    unlink($imagePath);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $conn->error]);
}

$stmt->close();
$conn->close();
