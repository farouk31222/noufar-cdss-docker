(function () {
  const AUTH_KEY = "noufar-admin-auth-v1";
  const API_BASE_URL = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";

  function getSession() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function persistSession(payload) {
    localStorage.setItem(
      AUTH_KEY,
      JSON.stringify({
        authenticated: true,
        token: payload.accessToken || payload.token,
        accessToken: payload.accessToken || payload.token,
        refreshToken: payload.refreshToken || "",
        sessionId: payload.sessionId || "",
        accessTokenExpiresAt: payload.accessTokenExpiresAt || "",
        refreshTokenExpiresAt: payload.refreshTokenExpiresAt || "",
        user: {
          _id: payload._id,
          name: payload.name,
          email: payload.email,
          role: payload.role,
          specialty: payload.specialty,
          hospital: payload.hospital,
          approvalStatus: payload.approvalStatus
        },
        loggedAt: new Date().toISOString()
      })
    );
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || "Request failed");
    }

    return data;
  }

  function init() {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("logout") === "1") {
      localStorage.removeItem(AUTH_KEY);
      window.history.replaceState({}, document.title, "login.html");
    }

    if (getSession()?.authenticated) {
      window.location.href = "index.html";
      return;
    }

    const loginForm = document.getElementById("admin-login-form");
    const username = document.getElementById("admin-username");
    const password = document.getElementById("admin-password");
    const loginError = document.getElementById("admin-login-error");

    if (
      !loginForm ||
      !username ||
      !password ||
      !loginError
    ) {
      return;
    }

    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      loginError.textContent = "";

      const emailValue = username.value.trim();
      const passwordValue = password.value.trim();

      if (!emailValue || !passwordValue) {
        loginError.textContent = "Enter your admin login and password.";
        return;
      }

      try {
        const payload = await requestJson("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: emailValue,
            password: passwordValue,
            expectedRole: "admin"
          })
        });

        if (payload.role !== "admin") {
          loginError.textContent = "This account does not have admin access.";
          return;
        }

        persistSession(payload);
        window.location.href = "index.html";
      } catch (requestError) {
        loginError.textContent = requestError.message || "Incorrect admin email or password.";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
