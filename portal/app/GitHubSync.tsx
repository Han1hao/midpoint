"use client";
import { useEffect, useMemo, useState } from "react";
import { createItem, updateItem } from "../lib/directus";

type GitHubMember = { id:number; login:string; avatar_url:string; html_url:string; type:string };

async function githubMembers(org:string):Promise<GitHubMember[]>{
 const all:GitHubMember[]=[];
 for(let page=1;page<=10;page+=1){
  const response=await fetch("https://api.github.com/orgs/"+encodeURIComponent(org)+"/members?per_page=100&page="+page,{headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}});
  if(response.status===404)throw new Error("未找到该公开组织，或组织成员列表未公开");
  if(response.status===403)throw new Error("GitHub公开接口访问次数已达上限，请稍后重试");
  if(!response.ok)throw new Error("GitHub连接失败，请检查组织名称或网络");
  const rows=await response.json() as GitHubMember[];
  all.push(...rows);
  if(rows.length<100)break;
 }
 return all;
}

export default function GitHubSync({accounts,systems,canWrite,refresh,note}:{accounts:any[];systems:any[];canWrite:boolean;refresh:()=>Promise<void>|void;note:(message:string)=>void}){
 const[org,setOrg]=useState("octokit"),[members,setMembers]=useState<GitHubMember[]>([]),[selected,setSelected]=useState<string[]>([]),[loading,setLoading]=useState(false),[syncing,setSyncing]=useState(false),[checkedAt,setCheckedAt]=useState("");
 const githubSystem=systems.find(item=>String(item.name).toLowerCase()==="github");
 const existing=useMemo(()=>new Set(accounts.filter(item=>String(item.system?.name||"").toLowerCase()==="github").map(item=>String(item.username||"").toLowerCase())),[accounts]);
 const newMembers=members.filter(member=>!existing.has(member.login.toLowerCase()));
 const selectedMembers=newMembers.filter(member=>selected.includes(member.login));

 async function readOrganization(name:string,announce=true){
  setLoading(true);
  try{
   const rows=await githubMembers(name);
   setMembers(rows);
   setSelected(rows.filter(member=>!existing.has(member.login.toLowerCase())).map(member=>member.login));
   setCheckedAt(new Date().toLocaleString("zh-CN"));
   if(announce)note("已读取 GitHub 公开组织成员，可选择后写入台账");
  }catch(error:any){setMembers([]);setSelected([]);note("GitHub 连接失败："+error.message)}
  finally{setLoading(false)}
 }

 useEffect(()=>{let active=true;githubMembers("octokit").then(rows=>{if(!active)return;setMembers(rows);setSelected(rows.filter(member=>!existing.has(member.login.toLowerCase())).map(member=>member.login));setCheckedAt(new Date().toLocaleString("zh-CN"))}).catch(()=>{});return()=>{active=false}},[]);

 async function preview(event:React.FormEvent){event.preventDefault();const clean=org.trim();if(clean)await readOrganization(clean)}
 async function sync(){
  if(!canWrite){note("当前角色没有同步写入权限");return}
  if(!selectedMembers.length){note("请至少选择一个待同步账号");return}
  if(!window.confirm("确认把 "+selectedMembers.length+" 个 GitHub 账号写入台账吗？账号将标记为未认领，不会修改 GitHub。"))return;
  setSyncing(true);
  let created=0,failed=0,skipped=0;
  try{
   let system=githubSystem;
   if(!system)system=await createItem("systems",{name:"GitHub",system_type:"saas",url:"https://github.com/"+org.trim(),owner:org.trim(),it_owner:"IT账号管理员",risk_level:"high",review_cycle_days:90,status:"active"});
   for(const member of selectedMembers){
    try{
     await createItem("accounts",{system:system.id,employee:null,username:member.login,role_name:member.type==="User"?"Organization Member":member.type,account_status:"active",status:"active",is_privileged:false,responsible_owner:org.trim(),source:"api",notes:"账号类型：外部账号\n来源：GitHub 公开组织成员同步"});
     created+=1;
    }catch(error:any){
     const message=String(error.message||"").toLowerCase();
     if(message.includes("unique")||message.includes("already")||message.includes("duplicate"))skipped+=1;else failed+=1;
    }
   }
   await updateItem("systems",system.id,{last_account_import_at:new Date().toISOString(),account_count_reported:members.length});
   await refresh();
   note("GitHub 同步完成：新增 "+created+"，已存在 "+skipped+"，失败 "+failed);
  }catch(error:any){note("同步失败："+error.message)}
  finally{setSyncing(false)}
 }

 return <div className="content sync-center">
  <section className="sync-hero"><div className="sync-brand">GH</div><div><span>第三方平台连接器</span><h2>GitHub 组织账号同步</h2><p>支持分页读取公开组织成员，先预览并选择，再写入 Directus 台账。不会修改 GitHub。</p></div><span className="readonly-badge">只读连接</span></section>
  <section className="panel sync-config"><div><h3>连接配置</h3><p>请输入 GitHub 公开组织名称。最多读取前 1000 个公开成员。</p></div><form onSubmit={preview}><label>GitHub 组织<div className="sync-input"><span>github.com/</span><input value={org} onChange={e=>setOrg(e.target.value)} placeholder="organization" required/></div></label><button disabled={loading}>{loading?"正在连接…":"测试并预览"}</button></form></section>
  <section className="panel sync-result"><div className="pt"><div><h3>同步预览</h3><p>{checkedAt?"最近读取："+checkedAt:"尚未连接 GitHub 组织"}</p></div>{members.length>0&&<button className="sync-button" disabled={syncing||!canWrite||selectedMembers.length===0} onClick={sync}>{syncing?"正在同步…":"同步 "+selectedMembers.length+" 个选中账号"}</button>}</div>
  {members.length===0?<div className="sync-empty"><b>等待连接</b><span>组织成员将在这里预览，确认后才会写入台账。</span></div>:<><div className="sync-summary"><article><span>读取成员</span><b>{members.length}</b></article><article><span>待新增</span><b>{newMembers.length}</b></article><article><span>已存在</span><b>{members.length-newMembers.length}</b></article><article><span>已选择</span><b>{selectedMembers.length}</b></article></div><div className="sync-selectbar"><span>选择需要写入台账的账号</span><div><button type="button" onClick={()=>setSelected(newMembers.map(member=>member.login))}>全选待新增</button><button type="button" onClick={()=>setSelected([])}>取消全选</button></div></div><div className="sync-members">{members.map(member=>{const exists=existing.has(member.login.toLowerCase());return <article key={member.id} className={exists?"is-disabled":selected.includes(member.login)?"is-selected":""}><label className="sync-check" aria-label={"选择 "+member.login}><input type="checkbox" disabled={exists} checked={!exists&&selected.includes(member.login)} onChange={event=>setSelected(current=>event.target.checked?[...new Set([...current,member.login])]:current.filter(login=>login!==member.login))}/><span/></label><img src={member.avatar_url} alt=""/><div><b>{member.login}</b><a href={member.html_url} target="_blank" rel="noreferrer">查看 GitHub 主页</a></div><span className={exists?"sync-exists":"sync-new"}>{exists?"已在台账":"待新增"}</span></article>})}</div></>}</section>
 </div>
}