// OIDC nonce is an opaque string, not decoded binary data.
export function parseGoogleOAuthCookie(value) {
  const cookie = String(value || "");
  const separator = cookie.lastIndexOf(".");
  const state = separator > 0 ? cookie.slice(0, separator) : "";
  const nonce = separator > 0 ? cookie.slice(separator + 1) : "";
  if (!state || !/^[A-Za-z0-9_-]{22}$/u.test(nonce)) {
    throw new Error("invalid_google_nonce");
  }
  return { state, nonce };
}
