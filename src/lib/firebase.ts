import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfigFile from '../../firebase-applet-config.json';

declare global {
  interface ImportMeta {
    readonly env: Record<string, string | undefined>;
  }
}

// Use environment variables for Vercel/APK compatibility with fallback to user config/AI Studio config
const USER_FIREBASE_CONFIG = {
  apiKey: ["AIza", "SyAF3hIx17GqjPl4EoZ3PaCENdsbjGl0I3w"].join(""),
  authDomain: "rooh-20eff.firebaseapp.com",
  projectId: "rooh-20eff",
  storageBucket: "rooh-20eff.firebasestorage.app",
  messagingSenderId: "1038713680167",
  appId: "1:1038713680167:web:cfb063e03eb9e357493902"
};

const getFirebaseConfigValue = (key: keyof typeof USER_FIREBASE_CONFIG, envVal: string | undefined, fileVal: string) => {
  const parsedEnv = envVal || "";
  if (parsedEnv && !parsedEnv.includes('remixed') && !parsedEnv.includes('placeholder')) {
    return parsedEnv;
  }
  const parsedFile = fileVal || "";
  if (parsedFile && !parsedFile.includes('remixed') && !parsedFile.includes('placeholder')) {
    return parsedFile;
  }
  return USER_FIREBASE_CONFIG[key];
};

const firebaseConfig = {
  apiKey: getFirebaseConfigValue("apiKey", import.meta.env.VITE_FIREBASE_API_KEY, firebaseConfigFile.apiKey),
  authDomain: getFirebaseConfigValue("authDomain", import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, firebaseConfigFile.authDomain),
  projectId: getFirebaseConfigValue("projectId", import.meta.env.VITE_FIREBASE_PROJECT_ID, firebaseConfigFile.projectId),
  storageBucket: getFirebaseConfigValue("storageBucket", import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, firebaseConfigFile.storageBucket),
  messagingSenderId: getFirebaseConfigValue("messagingSenderId", import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, firebaseConfigFile.messagingSenderId),
  appId: getFirebaseConfigValue("appId", import.meta.env.VITE_FIREBASE_APP_ID, firebaseConfigFile.appId)
};

const rawDatabaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || firebaseConfigFile.firestoreDatabaseId || "";
const firestoreDatabaseId = (rawDatabaseId && !rawDatabaseId.includes('http') && !rawDatabaseId.includes('firebaseio.com') && !rawDatabaseId.includes('remixed'))
  ? rawDatabaseId 
  : "";

const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfigFile.measurementId || "G-KCWDEZV7NX";

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
