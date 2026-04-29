<?php
require_once '../config.php';

$conn = getDB();
$today = date('Y-m-d');

// Total students
$totalStudents = $conn->query("SELECT COUNT(*) as cnt FROM students")->fetch_assoc()['cnt'];

// Today stats
$todayStats = $conn->query("SELECT 
    COUNT(*) as total,
    SUM(status='Present') as present,
    SUM(status='Rejected') as rejected
    FROM attendance WHERE date='$today'")->fetch_assoc();

// Recent attendance (last 50)
$recentAtt = [];
$res = $conn->query("SELECT a.roll_number, a.name, s.department, a.status, a.date, a.time, a.latitude, a.longitude
    FROM attendance a 
    JOIN students s ON a.roll_number = s.roll_number
    ORDER BY a.date DESC, a.time DESC LIMIT 50");
while ($row = $res->fetch_assoc()) $recentAtt[] = $row;

// Per-student attendance percentage
$studentStats = [];
$res2 = $conn->query("SELECT s.roll_number, s.name, s.department,
    COUNT(a.id) as total_days,
    SUM(a.status='Present') as present_days,
    ROUND(SUM(a.status='Present') * 100.0 / NULLIF(COUNT(a.id), 0), 1) as percentage
    FROM students s
    LEFT JOIN attendance a ON s.roll_number = a.roll_number
    GROUP BY s.roll_number, s.name, s.department
    ORDER BY percentage ASC");
while ($row = $res2->fetch_assoc()) $studentStats[] = $row;

// Suspicious patterns: >2 rejections
$suspicious = [];
$res3 = $conn->query("SELECT roll_number, name, COUNT(*) as rejection_count 
    FROM attendance WHERE status='Rejected' 
    GROUP BY roll_number, name HAVING rejection_count >= 2 ORDER BY rejection_count DESC");
while ($row = $res3->fetch_assoc()) $suspicious[] = $row;

// Attendance trend last 7 days
$trend = [];
$res4 = $conn->query("SELECT date, 
    SUM(status='Present') as present, 
    SUM(status='Rejected') as rejected 
    FROM attendance 
    WHERE date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    GROUP BY date ORDER BY date ASC");
while ($row = $res4->fetch_assoc()) $trend[] = $row;

$conn->close();

echo json_encode([
    'success' => true,
    'total_students' => (int)$totalStudents,
    'today' => [
        'present' => (int)($todayStats['present'] ?? 0),
        'rejected' => (int)($todayStats['rejected'] ?? 0),
        'total' => (int)($todayStats['total'] ?? 0),
        'absent' => (int)$totalStudents - (int)($todayStats['total'] ?? 0),
    ],
    'recent_attendance' => $recentAtt,
    'student_stats' => $studentStats,
    'suspicious' => $suspicious,
    'trend' => $trend,
    'date' => $today,
]);
