import React from 'react';
import {
  Activity,
  AtSign,
  Bell,
  Bolt,
  CalendarClock,
  Ellipsis,
  Globe,
  Globe2,
  MessageCircleMore,
  Palette,
  ScrollText,
  Server,
  TrendingUp,
  Unplug,
  User,
} from 'lucide-react';

export interface AdminMenuItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  children?: AdminMenuItem[];
  external?: boolean;
}

export const adminMenuItems: AdminMenuItem[] = [
  { path: '/87051809', label: '服务器', icon: <Server size={18} /> },
  { path: '/87051809/websites', label: '网站', icon: <Globe2 size={18} /> },
  {
    path: '/87051809/settings',
    label: '系统设置',
    icon: <Bolt size={18} />,
    children: [
      { path: '/87051809/settings', label: '站点设置', icon: <Globe size={16} /> },
      { path: '/87051809/settings/general', label: '通用设置', icon: <Ellipsis size={16} /> },
    ],
  },
  {
    path: '/87051809/notifications',
    label: '通知管理',
    icon: <Bell size={18} />,
    children: [
      { path: '/87051809/notifications/settings', label: '通知设置', icon: <MessageCircleMore size={16} /> },
      { path: '/87051809/notifications/offline', label: '离线通知', icon: <Unplug size={16} /> },
      { path: '/87051809/notifications/expiry', label: '到期通知', icon: <CalendarClock size={16} /> },
      { path: '/87051809/notifications/load', label: '负载通知', icon: <TrendingUp size={16} /> },
    ],
  },
  { path: '/87051809/ping', label: '延迟监测', icon: <Activity size={18} /> },
  { path: '/87051809/themes', label: '主题管理', icon: <Palette size={18} /> },
  { path: '/87051809/logs', label: '审计日志', icon: <ScrollText size={18} /> },
  { path: '/87051809/account', label: '账户', icon: <User size={18} /> },
  { path: '/87051809/about', label: '关于', icon: <AtSign size={18} /> },
];

export function isAdminMenuPathActive(itemPath: string, currentPath: string) {
  if (itemPath === '/87051809/settings') return currentPath.startsWith('/87051809/settings');
  if (itemPath === '/87051809/notifications') {
    return currentPath.startsWith('/87051809/notifications') ||
      currentPath.startsWith('/87051809/notification');
  }
  if (itemPath === '/87051809/themes') return currentPath.startsWith('/87051809/themes');
  if (itemPath === '/87051809') return currentPath === '/87051809' || currentPath.startsWith('/87051809/clients');
  return currentPath === itemPath;
}

export function isAdminChildPathActive(childPath: string, currentPath: string) {
  if (childPath === '/87051809/settings') {
    return currentPath === childPath || currentPath === '/87051809/settings/site';
  }

  if (childPath === '/87051809/settings/general') {
    return currentPath === childPath || currentPath.startsWith(`${childPath}/`);
  }

  if (childPath === '/87051809/notifications/settings') {
    return currentPath === childPath ||
      currentPath.startsWith(`${childPath}/`) ||
      currentPath === '/87051809/settings/notification' ||
      currentPath.startsWith('/87051809/settings/notification/');
  }

  if (childPath === '/87051809/notifications/offline') {
    return currentPath === childPath ||
      currentPath.startsWith(`${childPath}/`) ||
      currentPath === '/87051809/notification/offline' ||
      currentPath.startsWith('/87051809/notification/offline/');
  }

  if (childPath === '/87051809/notifications/load') {
    return currentPath === childPath ||
      currentPath.startsWith(`${childPath}/`) ||
      currentPath === '/87051809/notification/load' ||
      currentPath.startsWith('/87051809/notification/load/');
  }

  if (childPath === '/87051809/notifications/expiry') {
    return currentPath === childPath ||
      currentPath.startsWith(`${childPath}/`) ||
      currentPath === '/87051809/notification/expiry' ||
      currentPath.startsWith('/87051809/notification/expiry/');
  }

  return currentPath === childPath || currentPath.startsWith(`${childPath}/`);
}

export function getAdminSectionTitle(pathname: string) {
  if (
    pathname.startsWith('/87051809/notifications/settings') ||
    pathname.startsWith('/87051809/settings/notification')
  ) return '通知设置';
  if (pathname.startsWith('/87051809/settings/general')) return '通用设置';
  if (pathname.startsWith('/87051809/settings')) return '站点设置';
  if (
    pathname.startsWith('/87051809/notifications/offline') ||
    pathname.startsWith('/87051809/notification/offline')
  ) return '离线通知';
  if (
    pathname.startsWith('/87051809/notifications/load') ||
    pathname.startsWith('/87051809/notification/load')
  ) return '负载通知';
  if (
    pathname.startsWith('/87051809/notifications/expiry') ||
    pathname.startsWith('/87051809/notification/expiry')
  ) return '到期通知';
  if (
    pathname.startsWith('/87051809/notifications') ||
    pathname.startsWith('/87051809/notification')
  ) return '通知管理';
  if (pathname.startsWith('/87051809/ping')) return '延迟监测';
  if (pathname.startsWith('/87051809/themes')) return '主题管理';
  if (pathname.startsWith('/87051809/websites')) return '网站';
  if (pathname.startsWith('/87051809/logs')) return '审计日志';
  if (pathname.startsWith('/87051809/account')) return '账户设置';
  if (pathname.startsWith('/87051809/about')) return '关于';
  if (pathname === '/87051809' || pathname.startsWith('/87051809/clients')) return '服务器';
  return '管理后台';
}
