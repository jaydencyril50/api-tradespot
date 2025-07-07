import { Request, Response, NextFunction } from 'express';

export function healthCheckHandler(req: Request, res: Response) {
  res.status(200).send('TradeSpot server is alive ✅');
}

export function notFoundHandler(req: Request, res: Response) {
  console.log(`🚨 404 - No route found for ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Not Found' });
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error('❌ Server Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
}

export function unauthorizedHandler(req: Request, res: Response) {
  res.status(401).json({ error: 'Unauthorized' });
}

export function forbiddenHandler(req: Request, res: Response) {
  res.status(403).json({ error: 'Forbidden' });
}
