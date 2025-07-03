const express = require('express');
const { query } = require('../config/database');

const router = express.Router();

// Teacher Dashboard
router.get('/dashboard', async (req, res) => {
  try {
    // Get teacher info
    const teachers = await query(`
      SELECT t.*, c.name as class_name, c.level
      FROM teachers t
      JOIN classes c ON t.class_id = c.id
      WHERE t.user_id = ?
    `, [req.session.user.id]);

    if (teachers.length === 0) {
      return res.render('error', {
        title: 'Error',
        error: 'Teacher record not found',
        statusCode: 404
      });
    }

    const teacher = teachers[0];
    const subjectIds = JSON.parse(teacher.subject_ids || '[]');

    // Get subjects
    let subjects = [];
    if (subjectIds.length > 0) {
      const placeholders = subjectIds.map(() => '?').join(',');
      subjects = await query(`SELECT * FROM subjects WHERE id IN (${placeholders})`, subjectIds);
    }

    // Get students in class
    const students = await query(`
      SELECT u.full_name, u.email, s.created_at
      FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE s.class_id = ?
      ORDER BY u.full_name
    `, [teacher.class_id]);

    // Get assignments for teacher's subjects
    let assignments = [];
    if (subjectIds.length > 0) {
      const placeholders = subjectIds.map(() => '?').join(',');
      assignments = await query(`
        SELECT a.*, s.name as subject_name,
          COUNT(DISTINCT sub.id) as submission_count
        FROM assignments a
        JOIN subjects s ON a.subject_id = s.id
        LEFT JOIN submissions sub ON a.id = sub.assignment_id
        WHERE a.subject_id IN (${placeholders})
        GROUP BY a.id
        ORDER BY a.created_at DESC
        LIMIT 5
      `, subjectIds);
    }

    res.render('teacher/dashboard', {
      title: 'Teacher Dashboard',
      teacher,
      subjects,
      students,
      assignments
    });
  } catch (error) {
    console.error('Teacher dashboard error:', error);
    res.render('error', {
      title: 'Error',
      error: 'Failed to load dashboard',
      statusCode: 500
    });
  }
});

// View Students
router.get('/students', async (req, res) => {
  try {
    // Get teacher's class
    const teachers = await query(`
      SELECT t.class_id, c.name as class_name
      FROM teachers t
      JOIN classes c ON t.class_id = c.id
      WHERE t.user_id = ?
    `, [req.session.user.id]);

    if (teachers.length === 0) {
      return res.render('error', {
        title: 'Error',
        error: 'Teacher record not found',
        statusCode: 404
      });
    }

    const teacher = teachers[0];

    // Get students with their submission stats
    const students = await query(`
      SELECT u.*, s.id as student_id, s.created_at as enrolled_at,
        COUNT(DISTINCT sub.id) as total_submissions,
        COALESCE(AVG(CASE WHEN sub.max_score > 0 THEN (sub.total_score * 100.0 / sub.max_score) ELSE 0 END), 0) as avg_score
      FROM students s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN submissions sub ON s.id = sub.student_id
      WHERE s.class_id = ?
      GROUP BY s.id, u.id
      ORDER BY u.full_name
    `, [teacher.class_id]);

    res.render('teacher/students', {
      title: 'Students',
      students,
      className: teacher.class_name
    });
  } catch (error) {
    console.error('Students page error:', error);
    res.render('error', {
      title: 'Error',
      error: 'Failed to load students',
      statusCode: 500
    });
  }
});

// View Student Details
router.get('/students/:id', async (req, res) => {
  try {
    const studentId = req.params.id;

    // Get student info
    const students = await query(`
      SELECT u.*, s.id as student_id, c.name as class_name
      FROM students s
      JOIN users u ON s.user_id = u.id
      JOIN classes c ON s.class_id = c.id
      WHERE s.id = ?
    `, [studentId]);

    if (students.length === 0) {
      return res.render('error', {
        title: 'Error',
        error: 'Student not found',
        statusCode: 404
      });
    }

    const student = students[0];

    // Get student's submissions with assignment details
    const submissions = await query(`
      SELECT sub.*, a.title as assignment_title, s.name as subject_name
      FROM submissions sub
      JOIN assignments a ON sub.assignment_id = a.id
      JOIN subjects s ON a.subject_id = s.id
      WHERE sub.student_id = ?
      ORDER BY sub.submitted_at DESC
    `, [studentId]);

    // Get student's performance stats
    const stats = await query(`
      SELECT 
        COUNT(*) as total_submissions,
        COALESCE(AVG(CASE WHEN max_score > 0 THEN (total_score * 100.0 / max_score) ELSE 0 END), 0) as avg_percentage,
        COUNT(CASE WHEN total_score = max_score THEN 1 END) as perfect_scores,
        SUM(total_score) as total_points,
        SUM(max_score) as max_points
      FROM submissions 
      WHERE student_id = ?
    `, [studentId]);

    res.render('teacher/student-detail', {
      title: `${student.full_name} - Student Details`,
      student,
      submissions,
      stats: stats[0] || { total_submissions: 0, avg_percentage: 0, perfect_scores: 0, total_points: 0, max_points: 0 }
    });
  } catch (error) {
    console.error('Student detail error:', error);
    res.render('error', {
      title: 'Error',
      error: 'Failed to load student details',
      statusCode: 500
    });
  }
});

