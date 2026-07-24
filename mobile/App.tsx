import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  requestNeededAndroidPermissions,
  useStripeTerminal,
} from '@stripe/stripe-terminal-react-native';
import { Button } from './src/components/Button';
import { Logo } from './src/components/Logo';
import {
  PROMO_MESSAGES,
  PromoReason,
  capturePaymentIntent,
  createPaymentIntentClientSecret,
  createSimulatorPaymentIntent,
  getQrCodeImageUrl,
  getSimulatorPaymentStatus,
  validatePromo,
} from './src/api';
import { getApiBaseUrl, isSimulatorMode, PAYMENT_AMOUNT_LABEL } from './src/config';
import { playPromoFailed, playPromoSuccess } from './src/sounds';
import { theme } from './src/theme';

type Screen =
  | 'home'
  | 'processing'
  | 'payment-success'
  | 'payment-failed'
  | 'promo-entry'
  | 'promo-success'
  | 'promo-failed'
  | 'simulator-pay-qr';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [hasPerms, setHasPerms] = useState(Platform.OS !== 'android');
  const [readerReady, setReaderReady] = useState(isSimulatorMode());
  const [busy, setBusy] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState(PROMO_MESSAGES.invalid_code);
  const [statusText, setStatusText] = useState(
    isSimulatorMode()
      ? 'Simulator preview — Pay Now shows a QR code for test checkout'
      : 'Connecting to reader…',
  );
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const successTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paymentPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    initialize,
    easyConnect,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    cancelCollectPaymentMethod,
    connectedReader,
  } = useStripeTerminal({
    onDidChangeConnectionStatus: (status) => {
      if (status === 'connected') {
        setReaderReady(true);
        setStatusText('');
      }
    },
  });

  const markReaderReady = useCallback(() => {
    setReaderReady(true);
    setStatusText('');
  }, []);

  const connectToReader = useCallback(async () => {
    setReaderReady(false);
    setStatusText('Connecting to reader…');
    const { reader, error } = await easyConnect({ discoveryMethod: 'appsOnDevices' });
    if (error) {
      setReaderReady(false);
      setStatusText(`Reader error: ${error.message}`);
      return;
    }
    if (reader || connectedReader) {
      markReaderReady();
    }
  }, [easyConnect, connectedReader, markReaderReady]);

  useEffect(() => {
    if (connectedReader) {
      markReaderReady();
    }
  }, [connectedReader, markReaderReady]);

  useEffect(() => {
    async function requestPermissions() {
      const { error } = await requestNeededAndroidPermissions({
        accessFineLocation: {
          title: 'Location Permission',
          message: 'Stripe Terminal needs access to your location',
          buttonPositive: 'Accept',
        },
      });
      if (!error) {
        setHasPerms(true);
      } else {
        Alert.alert('Permissions required', 'Location access is required for Terminal.');
      }
    }
    if (Platform.OS === 'android') {
      requestPermissions();
    }
  }, []);

  useEffect(() => {
    if (isSimulatorMode()) {
      return;
    }
    async function boot() {
      const result = await initialize();
      if (result.error) {
        setStatusText(`Init error: ${result.error.message}`);
        return;
      }
      if (result.reader) {
        markReaderReady();
        return;
      }
      await connectToReader();
    }
    if (hasPerms) {
      boot();
    }
  }, [hasPerms, initialize, connectToReader, markReaderReady]);

  useEffect(() => {
    return () => {
      if (successTimeout.current) {
        clearTimeout(successTimeout.current);
      }
      if (paymentPollRef.current) {
        clearInterval(paymentPollRef.current);
      }
    };
  }, []);

  const stopPaymentPolling = () => {
    if (paymentPollRef.current) {
      clearInterval(paymentPollRef.current);
      paymentPollRef.current = null;
    }
  };

  const startPaymentPolling = (piId: string) => {
    stopPaymentPolling();
    paymentPollRef.current = setInterval(async () => {
      try {
        const { piStatus } = await getSimulatorPaymentStatus(piId);
        if (piStatus === 'succeeded') {
          stopPaymentPolling();
          setScreen('payment-success');
          successTimeout.current = setTimeout(goHome, 5000);
        }
      } catch {
        // Keep polling — transient network errors are expected.
      }
    }, 2000);
  };

  const goHome = () => {
    stopPaymentPolling();
    setPayUrl(null);
    setPayError(null);
    if (successTimeout.current) {
      clearTimeout(successTimeout.current);
      successTimeout.current = null;
    }
    setScreen('home');
    setBusy(false);
  };

  const handlePayNow = async () => {
    if (!readerReady || busy) {
      return;
    }

    if (isSimulatorMode()) {
      setBusy(true);
      setPayUrl(null);
      setPayError(null);
      setScreen('simulator-pay-qr');
      try {
        const result = await createSimulatorPaymentIntent();
        setPayUrl(result.payUrl);
        startPaymentPolling(result.paymentIntentId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not create payment';
        setPayError(message);
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    setScreen('processing');
    setStatusText('Preparing payment…');

    try {
      const clientSecret = await createPaymentIntentClientSecret();
      const { paymentIntent, error: retrieveError } = await retrievePaymentIntent(clientSecret);
      if (retrieveError || !paymentIntent) {
        throw new Error(retrieveError?.message || 'Could not retrieve payment intent');
      }

      setStatusText('Present card on reader…');
      const { paymentIntent: collected, error: collectError } = await collectPaymentMethod({
        paymentIntent,
        skipTipping: true,
      });
      if (collectError) {
        throw new Error(collectError.message);
      }
      if (!collected) {
        throw new Error('Payment was not collected');
      }

      const { paymentIntent: confirmed, error: confirmError } = await confirmPaymentIntent({
        paymentIntent: collected,
      });
      if (confirmError || !confirmed) {
        throw new Error(confirmError?.message || 'Could not confirm payment');
      }

      if ((confirmed.status as string) === 'requires_capture') {
        await capturePaymentIntent(confirmed.id);
      }

      setScreen('payment-success');
      successTimeout.current = setTimeout(goHome, 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment failed';
      if (message.toLowerCase().includes('cancel')) {
        goHome();
        return;
      }
      Alert.alert('Payment unsuccessful', message);
      setScreen('payment-failed');
    } finally {
      setBusy(false);
      setStatusText('');
    }
  };

  const handleCancelPayment = async () => {
    await cancelCollectPaymentMethod();
    goHome();
  };

  const handleValidatePromo = async () => {
    if (!promoCode.trim() || busy) {
      return;
    }
    setBusy(true);
    try {
      const result = await validatePromo(promoCode.trim());
      if (result.valid) {
        playPromoSuccess();
        setScreen('promo-success');
      } else {
        playPromoFailed();
        setPromoError(PROMO_MESSAGES[result.reason as PromoReason] || PROMO_MESSAGES.invalid_code);
        setScreen('promo-failed');
      }
    } catch {
      Alert.alert('Network error', `Could not reach backend at ${getApiBaseUrl()}`);
    } finally {
      setBusy(false);
    }
  };

  const renderHome = () => (
    <View style={styles.screenBody}>
      <Logo />
      {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
      <View style={styles.buttonGroup}>
        <Button
          label="Pay Now"
          onPress={handlePayNow}
          disabled={!readerReady || busy}
          level
        />
        <Button
          label="Pay with Promo"
          onPress={() => {
            setPromoCode('');
            setScreen('promo-entry');
          }}
          variant="secondary"
          level
        />
      </View>
    </View>
  );

  const renderProcessing = () => (
    <View style={styles.screenBody}>
      <Logo small />
      <ActivityIndicator size="large" color={theme.pink} />
      <Text style={styles.title}>Waiting for card…</Text>
      <Text style={styles.subText}>{statusText || 'Please tap, insert, or swipe on the reader.'}</Text>
      <Button label="Cancel" onPress={handleCancelPayment} variant="secondary" />
    </View>
  );

  const renderPaymentSuccess = () => (
    <View style={styles.screenBody}>
      <View style={[styles.iconCircle, styles.iconSuccess]}>
        <Text style={styles.iconGlyph}>✓</Text>
      </View>
      <Text style={styles.title}>Payment successful!</Text>
      <Text style={styles.amount}>{PAYMENT_AMOUNT_LABEL}</Text>
      <Button label="Done" onPress={goHome} />
    </View>
  );

  const renderPaymentFailed = () => (
    <View style={styles.screenBody}>
      <View style={[styles.iconCircle, styles.iconError]}>
        <Text style={styles.iconGlyph}>✗</Text>
      </View>
      <Text style={styles.title}>Payment unsuccessful</Text>
      <Text style={styles.subText}>Please try again or contact staff.</Text>
      <Button label="Try Again" onPress={goHome} />
    </View>
  );

  const renderPromoEntry = () => (
    <View style={styles.screenBody}>
      <Logo small />
      <Text style={[styles.title, styles.levelControl]}>Enter Promo Code</Text>
      <TextInput
        style={[styles.promoInput, styles.levelControl]}
        value={promoCode}
        onChangeText={(value) => setPromoCode(value.toUpperCase())}
        placeholder="e.g. DEMO2026"
        placeholderTextColor="rgba(255, 45, 138, 0.4)"
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <View style={styles.buttonGroup}>
        <Button label="Validate" onPress={handleValidatePromo} loading={busy} disabled={busy} level />
        <Button label="Back" onPress={goHome} variant="secondary" level />
      </View>
    </View>
  );

  const renderPromoSuccess = () => (
    <View style={styles.screenBody}>
      <View style={[styles.iconCircle, styles.iconSuccess]}>
        <Text style={styles.iconGlyph}>✓</Text>
      </View>
      <Text style={[styles.title, styles.levelControl]}>Promo code accepted!</Text>
      <Button label="Done" onPress={goHome} level />
    </View>
  );

  const renderPromoFailed = () => (
    <View style={styles.screenBody}>
      <View style={[styles.iconCircle, styles.iconError]}>
        <Text style={styles.iconGlyph}>✗</Text>
      </View>
      <Text style={[styles.title, styles.levelControl]}>{promoError}</Text>
      <Button label="Try Again" onPress={() => setScreen('promo-entry')} level />
    </View>
  );

  const renderSimulatorPayQr = () => (
    <View style={styles.screenBody}>
      <Logo small />
      <Text style={[styles.title, styles.levelControl]}>Scan to pay</Text>
      <Text style={styles.subText}>{PAYMENT_AMOUNT_LABEL}</Text>
      {payError ? (
        <Text style={styles.payError}>{payError}</Text>
      ) : payUrl ? (
        <View style={styles.qrFrame}>
          <Image
            source={{ uri: getQrCodeImageUrl(payUrl) }}
            style={styles.qrImage}
            accessibilityLabel="Payment QR code"
          />
        </View>
      ) : (
        <ActivityIndicator size="large" color={theme.pink} />
      )}
      <Text style={styles.subText}>
        Scan with your phone camera, then pay with test card 4242 4242 4242 4242.
      </Text>
      <Button label="Cancel" onPress={goHome} variant="secondary" level />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.white} />
      {screen === 'home' && renderHome()}
      {screen === 'processing' && renderProcessing()}
      {screen === 'payment-success' && renderPaymentSuccess()}
      {screen === 'payment-failed' && renderPaymentFailed()}
      {screen === 'promo-entry' && renderPromoEntry()}
      {screen === 'promo-success' && renderPromoSuccess()}
      {screen === 'promo-failed' && renderPromoFailed()}
      {screen === 'simulator-pay-qr' && renderSimulatorPayQr()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.white,
  },
  screenBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 28,
  },
  buttonGroup: {
    width: '100%',
    gap: 16,
    marginTop: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: theme.black,
    textAlign: 'center',
    transform: [{ rotate: '-6deg' }],
  },
  subText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.slate,
    textAlign: 'center',
  },
  amount: {
    fontSize: 24,
    fontWeight: '800',
    fontStyle: 'italic',
    color: theme.pink,
    textTransform: 'uppercase',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.slate,
    textAlign: 'center',
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    transform: [{ rotate: '-6deg' }],
  },
  iconSuccess: {
    backgroundColor: theme.pinkDim,
    borderColor: theme.pink,
  },
  iconError: {
    backgroundColor: 'rgba(255, 45, 138, 0.08)',
    borderColor: theme.pink,
  },
  iconGlyph: {
    fontSize: 44,
    fontWeight: '800',
    color: theme.pink,
  },
  promoInput: {
    width: '100%',
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.pink,
    backgroundColor: theme.white,
    color: theme.pink,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    fontStyle: 'italic',
    letterSpacing: 2,
    textTransform: 'uppercase',
    transform: [{ rotate: '-6deg' }],
  },
  levelControl: {
    transform: [{ rotate: '0deg' }],
  },
  qrFrame: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.pink,
    backgroundColor: theme.white,
  },
  qrImage: {
    width: 220,
    height: 220,
  },
  payError: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.pink,
    textAlign: 'center',
  },
});
