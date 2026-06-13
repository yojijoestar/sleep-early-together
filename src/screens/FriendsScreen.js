import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Share, RefreshControl, Alert,
} from 'react-native';
import {
  collection, query, where, getDocs, doc, getDoc, onSnapshot,
  updateDoc, arrayUnion, arrayRemove, addDoc, deleteDoc,
} from 'firebase/firestore';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { notifyFriendRequest } from '../utils/notifications';
import LanguageToggle from '../components/LanguageToggle';

export default function FriendsScreen() {
  const { user, profile } = useAuth();
  const { t } = useLang();
  const insets = useSafeAreaInsets();

  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState(null); // { uid, name, email } | 'not_found' | 'self'
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState('');

  const [requests, setRequests] = useState([]); // incoming friend requests
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Incoming friend requests (live) — appear/disappear in real time
  useEffect(() => {
    if (!user) return;
    const reqQ = query(
      collection(db, 'friendRequests'),
      where('toUid', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsub = onSnapshot(reqQ, async (snap) => {
      const reqData = await Promise.all(
        snap.docs.map(async (d) => {
          const fromSnap = await getDoc(doc(db, 'users', d.data().fromUid));
          return {
            requestId: d.id,
            fromUid: d.data().fromUid,
            name: fromSnap.exists() ? fromSnap.data().name : d.data().fromUid,
            email: fromSnap.exists() ? fromSnap.data().email : '',
          };
        })
      );
      setRequests(reqData);
    }, () => setRequests([]));
    return unsub;
  }, [user]);

  // Friends list — reloads whenever my (live) friends array changes,
  // so a newly accepted friend shows up immediately.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || !profile) return;
      if (profile.friends?.length > 0) {
        const friendDocs = await Promise.all(
          profile.friends.map((fid) => getDoc(doc(db, 'users', fid)))
        );
        if (!cancelled) {
          setFriends(friendDocs.filter((d) => d.exists()).map((d) => ({ uid: d.id, ...d.data() })));
        }
      } else if (!cancelled) {
        setFriends([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, profile]);

  // Data is live; pull-to-refresh just gives a brief spinner.
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleSearch = async () => {
    setSearchResult(null);
    setSearchMsg('');
    if (!searchEmail.trim()) return;
    setSearching(true);

    const q = query(collection(db, 'users'), where('email', '==', searchEmail.trim().toLowerCase()));
    const snap = await getDocs(q);

    if (snap.empty) {
      setSearchMsg(t('userNotFound'));
    } else {
      const found = snap.docs[0];
      if (found.id === user.uid) {
        setSearchMsg(t('youLabel'));
      } else if (profile.friends?.includes(found.id)) {
        setSearchMsg(t('alreadyFriends'));
      } else {
        setSearchResult({ uid: found.id, ...found.data() });
      }
    }
    setSearching(false);
  };

  const handleSendRequest = async () => {
    if (!searchResult) return;
    // Check if request already exists
    const existQ = query(
      collection(db, 'friendRequests'),
      where('fromUid', '==', user.uid),
      where('toUid', '==', searchResult.uid)
    );
    const existSnap = await getDocs(existQ);
    if (!existSnap.empty) {
      setSearchMsg(t('requestAlreadySent'));
      setSearchResult(null);
      return;
    }
    await addDoc(collection(db, 'friendRequests'), {
      fromUid: user.uid,
      toUid: searchResult.uid,
      status: 'pending',
      createdAt: new Date(),
    });
    notifyFriendRequest(searchResult.uid, profile?.name || '');
    setSearchMsg(t('requestSent'));
    setSearchResult(null);
    setSearchEmail('');
  };

  const handleAccept = async (req) => {
    try {
      // Add each other as friends
      await updateDoc(doc(db, 'users', user.uid), { friends: arrayUnion(req.fromUid) });
      await updateDoc(doc(db, 'users', req.fromUid), { friends: arrayUnion(user.uid) });
      // Delete the request — live listeners update both lists automatically
      await deleteDoc(doc(db, 'friendRequests', req.requestId));
    } catch (e) {
      Alert.alert(t('friends'), t('authError'));
    }
  };

  const handleDecline = async (req) => {
    await deleteDoc(doc(db, 'friendRequests', req.requestId));
    setRequests((prev) => prev.filter((r) => r.requestId !== req.requestId));
  };

  const handleInvite = async () => {
    const url = Linking.createURL('invite', { queryParams: { ref: user.uid } });
    await Share.share({ message: url });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6c63ff" size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('friendsTab')}</Text>
        <LanguageToggle />
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('searchByEmail')}
          placeholderTextColor="#4a4a7a"
          value={searchEmail}
          onChangeText={(v) => { setSearchEmail(v); setSearchResult(null); setSearchMsg(''); }}
          autoCapitalize="none"
          keyboardType="email-address"
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} disabled={searching}>
          {searching
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.searchBtnText}>{t('search')}</Text>
          }
        </TouchableOpacity>
      </View>

      {searchMsg ? <Text style={styles.searchMsg}>{searchMsg}</Text> : null}

      {searchResult && (
        <View style={styles.resultCard}>
          <View>
            <Text style={styles.resultName}>{searchResult.name}</Text>
            <Text style={styles.resultEmail}>{searchResult.email}</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={handleSendRequest}>
            <Text style={styles.addBtnText}>{t('sendRequest')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Invite link */}
      <TouchableOpacity style={styles.inviteBtn} onPress={handleInvite}>
        <Text style={styles.inviteBtnText}>🔗 {t('inviteLink')}</Text>
      </TouchableOpacity>

      {/* Incoming requests */}
      {requests.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>{t('friendRequests').toUpperCase()}</Text>
          {requests.map((req) => (
            <View key={req.requestId} style={styles.reqCard}>
              <View style={styles.reqInfo}>
                <Text style={styles.reqName}>{req.name}</Text>
                <Text style={styles.reqEmail}>{req.email}</Text>
              </View>
              <View style={styles.reqActions}>
                <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(req)}>
                  <Text style={styles.acceptBtnText}>{t('accept')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.declineBtn} onPress={() => handleDecline(req)}>
                  <Text style={styles.declineBtnText}>{t('decline')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Friends list */}
      <Text style={styles.sectionLabel}>{t('friends').toUpperCase()}</Text>
      {friends.length === 0 ? (
        <Text style={styles.emptyText}>{t('noFriends')}</Text>
      ) : (
        friends.map((f) => (
          <View key={f.uid} style={styles.friendCard}>
            <Text style={styles.friendName}>{f.name}</Text>
            <Text style={styles.friendEmail}>{f.email}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 8 },
  title: { color: '#e0e0ff', fontSize: 22, fontWeight: '700' },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  searchInput: {
    flex: 1, backgroundColor: '#16213e', borderRadius: 10, color: '#fff',
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14,
    borderWidth: 1, borderColor: '#2a2a4a',
  },
  searchBtn: {
    backgroundColor: '#6c63ff', borderRadius: 10,
    paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center',
  },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  searchMsg: { color: '#9d94ff', fontSize: 13, marginBottom: 8 },
  resultCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#16213e', borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#6c63ff',
  },
  resultName: { color: '#e0e0ff', fontWeight: '600', fontSize: 15 },
  resultEmail: { color: '#64748b', fontSize: 12, marginTop: 2 },
  addBtn: { backgroundColor: '#6c63ff', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  inviteBtn: {
    borderWidth: 1.5, borderColor: '#6c63ff', borderRadius: 10,
    paddingVertical: 11, alignItems: 'center', marginBottom: 24,
  },
  inviteBtnText: { color: '#9d94ff', fontWeight: '600', fontSize: 14 },
  sectionLabel: { color: '#9d94ff', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 10 },
  reqCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#16213e', borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#2a2a4a',
  },
  reqInfo: { flex: 1 },
  reqName: { color: '#e0e0ff', fontWeight: '600', fontSize: 14 },
  reqEmail: { color: '#64748b', fontSize: 11, marginTop: 2 },
  reqActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { backgroundColor: '#6c63ff', borderRadius: 7, paddingVertical: 6, paddingHorizontal: 12 },
  acceptBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  declineBtn: { backgroundColor: '#2a2a4a', borderRadius: 7, paddingVertical: 6, paddingHorizontal: 12 },
  declineBtnText: { color: '#888', fontWeight: '600', fontSize: 12 },
  friendCard: {
    backgroundColor: '#16213e', borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#2a2a4a',
  },
  friendName: { color: '#e0e0ff', fontWeight: '600', fontSize: 15 },
  friendEmail: { color: '#64748b', fontSize: 12, marginTop: 2 },
  emptyText: { color: '#64748b', textAlign: 'center', marginTop: 12 },
});
