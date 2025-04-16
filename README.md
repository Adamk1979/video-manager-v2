
- 📦 Full project description  
- 🔧 Installation instructions  
- 🧪 API usage  
- 🗄️ Full MySQL database setup  
- 📝 All wrapped in one single `bash` code block — perfect for GitHub

---


# Video Manager v2

A powerful Node.js-based backend tool for managing video file conversions and compression using FFmpeg.  
Ideal for developers or teams needing to automate video processing for web apps, dashboards, or upload systems.

---

## 🎯 Features

- Convert videos to multiple formats like `.webm`, `.mp4`, etc.  
- Compress large video files for optimized storage  
- Remove audio from videos  
- Track progress, status, and output file info in a database  
- Includes Postman collection for API testing  
- Easily extensible and ready for automation or frontend integration

---

## 🌐 Live Demo

No live version provided. Run locally using the guide below.

---

## 🛠️ Requirements

- Node.js (v14 or higher)  
- Yarn or npm  
- FFmpeg installed and added to system path  
- MySQL database server

---

## 📦 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Adamk1979/video-manager-v2.git
cd video-manager-v2
```

### 2. Install Dependencies

```bash
yarn install
# or
npm install
```

### 3. Environment Variables

Create a `.env` file in the root with the following:

```bash
PORT=5000

# MySQL
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=video_conversion
```

---

## 🗄️ Database Setup (MySQL)

Run the SQL below to create the necessary database and table:

```bash
-- Create the database
CREATE DATABASE IF NOT EXISTS video_conversion;

-- Use the database
USE video_conversion;

-- Create conversions table
CREATE TABLE IF NOT EXISTS conversions (
    id VARCHAR(36) PRIMARY KEY,
    original_file_name VARCHAR(255),
    original_file_size BIGINT,
    conversion_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    expires_at DATETIME NOT NULL,
    options TEXT,
    progress FLOAT DEFAULT 0,
    converted_files JSON,
    compressed_file_name VARCHAR(255),
    compressed_file_size BIGINT,
    audio_removed BOOLEAN DEFAULT 0,
    audio_removed_file JSON,
    poster_file_name VARCHAR(255),
    poster_file_size BIGINT,
    error_message TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## ▶️ Running the App

Start the development server:

```bash
npm start
# or
yarn start
```

The backend will run by default at:

```bash
http://localhost:5000
```

---

## 🧪 API Testing

Import the included Postman collection:

```bash
Video Manager.postman_collection.json
```

Use it to test upload, compress, convert, and audio removal routes.

---

## 📁 Folder Structure

```bash
video-manager-v2/
├── src/
│   ├── controllers/         # Logic for API endpoints
│   ├── routes/              # Express routes
│   ├── utils/               # FFmpeg & helper functions
│   └── config/              # DB config
├── logs/                    # Conversion logs
├── .env                     # Environment variables
├── package.json             # Dependencies and scripts
├── Video Manager.postman_collection.json  # Postman API tester
```

---

## 📌 Future Ideas

- Add frontend upload dashboard  
- Dockerize for easier deployment  
- Email notifications on completion  
- Schedule periodic cleanup of expired files  
- Add user login system with roles (admin/user)

---

## 📝 License

MIT License — open to use and modify.

---

## 🤝 Contributing

Pull requests are welcome!  
For major changes, open an issue first to discuss what you’d like to improve.

---

## 👤 Author

Made with 🛠️ by [Adamk1979](https://github.com/Adamk1979)
```

---

Let me know if you want a second version with Docker setup, or this translated to Swedish 🇸🇪!
