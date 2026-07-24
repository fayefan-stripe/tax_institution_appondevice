let currentPaymentIntentId = null;
let pollInterval = null;
let successTimeout = null;

const PROMO_MESSAGES = {
  invalid_code: 'Invalid promo code. Please try again.',
  not_yet_active: 'This promo code is not active yet.',
  expired: 'This promo code has expired.',
};

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.remove('active');
  });
  document.getElementById(id).classList.add('active');
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function clearSuccessTimeout() {
  if (successTimeout) {
    clearTimeout(successTimeout);
    successTimeout = null;
  }
}

async function startPayment() {
  stopPolling();
  clearSuccessTimeout();

  try {
    const res = await fetch('/api/pay', { method: 'POST' });
    const data = await res.json();

    if (!res.ok || data.error) {
      alert(data.error || 'Failed to start payment.');
      return;
    }

    currentPaymentIntentId = data.paymentIntentId;
    showScreen('screen-processing');
    startPolling();
  } catch {
    alert('Network error. Please try again.');
  }
}

function startPolling() {
  pollInterval = setInterval(checkPaymentStatus, 2000);
  checkPaymentStatus();
}

async function checkPaymentStatus() {
  if (!currentPaymentIntentId) return;

  try {
    const res = await fetch(`/api/payment-status/${currentPaymentIntentId}`);
    const data = await res.json();

    if (!res.ok || data.error) return;

    if (data.piStatus === 'succeeded') {
      stopPolling();
      showScreen('screen-payment-success');
      successTimeout = setTimeout(() => showScreen('screen-home'), 5000);
      return;
    }

    if (
      data.readerActionStatus === 'failed' ||
      data.piStatus === 'payment_failed' ||
      data.piStatus === 'canceled'
    ) {
      stopPolling();
      showScreen('screen-payment-failed');
    }
  } catch {
    // Keep polling on transient network errors
  }
}

async function cancelPayment() {
  stopPolling();

  if (currentPaymentIntentId) {
    try {
      await fetch('/api/cancel-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: currentPaymentIntentId }),
      });
    } catch {
      // Proceed to home even if cancel fails
    }
    currentPaymentIntentId = null;
  }

  showScreen('screen-home');
}

async function validatePromo() {
  const input = document.getElementById('promo-input');
  const code = input.value.trim();

  if (!code) return;

  const btn = document.getElementById('btn-validate-promo');
  const label = document.getElementById('validate-label');
  const spinner = document.getElementById('validate-spinner');

  btn.disabled = true;
  label.classList.add('hidden');
  spinner.classList.remove('hidden');

  try {
    const res = await fetch('/api/validate-promo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();

    if (data.valid) {
      showScreen('screen-promo-success');
    } else {
      document.getElementById('promo-failed-message').textContent =
        PROMO_MESSAGES[data.reason] || PROMO_MESSAGES.invalid_code;
      showScreen('screen-promo-failed');
    }
  } catch {
    alert('Network error. Please try again.');
  } finally {
    btn.disabled = false;
    label.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
}

document.getElementById('btn-pay-now').addEventListener('click', startPayment);
document.getElementById('btn-pay-promo').addEventListener('click', () => {
  document.getElementById('promo-input').value = '';
  showScreen('screen-promo-entry');
});
document.getElementById('btn-cancel-payment').addEventListener('click', cancelPayment);
document.getElementById('btn-payment-done').addEventListener('click', () => {
  clearSuccessTimeout();
  showScreen('screen-home');
});
document.getElementById('btn-payment-retry').addEventListener('click', () => showScreen('screen-home'));
document.getElementById('btn-promo-back').addEventListener('click', () => showScreen('screen-home'));
document.getElementById('btn-promo-done').addEventListener('click', () => showScreen('screen-home'));
document.getElementById('btn-promo-retry').addEventListener('click', () => showScreen('screen-promo-entry'));
document.getElementById('btn-validate-promo').addEventListener('click', validatePromo);

document.getElementById('promo-input').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase();
});

document.getElementById('promo-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') validatePromo();
});
