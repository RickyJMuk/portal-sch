const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');

const router = express.Router();

// Student Dashboard
router.get('/dashboard', async (req, res) => {
  try {
    // Get student info
    const students = await query(`
      SELECT s.*, c.name as class_name, c.level, u.full_name, u.email
      FROM students s
      JOIN classes c ON s.class_id = c.id
      JOIN users u ON s.user_id = u.id
      WHERE s.user_id = ?
    `, [req.session.user.id]);

    if (students.length === 0) {
      return res.render('error', {
        title: 'Error',
        error: 'Student record not found',
        statusCode: 404
      });
    }

    const student = students[0];

    // Get subjects for student's class
    const subjects = await query(`
      SELECT * FROM subjects WHERE class_id = ? ORDER BY name
    `, [student.class_id]);

    // Get recent submissions
    const recentSubmissions = await query(`
      SELECT sub.*, a.title as assignment_title, s.name as subject_name
      FROM submissions sub
      JOIN assignments a ON sub.assignment_id = a.id
      JOIN subjects s ON a.subject_id = s.id
      WHERE sub.student_id = ?
      ORDER BY sub.submitted_at DESC
      LIMIT 5
    `, [student.id]);

    // Get stats
    const stats = await query(`
      SELECT 
        COUNT(*) as total_submissions,
        COALESCE(AVG(CASE WHEN max_score > 0 THEN (total_score * 100.0 / max_score) ELSE 0 END), 0) as avg_score,
        COUNT(CASE WHEN total_score = max_score THEN 1 END) as perfect_scores
      FROM submissions 
      WHERE student_id = ?
    `, [student.id]);

    res.render('student/dashboard', {
      title: 'Student Dashboard',
      student,
      subjects,
      recentSubmissions,
      stats: stats[0] || { total_submissions: 0, avg_score: 0, perfect_scores: 0 }
    });
  } catch (error) {
    console.error('Student dashboard error:', error);
    res.render('error', {
      title: 'Error',
      error: 'Failed to load dashboard',
      statusCode: 500
    });
  }
});

// View Subjects
router.get('/subjects', async (req, res) => {
  try {
    // Get student's class
    const students = await query(`
      SELECT s.class_id, c.name as class_name, c.level
      FROM students s
      JOIN classes c ON s.class_id = c.id
      WHERE s.user_id = ?
    `, [req.session.user.id]);

    if (students.length === 0) {
      return res.render('error', {
        title: 'Error',
        error: 'Student record not found',
        statusCode: 404
      });
    }

    const student = students[0];

    // Get subjects with assignment counts
    const subjects = await query(`
      SELECT s.*, 
        COUNT(DISTINCT a.id) as assignment_count,
        COUNT(DISTINCT sub.id) as completed_count
      FROM subjects s
      LEFT JOIN assignments a ON s.id = a.subject_id
      LEFT JOIN submissions sub ON a.id = sub.assignment_id AND sub.student_id = (
        SELECT id FROM students WHERE user_id = ?
      )
      WHERE s.class_id = ?
      GROUP BY s.id
      ORDER BY s.name
    `, [req.session.user.id, student.class_id]);

    res.render('student/subjects', {
      title: 'Subjects',
      subjects,
      student
    });
  } catch (error) {
    console.error('Subjects page error:', error);
    res.render('error', {
      title: 'Error',
      error: 'Failed to load subjects',
      statusCode: 500
    });
  }
});

// View Assignments for Subject
router.get('/subjects/:id/assignments', async (req, res) => {
  try {
    const subjectId = req.params.id;

    // Get subject info
    const subjects = await query(`
      SELECT s.*, c.name as class_name
      FROM subjects s
      JOIN classes c ON s.class_id = c.id
      WHERE s.id = ?
    `, [subjectId]);

    if (subjects.length === 0) {
      return res.render('error', {
        title: 'Error',
        error: 'Subject not found',
        statusCode: 404
      });
    }

    const subject = subjects[0];

    // Get student info
    const students = await query(`
      SELECT * FROM students WHERE user_id = ?
    `, [req.session.user.id]);

    const student = students[0];

    // Get assignments with submission status
    const assignments = await query(`
      SELECT a.*, sub.id as submission_id, sub.total_score, sub.max_score, sub.submitted_at
      FROM assignments a
      LEFT JOIN submissions sub ON a.id = sub.assignment_id AND sub.student_id = ?
      WHERE a.subject_id = ?
      ORDER BY a.created_at DESC
    `, [student.id, subjectId]);

    res.render('student/assignments', {
      title: `${subject.name} - Assignments`,
      subject,
      assignments
    });
  } catch (error) {
    console.error('Subject assignments error:', error);
    res.render('error', {
      title: 'Error',
      error: 'Failed to load assignments',
      statusCode: 500
    });
  }
});

