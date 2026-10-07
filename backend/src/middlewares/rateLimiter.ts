import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

export const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 10000 : 30, // 30 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many login attempts from this IP address. Please try again after 15 minutes.',
    },
  },
});

export const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 10000 : 10, // 10 attempts per window per email
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  keyGenerator: (req) => {
    const email = req.body?.email ? String(req.body.email).toLowerCase().trim() : '';
    return email ? `email:${email}` : (req.ip || 'unknown');
  },
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many login attempts for this account. Please try again after 15 minutes.',
    },
  },
});

export const loginLimiter = [loginIpLimiter, loginEmailLimiter];

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isTest ? 10000 : 120, // 120 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Please slow down.',
    },
  },
});
