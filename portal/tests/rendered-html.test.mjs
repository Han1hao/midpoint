import assert from "node:assert/strict";
import { access, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", String(process.pid) + "-" + Date.now() + "-" + Math.random());
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost" + path, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("production build renders the Fantuan portal shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /饭团 IT 账号与资产管理平台/);
  assert.match(html, /正在加载 IT 账号与资产管理平台/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("governance workflows are present and audit history is protected", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const text of ["共享账号", "服务账号", "外部账号", "保存核查结论", "整改截止日期", "90天未登录"]) {
    assert.match(page, new RegExp(text));
  }
  assert.match(page, /历史核查记录不会随账号删除/);
  assert.doesNotMatch(page, /deleteItem\("account_reviews",review\.id\)/);
  assert.match(page, /roleName==="IT账号管理员"/);
  assert.doesNotMatch(page, /NAV=.*许可证管理/);
  assert.match(page, /setModal\("system"\).*＋ 新增系统/);
});

test("enterprise governance requirements are represented by operational views", async () => {
  const [page, views, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/GovernanceViews.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/midpoint-api/[...path]/route.ts", import.meta.url), "utf8"),
  ]);
  for (const text of ["治理工作台", "账号台账", "设备资产"]) assert.match(page, new RegExp(text));
  assert.doesNotMatch(page,/tab==="生命周期"|<LifecycleOps/);
  assert.doesNotMatch(page,/n==="风险整改"|tab==="风险整改"/);
  assert.doesNotMatch(page, /const NAV=.*应用目录/);
  assert.doesNotMatch(page, /const NAV=.*审计留痕/);
  assert.doesNotMatch(page, /成本中心|cost_center/);
  assert.doesNotMatch(page, /department:Number\(f\.department\)/);
  assert.match(page, /department:String\(f\.department\)/);
  assert.doesNotMatch(route, /成本中心|cost_center/);
  assert.match(page, /window\.addEventListener\("focus",refresh\)/);
  assert.match(page, /window\.setInterval\(refresh,30000\)/);
  for (const text of ["账号责任覆盖率", "员工账号关联率", "设备责任覆盖率", "同步连接可用率", "企业账号与设备资产统一管理"]) assert.match(views, new RegExp(text));
  for (const endpoint of ["users", "orgs", "services", "shadows"]) assert.match(route, new RegExp(`search\\(\"${endpoint}\"`));
});

test("midPoint roles drive distinct portal permissions", async () => {
  const [page, views, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/GovernanceViews.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/midpoint-api/[...path]/route.ts", import.meta.url), "utf8"),
  ]);
  for (const role of ["Administrator", "IT账号管理员", "应用负责人", "审计人员", "只读用户"]) {
    assert.match(page + views + route, new RegExp(role));
  }
  assert.match(page, /ROLE_NAV/);
  assert.match(route, /roleMembershipRef/);
  assert.match(route, /options=resolveNames/);
  assert.match(route, /firstVal\(x\.organizationalUnit\)/);
  assert.match(route, /OrgType/);
  assert.match(views, /分级权限控制/);
});

