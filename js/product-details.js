/* ══════════════════════════════════════════
   product-details.js – Hindustan IceCream
   Fetches product by ?id= param, renders page,
   handles qty, add-to-cart, buy-now, lightbox.
══════════════════════════════════════════ */

const BASE_URL = "https://ice-cream-backend-zwrr.onrender.com";

let currentProduct = null;
let qty = 1;

/* ── Helpers ── */
function gid(id) { return document.getElementById(id); }

function showGlobalToast(msg, type = "info") {
  let toast = gid("globalToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "globalToast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className   = `global-toast ${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function goToCart() {
  const token = localStorage.getItem("accessToken");
  window.location.href = token ? "cart.html" : "login.html";
}

/* ── Star rendering ── */
function renderStars(rating) {
  const full  = Math.floor(rating);
  const half  = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    '<i class="fas fa-star"></i>'.repeat(full) +
    (half ? '<i class="fas fa-star-half-alt"></i>' : '') +
    '<i class="fas fa-star empty"></i>'.repeat(empty)
  );
}

/* ── Get product ID from URL ── */
function getProductIdFromURL() {
  return new URLSearchParams(window.location.search).get("id");
}

/* ══════════════════════
   INIT
══════════════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  // Hide loader after brief pause
  setTimeout(() => gid("pdLoader")?.classList.add("hide"), 300);

  const productId = getProductIdFromURL();
  if (!productId) { showError(); return; }

  await loadProduct(productId);

  // ── Quantity controls ──
  gid("pdQtyMinus")?.addEventListener("click", () => {
    if (qty > 1) { qty--; gid("pdQtyVal").textContent = qty; }
    gid("pdQtyMinus").disabled = qty <= 1;
  });
  gid("pdQtyPlus")?.addEventListener("click", () => {
    if (qty < 20) { qty++; gid("pdQtyVal").textContent = qty; }
    gid("pdQtyMinus").disabled = false;
  });
  gid("pdQtyMinus").disabled = true; // starts at qty=1

  // ── Add to Cart ──
  gid("pdAddToCart")?.addEventListener("click", () => addToCart());

  // ── Buy Now ──
  gid("pdBuyNow")?.addEventListener("click", () => buyNow());

  // ── Lightbox ──
  gid("pdMainImg")?.addEventListener("click", openLightbox);
  gid("pdLightbox")?.addEventListener("click", (e) => {
    if (e.target === gid("pdLightbox") || e.target === gid("pdLightboxImg")) closeLightbox();
  });
  gid("pdLightboxClose")?.addEventListener("click", closeLightbox);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLightbox(); });

  // ── Inject sticky CTA bar on mobile ──
  injectStickyCTA();
});

/* ══════════════════════
   LOAD & RENDER PRODUCT
══════════════════════ */
async function loadProduct(productId) {
  try {
    // Try single-product endpoint first, fall back to listing scan
    let product = null;
    try {
      const data = await api(`${BASE_URL}/users/load-items/${productId}`);
      product = data?.data || null;
    } catch {
      // Fallback: load all items and find by _id
      const all = await api(`${BASE_URL}/users/load-items`);
      const items = all?.data || [];
      product = items.find(p => p._id === productId) || null;
    }

    if (!product) { showError(); return; }

    currentProduct = product;
    renderProduct(product);

    // Hide skeleton, show content
    gid("pdSkeleton").style.display = "none";
    gid("pdContent").style.display  = "";

  } catch (err) {
    console.error("Failed to load product:", err);
    showError();
  }
}

function renderProduct(p) {
  // Image
  const img = gid("pdMainImg");
  img.src = p.imageUrl || "https://images.unsplash.com/photo-1488900128323-21503983a07e?w=800&q=80";
  img.alt = p.name || "Ice Cream";
  img.onerror = () => { img.src = "https://images.unsplash.com/photo-1488900128323-21503983a07e?w=800&q=80"; };

  // Lightbox image (same source)
  gid("pdLightboxImg").src = img.src;
  img.addEventListener("load", () => { gid("pdLightboxImg").src = img.src; });

  // Badge
  if (p.badge) {
    gid("pdBadgeWrap").innerHTML = `<span class="pd-badge">${p.badge}</span>`;
  }

  // Category
  const catEl = gid("pdCategory");
  catEl.textContent = p.category || "Ice Cream";

  // Name
  gid("pdName").textContent = p.name || "Ice Cream";

  // Rating
  const rating = parseFloat(p.rating) || 0;
  gid("pdStars").innerHTML = renderStars(rating);
  gid("pdRatingVal").textContent = rating.toFixed(1);
  const reviews = p.reviews || 0;
  gid("pdReviews").textContent = `(${reviews.toLocaleString()} rating${reviews !== 1 ? "s" : ""})`;

  // Price
  const price = p.price || 0;
  gid("pdPrice").textContent = `₹${price}`;

  const mrp = p.mrp || p.originalPrice || null;
  if (mrp && mrp > price) {
    gid("pdMrp").textContent = `₹${mrp}`;
    const disc = Math.round(((mrp - price) / mrp) * 100);
    gid("pdDiscount").textContent = `${disc}% off`;
    gid("pdDiscount").style.display = "inline-block";
  } else {
    gid("pdMrp").style.display      = "none";
    gid("pdDiscount").style.display = "none";
  }

  // Description
  gid("pdDesc").textContent = p.description || "A premium frozen delight crafted with the finest ingredients.";

  // Highlights (if available)
  const highlights = p.highlights || p.features || [];
  if (highlights.length > 0) {
    gid("pdHighlightsSection").style.display = "";
    gid("pdHighlights").innerHTML = highlights
      .map(h => `<li>${h}</li>`)
      .join("");
  }

  // Update page title
  document.title = `${p.name} – Hindustan IceCream`;

  // Update sticky CTA labels
  const stickyCart = document.querySelector(".pd-cta-sticky .pd-btn-cart");
  const stickyBuy  = document.querySelector(".pd-cta-sticky .pd-btn-buy");
  if (stickyCart) stickyCart.innerHTML = `<i class="fas fa-shopping-cart"></i> Add to Cart`;
  if (stickyBuy)  stickyBuy.innerHTML  = `⚡ Buy Now`;
}

/* ══════════════════════
   CART & BUY ACTIONS
══════════════════════ */
async function addToCart() {
  const token = localStorage.getItem("accessToken");
  if (!token) { window.location.href = "login.html"; return; }
  if (!currentProduct) return;

  // ✅ Instant feedback
  showGlobalToast("Added to cart 🛒", "success");
  updateCartBadge();

  try {
    for (let i = 0; i < qty; i++) {
      await api(`${BASE_URL}/users/add-to-cart`, {
        method: "POST",
        body: JSON.stringify({ productId: currentProduct._id }),
      });
    }
  } catch (err) {
    console.error("Add to cart failed:", err);
    showGlobalToast("Could not add to cart. Try again.", "error");
  }
}

async function buyNow() {
  const token = localStorage.getItem("accessToken");
  if (!token) { window.location.href = "login.html"; return; }
  if (!currentProduct) return;

  showGlobalToast("Adding to cart…", "info");
  try {
    for (let i = 0; i < qty; i++) {
      await api(`${BASE_URL}/users/add-to-cart`, {
        method: "POST",
        body: JSON.stringify({ productId: currentProduct._id }),
      });
    }
    showGlobalToast("Redirecting to cart… 🛒", "success");
    setTimeout(() => { window.location.href = "cart.html"; }, 600);
  } catch (err) {
    console.error("Buy now failed:", err);
    showGlobalToast("Could not process. Try again.", "error");
  }
}

function updateCartBadge() {
  const badge = gid("pdCartBadge");
  if (!badge) return;
  const cur = parseInt(badge.textContent) || 0;
  badge.textContent = cur + qty;
  badge.style.display = "flex";
}

/* ══════════════════════
   LIGHTBOX
══════════════════════ */
function openLightbox() {
  const lightbox = gid("pdLightbox");
  const lbImg    = gid("pdLightboxImg");
  if (!lightbox) return;
  lbImg.src = gid("pdMainImg").src;
  lightbox.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  gid("pdLightbox")?.classList.remove("open");
  document.body.style.overflow = "";
}

/* ══════════════════════
   ERROR STATE
══════════════════════ */
function showError() {
  gid("pdSkeleton").style.display = "none";
  gid("pdContent").style.display  = "none";
  gid("pdError").style.display    = "flex";
}

/* ══════════════════════
   STICKY CTA (mobile)
══════════════════════ */
function injectStickyCTA() {
  // Only inject once and only on mobile (CSS hides .pd-cta-row on mobile)
  if (document.querySelector(".pd-cta-sticky")) return;

  const bar = document.createElement("div");
  bar.className = "pd-cta-sticky";
  bar.innerHTML = `
    <button class="pd-btn-cart" aria-label="Add to Cart">
      <i class="fas fa-shopping-cart"></i> Add to Cart
    </button>
    <button class="pd-btn-buy" aria-label="Buy Now">
      ⚡ Buy Now
    </button>`;

  bar.querySelector(".pd-btn-cart").addEventListener("click", () => addToCart());
  bar.querySelector(".pd-btn-buy").addEventListener("click",  () => buyNow());

  document.body.appendChild(bar);
}
