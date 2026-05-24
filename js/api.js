// js/api.js

const BASE = "https://ice-cream-backend-zwrr.onrender.com";


// This is your "api" wrapper — works like axios but with plain fetch
const api = async (url, options = {}) => {

  // Step 1: attach access token to every request
  const token = localStorage.getItem("accessToken");

  const headers = {
    ...(!(options.body instanceof FormData) && { "Content-Type": "application/json" }),
    ...options.headers
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Step 2: make the request
  let response = await fetch(url, {
    ...options,
    headers,
    credentials: "include"   // same as withCredentials:true — sends cookies
  });

  // Step 3: got 401? try refresh silently
  if (response.status === 401) {

    // ✅ Pick refresh endpoint based on the original request URL
    const isAdmin = url.includes("/api/v1/admin/");

    // Fixed: changed ${BASE} to ${BASE_URL}
    const refreshUrl = isAdmin
      ? `${BASE}/admin/refresh-token`
      : `${BASE}/users/refresh-token`;

    // call refresh endpoint — refresh token cookie sent automatically
    const refreshRes = await fetch(refreshUrl, {
      method: "POST",
      credentials: "include"
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json();

      // save new access token
      const newToken = data.data.accessToken;
      localStorage.setItem("accessToken", newToken);

      // retry the original request with new token
      headers.Authorization = `Bearer ${newToken}`;
      response = await fetch(url, {
        ...options,
        headers,
        credentials: "include"
      });

    } else {
      // refresh failed — send to login
      localStorage.removeItem("accessToken");
      
      // Send back to the appropriate login page
      window.location.href = "./login.html";
      return;
    }
  }

  return response.json();
};
