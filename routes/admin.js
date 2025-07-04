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
        GROUP_CONCAT(DISTINCT c.name) as class_names
      FROM users u
      LEFT JOIN students s ON u.id = s.user_id
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN teachers t ON u.id = t.user_id
      LEFT JOIN teacher_classes tc ON t.id = tc.teacher_id
      LEFT JOIN classes tc_class ON tc.class_id = tc_class.id
      GROUP BY u.id
      ORDER BY u.role, u.full_name
    `);

    const classes = await query('SELECT * FROM classes ORDER BY level, name');
    const subjects = await query(`
      SELECT s.*, c.name as class_name 
      FROM subjects s 
      JOIN classes c ON s.class_id = c.id 
      ORDER BY c.level, c.name, s.name
    `);

    res.render('admin/users', {
      title: 'User Management',
      users,
      classes,
      subjects
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
    const { full_name, email, password, role, class_ids, subject_ids } = req.body;

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
    if (role === 'student' && class_ids) {
      const studentId = uuidv4();
      await query('INSERT INTO students (id, user_id, class_id) VALUES (?, ?, ?)', 
        [studentId, userId, class_ids]);
    } else if (role === 'teacher') {
      const teacherId = uuidv4();
      await query('INSERT INTO teachers (id, user_id) VALUES (?, ?)', 
        [teacherId, userId]);

      // Add teacher-class relationships
      if (class_ids && Array.isArray(class_ids)) {
        for (const classId of class_ids) {
          await query('INSERT INTO teacher_classes (id, teacher_id, class_id) VALUES (?, ?, ?)', 
            [uuidv4(), teacherId, classId]);
        }
      }

      // Add teacher-subject relationships
      if (subject_ids && Array.isArray(subject_ids)) {
        for (const subjectId of subject_ids) {
          await query('INSERT INTO teacher_subjects (id, teacher_id, subject_id) VALUES (?, ?, ?)', 
            [uuidv4(), teacherId, subjectId]);
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Get User Details for Edit
router.get('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    // Get user basic info
    const users = await query('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];
    let userDetails = { ...user };

    if (user.role === 'student') {
      const students = await query('SELECT class_id FROM students WHERE user_id = ?', [userId]);
      userDetails.class_id = students.length > 0 ? students[0].class_id : null;
    } else if (user.role === 'teacher') {
      const teachers = await query('SELECT id FROM teachers WHERE user_id = ?', [userId]);
      if (teachers.length > 0) {
        const teacherId = teachers[0].id;
        
        // Get teacher classes
        const teacherClasses = await query('SELECT class_id FROM teacher_classes WHERE teacher_id = ?', [teacherId]);
        userDetails.class_ids = teacherClasses.map(tc => tc.class_id);
        
        // Get teacher subjects
        const teacherSubjects = await query('SELECT subject_id FROM teacher_subjects WHERE teacher_id = ?', [teacherId]);
        userDetails.subject_ids = teacherSubjects.map(ts => ts.subject_id);
      }
    }

    res.json(userDetails);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user details' });
  }
});

// Update User
router.put('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const { full_name, email, password, role, class_ids, subject_ids } = req.body;

    // Validate input
    if (!full_name || !email || !role) {
      return res.status(400).json({ error: 'Name, email, and role are required' });
    }

    // Check if email already exists for other users
    const existingUsers = await query('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Update user basic info
    let updateQuery = 'UPDATE users SET full_name = ?, email = ?, role = ? WHERE id = ?';
    let updateParams = [full_name, email, role, userId];

    // Update password if provided
    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery = 'UPDATE users SET full_name = ?, email = ?, password = ?, role = ? WHERE id = ?';
      updateParams = [full_name, email, hashedPassword, role, userId];
    }

    await query(updateQuery, updateParams);

    // Handle role-specific updates
    if (role === 'student') {
      // Remove teacher records if changing from teacher
      const teachers = await query('SELECT id FROM teachers WHERE user_id = ?', [userId]);
      if (teachers.length > 0) {
        const teacherId = teachers[0].id;
        await query('DELETE FROM teacher_classes WHERE teacher_id = ?', [teacherId]);
        await query('DELETE FROM teacher_subjects WHERE teacher_id = ?', [teacherId]);
        await query('DELETE FROM teachers WHERE id = ?', [teacherId]);
      }

      // Update or create student record
      const students = await query('SELECT id FROM students WHERE user_id = ?', [userId]);
      if (students.length > 0) {
        await query('UPDATE students SET class_id = ? WHERE user_id = ?', [class_ids, userId]);
      } else {
        await query('INSERT INTO students (id, user_id, class_id) VALUES (?, ?, ?)', 
          [uuidv4(), userId, class_ids]);
      }
    } else if (role === 'teacher') {
      // Remove student records if changing from student
      await query('DELETE FROM students WHERE user_id = ?', [userId]);

      // Get or create teacher record
      let teachers = await query('SELECT id FROM teachers WHERE user_id = ?', [userId]);
      let teacherId;
      
      if (teachers.length === 0) {
        teacherId = uuidv4();
        await query('INSERT INTO teachers (id, user_id) VALUES (?, ?)', [teacherId, userId]);
      } else {
        teacherId = teachers[0].id;
      }

      // Update teacher classes
      await query('DELETE FROM teacher_classes WHERE teacher_id = ?', [teacherId]);
      if (class_ids && Array.isArray(class_ids)) {
        for (const classId of class_ids) {
          await query('INSERT INTO teacher_classes (id, teacher_id, class_id) VALUES (?, ?, ?)', 
            [uuidv4(), teacherId, classId]);
        }
      }

      // Update teacher subjects
      await query('DELETE FROM teacher_subjects WHERE teacher_id = ?', [teacherId]);
      if (subject_ids && Array.isArray(subject_ids)) {
        for (const subjectId of subject_ids) {
          await query('INSERT INTO teacher_subjects (id, teacher_id, subject_id) VALUES (?, ?, ?)', 
            [uuidv4(), teacherId, subjectId]);
        }
      }
    } else if (role === 'admin') {
      // Remove both student and teacher records if changing to admin
      await query('DELETE FROM students WHERE user_id = ?', [userId]);
      const teachers = await query('SELECT id FROM teachers WHERE user_id = ?', [userId]);
      if (teachers.length > 0) {
        const teacherId = teachers[0].id;
        await query('DELETE FROM teacher_classes WHERE teacher_id = ?', [teacherId]);
        await query('DELETE FROM teacher_subjects WHERE teacher_id = ?', [teacherId]);
        await query('DELETE FROM teachers WHERE id = ?', [teacherId]);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete User
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    // Check if user exists
    const users = await query('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    // Prevent deleting the current admin user
    if (user.role === 'admin' && userId === req.session.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own admin account' });
    }

    // Check for dependencies
    if (user.role === 'student') {
      const submissions = await query('SELECT COUNT(*) as count FROM submissions s JOIN students st ON s.student_id = st.id WHERE st.user_id = ?', [userId]);
      if (submissions[0].count > 0) {
        return res.status(400).json({ error: 'Cannot delete student with existing submissions' });
      }
    }

    // Delete user (cascading will handle related records)
    await query('DELETE FROM users WHERE id = ?', [userId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
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

// Subjects Management
router.get('/subjects', async (req, res) => {
  try {
    const subjects = await query(`
      SELECT s.*, c.name as class_name, c.level,
        COUNT(DISTINCT a.id) as assignment_count,
        COUNT(DISTINCT ts.teacher_id) as teacher_count
      FROM subjects s
      JOIN classes c ON s.class_id = c.id
      LEFT JOIN assignments a ON s.id = a.subject_id
      LEFT JOIN teacher_subjects ts ON s.id = ts.subject_id
      GROUP BY s.id
      ORDER BY c.level, c.name, s.name
    `);

    const classes = await query('SELECT * FROM classes ORDER BY level, name');

    res.render('admin/subjects', {
      title: 'Subject Management',
      subjects,
      classes
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

// Create Subject
router.post('/subjects', async (req, res) => {
  try {
    const { name, class_id } = req.body;

    if (!name || !class_id) {
      return res.status(400).json({ error: 'Name and class are required' });
    }

    // Check if subject already exists for this class
    const existingSubjects = await query('SELECT id FROM subjects WHERE name = ? AND class_id = ?', [name, class_id]);
    if (existingSubjects.length > 0) {
      return res.status(400).json({ error: 'Subject already exists for this class' });
    }

    const subjectId = uuidv4();
    await query('INSERT INTO subjects (id, name, class_id) VALUES (?, ?, ?)', [subjectId, name, class_id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Create subject error:', error);
    res.status(500).json({ error: 'Failed to create subject' });
  }
});

// Edit Subject
router.put('/subjects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, class_id } = req.body;

    if (!name || !class_id) {
      return res.status(400).json({ error: 'Name and class are required' });
    }

    // Check if subject exists
    const subjects = await query('SELECT id FROM subjects WHERE id = ?', [id]);
    if (subjects.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Check if another subject with same name exists for this class
    const existingSubjects = await query('SELECT id FROM subjects WHERE name = ? AND class_id = ? AND id != ?', [name, class_id, id]);
    if (existingSubjects.length > 0) {
      return res.status(400).json({ error: 'Subject already exists for this class' });
    }

    await query('UPDATE subjects SET name = ?, class_id = ? WHERE id = ?', [name, class_id, id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Edit subject error:', error);
    res.status(500).json({ error: 'Failed to edit subject' });
  }
});

// Delete Subject
router.delete('/subjects/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if subject has assignments
    const assignments = await query('SELECT id FROM assignments WHERE subject_id = ?', [id]);
    if (assignments.length > 0) {
      return res.status(400).json({ error: 'Cannot delete subject with existing assignments' });
    }

    // Remove subject from teachers
    await query('DELETE FROM teacher_subjects WHERE subject_id = ?', [id]);

    await query('DELETE FROM subjects WHERE id = ?', [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete subject error:', error);
    res.status(500).json({ error: 'Failed to delete subject' });
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

// Create Assignment with Questions
router.post('/assignments', async (req, res) => {
  try {
    const { title, description, type, class_id, subject_id, term, start_date, deadline, questions } = req.body;

    if (!title || !type || !class_id || !subject_id || !term || !start_date || !questions || questions.length === 0) {
      return res.status(400).json({ error: 'All fields are required including at least one question' });
    }

    // Validate start date and deadline
    const startDateTime = new Date(start_date);
    const deadlineDateTime = deadline ? new Date(deadline) : null;
    
    if (deadlineDateTime && startDateTime >= deadlineDateTime) {
      return res.status(400).json({ error: 'Start date must be before deadline' });
    }

    // Validate questions
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      if (!question.question_text || !question.options || !question.correct_option) {
        return res.status(400).json({ error: `Question ${i + 1} is incomplete` });
      }
      
      if (type === 'mcq' && question.options.length < 2) {
        return res.status(400).json({ error: `Question ${i + 1} must have at least 2 options for MCQ` });
      }
      
      if (type === '2choice' && question.options.length !== 2) {
        return res.status(400).json({ error: `Question ${i + 1} must have exactly 2 options for 2-choice` });
      }
      
      if (!question.options.includes(question.correct_option)) {
        return res.status(400).json({ error: `Question ${i + 1} correct answer must be one of the options` });
      }
    }

    const assignmentId = uuidv4();
    
    // Create assignment
    await query(
      'INSERT INTO assignments (id, class_id, subject_id, title, description, type, term, start_date, deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [assignmentId, class_id, subject_id, title, description, type, term, start_date, deadline || null]
    );

    // Create questions
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const questionId = uuidv4();
      
      await query(
        'INSERT INTO questions (id, assignment_id, question_text, options, correct_option, marks, question_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          questionId,
          assignmentId,
          question.question_text,
          JSON.stringify(question.options),
          question.correct_option,
          question.marks || 1,
          i + 1
        ]
      );
    }

    res.json({ success: true, assignmentId });
  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({ error: 'Failed to create assignment' });
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

    // Get submissions with student details
    const submissions = await query(`
      SELECT sub.*, u.full_name as student_name, u.email as student_email
      FROM submissions sub
      JOIN students s ON sub.student_id = s.id
      JOIN users u ON s.user_id = u.id
      WHERE sub.assignment_id = ?
      ORDER BY sub.submitted_at DESC
    `, [assignmentId]);

    res.render('admin/assignment-detail', {
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