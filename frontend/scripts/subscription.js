// ---------------------------
// Dark Mode Toggle
// ---------------------------
const darkToggle = document.getElementById("darkModeToggle");
darkToggle?.addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark");
  darkToggle.setAttribute("aria-pressed", isDark);
  darkToggle.textContent = isDark ? "☀️" : "🌙";
});

// ---------------------------
// Modal Elements
// ---------------------------
const modal = document.getElementById("paymentModal");
const phoneInput = document.getElementById("modalPhoneInput");
const confirmBtn = document.getElementById("confirmPaymentBtn");
const closeModalBtn = document.getElementById("closeModalBtn");

let selectedPlan = "";
let selectedPrice = "";

// ---------------------------
// Toast Notification
// ---------------------------
function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = "toast";
  toast.classList.add(isError ? "error" : "success");
  toast.classList.remove("hidden");

  setTimeout(() => toast.classList.add("hidden"), 4000);
}

// ---------------------------
// Open Modal on Subscribe
// ---------------------------
document.querySelectorAll(".subscribe-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedPlan = btn.dataset.plan;
    selectedPrice = btn.dataset.price;

    modal.classList.remove("hidden");
  });
});

// ---------------------------
// Close Modal
// ---------------------------
closeModalBtn.addEventListener("click", () => {
  modal.classList.add("hidden");
});

// ---------------------------
// Confirm Payment
// ---------------------------
confirmBtn.addEventListener("click", async () => {
  const phone = phoneInput.value.trim();
  const userId = localStorage.getItem("userId") || `guest_${Date.now()}`;

  if (!/^07\d{8}$/.test(phone)) {
    return showToast("Enter a valid Safaricom number (07XXXXXXXX).", true);
  }

  showToast("Sending STK push...");

  try {
    const res = await fetch("https://greentrace-backend.onrender.com/api/payments/stkpush", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        phone,
        plan: selectedPlan,
        amount: selectedPrice
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Payment request failed.");
    }

    showToast("STK Push sent! Redirecting...", false);
    modal.classList.add("hidden");

    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 3000);

  } catch (err) {
    console.error(err);
    showToast(err.message || "Something went wrong.", true);
  }
});
