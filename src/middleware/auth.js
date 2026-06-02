const { createAdminRepository } = require('../repositories/adminRepository');

function destroySession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      resolve();
      return;
    }

    req.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function createRequireAdmin(adminRepository) {
  return async function requireAdmin(req, res, next) {
    try {
      const adminUserId = req.session && req.session.adminUserId;

      if (!adminUserId) {
        res.redirect('/admin/login');
        return;
      }

      const admin = await adminRepository.findAdminById(adminUserId);

      if (!admin || admin.isActive === false) {
        await destroySession(req);
        res.redirect('/admin/login');
        return;
      }

      req.adminUser = admin;
      res.locals.adminUser = admin;
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireAdmin(options = {}) {
  return createRequireAdmin(options.adminRepository || createAdminRepository(options.db));
}

module.exports = {
  createRequireAdmin,
  requireAdmin,
  destroySession
};
