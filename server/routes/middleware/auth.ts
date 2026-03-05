import type { Request, Response, NextFunction } from express;
import jwt from jsonwebtoken;
import { JWT_SECRET } from ../constants;

export interface AuthRequest extends Request {
  user?: { id: number; role: teacher | student | admin | principal };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith(Bearer