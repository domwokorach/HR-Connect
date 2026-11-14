import { isProd } from '../config';

/**
 * Mail transport placeholder. There is no mail server in development, so the message is printed to the server console.
 * In production, replace the body with your provider (SES, Postmark, SMTP…) — and never log the link there.
 */
export async function sendMail(to: string, subject: string, text: string) {
  if (isProd) throw new Error('Configure a mail provider in src/services/mailer.ts before using password reset in production');
  if (process.env.NODE_ENV !== 'test') console.log(`\n[mail → ${to}] ${subject}\n${text}\n`);
}
