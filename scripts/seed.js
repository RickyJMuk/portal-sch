const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const initDatabase = require('./init-db');

async function seedDatabase() {
  try {
    // Initialize database first
    await initDatabase();
    
    console.log('🌱 Seeding database with sample data...');

    // Clear existing data
    await query('SET FOREIGN_KEY_CHECKS = 0');
    const tables = ['marks', 'submissions', 'questions', 'assignments', 'teachers', 'students', 'subjects', 'classes', 'users'];
    for (const table of tables) {
      await query(`DELETE FROM ${table}`);
    }
    await query('SET FOREIGN_KEY_CHECKS = 1');

    // Create IDs
    const adminId = uuidv4();
    const teacher1Id = uuidv4();
    const teacher2Id = uuidv4();
    const student1Id = uuidv4();
    const student2Id = uuidv4();
    const student3Id = uuidv4();
    
    const classId = uuidv4();
    const mathSubjectId = uuidv4();
    const englishSubjectId = uuidv4();
    
    const teacherRecord1Id = uuidv4();
    const teacherRecord2Id = uuidv4();
    const studentRecord1Id = uuidv4();
    const studentRecord2Id = uuidv4();
    const studentRecord3Id = uuidv4();

    // Hash passwords
    const hashedPassword = await bcrypt.hash('password123', 10);

    // Insert users
    const users = [
      [adminId, 'Admin User', 'admin@school.edu', hashedPassword, 'admin', true],
      [teacher1Id, 'Sarah Johnson', 'sarah.johnson@school.edu', hashedPassword, 'teacher', true],
      [teacher2Id, 'Michael Brown', 'michael.brown@school.edu', hashedPassword, 'teacher', true],
      [student1Id, 'Emma Wilson', 'emma.wilson@school.edu', hashedPassword, 'student', true],
      [student2Id, 'Liam Davis', 'liam.davis@school.edu', hashedPassword, 'student', true],
      [student3Id, 'Olivia Garcia', 'olivia.garcia@school.edu', hashedPassword, 'student', true]
    ];

    for (const user of users) {
      await query('INSERT INTO users (id, full_name, email, password, role, is_whitelisted) VALUES (?, ?, ?, ?, ?, ?)', user);
    }

    // Insert class
    await query('INSERT INTO classes (id, name, level) VALUES (?, ?, ?)', [classId, 'Grade 3A', 'Grade 3']);

    // Insert subjects
    await query('INSERT INTO subjects (id, name, class_id) VALUES (?, ?, ?)', [mathSubjectId, 'Mathematics', classId]);
    await query('INSERT INTO subjects (id, name, class_id) VALUES (?, ?, ?)', [englishSubjectId, 'English', classId]);

    // Insert teachers
    await query('INSERT INTO teachers (id, user_id, class_id, subject_ids) VALUES (?, ?, ?, ?)', 
      [teacherRecord1Id, teacher1Id, classId, JSON.stringify([mathSubjectId])]);
    await query('INSERT INTO teachers (id, user_id, class_id, subject_ids) VALUES (?, ?, ?, ?)', 
      [teacherRecord2Id, teacher2Id, classId, JSON.stringify([englishSubjectId])]);

    // Insert students
    const studentRecords = [
      [studentRecord1Id, student1Id, classId],
      [studentRecord2Id, student2Id, classId],
      [studentRecord3Id, student3Id, classId]
    ];

    for (const student of studentRecords) {
      await query('INSERT INTO students (id, user_id, class_id) VALUES (?, ?, ?)', student);
    }

    // Create assignments with start dates and terms
    const mathAssignmentId = uuidv4();
    const englishAssignmentId = uuidv4();
    
    // Set start dates (one current, one future)
    const currentDate = new Date();
    const futureDate = new Date();
    futureDate.setDate(currentDate.getDate() + 7); // 7 days from now
    
    const assignments = [
      [mathAssignmentId, classId, mathSubjectId, 'Basic Addition and Subtraction', 'Practice your addition and subtraction skills with these fun questions!', 'mcq', 'Term 1', currentDate.toISOString().slice(0, 19).replace('T', ' '), '2024-12-31 23:59:59'],
      [englishAssignmentId, classId, englishSubjectId, 'Reading Comprehension', 'Answer questions about the story you read in class.', '2choice', 'Term 1', futureDate.toISOString().slice(0, 19).replace('T', ' '), '2024-12-31 23:59:59']
    ];

    for (const assignment of assignments) {
      await query('INSERT INTO assignments (id, class_id, subject_id, title, description, type, term, start_date, deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', assignment);
    }

    // Create math questions
    const mathQuestions = [
      [uuidv4(), mathAssignmentId, 'What is 5 + 3?', JSON.stringify(['6', '7', '8', '9']), '8', 1, 1],
      [uuidv4(), mathAssignmentId, 'What is 10 - 4?', JSON.stringify(['5', '6', '7', '8']), '6', 1, 2],
      [uuidv4(), mathAssignmentId, 'What is 2 + 7?', JSON.stringify(['8', '9', '10', '11']), '9', 1, 3],
      [uuidv4(), mathAssignmentId, 'What is 12 - 5?', JSON.stringify(['6', '7', '8', '9']), '7', 1, 4]
    ];

    for (const question of mathQuestions) {
      await query('INSERT INTO questions (id, assignment_id, question_text, options, correct_option, marks, question_order) VALUES (?, ?, ?, ?, ?, ?, ?)', question);
    }

    // Create english questions
    const englishQuestions = [
      [uuidv4(), englishAssignmentId, 'The cat in the story was:', JSON.stringify(['Happy', 'Sad']), 'Happy', 1, 1],
      [uuidv4(), englishAssignmentId, 'Where did the story take place?', JSON.stringify(['At home', 'At school']), 'At home', 1, 2],
      [uuidv4(), englishAssignmentId, 'What color was the ball?', JSON.stringify(['Red', 'Blue']), 'Red', 1, 3]
    ];

    for (const question of englishQuestions) {
      await query('INSERT INTO questions (id, assignment_id, question_text, options, correct_option, marks, question_order) VALUES (?, ?, ?, ?, ?, ?, ?)', question);
    }

    // Create sample submissions (only for the math assignment that has started)
    const submission1Id = uuidv4();
    const mathAnswers = {
      [mathQuestions[0][0]]: '8', // Correct
      [mathQuestions[1][0]]: '5', // Wrong
      [mathQuestions[2][0]]: '9', // Correct
      [mathQuestions[3][0]]: '8'  // Wrong
    };

    await query('INSERT INTO submissions (id, student_id, assignment_id, answers, total_score, max_score, is_marked) VALUES (?, ?, ?, ?, ?, ?, ?)', 
      [submission1Id, studentRecord1Id, mathAssignmentId, JSON.stringify(mathAnswers), 2, 4, true]);

    console.log('✅ Database seeded successfully!');
    console.log('\n🔑 Login Credentials:');
    console.log('Admin: admin@school.edu / password123');
    console.log('Teacher: sarah.johnson@school.edu / password123');
    console.log('Teacher: michael.brown@school.edu / password123');
    console.log('Student: emma.wilson@school.edu / password123');
    console.log('Student: liam.davis@school.edu / password123');
    console.log('Student: olivia.garcia@school.edu / password123');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;