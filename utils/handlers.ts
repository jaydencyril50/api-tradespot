import { Request, Response } from 'express';

export function healthCheckHandler(req: Request, res: Response) {
  res.status(200).send('TradeSpot server is alive ✅');
}

export function notFoundHandler(req: Request, res: Response) {
  console.log(`🚨 404 - No route found for ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Not Found' });
}
