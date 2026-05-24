const BASE_URL = "http://localhost:8000/api/v1";


// ─── state ────────────────────────────────────────────────────────────────────
let cart = { items: [], coupon: {}, pricing: {} };
const debounceMap = {};

// Module-level mutex — set synchronously before any await so a second click
// that arrives while a payment is in-flight exits immediately.
let _buyInProgress = false;


// ─── HTML escaping ────────────────────────────────────────────────────────────
// All server-supplied strings injected into innerHTML must pass through here.
// Covers the five characters that have meaning in HTML attribute/text contexts.
function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}


// ─── boot ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await loadCart();
  document.getElementById("couponInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyCoupon();
  });
});

async function loadCart() {
  try {
    const res = await api(`${BASE_URL}/users/load-cart`);
    cart = res.data;
    renderItems();
  } catch {
    showToast("Could not load cart. Please refresh.", "error");
  }
}


// ─── render ───────────────────────────────────────────────────────────────────
function renderItems() {
  const list = document.getElementById("itemList");
  list.innerHTML = "";

  if (!cart.items?.length) {
    list.innerHTML = `<div class="empty-cart">🛒 Your cart is empty</div>`;
    updateTotalsUI();
    return;
  }

  cart.items.forEach((item) => {
    const itemData  = item.itemId;
    // id is a MongoDB ObjectId string — always safe, but escape anyway for consistency
    const id        = String(itemData?._id ?? item.itemId ?? "");
    const name      = itemData?.name     ?? "Item";
    const imgField  = itemData?.imageUrl ?? "";
    const unitPrice = Number(itemData?.price ?? item.priceAtAdd) || item.priceAtAdd;
    const sub       = unitPrice * item.qty;

    const row = document.createElement("div");
    row.className      = "item-row";
    row.dataset.itemId = id;   // safe: goes into data attribute, not innerHTML

    // Build the image element programmatically to avoid any injection surface.
    // imgField comes from the server — it could be a URL or an emoji/text.
    let imgHtml;
    const isUrl = /^(https?:\/\/|\/\/|\/)/.test(imgField);
    if (isUrl) {
      // src and alt are set via DOM properties (not innerHTML) to prevent injection.
      const img = document.createElement("img");
      img.src       = imgField;            // browsers enforce URL context — safe
      img.alt       = name;               // property assignment, not innerHTML
      img.className = "item-thumb";
      img.onerror   = function () {
        this.replaceWith(Object.assign(document.createElement("span"), { textContent: "🛍️" }));
      };
      imgHtml = img.outerHTML;
    } else {
      // Non-URL: treat as text, not HTML
      imgHtml = `<span>${escHtml(imgField) || "🛍️"}</span>`;
    }

    // Only the static structure goes into innerHTML.
    // Dynamic values (name, price, qty) are injected via escHtml() or set
    // via textContent/value after the element is created.
    row.innerHTML = `
      <div class="item-img">${imgHtml}</div>
      <div class="item-info">
        <div class="item-name">${escHtml(name)}</div>
        <div class="item-price">
          ₹${escHtml(unitPrice)} each &nbsp;·&nbsp;
          <span class="item-subtotal">₹${escHtml(sub)}</span>
        </div>
      </div>
      <div class="qty-control">
        <button class="qty-btn qty-dec">−</button>
        <input
          class="qty-num qty-input"
          type="number" min="1" max="99"
          value="${escHtml(item.qty)}"
          data-item-id="${escHtml(id)}"
        />
        <button class="qty-btn qty-inc">+</button>
      </div>
      <button class="delete-btn" title="Remove item">🗑️</button>`;

    // Wire up event handlers via JS properties — no inline onclick with
    // interpolated strings, so there is zero injection surface here.
    row.querySelector(".qty-dec").addEventListener("click", () => changeQty(id, -1));
    row.querySelector(".qty-inc").addEventListener("click", () => changeQty(id,  1));
    row.querySelector(".qty-input").addEventListener("change", function () { onQtyInputChange(this); });
    row.querySelector(".qty-input").addEventListener("input",  function () { onQtyInputDebounced(this); });
    row.querySelector(".delete-btn").addEventListener("click", () => deleteItem(id));

    list.appendChild(row);
  });

  updateTotalsUI();
  renderCouponUI();
}

