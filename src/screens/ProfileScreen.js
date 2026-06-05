import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import LanguageToggle from '../components/LanguageToggle';

export default function ProfileScreen() {
  const { profile, user, logOut, updateName, deleteAccount } = useAuth();
  const { t } = useLang();
  const insets = useSafeAreaInsets();

  const [modalVisible, setModalVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  // Name editing
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');

  const startEditName = () => {
    setNameInput(profile?.name || '');
    setNameError('');
    setEditingName(true);
  };

  const cancelEditName = () => {
    if (savingName) return;
    setEditingName(false);
    setNameError('');
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError(t('nameEmpty'));
      return;
    }
    if (trimmed === profile?.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    setNameError('');
    try {
      await updateName(trimmed);
      setEditingName(false);
    } catch (e) {
      setNameError(t('updateNameFailed'));
    } finally {
      setSavingName(false);
    }
  };

  const openModal = () => {
    setPassword('');
    setError('');
    setModalVisible(true);
  };

  const closeModal = () => {
    if (deleting) return;
    setModalVisible(false);
  };

  const handleDelete = async () => {
    if (!password || deleting) return;
    setDeleting(true);
    setError('');
    try {
      await deleteAccount(password);
      // On success, auth state flips to null and the app navigates to Login.
    } catch (e) {
      const code = e?.code || '';
      if (
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials'
      ) {
        setError(t('wrongPassword'));
      } else {
        setError(t('deleteFailed'));
      }
      setDeleting(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t('profile')}</Text>
        <LanguageToggle />
      </View>

      {/* Account card */}
      <Text style={styles.sectionLabel}>{t('account').toUpperCase()}</Text>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(profile?.name || '🌙').trim().charAt(0).toUpperCase()}
          </Text>
        </View>

        {editingName ? (
          <View style={styles.editNameWrap}>
            <TextInput
              style={styles.nameInput}
              value={nameInput}
              onChangeText={(v) => { setNameInput(v); setNameError(''); }}
              placeholder={t('newNamePlaceholder')}
              placeholderTextColor="#4a4a7a"
              autoFocus
              maxLength={40}
              editable={!savingName}
              onSubmitEditing={handleSaveName}
              returnKeyType="done"
            />
            {nameError ? <Text style={styles.nameErrorText}>{nameError}</Text> : null}
            <View style={styles.editNameActions}>
              <TouchableOpacity
                style={[styles.nameBtn, styles.nameCancelBtn]}
                onPress={cancelEditName}
                disabled={savingName}
              >
                <Text style={styles.nameCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nameBtn, styles.nameSaveBtn, savingName && styles.nameBtnDisabled]}
                onPress={handleSaveName}
                disabled={savingName}
              >
                {savingName
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.nameSaveText}>{t('save')}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.name}>{profile?.name}</Text>
            <TouchableOpacity onPress={startEditName} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.editNameLink}>✏️ {t('editName')}</Text>
            </TouchableOpacity>
          </>
        )}

        <Text style={styles.email}>{t('loggedInAs')}: {user?.email}</Text>
      </View>

      {/* Log out */}
      <TouchableOpacity style={styles.logoutBtn} onPress={logOut}>
        <Text style={styles.logoutText}>{t('logOut')}</Text>
      </TouchableOpacity>

      {/* Delete account */}
      <TouchableOpacity style={styles.deleteBtn} onPress={openModal}>
        <Text style={styles.deleteText}>{t('deleteAccount')}</Text>
      </TouchableOpacity>

      {/* Confirmation modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('deleteAccountTitle')}</Text>
            <Text style={styles.modalWarning}>{t('deleteAccountWarning')}</Text>

            <Text style={styles.modalLabel}>{t('enterPasswordToConfirm')}</Text>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={(v) => { setPassword(v); setError(''); }}
              placeholder={t('password')}
              placeholderTextColor="#4a4a7a"
              secureTextEntry
              autoCapitalize="none"
              editable={!deleting}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={closeModal}
                disabled={deleting}
              >
                <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.confirmBtn, (!password || deleting) && styles.confirmBtnDisabled]}
                onPress={handleDelete}
                disabled={!password || deleting}
              >
                {deleting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.confirmBtnText}>{t('confirmDelete')}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  content: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 8 },
  title: { color: '#e0e0ff', fontSize: 22, fontWeight: '700' },
  sectionLabel: { color: '#9d94ff', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 10 },
  card: {
    backgroundColor: '#16213e', borderRadius: 16, padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: '#2a2a4a', marginBottom: 28,
  },
  avatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#6c63ff',
    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
  },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  name: { color: '#e0e0ff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  editNameLink: { color: '#9d94ff', fontSize: 13, fontWeight: '600', marginBottom: 10 },
  email: { color: '#64748b', fontSize: 13 },
  editNameWrap: { width: '100%', marginBottom: 12 },
  nameInput: {
    backgroundColor: '#1a1a2e', borderRadius: 10, color: '#fff',
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, textAlign: 'center',
    borderWidth: 1, borderColor: '#6c63ff',
  },
  nameErrorText: { color: '#f87171', fontSize: 12, marginTop: 8, textAlign: 'center' },
  editNameActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  nameBtn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  nameCancelBtn: { backgroundColor: '#2a2a4a' },
  nameCancelText: { color: '#cfcfe8', fontWeight: '700', fontSize: 14 },
  nameSaveBtn: { backgroundColor: '#6c63ff' },
  nameSaveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  nameBtnDisabled: { opacity: 0.5 },
  logoutBtn: {
    borderWidth: 1.5, borderColor: '#6c63ff', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginBottom: 14,
  },
  logoutText: { color: '#9d94ff', fontWeight: '700', fontSize: 15 },
  deleteBtn: { paddingVertical: 14, alignItems: 'center' },
  deleteText: { color: '#f87171', fontWeight: '600', fontSize: 14 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', backgroundColor: '#16213e', borderRadius: 18, padding: 22,
    borderWidth: 1, borderColor: '#2a2a4a',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  modalWarning: { color: '#94a3b8', fontSize: 14, lineHeight: 20, marginBottom: 18 },
  modalLabel: { color: '#9d94ff', fontSize: 12, fontWeight: '600', marginBottom: 8 },
  passwordInput: {
    backgroundColor: '#1a1a2e', borderRadius: 10, color: '#fff',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    borderWidth: 1, borderColor: '#2a2a4a',
  },
  errorText: { color: '#f87171', fontSize: 13, marginTop: 8 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: '#2a2a4a' },
  cancelBtnText: { color: '#cfcfe8', fontWeight: '700', fontSize: 15 },
  confirmBtn: { backgroundColor: '#ef4444' },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
