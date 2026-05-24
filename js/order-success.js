const $ = id => document.getElementById(id);

const BASE_URL = "https://ice-cream-backend-zwrr.onrender.com/api/v1";


/* =============================================================
   INIT
   ============================================================= */
const init = async () => {
  try {
    const params  = new URLSearchParams(window.location.search);
    const orderId = params.get("orderId");

    if (!orderId || orderId.length < 6) {
      showErr("Invalid Order ID.");
      return;
    }

    $("orderId").textContent = `#${orderId.slice(-6).toUpperCase()}`;

    const res = await api(`${BASE_URL}/success-order/${orderId}`);

    if (!res || res.statusCode >= 400 || !res.data) {
      showErr(res?.message || "Could not load order.");
      return;
    }

    render(res.data);

  } catch (e) {
    console.error("Order load error:", e);
    showErr("Something went wrong loading your order.");
  }
};
