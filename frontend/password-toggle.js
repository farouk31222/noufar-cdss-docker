document.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-password-toggle]");
  if (!toggle) return;

  const shell = toggle.closest(".password-field-shell");
  const input = shell?.querySelector('input[type="password"], input[type="text"]');
  if (!input) return;

  const shouldShow = input.type === "password";
  input.type = shouldShow ? "text" : "password";
  toggle.classList.toggle("is-visible", shouldShow);
  toggle.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
});
