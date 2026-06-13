// Dynamic Expo config.
// google-services.json is kept OUT of git. On EAS builds it's provided by the
// GOOGLE_SERVICES_JSON file env var (EAS writes it to a temp path); locally it
// falls back to ./google-services.json (gitignored). Everything else comes
// straight from app.json.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
});
