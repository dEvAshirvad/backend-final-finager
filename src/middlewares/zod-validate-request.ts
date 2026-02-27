import APIError from '@/configs/errors/APIError';
import { AUTHORIZATION_ERRORS } from '@/configs/errors/AUTHORIZATION_ERRORS';
import { Request, Response, NextFunction } from 'express';
import { ZodObject, ZodError } from 'zod';

export const validateRequest = ({
  body,
  query,
  params,
}: {
  body?: ZodObject;
  query?: ZodObject;
  params?: ZodObject;
}) => {
  return async (req: Request, _: Response, next: NextFunction) => {
    try {
      await Promise.all([
        body && body.parseAsync(req.body),
        query && query.parseAsync(req.query),
        params && params.parseAsync(req.params),
      ]);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        throw new APIError({
          ...AUTHORIZATION_ERRORS.VALIDATION_ERROR,
          // @ts-ignore
          ERRORS: error.flatten(),
        });
      }
      throw error;
    }
  };
};
