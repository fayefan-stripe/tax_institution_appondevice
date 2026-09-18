let currentPaymentIntentId = null;
let pollInterval = null;
let successTimeout = null;
let customerSearchTimer = null;

let selectedCustomer = null;
let selectedProduct = null;
let lastAmountLabel = '';

function formatMoney(amountCents, currency = 'aud') {
  const amount = amountCents / 100;
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

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

function updateCustomerSelectionUI() {
  const hint = document.getElementById('customer-selected-hint');
  const continueBtn = document.getElementById('btn-continue-customer');
  if (selectedCustomer) {
    hint.hidden = false;
    hint.textContent = selectedCustomer.email
      ? `Selected: ${selectedCustomer.name} (${selectedCustomer.email})`
      : `Selected: ${selectedCustomer.name}`;
    continueBtn.disabled = false;
  } else {
    hint.hidden = true;
    hint.textContent = '';
    continueBtn.disabled = true;
  }
}

function selectCustomer(customer) {
  selectedCustomer = customer;
  const search = document.getElementById('customer-search');
  search.value = customer.email ? `${customer.name} · ${customer.email}` : customer.name;
  document.getElementById('customer-dropdown').hidden = true;
  updateCustomerSelectionUI();
}

function resetCheckout() {
  stopPolling();
  clearSuccessTimeout();
  currentPaymentIntentId = null;
  selectedCustomer = null;
  selectedProduct = null;
  lastAmountLabel = '';
  document.getElementById('customer-search').value = '';
  document.getElementById('create-customer-panel').hidden = true;
  document.getElementById('btn-toggle-create-customer').textContent = 'Create new customer';
  updateCustomerSelectionUI();
  showScreen('screen-customer-select');
  loadCustomers('');
}

async function loadCustomers(query = '') {
  const dropdown = document.getElementById('customer-dropdown');
  dropdown.hidden = false;
  dropdown.innerHTML = '<p class="dropdown-empty">Loading…</p>';
  try {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    const qs = params.toString();
    const res = await fetch(`/api/customers${qs ? `?${qs}` : ''}`);
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || 'Failed to load customers');
    }
    if (!data.customers.length) {
      dropdown.innerHTML = '<p class="dropdown-empty">No customers found</p>';
      return;
    }
    dropdown.innerHTML = '';
    data.customers.forEach((customer) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dropdown-item';
      if (selectedCustomer?.id === customer.id) {
        btn.classList.add('selected');
      }
      btn.innerHTML = `<span class="list-item-title">${customer.name}</span>${
        customer.email ? `<span class="list-item-detail">${customer.email}</span>` : ''
      }`;
      btn.addEventListener('click', () => selectCustomer(customer));
      dropdown.appendChild(btn);
    });
  } catch (err) {
    dropdown.innerHTML = `<p class="error-text">${err.message}</p>`;
  }
}

async function loadProducts() {
  const list = document.getElementById('product-list');
  list.innerHTML = '<p class="sub-text">Loading…</p>';
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || 'Failed to load products');
    }
    if (!data.products.length) {
      list.innerHTML = '<p class="sub-text">No products yet. Create one to continue.</p>';
      return;
    }
    list.innerHTML = '';
    data.products.forEach((product) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'list-item';
      const priceLabel =
        product.unitAmount != null ? formatMoney(product.unitAmount, product.currency) : '';
      btn.innerHTML = `<span class="list-item-title">${product.name}</span>${
        priceLabel ? `<span class="list-item-detail">${priceLabel}</span>` : ''
      }`;
      btn.addEventListener('click', () => {
        selectedProduct = product;
        updateReview();
        showScreen('screen-review');
      });
      list.appendChild(btn);
    });
  } catch (err) {
    list.innerHTML = `<p class="error-text">${err.message}</p>`;
  }
}

function updateReview() {
  document.getElementById('review-customer').textContent = selectedCustomer?.name || '';
  document.getElementById('review-product').textContent = selectedProduct?.name || '';
  lastAmountLabel =
    selectedProduct?.unitAmount != null
      ? formatMoney(selectedProduct.unitAmount, selectedProduct.currency)
      : '';
  document.getElementById('review-amount').textContent = lastAmountLabel;
}

function parseDollarsToCents(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100);
}

