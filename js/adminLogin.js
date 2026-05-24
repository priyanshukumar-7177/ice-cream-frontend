/* ══════════════════════
   ADMIN LOGIN PAGE
══════════════════════ */

const emailInput       = document.getElementById("email");
const passwordInput    = document.getElementById("password");
const otpInput         = document.getElementById("otp");
const otpBox           = document.getElementById("otpBox");
const loginFormSection = document.getElementById("loginFormSection");
const loginSuccessBox  = document.getElementById("loginSuccessBox");
const sendOtpBtn       = document.getElementById("sendOtpBtn");
const resendBtn        = document.getElementById("resendBtn");
const timerEl          = document.getElementById("timer");
const attemptWarning   = document.getElementById("attemptWarning");

const MAX_OTP_ATTEMPTS = 5;
let otpAttempts  = 0;
let timerInterval = null;

// Updated to match the single base URL convention
const BASE_URL = "http://localhost:8000/api/v1";


// ────────── SEND OTP ──────────
async function sendOTP() {
    const email = emailInput.value.trim();

    if (!email) {
        alert("Please enter your admin email");
        return;
    }

    if (otpAttempts >= MAX_OTP_ATTEMPTS) {
        attemptWarning.textContent = "Maximum OTP attempts reached. Please try again later.";
        sendOtpBtn.disabled = true;
        resendBtn.classList.remove("visible");
        return;
    }

    // Show OTP box
    otpBox.classList.add("active");
    otpBox.style.display = "block";

    alert(`OTP sent to ${email}`);

    try {
        const res = await fetch(`${BASE_URL}/admin/send-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.message || "Error sending OTP");
            return;
        }

        otpAttempts++;
        const remaining = MAX_OTP_ATTEMPTS - otpAttempts;
        attemptWarning.textContent = remaining > 0
            ? `OTP sent. ${remaining} attempt(s) remaining.`
            : "This was your last OTP attempt.";

        startTimer();

    } catch (err) {
        console.error(err);
        alert("Server error while sending OTP");
    }
}

// ────────── RESEND OTP ──────────
function resendOTP() {
    resendBtn.classList.remove("visible");
    sendOTP();
}

// ────────── COUNTDOWN TIMER ──────────
function startTimer() {
    clearInterval(timerInterval);
    resendBtn.classList.remove("visible");
    let seconds = 60;

    timerEl.textContent = `OTP expires in ${seconds}s`;

    timerInterval = setInterval(() => {
        seconds--;
        if (seconds > 0) {
            timerEl.textContent = `OTP expires in ${seconds}s`;
        } else {
            clearInterval(timerInterval);
            timerEl.textContent = "OTP expired.";
            if (otpAttempts < MAX_OTP_ATTEMPTS) {
                resendBtn.classList.add("visible");
            }
        }
    }, 1000);
}

// ────────── ADMIN LOGIN ──────────
async function loginAdmin() {
    const email    = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value.trim();
    const otp      = otpInput.value.trim();

    if (!email || !password || !otp) {
        alert("Please fill all fields");
        return;
    }

    try {
        const res = await fetch(`${BASE_URL}/admin/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, otp })
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.message || "Invalid credentials or OTP");
            return;
        }

        // Save tokens locally
        localStorage.setItem("accessToken",  data.data.accessToken);
        localStorage.setItem("refreshToken", data.data.refreshToken);

        clearInterval(timerInterval);

        // Show success, then redirect
        loginFormSection.style.display = "none";
        loginSuccessBox.style.display  = "block";

        setTimeout(() => {
            window.location.href = "./adminDash.html";   
        }, 2000);

    } catch (err) {
        console.error(err);
        alert("Server error while logging in");
    }
}
