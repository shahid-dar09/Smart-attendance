<?php
require_once '../config.php';

$conn = getDB();

header('Content-Type: text/csv');
header('Content-Disposition: attachment; filename="attendance.csv"');

$output = fopen("php://output", "w");

// Header row
fputcsv($output, ['Roll Number', 'Name', 'Status', 'Date', 'Time']);

$result = $conn->query("
  SELECT roll_number, name, status, date, time 
  FROM attendance 
  ORDER BY date DESC, time DESC
");

while ($row = $result->fetch_assoc()) {
    fputcsv($output, $row);
}

fclose($output);
$conn->close();
exit;