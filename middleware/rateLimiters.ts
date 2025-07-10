import rateLimit from 'express-rate-limit';

// 10 requests per minute per IP for admin endpoints
export const adminRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// 5 requests per 10 minutes per IP for signup
export const signupRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  message: 'Too many signup attempts from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// 10 requests per minute per IP for login
export const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many login attempts from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
