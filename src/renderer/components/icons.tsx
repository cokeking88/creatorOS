import React from 'react';

// Hand-drawn line icons (S1): 16px, stroke 1.5, currentColor, 24x24 viewBox,
// rounded caps. No icon library — this file is the single sanctioned exception.

const I = ({ d, extra }: { d: string; extra?: React.ReactNode }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />{extra}
  </svg>
);

export const IcDashboard = () => <I d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 9h8V3h-8z" />;
export const IcBrowser = () => <I d="M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z M2 9h20" extra={<circle cx="5" cy="6.5" r="0.5" />} />; // 窗口+顶栏
export const IcAccounts = () => <I d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6" />; // 人形
export const IcFiles = () => <I d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />; // 文件夹
export const IcContent = () => <I d="M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />; // 笔
export const IcAutomation = () => <I d="M12 2v3 M12 19v3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M2 12h3 M19 12h3 M4.9 19.1 7 17 M17 7l2.1-2.1 M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z" />; // 齿轮（手绘线稿，非 emoji）
export const IcSkills = () => <I d="M13 2 4 14h6l-1 8 9-12h-6z" />; // 闪电（agent-capabilities §12.1：一键可运行的能力）
export const IcLogs = () => <I d="M4 4h16v16H4z M8 9h8 M8 13h8 M8 17h5" />; // 列表
export const IcSettings = () => <I d="M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6" />; // 滑杆组

// Brand mark: square + C (S3) — the one 22px icon.
export const BrandMark = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="5" fill="var(--accent)" />
    <path d="M15.5 9.2A4.8 4.8 0 1 0 15.5 14.8" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
  </svg>
);

// Browser toolbar (§3.2)
export const IcBack = () => <I d="M15 6l-6 6 6 6" />;
export const IcForward = () => <I d="M9 6l6 6-6 6" />;
export const IcReload = () => <I d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />;
export const IcPlus = () => <I d="M12 5v14M5 12h14" />;
export const IcClose = () => <I d="M6 6l12 12M18 6L6 18" />;

// Files (§3.4)
export const IcFile = () => <I d="M6 2h8l4 4v16H6z M14 2v4h4" />;
export const IcChevronRight = () => <I d="M9 6l6 6-6 6" />; // 收起态 chevron
export const IcChevronDown = () => <I d="M6 9l6 6 6-6" />;   // 展开态 chevron

// Automation (§3.6)
export const IcTrash = () => <I d="M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6" />;

// Agent step states (§2.7)
export const IcSpinner = () => <I d="M12 3a9 9 0 1 0 9 9" />; // rotate via .step-icon.spin
export const IcOk = () => <I d="M5 13l4 4L19 7" />;
export const IcFail = () => <I d="M6 6l12 12M18 6L6 18" />;
export const IcWarn = () => <I d="M12 3 2 21h20z M12 10v5 M12 18v.01" />; // 三角
