import React, { useCallback } from 'react';
import { StripeTerminalProvider } from '@stripe/stripe-terminal-react-native';
import App from './App';
import { fetchConnectionToken } from './src/api';

export default function Root() {
  // Use backend connection tokens instead of AppsOnDevicesConnectionTokenProvider.
  // Some readers reject device-side CreateConnectionToken even when the app is
  // Dashboard-approved and deployed as the preferred kiosk.
  const tokenProvider = useCallback(async () => {
    console.log('[Stripe terminal]: tokenProvider mode: backend /api/connection-token');
    return fetchConnectionToken();
  }, []);

  return (
    <StripeTerminalProvider logLevel="verbose" tokenProvider={tokenProvider}>
      <App />
    </StripeTerminalProvider>
  );
}
