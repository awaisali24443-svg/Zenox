import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey:        import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:     import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  databaseURL:   import.meta.env.VITE_FIREBASE_DATABASE_URL,
  appId:         import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

const app = firebaseConfig.apiKey ? initializeApp(firebaseConfig) : null as any;

// BUG FIX: Use DEFAULT database — no named database ID.
// Named database caused backend/frontend split-brain where
// tasks written by backend were invisible to frontend.
export const db = app ? getFirestore(app) : null as any;
export const auth = app ? getAuth(app) : null as any;