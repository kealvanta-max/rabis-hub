import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * `true` when the required NEXT_PUBLIC_FIREBASE_* variables are present.
 *
 * When they are missing we still initialise Firebase with placeholder values so
 * that importing this module never throws (a missing env var used to crash the
 * whole client bundle with `auth/invalid-api-key`). UI code can use this flag
 * to show a helpful "not configured" message instead of a blank screen.
 */
export const isFirebaseConfigured = Boolean(
    firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

const fallbackConfig = {
    apiKey: "demo-api-key-not-configured",
    authDomain: "demo-not-configured.firebaseapp.com",
    projectId: "demo-not-configured",
    storageBucket: "demo-not-configured.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:0000000000000000000000",
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

if (getApps().length) {
    app = getApp();
} else {
    app = initializeApp(isFirebaseConfigured ? firebaseConfig : fallbackConfig);
}

auth = getAuth(app);
db = getFirestore(app);

if (!isFirebaseConfigured && typeof window !== "undefined") {
    // Surfaced once in the browser console to make misconfiguration obvious.
    console.warn(
        "[Rabi's Saving Hub] Firebase is not configured. Add your NEXT_PUBLIC_FIREBASE_* " +
        "environment variables (see .env.example) to enable sign-in, dashboards and admin tools."
    );
}

export { app, auth, db };
