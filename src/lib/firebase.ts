import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

// Check if we are in a browser environment or if we have the required config
const isConfigValid = !!firebaseConfig.apiKey;

if (!getApps().length) {
    // During build time, if apiKey is missing, we initialize with dummy values 
    // to prevent the build from failing, but this should only happen on the server/build-step
    if (!isConfigValid && typeof window === "undefined") {
        app = initializeApp({
            apiKey: "dummy-key",
            authDomain: "dummy-auth-domain",
            projectId: "dummy-project-id",
            storageBucket: "dummy-storage-bucket",
            messagingSenderId: "dummy-sender-id",
            appId: "dummy-app-id"
        });
    } else {
        app = initializeApp(firebaseConfig);
    }
} else {
    app = getApp();
}

auth = getAuth(app);
db = getFirestore(app);

export { app, auth, db };
