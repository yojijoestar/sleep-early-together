import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyC59u1prXl-FsDuadV_JT9YbfqXN-BPFbM",
  authDomain: "sleep-early-tgt.firebaseapp.com",
  projectId: "sleep-early-tgt",
  storageBucket: "sleep-early-tgt.firebasestorage.app",
  messagingSenderId: "125571531487",
  appId: "1:125571531487:web:4adff63c648648d31b9f6a",
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});
export const db = getFirestore(app);
