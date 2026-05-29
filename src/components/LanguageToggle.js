import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useLang } from '../context/LanguageContext';

export default function LanguageToggle({ style }) {
  const { lang, toggleLanguage } = useLang();
  return (
    <TouchableOpacity onPress={toggleLanguage} style={[styles.btn, style]}>
      <Text style={styles.text}>{lang === 'en' ? '中文' : 'EN'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#6c63ff',
  },
  text: {
    color: '#6c63ff',
    fontWeight: '700',
    fontSize: 13,
  },
});
