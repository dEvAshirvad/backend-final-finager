import { auth } from '@/lib/auth';
import { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { Session, User } from '@/types/global';

export default async function sessions(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  req.session = session?.session as unknown as Session;
  req.user = session?.user as unknown as User;

  next();
}
