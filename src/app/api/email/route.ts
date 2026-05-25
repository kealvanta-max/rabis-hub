import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

async function sendWithGmail(to: string, subject: string, html: string) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER || 'rabisavinghub@gmail.com',
      pass: process.env.EMAIL_PASSWORD,
    },
  });
  return transporter.sendMail({
    from: `Rabi's Saving Hub <${process.env.EMAIL_USER || 'rabisavinghub@gmail.com'}>`,
    to, subject, html,
  });
}

async function sendWithBrevo(to: string, subject: string, html: string) {
  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.BACKUP_EMAIL_USER,
      pass: process.env.BACKUP_EMAIL_PASSWORD,
    },
  });
  return transporter.sendMail({
    from: `Rabi's Saving Hub <${process.env.BACKUP_EMAIL_USER || 'noreply@rabis-hub.com'}>`,
    to, subject, html,
  });
}

export async function POST(request: Request) {
  try {
    const { to, subject, html } = await request.json();
    if (!to || !subject || !html) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    let lastError: any = null;
    try {
      if (process.env.EMAIL_PASSWORD) {
        const result = await sendWithGmail(to, subject, html);
        return NextResponse.json({ success: true, provider: 'gmail', messageId: result.messageId });
      }
    } catch (gmailError) {
      lastError = gmailError;
      console.warn('Gmail SMTP failed, trying Brevo backup:', gmailError);
    }
    try {
      if (process.env.BACKUP_EMAIL_PASSWORD && process.env.BACKUP_EMAIL_USER) {
        const result = await sendWithBrevo(to, subject, html);
        return NextResponse.json({ success: true, provider: 'brevo', messageId: result.messageId });
      }
    } catch (brevoError) {
      lastError = brevoError;
      console.error('Brevo SMTP also failed:', brevoError);
    }
    if (lastError) {
      return NextResponse.json({ error: 'All email providers failed', details: lastError.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Email providers not configured' }, { status: 503 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process email request' }, { status: 500 });
  }
}
