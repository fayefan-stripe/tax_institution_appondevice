import React from 'react';
import {
  AppsOnDevicesConnectionTokenProvider,
  StripeTerminalProvider,
} from '@stripe/stripe-terminal-react-native';
import App from './App';

export default function Root() {
  return (
    <StripeTerminalProvider
      logLevel="verbose"
      tokenProvider={AppsOnDevicesConnectionTokenProvider}
    >
      <App />
    </StripeTerminalProvider>
  );
}
