/* ══════════════════════════════════════════
   Hindustan IceCream – home.js
   Security model:
     PUBLIC  → categories, products, banners (no token needed)
     PRIVATE → cart, notifications, profile  (token required → /login)
══════════════════════════════════════════ */

const BASE_URL = "http://localhost:8000/api/v1";

// ── State ──
let allProducts    = [];
let activeCategory = "all";
let socket         = null;

/* ─────────────────────────────────────────
   PUBLIC FETCH
   Plain fetch — NO Authorization header.
   Use this for every public/guest endpoint
   so api.js's 401 handler never fires.
───────────────────────────────────────── */
async function publicFetch(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    // deliberately no Authorization header
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} – ${url}`);
  return res.json();
}

/* ─────────────────────────────────────────
   AUTH HELPER
   Single source of truth for auth checks.
   Call requireAuth() before any protected
   action; it returns true if logged-in,
   or redirects to /login and returns false.
───────────────────────────────────────── */
function isLoggedIn() {
  return !!localStorage.getItem("accessToken");
}

function requireAuth(e) {
  if (e && typeof e.preventDefault === "function") e.preventDefault();
  if (!isLoggedIn()) {
    window.location.href = "./login.html";
    return false;
  }
  return true;
}


/* ── LOADER ── */
window.addEventListener("load", () => {
  setTimeout(() => {
    const loader = document.getElementById("loader");
    if (loader) loader.classList.add("hide");
  }, 100);
});


/* ══════════════════════
   DOMContentLoaded
══════════════════════ */
document.addEventListener("DOMContentLoaded", function () {

  /* ── Nav Buttons (protected) ── */
  const profileBtn       = document.getElementById("profileBtn");
  const cartBtn          = document.getElementById("cartBtn");
  const profileMobileBtn = document.getElementById("profileMobileBtn");
  const cartMobileBtn    = document.getElementById("cartMobileBtn");

  // Cart → protected
  function goToCart(e) {
    if (!requireAuth(e)) return;
    window.location.href = "cart.html";
  }

  // Profile → protected
  function goToProfile(e) {
    if (!requireAuth(e)) return;
    window.location.href = "./profile.html";
  }

  if (profileBtn)       profileBtn.addEventListener("click", goToProfile);
  if (cartBtn)          cartBtn.addEventListener("click", goToCart);
  if (profileMobileBtn) profileMobileBtn.addEventListener("click", goToProfile);
  if (cartMobileBtn)    cartMobileBtn.addEventListener("click", goToCart);

  /* ── Hamburger Menu ── */
  const ham = document.getElementById("hamburger");
  const mob = document.getElementById("mobileMenu");
  if (ham && mob) {
    ham.onclick = () => {
      ham.classList.toggle("open");
      mob.classList.toggle("open");
    };
    mob.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", () => {
        ham.classList.remove("open");
        mob.classList.remove("open");
      });
    });
  }

  /* ── Notification Bell (protected) ── */
  const notifBell     = document.getElementById("notifBell");
  const notifDropdown = document.getElementById("notifDropdown");

  if (notifBell && notifDropdown) {
    notifBell.addEventListener("click", (e) => {
      // 🔒 Auth gate: guests cannot open notifications
      if (!requireAuth(e)) return;

      e.stopPropagation();
      notifDropdown.classList.toggle("open");
      if (notifDropdown.classList.contains("open")) loadNotifications();
    });

    document.addEventListener("click", (e) => {
      if (!notifDropdown.contains(e.target) && e.target !== notifBell) {
        notifDropdown.classList.remove("open");
      }
    });
  }

  /* ── PUBLIC: Load Data (no auth) ── */
  loadCategories();   // PUBLIC
  loadProducts();     // PUBLIC
  loadBanners();      // PUBLIC

  /* ── PRIVATE: Auth-only features ── */
  if (isLoggedIn()) {
    initSocket();       // only meaningful when logged in
    loadNotifCount();   // only meaningful when logged in
  }

  /* ── Carousel & Scroll ── */
  initCarousel();

  const navbar = document.getElementById("navbar");
  window.addEventListener("scroll", () => {
    if (navbar) navbar.classList.toggle("scrolled", window.scrollY > 20);
  });

  /* ── Cart count badge ── */
  let cartCount   = 0;
  const cartBadge = document.getElementById("cartBadge");

  /* ── Buy Now (protected) ── */
  window.buyNow = async function (productId, e) {
    // 🔒 Auth gate
    if (!requireAuth(e)) return;

    try {
      await api(`${BASE_URL}/users/add-to-cart`, {
        method: "POST",
        body: JSON.stringify({ productId }),
      });
      showGlobalToast("Item added to cart! Redirecting… 🛒", "success");
      setTimeout(() => { window.location.href = "cart.html"; }, 800);
    } catch (err) {
      console.error("Buy now failed:", err);
      showGlobalToast("Could not add item. Please try again.", "error");
    }
  };

  /* ── Add to Cart (protected) ── */
  window.addToCart = async function (btn, productId, e) {
    // 🔒 Auth gate
    if (!requireAuth(e)) return;

    // Instant optimistic feedback
    showGlobalToast("Added to cart 🛒", "success");
    btn.classList.add("adding");
    setTimeout(() => btn.classList.remove("adding"), 300);

    try {
      await api(`${BASE_URL}/users/add-to-cart`, {
        method: "POST",
        body: JSON.stringify({ productId }),
      });

      cartCount++;
      if (cartBadge) {
        cartBadge.textContent = cartCount;
        cartBadge.classList.add("show");
      }
    } catch (err) {
      console.error("Failed to add to cart:", err);
      showGlobalToast("Failed to add. Please try again.", "error");
    }
  };

  /* ── Keyboard & modal init ── */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.getElementById("notifModal")?.classList.remove("show");
      document.body.style.overflow = "";
    }
  });

  _initNotifModal();

  /* ── Reflect auth state in UI ── */
  _applyAuthUI();

}); // end DOMContentLoaded


/* ══════════════════════════════════════════
   AUTH UI REFLECTION
   Visually hint to guest users which actions
   require login (lock icon overlay), without
   hiding the product content itself.
══════════════════════════════════════════ */
function _applyAuthUI() {
  if (isLoggedIn()) return; // nothing to do for logged-in users

  // Show a subtle "Login to order" chip in the navbar area
  const navIcons = document.querySelector(".nav-icons");
  if (navIcons) {
    const chip = document.createElement("a");
    chip.href      = "./login.html";
    chip.className = "login-chip";
    chip.innerHTML = `<i class="fas fa-lock"></i> Login`;
    // Insert before the hamburger
    const ham = document.getElementById("hamburger");
    navIcons.insertBefore(chip, ham);
  }
}


/* ══════════════════════
   CATEGORY FILTERING  (PUBLIC)
══════════════════════ */
async function loadCategories() {
  try {
    // ✅ PUBLIC — no token sent
    const data       = await publicFetch(`${BASE_URL}/categories`);
    const categories = data.data || [];

    const bar = document.getElementById("categoryBar");
    if (!bar) return;

    categories.forEach(cat => {
      const pill = document.createElement("button");
      pill.className        = "cat-pill";
      pill.dataset.category = cat.slug || cat.name.toLowerCase();
      pill.textContent      = `${cat.emoji || "🍦"} ${cat.name}`;
      pill.onclick = () => selectCategory(cat.slug || cat.name.toLowerCase(), pill);
      bar.appendChild(pill);
    });
  } catch (err) {
    console.error("Failed to load categories:", err);
  }
}

function selectCategory(category, pill) {
  activeCategory = category;
  document.querySelectorAll(".cat-pill").forEach(p => p.classList.remove("active"));
  if (pill) pill.classList.add("active");
  renderProductGrid();
}

function filterProducts(query) {
  if (!query && !arguments.length) {
    const input = document.getElementById("searchInput");
    query = input ? input.value : "";
  }
  const q = (query || "").toLowerCase().trim();
  renderProductGrid(q);
}


/* ══════════════════════
   PRODUCTS  (PUBLIC)
══════════════════════ */
const cardObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) e.target.classList.add("visible");
  });
}, { threshold: 0.1 });

async function loadProducts() {
  const grid = document.getElementById("productsGrid");
  try {
    // ✅ PUBLIC — no token sent, bypasses api.js 401 handler entirely
    const data  = await publicFetch(`${BASE_URL}/users/load-items`);
    allProducts = data.data || [];
    renderProductGrid();
  } catch (err) {
    console.error("Failed to load products:", err);
    if (grid) grid.innerHTML = `<p style="color:var(--text-secondary);text-align:center;grid-column:1/-1;">
      Unable to load products. Please try again later.
    </p>`;
  }
}

function renderProductGrid(searchQuery = "") {
  const grid = document.getElementById("productsGrid");
  if (!grid) return;

  const q = searchQuery.toLowerCase().trim();
  const loggedIn = isLoggedIn();

  const filtered = allProducts.filter(p => {
    const matchCat =
      activeCategory === "all" ||
      (p.category || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") === activeCategory ||
      (p.category || "").toLowerCase() === activeCategory;
    const matchSearch =
      !q ||
      (p.name        || "").toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      (p.category    || "").toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
      <div style="font-size:48px;margin-bottom:12px;">🍦</div>
      <p style="color:var(--text-secondary);font-size:16px;">No products found${q ? ` for "${q}"` : ""}.</p>
    </div>`;
    return;
  }

  /*
   * 🔒 SECURITY NOTE for card actions:
   *  - Buttons always render (UX: users should see them and be prompted to log in)
   *  - onclick handlers call requireAuth() first; guests are redirected to /login
   *  - No sensitive data (prices etc.) is hidden — these are public catalogue items
   */
  grid.innerHTML = filtered.map((p, i) => `
    <div class="product-card" style="transition-delay:${i * 60}ms">
      <div class="card-img-wrap">
        <img
          src="${p.imageUrl || ''}"
          alt="${p.name || 'Ice Cream'}"
          loading="lazy"
          style="cursor:pointer"
          onclick="viewProduct('${p._id}')"
          onerror="this.src='https://images.unsplash.com/photo-1488900128323-21503983a07e?w=400&q=80'"
        />
        ${p.badge ? `<span class="card-badge">${p.badge}</span>` : ""}
      </div>
      <div class="card-body">
        <div class="card-name">${p.name || "Unknown"}</div>
        <div class="card-desc">${p.description || ""}</div>
        <div class="card-meta">
          <span class="card-price">₹${p.price || 0}</span>
          <span class="card-rating">
            <i class="fas fa-star"></i>${p.rating || 0}
            <span style="color:var(--text-muted)">(${p.reviews || 0})</span>
          </span>
        </div>
        <div class="card-actions">
          <!--
            🔒 Both buttons always visible.
               requireAuth() inside the handler redirects guests to /login.
          -->
          <button class="btn-buy"  onclick="buyNow('${p._id}', event)">
            ${loggedIn ? "Buy Now" : "🔒 Buy Now"}
          </button>
          <button class="btn-cart" onclick="addToCart(this, '${p._id}', event)">
            ${loggedIn ? "🛒 Add" : "🔒 Add"}
          </button>
        </div>
      </div>
    </div>`).join("");

  grid.querySelectorAll(".product-card").forEach(c => cardObserver.observe(c));
}

