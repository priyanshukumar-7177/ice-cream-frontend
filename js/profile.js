/* ══════════════════════════════════════════
   profile.js  (patched)
   Fix: Avatar photo upload REMOVED
══════════════════════════════════════════ */

const BASE_URL = "https://ice-cream-backend-zwrr.onrender.com";

// ── HELPERS ──
function gid(id) { return document.getElementById(id); }

function toast(msg, dur) {
  var el = gid("toast"); if (!el) return;
  el.textContent = msg; el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove("show"); }, dur || 2500);
}

function openModal(id) {
  var m = gid(id); if (!m) return;
  document.querySelectorAll(".modal-overlay").forEach(function (o) { o.classList.remove("open"); });
  m.classList.add("open");
}

function closeModal(id) {
  var m = gid(id); if (!m) return;
  m.classList.remove("open");
}

/* ═══════════════════════════════════════════
   THEME TOGGLE
═══════════════════════════════════════════ */
function initThemeToggle() {
  const toggle = gid("darkToggle");
  const emoji  = gid("themeEmoji");
  const label  = gid("themeLabelText");
  if (!toggle) return;

  const current = localStorage.getItem("theme") || "light";
  toggle.checked = (current === "dark");
  if (emoji) emoji.textContent = current === "dark" ? "☀️" : "🌙";
  if (label) label.textContent = current === "dark" ? "Light Mode" : "Dark Mode";

  toggle.addEventListener("change", function () {
    const newTheme = this.checked ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    if (emoji) emoji.textContent = newTheme === "dark" ? "☀️" : "🌙";
    if (label) label.textContent = newTheme === "dark" ? "Light Mode" : "Dark Mode";
  });
}

document.addEventListener("DOMContentLoaded", function () {
  const token = localStorage.getItem("accessToken");
  if (!token) { window.location.replace("./login.html"); return; }

  initThemeToggle();
  initOrdersDrawer();
  loadProfilePage();
});

/* ═══════════════════════════════════════════
   ORDERS DRAWER — Collapsible Box
═══════════════════════════════════════════ */
function initOrdersDrawer() {
  const trigger = gid("ordersBoxTrigger");
  const card    = document.querySelector(".orders-box-card");
  if (!trigger || !card) return;
  trigger.addEventListener("click", function () { card.classList.toggle("open"); });
}

