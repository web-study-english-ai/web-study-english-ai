import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    'https://b2f6043a2421f0b192056b62912fc411@o4512043886575616.ingest.us.sentry.io/4512043907743744',
  tracesSampleRate: 1.0,
  debug: false,
});
