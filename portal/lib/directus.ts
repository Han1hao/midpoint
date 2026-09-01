export const DIRECTUS_URL = process.env.NEXT_PUBLIC_ACCOUNT_BACKEND === "directus" ? "/directus-api" : "/midpoint-api";

const ACCESS_TOKEN_KEY = "fantuan_portal_token";
const REFRESH_TOKEN_KEY = "fantuan_portal_refresh_token";
const EXPIRES_AT_KEY = "fantuan_portal_expires_at";
const DEFAULT_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
let refreshPromise: Promise<string> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function storageGet(key: string) {
  return typeof window === "undefined" ? "" : localStorage.getItem(key) || "";
}
function decodeClaims(token: string) {
  try {
    const part = token.split(".")[1];
    if (!part) return {};
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(Array.from(atob(normalized), (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")));
  } catch { return {}; }
}
function decodeBasicUsername(token: string) {
  try { return decodeURIComponent(escape(atob(token))).split(":", 1)[0].trim().toLowerCase(); }
  catch { return ""; }
}
function clearRefreshTimer() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
}
function saveTokens(data: any) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
  if (data.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
  const claims: any = decodeClaims(data.access_token);
  const expiresAt = data.expires ? Date.now() + Number(data.expires) : claims.exp ? Number(claims.exp) * 1000 : Date.now() + DEFAULT_SESSION_MS;
  localStorage.setItem(EXPIRES_AT_KEY, String(expiresAt));
  scheduleRefresh();
}
function scheduleRefresh(delay?: number) {
  if (typeof window === "undefined" || !storageGet(REFRESH_TOKEN_KEY)) return;
  clearRefreshTimer();
  const expiresAt = Number(storageGet(EXPIRES_AT_KEY)) || Date.now() + DEFAULT_SESSION_MS;
  const wait = delay ?? Math.max(10_000, expiresAt - Date.now() - 60_000);
  refreshTimer = setTimeout(() => {
    refreshAccessToken().catch(() => scheduleRefresh(60_000));
  }, wait);
}
function clearSession() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(EXPIRES_AT_KEY);
  }
  clearRefreshTimer();
}
async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;
  const refreshToken = storageGet(REFRESH_TOKEN_KEY);
  if (!refreshToken) throw new Error("登录已失效，请重新登录");
  refreshPromise = (async () => {
    const response = await fetch(DIRECTUS_URL + "/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken, mode: "json" }),
    });
    if (!response.ok) {
      const rejected = [400, 401, 403].includes(response.status);
      if (rejected) clearSession();
      throw new Error(rejected ? "登录已失效，请重新登录" : "服务暂时不可用，请稍后重试");
    }
    const json = await response.json();
    saveTokens(json.data);
    return json.data.access_token as string;
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}
async function validAccessToken() {
  const accessToken = storageGet(ACCESS_TOKEN_KEY);
  const expiresAt = Number(storageGet(EXPIRES_AT_KEY));
  if (!accessToken || (expiresAt && expiresAt - Date.now() < 30_000)) return refreshAccessToken();
  return accessToken;
}

export const session = {
  get: () => storageGet(ACCESS_TOKEN_KEY),
  has: () => Boolean(storageGet(ACCESS_TOKEN_KEY) || storageGet(REFRESH_TOKEN_KEY)),
  set: (value: string) => { if (typeof window !== "undefined") localStorage.setItem(ACCESS_TOKEN_KEY, value); },
  clear: clearSession,
  resume: () => scheduleRefresh(),
  claims: () => decodeClaims(storageGet(ACCESS_TOKEN_KEY)),
  username: () => decodeBasicUsername(storageGet(ACCESS_TOKEN_KEY)),
};

