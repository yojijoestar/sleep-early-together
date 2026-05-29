import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import {
  doc, getDoc, setDoc, collection, query, where, getDocs,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import LanguageToggle from '../components/LanguageToggle';

// Returns 'YYYY-MM-DD' in local time
function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 'early' | 'late' — compare stored date vs actual local date of timestamp
function resolveStatus(checkin) {
  if (!checkin) return null;
  const ts = checkin.timestamp?.toDate ? checkin.timestamp.toDate() : new Date(checkin.timestamp);
  return localDateString(ts) === checkin.date ? 'early' : 'late';
}

// No check-in: 'unchecked' before 8am next morning, 'incognito' after
function noCheckinStatus(targetDate) {
  const now = new Date();
  const [y, m, d] = targetDate.split('-').map(Number);
  const cutoff = new Date(y, m - 1, d + 1, 8, 0, 0);
  return now >= cutoff ? 'incognito' : 'unchecked';
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function HomeScreen() {
  const { user, profile, logOut } = useAuth();
  const { t } = useLang();
  const [myCheckin, setMyCheckin] = useState(null);
  const [friendsData, setFriendsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const today = localDateString();

  const fetchData = useCallback(async () => {
    if (!user || !profile) return;

    // Fetch own check-in
    const myRef = doc(db, 'checkins', `${user.uid}_${today}`);
    const mySnap = await getDoc(myRef);
    setMyCheckin(mySnap.exists() ? mySnap.data() : null);

    // Fetch friends' profiles + checkins
    if (profile.friends?.length > 0) {
      const friendProfiles = await Promise.all(
        profile.friends.map((fid) => getDoc(doc(db, 'users', fid)))
      );
      const friendCheckins = await Promise.all(
        profile.friends.map((fid) => getDoc(doc(db, 'checkins', `${fid}_${today}`)))
      );
      const data = profile.friends.map((fid, i) => ({
        uid: fid,
        name: friendProfiles[i].exists() ? friendProfiles[i].data().name : fid,
        checkin: friendCheckins[i].exists() ? friendCheckins[i].data() : null,
      }));
      setFriendsData(data);
    } else {
      setFriendsData([]);
    }

    setLoading(false);
  }, [user, profile, today]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleCheckIn = async () => {
    if (myCheckin || checkingIn) return;
    setCheckingIn(true);
    const now = new Date();
    const date = localDateString(now); // This is the "target" date (tonight = yesterday if past midnight)
    // If it's after midnight (hour 0-3), the date is already "tomorrow", so we assign it to yesterday
    // Actually: the user is checking in for the current night.
    // Convention: the "night" belongs to the previous calendar date if it's between 00:00–04:00.
    let sleepDate = date;
    if (now.getHours() < 4) {
      // After midnight but before 4am — belongs to previous night
      const prev = new Date(now);
      prev.setDate(prev.getDate() - 1);
      sleepDate = localDateString(prev);
    }
    const checkinData = {
      uid: user.uid,
      date: sleepDate,
      timestamp: now,
    };
    await setDoc(doc(db, 'checkins', `${user.uid}_${sleepDate}`), checkinData);
    setMyCheckin(checkinData);
    setCheckingIn(false);
  };

  const myStatus = resolveStatus(myCheckin);

  const statusLabel = (checkin, targetDate) => {
    const s = resolveStatus(checkin);
    if (s === 'early') return t('statusEarly');
    if (s === 'late') return t('statusLate');
    const ns = noCheckinStatus(targetDate || today);
    return ns === 'incognito' ? t('statusIncognito') : t('statusUnchecked');
  };

  const statusColor = (checkin) => {
    const s = resolveStatus(checkin);
    if (s === 'early') return '#4ade80';
    if (s === 'late') return '#f87171';
    return '#94a3b8';
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
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{t('greeting')}, {profile?.name} 👋</Text>
          <Text style={styles.date}>{today}</Text>
        </View>
        <LanguageToggle />
      </View>

      {/* My status card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('sleepStatus')}</Text>
        {myCheckin ? (
          <>
            <Text style={[styles.statusBig, { color: statusColor(myCheckin) }]}>
              {statusLabel(myCheckin, today)}
            </Text>
            <Text style={styles.timeLabel}>
              {t('sleptAt')}: {formatTime(myCheckin.timestamp)}
            </Text>
          </>
        ) : (
          <Text style={[styles.statusBig, { color: '#94a3b8' }]}>
            {statusLabel(null, today)}
          </Text>
        )}
        <Text style={styles.hintText}>{t('midnightHint')}</Text>

        <TouchableOpacity
          style={[styles.checkInBtn, myCheckin && styles.checkInBtnDone]}
          onPress={handleCheckIn}
          disabled={!!myCheckin || checkingIn}
        >
          {checkingIn
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.checkInBtnText}>
                {myCheckin ? t('alreadyCheckedIn') : t('checkIn')}
              </Text>
          }
        </TouchableOpacity>
      </View>

      {/* Friends */}
      <Text style={styles.sectionTitle}>{t('friendsStatus')}</Text>

      {friendsData.length === 0 ? (
        <Text style={styles.emptyText}>{t('noFriends')}</Text>
      ) : (
        friendsData.map((f) => (
          <View key={f.uid} style={styles.friendCard}>
            <View style={styles.friendInfo}>
              <Text style={styles.friendName}>{f.name}</Text>
              {f.checkin && (
                <Text style={styles.friendTime}>
                  {t('sleptAt')}: {formatTime(f.checkin.timestamp)}
                </Text>
              )}
            </View>
            <Text style={[styles.friendStatus, { color: statusColor(f.checkin) }]}>
              {statusLabel(f.checkin, today)}
            </Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    marginTop: 8,
  },
  greeting: { color: '#e0e0ff', fontSize: 18, fontWeight: '700' },
  date: { color: '#888', fontSize: 13, marginTop: 2 },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 24,
    marginBottom: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  cardTitle: { color: '#9d94ff', fontSize: 13, fontWeight: '600', marginBottom: 12, letterSpacing: 0.5 },
  statusBig: { color: '#94a3b8', fontSize: 26, fontWeight: '800', marginBottom: 6 },
  timeLabel: { color: '#64748b', fontSize: 13, marginBottom: 6 },
  hintText: { color: '#3d3d6b', fontSize: 11, fontStyle: 'italic', textAlign: 'center', marginBottom: 14 },
  checkInBtn: {
    backgroundColor: '#6c63ff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 8,
    width: '100%',
    alignItems: 'center',
  },
  checkInBtnDone: { backgroundColor: '#2a2a4a' },
  checkInBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  sectionTitle: { color: '#9d94ff', fontSize: 13, fontWeight: '600', marginBottom: 12, letterSpacing: 0.5 },
  emptyText: { color: '#64748b', textAlign: 'center', marginTop: 16 },
  friendCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  friendInfo: { flex: 1 },
  friendName: { color: '#e0e0ff', fontWeight: '600', fontSize: 15 },
  friendTime: { color: '#64748b', fontSize: 12, marginTop: 2 },
  friendStatus: { fontSize: 13, fontWeight: '700', marginLeft: 8 },
});
