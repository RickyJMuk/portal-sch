const express = require('express');
const { query } = require('../config/database');

const router = express.Router();

// Teacher Dashboard
router.get('/dashboard', async (req, res) => {
  try {
    // Get teacher info with classes and subjects
    const teachers = await query(`
      SELECT t.id as teacher_id, u.full_name, u.email
      FROM teachers t
      JOIN users u ON t.user_id = u.id
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

    // Get teacher's classes
    const teacherClasses = await query(`
      SELECT c.id, c.name, c.level
      FROM teacher_classes tc
      JOIN classes c ON tc.class_id = c.id
      WHERE tc.teacher_id = ?
      ORDER BY c.level, c.name
    `, [teacher.teacher_id]);

    // Get teacher's subjects
    const teacherSubjects = await query(`
      SELECT s.id, s.name, c.name as class_name, c.level
      FROM teacher_subjects ts
      JOIN subjects s ON ts.subject_id = s.id
      JOIN classes c ON s.class_id = c.id
      WHERE ts.teacher_id = ?
      ORDER BY c.level, c.name, s.name
    `, [teacher.teacher_id]);

    // Get students from teacher's classes
    const students = await query(`
      SELECT DISTINCT u.full_name, u.email, s.created_at, c.name as class_name
      FROM students s
      JOIN users u ON s.user_id = u.id
      JOIN classes c ON s.class_id = c.id
      JOIN teacher_classes tc ON c.id = tc.class_id
      WHERE tc.teacher_id = ?
      ORDER BY c.name, u.full_name
    `, [teacher.teacher_id]);

    // Get assignments for teacher's subjects
    const assignments = await query(`
      SELECT a.*, s.name as subject_name, c.name as class_name,
        COUNT(DISTINCT sub.id) as submission_count
      FROM assignments a
      JOIN subjects s ON a.subject_id = s.id
      JOIN classes c ON a.class_id = c.id
      JOIN teacher_subjects ts ON s.id = ts.subject_id
      LEFT JOIN submissions sub ON a.id = sub.assignment_id
      WHERE ts.teacher_id = ?
      GROUP BY a.id
      ORDER BY a.created_at DESC
      LIMIT 5
    `, [teacher.teacher_id]);

    res.render('teacher/dashboard', {
      title: 'Teacher Dashboard',
      teacher: {
        ...teacher,
        classes: teacherClasses,
        subjects: teacherSubjects
      },
      subjects: teacherSubjects,
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
    // Get teacher info
    const teachers = await query(`
      SELECT t.id as teacher_id
      FROM teachers t
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

    // Get students from teacher's classes with their submission stats
    const students = await query(`
      SELECT u.*, s.id as student_id, s.created_at as enrolled_at, c.name as class_name,
        COUNT(DISTINCT sub.id) as total_submissions,
        COALESCE(AVG(CASE WHEN sub.max_score > 0 THEN (sub.total_score * 100.0 / sub.max_score) ELSE 0 END), 0) as avg_score
      FROM students s
      JOIN users u ON s.user_id = u.id
      JOIN classes c ON s.class_id = c.id
      JOIN teacher_classes tc ON c.id = tc.class_id
      LEFT JOIN submissions sub ON s.id = sub.student_id
      LEFT JOIN assignments a ON sub.assignment_id = a.id
      LEFT JOIN teacher_subjects ts ON a.subject_id = ts.subject_id AND ts.teacher_id = tc.teacher_id
      WHERE tc.teacher_id = ?
      GROUP BY s.id, u.id, c.id
      ORDER BY c.name, u.full_name
    `, [teacher.teacher_id]);

    // Get assignments for teacher's subjects
    const assignments = await query(`
      SELECT a.*, s.name as subject_name, c.name as class_name,
        COUNT(DISTINCT q.id) as question_count,
        COUNT(DISTINCT sub.id) as submission_count,
        COALESCE(AVG(CASE WHEN sub.max_score > 0 THEN (sub.total_score * 100.0 / sub.max_score) ELSE 0 END), 0) as avg_score
      FROM assignments a
      JOIN subjects s ON a.subject_id = s.id
      JOIN classes c ON a.class_id = c.id
      JOIN teacher_subjects ts ON s.id = ts.subject_id
      LEFT JOIN questions q ON a.id = q.assignment_id
      LEFT JOIN submissions sub ON a.id = sub.assignment_id
      WHERE ts.teacher_id = ?
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `, [teacher.teacher_id]);

    res.render('teacher/students', {
      title: 'Students',
      students,
      assignments
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

    // Get teacher info
    const teachers = await query(`
      SELECT t.id as teacher_id
      FROM teachers t
      WHERE t.user_id = ?
    `, [req.session.user.id]);

    const teacher = teachers[0];

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

    // Get student's submissions for teacher's subjects only
    const submissions = await query(`
      SELECT sub.*, a.title as assignment_title, s.name as subject_name, c.name as class_name
      FROM submissions sub
      JOIN assignments a ON sub.assignment_id = a.id
      JOIN subjects s ON a.subject_id = s.id
      JOIN classes c ON a.class_id = c.id
      JOIN teacher_subjects ts ON s.id = ts.subject_id
      WHERE sub.student_id = ? AND ts.teacher_id = ?
      ORDER BY sub.submitted_at DESC
    `, [studentId, teacher.teacher_id]);

    // Get student's performance stats for teacher's subjects
    const stats = await query(`
      SELECT 
        COUNT(*) as total_submissions,
        COALESCE(AVG(CASE WHEN sub.max_score > 0 THEN (sub.total_score * 100.0 / sub.max_score) ELSE 0 END), 0) as avg_percentage,
        COUNT(CASE WHEN sub.total_score = sub.max_score THEN 1 END) as perfect_scores,
        SUM(sub.total_score) as total_points,
        SUM(sub.max_score) as max_points
      FROM submissions sub
      JOIN assignments a ON sub.assignment_id = a.id
      JOIN teacher_subjects ts ON a.subject_id = ts.subject_id
      WHERE sub.student_id = ? AND ts.teacher_id = ?
    `, [studentId, teacher.teacher_id]);

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
      SELECT t.id as teacher_id
      FROM teachers t
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

    // Get assignments for teacher's subjects
    const assignments = await query(`
      SELECT a.*, s.name as subject_name, c.name as class_name,
        COUNT(DISTINCT q.id) as question_count,
        COUNT(DISTINCT sub.id) as submission_count,
        COALESCE(AVG(CASE WHEN sub.max_score > 0 THEN (sub.total_score * 100.0 / sub.max_score) ELSE 0 END), 0) as avg_score
      FROM assignments a
      JOIN subjects s ON a.subject_id = s.id
      JOIN classes c ON a.class_id = c.id
      JOIN teacher_subjects ts ON s.id = ts.subject_id
      LEFT JOIN questions q ON a.id = q.assignment_id
      LEFT JOIN submissions sub ON a.id = sub.assignment_id
      WHERE ts.teacher_id = ?
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `, [teacher.teacher_id]);

    // Get class name for the view (if needed)
    let className = '';
    if (assignments.length > 0) {
      className = assignments[0].class_name || '';
    }
    res.render('teacher/assignments', {
      title: 'Assignments',
      assignments,
      className
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

    // Get teacher info
    const teachers = await query(`
      SELECT t.id as teacher_id
      FROM teachers t
      WHERE t.user_id = ?
    `, [req.session.user.id]);

    const teacher = teachers[0];

    // Get assignment details and verify teacher has access
    const assignments = await query(`
      SELECT a.*, s.name as subject_name, c.name as class_name
      FROM assignments a
      JOIN subjects s ON a.subject_id = s.id
      JOIN classes c ON a.class_id = c.id
      JOIN teacher_subjects ts ON s.id = ts.subject_id
      WHERE a.id = ? AND ts.teacher_id = ?
    `, [assignmentId, teacher.teacher_id]);

    if (assignments.length === 0) {
      return res.render('error', {
        title: 'Error',
        error: 'Assignment not found or access denied',
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
      SELECT sub.*, u.full_name as student_name, u.email as student_email, c.name as class_name
      FROM submissions sub
      JOIN students s ON sub.student_id = s.id
      JOIN users u ON s.user_id = u.id
      JOIN classes c ON s.class_id = c.id
      WHERE sub.assignment_id = ?
      ORDER BY c.name, u.full_name
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
          obtained_marks: isCorrect ? question.marks : 0,
          options: JSON.parse(question.options)
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

    // Get teacher info
    const teachers = await query(`
      SELECT t.id as teacher_id
      FROM teachers t
      WHERE t.user_id = ?
    `, [req.session.user.id]);

    const teacher = teachers[0];

    // Get submission details and verify teacher has access
    const submissions = await query(`
      SELECT sub.*, a.title as assignment_title, s.name as subject_name,
             u.full_name as student_name, u.email as student_email, c.name as class_name
      FROM submissions sub
      JOIN assignments a ON sub.assignment_id = a.id
      JOIN subjects s ON a.subject_id = s.id
      JOIN classes c ON a.class_id = c.id
      JOIN students st ON sub.student_id = st.id
      JOIN users u ON st.user_id = u.id
      JOIN teacher_subjects ts ON s.id = ts.subject_id
      WHERE sub.id = ? AND ts.teacher_id = ?
    `, [submissionId, teacher.teacher_id]);

    if (submissions.length === 0) {
      return res.render('error', {
        title: 'Error',
        error: 'Submission not found or access denied',
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
      question.options = JSON.parse(question.options);
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