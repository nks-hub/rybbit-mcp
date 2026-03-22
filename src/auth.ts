/**
 * Authentication for Rybbit API.
 * Supports API key (Bearer token) or email+password (better-auth session cookie).
 */

export interface AuthConfig {
  baseUrl: string;
  apiKey?: string;
  email?: string;
  password?: string;
}

export function getAuthConfig(): AuthConfig {
  const baseUrl = process.env.RYBBIT_URL?.replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error(
      "RYBBIT_URL environment variable is required. Set it to your Rybbit instance URL (e.g., https://analytics.example.com)"
    );
  }

  return {
    baseUrl,
    apiKey: process.env.RYBBIT_API_KEY,
    email: process.env.RYBBIT_EMAIL,
    password: process.env.RYBBIT_PASSWORD,
  };
}

export async function getAuthHeaders(
  config: AuthConfig,
  sessionCookie: string | null
): Promise<{ headers: Record<string, string>; sessionCookie: string | null }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
    return { headers, sessionCookie };
  }

  if (config.email && config.password) {
    let cookie = sessionCookie;
    if (!cookie) {
      cookie = await loginWithCredentials(config);
    }
    if (cookie) {
      headers["Cookie"] = cookie;
    }
    return { headers, sessionCookie: cookie };
  }

  return { headers, sessionCookie };
}

async function loginWithCredentials(config: AuthConfig): Promise<string | null> {
  const url = `${config.baseUrl}/api/auth/sign-in/email`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: config.baseUrl,
    },
    body: JSON.stringify({ email: config.email, password: config.password }),
    redirect: "manual",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Login failed (${res.status}): ${body}`);
  }

  const setCookie = res.headers.getSetCookie?.() ?? [];
  const sessionToken = setCookie.find((c) =>
    c.includes("better-auth.session_token")
  );

  if (sessionToken) {
    return sessionToken.split(";")[0];
  }

  const allCookies = setCookie.map((c) => c.split(";")[0]).join("; ");
  return allCookies || null;
}
