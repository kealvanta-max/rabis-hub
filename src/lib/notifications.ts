const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * The mail route requires proof of identity (it is no longer an open relay), so
 * every call carries the signed-in member's Firebase ID token. Failure to get a
 * token is not fatal — email is a nice-to-have and the caller never blocks.
 */
async function authHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  try {
    const { getAuth } = await import("firebase/auth");
    const user = getAuth().currentUser;
    if (!user) return {};
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

export async function sendEmailNotification(to: string, subject: string, html: string) {
  try {
    const res = await fetch("/api/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ to, subject, html }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || `Email sending failed: ${res.statusText}`);
    }

    return await res.json();
  } catch (error) {
    // Email is a nice-to-have: never break a signup/approval because SMTP is down.
    console.warn("Failed to send email", error);
    return null;
  }
}

/** Admin inbox(es) configured through NEXT_PUBLIC_ADMIN_EMAIL (comma separated). */
export function getAdminEmails(): string[] {
  const configured = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "";
  const emails = configured
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  return emails.length > 0 ? emails : ["rabisavinghub@gmail.com"];
}

// Pre-defined templates

export const notifyAdminNewRegistration = async (user: {
  name: string;
  email: string;
  phone: string;
  plan: string;
}) => {
  const subject = `New Registration: ${user.name} applied for ${user.plan}`;
  const html = `
    <h2>New Registration Alert</h2>
    <p>A new user has registered for Rabi's Saving Hub.</p>
    <ul>
      <li><strong>Name:</strong> ${escapeHtml(user.name)}</li>
      <li><strong>Email:</strong> ${escapeHtml(user.email)}</li>
      <li><strong>Phone:</strong> ${escapeHtml(user.phone)}</li>
      <li><strong>Plan:</strong> ${escapeHtml(user.plan)}</li>
    </ul>
    <p>Open the admin panel to review their documents and approve or reject them.</p>
  `;

  const recipients = getAdminEmails();
  return Promise.all(recipients.map((email) => sendEmailNotification(email, subject, html)));
};

export const notifyUserApproval = async (userEmail: string, userName: string, planName: string) => {
  const subject = `Welcome to Rabi's Saving Hub! Your account is approved.`;
  const html = `
    <h2>Welcome, ${escapeHtml(userName)}! 🎉</h2>
    <p>Your account for the <strong>${escapeHtml(planName)}</strong> plan has been approved.</p>
    <p>Log in to your dashboard to track your Susu payments and join your WhatsApp community group.</p>
    <p>Thank you for choosing Rabi's Saving Hub.</p>
  `;
  return sendEmailNotification(userEmail, subject, html);
};

export const notifyUserRejection = async (userEmail: string, userName: string, reason: string) => {
  const subject = `Update on your Rabi's Saving Hub application`;
  const html = `
    <h2>Hello, ${escapeHtml(userName)}</h2>
    <p>We have reviewed your application, but unfortunately we cannot approve it at this time.</p>
    <p><strong>Reason:</strong> ${escapeHtml(reason || "Information provided did not pass our verification checks.")}</p>
    <p>Contact support if you believe this was a mistake or if you would like to submit new documents.</p>
  `;
  return sendEmailNotification(userEmail, subject, html);
};
