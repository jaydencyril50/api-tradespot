import { Request, Response, NextFunction } from 'express';
import Activity from '../models/Activity';

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return function (req: Request, res: Response, next: NextFunction) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export type ActivityType =
  | 'USER_SIGNUP'
  | 'WITHDRAWAL_SUBMITTED'
  | 'DEPOSIT'
  | 'USER_UPDATE'
  | 'STOCK_PURCHASE'
  | 'TRANSFER';

export async function logActivity(type: ActivityType, user: any, details?: any) {
  await Activity.create({
    type,
    user: {
      fullName: user.fullName,
      email: user.email,
      spotid: user.spotid,
      _id: user._id,
    },
    details,
  });
}