function updateTotalsUI() {
  document.getElementById("totalDisplay").textContent =
    `₹${cart.pricing?.finalTotal ?? 0}`;
}

function renderCouponUI() {
  const coupon = cart.coupon ?? {};
  if (coupon.code && coupon.discountPct > 0) {
    // textContent — safe, no HTML injection
    document.getElementById("discountVal").textContent =
      `−₹${coupon.discountAmt} (${coupon.discountPct}% off)`;
    document.getElementById("couponInput").value = coupon.code;
    show("discountStrip");
    hide("errorStrip");
  }
}


// ─── qty: +/- buttons ─────────────────────────────────────────────────────────
async function changeQty(itemId, delta) {
  const item = cart.items.find(
    (it) => (it.itemId?._id ?? it.itemId).toString() === itemId
  );
  if (!item) return;

  const newQty = Math.max(1, item.qty + delta);
  if (newQty === item.qty) return;

  const prevQty = item.qty;
  item.qty      = newQty;
  recalcPricingLocally();
  renderItems();

  try {
    const res    = await api(`${BASE_URL}/users/qty`, {
      method: "PATCH",
      body:   JSON.stringify({ itemId, qty: newQty }),
    });
    cart.pricing = res.data.pricing;
    cart.coupon  = res.data.coupon;
    updateTotalsUI();
  } catch {
    item.qty = prevQty;
    recalcPricingLocally();
    renderItems();
    showToast("Could not update quantity. Try again.", "error");
  }
}


// ─── qty: typed input (debounced 600 ms) ──────────────────────────────────────
function onQtyInputDebounced(input) {
  const itemId = input.dataset.itemId;
  clearTimeout(debounceMap[itemId]);
  debounceMap[itemId] = setTimeout(() => onQtyInputChange(input), 600);
}

async function onQtyInputChange(input) {
  clearTimeout(debounceMap[input.dataset.itemId]);
  const itemId = input.dataset.itemId;

  let newQty = parseInt(input.value, 10);
  if (isNaN(newQty) || newQty < 1) newQty = 1;
  if (newQty > 99)                  newQty = 99;
  input.value = newQty;

  const item = cart.items.find(
    (it) => (it.itemId?._id ?? it.itemId).toString() === itemId
  );
  if (!item || item.qty === newQty) return;

  const prevQty = item.qty;
  item.qty      = newQty;
  recalcPricingLocally();

  const row = document.querySelector(`.item-row[data-item-id="${CSS.escape(itemId)}"]`);
  if (row) {
    const unitPrice = Number(item.itemId?.price ?? item.priceAtAdd) || item.priceAtAdd;
    // textContent — safe
    row.querySelector(".item-subtotal").textContent = `₹${unitPrice * newQty}`;
  }
  updateTotalsUI();

  try {
    const res    = await api(`${BASE_URL}/users/qty`, {
      method: "PATCH",
      body:   JSON.stringify({ itemId, qty: newQty }),
    });
    cart.pricing = res.data.pricing;
    cart.coupon  = res.data.coupon;
    updateTotalsUI();
  } catch {
    item.qty    = prevQty;
    input.value = prevQty;
    recalcPricingLocally();
    updateTotalsUI();
    showToast("Could not update quantity. Try again.", "error");
  }
}


