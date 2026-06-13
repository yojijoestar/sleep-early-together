import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, RefreshControl, AppState, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  doc, setDoc, deleteDoc,
  collection, query, where, addDoc, onSnapshot,
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
  const { t, lang } = useLang();
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
  const [pokes, setPokes] = useState([]);              // pokes/responses received by me
  const [pokeBusy, setPokeBusy] = useState(null);      // uid currently being poked

  // Live data: real-time listeners so friends' check-ins and incoming pokes
  // update instantly, without needing to reopen or pull-to-refresh.
  useEffect(() => {
    if (!user || !profile) return;

    const currentPeriod = sleepPeriodDate();
    const prevPeriod = previousSleepPeriodDate();
    const friends = profile.friends || [];
    const unsubs = [];

    // Loading gate: clear once the first batch arrives (with a safety timeout)
    const expected = new Set(['mine', ...friends.flatMap((f) => [`p:${f}`, `c:${f}`])]);
    const received = new Set();
    const ready = (key) => {
      received.add(key);
      if (received.size >= expected.size) setLoading(false);
    };
    const safety = setTimeout(() => setLoading(false), 4000);

    // My check-ins (live)
    unsubs.push(onSnapshot(
      doc(db, 'checkins', `${user.uid}_${currentPeriod}`),
      (s) => { setMyCheckin(s.exists() ? s.data() : null); ready('mine'); },
      () => ready('mine'),
    ));
    unsubs.push(onSnapshot(
      doc(db, 'checkins', `${user.uid}_${prevPeriod}`),
      (s) => setMyYesterday(s.exists() ? s.data() : null),
    ));

    // Pokes received by me (live) — non-critical
    unsubs.push(onSnapshot(
      query(collection(db, 'pokes'), where('toUid', '==', user.uid)),
      (snap) => setPokes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setPokes([]),
    ));

    // Friends: live names + current/previous check-ins
    const fmap = {};
    friends.forEach((fid) => { fmap[fid] = { uid: fid, name: fid, checkin: null, yCheckin: null }; });
    const flush = () => {
      setFriendsData(friends.map((fid) => ({ uid: fid, name: fmap[fid].name, checkin: fmap[fid].checkin })));
      setFriendsYesterday(friends.map((fid) => ({ uid: fid, name: fmap[fid].name, checkin: fmap[fid].yCheckin })));
    };
    if (friends.length === 0) { setFriendsData([]); setFriendsYesterday([]); }
    friends.forEach((fid) => {
      unsubs.push(onSnapshot(doc(db, 'users', fid),
        (s) => { if (s.exists()) fmap[fid].name = s.data().name; flush(); ready(`p:${fid}`); },
        () => ready(`p:${fid}`)));
      unsubs.push(onSnapshot(doc(db, 'checkins', `${fid}_${currentPeriod}`),
        (s) => { fmap[fid].checkin = s.exists() ? s.data() : null; flush(); ready(`c:${fid}`); },
        () => ready(`c:${fid}`)));
      unsubs.push(onSnapshot(doc(db, 'checkins', `${fid}_${prevPeriod}`),
        (s) => { fmap[fid].yCheckin = s.exists() ? s.data() : null; flush(); }));
    });

    return () => { clearTimeout(safety); unsubs.forEach((u) => u()); };
  }, [user, profile, todayDate]);

  // Reset the sleep period at noon when the app returns to foreground
  // (listeners re-subscribe automatically when todayDate changes).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const newPeriod = sleepPeriodDate();
        if (newPeriod !== todayDate) setTodayDate(newPeriod);
      }
    });
    return () => sub.remove();
  }, [todayDate]);

  // Data is already live; pull-to-refresh just gives a brief spinner.
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
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

  // Poke a friend who hasn't checked in yet (multiple pokes allowed)
  const handlePoke = async (friend) => {
    if (pokeBusy) return;
    setPokeBusy(friend.uid);
    try {
      await addDoc(collection(db, 'pokes'), {
        fromUid: user.uid,
        fromName: profile?.name || '',
        toUid: friend.uid,
        type: 'poke',
        createdAt: new Date(),
      });
      // Show the sender exactly what the friend will receive
      Alert.alert(`${t('pokeSentTitle')} ${friend.name}`, t('pokeMessage'));
    } catch (e) {
      Alert.alert(t('poke'), t('pokeFailed'));
    } finally {
      setPokeBusy(null);
    }
  };

  // Delete a set of received poke/response docs
  const dismissDocs = async (docs) => {
    const ids = new Set(docs.map((d) => d.id));
    setPokes((prev) => prev.filter((p) => !ids.has(p.id)));
    await Promise.all(docs.map((d) => deleteDoc(doc(db, 'pokes', d.id)).catch(() => {})));
  };

  // Reply to everyone who poked me with the chosen message, then clear their pokes
  const handleRespond = async (incoming, responseKey) => {
    const pokerUids = [...new Set(incoming.map((p) => p.fromUid))];
    try {
      await Promise.all(pokerUids.map((uid) => addDoc(collection(db, 'pokes'), {
        fromUid: user.uid,
        fromName: profile?.name || '',
        toUid: uid,
        type: 'response',
        responseKey,
        createdAt: new Date(),
      })));
      Alert.alert(t('responseSentTitle'), t(responseKey));
      await dismissDocs(incoming);
    } catch (e) {
      Alert.alert(t('respond'), t('pokeFailed'));
    }
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

  // Split received items into pokes (nudges) and responses (replies),
  // each deduped to distinct senders.
  const incomingPokes = pokes.filter((p) => p.type !== 'response');
  const incomingResponses = pokes.filter((p) => p.type === 'response');
  const distinctNames = (arr) => [
    ...new Map(arr.map((p) => [p.fromUid, p.fromName || ''])).values(),
  ].filter(Boolean);
  const pokerNames = distinctNames(incomingPokes);
  // Distinct responders, keeping their latest reply (which may differ per person)
  const dedupedResponses = [...new Map(incomingResponses.map((r) => [r.fromUid, r])).values()];
  const nameSep = lang === 'zh' ? '、' : ', ';

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

      {/* Pokes received — friends nudging me to sleep */}
      {incomingPokes.length > 0 && (
        <View style={styles.pokeBanner}>
          <View style={styles.pokeBannerHead}>
            <Text style={styles.pokeBannerTitle}>
              👉 {pokerNames.join(nameSep)} {t('pokedYou')}
            </Text>
            <TouchableOpacity
              onPress={() => dismissDocs(incomingPokes)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.pokeBannerClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.pokeBannerMsg}>{t('pokeMessage')}</Text>
          <TouchableOpacity
            style={styles.respondBtn}
            onPress={() => handleRespond(incomingPokes, 'responseMessage')}
          >
            <Text style={styles.respondBtnText}>{t('responseMessage')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.respondBtn, styles.respondBtnAlt]}
            onPress={() => handleRespond(incomingPokes, 'responseMessage2')}
          >
            <Text style={[styles.respondBtnText, styles.respondBtnAltText]}>{t('responseMessage2')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Responses received — replies to pokes I sent */}
      {incomingResponses.length > 0 && (
        <View style={[styles.pokeBanner, styles.responseBanner]}>
          <View style={styles.pokeBannerHead}>
            <Text style={styles.pokeBannerTitle}>💬 {t('repliesHeading')}</Text>
            <TouchableOpacity
              onPress={() => dismissDocs(incomingResponses)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.pokeBannerClose}>✕</Text>
            </TouchableOpacity>
          </View>
          {dedupedResponses.map((r) => (
            <Text key={r.fromUid} style={styles.responseLine}>
              {r.fromName}: {t(r.responseKey || 'responseMessage')}
            </Text>
          ))}
        </View>
      )}

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
            <View style={styles.friendRight}>
              <Text style={[styles.friendStatus, { color: statusColor(f.checkin) }]}>
                {statusLabel(f.checkin, todayDate)}
              </Text>
              {!resolveStatus(f.checkin) && (
                <TouchableOpacity
                  style={styles.pokeBtn}
                  onPress={() => handlePoke(f)}
                  disabled={pokeBusy === f.uid}
                >
                  {pokeBusy === f.uid
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.pokeBtnText}>👉 {t('poke')}</Text>
                  }
                </TouchableOpacity>
              )}
            </View>
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
  friendRight: { alignItems: 'flex-end', marginLeft: 8 },
  friendStatus: { fontSize: 13, fontWeight: '700' },
  pokeBtn: {
    backgroundColor: '#6c63ff',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginTop: 7,
  },
  pokeBtnDone: { backgroundColor: '#2a2a4a' },
  pokeBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pokeBanner: {
    backgroundColor: '#241f45',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#6c63ff',
  },
  responseBanner: { backgroundColor: '#1c2940', borderColor: '#4ade80' },
  pokeBannerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pokeBannerTitle: { flex: 1, color: '#e0e0ff', fontWeight: '700', fontSize: 15 },
  pokeBannerClose: { color: '#9d94ff', fontSize: 16, fontWeight: '700', paddingLeft: 10 },
  pokeBannerMsg: { color: '#9d94ff', fontSize: 14, marginTop: 4, lineHeight: 20 },
  respondBtn: {
    backgroundColor: '#6c63ff',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
    marginTop: 14,
    alignItems: 'center',
  },
  respondBtnText: { color: '#fff', fontWeight: '700', fontSize: 14, textAlign: 'center' },
  respondBtnAlt: { backgroundColor: '#2a2a4a', marginTop: 10 },
  respondBtnAltText: { color: '#cfcfe8' },
  responseLine: { color: '#b6e3c4', fontSize: 14, marginTop: 6, lineHeight: 20 },
});
