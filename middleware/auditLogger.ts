import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';

const logFilePath = path.join(__dirname, '../admin_audit.log');

export default function auditLogger(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).admin || (req as any).user || {};
  const logEntry = {
    time: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    adminEmail: user.email || user.userEmail || 'unknown',
    ip: req.ip,
    body: req.body,
    query: req.query,
    params: req.params
  };
  fs.appendFile(logFilePath, JSON.stringify(logEntry) + '\n', err => {
    if (err) {
      console.error('Failed to write audit log:', err);
    }
  });
  next();
}
