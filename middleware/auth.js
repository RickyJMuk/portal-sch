function requireAuth(role = null) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/auth/login');
    }

    if (role && req.session.user.role !== role) {
      return res.status(403).render('error', {
        title: 'Access Denied',
        error: 'You do not have permission to access this page.',
        statusCode: 403
      });
    }

    next();
  };
}

function checkRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/auth/login');
    }

    if (!allowedRoles.includes(req.session.user.role)) {
      return res.status(403).render('error', {
        title: 'Access Denied',
        error: 'You do not have permission to access this page.',
        statusCode: 403
      });
    }

    next();
  };
}

function redirectIfLoggedIn(req, res, next) {
  if (req.session.user) {
    return res.redirect(`/${req.session.user.role}/dashboard`);
  }
  next();
}

module.exports = {
  requireAuth,
  checkRole,
  redirectIfLoggedIn
};