async function saveCustomer() {
  const name = document.getElementById('customer-name').value.trim();
  const email = document.getElementById('customer-email').value.trim();
  if (!name) {
    alert('Name is required.');
    return;
  }
  try {
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email: email || undefined }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || 'Could not create customer');
    }
    selectCustomer(data.customer);
    document.getElementById('create-customer-panel').hidden = true;
    document.getElementById('btn-toggle-create-customer').textContent = 'Create new customer';
    document.getElementById('customer-name').value = '';
    document.getElementById('customer-email').value = '';
    document.getElementById('product-select-subtitle').textContent =
      `Customer: ${selectedCustomer.name}`;
    showScreen('screen-product-select');
    loadProducts();
  } catch (err) {
    alert(err.message);
  }
}

async function saveProduct() {
  const name = document.getElementById('product-name').value.trim();
  const unitAmount = parseDollarsToCents(document.getElementById('product-amount').value);
  if (!name || unitAmount === null) {
    alert('Enter a product name and price greater than zero.');
    return;
  }
  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, unitAmount }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || 'Could not create product');
    }
    selectedProduct = data.product;
    updateReview();
    showScreen('screen-review');
  } catch (err) {
    alert(err.message);
  }
}

async function startPayment() {
  if (!selectedCustomer?.id || !selectedProduct?.priceId) {
    alert('Select a customer and product first.');
    return;
  }

  stopPolling();
  clearSuccessTimeout();

  try {
    const res = await fetch('/api/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: selectedCustomer.id,
        priceId: selectedProduct.priceId,
      }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      alert(data.error || 'Failed to start payment.');
      return;
    }

    currentPaymentIntentId = data.paymentIntentId;
    if (data.amount != null) {
      lastAmountLabel = formatMoney(data.amount, data.currency || 'aud');
    }
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
      document.getElementById('success-amount').textContent = lastAmountLabel;
      showScreen('screen-payment-success');
      successTimeout = setTimeout(resetCheckout, 5000);
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
      // Proceed even if cancel fails
    }
    currentPaymentIntentId = null;
  }

  showScreen('screen-review');
}

const customerSearchInput = document.getElementById('customer-search');
customerSearchInput.addEventListener('focus', () => {
  loadCustomers(customerSearchInput.value);
});
customerSearchInput.addEventListener('input', () => {
  selectedCustomer = null;
  updateCustomerSelectionUI();
  if (customerSearchTimer) clearTimeout(customerSearchTimer);
  customerSearchTimer = setTimeout(() => {
    loadCustomers(customerSearchInput.value);
  }, 300);
});

document.getElementById('btn-continue-customer').addEventListener('click', () => {
  if (!selectedCustomer) return;
  document.getElementById('product-select-subtitle').textContent =
    `Customer: ${selectedCustomer.name}`;
  showScreen('screen-product-select');
  loadProducts();
});

document.getElementById('btn-toggle-create-customer').addEventListener('click', () => {
  const panel = document.getElementById('create-customer-panel');
  const open = panel.hidden;
  panel.hidden = !open;
  document.getElementById('btn-toggle-create-customer').textContent = open
    ? 'Hide create form'
    : 'Create new customer';
  if (open) {
    document.getElementById('customer-name').value = '';
    document.getElementById('customer-email').value = '';
  }
});

document.getElementById('btn-save-customer').addEventListener('click', saveCustomer);

document.getElementById('btn-new-product').addEventListener('click', () => {
  document.getElementById('product-name').value = '';
  document.getElementById('product-amount').value = '';
  showScreen('screen-product-create');
});
document.getElementById('btn-refresh-products').addEventListener('click', loadProducts);
document.getElementById('btn-product-back').addEventListener('click', () => {
  showScreen('screen-customer-select');
  loadCustomers(customerSearchInput.value);
});
document.getElementById('btn-save-product').addEventListener('click', saveProduct);
document.getElementById('btn-product-create-back').addEventListener('click', () => {
  showScreen('screen-product-select');
});

document.getElementById('btn-collect-payment').addEventListener('click', startPayment);
document.getElementById('btn-review-change-product').addEventListener('click', () => {
  showScreen('screen-product-select');
  loadProducts();
});
document.getElementById('btn-review-change-customer').addEventListener('click', () => {
  showScreen('screen-customer-select');
  loadCustomers(customerSearchInput.value);
});

document.getElementById('btn-cancel-payment').addEventListener('click', cancelPayment);
document.getElementById('btn-payment-done').addEventListener('click', resetCheckout);
document.getElementById('btn-payment-retry').addEventListener('click', () => showScreen('screen-review'));

updateCustomerSelectionUI();
loadCustomers('');
