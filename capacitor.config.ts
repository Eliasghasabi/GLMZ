import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.eliasghasabi.shadowstrike',
  appName: 'Shadow Strike',
  webDir: 'dist',
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  server: {
    androidScheme: 'https',
  },
  backgroundColor: '#05070b',
  androidBackgroundColor: '#05070b',
};

export default config;
