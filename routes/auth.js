const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { redirectIfLoggedIn } = require('../middleware/auth');

const router = express.Router();

// Login page
router.get('/login', redirectIfLoggedIn, (req, res) => {
  res.render('auth/login', { 
    title: 'Login - School Portal',
    error: null
  });
});

// Login POST
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.render('auth/login', {
        title: 'Login - School Portal',
        error: 'Please provide both email and password'
      });
    }

    // Find user
    const users = await query('SELECT * FROM users WHERE email = ? AND is_whitelisted = TRUE', [email]);
    
    if (users.length === 0) {
      return res.render('auth/login', {
        title: 'Login - School Portal',
        error: 'Invalid email or password'
      });
    }

    const user = users[0];

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.render('auth/login', {
        title: 'Login - School Portal',
        error: 'Invalid email or password'
      });
    }

    // Create session
    req.session.user = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role
    };

    // Redirect to appropriate dashboard
    res.redirect(`/${user.role}/dashboard`);

  } catch (error) {
    console.error('Login error:', error);
    res.render('auth/login', {
      title: 'Login - School Portal',
      error: 'An error occurred during login'
    });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

module.exports = router;