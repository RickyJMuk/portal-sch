const mysql = require('mysql2/promise');
require('dotenv').config();

async function initDatabase() {
  try {
    // Connect without specifying database first
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      charset: 'utf8mb4'
    });

    console.log('📋 Initializing database schema...');

    // Create database
    await connection.execute(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'school_portal'} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.execute(`USE ${process.env.DB_NAME || 'school_portal'}`);

    // Create tables
    const tables = [
      `CREATE TABLE IF NOT EXISTS users (
        id CHAR(36) PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role ENUM('admin', 'teacher', 'student') NOT NULL,
        is_whitelisted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS classes (
        id CHAR(36) PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        level ENUM('PP1', 'PP2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS subjects (
        id CHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        class_id CHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS students (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        class_id CHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS teachers (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS teacher_classes (
        id CHAR(36) PRIMARY KEY,
        teacher_id CHAR(36) NOT NULL,
        class_id CHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
        UNIQUE KEY unique_teacher_class (teacher_id, class_id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS teacher_subjects (
        id CHAR(36) PRIMARY KEY,
        teacher_id CHAR(36) NOT NULL,
        subject_id CHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        UNIQUE KEY unique_teacher_subject (teacher_id, subject_id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS assignments (
        id CHAR(36) PRIMARY KEY,
        class_id CHAR(36) NOT NULL,
        subject_id CHAR(36) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        type ENUM('mcq', '2choice') NOT NULL,
        term ENUM('Term 1', 'Term 2', 'Term 3') NOT NULL,
        start_date DATETIME NOT NULL,
        deadline DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS questions (
        id CHAR(36) PRIMARY KEY,
        assignment_id CHAR(36) NOT NULL,
        question_text TEXT NOT NULL,
        options JSON NOT NULL,
        correct_option VARCHAR(255) NOT NULL,
        marks INT DEFAULT 1,
        question_order INT DEFAULT 0,
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS submissions (
        id CHAR(36) PRIMARY KEY,
        student_id CHAR(36) NOT NULL,
        assignment_id CHAR(36) NOT NULL,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        answers JSON NOT NULL,
        total_score INT DEFAULT 0,
        max_score INT DEFAULT 0,
        is_marked BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS marks (
        id CHAR(36) PRIMARY KEY,
        submission_id CHAR(36) NOT NULL,
        question_id CHAR(36) NOT NULL,
        obtained_marks INT DEFAULT 0,
        FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
      )`
    ];

    for (const table of tables) {
      await connection.execute(table);
    }

    console.log('✅ Database schema created successfully!');
    await connection.end();
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  initDatabase();
}

module.exports = initDatabase;