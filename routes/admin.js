const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');

const router = express.Router();

// Admin Dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const totalUsers = await query('SELECT COUNT(*) as count FROM users');
    const totalClasses = await query('SELECT COUNT(*) as count FROM classes');
    const totalSubjects = await query('SELECT COUNT(*) as count FROM subjects');
    const totalAssignments = await query('SELECT COUNT(*) as count FROM assignments');

    const recentSubmissions = await query(`
      SELECT s.submitted_at, u.full_name as student_name, a.title as assignment_title, s.total_score, s.max_score
      FROM submissions s
      JOIN students st ON s.student_id = st.id
      JOIN users u ON st.user_id = u.id
      JOIN assignments a ON s.assignment_id = a.id
      ORDER BY s.submitted_at DESC
      LIMIT 5
    `);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats: {
        users: totalUsers[0].count,
        classes: totalClasses[0].count,
        subjects: totalSubjects[0].count,
        assignments: totalAssignments[0].count
      },
      recentSubmissions
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.render('error', {
      title: 'Error',
      error: 'Failed to load dashboard data',
      statusCode: 500
    });
  }
});

// Users Management
router.get('/users', async (req, res) => {
  try {
    const users = await query(`
      SELECT u.*, 
        CASE 
          WHEN u.role = 'student' THEN c.name
          WHEN u.role = 'teacher' THEN tc.name
          ELSE NULL
        END as class_name
      FROM users u
      LEFT JOIN students s ON u.id = s.user_id
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN teachers t ON u.id = t.user_id
      LEFT JOIN classes tc ON t.class_id = tc.id
      ORDER BY u.role, u.full_name
    `);

    const classes = await query('SELECT * FROM classes ORDER BY level, name');

    res.render('admin/users', {
      title: 'User Management',
      users,
      classes
    });
  } catch (error) {
    console.error('Users page error:', error);
    res.render('error', {
      title: 'Error',
      error: 'Failed to load users',
      statusCode: 500
    });
  }
});

// Create User
router.post('/users', async (req, res) => {
  try {
    const { full_name, email, password, role, class_id } = req.body;

    // Validate input
    if (!full_name || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if email already exists
    const existingUsers = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // Create user
    await query('INSERT INTO users (id, full_name, email, password, role, is_whitelisted) VALUES (?, ?, ?, ?, ?, ?)', 
      [userId, full_name, email, hashedPassword, role, true]);

    // Create role-specific record
    if (role === 'student' && class_id) {
      await query('INSERT INTO students (id, user_id, class_id) VALUES (?, ?, ?)', 
        [uuidv4(), userId, class_id]);
    } else if (role === 'teacher' && class_id) {
      await query('INSERT INTO teachers (id, user_id, class_id, subject_ids) VALUES (?, ?, ?, ?)', 
        [uuidv4(), userId, class_id, JSON.stringify([])]);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Classes Management
router.get('/classes', async (req, res) => {
  try {
    const classes = await query(`
      SELECT c.*, 
        COUNT(DISTINCT s.id) as student_count,
        COUNT(DISTINCT sub.id) as subject_count
      FROM classes c
      LEFT JOIN students s ON c.id = s.class_id
      LEFT JOIN subjects sub ON c.id = sub.class_id
      GROUP BY c.id
      ORDER BY c.level, c.name
    `);

    res.render('admin/classes', {
      title: 'Class Management',
      classes
    });
  } catch (error) {
    console.error('Classes page error:', error);
    res.render('error', {
      title: 'Error',
      error: 'Failed to load classes',
      statusCode: 500
    });
  }
});

// Create Class
router.post('/classes', async (req, res) => {
  try {
    const { name, level } = req.body;

    if (!name || !level) {
      return res.status(400).json({ error: 'Name and level are required' });
    }

    const classId = uuidv4();
    await query('INSERT INTO classes (id, name, level) VALUES (?, ?, ?)', [classId, name, level]);

    res.json({ success: true });
  } catch (error) {
    console.error('Create class error:', error);
    res.status(500).json({ error: 'Failed to create class' });
  }
});

// Assignments Management
router.get('/assignments', async (req, res) => {
  try {
    const assignments = await query(`
      SELECT a.*, c.name as class_name, s.name as subject_name,
        COUNT(DISTINCT q.id) as question_count,
        COUNT(DISTINCT sub.id) as submission_count
      FROM assignments a
      JOIN classes c ON a.class_id = c.id
      JOIN subjects s ON a.subject_id = s.id
      LEFT JOIN questions q ON a.id = q.assignment_id
      LEFT JOIN submissions sub ON a.id = sub.assignment_id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `);

    const classes = await query('SELECT * FROM classes ORDER BY level, name');

    res.render('admin/assignments', {
      title: 'Assignment Management',
      assignments,
      classes
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

// Get subjects for class (AJAX)
router.get('/classes/:classId/subjects', async (req, res) => {
  try {
    const subjects = await query('SELECT * FROM subjects WHERE class_id = ?', [req.params.classId]);
    res.json(subjects);
  } catch (error) {
    console.error('Get subjects error:', error);
    res.status(500).json({ error: 'Failed to load subjects' });
  }
});

module.exports = router;