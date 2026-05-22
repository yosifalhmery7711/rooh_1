import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfigFile from '../../firebase-applet-config.json';

declare global {
  interface ImportMeta {
    readonly env: Record<string, string | undefined>;
  }
}

// Use environment variables for Vercel/APK compatibility with fallback to AI Studio config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigFile.apiKey || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigFile.authDomain || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigFile.projectId || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigFile.storageBucket || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigFile.messagingSenderId || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigFile.appId || ""
};

const firestoreDatabaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || firebaseConfigFile.firestoreDatabaseId || "";
const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfigFile.measurementId || "";

export const isFirebasePlaceholder = 
  !firebaseConfig.projectId || 
  firebaseConfig.projectId.includes('remixed') || 
  firebaseConfig.projectId.includes('placeholder') ||
  firebaseConfig.apiKey?.includes('remixed') ||
  firebaseConfig.apiKey?.includes('placeholder') ||
  !firebaseConfig.apiKey;

const app = initializeApp(firebaseConfig);
export const db = firestoreDatabaseId 
  ? getFirestore(app, firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);


// Connectivity check
async function testConnection() {
  if (isFirebasePlaceholder) {
    console.warn("⚠️ Firebase is currently in placeholder mode. Please set up a live Firebase project in AI Studio to activate cloud syncing.");
    return;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firebase connected successfully");
  } catch (error: any) {
    if (error.message?.includes('offline') || error?.code === 'unavailable') {
      console.warn("Firebase is operating in offline/cached mode.");
    } else {
      console.warn("Firebase link warning:", error.message || error);
    }
  }
}
testConnection();