// ─── delete item ──────────────────────────────────────────────────────────────
async function deleteItem(itemId) {
  const prevItems   = [...cart.items];
  const prevPricing = { ...cart.pricing };

  cart.items = cart.items.filter(
    (it) => (it.itemId?._id ?? it.itemId).toString() !== itemId
  );
  recalcPricingLocally();

  const row = document.querySelector(`.item-row[data-item-id="${CSS.escape(itemId)}"]`);
  if (row) {
    row.classList.add("removing");
    setTimeout(() => renderItems(), 300);
  } else {
    renderItems();
  }

  try {
    const res = await api(`${BASE_URL}/users/item/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    cart      = res.data;
    renderItems();
  } catch {
    cart.items   = prevItems;
    cart.pricing = prevPricing;
    renderItems();
    showToast("Could not remove item. Try again.", "error");
  }
}


// ─── coupon ───────────────────────────────────────────────────────────────────
async function applyCoupon() {
  const code = document.getElementById("couponInput").value.trim().toUpperCase();
  hide("discountStrip");
  hide("errorStrip");
  if (!code) return;

  try {
    const res = await api(`${BASE_URL}/users/coupon`, {
      method: "POST",
      body:   JSON.stringify({ code }),
    });
    cart = res.data;
    renderItems();
    renderCouponUI();
  } catch {
    show("errorStrip");
  }
}


// ─── BuyHandler ───────────────────────────────────────────────────────────────
// _buyInProgress is set synchronously at the very top of BuyHandler, before
// any await, so a second click while a payment is in progress exits immediately.
// ─── BuyHandler (FINAL INTEGRATED) ───────────────────────────────────────────
async function BuyHandler() {

  // 🔒 Prevent double click
  if (_buyInProgress) return;
  _buyInProgress = true;

  try {
    // 1. Validate address
    const address = getDeliveryAddress();
    if (!address) {
      _buyInProgress = false;
      return;
    }

    // 2. Create order using api()
    const orderData = await api(`${BASE_URL}/payment/create-order`, {
      method: "POST",
      body: JSON.stringify({ deliveryAddress: address }),
    });

    if (!orderData.success) {
      showToast("Could not initiate payment. Try again.", "error");
      _buyInProgress = false;
      return;
    }

    // 3. Razorpay options
    const options = {
      key: orderData.key_id,
      amount: orderData.amount,
      currency: orderData.currency,
      name: "Your Store",
      description: "Cart Purchase",
      order_id: orderData.order_id,

      // ✅ SUCCESS HANDLER
      handler: async function (response) {
        try {
          const verifyData = await api(`${BASE_URL}/payment/verify`, {
            method: "POST",
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });

          if (verifyData.success) {
            showToast("Payment Successful! 🎉", "success");
            await loadCart();
            setTimeout(() => {
              window.location.href = `/order-success.html?orderId=${currentOrderId}`;
            }, 1000);
          } else {
            showToast("Payment verification failed", "error");
          }

        } catch (err) {
          console.error(err);
          showToast("Verification error", "error");
        } finally {
          _buyInProgress = false;
        }
      },

      // ✅ PREFILL FROM ADDRESS
      prefill: {
        name: address.name,
        contact: address.phone,
      },

      theme: { color: "#3399cc" },

      modal: {
        ondismiss: function () {
          console.log("Checkout closed");
          _buyInProgress = false;
        },
      },
    };

    // 4. Open Razorpay
    const rzp = new Razorpay(options);

    rzp.on("payment.failed", function (response) {
      console.error(response.error);
      showToast("Payment failed: " + response.error.description, "error");
      _buyInProgress = false;
    });

    rzp.open();

  } catch (err) {
    console.error(err);
    showToast("Something went wrong. Try again.", "error");
    _buyInProgress = false;
  }
}





// ─── delivery address builder ─────────────────────────────────────────────────
// Trims BEFORE the empty check so space-only fields are correctly rejected.
// Phone/PIN format validation only runs when field is non-empty (no double errors).
function getDeliveryAddress() {
  const fields = [
    { id: "addrName",  label: "Full name" },
    { id: "addrPhone", label: "Phone number" },
    { id: "addrLine1", label: "Address line 1" },
    { id: "addrCity",  label: "City" },
    { id: "addrPin",   label: "PIN code" },
    { id: "addrState", label: "State" },
  ];

  const missing = [];

  for (const field of fields) {
    const el  = document.getElementById(field.id);
    const val = el?.value?.trim() ?? "";
    if (!val) {
      missing.push(field.label);
      el?.classList.add("addr-input--error");
    } else {
      el?.classList.remove("addr-input--error");
    }
  }

  const phoneEl = document.getElementById("addrPhone");
  const phone   = phoneEl?.value?.trim() ?? "";
  if (phone && !missing.includes("Phone number") && !/^\d{10}$/.test(phone)) {
    missing.push("Phone number (must be 10 digits)");
    phoneEl?.classList.add("addr-input--error");
  }

  const pinEl = document.getElementById("addrPin");
  const pin   = pinEl?.value?.trim() ?? "";
  if (pin && !missing.includes("PIN code") && !/^\d{6}$/.test(pin)) {
    missing.push("PIN code (must be 6 digits)");
    pinEl?.classList.add("addr-input--error");
  }

  if (missing.length > 0) {
    document.getElementById("addressSection").classList.add("open");
    showToast("Please fill in: " + missing.join(", "), "error");
    return null;
  }

  return {
    name:  document.getElementById("addrName").value.trim(),
    phone,
    line1: document.getElementById("addrLine1").value.trim(),
    line2: document.getElementById("addrLine2")?.value.trim() ?? "",
    city:  document.getElementById("addrCity").value.trim(),
    pin,
    state: document.getElementById("addrState").value.trim(),
  };
}


// ─── local pricing recalc ─────────────────────────────────────────────────────
// Uses current server price (item.itemId?.price) not stale priceAtAdd.
// Rounds to 2 decimal places — consistent with server-side recalcPricing().
function recalcPricingLocally() {
  const discountPct = cart.coupon?.discountPct ?? 0;
  const rawTotal    = cart.items.reduce((s, it) => {
    const unitPrice = Number(it.itemId?.price ?? it.priceAtAdd) || it.priceAtAdd;
    return s + unitPrice * it.qty;
  }, 0);
  const discountAmt = Math.round(rawTotal * discountPct) / 100;
  const finalTotal  = Math.round((rawTotal - discountAmt) * 100) / 100;
  cart.pricing = { rawTotal, discountAmt, finalTotal };
  if (cart.coupon?.code) cart.coupon.discountAmt = discountAmt;
}


// ─── ui utils ─────────────────────────────────────────────────────────────────
function show(id) { document.getElementById(id)?.classList.add("show"); }
function hide(id) { document.getElementById(id)?.classList.remove("show"); }

function showToast(msg, type = "info") {
  let toast = document.getElementById("cartToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "cartToast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;   // textContent — safe, no HTML
  toast.className   = `cart-toast ${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function toggleAddress() {
  const sec = document.getElementById("addressSection");
  sec.classList.toggle("open");
  const right = sec.querySelector(".address-toggle-right");
  // textContent — safe
  right.textContent = sec.classList.contains("open") ? "Edit ▼" : "Add ▼";
}


// ─── useSaved ─────────────────────────────────────────────────────────────────
// Validates all required keys before pre-filling — no silent partial fills.
// No hardcoded fallback address.
async function useSaved() {
  try {
    const res  = await api(`${BASE_URL}/users/profile`);
    const addr = res?.data?.user?.address;

    if (!addr) {
      showToast("No saved address found on your profile.", "error");
      return;
    }

    const required = ["name", "phone", "line1", "city", "pin", "state"];
    const missing  = required.filter((k) => !addr[k]?.trim());
    if (missing.length) {
      showToast(
        `Your saved address is incomplete (missing: ${missing.join(", ")}). ` +
        "Please fill it in manually.",
        "error"
      );
      return;
    }

    // Use value property assignment — safe, no innerHTML
    document.getElementById("addrName").value  = addr.name  ?? "";
    document.getElementById("addrPhone").value = addr.phone ?? "";
    document.getElementById("addrLine1").value = addr.line1 ?? "";
    document.getElementById("addrLine2").value = addr.line2 ?? "";
    document.getElementById("addrCity").value  = addr.city  ?? "";
    document.getElementById("addrPin").value   = addr.pin   ?? "";
    document.getElementById("addrState").value = addr.state ?? "";

  } catch {
    showToast("Could not load your saved address. Please fill it in manually.", "error");
  }
}
