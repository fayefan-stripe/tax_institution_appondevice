import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
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
import { AppHeader } from './src/components/AppHeader';
import { Button } from './src/components/Button';
import {
  StripeCustomer,
  StripeProduct,
  capturePaymentIntent,
  createCustomer,
  createPaymentIntentClientSecret,
  createProduct,
  createSimulatorPaymentIntent,
  getQrCodeImageUrl,
  getSimulatorPaymentStatus,
  listCustomers,
  listProducts,
} from './src/api';
import { formatMoney, getApiBaseUrl, isSimulatorMode } from './src/config';
import { theme } from './src/theme';

type Screen =
  | 'customer-select'
  | 'customer-create'
  | 'product-select'
  | 'product-create'
  | 'review'
  | 'processing'
  | 'payment-success'
  | 'payment-failed'
  | 'simulator-pay-qr';

function parseDollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return Math.round(num * 100);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('customer-select');
  const [hasPerms, setHasPerms] = useState(Platform.OS !== 'android');
  const [readerReady, setReaderReady] = useState(isSimulatorMode());
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState(
    isSimulatorMode()
      ? 'Simulator preview — card payments use a QR test checkout'
      : 'Connecting to reader…',
  );

  const [customers, setCustomers] = useState<StripeCustomer[]>([]);
  const [products, setProducts] = useState<StripeProduct[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<StripeCustomer | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<StripeProduct | null>(null);
  const [lastAmountLabel, setLastAmountLabel] = useState('');

  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [newProductAmount, setNewProductAmount] = useState('');

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

  const resetCheckout = () => {
    stopPaymentPolling();
    setPayUrl(null);
    setPayError(null);
    setSelectedCustomer(null);
    setSelectedProduct(null);
    setNewCustomerName('');
    setNewCustomerEmail('');
    setNewProductName('');
    setNewProductAmount('');
    if (successTimeout.current) {
      clearTimeout(successTimeout.current);
      successTimeout.current = null;
    }
    setScreen('customer-select');
    setBusy(false);
  };

  const loadCustomers = async () => {
    setBusy(true);
    try {
      setCustomers(await listCustomers());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load customers';
      Alert.alert('Error', `${message}\n\nBackend: ${getApiBaseUrl()}`);
    } finally {
      setBusy(false);
    }
  };

  const loadProducts = async () => {
    setBusy(true);
    try {
      setProducts(await listProducts());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load products';
      Alert.alert('Error', message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (screen === 'customer-select') {
      loadCustomers();
    }
  }, [screen]);

  useEffect(() => {
    if (screen === 'product-select') {
      loadProducts();
    }
  }, [screen]);

  const startPaymentPolling = (piId: string) => {
    stopPaymentPolling();
    paymentPollRef.current = setInterval(async () => {
      try {
        const { piStatus } = await getSimulatorPaymentStatus(piId);
        if (piStatus === 'succeeded') {
          stopPaymentPolling();
          setScreen('payment-success');
          successTimeout.current = setTimeout(resetCheckout, 5000);
        }
      } catch {
        // Keep polling on transient errors.
      }
    }, 2000);
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim() || busy) {
      return;
    }
    setBusy(true);
    try {
      const customer = await createCustomer({
        name: newCustomerName.trim(),
        email: newCustomerEmail.trim() || undefined,
      });
      setSelectedCustomer(customer);
      setScreen('product-select');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not create customer');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateProduct = async () => {
    const unitAmount = parseDollarsToCents(newProductAmount);
    if (!newProductName.trim() || unitAmount === null || busy) {
      Alert.alert('Invalid product', 'Enter a name and price greater than zero.');
      return;
    }
    setBusy(true);
    try {
      const product = await createProduct({ name: newProductName.trim(), unitAmount });
      setSelectedProduct(product);
      setScreen('review');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not create product');
    } finally {
      setBusy(false);
    }
  };

  const handleCollectPayment = async () => {
    if (!selectedCustomer?.id || !selectedProduct?.priceId || !readerReady || busy) {
      return;
    }

    const checkout = { customerId: selectedCustomer.id, priceId: selectedProduct.priceId };
    const amountLabel = formatMoney(
      selectedProduct.unitAmount ?? 0,
      selectedProduct.currency,
    );
    setLastAmountLabel(amountLabel);

    if (isSimulatorMode()) {
      setBusy(true);
      setPayUrl(null);
      setPayError(null);
      setScreen('simulator-pay-qr');
      try {
        const result = await createSimulatorPaymentIntent(checkout);
        setPayUrl(result.payUrl);
        setLastAmountLabel(formatMoney(result.amount, result.currency));
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
      const { clientSecret } = await createPaymentIntentClientSecret(checkout);
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
      successTimeout.current = setTimeout(resetCheckout, 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment failed';
      if (message.toLowerCase().includes('cancel')) {
        setScreen('review');
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
    setScreen('review');
  };

  const renderCustomerSelect = () => (
    <ScrollView contentContainerStyle={styles.scrollBody}>
      <AppHeader subtitle="Select a customer" />
      {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
      {busy && customers.length === 0 ? (
        <ActivityIndicator size="large" color={theme.primary} />
      ) : (
        <View style={styles.list}>
          {customers.map((c) => (
            <Pressable
              key={c.id}
              style={({ pressed }) => [styles.listItem, pressed && styles.listItemPressed]}
              onPress={() => {
                setSelectedCustomer(c);
                setScreen('product-select');
              }}
            >
              <Text style={styles.listItemTitle}>{c.name}</Text>
              {c.email ? <Text style={styles.listItemDetail}>{c.email}</Text> : null}
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.buttonGroup}>
        <Button
          label="Create new customer"
          onPress={() => setScreen('customer-create')}
          variant="secondary"
        />
        <Button label="Refresh list" onPress={loadCustomers} loading={busy} disabled={busy} />
      </View>
    </ScrollView>
  );

  const renderCustomerCreate = () => (
    <ScrollView contentContainerStyle={styles.scrollBody}>
      <AppHeader subtitle="New customer" compact />
      <TextInput
        style={styles.input}
        value={newCustomerName}
        onChangeText={setNewCustomerName}
        placeholder="Full name"
        placeholderTextColor={theme.slate}
      />
      <TextInput
        style={styles.input}
        value={newCustomerEmail}
        onChangeText={setNewCustomerEmail}
        placeholder="Email (optional)"
        placeholderTextColor={theme.slate}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <View style={styles.buttonGroup}>
        <Button label="Save customer" onPress={handleCreateCustomer} loading={busy} disabled={busy} />
        <Button
          label="Back"
          onPress={() => setScreen('customer-select')}
          variant="secondary"
        />
      </View>
    </ScrollView>
  );

  const renderProductSelect = () => (
    <ScrollView contentContainerStyle={styles.scrollBody}>
      <AppHeader
        subtitle={selectedCustomer ? `Customer: ${selectedCustomer.name}` : 'Select a product'}
        compact
      />
      {busy && products.length === 0 ? (
        <ActivityIndicator size="large" color={theme.primary} />
      ) : (
        <View style={styles.list}>
          {products.map((p) => (
            <Pressable
              key={p.id}
              style={({ pressed }) => [styles.listItem, pressed && styles.listItemPressed]}
              onPress={() => {
                setSelectedProduct(p);
                setScreen('review');
              }}
            >
              <Text style={styles.listItemTitle}>{p.name}</Text>
              {p.unitAmount != null ? (
                <Text style={styles.listItemDetail}>{formatMoney(p.unitAmount, p.currency)}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.buttonGroup}>
        <Button
          label="Create new product"
          onPress={() => setScreen('product-create')}
          variant="secondary"
        />
        <Button label="Back" onPress={() => setScreen('customer-select')} variant="secondary" />
        <Button label="Refresh list" onPress={loadProducts} loading={busy} disabled={busy} />
      </View>
    </ScrollView>
  );

  const renderProductCreate = () => (
    <ScrollView contentContainerStyle={styles.scrollBody}>
      <AppHeader subtitle="New product" compact />
      <TextInput
        style={styles.input}
        value={newProductName}
        onChangeText={setNewProductName}
        placeholder="Product name"
        placeholderTextColor={theme.slate}
      />
      <TextInput
        style={styles.input}
        value={newProductAmount}
        onChangeText={setNewProductAmount}
        placeholder="Price in AUD (e.g. 8.00)"
        placeholderTextColor={theme.slate}
        keyboardType="decimal-pad"
      />
      <View style={styles.buttonGroup}>
        <Button label="Save product" onPress={handleCreateProduct} loading={busy} disabled={busy} />
        <Button label="Back" onPress={() => setScreen('product-select')} variant="secondary" />
      </View>
    </ScrollView>
  );

  const renderReview = () => {
    const amountLabel =
      selectedProduct?.unitAmount != null
        ? formatMoney(selectedProduct.unitAmount, selectedProduct.currency)
        : '';
    return (
      <View style={styles.screenBody}>
        <AppHeader subtitle="Review and pay" compact />
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Customer</Text>
          <Text style={styles.summaryValue}>{selectedCustomer?.name}</Text>
          <Text style={styles.summaryLabel}>Product</Text>
          <Text style={styles.summaryValue}>{selectedProduct?.name}</Text>
          <Text style={styles.summaryLabel}>Amount</Text>
          <Text style={styles.summaryAmount}>{amountLabel}</Text>
        </View>
        <View style={styles.buttonGroup}>
          <Button
            label="Collect payment"
            onPress={handleCollectPayment}
            disabled={!readerReady || busy}
            loading={busy}
          />
          <Button
            label="Change product"
            onPress={() => setScreen('product-select')}
            variant="secondary"
          />
          <Button
            label="Change customer"
            onPress={() => setScreen('customer-select')}
            variant="secondary"
          />
        </View>
      </View>
    );
  };

  const renderProcessing = () => (
    <View style={styles.screenBody}>
      <AppHeader compact />
      <ActivityIndicator size="large" color={theme.primary} />
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
      <Text style={styles.title}>Payment successful</Text>
      <Text style={styles.amount}>{lastAmountLabel}</Text>
      <Button label="Done" onPress={resetCheckout} />
    </View>
  );

  const renderPaymentFailed = () => (
    <View style={styles.screenBody}>
      <View style={[styles.iconCircle, styles.iconError]}>
        <Text style={styles.iconGlyph}>✗</Text>
      </View>
      <Text style={styles.title}>Payment unsuccessful</Text>
      <Text style={styles.subText}>Please try again or contact staff.</Text>
      <Button label="Try again" onPress={() => setScreen('review')} />
    </View>
  );

  const renderSimulatorPayQr = () => (
    <View style={styles.screenBody}>
      <AppHeader subtitle="Scan to pay" compact />
      <Text style={styles.amount}>{lastAmountLabel}</Text>
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
        <ActivityIndicator size="large" color={theme.primary} />
      )}
      <Text style={styles.subText}>
        Scan with your phone camera, then pay with test card 4242 4242 4242 4242.
      </Text>
      <Button label="Cancel" onPress={resetCheckout} variant="secondary" />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.white} />
      {screen === 'customer-select' && renderCustomerSelect()}
      {screen === 'customer-create' && renderCustomerCreate()}
      {screen === 'product-select' && renderProductSelect()}
      {screen === 'product-create' && renderProductCreate()}
      {screen === 'review' && renderReview()}
      {screen === 'processing' && renderProcessing()}
      {screen === 'payment-success' && renderPaymentSuccess()}
      {screen === 'payment-failed' && renderPaymentFailed()}
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
    gap: 20,
  },
  scrollBody: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 16,
  },
  buttonGroup: {
    width: '100%',
    gap: 12,
    marginTop: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.navy,
    textAlign: 'center',
  },
  subText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.slate,
    textAlign: 'center',
  },
  amount: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.primary,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.slate,
    textAlign: 'center',
  },
  list: {
    width: '100%',
    gap: 10,
  },
  listItem: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(10, 37, 64, 0.12)',
    backgroundColor: theme.white,
  },
  listItemPressed: {
    backgroundColor: theme.primaryDim,
  },
  listItemTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.navy,
  },
  listItemDetail: {
    fontSize: 14,
    color: theme.slate,
    marginTop: 4,
  },
  input: {
    width: '100%',
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(10, 37, 64, 0.2)',
    paddingHorizontal: 14,
    fontSize: 16,
    color: theme.navy,
  },
  summaryCard: {
    width: '100%',
    padding: 20,
    borderRadius: 12,
    backgroundColor: theme.primaryDim,
    gap: 6,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.slate,
    marginTop: 8,
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.navy,
  },
  summaryAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.primary,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },
  iconSuccess: {
    backgroundColor: 'rgba(0, 214, 107, 0.12)',
    borderColor: theme.success,
  },
  iconError: {
    backgroundColor: 'rgba(255, 68, 68, 0.08)',
    borderColor: theme.error,
  },
  iconGlyph: {
    fontSize: 44,
    fontWeight: '700',
    color: theme.navy,
  },
  qrFrame: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(10, 37, 64, 0.12)',
    backgroundColor: theme.white,
  },
  qrImage: {
    width: 220,
    height: 220,
  },
  payError: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.error,
    textAlign: 'center',
  },
});
