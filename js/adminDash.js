
/* =============================================================
   adminDash.js  —  Scoop Admin Dashboard
   API base: http://localhost:8000/api/v1
   Depends on: js/api.js  (your existing fetch + auto-refresh wrapper)
   ============================================================= */

const BASE_URL = "https://ice-cream-backend-zwrr.onrender.com/api/v1";


/* -------------------------------------------------------------
   GLOBAL STATE
   ------------------------------------------------------------- */
let allItems   = [];    // menu items fetched from server
let allOrders  = [];    // orders fetched from server
let filteredOrders = [];
let editItemId = null;  // null = add mode  |  string = edit mode
let availState = true;  // availability toggle value in modal

/* =============================================================
   BOOT — runs once the DOM is ready
   ============================================================= */
document.addEventListener("DOMContentLoaded", () => {
  // Mobile sidebar: close when any nav link is clicked
  document.querySelectorAll(".nav-link").forEach(el => {
    el.addEventListener("click", () => {
      if (window.innerWidth <= 860) closeSidebar();
    });
  });

  showSection("orders");  // show orders section by default
});

/* =============================================================
   MOBILE SIDEBAR TOGGLE
   ============================================================= */
function toggleSidebar() {
  const sidebar   = document.getElementById("sidebar");
  const toggle    = document.getElementById("menu-toggle");
  const backdrop  = document.getElementById("sidebar-backdrop");
  sidebar.classList.toggle("open");
  toggle.classList.toggle("open");
  backdrop.classList.toggle("show");
}


function toggleOrderDetail(id) {
  const el = document.getElementById(`ocard-detail-${id}`);
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
}


function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("menu-toggle").classList.remove("open");
  document.getElementById("sidebar-backdrop").classList.remove("show");
}

/* =============================================================
   SIDEBAR NAVIGATION
   Switches between the Orders and Menu Items sections
   ============================================================= */
function showSection(section) {
  // remove active from all
  document.querySelectorAll(".nav-link")
    .forEach(el => el.classList.remove("active"));

  // set active
  document.getElementById(`nav-${section}`).classList.add("active");

  // all sections
  const sections = ["orders", "items", "banners", "coupons", "buyers", "analytics", "categories", "notifications"];

  // show/hide sections dynamically
  sections.forEach(sec => {
    const el = document.getElementById(`sec-${sec}`);
    if (el) {
      el.style.display = sec === section ? "block" : "none";
    }
  });

  // stats bar (only for orders)
  document.getElementById("stats-sec").style.display =
    (section === "orders" ) ? "grid" : "none";

  // Add button (only for items)
  document.getElementById("add-btn").style.display =
    section === "items" ? "flex" : "none";

  // page titles
  const titles = {
    orders:        "Orders <span>Dashboard</span>",
    items:         "Menu <span>Catalogue</span>",
    banners:       "Banner <span>Management</span>",
    coupons:       "Coupon <span>Management</span>",
    buyers:        "Buyers <span>Management</span>",
    analytics:     "Analytics <span>Insights</span>",
    categories:    "Category <span>Management</span>",
    notifications: "Send <span>Notifications</span>"
  };

  document.getElementById("page-title").innerHTML = titles[section] || "";

  // load data
  if (section === "orders")        loadOrders();
  if (section === "items")         { loadItems(); loadCategoryDropdown(); }
  if (section === "banners")       loadBannersAdmin();
  if (section === "coupons")       loadCouponsAdmin();
  if (section === "buyers")        loadBuyers();
  if (section === "analytics")     loadAnalytics();
  if (section === "categories")    loadCategoriesAdmin();
  if (section === "notifications") initNotificationsSection();
}

/* =============================================================
   LOGOUT
   Clears stored tokens and sends user to login page
   ============================================================= */
async function handleLogout() {
  try {
    await api(`${BASE_URL}/admin/logout`, { method: "POST" });
  } catch (err) {
    console.error("Logout API error:", err);  // don't block logout if server errors
  } finally {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    window.location.href = "./login.html";
  }
}

/* =============================================================
   TOAST NOTIFICATION
   type: "success" | "error" | "info"
   ============================================================= */
function showToast(msg, type = "success") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = "toast"; }, 3000);
}

/* =============================================================
   ORDERS — fetch all orders
   GET http://localhost:8000/api/v1/admin/load-orders
   ============================================================= */
async function loadOrders() {
  try {
    const res = await api(`${BASE_URL}/admin/load-orders`);
    const resData = res.data || res;
    allOrders = Array.isArray(resData)
      ? resData
      : Array.isArray(resData.orders)
        ? resData.orders
        : [];
    applyOrderFilters();
    updateOrderStats();
    updatePillCounts();
  } catch (err) {
    showToast("Failed to load orders", "error");
    console.error("loadOrders:", err);
  }
 
  // Populate the "Menu Items" stat card even when we're on the orders page.
  // We do this as a fire-and-forget — don't block order rendering if it fails.
  try {
    const itemRes = await api(`${BASE_URL}/admin/load-items`);
    const items = Array.isArray(itemRes) ? itemRes : (itemRes.data || []);
    const el = document.getElementById("s-items");
    if (el) el.textContent = items.length;
    // Keep allItems in sync so the Items section doesn't need a re-fetch
    // only if allItems is still empty (user hasn't visited Items section yet)
    if (allItems.length === 0) allItems = items;
  } catch {
    // silently ignore — stat card stays at 0, not critical
  }
}

/* =============================================================
   ORDERS — filter order for search input
   ============================================================= */
function filterOrdersSearch(query = "") {
  const q = query.toLowerCase().trim();

  if (!q) {
    renderOrdersList(allOrders);
    return;
  }

  const filteredOrders = allOrders.filter(order => {
    const name  = order.user?.name?.toLowerCase() || "";
    const email = order.user?.email?.toLowerCase() || "";
    const phone = (order.deliveryAddress?.phone || "").toLowerCase();
    const id    = String(order._id || "").toLowerCase();

    return (
      name.includes(q) ||
      email.includes(q) ||
      phone.includes(q) ||
      id.includes(q)
    );
  });

  renderOrdersList(filteredOrders);
}

/* =============================================================
   ORDERS — render order cards into the list
   ============================================================= */
function renderOrdersList(orders) {
  const list = document.getElementById("orders-list");

  if (!orders || orders.length === 0) {
    list.innerHTML = `
      <div class="empty-s">
        <div class="ei">📦</div>
        <p>No orders found.</p>
      </div>`;
    return;
  }

  list.innerHTML = orders.map(order => {
    // ── User ──────────────────────────────────────────
    const name     = order.user?.name || "Unknown";
    const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

    // ── Order Status ──────────────────────────────────
    const status      = order.status || "pending";
    const statusClass = `s-${status}`;
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

    // ── Payment ───────────────────────────────────────
    const payStatus = order.payment?.status || "pending";
    const payClass  = payStatus === "paid"   ? "pay-paid"
                    : payStatus === "failed" ? "pay-fail"
                    : "pay-pend";
    const payLabel  = payStatus.charAt(0).toUpperCase() + payStatus.slice(1);

    // ── Delivery Address ──────────────────────────────
    const addr    = order.deliveryAddress;
    const addrStr = addr
      ? [
          addr.name    ? `${addr.name}` : "",
          addr.line1   ? addr.line1     : "",
          addr.line2   ? addr.line2     : "",
          addr.city && addr.pin ? `${addr.city} - ${addr.pin}` : addr.city || "",
          addr.state   ? addr.state     : "",
          addr.phone   ? `📞 ${addr.phone}` : "",
        ].filter(Boolean).join(", ")
      : "N/A";

    // ── Items ─────────────────────────────────────────
    const itemChips = (order.items || []).map(item => `
      <div class="ichip">
        <span class="qty">${item.qty || 1}×</span>
        ${item.name || "Item"}
        <span class="iprice">₹${item.price || 0}</span>
      </div>`).join("");

    // ── Status Changer Buttons ────────────────────────
    const statusButtons = ["pending", "confirmed", "delivered", "cancelled"].map(s => `
      <button
        class="sc-btn sc-${s}${status === s ? " sc-cur" : ""}"
        onclick="updateOrderStatus('${order._id}', '${s}')"
      >${s.charAt(0).toUpperCase() + s.slice(1)}</button>`).join("");

    // ── Razorpay ID (bonus info) ──────────────────────
    const razorpayId = order.razorpay?.orderId
      ? `<div class="oinfo-item">🔖 <strong>${order.razorpay.orderId}</strong></div>`
      : "";

    return `
      <div class="ocard" id="ocard-${order._id}">
        <div class="ocard-top" style="cursor: pointer;" onclick="toggleOrderDetail('${order._id}')">
          <div class="ocard-left">
            <div class="oav">${initials}</div>
            <div>
              <div class="oname">${name}</div>
              <div class="oid">#${order._id}</div>
            </div>
          </div>
          <div class="ocard-right" style="text-align:right">
            <div class="oamount">₹${order.totalAmount || 0}</div>
            <span class="sbadge ${statusClass}">${statusLabel}</span>
            <div style="font-size:10px; color:var(--muted); margin-top:6px;">Tap to expand ▾</div>
          </div>
        </div>

        <div id="ocard-detail-${order._id}" class="ocard-detail" style="margin-top:16px; display:none;">
          <div class="divider"></div>
          <div class="item-chips">${itemChips}</div>
          <div class="divider"></div>
          <div class="ocard-bottom">
            <div class="oinfo">
              <div class="oinfo-item">📍 <strong>${addrStr}</strong></div>
              <div class="oinfo-item">🕐 <strong>${order.createdAt ? new Date(order.createdAt).toLocaleString() : "—"}</strong></div>
              ${razorpayId}
              <span class="pay-tag ${payClass}">${payLabel}</span>
            </div>
            <div class="status-changer">
              <span class="sc-label">Status</span>
              ${statusButtons}
            </div>
          </div>
        </div>
      </div>`;
  }).join("");
}

/* =============================================================
   ORDERS — update status via API
   PATCH http://localhost:8000/api/v1/admin/orders/:id/status
   ============================================================= */
