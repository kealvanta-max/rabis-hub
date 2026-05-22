export async function sendEmailNotification(to: string, subject: string, html: string) {
  try {
    const res = await fetch("/api/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, html }),
    });
    
    if (!res.ok) {
      throw new Error(`Email sending failed: ${res.statusText}`);
    }
    
    return await res.json();
  } catch (error) {
    console.error("Failed to send email", error);
    return null;
  }
}

// Pre-defined templates

export const notifyAdminNewRegistration = async (user: any) => {
  const subject = `New Registration: ${user.name} applied for ${user.plan} plan`;
  const html = `
    <h2>New Registration Alert</h2>
    <p>A new user has registered for Rabi's Saving Hub.</p>
    <ul>
      <li><strong>Name:</strong> ${user.name}</li>
      <li><strong>Email:</strong> ${user.email}</li>
      <li><strong>Phone:</strong> ${user.phone}</li>
      <li><strong>Plan:</strong> ${user.plan}</li>
    </ul>
    <p>Please check the admin panel to review their documents and approve or reject them.</p>
  `;
  // Replace with actual admin email if known, or send to onboarding dev
  return sendEmailNotification("onboarding@resend.dev", subject, html);
};

export const notifyUserApproval = async (userEmail: string, userName: string, planName: string) => {
  const subject = `Welcome to Rabi's Saving Hub! Your account is approved.`;
  const html = `
    <h2>Welcome, ${userName}! 🎉</h2>
    <p>Your account for the <strong>${planName}</strong> plan has been approved by the admin.</p>
    <p>You can now log in to your dashboard to track your Susu payments and join the WhatsApp community group.</p>
    <p>Thank you for choosing Rabi's Saving Hub.</p>
  `;
  return sendEmailNotification(userEmail, subject, html);
};

export const notifyUserRejection = async (userEmail: string, userName: string, reason: string) => {
  const subject = `Update on your Rabi's Saving Hub application`;
  const html = `
    <h2>Hello, ${userName}</h2>
    <p>We have reviewed your application, but unfortunately, we cannot approve it at this time.</p>
    <p><strong>Reason:</strong> ${reason || "Information provided did not pass our verification checks."}</p>
    <p>Please contact support if you believe this was a mistake or if you would like to submit new documents.</p>
  `;
  return sendEmailNotification(userEmail, subject, html);
};
