import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

try {
  const json = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  console.log('JSON parsed successfully!');
  console.log('Project ID:', json.project_id);
  console.log('Key length:', json.private_key.length);
} catch (e) {
  console.error('JSON parsing failed:', e.message);
  console.log('Raw ENV length:', process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.length);
}
