import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import {
  doc, setDoc, getDoc, deleteDoc,
  collection, query, where, getDocs, updateDoc, arrayRemove,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);      // Firebase Auth user
  const [profile, setProfile] = useState(null); // Firestore user doc
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        setProfile(snap.exists() ? snap.data() : null);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signUp = async (email, password, name) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const userData = { uid: cred.user.uid, email, name, friends: [], friendRequests: [] };
    await setDoc(doc(db, 'users', cred.user.uid), userData);
    setProfile(userData);
  };

  const logIn = (email, password) => signInWithEmailAndPassword(auth, email, password);

  const logOut = () => signOut(auth);

  // Update the user's display name in their profile document.
  const updateName = async (newName) => {
    const current = auth.currentUser;
    if (!current) throw new Error('not-authenticated');
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('empty-name');
    await updateDoc(doc(db, 'users', current.uid), { name: trimmed });
    setProfile((prev) => (prev ? { ...prev, name: trimmed } : prev));
  };

  // Permanently delete the account and all associated data.
  // Requires the current password to reauthenticate (Firebase requirement).
  const deleteAccount = async (password) => {
    const current = auth.currentUser;
    if (!current) throw new Error('not-authenticated');
    const uid = current.uid;

    // 1. Reauthenticate (also verifies the password before destroying anything)
    const cred = EmailAuthProvider.credential(current.email, password);
    await reauthenticateWithCredential(current, cred);

    // 2. Delete my check-ins
    const checkinSnap = await getDocs(
      query(collection(db, 'checkins'), where('uid', '==', uid))
    );
    await Promise.all(checkinSnap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));

    // 3. Delete friend requests I sent or received
    const [fromSnap, toSnap] = await Promise.all([
      getDocs(query(collection(db, 'friendRequests'), where('fromUid', '==', uid))),
      getDocs(query(collection(db, 'friendRequests'), where('toUid', '==', uid))),
    ]);
    await Promise.all(
      [...fromSnap.docs, ...toSnap.docs].map((d) => deleteDoc(d.ref).catch(() => {}))
    );

    // 4. Remove myself from my friends' friend lists
    if (profile?.friends?.length) {
      await Promise.all(
        profile.friends.map((fid) =>
          updateDoc(doc(db, 'users', fid), { friends: arrayRemove(uid) }).catch(() => {})
        )
      );
    }

    // 5. Delete my own profile document
    await deleteDoc(doc(db, 'users', uid));

    // 6. Delete the auth account — triggers onAuthStateChanged(null) -> Login
    await deleteUser(current);
  };

  const refreshProfile = async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) setProfile(snap.data());
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, logIn, logOut, updateName, deleteAccount, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
