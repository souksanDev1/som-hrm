const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Expo SDK 52+ detects the pnpm workspace (watchFolders / nodeModulesPaths) automatically.
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
