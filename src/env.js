export function env(name, fallback = undefined) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value;
}

export function requiredEnv(name) {
  const value = env(name);
  if (!value) {
    const error = new Error(`${name} is required`);
    error.code = "missing_env";
    throw error;
  }
  return value;
}

export function listEnv(name, fallback = "") {
  return String(env(name, fallback))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function frontendUrl() {
  return env("FRONTEND_URL", "https://fimamacro.com").replace(/\/+$/, "");
}

export function apiBaseUrl() {
  return env("API_BASE_URL", "https://api.fimamacro.com").replace(/\/+$/, "");
}