async function updateOrderStatus(id, newStatus) {
  try {
    await api(`${BASE_URL}/admin/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus })
    });

    // update local state
    const order = allOrders.find(o => o._id === id);
    if (order) order.status = newStatus;

    applyOrderFilters(); // Re-apply all filters (this handles rendering and stats)
    showToast(`Order marked as ${newStatus}`);
  } catch (err) {
    showToast(err.message || "Failed to update status", "error");
    console.error("updateOrderStatus:", err);
  }
}

/* =============================================================
   ORDERS — update stat cards at the top
   ============================================================= */
function updateOrderStats(ordersArray = allOrders) {
  const total   = ordersArray.length;
  const pending = ordersArray.filter(o => o.status === "pending").length;
 
  // Only count orders that have actually been paid for
  const revenue = ordersArray
    .filter(o => o.payment?.status === "paid")
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
 
  document.getElementById("s-total").textContent = total;
  document.getElementById("s-pend").textContent  = pending;
  document.getElementById("s-rev").textContent   = `₹${revenue.toLocaleString("en-IN")}`;
}

/* =============================================================
   ORDERS — update pill badge counts
   ============================================================= */
function updatePillCounts(ordersArray = allOrders) {
  const counts = { all: ordersArray.length, pending: 0, confirmed: 0, delivered: 0, cancelled: 0 };
  ordersArray.forEach(o => {
    if (counts[o.status] !== undefined) counts[o.status]++;
  });
  document.getElementById("pc-all").textContent       = counts.all;
  document.getElementById("pc-pending").textContent   = counts.pending;
  document.getElementById("pc-confirmed").textContent = counts.confirmed;
  document.getElementById("pc-delivered").textContent = counts.delivered;
  document.getElementById("pc-cancelled").textContent = counts.cancelled;
}

/* =============================================================
   ORDERS — filter by status
   Uses a dedicated "selected" class — NOT .f-all — for active state
   ============================================================= */
let currentOrderStatus = 'all';
let currentOrderTime = 'day'; // Default to today as requested

function applyOrderFilters() {
  let filtered = allOrders;

  // 1. Time Filter
  const now = new Date();
  if (currentOrderTime !== 'all') {
    filtered = filtered.filter(o => {
      if (!o.createdAt) return false;
      const d = new Date(o.createdAt);
      if (currentOrderTime === 'day') {
        return d.toDateString() === now.toDateString();
      } else if (currentOrderTime === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        return d >= weekAgo;
      } else if (currentOrderTime === 'month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }

  // Update stats and pill counts based on time-filtered orders
  updateOrderStats(filtered);
  updatePillCounts(filtered);

  // 2. Status Filter
  if (currentOrderStatus !== 'all') {
    filtered = filtered.filter(o => o.status === currentOrderStatus);
  }

  renderOrdersList(filtered);
}

function filterOrdersTime(timeRange, pillEl) {
  document.querySelectorAll(".t-pill").forEach(p => p.classList.remove("selected"));
  if (pillEl) pillEl.classList.add("selected");
  
  currentOrderTime = timeRange;
  applyOrderFilters();
}

function filterOrders(status, pillEl) {
  // update status pill active state (ignoring time pills)
  document.querySelectorAll(".pill:not(.t-pill)").forEach(p => p.classList.remove("selected"));
  if (pillEl) pillEl.classList.add("selected");

  currentOrderStatus = status;
  applyOrderFilters();
}

/* =============================================================
   ITEMS — fetch all menu items
   GET http://localhost:8000/api/v1/admin/load-items
   ============================================================= */
async function loadItems() {
  try {
    const res = await api(`${BASE_URL}/admin/load-items`);
    allItems = Array.isArray(res) ? res : (res.data || []);
    renderCategoryFilterBar();   // ← ADD THIS
    renderItemsGrid();
    updateItemCount();
  } catch (err) {
    showToast("Failed to load items", "error");
  }
}



let activeItemCategory = "all";


function renderCategoryFilterBar() {
  const sec = document.getElementById("sec-items");
  if (!sec) return;

  // Remove old bar if exists
  const old = document.getElementById("item-cat-bar");
  if (old) old.remove();

  // Get unique categories from loaded items
  const cats = ["all", ...new Set(allItems.map(i => i.category).filter(Boolean))];

  const bar = document.createElement("div");
  bar.id = "item-cat-bar";
  bar.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;";

  bar.innerHTML = cats.map(c => `
    <div class="pill ${c === activeItemCategory ? "selected" : ""}"
         style="cursor:pointer"
         onclick="filterItemsByCategory('${c}', this)">
      ${c === "all" ? "🔽 All" : c}
    </div>`).join("");

  // Insert before items-grid
  const grid = document.getElementById("items-grid");
  sec.insertBefore(bar, grid);
}


function filterItemsByCategory(cat, el) {
  activeItemCategory = cat;
  document.querySelectorAll("#item-cat-bar .pill").forEach(p => p.classList.remove("selected"));
  if (el) el.classList.add("selected");
  renderItemsGrid();
}


/* =============================================================
   ITEMS — render all item cards into the grid
   ============================================================= */
function renderItemsGrid() {
  const grid = document.getElementById("items-grid");

  const items = activeItemCategory === "all"
    ? allItems
    : allItems.filter(i => (i.category || "").toLowerCase() === activeItemCategory.toLowerCase());

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="empty-s">
        <div class="ei">🍦</div>
        <p>No items found${activeItemCategory !== "all" ? ` in "${activeItemCategory}"` : ""}.</p>
      </div>`;
    return;
  }

  grid.innerHTML = items.map(item => `
    <div class="icard" data-id="${item._id}">
      <div class="icard-img">
        ${item.image || item.imageUrl
          ? `<img src="${item.image || item.imageUrl}" alt="${item.name}" onerror="this.style.display='none'">`
          : `<div class="no-img">🍦</div>`
        }
        ${item.badge ? `<span class="badge-float">${item.badge}</span>` : ""}
        <span class="avail-dot ${item.isAvailable !== false ? "on" : "off"}"></span>
      </div>
      <div class="icard-body">
        <div class="icard-row1">
          <div class="icard-name">${item.name}</div>
          <div class="icard-price">₹${item.price}</div>
        </div>
        <div class="icard-cat">${item.category || ""}</div>
        ${item.description
          ? `<div class="icard-desc">${item.description}</div>`
          : ""}
        <div class="icard-meta">
          ${item.rating
            ? `<span class="icard-rating">⭐ ${item.rating}</span>
               <span class="icard-revs">(${item.reviews || 0})</span>`
            : ""}
          <span class="stock-tag ${item.isAvailable !== false ? "s-delivered" : "s-cancelled"}">
            ${item.isAvailable !== false ? "In Stock" : "Out of Stock"}
          </span>
        </div>
        <div class="icard-actions">
          <button class="ibtn" onclick="openEditModal('${item._id}')">✏️ Edit</button>
          <button class="ibtn del" onclick="deleteItem('${item._id}')">🗑️ Delete</button>
        </div>
      </div>
    </div>`).join("");
}

/* =============================================================
   ITEMS — update catalogue subtitle and stat card count
   ============================================================= */
function updateItemCount() {
  const count = allItems.length;
  document.getElementById("items-lbl").textContent = `${count} item${count !== 1 ? "s" : ""}`;
  document.getElementById("s-items").textContent = count;
}

/* =============================================================
   MODAL — open in ADD mode
   ============================================================= */
function openAddModal() {
  editItemId = null;
  availState = true;
  clearModalFields();
  document.getElementById("modal-title").textContent = "Add Item";
  document.getElementById("item-modal").classList.add("open");
}

/* =============================================================
   MODAL — open in EDIT mode
   ============================================================= */
function openEditModal(id) {
  const item = allItems.find(i => i._id === id);
  if (!item) return;

  editItemId = id;
  availState = item.isAvailable !== false;

  document.getElementById("f-name").value    = item.name        || "";
  document.getElementById("f-desc").value    = item.description || "";
  document.getElementById("f-price").value   = item.price       || "";
  document.getElementById("f-cat").value     = item.category    || "ice-cream";
  document.getElementById("f-rating").value  = item.rating      || "";
  document.getElementById("f-reviews").value = item.reviews     || "";
  document.getElementById("f-badge").value   = item.badge       || "";
  // file input cannot be pre-filled (browser security)

  syncToggleUI();
  document.getElementById("modal-title").textContent = "Edit Item";
  document.getElementById("item-modal").classList.add("open");
}

/* =============================================================
   MODAL — close and reset
   ============================================================= */
function closeModal() {
  document.getElementById("item-modal").classList.remove("open");
  clearModalFields();
  editItemId = null;
  availState = true;
}

/* =============================================================
   MODAL — clear all fields back to defaults
   ============================================================= */
function clearModalFields() {
  ["f-name", "f-desc", "f-price", "f-rating", "f-reviews", "f-badge"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("f-cat").value = "ice-cream";
  document.getElementById("f-img").value = "";
  availState = true;
  syncToggleUI();
}

/* =============================================================
   AVAILABILITY TOGGLE
   ============================================================= */
function toggleAvail() {
  availState = !availState;
  syncToggleUI();
}

function syncToggleUI() {
  const tog = document.getElementById("f-tog");
  const lbl = document.getElementById("f-avail-lbl");
  if (availState) {
    tog.classList.add("on");
    lbl.textContent = "Available";
  } else {
    tog.classList.remove("on");
    lbl.textContent = "Unavailable";
  }
}

/* =============================================================
   SAVE ITEM — handles both ADD and EDIT
   ADD  → POST  /api/v1/admin/upload-item  (multipart/form-data)
   EDIT → PATCH /api/v1/admin/edit-item/:id  (multipart/form-data)
   ============================================================= */
async function saveItem() {
  const name  = document.getElementById("f-name").value.trim();
  const price = document.getElementById("f-price").value.trim();

  if (!name)  { showToast("Item name is required", "error"); return; }
  if (!price) { showToast("Price is required",     "error"); return; }

  const formData = new FormData();
  formData.append("name",        name);
  formData.append("description", document.getElementById("f-desc").value.trim());
  formData.append("price",       price);
  formData.append("category",    document.getElementById("f-cat").value);
  formData.append("rating",      document.getElementById("f-rating").value.trim());
  formData.append("reviews",     document.getElementById("f-reviews").value.trim());
  formData.append("badge",       document.getElementById("f-badge").value.trim());
  formData.append("isAvailable", availState);

  const imgFile = document.getElementById("f-img").files[0];
  if (imgFile) formData.append("item", imgFile);  // "item" matches multer field name

  const saveBtn = document.querySelector(".btn-save");
  saveBtn.disabled    = true;
  saveBtn.textContent = "Saving…";

  try {
    if (editItemId) {
      await api(`${BASE_URL}/admin/edit-item/${editItemId}`, {
        method: "PATCH",
        headers: {},  // let browser set multipart Content-Type boundary
        body: formData
      });
      showToast("Item updated successfully");
    } else {
      await api(`${BASE_URL}/admin/upload-item`, {
        method:  "POST",
        body:    formData,
      });
      showToast("Item added successfully");
    }

    closeModal();
    loadItems();

  } catch (err) {
    showToast(err.message || "Failed to save item", "error");
    console.error("saveItem:", err);
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = "Save Item";
  }
}

/* =============================================================
   DELETE ITEM
   DELETE http://localhost:8000/api/v1/admin/delete-item/:id
   ============================================================= */
async function deleteItem(id) {
  const confirmed = window.confirm("Delete this item? This cannot be undone.");
  if (!confirmed) return;

  try {
    await api(`${BASE_URL}/admin/delete-item/${id}`, { method: "DELETE" });
    showToast("Item deleted");
    loadItems();
  } catch (err) {
    showToast(err.message || "Failed to delete item", "error");
    console.error("deleteItem:", err);
  }
}

/* =============================================================
   Analytics
   GET http://localhost:8000/api/v1/admin/load-analytics
   ============================================================= */
async function loadAnalytics() {
  const sec = document.getElementById("sec-analytics");
  if (!sec) return;
 
  sec.innerHTML = `
    <div class="an-loading">
      <div class="an-spinner"></div>
      <p>Loading analytics…</p>
    </div>`;
 
  try {
    const data = await api(`${BASE_URL}/admin/load-analytics`);
 
    // ── Safe unwrap ────────────────────────────────────────────
    // Handles: { data: { ... } }, flat { summary, byMonth… },
    // or any other shape without blowing up.
    const payload =
      (data?.data && typeof data.data === "object" && !Array.isArray(data.data))
        ? data.data
        : (typeof data === "object" && data !== null && !Array.isArray(data))
          ? data
          : {};
 
    const {
      summary    = {},
      byYear     = [],
      byMonth    = [],
      byDay      = [],
      byStatus   = {},
      byPayment  = {},
      topItems   = [],
      byCategory = [],
      byHour     = [],
      byWeekday  = [],
    } = payload;
 
    // ── Empty-data guard ───────────────────────────────────────
    const hasData =
      Object.keys(summary).length > 0 ||
      byMonth.length > 0 ||
      byYear.length  > 0 ||
      topItems.length > 0;
 
    if (!hasData) {
      sec.innerHTML = `
        <div class="an-error">
          ⚠️ No analytics data returned from the server.<br>
          <small style="color:var(--an-muted)">Make sure orders exist and the /admin/load-analytics endpoint is working.</small>
        </div>`;
      return;
    }
 
    // ── Format helper ──────────────────────────────────────────
    const fmt = (n) =>
      n >= 1e7
        ? "₹" + (n / 1e7).toFixed(2) + "Cr"
        : n >= 1e5
        ? "₹" + (n / 1e5).toFixed(1) + "L"
        : "₹" + Math.round(n).toLocaleString("en-IN");
 
    sec.innerHTML = `
    <!-- ── KPI strip ─────────────────────────── -->
    <div class="an-kpi-row">
      <div class="an-kpi" style="--accent:#7c3aed">
        <div class="an-kpi-geo an-geo-hex"></div>
        <div class="an-kpi-label">Total Revenue</div>
        <div class="an-kpi-val">${fmt(summary.totalRevenue || 0)}</div>
      </div>
      <div class="an-kpi" style="--accent:#0ea5e9">
        <div class="an-kpi-geo an-geo-ring"></div>
        <div class="an-kpi-label">Total Orders</div>
        <div class="an-kpi-val">${(summary.totalOrders || 0).toLocaleString("en-IN")}</div>
      </div>
      <div class="an-kpi" style="--accent:#10b981">
        <div class="an-kpi-geo an-geo-tri"></div>
        <div class="an-kpi-label">Avg Order Value</div>
        <div class="an-kpi-val">₹${Math.round(summary.avgOrderValue || 0).toLocaleString("en-IN")}</div>
      </div>
      <div class="an-kpi" style="--accent:#f59e0b">
        <div class="an-kpi-geo an-geo-dia"></div>
        <div class="an-kpi-label">Payment Success</div>
        <div class="an-kpi-val">${Math.round(summary.paidRate || 0)}%</div>
      </div>
      <div class="an-kpi" style="--accent:#ef4444">
        <div class="an-kpi-geo an-geo-oct"></div>
        <div class="an-kpi-label">Cancel Rate</div>
        <div class="an-kpi-val">${Math.round(summary.cancelRate || 0)}%</div>
      </div>
    </div>
 
    <!-- ── Row 1: Revenue by Month (area) ── -->
    <div class="an-grid-2">
      <div class="an-card an-card--span2">
        <div class="an-card-head">
          <span class="an-card-title">Monthly Revenue Trend</span>
          <span class="an-badge an-badge--purple">Last 12 months</span>
        </div>
        <div class="an-chart-wrap" style="height:220px">
          <canvas id="anMonthRevChart"></canvas>
        </div>
      </div>
    </div>
 
    <!-- ── Row 2: Status donut + Payment donut + Category bar ── -->
    <div class="an-grid-3">
      <div class="an-card">
        <div class="an-card-head">
          <span class="an-card-title">Order Status</span>
        </div>
        <div class="an-chart-wrap" style="height:180px">
          <canvas id="anStatusChart"></canvas>
        </div>
        <div class="an-legend" id="anStatusLegend"></div>
      </div>
 
      <div class="an-card">
        <div class="an-card-head">
          <span class="an-card-title">Payment Status</span>
        </div>
        <div class="an-chart-wrap" style="height:180px">
          <canvas id="anPayChart"></canvas>
        </div>
        <div class="an-legend" id="anPayLegend"></div>
      </div>
 
      <div class="an-card">
        <div class="an-card-head">
          <span class="an-card-title">Revenue by Category</span>
          <span class="an-badge an-badge--teal">Top ${byCategory.length}</span>
        </div>
        <div class="an-chart-wrap" style="height:180px">
          <canvas id="anCatChart"></canvas>
        </div>
      </div>
    </div>
 
    <!-- ── Row 3: Daily orders line + Hourly bar ── -->
    <div class="an-grid-2">
      <div class="an-card">
        <div class="an-card-head">
          <span class="an-card-title">Daily Orders — Last 30 Days</span>
          <span class="an-badge an-badge--sky">Orders</span>
        </div>
        <div class="an-chart-wrap" style="height:190px">
          <canvas id="anDayChart"></canvas>
        </div>
      </div>
 
      <div class="an-card">
        <div class="an-card-head">
          <span class="an-card-title">Orders by Hour of Day</span>
          <span class="an-badge an-badge--amber">Busiest times</span>
        </div>
        <div class="an-chart-wrap" style="height:190px">
          <canvas id="anHourChart"></canvas>
        </div>
      </div>
    </div>
 
    <!-- ── Row 4: Weekday revenue + Top items ── -->
    <div class="an-grid-2">
      <div class="an-card">
        <div class="an-card-head">
          <span class="an-card-title">Revenue by Weekday</span>
        </div>
        <div class="an-chart-wrap" style="height:190px">
          <canvas id="anWdayChart"></canvas>
        </div>
      </div>
 
      <div class="an-card">
        <div class="an-card-head">
          <span class="an-card-title">Top Items</span>
          <span class="an-badge an-badge--green">By revenue</span>
        </div>
        <div class="an-top-items" id="anTopItems"></div>
      </div>
    </div>
 
    <!-- ── Row 5: Year-over-Year ── -->
    <div class="an-grid-2">
      <div class="an-card an-card--span2">
        <div class="an-card-head">
          <span class="an-card-title">Year-over-Year Revenue</span>
          <span class="an-badge an-badge--purple">All time</span>
        </div>
        <div class="an-chart-wrap" style="height:200px">
          <canvas id="anYearChart"></canvas>
        </div>
      </div>
    </div>
    `;
 
    await ensureChartJs();
    drawAnalyticsCharts({
      byMonth, byYear, byDay, byStatus, byPayment,
      byCategory, byHour, byWeekday, topItems, fmt,
    });
 
  } catch (err) {
    sec.innerHTML = `
      <div class="an-error">
        ❌ Failed to load analytics.<br>
        <small style="color:var(--an-muted)">${err.message || "Unknown error"}</small>
      </div>`;
    console.error("loadAnalytics:", err);
  }
}

function ensureChartJs() {
  if (window.Chart) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

const _chartRegistry = {};
 
function _destroyChart(id) {
  if (_chartRegistry[id]) {
    try { _chartRegistry[id].destroy(); } catch {}
    delete _chartRegistry[id];
  }
}
 
function _makeChart(id, config) {
  _destroyChart(id);
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const chart = new Chart(canvas, config);
  _chartRegistry[id] = chart;
  return chart;
}
 
function drawAnalyticsCharts({ byMonth, byYear, byDay, byStatus, byPayment, byCategory, byHour, byWeekday, topItems, fmt }) {
  const COLORS = {
    purple: "#7c3aed", sky: "#0ea5e9", teal: "#0d9488",
    green: "#10b981", amber: "#f59e0b", red: "#ef4444",
    pink: "#ec4899", indigo: "#6366f1", coral: "#f97316",
  };
 
  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
  };
 
  // ── 1. Monthly revenue (area) ─────────────────────────────────────────────
  _makeChart("anMonthRevChart", {
    type: "line",
    data: {
      labels: byMonth.map(d => d.month),
      datasets: [
        {
          label: "Revenue",
          data: byMonth.map(d => d.revenue),
          borderColor: COLORS.purple,
          backgroundColor: "rgba(124,58,237,0.12)",
          fill: true, tension: 0.45, pointRadius: 4,
          pointBackgroundColor: COLORS.purple,
          yAxisID: "yRev",
        },
        {
          label: "Orders",
          data: byMonth.map(d => d.orders),
          borderColor: COLORS.sky,
          backgroundColor: "rgba(14,165,233,0.08)",
          fill: true, tension: 0.45, pointRadius: 4,
          pointBackgroundColor: COLORS.sky,
          yAxisID: "yOrd",
        },
      ],
    },
    options: {
      ...baseOpts,
      scales: {
        x: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#94a3b8" } },
        yRev: {
          position: "left",
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: { color: COLORS.purple, callback: v => fmt(v) },
        },
        yOrd: {
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: { color: COLORS.sky },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ctx.dataset.label === "Revenue"
              ? "Revenue: " + fmt(ctx.raw)
              : "Orders: " + ctx.raw,
          },
        },
      },
    },
  });
 
  // ── 2. Order status donut ─────────────────────────────────────────────────
  const statusLabels = Object.keys(byStatus);
  const statusData   = Object.values(byStatus);
  const statusColors = [COLORS.amber, COLORS.sky, COLORS.green, COLORS.red];
  _makeChart("anStatusChart", {
    type: "doughnut",
    data: {
      labels: statusLabels,
      datasets: [{ data: statusData, backgroundColor: statusColors, borderWidth: 0, hoverOffset: 8 }],
    },
    options: { ...baseOpts, cutout: "72%", plugins: { legend: { display: false } } },
  });
  buildLegend("anStatusLegend", statusLabels, statusData, statusColors);
 
  // ── 3. Payment donut ──────────────────────────────────────────────────────
  const payLabels = Object.keys(byPayment);
  const payData   = Object.values(byPayment);
  const payColors = [COLORS.green, COLORS.amber, COLORS.red];
  _makeChart("anPayChart", {
    type: "doughnut",
    data: {
      labels: payLabels,
      datasets: [{ data: payData, backgroundColor: payColors, borderWidth: 0, hoverOffset: 8 }],
    },
    options: { ...baseOpts, cutout: "72%", plugins: { legend: { display: false } } },
  });
  buildLegend("anPayLegend", payLabels, payData, payColors);
 
  // ── 4. Category horizontal bar ────────────────────────────────────────────
  const catH = Math.max(180, byCategory.length * 36 + 40);
  const catCanvas = document.querySelector("#anCatChart");
  if (catCanvas) catCanvas.parentElement.style.height = catH + "px";
  _makeChart("anCatChart", {
    type: "bar",
    data: {
      labels: byCategory.map(c => c.category || "Other"),
      datasets: [{
        label: "Revenue",
        data: byCategory.map(c => c.revenue),
        backgroundColor: [COLORS.teal, COLORS.purple, COLORS.sky, COLORS.pink, COLORS.green, COLORS.amber, COLORS.coral, COLORS.indigo],
        borderRadius: 4,
      }],
    },
    options: {
      ...baseOpts,
      indexAxis: "y",
      scales: {
        x: { ticks: { color: "#94a3b8", callback: v => fmt(v) }, grid: { color: "rgba(255,255,255,0.05)" } },
        y: { ticks: { color: "#e2e8f0" }, grid: { display: false } },
      },
    },
  });
 
  // ── 5. Daily orders line (30d) ────────────────────────────────────────────
  _makeChart("anDayChart", {
    type: "line",
    data: {
      labels: byDay.map(d => {
        const dt = new Date(d.date);
        return dt.getDate() + "/" + (dt.getMonth() + 1);
      }),
      datasets: [{
        label: "Orders",
        data: byDay.map(d => d.orders),
        borderColor: COLORS.sky,
        backgroundColor: "rgba(14,165,233,0.1)",
        fill: true, tension: 0.35, pointRadius: 3,
        pointBackgroundColor: COLORS.sky,
      }],
    },
    options: {
      ...baseOpts,
      scales: {
        x: { ticks: { color: "#94a3b8", maxTicksLimit: 10, autoSkip: true }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.04)" } },
      },
    },
  });
 
  // ── 6. Hourly bar ─────────────────────────────────────────────────────────
  const allHours    = Array.from({ length: 24 }, (_, i) => i);
  const hourMap     = Object.fromEntries((byHour || []).map(h => [h.hour, h.orders]));
  const hourVals    = Object.values(hourMap);
  const maxHourOrders = hourVals.length > 0 ? Math.max(...hourVals, 1) : 1;
  _makeChart("anHourChart", {
    type: "bar",
    data: {
      labels: allHours.map(h => h + ":00"),
      datasets: [{
        label: "Orders",
        data: allHours.map(h => hourMap[h] || 0),
        backgroundColor: allHours.map(h => {
          const intensity = (hourMap[h] || 0) / maxHourOrders;
          return `rgba(245,158,11,${0.15 + intensity * 0.85})`;
        }),
        borderRadius: 3,
      }],
    },
    options: {
      ...baseOpts,
      scales: {
        x: { ticks: { color: "#94a3b8", maxTicksLimit: 12, autoSkip: true }, grid: { display: false } },
        y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.04)" } },
      },
    },
  });
 
  // ── 7. Weekday revenue bar ────────────────────────────────────────────────
  _makeChart("anWdayChart", {
    type: "bar",
    data: {
      labels: byWeekday.map(d => d.day),
      datasets: [
        {
          label: "Revenue",
          data: byWeekday.map(d => d.revenue),
          backgroundColor: "rgba(124,58,237,0.75)",
          borderRadius: 5,
          yAxisID: "yRev",
        },
        {
          label: "Orders",
          data: byWeekday.map(d => d.orders),
          type: "line",
          borderColor: COLORS.green,
          backgroundColor: "transparent",
          tension: 0.3, pointRadius: 4,
          pointBackgroundColor: COLORS.green,
          yAxisID: "yOrd",
        },
      ],
    },
    options: {
      ...baseOpts,
      scales: {
        x: { ticks: { color: "#e2e8f0" }, grid: { display: false } },
        yRev: {
          position: "left",
          ticks: { color: COLORS.purple, callback: v => fmt(v) },
          grid: { color: "rgba(255,255,255,0.04)" },
        },
        yOrd: {
          position: "right",
          ticks: { color: COLORS.green },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
 
  // ── 8. Year-over-year revenue ─────────────────────────────────────────────
  _makeChart("anYearChart", {
    type: "bar",
    data: {
      labels: byYear.map(d => d.year),
      datasets: [
        {
          label: "Revenue",
          data: byYear.map(d => d.revenue),
          backgroundColor: "rgba(124,58,237,0.8)",
          borderRadius: 6,
          yAxisID: "yRev",
        },
        {
          label: "Orders",
          data: byYear.map(d => d.orders),
          type: "line",
          borderColor: COLORS.sky,
          backgroundColor: "transparent",
          tension: 0.2, pointRadius: 6,
          pointBackgroundColor: COLORS.sky,
          yAxisID: "yOrd",
        },
      ],
    },
    options: {
      ...baseOpts,
      scales: {
        x: { ticks: { color: "#e2e8f0" }, grid: { display: false } },
        yRev: {
          position: "left",
          ticks: { color: COLORS.purple, callback: v => fmt(v) },
          grid: { color: "rgba(255,255,255,0.04)" },
        },
        yOrd: {
          position: "right",
          ticks: { color: COLORS.sky },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
 
  // ── 9. Top items list ─────────────────────────────────────────────────────
  const container = document.getElementById("anTopItems");
  if (container && topItems.length > 0) {
    const maxRev = Math.max(...topItems.map(i => i.revenue), 1);
    container.innerHTML = topItems.slice(0, 8).map((item, idx) => `
      <div class="an-item-row">
        <span class="an-item-rank">${idx + 1}</span>
        <div class="an-item-info">
          <span class="an-item-name">${item.name}</span>
          <span class="an-item-cat">${item.category || "—"} · ${item.qty} sold</span>
          <div class="an-item-bar">
            <div class="an-item-fill" style="width:${Math.round((item.revenue / maxRev) * 100)}%"></div>
          </div>
        </div>
        <span class="an-item-rev">${fmt(item.revenue)}</span>
      </div>
    `).join("");
  } else if (container) {
    container.innerHTML = `<div style="color:var(--an-muted);font-size:13px;padding:20px 0;text-align:center;">No item data yet</div>`;
  }
}



// ── Build donut legends ──────────────────────────────────────────────────────
function buildLegend(elId, labels, data, colors) {
  const total = data.reduce((a, b) => a + b, 0) || 1;
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = labels.map((l, i) => `
    <span class="an-leg-item">
      <span class="an-leg-dot" style="background:${colors[i]}"></span>
      <span>${l}</span>
      <span class="an-leg-pct">${Math.round((data[i] / total) * 100)}%</span>
    </span>
  `).join("");
}

/* =============================================================
   BUYERS — global state
   ============================================================= */
let allBuyers = [];
let filteredBuyers = [];
let selectedBuyer = null;

/* =============================================================
   BUYERS — fetch all buyers
   GET /api/v1/admin/load-buyers
   ============================================================= */
async function loadBuyers() {
  const sec = document.getElementById("sec-buyers");
  if (!sec) return;

  sec.innerHTML = `
    <div class="by-toolbar">
      <div class="by-search-wrap">
      <svg class="by-search-icon"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
          onclick="handleBuyerSearchClick()">
        <circle cx="11" cy="11" r="8"/>
        <path d="M21 21l-4.35-4.35"/>
      </svg>
        <input
          id="buyers-search"
          class="by-search"
          placeholder="Search by name, email or user ID…"
          oninput = "handleBuyerSearchClick()">
      </div>
      <div class="by-filters">
        <div class="pill by-pill-active" onclick="setBuyerFilter('all', this)">All <span class="cnt" id="byc-all">0</span></div>
        <div class="pill" onclick="setBuyerFilter('top', this)">⭐ Top Buyers <span class="cnt" id="byc-top">0</span></div>
        <div class="pill" onclick="setBuyerFilter('fraud', this)">⚠️ Flagged <span class="cnt" id="byc-fraud">0</span></div>
        <div class="pill" onclick="setBuyerFilter('blocked', this)">🚫 Blocked <span class="cnt" id="byc-blocked">0</span></div>
      </div>
    </div>
    <div class="by-layout">
      <div class="by-list" id="buyers-list-inner">
        <div class="an-loading">
          <div class="an-spinner"></div>
          <p>Loading buyers…</p>
        </div>
      </div>
      <div class="by-detail" id="buyer-detail">
        <div class="by-detail-empty">
          <div style="font-size:48px;margin-bottom:12px">👤</div>
          <p>Select a buyer to view details</p>
        </div>
      </div>
    </div>`;

  const raw = await api(`${BASE_URL}/admin/load-buyers`);
  allBuyers = Array.isArray(raw) ? raw : (raw?.data || []);

  // auto-detect fraud: 3+ cancelled orders or 0 completed but many orders
  allBuyers = allBuyers.map(u => ({
    ...u,
    isFraud: u.isFraud || detectFraud(u),
    isTop:   u.isTop   || detectTop(u),
  }));

  filteredBuyers = [...allBuyers];
  updateBuyerCounts();
  renderBuyersList(filteredBuyers);
}

function handleBuyerSearchClick() {
  const input = document.getElementById("buyers-search");
  
  if (!input) return;

  const query = input.value.trim().toLowerCase();

  if (!query) {
    showToast("Enter something to search", "info");
    return;
  }

  // 1. Try exact email match
  let result = allBuyers.filter(u =>
    (u.email || "").toLowerCase() === query
  );

  // 2. If not found → fallback to normal search
  if (result.length === 0) {
    result = allBuyers.filter(u =>
      (u.name || "").toLowerCase().includes(query) ||
      (u.email || "").toLowerCase().includes(query) ||
      (u._id || "").toLowerCase().includes(query)
    );
  }

  if (result.length === 0) {
    showToast("No user found", "error");
    return;
  }

  filteredBuyers = result;
  renderBuyersList(filteredBuyers);
  showBuyerDetail(result[0]._id);
}

/* =============================================================
   BUYERS — fraud & top detection
   ============================================================= */
function detectFraud(user) {
  const orders     = user.orders || [];
  const total      = orders.length;
  const cancelled  = orders.filter(o => o.status === "cancelled").length;
  const cancelRate = total > 0 ? cancelled / total : 0;
  // flag if >50% cancelled and at least 3 orders
  return total >= 3 && cancelRate > 0.5;
}

function detectTop(user) {
  // top buyer = totalSpent > 2000 OR 5+ delivered orders
  const orders    = user.orders || [];
  const delivered = orders.filter(o => o.status === "delivered").length;
  const spent     = user.totalSpent || orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
  return spent >= 2000 || delivered >= 5;
}

/* =============================================================
   BUYERS — update pill counts
   ============================================================= */
function updateBuyerCounts() {
  document.getElementById("byc-all").textContent       = allBuyers.length;
  document.getElementById("byc-top").textContent       = allBuyers.filter(u => u.isTop).length;
  document.getElementById("byc-fraud").textContent     = allBuyers.filter(u => u.isFraud).length;
  document.getElementById("byc-blocked").textContent   = allBuyers.filter(u => u.isBlocked).length;
}

/* =============================================================
   BUYERS — filter by tab
   ============================================================= */
let currentBuyerFilter = "all";

function setBuyerFilter(filter, el) {
  currentBuyerFilter = filter;
  document.querySelectorAll(".by-pill-active").forEach(p => p.classList.remove("by-pill-active"));
  if (el) el.classList.add("by-pill-active");

  const search = document.getElementById("buyers-search")?.value || "";
  filterBuyers(search);
}

/* =============================================================
   BUYERS — search + filter combined
   ============================================================= */
function filterBuyers(query = "") {
  const q = query.toLowerCase().trim();

  filteredBuyers = allBuyers.filter(u => {
    // tab filter
    if (currentBuyerFilter === "top"     && !u.isTop)      return false;
    if (currentBuyerFilter === "fraud"   && !u.isFraud)    return false;
    if (currentBuyerFilter === "blocked" && !u.isBlocked)  return false;

    // search filter
    if (!q) return true;
    return (
      (u.name  || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u._id   || "").toLowerCase().includes(q) ||
      (u.phone || "").toLowerCase().includes(q)
    );
  });

  renderBuyersList(filteredBuyers);
}

/* =============================================================
   BUYERS — render list cards
   ============================================================= */
function renderBuyersList(buyers) {
  const list = document.getElementById("buyers-list-inner");
  if (!list) return;

  if (!buyers.length) {
    list.innerHTML = `
      <div class="empty-s">
        <div class="ei">🔍</div>
        <p>No buyers found.</p>
      </div>`;
    return;
  }

  list.innerHTML = buyers.map(u => {
    const name     = u.name  || "Unknown";
    const email    = u.email || "—";
    const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const orders   = u.orders || [];
    const spent    = u.totalSpent || orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const isActive = selectedBuyer?._id === u._id;

    const badges = [
      u.isTop     ? `<span class="by-badge by-badge--top">⭐ Top</span>`     : "",
      u.isFraud   ? `<span class="by-badge by-badge--fraud">⚠️ Fraud</span>` : "",
      u.isBlocked ? `<span class="by-badge by-badge--blocked">🚫 Blocked</span>` : "",
    ].join("");

    return `
      <div class="by-card ${isActive ? "by-card--active" : ""}" onclick="showBuyerDetail('${u._id}')">
        <div class="by-av" style="${u.isFraud ? "border-color:#ef4444" : u.isTop ? "border-color:#f59e0b" : ""}">${initials}</div>
        <div class="by-card-info">
          <div class="by-card-name">${name} ${badges}</div>
          <div class="by-card-email">${email}</div>
          <div class="by-card-meta">
            <span>📦 ${orders.length} orders</span>
            <span>💰 ₹${spent.toLocaleString("en-IN")}</span>
          </div>
        </div>
        <div class="by-card-arrow">›</div>
      </div>`;
  }).join("");
}

/* =============================================================
   BUYERS — show detail panel
   ============================================================= */
function showBuyerDetail(id) {
  selectedBuyer = allBuyers.find(u => u._id === id);
  if (!selectedBuyer) return;

  // re-render list to update active state
  renderBuyersList(filteredBuyers);

  const u      = selectedBuyer;
  const orders = u.orders || [];
  const spent  = u.totalSpent || orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const delivered  = orders.filter(o => o.status === "delivered").length;
  const cancelled  = orders.filter(o => o.status === "cancelled").length;
  const pending    = orders.filter(o => o.status === "pending").length;
  const cancelRate = orders.length > 0 ? Math.round((cancelled / orders.length) * 100) : 0;

  const addr = u.address || u.deliveryAddress;
  const addrStr = addr
    ? [addr.line1, addr.city, addr.state, addr.pin].filter(Boolean).join(", ")
    : "No address saved";

  const joinDate = u.createdAt
    ? new Date(u.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";

  const detail = document.getElementById("buyer-detail");
  if (!detail) return;

  // Add the class to show the detail panel and adjust the layout
  const layout = document.querySelector(".by-layout");
  if (layout) layout.classList.add("has-detail");

  detail.innerHTML = `
    <!-- ── Header ── -->
    <div class="by-det-head">
      <div class="by-det-av">${u.name?.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase() || "?"}</div>
      <div class="by-det-info">
        <div class="by-det-name">
          ${u.name || "Unknown"}
          ${u.isTop     ? `<span class="by-badge by-badge--top">⭐ Top Buyer</span>`  : ""}
          ${u.isFraud   ? `<span class="by-badge by-badge--fraud">⚠️ Fraud Risk</span>` : ""}
          ${u.isBlocked ? `<span class="by-badge by-badge--blocked">🚫 Blocked</span>` : ""}
        </div>
        <div class="by-det-id">ID: ${u._id}</div>
        <div class="by-det-joined">Joined ${joinDate}</div>
      </div>
      <div class="by-det-actions">
        <button
          class="by-action-btn ${u.isBlocked ? "by-action--unblock" : "by-action--block"}"
          onclick="toggleBlockUser('${u._id}')"
        >
          ${u.isBlocked ? "✅ Unblock" : "🚫 Block"}
        </button>
        <button
          class="by-action-btn ${u.isFraud ? "by-action--unflag" : "by-action--flag"}"
          onclick="toggleFraudFlag('${u._id}')"
        >
          ${u.isFraud ? "✅ Clear Flag" : "⚠️ Flag Fraud"}
        </button>
      </div>
    </div>

    <!-- ── Contact info ── -->
    <div class="by-det-section">
      <div class="by-det-label">Contact</div>
      <div class="by-det-grid">
        <div class="by-det-field"><span>📧</span><span>${u.email || "—"}</span></div>
        <div class="by-det-field"><span>📞</span><span>${u.phone || "—"}</span></div>
        <div class="by-det-field"><span>📍</span><span>${addrStr}</span></div>
      </div>
    </div>

    <!-- ── Stats ── -->
    <div class="by-det-section">
      <div class="by-det-label">Order Summary</div>
      <div class="by-stats-row">
        <div class="by-stat">
          <div class="by-stat-val" style="color:#e2e8f0">${orders.length}</div>
          <div class="by-stat-lbl">Total</div>
        </div>
        <div class="by-stat">
          <div class="by-stat-val" style="color:#4ade80">${delivered}</div>
          <div class="by-stat-lbl">Delivered</div>
        </div>
        <div class="by-stat">
          <div class="by-stat-val" style="color:#f5a623">${pending}</div>
          <div class="by-stat-lbl">Pending</div>
        </div>
        <div class="by-stat">
          <div class="by-stat-val" style="color:#f87171">${cancelled}</div>
          <div class="by-stat-lbl">Cancelled</div>
        </div>
        <div class="by-stat">
          <div class="by-stat-val" style="color:#a78bfa">₹${spent.toLocaleString("en-IN")}</div>
          <div class="by-stat-lbl">Total Spent</div>
        </div>
      </div>

      <!-- Cancel rate bar -->
      ${orders.length > 0 ? `
      <div class="by-cancel-bar-wrap">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--an-muted,#64748b);margin-bottom:5px">
          <span>Cancel Rate</span><span style="color:${cancelRate > 50 ? "#f87171" : "#4ade80"}">${cancelRate}%</span>
        </div>
        <div class="by-cancel-bar">
          <div class="by-cancel-fill" style="width:${cancelRate}%;background:${cancelRate > 50 ? "#ef4444" : cancelRate > 25 ? "#f59e0b" : "#4ade80"}"></div>
        </div>
        ${cancelRate > 50 ? `<div class="by-fraud-warn">⚠️ High cancellation rate — potential fraud risk</div>` : ""}
      </div>` : ""}
    </div>

    <!-- ── Recent orders ── -->
    ${orders.length > 0 ? `
    <div class="by-det-section">
      <div class="by-det-label">Recent Orders</div>
      <div class="by-orders-list">
        ${orders.slice(0, 5).map(o => `
          <div class="by-order-row">
            <div>
              <div class="by-order-id">#${o._id || "—"}</div>
              <div class="by-order-date">${o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-IN") : "—"}</div>
            </div>
            <span class="sbadge s-${o.status || "pending"}">${(o.status || "pending").charAt(0).toUpperCase() + (o.status || "pending").slice(1)}</span>
            <div class="by-order-amt">₹${(o.totalAmount || 0).toLocaleString("en-IN")}</div>
          </div>`).join("")}
      </div>
    </div>` : ""}
  `;
}

/* =============================================================
   BUYERS — block / unblock user
   PATCH /api/v1/admin/users/:id/block
   ============================================================= */
async function toggleBlockUser(id) {
  const user = allBuyers.find(u => u._id === id);
  if (!user) return;

  const action = user.isBlocked ? "unblock" : "block";
  const confirmed = window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this user?`);
  if (!confirmed) return;

  const res = await api(`${BASE_URL}/admin/users/${id}/${action}`, { method: "PATCH" });
  const updated = res?.data || res;

  // update local state
  user.isBlocked = !user.isBlocked;
  updateBuyerCounts();
  renderBuyersList(filteredBuyers);
  showBuyerDetail(id);
  showToast(`User ${action}ed successfully`);
}

/* =============================================================
   BUYERS — flag / unflag fraud
   PATCH /api/v1/admin/users/:id/fraud
   ============================================================= */
async function toggleFraudFlag(id) {
  const user = allBuyers.find(u => u._id === id);
  if (!user) return;

  const action = user.isFraud ? "clear" : "flag";
  const confirmed = window.confirm(`${action === "flag" ? "Flag this user as fraud?" : "Clear fraud flag?"}`);
  if (!confirmed) return;

  await api(`${BASE_URL}/admin/users/${id}/fraud`, {
    method: "PATCH",
    body: JSON.stringify({ isFraud: !user.isFraud })
  });

  user.isFraud = !user.isFraud;
  // also re-run top detection in case fraud overrides top
  updateBuyerCounts();
  renderBuyersList(filteredBuyers);
  showBuyerDetail(id);
  showToast(`Fraud flag ${action === "flag" ? "set" : "cleared"}`);
}

/* =============================================================
   DYNAMIC CATEGORY DROPDOWN (for item modal)
   ============================================================= */
async function loadCategoryDropdown() {
  try {
    const res = await fetch(`${BASE_URL}/categories`);
    const data = await res.json();
    const categories = data.data || [];
    const select = document.getElementById("f-cat");
    if (!select || categories.length === 0) return;

    select.innerHTML = categories.map(c =>
      `<option value="${c.slug || c.name.toLowerCase()}">${c.emoji || "🍦"} ${c.name}</option>`
    ).join("");
  } catch {
    // Keep existing hardcoded options if fetch fails
  }
}

/* =============================================================
   BANNERS — Admin Management
   ============================================================= */
async function loadBannersAdmin() {
  const sec = document.getElementById("sec-banners");
  if (!sec) return;

  sec.innerHTML = `
    <div class="sec-head" style="display:flex;align-items:center;justify-content:space-between;">
      <div class="sec-title">All Banners</div>
      <button class="add-btn" onclick="openBannerUploadForm()" style="display:flex">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        Add Banner
      </button>
    </div>
    <div id="banner-upload-form" style="display:none;margin-bottom:24px;"></div>
    <div id="banners-grid" class="items-grid">
      <div class="empty-s"><div class="ei">🖼️</div><p>Loading banners…</p></div>
    </div>`;

  try {
    const data = await api(`${BASE_URL}/banners/admin`);
    const banners = Array.isArray(data) ? data : (data.data || []);
    renderBannersGrid(banners);
  } catch (err) {
    showToast("Failed to load banners", "error");
    console.error(err);
  }
}

function renderBannersGrid(banners) {
  const grid = document.getElementById("banners-grid");
  if (!grid) return;

  if (banners.length === 0) {
    grid.innerHTML = `<div class="empty-s"><div class="ei">🖼️</div><p>No banners yet. Click "Add Banner" to create one.</p></div>`;
    return;
  }

  grid.innerHTML = banners.map(b => `
    <div class="icard" data-id="${b._id}">
      <div class="icard-img" style="height:140px; background: ${b.type === 'text' ? 'linear-gradient(135deg, var(--accent-dim), var(--card))' : 'none'};">
        ${b.type === 'text' 
          ? `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text);font-weight:bold;">📝 Text Banner</div>`
          : `<img src="${b.imageUrl}" alt="Banner" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">`
        }
        <span class="avail-dot ${b.isActive ? "on" : "off"}"></span>
        ${b.tagText ? `<span class="badge-float">${b.tagText}</span>` : ""}
      </div>
      <div class="icard-body">
        <div class="icard-name">${b.title || "Untitled Banner"}</div>
        <div class="icard-desc">${b.subtitle || ""}</div>
        <div class="icard-meta">
          <span class="stock-tag ${b.isActive ? "s-delivered" : "s-cancelled"}">
            ${b.isActive ? "Active" : "Inactive"}
          </span>
          <span style="font-size:11px;color:var(--muted)">Order: ${b.sortOrder || 0}</span>
        </div>
        <div class="icard-actions">
          <button class="ibtn" onclick="toggleBannerActive('${b._id}')">
            ${b.isActive ? "🔴 Deactivate" : "🟢 Activate"}
          </button>
          <button class="ibtn del" onclick="deleteBannerAdmin('${b._id}')">🗑️ Delete</button>
        </div>
      </div>
    </div>
  `).join("");
}

function openBannerUploadForm() {
  const form = document.getElementById("banner-upload-form");
  if (!form) return;

  form.style.display = "block";
  form.innerHTML = `
    <div class="modal-body" style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px;">
      <div class="frow">
        <div class="field"><label>Title</label><input id="b-title" placeholder="Summer Sale!"/></div>
        <div class="field"><label>Subtitle</label><input id="b-subtitle" placeholder="Up to 40% off…"/></div>
      </div>
      <div class="frow">
        <div class="field"><label>Tag Text</label><input id="b-tag" placeholder="Limited Offer"/></div>
        <div class="field"><label>CTA Text</label><input id="b-cta" placeholder="Shop Now →" value="Shop Now →"/></div>
      </div>
      <div class="frow">
        <div class="field"><label>CTA Link</label><input id="b-link" placeholder="#" value="#"/></div>
        <div class="field"><label>Sort Order</label><input id="b-order" type="number" placeholder="0" value="0"/></div>
      </div>
      <div class="modal-foot">
        <button class="btn-cancm" onclick="document.getElementById('banner-upload-form').style.display='none'">Cancel</button>
        <button class="btn-save" onclick="uploadBannerAdmin()">Upload Banner</button>
      </div>
    </div>`;
}

function toggleBannerFormType() {
  const type = document.querySelector('input[name="b-type"]:checked').value;
  const textFields = document.getElementById("b-text-fields");
  const imgField = document.getElementById("b-img-field");
  const imgOrderField = document.getElementById("b-img-order-field");

  if (type === "text") {
    textFields.style.display = "block";
    imgField.style.display = "none";
    imgOrderField.style.display = "none";
  } else {
    textFields.style.display = "none";
    imgField.style.display = "block";
    imgOrderField.style.display = "block";
  }
}

async function uploadBannerAdmin() {
  const title = document.getElementById("b-title")?.value.trim();
  if (!title) { showToast("Title is required", "error"); return; }

  try {
    await api(`${BASE_URL}/banners/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type:      "text",
        title,
        subtitle:  document.getElementById("b-subtitle")?.value.trim() || "",
        tagText:   document.getElementById("b-tag")?.value.trim()      || "",
        ctaText:   document.getElementById("b-cta")?.value.trim()      || "Shop Now →",
        ctaLink:   document.getElementById("b-link")?.value.trim()     || "#",
        sortOrder: Number(document.getElementById("b-order")?.value    || 0),
      }),
    });
    showToast("Banner uploaded successfully");
    document.getElementById("banner-upload-form").style.display = "none";
    loadBannersAdmin();
  } catch (err) {
    showToast(err.message || "Failed to upload banner", "error");
  }
}

async function toggleBannerActive(id) {
  try {
    await api(`${BASE_URL}/banners/admin/${id}/toggle`, { method: "PATCH" });
    showToast("Banner status toggled");
    loadBannersAdmin();
  } catch (err) {
    showToast("Failed to toggle banner", "error");
  }
}

async function deleteBannerAdmin(id) {
  if (!confirm("Delete this banner permanently?")) return;
  try {
    await api(`${BASE_URL}/banners/admin/${id}`, { method: "DELETE" });
    showToast("Banner deleted");
    loadBannersAdmin();
  } catch (err) {
    showToast("Failed to delete banner", "error");
  }
}

/* =============================================================
   COUPONS — Admin Management
   ============================================================= */
async function loadCouponsAdmin() {
  const sec = document.getElementById("sec-coupons");
  if (!sec) return;

  sec.innerHTML = `
    <div class="sec-head" style="display:flex;align-items:center;justify-content:space-between;">
      <div class="sec-title">All Coupons</div>
      <button class="add-btn" onclick="openCouponForm()" style="display:flex">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        Add Coupon
      </button>
    </div>
    <div id="coupon-form" style="display:none;margin-bottom:24px;"></div>
    <div id="coupons-list">
      <div class="empty-s"><div class="ei">🎟️</div><p>Loading coupons…</p></div>
    </div>`;

  try {
    const data = await api(`${BASE_URL}/admin/coupons`);
    const coupons = Array.isArray(data) ? data : (data.data || []);
    renderCouponsList(coupons);
  } catch (err) {
    showToast("Failed to load coupons", "error");
  }
}

function renderCouponsList(coupons) {
  const list = document.getElementById("coupons-list");
  if (!list) return;

  if (coupons.length === 0) {
    list.innerHTML = `<div class="empty-s"><div class="ei">🎟️</div><p>No coupons yet. Click "Add Coupon" to create one.</p></div>`;
    return;
  }

  list.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
      ${coupons.map(c => {
        const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
        return `
          <div class="icard" style="overflow:visible;">
            <div class="icard-body" style="padding:20px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div class="icard-name" style="font-size:18px;letter-spacing:2px;">${c.code}</div>
                <span class="stock-tag ${c.isActive && !expired ? "s-delivered" : "s-cancelled"}">
                  ${expired ? "Expired" : c.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <div style="font-size:28px;font-weight:800;margin-bottom:8px;background:var(--accent,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">
                ${c.discountPct}% OFF
              </div>
              <div class="icard-meta" style="flex-direction:column;align-items:flex-start;gap:4px;">
                <span style="font-size:12px;color:var(--muted)">Used: ${c.usedCount}${c.usageLimit > 0 ? ` / ${c.usageLimit}` : " (unlimited)"}</span>
                ${c.expiresAt ? `<span style="font-size:12px;color:var(--muted)">Expires: ${new Date(c.expiresAt).toLocaleDateString("en-IN")}</span>` : ""}
              </div>
              <div class="icard-actions" style="margin-top:12px;">
                <button class="ibtn" onclick="toggleCouponActive('${c._id}')">
                  ${c.isActive ? "🔴 Deactivate" : "🟢 Activate"}
                </button>
                <button class="ibtn del" onclick="deleteCouponAdmin('${c._id}')">🗑️ Delete</button>
              </div>
            </div>
          </div>`;
      }).join("")}
    </div>`;
}

function openCouponForm() {
  const form = document.getElementById("coupon-form");
  if (!form) return;

  form.style.display = "block";
  form.innerHTML = `
    <div class="modal-body" style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px;">
      <div class="frow">
        <div class="field"><label>Coupon Code *</label><input id="c-code" placeholder="SUMMER20" style="text-transform:uppercase"/></div>
        <div class="field"><label>Discount % *</label><input id="c-pct" type="number" min="1" max="100" placeholder="20"/></div>
      </div>
      <div class="frow">
        <div class="field"><label>Usage Limit (0=unlimited)</label><input id="c-limit" type="number" placeholder="0" value="0"/></div>
        <div class="field"><label>Expires At</label><input id="c-expires" type="date"/></div>
      </div>
      <div class="modal-foot">
        <button class="btn-cancm" onclick="document.getElementById('coupon-form').style.display='none'">Cancel</button>
        <button class="btn-save" onclick="createCouponAdmin()">Create Coupon</button>
      </div>
    </div>`;
}

async function createCouponAdmin() {
  const code = document.getElementById("c-code")?.value.trim();
  const pct  = document.getElementById("c-pct")?.value;
  if (!code || !pct) { showToast("Code and discount % are required", "error"); return; }

  try {
    await api(`${BASE_URL}/admin/coupons`, {
      method: "POST",
      body: JSON.stringify({
        code,
        discountPct: Number(pct),
        usageLimit: Number(document.getElementById("c-limit")?.value || 0),
        expiresAt: document.getElementById("c-expires")?.value || null,
      }),
    });
    showToast("Coupon created successfully");
    document.getElementById("coupon-form").style.display = "none";
    loadCouponsAdmin();
  } catch (err) {
    showToast(err.message || "Failed to create coupon", "error");
  }
}

async function toggleCouponActive(id) {
  try {
    await api(`${BASE_URL}/admin/coupons/${id}/toggle`, { method: "PATCH" });
    showToast("Coupon status toggled");
    loadCouponsAdmin();
  } catch (err) {
    showToast("Failed to toggle coupon", "error");
  }
}

async function deleteCouponAdmin(id) {
  if (!confirm("Delete this coupon permanently?")) return;
  try {
    await api(`${BASE_URL}/admin/coupons/${id}`, { method: "DELETE" });
    showToast("Coupon deleted");
    loadCouponsAdmin();
  } catch (err) {
    showToast("Failed to delete coupon", "error");
  }
}



/* =============================================================
   FIX 4 — ALL NOTIFICATION FUNCTIONS (were commented out)
   Root cause: every single notification function was wrapped in
   block comments, but they are all still called from:
     • HTML onclick attributes  (toggleAdminNotifDropdown, markAllAdminNotifRead)
     • DOMContentLoaded         (loadAdminNotifCount)
     • initAdminSocket handler  (loadAdminNotifications)
   This caused silent "function is not defined" JS errors that
   broke the entire notification system.
   All functions are restored below with the Font Awesome icon
   fix included (✕ instead of <i class="fas fa-times">).
   ============================================================= */
 
const adminNotifStore = new Map();
 
function toggleAdminNotifDropdown(e) {
  e?.stopPropagation();
  const dropdown = document.getElementById("adminNotifDropdown");
  if (!dropdown) return;
  dropdown.classList.toggle("open");
  if (dropdown.classList.contains("open")) loadAdminNotifications();
}
 
document.addEventListener("click", (e) => {
  const dropdown = document.getElementById("adminNotifDropdown");
  const bell     = document.getElementById("adminNotifBell");
  if (dropdown && !dropdown.contains(e.target) && e.target !== bell) {
    dropdown.classList.remove("open");
  }
});
 
async function loadAdminNotifCount() {
  try {
    const data  = await api(`${BASE_URL}/admin/notifications/unread`);
    const count = data?.data?.count || 0;
    const badge = document.getElementById("adminNotifBadge");
    if (badge) {
      badge.textContent = count;
      badge.classList.toggle("show", count > 0);
    }
  } catch {}
}
 
async function loadAdminNotifications() {
  try {
    const data  = await api(`${BASE_URL}/admin/notifications`);
    const notifs = data?.data || [];
    const list   = document.getElementById("adminNotifList");
    if (!list) return;
 
    if (notifs.length === 0) {
      list.innerHTML = `<div class="notif-empty">No notifications yet 🔕</div>`;
      return;
    }
 
    const iconMap = {
      order_placed:    "📦", order_confirmed: "✅", order_delivered: "🚀",
      order_cancelled: "❌", payment_success: "💰", payment_failed:  "⚠️",
      system:          "🔔", promo:           "🎉",
    };
 
    adminNotifStore.clear();
    notifs.forEach(n => adminNotifStore.set(String(n._id), n));
 
    list.innerHTML = notifs.slice(0, 20).map(n => {
      const seconds = Math.floor((new Date() - new Date(n.createdAt)) / 1000);
      let time = "Just now";
      if      (seconds >= 86400) time = `${Math.floor(seconds / 86400)}d ago`;
      else if (seconds >= 3600)  time = `${Math.floor(seconds / 3600)}h ago`;
      else if (seconds >= 60)    time = `${Math.floor(seconds / 60)}m ago`;
 
      return `
        <div class="notif-item ${n.isRead ? "" : "unread"}"
             data-notif-id="${n._id}"
             style="cursor:pointer">
          <div class="notif-item-icon">${iconMap[n.type] || "🔔"}</div>
          <div class="notif-item-body">
            <div class="notif-item-title">${n.title}</div>
            <div class="notif-item-msg">${n.message}</div>
            <div class="notif-item-time">${time}</div>
          </div>
        </div>`;
    }).join("");
 
    // Wire clicks safely — never pass JSON through onclick attributes
    list.querySelectorAll(".notif-item[data-notif-id]").forEach(el => {
      el.addEventListener("click", function () {
        const notif = adminNotifStore.get(this.dataset.notifId);
        markAdminNotifRead(this.dataset.notifId, this);
        openAdminNotifModal(notif);
      });
    });
 
  } catch (err) {
    console.error("loadAdminNotifications:", err);
  }
}
 
async function markAdminNotifRead(id, el) {
  try {
    await api(`${BASE_URL}/admin/notifications/${id}/read`, { method: "PATCH" });
    if (el) el.classList.remove("unread");
    loadAdminNotifCount();
  } catch {}
}
 
async function markAllAdminNotifRead() {
  try {
    await api(`${BASE_URL}/admin/notifications/read-all`, { method: "PATCH" });
    loadAdminNotifCount();
    loadAdminNotifications();
  } catch {}
}
 
function openAdminNotifModal(n) {
  if (!n) return;
 
  const iconMap = {
    order_placed:    "📦", order_confirmed: "✅", order_delivered: "🚀",
    order_cancelled: "❌", payment_success: "💰", payment_failed:  "⚠️",
    system:          "🔔", promo:           "🎉",
  };
  const typeLabels = {
    order_placed:    "Order placed",    order_confirmed: "Order confirmed",
    order_delivered: "Order delivered", order_cancelled: "Order cancelled",
    payment_success: "Payment success", payment_failed:  "Payment failed",
    system:          "System",          promo:           "Promotion",
  };
 
  let modal = document.getElementById("adminNotifModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id        = "adminNotifModal";
    modal.className = "notif-modal-overlay";
    modal.innerHTML = `
      <div class="notif-modal-box">
        <button class="notif-modal-close" onclick="closeAdminNotifModal()" aria-label="Close">✕</button>
        <div class="notif-modal-header">
          <div class="notif-modal-icon" id="adminNotifModalIcon">🔔</div>
          <div>
            <div class="notif-modal-type" id="adminNotifModalType"></div>
            <div class="notif-modal-time" id="adminNotifModalTime"></div>
          </div>
        </div>
        <h3 class="notif-modal-title"   id="adminNotifModalTitle"></h3>
        <p  class="notif-modal-message" id="adminNotifModalMessage"></p>
        <div class="notif-modal-actions">
          <button class="notif-modal-btn-secondary" onclick="closeAdminNotifModal()">Close</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", e => { if (e.target === modal) closeAdminNotifModal(); });
  }
 
  const seconds = Math.floor((new Date() - new Date(n.createdAt)) / 1000);
  let time = "Just now";
  if      (seconds >= 86400) time = `${Math.floor(seconds / 86400)}d ago`;
  else if (seconds >= 3600)  time = `${Math.floor(seconds / 3600)}h ago`;
  else if (seconds >= 60)    time = `${Math.floor(seconds / 60)}m ago`;
 
  document.getElementById("adminNotifModalIcon").textContent    = iconMap[n.type]    || "🔔";
  document.getElementById("adminNotifModalType").textContent    = typeLabels[n.type] || "Notification";
  document.getElementById("adminNotifModalTime").textContent    = time;
  document.getElementById("adminNotifModalTitle").textContent   = n.title   || "";
  document.getElementById("adminNotifModalMessage").textContent = n.message || "";
 
  document.getElementById("adminNotifDropdown")?.classList.remove("open");
  modal.classList.add("show");
  document.body.style.overflow = "hidden";
}
 
function closeAdminNotifModal() {
  document.getElementById("adminNotifModal")?.classList.remove("show");
  document.body.style.overflow = "";
}
/* =============================================================
   ADMIN SOCKET.IO
   ============================================================= */
let adminSocket = null;

function initAdminSocket() {
  const token = localStorage.getItem("accessToken");
  if (!token || typeof io === "undefined") return;

  try {
    // Note: socket.io connects to the root host/port rather than the /api/v1 path directly
    const socketUrl = BASE_URL.replace("/api/v1", "");
    adminSocket = io(socketUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    adminSocket.on("connect", () => {
      console.log("🟢 Admin socket connected:", adminSocket.id);
    });

    adminSocket.on("new_notification", (notification) => {
      const badge = document.getElementById("adminNotifBadge");
      if (badge) {
        const current = parseInt(badge.textContent) || 0;
        badge.textContent = current + 1;
        badge.classList.add("show");
      }

      const dropdown = document.getElementById("adminNotifDropdown");
      if (dropdown?.classList.contains("open")) {
        loadAdminNotifications();
      }

      showToast(notification.title || "New notification", "info");

      // Auto-refresh orders if on orders section
      const ordersSection = document.getElementById("sec-orders");
      if (ordersSection && ordersSection.style.display !== "none") {
        loadOrders();
      }
    });

    adminSocket.on("disconnect", () => {
      console.log("🔴 Admin socket disconnected");
    });
  } catch (err) {
    console.error("Admin socket init error:", err);
  }
}

/* =============================================================
   CATEGORIES — Admin Management
   Routes: GET /api/v1/categories (public)
           POST   /api/v1/categories/admin  (admin)
           PATCH  /api/v1/categories/admin/:id (admin)
           DELETE /api/v1/categories/admin/:id (admin)
   ============================================================= */

let allCategories = [];

/* Load and render the full Categories admin section */
async function loadCategoriesAdmin() {
  const sec = document.getElementById("sec-categories");
  if (!sec) return;

  sec.innerHTML = `
    <div class="sec-head" style="display:flex;align-items:center;justify-content:space-between;">
      <div class="sec-title">Categories</div>
      <button class="add-btn" onclick="openCategoryForm()" style="display:flex">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Add Category
      </button>
    </div>
    <div id="category-form" style="display:none;margin-bottom:24px;"></div>
    <div id="categories-grid" class="items-grid">
      <div class="empty-s"><div class="ei">🏷️</div><p>Loading categories…</p></div>
    </div>`;

  try {
    const data = await api(`${BASE_URL}/categories`);
    allCategories = Array.isArray(data) ? data : (data.data || []);
    renderCategoriesGrid(allCategories);
  } catch (err) {
    showToast("Failed to load categories", "error");
    console.error(err);
  }
}

/* Render category cards into the grid */
function renderCategoriesGrid(categories) {
  const grid = document.getElementById("categories-grid");
  if (!grid) return;

  if (categories.length === 0) {
    grid.innerHTML = `
      <div class="empty-s">
        <div class="ei">🏷️</div>
        <p>No categories yet. Click "Add Category" to create one.</p>
      </div>`;
    return;
  }

  grid.innerHTML = categories.map(cat => `
    <div class="icard" data-id="${cat._id}">
      <div class="icard-img" style="
        height:100px;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:48px;
        background: linear-gradient(135deg, var(--accent-dim, #1e1b4b), var(--card, #1e1e2e));
      ">
        ${cat.emoji || "🍦"}
        <span class="avail-dot ${cat.isActive ? "on" : "off"}"></span>
      </div>
      <div class="icard-body">
        <div class="icard-row1">
          <div class="icard-name">${cat.name}</div>
        </div>
        <div class="icard-meta">
          <span class="stock-tag ${cat.isActive ? "s-delivered" : "s-cancelled"}">
            ${cat.isActive ? "Active" : "Inactive"}
          </span>
          <span style="font-size:11px;color:var(--muted)">
            Slug: ${cat.slug || cat.name.toLowerCase().replace(/\s+/g, "-")}
          </span>
        </div>
        <div class="icard-actions">
          <button class="ibtn" onclick="openEditCategoryForm('${cat._id}')">✏️ Edit</button>
          <button class="ibtn" onclick="toggleCategoryActive('${cat._id}')">
            ${cat.isActive ? "🔴 Deactivate" : "🟢 Activate"}
          </button>
          <button class="ibtn del" onclick="deleteCategoryAdmin('${cat._id}')">🗑️ Delete</button>
        </div>
      </div>
    </div>`).join("");
}

/* Open CREATE form */
function openCategoryForm() {
  const form = document.getElementById("category-form");
  if (!form) return;

  form.style.display = "block";
  form.innerHTML = `
    <div class="modal-body" style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px;">
      <div class="sec-title" style="margin-bottom:16px;font-size:16px;">New Category</div>
      <div class="frow">
        <div class="field">
          <label>Category Name *</label>
          <input id="cat-name" placeholder="e.g. Sundaes"/>
        </div>
        <div class="field">
          <label>Emoji</label>
          <input id="cat-emoji" placeholder="🍦" maxlength="4" style="font-size:24px;width:80px;text-align:center;"/>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn-cancm" onclick="closeCategoryForm()">Cancel</button>
        <button class="btn-save" onclick="createCategoryAdmin()">Create Category</button>
      </div>
    </div>`;
}

/* Open EDIT form — pre-fills existing values */
function openEditCategoryForm(id) {
  const cat = allCategories.find(c => c._id === id);
  if (!cat) return;

  const form = document.getElementById("category-form");
  if (!form) return;

  form.style.display = "block";
  form.innerHTML = `
    <div class="modal-body" style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px;">
      <div class="sec-title" style="margin-bottom:16px;font-size:16px;">Edit Category</div>
      <div class="frow">
        <div class="field">
          <label>Category Name *</label>
          <input id="cat-name" value="${cat.name}" placeholder="e.g. Sundaes"/>
        </div>
        <div class="field">
          <label>Emoji</label>
          <input id="cat-emoji" value="${cat.emoji || "🍦"}" maxlength="4" style="font-size:24px;width:80px;text-align:center;"/>
        </div>
      </div>
      <div class="field">
        <label>Status</label>
        <div class="toggle-row">
          <span id="cat-active-lbl" style="font-size:13px;font-weight:500;color:var(--text)">
            ${cat.isActive ? "Active" : "Inactive"}
          </span>
          <div class="tswitch ${cat.isActive ? "on" : ""}" id="cat-active-tog"
            onclick="toggleCatFormStatus(this)"
            data-value="${cat.isActive}">
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn-cancm" onclick="closeCategoryForm()">Cancel</button>
        <button class="btn-save" onclick="updateCategoryAdmin('${id}')">Save Changes</button>
      </div>
    </div>`;
}

/* Toggle the isActive switch inside the edit form */
function toggleCatFormStatus(el) {
  const current = el.dataset.value === "true";
  el.dataset.value = String(!current);
  el.classList.toggle("on", !current);
  const lbl = document.getElementById("cat-active-lbl");
  if (lbl) lbl.textContent = !current ? "Active" : "Inactive";
}

function closeCategoryForm() {
  const form = document.getElementById("category-form");
  if (form) form.style.display = "none";
}

/* POST /api/v1/categories/admin — Create */
async function createCategoryAdmin() {
  const name  = document.getElementById("cat-name")?.value.trim();
  const emoji = document.getElementById("cat-emoji")?.value.trim();

  if (!name) { showToast("Category name is required", "error"); return; }

  try {
    await api(`${BASE_URL}/categories/admin`, {
      method: "POST",
      body: JSON.stringify({ name, emoji: emoji || "🍦" }),
    });
    showToast("Category created successfully");
    closeCategoryForm();
    loadCategoriesAdmin();
    loadCategoryDropdown(); // refresh the item modal dropdown too
  } catch (err) {
    showToast(err.message || "Failed to create category", "error");
    console.error(err);
  }
}

/* PATCH /api/v1/categories/admin/:id — Update */
async function updateCategoryAdmin(id) {
  const name     = document.getElementById("cat-name")?.value.trim();
  const emoji    = document.getElementById("cat-emoji")?.value.trim();
  const tog      = document.getElementById("cat-active-tog");
  const isActive = tog ? tog.dataset.value === "true" : true;

  if (!name) { showToast("Category name is required", "error"); return; }

  try {
    await api(`${BASE_URL}/categories/admin/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, emoji: emoji || "🍦", isActive }),
    });
    showToast("Category updated successfully");
    closeCategoryForm();
    loadCategoriesAdmin();
    loadCategoryDropdown(); // keep item modal in sync
  } catch (err) {
    showToast(err.message || "Failed to update category", "error");
    console.error(err);
  }
}

/* PATCH isActive only — quick toggle from the card */
async function toggleCategoryActive(id) {
  const cat = allCategories.find(c => c._id === id);
  if (!cat) return;

  try {
    await api(`${BASE_URL}/categories/admin/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !cat.isActive }),
    });
    showToast(`Category ${!cat.isActive ? "activated" : "deactivated"}`);
    loadCategoriesAdmin();
    loadCategoryDropdown();
  } catch (err) {
    showToast(err.message || "Failed to update category", "error");
  }
}

/* DELETE /api/v1/categories/admin/:id — Delete */
async function deleteCategoryAdmin(id) {
  if (!confirm("Delete this category permanently? Items using it will be unaffected.")) return;

  try {
    await api(`${BASE_URL}/categories/admin/${id}`, { method: "DELETE" });
    showToast("Category deleted");
    loadCategoriesAdmin();
    loadCategoryDropdown();
  } catch (err) {
    showToast(err.message || "Failed to delete category", "error");
    console.error(err);
  }
}

// Initialize socket and notification count on page load
document.addEventListener("DOMContentLoaded", () => {
  initAdminSocket();
  loadAdminNotifCount();
});

/* =============================================================
   NOTIFICATIONS SECTION
   ============================================================= */
let _notifType = "broadcast";
let _notifInited = false;

function initNotificationsSection() {
  if (_notifInited) return;
  _notifInited = true;

  // Toggle between broadcast / targeted
  document.querySelectorAll(".notif-type-btn").forEach(btn => {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".notif-type-btn").forEach(b => b.classList.remove("active"));
      this.classList.add("active");
      _notifType = this.dataset.notifType;
      const emailGroup = document.getElementById("notifEmailGroup");
      if (emailGroup) emailGroup.style.display = _notifType === "targeted" ? "block" : "none";
    });
  });

  // Send button
  const sendBtn = document.getElementById("sendNotifBtn");
  if (sendBtn) {
    sendBtn.addEventListener("click", async function () {
      const title   = (document.getElementById("notifTitle")?.value || "").trim();
      const message = (document.getElementById("notifMessage")?.value || "").trim();
      const email   = (document.getElementById("notifEmail")?.value || "").trim();
      const result  = document.getElementById("notifSendResult");

      if (!title || !message) {
        showToast("Title and message are required", "error");
        return;
      }
      if (_notifType === "targeted" && !email) {
        showToast("Email is required for targeted notification", "error");
        return;
      }

      sendBtn.disabled     = true;
      sendBtn.textContent  = "⏳ Sending...";
      if (result) result.style.display = "none";

      try {
        const endpoint = _notifType === "broadcast"
          ? `${BASE_URL}/admin/broadcast-notification`
          : `${BASE_URL}/admin/send-notification`;

        const body = _notifType === "broadcast"
          ? { title, message }
          : { email, title, message };

        const res = await api(endpoint, {
          method: "POST",
          body: JSON.stringify(body),
        });

        const msg = res?.message || "Notification sent! 🎉";
        showToast(msg, "success");

        if (result) {
          result.style.display = "block";
          result.style.color   = "var(--color-success, #059669)";
          result.textContent   = "✅ " + msg;
        }

        // Clear form
        ["notifTitle", "notifMessage", "notifEmail"].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = "";
        });

      } catch (err) {
        showToast(err.message || "Failed to send notification", "error");
        if (result) {
          result.style.display = "block";
          result.style.color   = "var(--color-error, #DC2626)";
          result.textContent   = "❌ " + (err.message || "Send failed");
        }
      } finally {
        sendBtn.disabled    = false;
        sendBtn.textContent = "🚀 Send Notification";
      }
    });
  }
}

/* =============================================================
   THEME TOGGLE
   Switches between light and dark modes
   ============================================================= */
function toggleTheme() {
  const root = document.documentElement;
  const currentTheme = root.getAttribute("data-theme") || "light";
  const newTheme = currentTheme === "light" ? "dark" : "light";

  // Set attribute and save to localStorage
  root.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);

  // Update UI (Icon and Text)
  updateThemeUI(newTheme);
}

function updateThemeUI(theme) {
  const iconPath = document.getElementById("theme-icon-path");
  const label = document.getElementById("theme-label");

  if (!iconPath || !label) return;

  if (theme === "dark") {
    // Sun icon for switching back to light mode
    iconPath.setAttribute("d", "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z");
    label.textContent = "Light Mode";
  } else {
    // Moon icon for switching to dark mode
    iconPath.setAttribute("d", "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z");
    label.textContent = "Dark Mode";
  }
}