/* ═══════════════════════════════════════════
   LOAD PROFILE PAGE
═══════════════════════════════════════════ */
async function loadProfilePage() {
  document.getElementById("profileName").textContent    = "Loading…";
  document.getElementById("profileEmail").textContent   = "Loading…";
  document.getElementById("avatarInitials").textContent = "…";
  document.querySelector(".profile-member").textContent = "Fetching profile…";
  document.getElementById("addressList").innerHTML      = "<p style='padding:12px;color:var(--text-muted)'>Loading addresses…</p>";
  document.getElementById("orderList").innerHTML        = "<p style='padding:12px;color:var(--text-muted)'>Loading orders…</p>";

  try {
    const data   = await api(`${BASE_URL}/users/profile`);
    const user   = data.data.user;
    const orders = data.data.orders;

    // ── 1. USER DETAIL ──
    document.getElementById("profileName").textContent  = user.name;
    document.getElementById("profileEmail").textContent = "📧 " + user.email;

    const nameParts = user.name.trim().split(" ").filter(Boolean);
    const initials  = nameParts.length >= 2
      ? nameParts[0][0].toUpperCase() + nameParts[nameParts.length - 1][0].toUpperCase()
      : user.name.substring(0, 2).toUpperCase();
    document.getElementById("avatarInitials").textContent = initials;

    // ✅ FIX: No profile photo injection — upload feature removed.
    // Avatar always shows initials; the edit button is hidden via CSS/HTML change.

    const joined    = new Date(user.createdAt);
    const monthYear = joined.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    document.querySelector(".profile-member").textContent = `Member since ${monthYear} 🎉`;

    // ── 2. ADDRESS ──
    const addressList     = document.getElementById("addressList");
    addressList.innerHTML = "";
    const addr      = user.address;
    const hasAddress = addr && (addr.line1 || addr.name);

    if (!hasAddress) {
      addressList.innerHTML = "<p style='padding:12px;color:var(--text-muted)'>No address saved yet 📍</p>";
    } else {
      const li     = document.createElement("li");
      li.className = "address-item";
      li.dataset.id = user._id;
      li.innerHTML = `
        <div class="address-icon">🏠</div>
        <div class="address-details">
          <strong>${addr.name || "Saved Address"}</strong>
          <p>${addr.line1 || ""}${addr.line2 ? ", " + addr.line2 : ""}</p>
          <p>${addr.city || ""}${addr.pin ? " - " + addr.pin : ""}${addr.state ? ", " + addr.state : ""}</p>
          ${addr.phone ? "<p>📞 " + addr.phone + "</p>" : ""}
        </div>
        <div class="address-actions">
          <button class="icon-btn addr-edit-btn" title="Edit">✏️</button>
          <button class="icon-btn addr-del-btn">🗑️</button>
        </div>`;
      addressList.appendChild(li);
    }

    // ── 3. ORDERS ──
    const orderList     = document.getElementById("orderList");
    orderList.innerHTML = "";
    const countEl = gid("ordersCount");
    if (countEl) {
      countEl.textContent = (!orders || orders.length === 0)
        ? "No orders yet"
        : `${orders.length} order${orders.length > 1 ? "s" : ""}`;
    }

    if (!orders || orders.length === 0) {
      orderList.innerHTML = `
        <li style="padding:40px 20px;text-align:center;">
          <div style="font-size:48px;margin-bottom:12px;">🍦</div>
          <p style="color:var(--text-muted);font-size:14px;">No orders yet. Start exploring our flavors!</p>
        </li>`;
    } else {
      orders.forEach(order => {
        const date = new Date(order.createdAt).toLocaleDateString("en-IN", {
          day: "2-digit", month: "short", year: "numeric",
        });
        const statusEmoji = {
          pending: "⏳ Pending", confirmed: "✅ Confirmed",
          delivered: "✅ Delivered", cancelled: "❌ Cancelled",
        };
        const statusClass = {
          pending: "pending", confirmed: "delivered",
          delivered: "delivered", cancelled: "pending",
        };
        const itemsText = order.items.map(i => `${i.name} × ${i.qty}`).join(", ");
        const li = document.createElement("li");
        li.className = "order-card";
        li.innerHTML = `
          <div class="order-top">
            <span class="order-id">#HIC-${order._id.slice(-8).toUpperCase()}</span>
            <span class="order-status ${statusClass[order.status]}">${statusEmoji[order.status]}</span>
          </div>
          <div class="order-meta">
            <span>📅 ${date}</span>
            <span>💰 ₹${order.totalAmount}</span>
          </div>
          <p class="order-items">${itemsText}</p>
          <button class="view-details-btn"
            data-id="#HIC-${order._id.slice(-8).toUpperCase()}"
            data-date="${date}"
            data-amount="₹${order.totalAmount}"
            data-status="${order.status}"
            data-items="${itemsText}"
            data-pay-status="${order.payment.status}"
            data-upi-id="${order.payment.upiId || ""}"
            data-transaction-id="${order.payment.transactionId || ""}">
            View Details
          </button>`;
        orderList.appendChild(li);
      });
      wireViewDetails();
    }

  } catch (error) {
    console.error("Failed to load profile:", error);
    document.getElementById("profileName").textContent  = "Failed to load";
    document.getElementById("profileEmail").textContent = "Please refresh page";
    document.getElementById("addressList").innerHTML    = "<p style='padding:12px;color:#EF4444'>Failed to load ❌</p>";
    document.getElementById("orderList").innerHTML      = "<p style='padding:12px;color:#EF4444'>Failed to load ❌</p>";
    toast("Something went wrong. Please refresh.");
  }
}

