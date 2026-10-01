// GO JESSIE! — sync settings.
// Leave FIREBASE_CONFIG as null to use the app on one device only (no sync, no account).
// To turn on sync + phone reminders, paste the config object from the Firebase console
// (Project settings → General → Your apps → Web app → "SDK setup and configuration" → Config).
// These values are public identifiers, not passwords: it is safe for them to live in this file.

export const FIREBASE_CONFIG = apiKey: "AIzaSyBdJ1qVI7X3XtjfzBqiueCgjIRRoxfTX0Q",
  authDomain: "go-jessie.firebaseapp.com",
  projectId: "go-jessie",
  storageBucket: "go-jessie.firebasestorage.app",
  messagingSenderId: "1017262337933",
  appId: "1:1017262337933:web:cdfef2cecfb02edfb517c4";
/* Example of what it looks like once filled in:
export const FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "go-jessie.firebaseapp.com",
  projectId: "go-jessie",
  storageBucket: "go-jessie.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
*/

// Firebase console → Project settings → Cloud Messaging → Web Push certificates → "Key pair".
export const VAPID_KEY = "BAGOEmQYgu66eu6P13DOO3m5Lb-OV43wEh6aUb7pOifmBwfDCWV5JiNw8ZPU-IlYRK1ReTtQ0W-_HAZnZ00204w";
