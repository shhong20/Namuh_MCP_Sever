import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// .env 를 "패키지 루트"(dist/ 의 상위)에서 로드합니다.
// 이렇게 하면 Claude Desktop 이 어느 위치에서 실행하든 nhplug-mcp/.env 를 찾습니다.
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });
// 현재 작업 폴더에 .env 가 있으면 그것도 병합(있을 때만)
dotenv.config();

export interface Config {
  appKey: string;
  appSecret: string;
  baseUrl: string;
  authUrl: string;
  enableTrading: boolean;
  defaultAccount: string;
}

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `환경변수 ${name} 가 설정되지 않았습니다. nhplug-mcp/.env 또는 MCP 설정의 env 에 값을 넣어주세요.`
    );
  }
  return value.trim();
}

// 🔒 앱키·시크릿이 나가는 URL 은 반드시 검증한다.
//    검증이 없으면 오타 한 글자로 자격증명이 엉뚱한 서버에 전송되거나,
//    모의투자로 알고 설정한 주소가 운영이라 실주문이 체결될 수 있다.
//    ⚠️ 호스트를 늘릴 때는 .env.example·README·SDK nhplug/auth.py 도 함께 고칠 것.
const ALLOWED_HOSTS = [
  "api.nhplug.com",     // 🔴 나무 운영 — 주문이 실제 체결됨
  "moapi.nhplug.com",   // 🟢 나무 모의투자
  "api.n2plug.com",     // 🔴 N2 운영 — 주문이 실제 체결됨
  "moapi.n2plug.com",   // 🟢 N2 모의투자
];
const ALLOW_HOSTS_VAR = "NHPLUG_ALLOW_HOSTS";

function allowedHosts(): string[] {
  const extra = (process.env[ALLOW_HOSTS_VAR] ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
  if (extra.length) throw new Error("NHPLUG_EXTRA_HOSTS_DISABLED");
  return [...ALLOWED_HOSTS];
}

/** Fail closed: exact official HTTPS origin, no userinfo, path or query. */
export function validateUrl(raw: string, name: string): string {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new Error("NH_INVALID_ENDPOINT_"+name); }
  if (u.protocol !== "https:" || u.port !== "8443" || u.username || u.password ||
      u.pathname !== "/" || u.search || u.hash || !allowedHosts().includes(u.hostname) ||
      (name === "NHPLUG_AUTH_URL" && !u.hostname.startsWith("api.")))
    throw new Error("NH_ENDPOINT_NOT_ALLOWED_"+name);
  return u.origin;
}
export function assertSecureTransport() {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
      ["HTTPS_PROXY","https_proxy","HTTP_PROXY","http_proxy","ALL_PROXY","all_proxy","NODE_USE_ENV_PROXY"].some(k=>!!process.env[k] && process.env[k]!=="0"))
    throw new Error("NH_UNSAFE_TRANSPORT_ENV");
}

export function loadConfig(): Config {
  assertSecureTransport();
  // Personal ChatGPT deployment: enforce read-only, even if an environment variable is set.
  // Never enable order tools through this fork without a separate reviewed code change.
  return {
    // NHPLUG_ 접두 변수를 우선 사용하되, 접두 없는 APP_KEY/APP_SECRET 도 허용
    appKey: required("NHPLUG_APP_KEY", process.env.NHPLUG_APP_KEY ?? process.env.APP_KEY),
    appSecret: required(
      "NHPLUG_APP_SECRET",
      process.env.NHPLUG_APP_SECRET ?? process.env.APP_SECRET
    ),
    // 호출 대상. 기본 운영(api). 교육·시뮬레이션은 moapi 로 설정.
    // 허용 호스트가 아니면 서버 기동 시점에 막는다(호출 전에 실패).
    baseUrl: validateUrl(
      process.env.NHPLUG_BASE_URL ?? "https://api.nhplug.com:8443",
      "NHPLUG_BASE_URL"
    ),
    // 토큰(/oauth2/token)은 운영(api) 전용 — moapi 미제공. 호출 대상과 무관하게 항상 api 로 발급.
    authUrl: validateUrl(
      process.env.NHPLUG_AUTH_URL ?? "https://api.nhplug.com:8443",
      "NHPLUG_AUTH_URL"
    ),
    enableTrading: false,
    defaultAccount: (process.env.NHPLUG_DEFAULT_ACCOUNT ?? "").trim(),
  };
}
