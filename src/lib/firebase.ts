import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDKI7PPRsfV9YgY6ZVzMFnCqJGyd40ST8E",
    authDomain: "rabis-saving-hub.app.com",
    projectId: "rabis-saving-hub",
    storageBucket: "rabis-saving-hub.storage.app",
    messagingSenderId: "456708666401",
    appId: "1:456708666401:web:fc9a59ec82012bbcdd5f6"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
