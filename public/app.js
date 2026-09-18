let currentPaymentIntentId = null;
let pollInterval = null;
let successTimeout = null;
let customerSearchTimer = null;
let productSearchTimer = null;

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

function updateCheckoutUI() {
  const customerHint = document.getElementById('customer-selected-hint');
  const productHint = document.getElementById('product-selected-hint');
  const summary = document.getElementById('checkout-summary');
  const collectBtn = document.getElementById('btn-collect-payment');

  if (selectedCustomer) {
    customerHint.hidden = false;
    customerHint.textContent = selectedCustomer.email
      ? `Selected: ${selectedCustomer.name} (${selectedCustomer.email})`
      : `Selected: ${selectedCustomer.name}`;
  } else {
    customerHint.hidden = true;
  }

  if (selectedProduct) {
    const amount =
      selectedProduct.unitAmount != null
        ? formatMoney(selectedProduct.unitAmount, selectedProduct.currency)
        : '';
    productHint.hidden = false;
    productHint.textContent = amount
      ? `Selected: ${selectedProduct.name} — ${amount}`
      : `Selected: ${selectedProduct.name}`;
  } else {
    productHint.hidden = true;
  }

  if (selectedCustomer && selectedProduct) {
    summary.hidden = false;
    document.getElementById('summary-customer').textContent = selectedCustomer.name;
    document.getElementById('summary-product').textContent = selectedProduct.name;
    lastAmountLabel =
      selectedProduct.unitAmount != null
        ? formatMoney(selectedProduct.unitAmount, selectedProduct.currency)
        : '';
    document.getElementById('summary-amount').textContent = lastAmountLabel;
    collectBtn.disabled = false;
  } else {
    summary.hidden = true;
    collectBtn.disabled = true;
  }
}

function selectCustomer(customer) {
  selectedCustomer = customer;
  document.getElementById('customer-search').value = customer.email
    ? `${customer.name} · ${customer.email}`
    : customer.name;
  document.getElementById('customer-dropdown').hidden = true;
  updateCheckoutUI();
}

function selectProduct(product) {
  selectedProduct = product;
  const amount =
    product.unitAmount != null ? formatMoney(product.unitAmount, product.currency) : '';
  document.getElementById('product-search').value = amount
    ? `${product.name} · ${amount}`
    : product.name;
  document.getElementById('product-dropdown').hidden = true;
  updateCheckoutUI();
}

function resetCheckout() {
  stopPolling();
  clearSuccessTimeout();
  currentPaymentIntentId = null;
  selectedCustomer = null;
  selectedProduct = null;
  lastAmountLabel = '';
  document.getElementById('customer-search').value = '';
  document.getElementById('product-search').value = '';
  document.getElementById('create-customer-panel').hidden = true;
  document.getElementById('create-product-panel').hidden = true;
  document.getElementById('btn-toggle-create-customer').textContent = 'Create new customer';
  document.getElementById('btn-toggle-create-product').textContent = 'Create new product';
  updateCheckoutUI();
  showScreen('screen-checkout');
  loadCustomers('');
  loadProducts('');
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
      if (selectedCustomer?.id === customer.id) btn.classList.add('selected');
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

async function loadProducts(query = '') {
  const dropdown = document.getElementById('product-dropdown');
  dropdown.hidden = false;
  dropdown.innerHTML = '<p class="dropdown-empty">Loading…</p>';
  try {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    const qs = params.toString();
    const res = await fetch(`/api/products${qs ? `?${qs}` : ''}`);
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || 'Failed to load products');
    }
    if (!data.products.length) {
      dropdown.innerHTML = '<p class="dropdown-empty">No products found</p>';
      return;
    }
    dropdown.innerHTML = '';
    data.products.forEach((product) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dropdown-item';
      if (selectedProduct?.id === product.id) btn.classList.add('selected');
      const priceLabel =
        product.unitAmount != null ? formatMoney(product.unitAmount, product.currency) : '';
      btn.innerHTML = `<span class="list-item-title">${product.name}</span>${
        priceLabel ? `<span class="list-item-detail">${priceLabel}</span>` : ''
      }`;
      btn.addEventListener('click', () => selectProduct(product));
      dropdown.appendChild(btn);
    });
  } catch (err) {
    dropdown.innerHTML = `<p class="error-text">${err.message}</p>`;
  }
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
    selectProduct(data.product);
    document.getElementById('create-product-panel').hidden = true;
    document.getElementById('btn-toggle-create-product').textContent = 'Create new product';
    document.getElementById('product-name').value = '';
    document.getElementById('product-amount').value = '';
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

  showScreen('screen-checkout');
}

const customerSearchInput = document.getElementById('customer-search');
const productSearchInput = document.getElementById('product-search');

customerSearchInput.addEventListener('focus', () => {
  document.getElementById('product-dropdown').hidden = true;
  loadCustomers(customerSearchInput.value);
});
customerSearchInput.addEventListener('input', () => {
  selectedCustomer = null;
  updateCheckoutUI();
  if (customerSearchTimer) clearTimeout(customerSearchTimer);
  customerSearchTimer = setTimeout(() => {
    loadCustomers(customerSearchInput.value);
  }, 300);
});

productSearchInput.addEventListener('focus', () => {
  document.getElementById('customer-dropdown').hidden = true;
  loadProducts(productSearchInput.value);
});
productSearchInput.addEventListener('input', () => {
  selectedProduct = null;
  updateCheckoutUI();
  if (productSearchTimer) clearTimeout(productSearchTimer);
  productSearchTimer = setTimeout(() => {
    loadProducts(productSearchInput.value);
  }, 300);
});

document.getElementById('btn-toggle-create-customer').addEventListener('click', () => {
  const panel = document.getElementById('create-customer-panel');
  const open = panel.hidden;
  panel.hidden = !open;
  document.getElementById('btn-toggle-create-customer').textContent = open
    ? 'Hide create customer'
    : 'Create new customer';
  if (open) {
    document.getElementById('customer-name').value = '';
    document.getElementById('customer-email').value = '';
  }
});

document.getElementById('btn-toggle-create-product').addEventListener('click', () => {
  const panel = document.getElementById('create-product-panel');
  const open = panel.hidden;
  panel.hidden = !open;
  document.getElementById('btn-toggle-create-product').textContent = open
    ? 'Hide create product'
    : 'Create new product';
  if (open) {
    document.getElementById('product-name').value = '';
    document.getElementById('product-amount').value = '';
  }
});

document.getElementById('btn-save-customer').addEventListener('click', saveCustomer);
document.getElementById('btn-save-product').addEventListener('click', saveProduct);
document.getElementById('btn-collect-payment').addEventListener('click', startPayment);
document.getElementById('btn-cancel-payment').addEventListener('click', cancelPayment);
document.getElementById('btn-payment-done').addEventListener('click', resetCheckout);
document.getElementById('btn-payment-retry').addEventListener('click', () => showScreen('screen-checkout'));

updateCheckoutUI();
loadCustomers('');
loadProducts('');
