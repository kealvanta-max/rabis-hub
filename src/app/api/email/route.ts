import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// Only initialize if API key exists
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(request: Request) {
  try {
    const { to, subject, html } = await request.json();

    if (!resend) {
      console.warn("RESEND_API_KEY is not set. Email not sent.");
      // Return success anyway so UI doesn't break during dev without a key
      return NextResponse.json({ success: true, simulated: true });
    }

    // Using the default onboarding email for free tier testing.
    // In production, this should be replaced with a verified domain (e.g. notifications@rabis-hub.vercel.app)
    const { data, error } = await resend.emails.send({
      from: 'Rabis Saving Hub <onboarding@resend.dev>',
      to: [to],
      subject: subject,
      html: html,
    });

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
