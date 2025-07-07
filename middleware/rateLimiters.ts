import rateLimit from 'express-rate-limit';

// 10 requests per minute per IP for admin endpoints
export const adminRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