// View Assignments
router.get('/assignments', async (req, res) => {
  try {
    // Get teacher info
    const teachers = await query(`
      SELECT t.subject_ids, c.name as class_name
      FROM teachers t
      JOIN classes c ON t.class_id = c.id
      WHERE t.user_id = ?
    `, [req.session.user.id]);

    if (teachers.length === 0) {
      return res.render('error', {
        title: 'Error',
        error: 'Teacher record not found',
        statusCode: 404
      });
    }

    const teacher = teachers[0];
    const subjectIds = JSON.parse(teacher.subject_ids || '[]');

    let assignments = [];
    if (subjectIds.length > 0) {
      const placeholders = subjectIds.map(() => '?').join(',');
      assignments = await query(`
        SELECT a.*, s.name as subject_name,
          COUNT(DISTINCT q.id) as question_count,
          COUNT(DISTINCT sub.id) as submission_count,
          COALESCE(AVG(CASE WHEN sub.max_score > 0 THEN (sub.total_score * 100.0 / sub.max_score) ELSE 0 END), 0) as avg_score
        FROM assignments a
        JOIN subjects s ON a.subject_id = s.id
        LEFT JOIN questions q ON a.id = q.assignment_id
        LEFT JOIN submissions sub ON a.id = sub.assignment_id
        WHERE a.subject_id IN (${placeholders})
        GROUP BY a.id
        ORDER BY a.created_at DESC
      `, subjectIds);
    }

    res.render('teacher/assignments', {
      title: 'Assignments',
      assignments,
      className: teacher.class_name
    });
  } catch (error) {
    console.error('Assignments page error:', error);
    res.render('error', {
      title: 'Error',
      error: 'Failed to load assignments',
      statusCode: 500
    });
  }
});

// View Assignment Details
router.get('/assignments/:id', async (req, res) => {
  try {
    const assignmentId = req.params.id;

    // Get assignment details
    const assignments = await query(`
      SELECT a.*, s.name as subject_name, c.name as class_name
      FROM assignments a
      JOIN subjects s ON a.subject_id = s.id
      JOIN classes c ON a.class_id = c.id
      WHERE a.id = ?
    `, [assignmentId]);

    if (assignments.length === 0) {
      return res.render('error', {
        title: 'Error',
        error: 'Assignment not found',
        statusCode: 404
      });
    }

    const assignment = assignments[0];

    // Get questions
    const questions = await query(`
      SELECT * FROM questions 
      WHERE assignment_id = ? 
      ORDER BY question_order, id
    `, [assignmentId]);

    // Get submissions with student details and individual answers
    const submissions = await query(`
      SELECT sub.*, u.full_name as student_name, u.email as student_email
      FROM submissions sub
      JOIN students s ON sub.student_id = s.id
      JOIN users u ON s.user_id = u.id
      WHERE sub.assignment_id = ?
      ORDER BY sub.submitted_at DESC
    `, [assignmentId]);

    // Add detailed answers to each submission
    for (let submission of submissions) {
      const answers = JSON.parse(submission.answers);
      submission.detailed_answers = [];
      
      for (let question of questions) {
        const studentAnswer = answers[question.id];
        const isCorrect = studentAnswer === question.correct_option;
        
        submission.detailed_answers.push({
          question_text: question.question_text,
          student_answer: studentAnswer,
          correct_answer: question.correct_option,
          is_correct: isCorrect,
          marks: question.marks,
          obtained_marks: isCorrect ? question.marks : 0
        });
      }
    }

    res.render('teacher/assignment-detail', {
      title: assignment.title,
      assignment,
      questions,
      submissions
    });
  } catch (error) {
    console.error('Assignment detail error:', error);
    res.render('error', {
      title: 'Error',
      error: 'Failed to load assignment details',
      statusCode: 500
    });
  }
});

// View Individual Submission
router.get('/submissions/:id', async (req, res) => {
  try {
    const submissionId = req.params.id;

    // Get submission details
    const submissions = await query(`
      SELECT sub.*, a.title as assignment_title, s.name as subject_name,
             u.full_name as student_name, u.email as student_email
      FROM submissions sub
      JOIN assignments a ON sub.assignment_id = a.id
      JOIN subjects s ON a.subject_id = s.id
      JOIN students st ON sub.student_id = st.id
      JOIN users u ON st.user_id = u.id
      WHERE sub.id = ?
    `, [submissionId]);

    if (submissions.length === 0) {
      return res.render('error', {
        title: 'Error',
        error: 'Submission not found',
        statusCode: 404
      });
    }

    const submission = submissions[0];
    const answers = JSON.parse(submission.answers);

    // Get questions with student answers
    const questions = await query(`
      SELECT q.*, m.obtained_marks
      FROM questions q
      LEFT JOIN marks m ON q.id = m.question_id AND m.submission_id = ?
      WHERE q.assignment_id = ?
      ORDER BY q.question_order, q.id
    `, [submissionId, submission.assignment_id]);

    // Add student answers to questions
    questions.forEach(question => {
      question.student_answer = answers[question.id];
      question.is_correct = question.student_answer === question.correct_option;
    });

    res.render('teacher/submission-detail', {
      title: `${submission.student_name} - ${submission.assignment_title}`,
      submission,
      questions
    });
  } catch (error) {
    console.error('Submission detail error:', error);
    res.render('error', {
      title: 'Error',
      error: 'Failed to load submission details',
      statusCode: 500
    });
  }
});

module.exports = router;