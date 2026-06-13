/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n').forEach((l) => {
  const i = l.indexOf('='); if (i > 0 && !l.trim().startsWith('#')) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, getDoc, collection, query, where, getDocs } = require('firebase/firestore');
const app = initializeApp({
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
});
const auth = getAuth(app); const db = getFirestore(app);

async function userByEmail(email) {
  const s = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
  return s.empty ? null : { uid: s.docs[0].id, ...s.docs[0].data() };
}

(async () => {
  const owl = (await signInWithEmailAndPassword(auth, 'demo-owl@sleepearly.app', 'demopoke123')).user.uid;
  const owlDoc = (await getDoc(doc(db, 'users', owl))).data();
  const yuji = await userByEmail('yuji.lai@outlook.com');

  console.log('=== demo-owl ===');
  console.log('uid:', owl);
  console.log('friends:', owlDoc.friends);
  console.log('\n=== yuji.lai@outlook.com ===');
  console.log(yuji ? `uid: ${yuji.uid}\nname: ${yuji.name}\nfriends: ${JSON.stringify(yuji.friends)}` : 'NOT FOUND');

  if (yuji) {
    console.log('\n=== symmetry check ===');
    console.log('owl.friends includes yuji?', (owlDoc.friends || []).includes(yuji.uid));
    console.log('yuji.friends includes owl?', (yuji.friends || []).includes(owl));
  }

  // pending friend requests involving owl
  const reqTo = await getDocs(query(collection(db, 'friendRequests'), where('toUid', '==', owl)));
  console.log('\npending requests TO owl:', reqTo.docs.map((d) => d.data()));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
