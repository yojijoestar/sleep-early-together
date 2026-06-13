import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { setDoc, doc } from 'firebase/firestore';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LanguageProvider, useLang } from './src/context/LanguageContext';
import { db } from './src/config/firebase';
import AppNavigator from './src/navigation/AppNavigator';

// Persist each signed-in user's language so push notifications
// are sent to them in the language they use.
function LangSync() {
  const { user } = useAuth();
  const { lang } = useLang();
  useEffect(() => {
    if (user) {
      setDoc(doc(db, 'users', user.uid), { lang }, { merge: true }).catch(() => {});
    }
  }, [user, lang]);
  return null;
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <LangSync />
        <StatusBar style="light" />
        <AppNavigator />
      </AuthProvider>
    </LanguageProvider>
  );
}
