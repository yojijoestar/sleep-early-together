import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import LanguageToggle from '../components/LanguageToggle';

export default function SignUpScreen({ navigation }) {
  const { signUp } = useAuth();
  const { t } = useLang();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    setError('');
    if (!name.trim()) { setError(t('name') + ' is required'); return; }
    setLoading(true);
    try {
      await signUp(email.trim(), password, name.trim());
    } catch (e) {
      setError(e.message || t('authError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <LanguageToggle style={styles.langToggle} />

      <Text style={styles.title}>🌙</Text>
      <Text style={styles.appName}>{t('appName')}</Text>

      <TextInput
        style={styles.input}
        placeholder={t('namePlaceholder')}
        placeholderTextColor="#888"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder={t('emailPlaceholder')}
        placeholderTextColor="#888"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder={t('passwordPlaceholder')}
        placeholderTextColor="#888"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity style={styles.btn} onPress={handleSignUp} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('signUp')}</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={styles.link}>{t('alreadyHaveAccount')}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  langToggle: {
    position: 'absolute',
    top: 56,
    right: 24,
  },
  title: {
    fontSize: 56,
    textAlign: 'center',
    marginBottom: 8,
  },
  appName: {
    color: '#e0e0ff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 40,
  },
  input: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    color: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  btn: {
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  link: {
    color: '#9d94ff',
    textAlign: 'center',
    fontSize: 14,
  },
  error: {
    color: '#ff6b6b',
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 13,
  },
});
