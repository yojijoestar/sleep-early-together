import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, RefreshControl, AppState, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  doc, getDoc, setDoc, deleteDoc,
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

// The "sleep period date" resets at noon each day.
// Before noon → we're still in last night's window (yesterday's date).
// From noon onwards → tonight's window (today's date).
function sleepPeriodDate(now = new Date()) {
  if (now.getHours() < 12) {
    const prev = new Date(now);
    prev.setDate(prev.getDate() - 1);
    return localDateString(prev);
  }
  return localDateString(now);
}

// Yesterday's sleep period date (for the "last night" summary)
function previousSleepPeriodDate(now = new Date()) {
  const prev = new Date(now);
  prev.setDate(prev.getDate() - 1);
  return sleepPeriodDate(prev);
}

// 'early' | 'late' — compare stored date vs actual local date of timestamp
function resolveStatus(checkin) {
  if (!checkin) return null;
  const ts = checkin.timestamp?.toDate ? checkin.timestamp.toDate() : new Date(checkin.timestamp);
  return localDateString(ts) === checkin.date ? 'early' : 'late';
}

// No check-in: 'unchecked' before noon next day (i.e. before reset), 'incognito' after
function noCheckinStatus(targetDate) {
  const now = new Date();
  const [y, m, d] = targetDate.split('-').map(Number);
  // Reset happens at noon the following day
  const cutoff = new Date(y, m - 1, d + 1, 12, 0, 0);
  return now >= cutoff ? 'incognito' : 'unchecked';
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function HomeScreen() {
  const { user, profile } = useAuth();
  const { t } = useLang();
  const insets = useSafeAreaInsets();

  const [todayDate, setTodayDate] = useState(() => sleepPeriodDate());
  const [myCheckin, setMyCheckin] = useState(null);
  const [friendsData, setFriendsData] = useState([]);   // tonight
  const [friendsYesterday, setFriendsYesterday] = useState([]); // last night
  const [myYesterday, setMyYesterday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user || !profile) return;

    const currentPeriod = sleepPeriodDate();
    const prevPeriod = previousSleepPeriodDate();

    // Own check-ins
    const [mySnap, myYestSnap] = await Promise.all([
      getDoc(doc(db, 'checkins', `${user.uid}_${currentPeriod}`)),
      getDoc(doc(db, 'checkins', `${user.uid}_${prevPeriod}`)),
    ]);
    setMyCheckin(mySnap.exists() ? mySnap.data() : null);
    setMyYesterday(myYestSnap.exists() ? myYestSnap.data() : null);

    // Friends
    if (profile.friends?.length > 0) {
      const friendProfiles = await Promise.all(
        profile.friends.map((fid) => getDoc(doc(db, 'users', fid)))
      );
      const [friendCheckins, friendYestCheckins] = await Promise.all([
        Promise.all(profile.friends.map((fid) => getDoc(doc(db, 'checkins', `${fid}_${currentPeriod}`)))),
        Promise.all(profile.friends.map((fid) => getDoc(doc(db, 'checkins', `${fid}_${prevPeriod}`)))),
      ]);

      const getName = (i) => friendProfiles[i].exists() ? friendProfiles[i].data().name : profile.friends[i];

      setFriendsData(profile.friends.map((fid, i) => ({
        uid: fid,
        name: getName(i),
        checkin: friendCheckins[i].exists() ? friendCheckins[i].data() : null,
      })));
      setFriendsYesterday(profile.friends.map((fid, i) => ({
        uid: fid,
        name: getName(i),
        checkin: friendYestCheckins[i].exists() ? friendYestCheckins[i].data() : null,
      })));
    } else {
      setFriendsData([]);
      setFriendsYesterday([]);
    }

    setLoading(false);
  }, [user, profile]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Re-fetch on foreground; reset period if noon has passed
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const newPeriod = sleepPeriodDate();
        if (newPeriod !== todayDate) {
          setTodayDate(newPeriod);
          setMyCheckin(null);
        }
        fetchData();
      }
    });
    return () => sub.remove();
  }, [todayDate, fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleCheckIn = async () => {
    if (myCheckin || checkingIn) return;
    setCheckingIn(true);
    const now = new Date();
    const sleepDate = sleepPeriodDate(now);
    const checkinData = { uid: user.uid, date: sleepDate, timestamp: now };
    await setDoc(doc(db, 'checkins', `${user.uid}_${sleepDate}`), checkinData);
    setMyCheckin(checkinData);
    setCheckingIn(false);
  };

  const doCancelCheckIn = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      const dateStr = myCheckin?.date || sleepPeriodDate();
      await deleteDoc(doc(db, 'checkins', `${user.uid}_${dateStr}`));
      setMyCheckin(null);
    } catch (e) {
      Alert.alert(t('cancelCheckInTitle'), t('cancelCheckInFailed'));
    } finally {
      setCancelling(false);
    }
  };

  const handleCancelCheckIn = () => {
    if (cancelling) return;
    Alert.alert(
      t('cancelCheckInTitle'),
      t('cancelCheckInMsg'),
      [
        { text: t('cancelCheckInDismiss'), style: 'cancel' },
        { text: t('cancelCheckInConfirm'), style: 'destructive', onPress: doCancelCheckIn },
      ]
    );
  };

  const statusLabel = (checkin, targetDate) => {
    const s = resolveStatus(checkin);
    if (s === 'early') return t('statusEarly');
    if (s === 'late') return t('statusLate');
    const ns = noCheckinStatus(targetDate);
    return ns === 'incognito' ? t('statusIncognito') : t('statusUnchecked');
  };

  const statusColor = (checkin) => {
    const s = resolveStatus(checkin);
    if (s === 'early') return '#4ade80';
    if (s === 'late') return '#f87171';
    return '#94a3b8';
  };

  const prevPeriod = previousSleepPeriodDate();

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
        <View>
          <Text style={styles.greeting}>{t('greeting')}, {profile?.name} 👋</Text>
          <Text style={styles.date}>{todayDate}</Text>
        </View>
        <LanguageToggle />
      </View>

      {/* Tonight's check-in card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {(new Date().getHours() < 12 ? t('sleepStatusMorning') : t('sleepStatus')).toUpperCase()}
        </Text>
        {myCheckin ? (
          <>
            <Text style={[styles.statusBig, { color: statusColor(myCheckin) }]}>
              {statusLabel(myCheckin, todayDate)}
            </Text>
            <Text style={styles.timeLabel}>
              {t('sleptAt')}: {formatTime(myCheckin.timestamp)}
            </Text>
          </>
        ) : (
          <Text style={[styles.statusBig, { color: '#94a3b8' }]}>
            {statusLabel(null, todayDate)}
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
        {myCheckin && (
          <>
            <TouchableOpacity
              onPress={handleCancelCheckIn}
              disabled={cancelling}
              hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
            >
              {cancelling
                ? <ActivityIndicator color="#9d94ff" size="small" style={{ marginTop: 12 }} />
                : <Text style={styles.undoLink}>{t('undoCheckIn')}</Text>
              }
            </TouchableOpacity>
            <Text style={styles.resetHint}>{t('checkInAgainHint')}</Text>
          </>
        )}
      </View>

      {/* Tonight — friends */}
      <Text style={styles.sectionTitle}>{t('friendsStatus').toUpperCase()}</Text>
      {friendsData.length === 0 ? (
        <Text style={styles.emptyText}>{t('noFriends')}</Text>
      ) : (
        friendsData.map((f) => (
          <View key={f.uid} style={styles.friendCard}>
            <View style={styles.friendInfo}>
              <Text style={styles.friendName}>{f.name}</Text>
              {f.checkin && (
                <Text style={styles.friendTime}>{t('sleptAt')}: {formatTime(f.checkin.timestamp)}</Text>
              )}
            </View>
            <Text style={[styles.friendStatus, { color: statusColor(f.checkin) }]}>
              {statusLabel(f.checkin, todayDate)}
            </Text>
          </View>
        ))
      )}

      {/* Last night summary — only visible after noon, when tonight's card has taken over */}
      {new Date().getHours() >= 12 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{t('lastNight').toUpperCase()}</Text>
          <View style={styles.friendCard}>
            <View style={styles.friendInfo}>
              <Text style={styles.friendName}>{profile?.name} {t('youLabel')}</Text>
              {myYesterday && (
                <Text style={styles.friendTime}>{t('sleptAt')}: {formatTime(myYesterday.timestamp)}</Text>
              )}
            </View>
            <Text style={[styles.friendStatus, { color: statusColor(myYesterday) }]}>
              {statusLabel(myYesterday, prevPeriod)}
            </Text>
          </View>
          {friendsYesterday.map((f) => (
            <View key={f.uid} style={styles.friendCard}>
              <View style={styles.friendInfo}>
                <Text style={styles.friendName}>{f.name}</Text>
                {f.checkin && (
                  <Text style={styles.friendTime}>{t('sleptAt')}: {formatTime(f.checkin.timestamp)}</Text>
                )}
              </View>
              <Text style={[styles.friendStatus, { color: statusColor(f.checkin) }]}>
                {statusLabel(f.checkin, prevPeriod)}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
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
  cardTitle: { color: '#9d94ff', fontSize: 11, fontWeight: '600', marginBottom: 12, letterSpacing: 0.5 },
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
  undoLink: { color: '#9d94ff', fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 14 },
  resetHint: { color: '#3d3d6b', fontSize: 11, fontStyle: 'italic', textAlign: 'center', marginTop: 10 },
  checkInBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  sectionTitle: { color: '#9d94ff', fontSize: 11, fontWeight: '600', marginBottom: 12, letterSpacing: 0.5 },
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
