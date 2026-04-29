-- Smart Attendance System - Database Schema
-- Run this file once to set up your database

CREATE DATABASE IF NOT EXISTS smart_attendance CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_attendance;

-- Students Table
CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    roll_number VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL,
    image_path VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    roll_number VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    status ENUM('Present', 'Rejected') NOT NULL,
    date DATE NOT NULL,
    time TIME NOT NULL,
    latitude DECIMAL(10, 8) DEFAULT NULL,
    longitude DECIMAL(11, 8) DEFAULT NULL,
    match_score DECIMAL(5, 4) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (roll_number) REFERENCES students(roll_number) ON DELETE CASCADE,
    UNIQUE KEY unique_attendance_per_day (roll_number, date)
);

-- Indexes for performance
CREATE INDEX idx_attendance_date ON attendance(date);
CREATE INDEX idx_attendance_roll ON attendance(roll_number);
CREATE INDEX idx_students_dept ON students(department);
