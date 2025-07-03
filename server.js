const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const teacherRoutes = require('./routes/teacher');
const studentRoutes = require('./routes/student');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(expressLayouts);           // ✅ Tell express to use layouts
app.set('layout', 'layout');       // ✅ Default layout file in /views/layout.ejs

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make user available in all templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Routes
app.use('/auth', authRoutes);
app.use('/admin', requireAuth('admin'), adminRoutes);
app.use('/teacher', requireAuth('teacher'), teacherRoutes);
app.use('/student', requireAuth('student'), studentRoutes);

// Landing page
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect(`/${req.session.user.role}/dashboard`);
  }
  res.render('landing', { title: 'Welcome to School Portal' });
});

// Dashboard redirects
app.get('/dashboard', requireAuth(), (req, res) => {
  res.redirect(`/${req.session.user.role}/dashboard`);
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { 
    title: 'Page Not Found',
    error: 'The page you are looking for does not exist.',
    statusCode: 404
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { 
    title: 'Server Error',
    error: 'Something went wrong on our end.',
    statusCode: 500
  });
});

app.listen(PORT, () => {
  console.log(`🚀 School Portal running at http://localhost:${PORT}`);
  console.log('📚 Ready to serve students, teachers, and administrators!');
});