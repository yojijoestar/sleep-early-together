import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { t } from '../i18n';

// Show notifications while the app is foregrounded too
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Ask permission and return this device's Expo push token (or null)
export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return null;

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    return token;
  } catch (e) {
    return null;
  }
}

// Look up a recipient's push token + preferred language
async function getRecipient(toUid) {
  try {
    const snap = await getDoc(doc(db, 'users', toUid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return d.pushToken ? { token: d.pushToken, lang: d.lang === 'zh' ? 'zh' : 'en' } : null;
  } catch (e) {
    return null;
  }
}

// Fire-and-forget send via Expo's free push service
async function push(token, title, body, data) {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: token, title, body, sound: 'default', data: data || {} }),
    });
  } catch (e) { /* best-effort */ }
}

export async function notifyFriendRequest(toUid, fromName) {
  const r = await getRecipient(toUid);
  if (!r) return;
  await push(r.token, t(r.lang, 'pushFriendRequestTitle'),
    `${fromName} ${t(r.lang, 'pushFriendRequestBody')}`, { type: 'friendRequest' });
}

export async function notifyPoke(toUid, fromName) {
  const r = await getRecipient(toUid);
  if (!r) return;
  // Title says who poked; body shows the actual poke message
  await push(r.token, `👉 ${fromName} ${t(r.lang, 'pokedYou')}`,
    t(r.lang, 'pokeMessage'), { type: 'poke' });
}

export async function notifyResponse(toUid, fromName, responseKey) {
  const r = await getRecipient(toUid);
  if (!r) return;
  await push(r.token, `${fromName} ${t(r.lang, 'pushReplyTitle')}`,
    t(r.lang, responseKey), { type: 'response' });
}
