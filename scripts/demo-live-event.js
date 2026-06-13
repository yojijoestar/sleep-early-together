/* eslint-disable no-console */
// Fires a LIVE change as "Alex" so you can watch demo-owl's screen update
// in real time (no refresh):
//   - Alex pokes Demo Owl   -> banner appears/increments live
//   - Alex toggles check-in -> Alex's status flips live (and the Poke button
//                              appears/disappears)
// Run repeatedly to toggle Alex in and out.
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
  const i = line.indexOf('=');
  if (i > 0 && !line.trim().startsWith('#')) {
    process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
});

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore, doc, setDoc, deleteDoc, getDoc, addDoc, collection,
} = require('firebase/firestore');

const app = initializeApp({
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

function localDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function sleepPeriodDate(now = new Date()) {
  if (now.getHours() < 12) { const p = new Date(now); p.setDate(p.getDate() - 1); return localDate(p); }
  return localDate(now);
}

(async () => {
  const alex = (await signInWithEmailAndPassword(auth, 'demo-alex@sleepearly.app', 'demopoke123')).user.uid;
  // owl uid: read from Alex's friends (Alex has exactly [owl])
  const alexDoc = await getDoc(doc(db, 'users', alex));
  const owl = (alexDoc.data().friends || [])[0];

  // 1) Poke the owl
  await addDoc(collection(db, 'pokes'), { fromUid: alex, fromName: 'Alex', toUid: owl, createdAt: new Date() });
  console.log('👉 Alex poked Demo Owl');

  // 2) Toggle Alex's check-in for the current sleep period
  const date = sleepPeriodDate();
  const ref = doc(db, 'checkins', `${alex}_${date}`);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    console.log('🌙 Alex CANCELLED check-in (status flips back to "haven\'t checked in")');
  } else {
    await setDoc(ref, { uid: alex, date, timestamp: new Date() });
    console.log('✅ Alex CHECKED IN (status flips to "slept early", Poke button disappears)');
  }
  console.log('\nWatch the demo-owl screen — it should update with no refresh.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
