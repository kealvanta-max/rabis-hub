import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config({ path: '.env.local' });

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is missing from .env.local');

// Accept the raw JSON or a base64 copy of it. Dashboards mangle newlines, so the
// base64 form is the one that survives a copy-paste into an env var.
function parseServiceAccount(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  try {
    return JSON.parse(Buffer.from(trimmed, 'base64').toString('utf8'));
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is neither JSON nor base64 JSON');
  }
}

const serviceAccount = parseServiceAccount(rawKey);
console.log(`Using service account for project "${serviceAccount.project_id}" (${serviceAccount.client_email})`);

// Ensure newlines are correct in private_key
if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const emails = [
  'rabisavinghub@gmail.com',
  'moneyace914@gmail.com'
];

async function grantAdminRole(email) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`Successfully granted admin privileges to ${email}`);
  } catch (error) {
    console.error(`Error granting admin role to ${email}:`, error);
  }
}

async function main() {
  console.log('Starting admin elevation process...');
  for (const email of emails) {
    await grantAdminRole(email);
  }
  console.log('Completed.');
  process.exit(0);
}

main();
