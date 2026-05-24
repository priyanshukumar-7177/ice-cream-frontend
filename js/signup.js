/* ── LOADER ── */
// window.addEventListener('load', () => {
//   setTimeout(() => {
//     const loader = document.getElementById('loader');
//     if (loader) loader.classList.add('hide');
//   }, 100);
// });

/* ══════════════════════
   REGISTRATION PAGE
══════════════════════ */

const BASE_URL = "http://localhost:8000/api/v1";


// Input fields
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const otpInput = document.getElementById("otp");

// Sections
const otpBox = document.getElementById("otpBox");
const formSection = document.getElementById("formSection");
const successBox = document.getElementById("successBox");

// Password match message
const passwordMessage = document.getElementById("message");

// Register button
const registerBtn = document.querySelector(".register-btn");
if(registerBtn) registerBtn.disabled = true; // initially disabled

// ────────── LIVE PASSWORD MATCH ──────────
confirmPasswordInput.addEventListener("input", () => {
    if(passwordInput.value === confirmPasswordInput.value){
        passwordMessage.innerText = "Passwords match ✔";
        passwordMessage.style.color = "green";
    } else {
        passwordMessage.innerText = "Passwords do not match";
        passwordMessage.style.color = "red";
    }
});

// Enable register button only if OTP is filled
otpInput.addEventListener("input", () => {
    registerBtn.disabled = otpInput.value.trim().length === 0;
});

// ────────── SEND OTP ──────────
async function showOTP(){
    const email = emailInput.value.trim();

    if(!email){
        alert("Please enter your email");
        return;
    }

    try {
        otpBox.classList.add("active");
        otpBox.style.display = "block"; // also add this since .active doesn't set display

        const res = await fetch(`${BASE_URL}/users/send-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });

        const data = await res.json();

        if(!res.ok){
            alert(data.message || "Error sending OTP");
            return;
        }

        registerBtn.disabled = false; 
        alert("OTP sent to your email");

    } catch(err){
        console.error(err);
        alert("Server error while sending OTP");
    }
}

// ────────── REGISTER USER ──────────
async function registerUser(){
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const otp = otpInput.value.trim();

    if(!name || !email || !password || !confirmPassword || !otp){
        alert("Please fill all fields");
        return;
    }

    if(password !== confirmPassword){
        alert("Passwords do not match");
        return;
    }

    try {
        const res = await fetch(`${BASE_URL}/users/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password, confirmPassword, otp })
        });

        const data = await res.json();

        if(!res.ok){
            alert(data.message || "Error registering user");
            return;
        }

        // Show success message
        formSection.style.display = "none";
        successBox.style.display = "block";

        // Redirect to home page
        setTimeout(()=>{
            window.location.href = "./login.html";
        }, 2000);

    } catch(err){
        console.error(err);
        alert("Server error while registering");
    }
}
