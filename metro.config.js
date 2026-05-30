// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase JS SDK ships CommonJS entry points and relies on the legacy
// resolution behavior. Expo SDK 53+ enables Metro package.json "exports"
// resolution by default, which makes `firebase/auth` load the wrong build
// and throw "Component auth has not been registered yet" at runtime.
// Disabling package exports + adding .cjs restores the working resolution.
config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