// Take Assignment
router.get('/assignments/:id/take', async (req, res) => {
  try {
    const assignmentId = req.params.id;

    // Get student info
    const students = await query(`
      SELECT * FROM students WHERE user_id = ?
    `, [req.session.user.id]);

    const student = students[0];

    // Check if already submitted
    const existingSubmissions = await query(`
      SELECT * FROM submissions WHERE student_id = ? AND assignment_id = ?
    `, [student.id, assignmentId]);

    if (existingSubmissions.length > 0) {
      return res.redirect(`/student/submissions/${existingSubmissions[0].id}/feedback`);
    }

    // Get assignment details
    const assignments = await query(`
      SELECT a.*, s.name as subject_name
      FROM assignments a
      JOIN subjects s ON a.subject_id = s.id
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

    // Check deadline
    if (assignment.deadline && new Date() > new Date(assignment.deadline)) {
      return res.render('error', {
        title: 'Assignment Expired',
        error: 'This assignment deadline has passed',
        statusCode: 403
      });
    }

    // Get questions
    const questions = await query(`
      SELECT * FROM questions 
      WHERE assignment_id = ? 
      ORDER BY question_order, id
    `, [assignmentId]);

    res.render('student/take-assignment', {
      title: `Take ${assignment.title}`,
      assignment,
      questions
    });
  } catch (error) {
    console.error('Take assignment error:', error);
    res.render('error', {
      title: 'Error',
      error: 'Failed to load assignment',
      statusCode: 500
    });
  }
});

// Submit Assignment
router.post('/assignments/:id/submit', async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const answers = req.body;

    // Get student info
    const students = await query(`
      SELECT * FROM students WHERE user_id = ?
    `, [req.session.user.id]);

    const student = students[0];

    // Check if already submitted
    const existingSubmissions = await query(`
      SELECT * FROM submissions WHERE student_id = ? AND assignment_id = ?
    `, [student.id, assignmentId]);

    if (existingSubmissions.length > 0) {
      return res.redirect(`/student/submissions/${existingSubmissions[0].id}/feedback`);
    }

    // Get questions
    const questions = await query(`
      SELECT * FROM questions WHERE assignment_id = ?
    `, [assignmentId]);

    // Calculate score with auto-grading
    let totalScore = 0;
    let maxScore = 0;
    const questionScores = {};

    for (const question of questions) {
      maxScore += question.marks;
      const studentAnswer = answers[question.id];
      
      // Auto-grading: Check if student answer matches correct option
      const isCorrect = studentAnswer === question.correct_option;
      const score = isCorrect ? question.marks : 0;
      
      totalScore += score;
      questionScores[question.id] = score;
    }

    // Create submission
    const submissionId = uuidv4();
    await query(`
      INSERT INTO submissions (id, student_id, assignment_id, answers, total_score, max_score, is_marked)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [submissionId, student.id, assignmentId, JSON.stringify(answers), totalScore, maxScore, true]);

    // Create marks records for each question
    for (const question of questions) {
      await query(`
        INSERT INTO marks (id, submission_id, question_id, obtained_marks)
        VALUES (?, ?, ?, ?)
      `, [uuidv4(), submissionId, question.id, questionScores[question.id]]);
    }

    res.redirect(`/student/submissions/${submissionId}/feedback`);
  } catch (error) {
    console.error('Submit assignment error:', error);
    res.render('error', {
      title: 'Error',
      error: 'Failed to submit assignment',
      statusCode: 500
    });
  }
});

// View Submission Feedback
router.get('/submissions/:id/feedback', async (req, res) => {
  try {
    const submissionId = req.params.id;

    // Get submission details
    const submissions = await query(`
      SELECT sub.*, a.title as assignment_title, s.name as subject_name
      FROM submissions sub
      JOIN assignments a ON sub.assignment_id = a.id
      JOIN subjects s ON a.subject_id = s.id
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

    // Get questions with student answers and marks
    const questions = await query(`
      SELECT q.*, m.obtained_marks
      FROM questions q
      LEFT JOIN marks m ON q.id = m.question_id AND m.submission_id = ?
      WHERE q.assignment_id = ?
      ORDER BY q.question_order, q.id
    `, [submissionId, submission.assignment_id]);

    // Add student answers and correctness to questions
    questions.forEach(question => {
      question.student_answer = answers[question.id];
      question.is_correct = question.student_answer === question.correct_option;
    });

    res.render('student/feedback', {
      title: 'Assignment Results',
      submission,
      questions
    });
  } catch (error) {
    console.error('Feedback error:', error);
    res.render('error', {
      title: 'Error',
      error: 'Failed to load feedback',
      statusCode: 500
    });
  }
});

module.exports = router;