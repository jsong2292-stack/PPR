/** PPR质量智能分析助手的站点品牌、导航和页脚配置。 */
export interface NavItem { label:string; href:string; children?:{label:string;href:string}[]; adminOnly?:boolean; authOnly?:boolean; guestOnly?:boolean }
export interface FooterColumn { title:string; links:{label:string;href:string}[] }
export const siteConfig={
  name:process.env.NEXT_PUBLIC_SITE_NAME||'PPR质量智能分析助手',
  nameEn:process.env.NEXT_PUBLIC_SITE_NAME_EN||'QUALITY ANALYSIS COPILOT',
  logoText:process.env.NEXT_PUBLIC_SITE_LOGO_TEXT||'PPR',
  description:process.env.NEXT_PUBLIC_SITE_DESCRIPTION||'面向PPR管材生产的质量数据管理、异常预警、智能诊断、工程师验证和8D闭环平台。',
  keywords:['PPR','质量管理','异常诊断','8D报告','日丰平台'],
  copyright:process.env.NEXT_PUBLIC_SITE_COPYRIGHT||'© PPR质量智能分析助手', owner:process.env.NEXT_PUBLIC_SITE_OWNER||'',
  nav:[
    {label:'质量工作台',href:'/quality/monitor'},
    {label:'数据源管理',href:'#',children:[{label:'产品数据',href:'/quality/data/measurements'},{label:'设备采集数据',href:'/quality/data/readings'},{label:'批次基础信息',href:'/quality/data/batches'}]},
    {label:'异常诊断',href:'/quality/diagnosis'},
    {label:'8D报告',href:'/quality/report'},
    {label:'历史分析',href:'/quality/history'},
  ] as NavItem[],
  footerColumns:[{title:'质量闭环',links:[{label:'监控与预警',href:'/quality/monitor'},{label:'异常诊断',href:'/quality/diagnosis'},{label:'8D报告',href:'/quality/report'}]},{title:'平台管理',links:[{label:'个人资料',href:'/user/profile'},{label:'用户管理',href:'/admin/users'},{label:'系统设置',href:'/admin/settings'}]}] as FooterColumn[],
  footerNote:'基于日丰通用平台脚手架构建；演示规则和阈值需在正式上线前完成现场校准。',
  enableQrDialog:false,qrImage:'/wechat-qrcode.png',qrTitle:'关注公众号',qrDescription:'扫码关注我们',
} as const;
export const PUBLIC_PATHS=['/login','/register','/install','/api','/_next'];
export function isPublicPath(pathname:string){return PUBLIC_PATHS.some(p=>pathname===p||pathname.startsWith(`${p}/`))}
