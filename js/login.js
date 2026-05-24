const loginBtn = document.querySelector(".login-btn");
const loginEmailInput = document.querySelector('input[type="email"]');
const loginPasswordInput = document.querySelector('input[type="password"]');
const loginSuccessBox = document.getElementById("loginSuccessBox");
const loginFormSection = document.getElementById("loginFormSection");

const BASE_URL = "https://ice-cream-backend-zwrr.onrender.com/api/v1";


async function loginUser() {

    const loginEmail = loginEmailInput.value.trim();
    const loginPassword = loginPasswordInput.value.trim();

    if(!loginEmail || !loginPassword){
        alert("Please fill all fields");
        return;
    }

    try{

        const loginResponse = await fetch(`${BASE_URL}/users/login`,{
            method: "POST",
            headers:{
                "Content-Type":"application/json"
            },
            body: JSON.stringify({
                email: loginEmail,
                password: loginPassword
            })
        });

        const loginData = await loginResponse.json();
        console.log("Full loginData:", loginData) 

        if(loginData.statusCode === 200){

            loginFormSection.style.display = "none";
            loginSuccessBox.style.display = "block";

            // ✅ correctly accessing nested data
            localStorage.setItem("accessToken", loginData.data.accessToken)
            localStorage.setItem("refreshToken", loginData.data.refreshToken)

            setTimeout(()=>{
                window.location.href = "index.html";
            }, 2000);

        }else{
            alert(loginData.message || "Login failed");
        }

    }catch(loginError){
        console.error("Login Error:", loginError);
        alert("Server error");
    }

};


document.addEventListener("DOMContentLoaded", () => {
    
    // Attach the click event to your login button once the DOM loads
    if(loginBtn) {
        loginBtn.addEventListener("click", loginUser);
    }

    // 10 minutes in milliseconds (10 * 60 * 1000)
    const PING_INTERVAL = 600000; 
    

    // Start the interval
    setInterval(() => {
        fetch(`${BASE_URL}/ping`)
            .then(response => console.log('Server pinged:', response.status))
            .catch(error => console.error('Ping failed:', error));
    }, PING_INTERVAL);

});
