import type {Metadata} from"next";import"./globals.css";
export const metadata:Metadata={title:"饭团 IT 账号与资产管理平台",description:"企业人员、平台账号与设备资产统一管理平台"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
