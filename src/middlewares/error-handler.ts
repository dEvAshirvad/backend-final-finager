import logger from '@/configs/logger';
import APIError from '@/configs/errors/APIError';
import Respond from '@/lib/respond';
import { NextFunction, Request, Response } from 'express';

export function errorHandler(
  error: Error,
  _: Request,
  res: Response,
  next: NextFunction
) {
  if (error instanceof APIError) {
    Respond(res, error.serializeError(), error.statusCode, {
      success: false,
      cache: false,
    });
    return;
  }

  logger.error(error?.message, error.stack);
  Respond(
    res,
    {
      title: 'Internal Server Error',
      message: error?.message,
      stack: error.stack,
    },
    500,
    {
      success: false,
      cache: false,
    }
  );
}