/* Navigate to product details page — PUBLIC, no auth needed */
function viewProduct(productId) {
  window.location.href = `product-details.html?id=${productId}`;
}


/* ══════════════════════
   BANNERS  (PUBLIC)
══════════════════════ */
async function loadBanners() {
  try {
    // ✅ PUBLIC — no token sent
    const data    = await publicFetch(`${BASE_URL}/banners`);
    const banners = data.data || [];

    const carouselSection = document.querySelector(".carousel-section");
    if (banners.length === 0) {
      if (carouselSection) carouselSection.style.display = "none";
      return;
    }
    if (carouselSection) carouselSection.style.display = "block";

    const track = document.getElementById("carouselTrack");
    if (!track) return;

    const gradients = [
      "linear-gradient(135deg, #3a1800, #1a0a00)",
      "linear-gradient(135deg, #200030, #0d0010)",
      "linear-gradient(135deg, #00200a, #000d05)",
      "linear-gradient(135deg, #201a00, #0d0a00)",
    ];

    track.innerHTML = banners.map((b, i) => {
      if (b.type === "image") {
        return `
          <div class="slide ${i === 0 ? "active" : ""}">
            <div class="slide-bg" style="background:url('${b.imageUrl}') center/cover no-repeat;"></div>
          </div>`;
      }
      return `
        <div class="slide ${i === 0 ? "active" : ""}">
          <div class="slide-bg" style="background:${gradients[i % gradients.length]};"></div>
          <div class="slide-overlay"></div>
          <div class="slide-content">
            ${b.tagText ? `<span class="slide-tag">${b.tagText}</span>` : ""}
            <h2>${b.title || ""}</h2>
            <p>${b.subtitle || ""}</p>
            ${b.ctaText ? `<a href="${b.ctaLink || "#"}" class="slide-cta">${b.ctaText}</a>` : ""}
          </div>
        </div>`;
    }).join("");

    initCarousel();
  } catch (err) {
    console.error("Failed to load banners:", err);
  }
}


/* ══════════════════════
   CAROUSEL ENGINE
══════════════════════ */
let carouselCur = 0, carouselAutoTimer;

function initCarousel() {
  const track    = document.getElementById("carouselTrack");
  const slideEls = document.querySelectorAll(".slide");
  const dotsWrap = document.getElementById("carouselDots");
  if (!track || slideEls.length === 0 || !dotsWrap) return;

  carouselCur = 0;
  clearInterval(carouselAutoTimer);
  dotsWrap.innerHTML = "";

  slideEls.forEach((_, i) => {
    const d = document.createElement("div");
    d.className = "dot" + (i === 0 ? " active" : "");
    d.onclick = () => { stopCarouselAuto(); goToSlide(i); startCarouselAuto(); };
    dotsWrap.appendChild(d);
  });

  const prevBtn = document.getElementById("prevSlide");
  const nextBtn = document.getElementById("nextSlide");
  if (nextBtn) nextBtn.onclick = () => { stopCarouselAuto(); goToSlide(carouselCur + 1); startCarouselAuto(); };
  if (prevBtn) prevBtn.onclick = () => { stopCarouselAuto(); goToSlide(carouselCur - 1); startCarouselAuto(); };
  startCarouselAuto();

  const carouselEl = document.querySelector(".carousel-section");
  if (carouselEl) {
    carouselEl.addEventListener("mouseenter", stopCarouselAuto);
    carouselEl.addEventListener("mouseleave", startCarouselAuto);
  }
}

function goToSlide(n) {
  const slideEls = document.querySelectorAll(".slide");
  const dotsWrap = document.getElementById("carouselDots");
  const track    = document.getElementById("carouselTrack");
  if (!slideEls.length || !dotsWrap || !track) return;

  slideEls[carouselCur]?.classList.remove("active");
  dotsWrap.children[carouselCur]?.classList.remove("active");
  carouselCur = (n + slideEls.length) % slideEls.length;
  slideEls[carouselCur]?.classList.add("active");
  dotsWrap.children[carouselCur]?.classList.add("active");
  track.style.transform = `translateX(-${carouselCur * 100}%)`;
}

function startCarouselAuto() { carouselAutoTimer = setInterval(() => goToSlide(carouselCur + 1), 4000); }
function stopCarouselAuto()  { clearInterval(carouselAutoTimer); }


/* ══════════════════════
   NOTIFICATIONS  (PRIVATE)
   All notification functions are only called
   after requireAuth() passes.
══════════════════════ */
const notifStore = new Map();

async function loadNotifCount() {
  // Guard: should only be called when logged in, but double-check
  if (!isLoggedIn()) return;
  try {
    const data  = await api(`${BASE_URL}/notifications/unread`);
    const count = data?.data?.count || 0;
    const badge = document.getElementById("notifBadge");
    if (badge) {
      badge.textContent = count;
      badge.classList.toggle("show", count > 0);
    }
  } catch {}
}

async function loadNotifications() {
  if (!isLoggedIn()) return; // safety guard
  try {
    const data   = await api(`${BASE_URL}/notifications`);
    const notifs = data?.data || [];
    const list   = document.getElementById("notifList");
    if (!list) return;

    if (notifs.length === 0) {
      list.innerHTML = `<div class="notif-empty">No notifications yet 🔕</div>`;
      return;
    }

    const iconMap = {
      order_placed: "📦", order_confirmed: "✅", order_delivered: "🚀",
      order_cancelled: "❌", payment_success: "💰", payment_failed: "⚠️",
      system: "🔔", promo: "🎉",
    };

    notifStore.clear();
    notifs.forEach(n => notifStore.set(String(n._id), n));

    list.innerHTML = notifs.slice(0, 20).map(n => `
      <div class="notif-item ${n.isRead ? "" : "unread"}" data-notif-id="${n._id}" style="cursor:pointer">
        <div class="notif-item-icon">${iconMap[n.type] || "🔔"}</div>
        <div class="notif-item-body">
          <div class="notif-item-title">${n.title}</div>
          <div class="notif-item-msg">${n.message}</div>
          <div class="notif-item-time">${timeAgo(n.createdAt)}</div>
        </div>
      </div>`).join("");

    list.querySelectorAll(".notif-item[data-notif-id]").forEach(el => {
      el.addEventListener("click", function () {
        const notif = notifStore.get(this.dataset.notifId);
        _markNotifRead(this.dataset.notifId, this);
        openNotifModal(notif);
      });
    });
  } catch {}
}

async function _markNotifRead(id, el) {
  if (!isLoggedIn()) return;
  try {
    await api(`${BASE_URL}/notifications/${id}/read`, { method: "PATCH" });
    if (el) el.classList.remove("unread");
    loadNotifCount();
  } catch {}
}

async function markAllNotifRead() {
  if (!isLoggedIn()) return;
  try {
    await api(`${BASE_URL}/notifications/read-all`, { method: "PATCH" });
    loadNotifCount();
    loadNotifications();
  } catch {}
}

/* ── Notification Modal ── */
const _iconMap = {
  order_placed: "📦", order_confirmed: "✅", order_delivered: "🚀",
  order_cancelled: "❌", payment_success: "💰", payment_failed: "⚠️",
  system: "🔔", promo: "🎉",
};
const _typeLabels = {
  order_placed: "Order placed", order_confirmed: "Order confirmed",
  order_delivered: "Order delivered", order_cancelled: "Order cancelled",
  payment_success: "Payment success", payment_failed: "Payment failed",
  system: "System", promo: "Promotion",
};
const _actionMap = {
  order_placed:    "orders.html",
  order_confirmed: "orders.html",
  order_delivered: "orders.html",
  order_cancelled: "orders.html",
  payment_success: "orders.html",
  payment_failed:  "cart.html",
  promo:           "index.html",
};

function openNotifModal(n) {
  if (!n) return;
  document.getElementById("notifModalIcon").textContent    = _iconMap[n.type]    || "🔔";
  document.getElementById("notifModalType").textContent    = _typeLabels[n.type] || "Notification";
  document.getElementById("notifModalTime").textContent    = timeAgo(n.createdAt);
  document.getElementById("notifModalTitle").textContent   = n.title   || "Notification";
  document.getElementById("notifModalMessage").textContent = n.message || "";

  const actionBtn = document.getElementById("notifModalAction");
  const actionUrl = n.actionUrl || n.link || _actionMap[n.type] || null;

  if (actionUrl) {
    actionBtn.style.display = "flex";
    actionBtn.onclick = () => {
      closeNotifModal();
      window.location.href = actionUrl;
    };
  } else {
    actionBtn.style.display = "none";
    actionBtn.onclick = null;
  }

  document.getElementById("notifDropdown")?.classList.remove("open");
  document.getElementById("notifModal").classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeNotifModal() {
  document.getElementById("notifModal")?.classList.remove("show");
  document.body.style.overflow = "";
}

function _initNotifModal() {
  const overlay = document.getElementById("notifModal");
  if (!overlay) return;
  overlay.addEventListener("click", function (e) {
    if (e.target === this) closeNotifModal();
  });
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 60)    return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)    return `${minutes}m ago`;
  const hours   = Math.floor(minutes / 60);
  if (hours < 24)      return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}


/* ══════════════════════
   SOCKET.IO  (PRIVATE)
══════════════════════ */
function initSocket() {
  if (!isLoggedIn() || typeof io === "undefined") return;
  try {
    const socketUrl = BASE_URL.replace("/api/v1", "");
    socket = io(socketUrl, {
      auth: { token: localStorage.getItem("accessToken") },
      transports: ["websocket", "polling"],
    });
    socket.on("connect", () => console.log("🟢 Socket connected:", socket.id));
    socket.on("new_notification", (notification) => {
      const badge = document.getElementById("notifBadge");
      if (badge) {
        const current = parseInt(badge.textContent) || 0;
        badge.textContent = current + 1;
        badge.classList.add("show");
      }
      const dropdown = document.getElementById("notifDropdown");
      if (dropdown?.classList.contains("open")) loadNotifications();
      showGlobalToast(notification.title || "New notification", "info");
    });
    socket.on("disconnect", () => console.log("🔴 Socket disconnected"));
  } catch (err) {
    console.error("Socket init error:", err);
  }
}


/* ══════════════════════
   GLOBAL TOAST
══════════════════════ */
function showGlobalToast(msg, type = "info") {
  let toast = document.getElementById("globalToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id        = "globalToast";
    toast.className = "global-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className   = `global-toast ${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 3500);
}
