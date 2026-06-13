/* eslint-disable no-console */
// One-off demo seeder for the "poke" feature.
// Creates 3 disposable accounts (you log in as the "owl" one):
//   - demo-owl@sleepearly.app   <- LOG IN AS THIS  (has 2 friends; got poked)
//   - demo-alex@sleepearly.app  (night owl, not checked in -> pokeable; pokes you)
//   - demo-mia@sleepearly.app   (slept early -> shows green, no poke button)
// Safe to re-run (idempotent).
const fs = require('fs');
const path = require('path');

// load .env
const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
  const i = line.indexOf('=');
  if (i > 0 && !line.trim().startsWith('#')) {
    process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
});

const { initializeApp } = require('firebase/app');
const {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
} = require('firebase/auth');
const {
  getFirestore, doc, setDoc, updateDoc, addDoc, collection,
  arrayUnion, getDocs, query, where, deleteDoc,
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

const PW = 'demopoke123';

function localDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function sleepPeriodDate(now = new Date()) {
  if (now.getHours() < 12) {
    const p = new Date(now); p.setDate(p.getDate() - 1); return localDate(p);
  }
  return localDate(now);
}

async function ensureUser(email, name) {
  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, email, PW);
    console.log('  created', email);
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
      cred = await signInWithEmailAndPassword(auth, email, PW);
      console.log('  reused ', email);
    } else { throw e; }
  }
  const uid = cred.user.uid;
  await setDoc(doc(db, 'users', uid), { uid, email, name, friends: [], friendRequests: [] }, { merge: true });
  return uid;
}

(async () => {
  console.log('Seeding poke demo...');
  // Create accounts (each call leaves us signed in as that account)
  const alex = await ensureUser('demo-alex@sleepearly.app', 'Alex');
  const mia  = await ensureUser('demo-mia@sleepearly.app', 'Mia');
  const owl  = await ensureUser('demo-owl@sleepearly.app', 'Demo Owl'); // signed in as owl now

  // owl friends alex + mia
  await updateDoc(doc(db, 'users', owl), { friends: arrayUnion(alex, mia) });

  // alex friends owl; alex pokes owl (clear old pokes first)
  await signInWithEmailAndPassword(auth, 'demo-alex@sleepearly.app', PW);
  await updateDoc(doc(db, 'users', alex), { friends: arrayUnion(owl) });
  const old = await getDocs(query(collection(db, 'pokes'), where('fromUid', '==', alex), where('toUid', '==', owl)));
  await Promise.all(old.docs.map((d) => deleteDoc(d.ref)));
  await addDoc(collection(db, 'pokes'), { fromUid: alex, fromName: 'Alex', toUid: owl, createdAt: new Date() });
  console.log('  Alex poked Demo Owl');

  // mia friends owl + checks in EARLY (so she shows green, no poke button)
  await signInWithEmailAndPassword(auth, 'demo-mia@sleepearly.app', PW);
  await updateDoc(doc(db, 'users', mia), { friends: arrayUnion(owl) });
  const date = sleepPeriodDate();
  const [y, m, d] = date.split('-').map(Number);
  const earlyTs = new Date(y, m - 1, d, 22, 0, 0); // 10pm on the sleep date => "early"
  await setDoc(doc(db, 'checkins', `${mia}_${date}`), { uid: mia, date, timestamp: earlyTs });
  console.log('  Mia checked in early');

  console.log('\nDone! Log in to the app as:');
  console.log('  email:    demo-owl@sleepearly.app');
  console.log('  password: demopoke123');
  process.exit(0);
})().catch((e) => { console.error('SEED FAILED:', e); process.exit(1); });