// ── VIEW DETAILS ──
function wireViewDetails() {
  document.querySelectorAll(".view-details-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const d = this.dataset;
      if (gid("odId"))     gid("odId").textContent     = d.id;
      if (gid("odDate"))   gid("odDate").textContent   = d.date;
      if (gid("odAmount")) gid("odAmount").textContent = d.amount;
      if (gid("odItems"))  gid("odItems").textContent  = d.items;
      if (gid("odStatus")) {
        gid("odStatus").textContent = d.status;
        const colors = { delivered: "#10B981", confirmed: "#10B981", pending: "#E8734A", cancelled: "#EF4444" };
        gid("odStatus").style.color = colors[d.status] || "inherit";
      }
      const isPaid = d.payStatus === "paid";
      if (isPaid) {
        gid("odPaymentSection").style.display   = "block";
        gid("odNoPaymentSection").style.display = "none";
        if (gid("odUpiId"))         gid("odUpiId").textContent         = d.upiId        || "N/A";
        if (gid("odTransactionId")) gid("odTransactionId").textContent = d.transactionId || "N/A";
        if (gid("odPayStatus")) { gid("odPayStatus").textContent = "✅ Paid"; gid("odPayStatus").style.color = "#10B981"; }
      } else {
        gid("odPaymentSection").style.display   = "none";
        gid("odNoPaymentSection").style.display = "block";
        const messages = {
          pending: "⏳ Payment not completed yet.",
          cancelled: "❌ Order was cancelled. No transaction made.",
          failed: "❌ Payment failed. No transaction made.",
        };
        gid("odNoPaymentMsg").textContent = messages[d.status] || "⚠️ No transaction details available.";
      }
      openModal("modalOrderDetails");
    });
  });
}

// ── LOGOUT ──
document.getElementById("logoutBtn").addEventListener("click", () => {
  document.getElementById("modalLogout").classList.add("open");
});
document.getElementById("confirmLogoutBtn").addEventListener("click", logout);

document.getElementById("helpBtn").addEventListener("click", () => {
  document.getElementById("modalHelp").classList.add("open");
});

document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => {
    const modalId = btn.getAttribute("data-close");
    document.getElementById(modalId).classList.remove("open");
  });
});

async function logout() {
  try {
    await api(`${BASE_URL}/users/logout`, { method: "POST" });
  } catch (err) {
    console.error("Logout API error:", err);
  } finally {
    localStorage.removeItem("accessToken");
    window.location.href = "login.html";
  }
}

