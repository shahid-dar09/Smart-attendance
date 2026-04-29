# SmartAttend — AI-Powered Face Attendance System

A full-stack college attendance system with face recognition, AI analytics, and geo-tagging.

## Tech Stack
- **Frontend**: HTML5, CSS3, JavaScript, face-api.js
- **Backend**: PHP 7.4+
- **Database**: MySQL 5.7+
- **AI**: Gemini API+ face-api.js (TinyFaceDetector)

---

## Quick Setup (2 Steps)

### Step 1 — Database
```sql
-- In MySQL / phpMyAdmin, run setup.sql
-- OR run this command:
mysql -u root -p < setup.sql
```

### Step 2 — Deploy
Place the project folder in your web server root:
- **XAMPP**: `C:/xampp/htdocs/smart-attendance/`
- **WAMP**: `C:/wamp64/www/smart-attendance/`
- **Linux**: `/var/www/html/smart-attendance/`

Then open: `http://localhost/smart-attendance/`

---

## Configuration

Edit `config.php` to match your MySQL credentials:
```php
define('DB_HOST', 'localhost');
define('DB_USER', 'root');      // your MySQL user
define('DB_PASS', '');          // your MySQL password
define('DB_NAME', 'smart_attendance');
```

---

## File Structure
```
smart-attendance/
├── index.html          ← Main frontend (all pages)
├── config.php          ← Database config
├── setup.sql           ← Database schema (run once)
├── uploads/            ← Student face images (auto-created)
└── api/
    ├── register.php    ← Student registration
    ├── get_student.php ← Fetch student + check attendance
    ├── mark_attendance.php  ← Mark Present/Rejected
    ├── dashboard.php   ← Dashboard stats & trends
    └── ai_analysis.php ← Claude AI insights
```

---

## Features

### 1. Student Registration
- Name, Roll Number, Department, Face Photo
- Duplicate roll number prevention
- Image saved to `uploads/` folder

### 2. Face-Based Attendance
- Enter roll number → system fetches stored face
- Open webcam → capture live face
- face-api.js compares descriptors (Euclidean distance < 0.45)
- Status: **Present** (match) or **Rejected** (mismatch)
- One entry per student per day

### 3. Geo-Tagging
- Browser Geolocation API captures lat/lng
- Stored with each attendance record

### 4. AI Insights (requires Anthropic API key)
- Attendance percentage per student
- Low attendance alerts (<75%)
- Risk predictions
- Suspicious pattern detection
- Department-level analysis
- Action recommendations

### 5. Dashboard
- Live stats (total, present, rejected, absent)
- Today's attendance table
- 7-day trend chart
- Low attendance highlights

---

## Face Recognition Notes

- **Model**: TinyFaceDetector + FaceRecognitionNet (via @vladmandic CDN)
- **Threshold**: Euclidean distance < 0.45 (adjustable in `captureAndVerify()`)
- **Registration tip**: Use a clear, well-lit frontal face photo
- **Camera tip**: Ensure good lighting during attendance

---

## Security
- Roll number validated against database (not user input)
- Image MIME type validated server-side
- Duplicate attendance prevented via DB unique constraint
- File size limited to 5MB

---

## Hackathon Demo Flow
1. Open `http://localhost/smart-attendance/`
2. Go to **Register** → add 2-3 students with face photos
3. Go to **Attendance** → enter roll number → start camera → verify face
4. Go to **Dashboard** → see live stats
5. Go to **AI Insights** → paste Anthropic API key → click Analyze

---

## Requirements
- PHP 7.4+ with `mysqli`, `fileinfo`, `curl` extensions
- MySQL 5.7+ or MariaDB 10.3+
- Modern browser (Chrome/Firefox recommended for camera access)
- HTTPS or localhost for camera permissions
- Anthropic API key for AI insights module
