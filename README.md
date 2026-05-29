# 一起早睡 Sleep Early Together

A simple iOS app (React Native / Expo) for friends to hold each other accountable for sleeping early.

## Features

- Sign up with email, password, and display name
- Add friends by email or share an invite link
- Nightly check-in button — tap before midnight to log "slept early", after midnight for "slept late"
- See all your friends' sleep statuses and exact check-in times
- Full English / Chinese UI toggle (persisted across sessions)

## Sleep status logic

| Status | Condition |
|---|---|
| Slept early ✨ | Checked in before midnight (local time) |
| Slept late 💀 | Checked in after midnight (local time) |
| Haven't checked in | No check-in, and it's still before 8am the next morning |
| Incognito last night 🤔 | No check-in, and it's past 8am the next morning |

> Check-ins between midnight and 4am are assigned to the **previous** night.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | React Native (Expo) |
| Auth | Firebase Authentication |
| Database | Cloud Firestore |
| Navigation | React Navigation v6 |
| Portability | Works on iOS, Android, and web via Expo |

## Setup

### 1. Clone and install

```bash
git clone <your-repo>
cd sleep-early-together
npm install
```

### 2. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project
3. Enable **Authentication** → Sign-in method → **Email/Password**
4. Enable **Firestore Database** → Start in production mode
5. Go to **Project Settings** → **Your apps** → Add a Web app
6. Copy the config object

### 3. Add your Firebase config

Open `src/config/firebase.js` and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID',
};
```

### 4. Deploy Firestore security rules

```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # select your project, keep firestore.rules as the rules file
firebase deploy --only firestore:rules
```

### 5. Run the app

```bash
npx expo start
```

Press `i` for iOS simulator, `a` for Android, or scan the QR code with Expo Go.

## Project structure

```
src/
  config/         Firebase initialization
  context/        AuthContext, LanguageContext
  i18n/           English and Chinese strings
  navigation/     Bottom tab + stack navigator
  screens/        LoginScreen, SignUpScreen, HomeScreen, FriendsScreen
  components/     LanguageToggle
firestore.rules   Firestore security rules
App.js            Root component
```

## Porting to Android / Web

This project uses Expo, so no changes are needed to support Android — just run `npx expo start --android`.

For web: `npx expo start --web`. The only web-specific consideration is that `expo-linking` deep links behave differently in a browser; the invite link flow may need adjustment.
