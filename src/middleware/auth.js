import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

/**
 * Verify JWT and attach req.user (id, email, name, role, approval_status).
 * Does not reject if no token; use requireAuth for that.
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      approval_status: decoded.approval_status,
    };
    return next();
  } catch (err) {
    req.user = null;
    return next();
  }
}

/**
 * Require authenticated user. If not authenticated or token invalid, 401.
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  next();
}

/**
 * Require user to be approved (for login we already enforce this; use for protected routes).
 */
export function requireApproved(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  if (req.user.approval_status !== 'APPROVED') {
    return res.status(403).json({ message: 'Account is pending admin approval. You cannot access the portal until approved.' });
  }
  next();
}

/**
 * RBAC: require one of the given roles.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    if (req.user.approval_status !== 'APPROVED') {
      return res.status(403).json({ message: 'Account is pending admin approval.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
}

export { JWT_SECRET };