// ── ADD ADDRESS ──
document.getElementById("addAddressBtn").addEventListener("click", () => {
  ["addrFormName","addrFormPhone","addrFormLine1","addrFormLine2","addrFormCity","addrFormPin","addrFormState"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  openModal("modalAddAddress");
});

document.getElementById("saveAddressBtn").addEventListener("click", async () => {
  const name  = (document.getElementById("addrFormName")?.value  || "").trim();
  const phone = (document.getElementById("addrFormPhone")?.value || "").trim();
  const line1 = (document.getElementById("addrFormLine1")?.value || "").trim();
  const line2 = (document.getElementById("addrFormLine2")?.value || "").trim();
  const city  = (document.getElementById("addrFormCity")?.value  || "").trim();
  const pin   = (document.getElementById("addrFormPin")?.value   || "").trim();
  const state = (document.getElementById("addrFormState")?.value || "").trim();

  if (!name || !phone || !line1 || !city || !pin || !state) { toast("Please fill all required fields (*)"); return; }
  if (!/^\d{10}$/.test(phone)) { toast("Phone must be 10 digits"); return; }
  if (!/^\d{6}$/.test(pin))   { toast("PIN must be 6 digits"); return; }

  try {
    await api(`${BASE_URL}/users/add-address`, {
      method: "POST",
      body: JSON.stringify({ address: { name, phone, line1, line2, city, pin, state } }),
    });
    toast("Address saved successfully 🎉");
    closeModal("modalAddAddress");
    loadProfilePage();
  } catch (err) {
    console.error(err);
    toast("Failed to save address ❌");
  }
});

document.addEventListener("click", function (e) {
  if (e.target.classList.contains("addr-edit-btn")) {
    api(`${BASE_URL}/users/profile`).then(data => {
      const addr = data?.data?.user?.address;
      if (!addr) return;
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
      set("addrFormName",  addr.name);  set("addrFormPhone", addr.phone);
      set("addrFormLine1", addr.line1); set("addrFormLine2", addr.line2);
      set("addrFormCity",  addr.city);  set("addrFormPin",   addr.pin);
      set("addrFormState", addr.state);
      openModal("modalAddAddress");
    }).catch(() => toast("Failed to load address"));
  }
});

// ── DELETE ADDRESS ──
let _deleteAddressId = null;

document.addEventListener("click", function (e) {
  if (e.target.classList.contains("addr-del-btn")) {
    const li = e.target.closest(".address-item");
    _deleteAddressId = li?.dataset?.id || null;
    openModal("modalDeleteAddress");
  }
});

gid("confirmDeleteBtn").addEventListener("click", async () => {
  try {
    await api(`${BASE_URL}/users/delete-address`, { method: "DELETE" });
    toast("Address deleted 🗑️");
    closeModal("modalDeleteAddress");
    loadProfilePage();
  } catch (err) {
    console.error(err);
    toast("Failed to delete address ❌");
  }
});

// ── CHANGE PASSWORD ──
gid("changePassBtn").addEventListener("click", () => {
  openModal("modalChangePass");
  gid("passStep1").classList.remove("hidden");
  gid("passStep2").classList.add("hidden");
  gid("passStep3").classList.add("hidden");
  gid("newPass1").value = "";
  gid("newPass2").value = "";
  [...document.querySelectorAll("#passOtpInputs .otp-box")].forEach(i => { i.value = ""; });
  window._tempNewPassword = "";
});

gid("passSaveBtn").addEventListener("click", async function () {
  const p1 = gid("newPass1").value.trim();
  const p2 = gid("newPass2").value.trim();
  if (!p1 || !p2)  { toast("Fill all fields"); return; }
  if (p1 !== p2)   { toast("Passwords do not match ❌"); return; }
  if (p1.length < 6) { toast("Password must be at least 6 characters"); return; }
  try {
    window._tempNewPassword = p1;
    const res = await api(`${BASE_URL}/users/auth-send-otp`, { method: "POST" });
    if (!res?.success) { toast(res?.message || "Failed to send OTP ❌"); return; }
    toast("OTP sent 📩");
    gid("passStep1").classList.add("hidden");
    gid("passStep2").classList.remove("hidden");
  } catch (err) { console.error(err); toast("Something went wrong ❌"); }
});

gid("passVerifyBtn").addEventListener("click", async () => {
  const otp = [...document.querySelectorAll("#passOtpInputs .otp-box")]
    .map(i => i.value.trim()).join("");
  if (otp.length !== 6) { toast("Enter valid OTP"); return; }
  try {
    const res = await api(`${BASE_URL}/users/update-password`, {
      method: "POST",
      body: JSON.stringify({ otp, password: window._tempNewPassword }),
    });
    if (!res?.success) { toast(res?.message || "Invalid OTP ❌"); return; }
    gid("passStep2").classList.add("hidden");
    gid("passStep3").classList.remove("hidden");
    window._tempNewPassword = "";
  } catch (err) { console.error(err); toast("Something went wrong ❌"); }
});

// ── OTP AUTO NAVIGATION ──
document.querySelectorAll(".otp-inputs").forEach(container => {
  const inputs = container.querySelectorAll(".otp-box");
  inputs.forEach((input, i) => {
    input.addEventListener("input", () => { if (input.value && i < inputs.length - 1) inputs[i + 1].focus(); });
    input.addEventListener("keydown", (e) => { if (e.key === "Backspace" && !input.value && i > 0) inputs[i - 1].focus(); });
  });
});
