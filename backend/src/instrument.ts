import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn:
    process.env.SENTRY_DSN ||
    'https://66a6f849e9b85408cf99ba3cfaaf74a3@o4512043886575616.ingest.us.sentry.io/4512043921768448',
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: 1.0,
});
