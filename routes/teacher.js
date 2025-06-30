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
      SELECT u.*, s.created_at as enrolled_at,
        COUNT(DISTINCT sub.id) as total_submissions,
        COALESCE(AVG(sub.total_score), 0) as avg_score
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
          COALESCE(AVG(sub.total_score), 0) as avg_score
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

    // Get submissions
    const submissions = await query(`
      SELECT sub.*, u.full_name as student_name
      FROM submissions sub
      JOIN students s ON sub.student_id = s.id
      JOIN users u ON s.user_id = u.id
      WHERE sub.assignment_id = ?
      ORDER BY sub.submitted_at DESC
    `, [assignmentId]);

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

module.exports = router;