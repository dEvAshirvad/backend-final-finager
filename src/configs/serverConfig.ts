import express, { Express } from 'express';
import compression from 'compression';
import cors from 'cors';
import origins from '@/configs/origins';
import APIError from './errors/APIError';
import { HttpErrorStatusCode } from '@/types/errors/errors.types';
import cookieParser from 'cookie-parser';
import { requestLogger } from '@/middlewares/requestLogger';
import serveEmojiFavicon from '@/middlewares/serveEmojiFavicon';
import Respond from '@/lib/respond';
import { errorHandler } from '@/middlewares/error-handler';
import { auth } from '@/lib/auth';
import { toNodeHandler } from 'better-auth/node';
import router from '@/modules';
import sessions from '@/middlewares/sessions';

export function createRouter(): Express {
  return express();
}

export default function createApp() {
  const app = createRouter();

  app.use(
    cors({
      credentials: true,
      origin: function (origin, callback) {
        if (!origin || origins.includes(origin)) {
          callback(null, true);
        } else {
          callback(
            new APIError({
              STATUS: HttpErrorStatusCode.FORBIDDEN,
              TITLE: 'Not allowed by CORS',
              MESSAGE: 'You are not allowed to access this resource',
            })
          );
        }
      },
    })
  );

  app.all('/api/auth/*splat', toNodeHandler(auth));

  app.set('trust proxy', true);

  // // Request ID and correlation
  app.use((req, res, next) => {
    const requestId =
      (req.headers['x-request-id'] as string) || crypto.randomUUID();
    req.id = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  });

  // // Payload compression
  app.use(compression({ threshold: 1024 }));

  app.use(cookieParser());
  // // Sane body limits; expand only when justified per-route
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(requestLogger);

  app.use(serveEmojiFavicon('🔥'));

  app.get('/', (req, res) => {
    Respond(
      res,
      {
        requestId: req.id,
        message: `API services are nominal finager india 1.0.0!!`,
      },
      200
    );
  });

  // Liveness probe
  app.get('/health', (_req, res) => {
    Respond(res, { status: 'ok' }, 200);
  });

  app.use(sessions);
  app.use('/api/v1', router);

  app.use(errorHandler);
  return app;
}
