// src/lib/firebaseClient.js

import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
// You can also import getAnalytics if you need it
// import { getAnalytics } from "firebase/analytics";

// This config object securely reads the values from your .env.local file
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase for the client with basic safety checks
let app;
try {
  const missingKeys = Object.entries(firebaseConfig)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    console.warn(
      `Firebase config is missing keys: ${missingKeys.join(", ")}. Add them to .env.local.`
    );
  }

  app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
  // Client logs show in browser; during dev, some may mirror to terminal
  console.log("Firebase client initialized successfully");
} catch (error) {
  console.error("Failed to initialize Firebase client:", error);
}
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
// const analytics = getAnalytics(app);

export { app, auth, googleProvider };