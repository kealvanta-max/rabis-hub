import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config({ path: '.env.local' });

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is missing from .env.local');

const serviceAccount = JSON.parse(rawKey);

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