export async function login(email: string, password: string) {
  const response = await fetch(DIRECTUS_URL + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, mode: "json" }),
  });
  if (!response.ok) throw new Error("邮箱或密码不正确");
  const json = await response.json();
  saveTokens(json.data);
  return json.data;
}
export async function api(path: string, init: RequestInit = {}) {
  const request = (token: string) => fetch(DIRECTUS_URL + path, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache, no-store", Pragma: "no-cache", Authorization: (DIRECTUS_URL === "/midpoint-api" ? "Basic " : "Bearer ") + token, ...init.headers },
  });
  let response = await request(await validAccessToken());
  if (response.status === 401 && storageGet(REFRESH_TOKEN_KEY)) response = await request(await refreshAccessToken());
  if (response.status === 401) {
    clearSession();
    throw new Error("登录已失效，请重新登录");
  }
  if (!response.ok) {
    const json = await response.json().catch(() => null);
    throw new Error(json?.errors?.[0]?.message || "操作失败");
  }
  if (response.status === 204) return null;
  return (await response.json()).data;
}
export async function governanceApi(path:string,init:RequestInit={}){
 const token=await validAccessToken();
 const response=await fetch("/governance-api"+path,{...init,cache:"no-store",headers:{"Content-Type":"application/json","Cache-Control":"no-cache, no-store",Pragma:"no-cache",Authorization:"Basic "+token,...init.headers}});
 if(response.status===401){clearSession();throw new Error("登录已失效，请重新登录")}
 if(response.status===204)return null;
 const json=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(json?.errors?.[0]?.message||"治理操作失败");
 return json?.data??null;
}
export const getGovernanceState=()=>governanceApi("/state");
export const createGovernance=(type:string,data:any)=>governanceApi("/"+type,{method:"POST",body:JSON.stringify(data)});
export const updateGovernance=(type:string,id:string,data:any)=>governanceApi("/"+type+"/"+id,{method:"PATCH",body:JSON.stringify(data)});
export const deleteGovernance=(type:string,id:string)=>governanceApi("/"+type+"/"+id,{method:"DELETE"});
export const clearGovernanceDevices=()=>governanceApi("/devices",{method:"DELETE"});
export const runConnectorSync=(id:string)=>governanceApi("/connectors/"+id+"/sync",{method:"POST"});
export async function importDeviceExcel(file:File){
 const token=await validAccessToken(),body=new FormData();body.append("file",file);
 const response=await fetch("/governance-api/devices/import",{method:"POST",cache:"no-store",headers:{"Cache-Control":"no-cache, no-store",Pragma:"no-cache",Authorization:"Basic "+token},body});
 const json=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(json?.errors?.[0]?.message||"Excel 导入失败");
 return json.data;
}

export const getAccounts = async () => {const[midpoint,g]=await Promise.all([api("/items/accounts?limit=-1&fields=*,employee.id,employee.name,employee.employee_no,employee.employment_status,employee.department.name,system.id,system.name").catch(()=>[]),getGovernanceState()]);return[...(Array.isArray(midpoint)?midpoint:[]),...(Array.isArray(g.manualAccounts)?g.manualAccounts:[])]};
export const getEmployees = () => api("/items/employees?limit=-1&fields=*,department.id,department.name");
export const getDepartments = () => api("/items/departments?limit=-1&sort=name");
export const getSystems = async () => {const[managed,g]=await Promise.all([api("/items/systems?limit=-1").catch(()=>[]),getGovernanceState()]),deleted=new Set(Array.isArray(g.deletedSystemKeys)?g.deletedSystemKeys:[]);return[...(Array.isArray(managed)?managed:[]),...(Array.isArray(g.manualSystems)?g.manualSystems.filter((x:any)=>!deleted.has(`${x.source_connector||"manual"}:${x.external_id||x.id}`)):[])]};
export const getReviews = async () => (await getGovernanceState()).reviews;
export const getLicenses = async () => (await getGovernanceState()).licenses;
const localCollections=new Set(["accounts","account_reviews","licenses"]);
export const createItem = (collection: string, data: any) => localCollections.has(collection)?createGovernance(collection,data):api("/items/" + collection, { method: "POST", body: JSON.stringify(data) });
export const updateItem = (collection: string, id: any, data: any) => localCollections.has(collection)?updateGovernance(collection,String(id),data):api("/items/" + collection + "/" + id, { method: "PATCH", body: JSON.stringify(data) });
export const deleteItem = (collection: string, id: any) => localCollections.has(collection)||(collection==="systems"&&String(id).startsWith("mcp-system-"))?governanceApi("/"+collection+"/"+id,{method:"DELETE"}):api("/items/" + collection + "/" + id, { method: "DELETE" });
export const getCurrentUser = () => api("/users/me?fields=id,email,first_name,last_name,status,last_access,role");
export const getPortalUsers = () => api("/users?limit=-1&fields=id,email,first_name,last_name,status,last_access,role.id,role.name&sort=email");
export const getRoles = () => api("/roles?limit=-1&fields=id,name,description&sort=name");
export const createPortalUser = (data: any) => api("/users", { method: "POST", body: JSON.stringify(data) });
export const updatePortalUser = (id: string, data: any) => api("/users/" + id, { method: "PATCH", body: JSON.stringify(data) });
export const deletePortalUser = (id: string) => api("/users/" + id, { method: "DELETE" });