test("Linux deployment assets use fixed local ports and include a production API proxy", async () => {
  const [route, deploy, service, nginx, localServer] = await Promise.all([
    readFile(new URL("../app/directus-api/[...path]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../deployment/linux/deploy.sh", import.meta.url), "utf8"),
    readFile(new URL("../../deployment/linux/identity-governance-portal.service.example", import.meta.url), "utf8"),
    readFile(new URL("../../deployment/linux/nginx.conf.example", import.meta.url), "utf8"),
    readFile(new URL("../scripts/local-server.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(route, /DIRECTUS_INTERNAL_URL/);
  assert.match(route, /127\.0\.0\.1:8055/);
  assert.match(deploy, /docker compose up -d/);
  assert.match(service, /scripts\/local-server\.mjs/);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3001/);
  assert.match(localServer, /process\.env\.PORT \|\| 3001/);
  assert.match(localServer, /LOCAL_BACKEND_PORT \|\| 3005/);
  assert.match(localServer, /no-store, no-cache, must-revalidate/);
  assert.doesNotMatch(deploy + service + nginx, /C:\\Users\\fantuan|\.ps1|\.cmd/);
  await access(new URL("../.env.example", import.meta.url));
});

test("governance backend enforces evidence, separation of duties, and audit trails", async () => {
  const [route, views] = await Promise.all([
    readFile(new URL("../app/governance-api/[...path]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationsViews.tsx", import.meta.url), "utf8"),
  ]);
  for (const invariant of ["必须先审批", "执行必须填写证据编号或回执", "执行人与复核人不能相同", "关闭风险必须提供证据", "数据清除必须填写清除方式、硬件报告和证据编号"]) assert.match(route, new RegExp(invariant));
  for (const area of ["身份生命周期工单", "外部平台数据同步", "风险整改闭环", "设备资产管理"]) assert.match(views, new RegExp(area));
  assert.match(views,/连接器已删除/);
  assert.match(route,/删除连接器/);
  assert.doesNotMatch(views, /export function AuditOps/);
  assert.doesNotMatch(views,/>领用<|>归还<|>数据清除<|>确认完成</);
  assert.doesNotMatch(views,/>报修<|>回收处置</);
  assert.match(route, /audit\(s,a/);
  assert.match(route, /governance-store\.json/);
});

test("midPoint portal users support role update, disable, and safe deletion", async () => {
  const route = await readFile(new URL("../app/midpoint-api/[...path]/route.ts", import.meta.url), "utf8");
  assert.match(route, /updatePortalUser/);
  assert.match(route, /deletePortalUser/);
  assert.match(route, /不能停用当前登录账号/);
  assert.match(route, /不能删除当前登录账号/);
  assert.match(route, /内置 administrator 必须保持启用和超级管理员角色/);
  assert.match(route, /该登录邮箱已存在/);
  assert.match(route, /portalLogin/);
});

test("device assets support local Excel import and simplified lifecycle execution", async () => {
  const [views,route,directus,server,page]=await Promise.all([
    readFile(new URL("../app/OperationsViews.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/governance-api/[...path]/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../lib/directus.ts",import.meta.url),"utf8"),
    readFile(new URL("../scripts/local-server.mjs",import.meta.url),"utf8"),
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
  ]);
  const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  assert.match(views, /＋ 新增设备/);
  assert.match(css, /work:has\(\.asset-page\)>header\{display:none\}/);
  assert.match(css, /height:100vh/);
  for(const text of ["导入 Excel","正在导入","快速发起","凭证已自动生成"])assert.match(views,new RegExp(text));
  for(const text of ["平台类型","最近登录如何识别","新增数据连接","访问令牌环境变量"])assert.match(views,new RegExp(text));
  assert.doesNotMatch(views,/输入 real 创建生产 REST 连接器/);
  for(const text of ["Excel 导入设备资产","一次最多导入 2000 条设备","资产编号"])assert.match(route,new RegExp(text));
  assert.match(views,/设备资产已删除/);
  assert.match(views,/编辑固定资产/);
  assert.match(views,/设备资产已更新/);
  for(const text of ["购买金额","保修时限","累计折旧","折旧信息","5 年直线法"])assert.match(views,new RegExp(text));
  for(const field of ["purchasePrice","usefulLifeYears","residualValue","depreciationMethod"])assert.match(route,new RegExp(field));
  for(const field of ["设备资产编码","设备品牌型号","内存","入库时间","领用时间","使用人姓名","职位","是否公司配发设备","购入渠道","保修时限/月"])assert.match(route,new RegExp(field));
  assert.match(route,/usefulLifeYears:5/);
  assert.match(views,/5 年直线法/);
  for(const text of ["资产条形码","摄像头","上传照片","BrowserMultiFormatReader","条码"])assert.match(views,new RegExp(text));
  assert.doesNotMatch(views,/当前浏览器不支持摄像头条码识别/);
  assert.match(route,/该资产条形码已被其他设备使用/);
  assert.match(route,/assetBarcode/);
  assert.match(route,/每个人在同一平台只能保留一个账号/);
  assert.match(route,/duplicateAccount/);
  assert.match(page,/账号唯一规则/);
  assert.match(page,/唯一规则正常/);
  assert.match(page,/最近登录时间由系统自动识别/);
  assert.match(page,/手工编辑已关闭/);
  assert.doesNotMatch(page,/>最近登录日期<input/);
  assert.match(views,/最近登录字段/);
  assert.match(route,/login_data_source/);
  assert.match(views,/setHidden/);
  assert.doesNotMatch(views,/存放位置|>位置</);
  assert.doesNotMatch(views,/请输入归还时设备状况|请输入报修原因|请输入数据清除方式/);
  assert.match(route,/action==="retire"/);
  assert.match(route,/删除设备资产/);
  assert.match(route,/v\.id!==x\.id/);
  assert.match(directus,/importDeviceExcel/);
  assert.match(server,/PYTHON_PATH/);
  assert.match(server,/headers\.origin/);
  await access(new URL("../scripts/read-device-excel.py",import.meta.url));
});

test("lifecycle API rejects missing evidence and enforces independent review", async () => {
  const dir=await mkdtemp(join(tmpdir(),"governance-test-"));
  process.env.GOVERNANCE_STORE_PATH=join(dir,"store.json");
  process.env.GOVERNANCE_STORAGE="json";
  process.env.PYTHON_PATH=resolve(dirname(process.execPath),"..","..","python","python.exe");
  const realFetch=globalThis.fetch;
  globalThis.fetch=async (input,init={})=>{
    const url=String(input);
    if(url.includes("/midpoint/ws/rest/self")){
      const auth=new Headers(init.headers).get("Authorization")||"";
      const user=Buffer.from(auth.replace(/^Basic /,""),"base64").toString("utf8").split(":")[0];
      return Response.json({user:{oid:user,name:user,roleMembershipRef:user==="auditor"?[{targetName:"审计人员"}]:[]}});
    }
    if(url==="https://connector.test/accounts")return Response.json({data:[{id:"u-1",username:"alice",status:"active",owner:"IT",lastLoginAt:"2026-08-24T09:30:00Z"},{id:"u-2",username:"bob",status:"disabled",owner:"Finance"}]});
    if(url==="https://connector.test/mcp"){
      const message=JSON.parse(String(init.body||"{}"));
      const headers={"Content-Type":"application/json","Mcp-Session-Id":"test-session"};
      if(message.method==="notifications/initialized")return new Response(null,{status:202,headers});
      if(message.method==="initialize")return Response.json({jsonrpc:"2.0",id:message.id,result:{protocolVersion:"2025-03-26",capabilities:{tools:{}},serverInfo:{name:"test-mcp",version:"1.0.0"}}},{headers});
      if(message.method==="tools/list")return Response.json({jsonrpc:"2.0",id:message.id,result:{tools:[{name:"list_accounts",description:"List internal accounts",inputSchema:{type:"object"}},{name:"list_entries",description:"List internal platform entries",inputSchema:{type:"object"}}]}},{headers});
      if(message.method==="tools/call"&&message.params?.name==="list_entries")return Response.json({jsonrpc:"2.0",id:message.id,result:{structuredContent:{data:{entries:[{id:"jira",name:"Jira",url:"https://jira.fantuan.ca",category:"产研中心"}]}}}},{headers});
      if(message.method==="tools/call")return Response.json({jsonrpc:"2.0",id:message.id,result:{structuredContent:{data:{accounts:[{id:"mcp-1",username:"carol",status:"active",owner:"研发部",lastLoginAt:"2026-08-27T08:00:00Z"}]}}}},{headers});
    }
    return realFetch(input,init);
  };
  try{
    const workerUrl=new URL("../dist/server/index.js",import.meta.url);workerUrl.searchParams.set("api-test",String(Date.now()));
    const{default:worker}=await import(workerUrl.href);
    const env={ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},ctx={waitUntil(){},passThroughOnException(){}};
    const call=(pathname,method="GET",body,who="administrator")=>worker.fetch(new Request("http://localhost/governance-api"+pathname,{method,headers:{Authorization:"Basic "+Buffer.from(who+":test").toString("base64"),"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined}),env,env.ctx);
    let r=await call("/requests","POST",{type:"offboarding",subject:"测试员工",reason:"离职工单"});assert.equal(r.status,201);const req=(await r.json()).data;
    r=await call("/requests/"+req.id,"PATCH",{action:"approve"});assert.equal(r.status,200);
    r=await call("/requests/"+req.id,"PATCH",{action:"execute"});assert.equal(r.status,400);
    r=await call("/requests/"+req.id,"PATCH",{action:"execute",evidence:"EVIDENCE-001"});assert.equal(r.status,200);
    r=await call("/requests/"+req.id,"PATCH",{action:"verify"});assert.equal(r.status,409);
    r=await call("/requests/"+req.id,"PATCH",{action:"verify"},"auditor");assert.equal(r.status,200);assert.equal((await r.json()).data.status,"closed");
    r=await call("/connectors","POST",{name:"真实测试连接器",mode:"real",endpoint:"https://connector.test/accounts",usernameField:"username",idField:"id",statusField:"status",lastLoginField:"lastLoginAt"});assert.equal(r.status,201);const connector=(await r.json()).data;
    r=await call("/connectors/"+connector.id+"/sync","POST");assert.equal(r.status,200,await r.clone().text());const sync=(await r.json()).data;assert.equal(sync.discovered,2);assert.equal(sync.created,2);
    process.env.TEST_MCP_ACCESS_TOKEN="test-token";
    r=await call("/connectors","POST",{name:"MCP 测试连接器",platform:"mcp",mode:"real",endpoint:"https://connector.test/mcp",tokenEnv:"TEST_MCP_ACCESS_TOKEN",mcpTool:"",mcpArguments:"{}",recordsPath:"data.accounts",usernameField:"username",idField:"id",ownerField:"owner",statusField:"status",lastLoginField:"lastLoginAt"});assert.equal(r.status,201,await r.clone().text());const mcpConnector=(await r.json()).data;assert.equal(mcpConnector.protocol,"mcp");
    r=await call("/connectors/"+mcpConnector.id+"/sync","POST");assert.equal(r.status,200,await r.clone().text());const mcpSync=(await r.json()).data;assert.equal(mcpSync.discovered,1);assert.equal(mcpSync.created,1);assert.equal(mcpSync.tool,"list_accounts");
    r=await call("/connectors","POST",{name:"内部平台目录",platform:"mcp",target:"systems",mode:"real",endpoint:"https://connector.test/mcp",tokenEnv:"TEST_MCP_ACCESS_TOKEN",mcpArguments:"{}",recordsPath:"data.entries",idField:"id",systemNameField:"name",urlField:"url",categoryField:"category"});assert.equal(r.status,201,await r.clone().text());const catalogConnector=(await r.json()).data;
    r=await call("/connectors/"+catalogConnector.id+"/sync","POST");assert.equal(r.status,200,await r.clone().text());const catalogSync=(await r.json()).data;assert.equal(catalogSync.target,"systems");assert.equal(catalogSync.tool,"list_entries");
    const form=new FormData();form.append("file",new File(["资产编号,设备类别,品牌,型号,当前状态\nIMPORT-001,笔记本电脑,Lenovo,T14,在库"],"devices.csv",{type:"text/csv"}));
    r=await worker.fetch(new Request("http://localhost/governance-api/devices/import",{method:"POST",headers:{Authorization:"Basic "+Buffer.from("administrator:test").toString("base64")},body:form}),env,env.ctx);assert.equal(r.status,201,await r.clone().text());const imported=(await r.json()).data;assert.equal(imported.success,1,JSON.stringify(imported));assert.equal(imported.failed,0);
    r=await call("/accounts","POST",{employee:"employee-1",system:"system-1",username:"first",account_status:"active"});assert.equal(r.status,201);
    r=await call("/accounts","POST",{employee:"employee-1",system:"system-1",username:"duplicate",account_status:"active"});assert.equal(r.status,409);assert.match(await r.text(),/每个人在同一平台只能保留一个账号/);
    r=await call("/state");const state=(await r.json()).data;assert.equal(state.requests[0].status,"closed");assert.equal(state.manualAccounts.length,4);assert.ok(state.audits.length>=6);
    assert.equal(state.manualAccounts.find(x=>x.username==="alice").last_login_at,"2026-08-24T09:30:00Z");
    assert.equal(state.manualAccounts.find(x=>x.username==="carol").source,"mcp");
    assert.equal(state.manualSystems.find(x=>x.name==="Jira").url,"https://jira.fantuan.ca");
    assert.equal(state.devices[0].assetNo,"IMPORT-001");
    r=await call("/devices","POST",{assetNo:"BARCODE-001",assetBarcode:"6901234567890",device:"扫码测试设备"});assert.equal(r.status,201);
    r=await call("/devices","POST",{assetNo:"BARCODE-002",assetBarcode:"6901234567890",device:"重复条码设备"});assert.equal(r.status,409);assert.match(await r.text(),/条形码已被其他设备使用/);
  }finally{globalThis.fetch=realFetch;delete process.env.GOVERNANCE_STORAGE;delete process.env.TEST_MCP_ACCESS_TOKEN;await rm(dir,{recursive:true,force:true})}
});
