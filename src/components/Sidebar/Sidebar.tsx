import { memo } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

type TabType = 'keyword' | 'blog' | 'post' | 'morpheme' | 'batch' | 'rank';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  username: string;
  onLogout: () => void;
  onOpenSettings: () => void;
}

const menuItems: Array<{ id: TabType; label: string; icon: string }> = [
  {
    id: 'keyword',
    label: '키워드 조회',
    icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  },
  {
    id: 'batch',
    label: '대량 조회',
    icon: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  },
  {
    id: 'rank',
    label: '순위 추적',
    icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  },
  {
    id: 'blog',
    label: '블로그 진단',
    icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z',
  },
  {
    id: 'post',
    label: '포스팅 진단',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  {
    id: 'morpheme',
    label: '형태소 진단',
    icon: 'M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129',
  },
];

function Sidebar({ activeTab, onTabChange, username, onLogout, onOpenSettings }: SidebarProps) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <aside className="sidebar-container w-[230px] min-w-[230px] h-full flex flex-col border-r border-dark-border" style={{ backgroundColor: 'var(--color-sidebar)' }}>
      {/* Logo / App Name */}
      <div className="px-5 py-5 border-b border-dark-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl naver-gradient flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-base">H</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-dark-text leading-tight truncate">핸디 블로그</h1>
            <p className="text-[11px] text-dark-muted leading-tight">엔지니어링</p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 py-3 px-3 overflow-y-auto">
        <div className="space-y-0.5">
          {menuItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
                  ${isActive
                    ? 'bg-naver-green/15 text-naver-green'
                    : 'text-dark-muted hover:text-dark-text hover:bg-dark-hover'
                  }
                `}
              >
                <svg
                  className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-naver-green' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={isActive ? 2.2 : 1.8}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                <span>{item.label}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-naver-green" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Bottom Section: Theme Toggle + Settings + User */}
      <div className="border-t border-dark-border p-3 space-y-2">
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-dark-muted hover:text-dark-text hover:bg-dark-hover transition-all duration-150"
          title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {isDark ? (
            /* Sun icon for switching to light */
            <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            /* Moon icon for switching to dark */
            <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
          <span>{isDark ? '라이트 모드' : '다크 모드'}</span>
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-dark-muted hover:text-dark-text hover:bg-dark-hover transition-all duration-150"
        >
          <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>API 설정</span>
        </button>

        {/* User Info */}
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-naver-green/20 flex items-center justify-center flex-shrink-0">
            <span className="text-naver-green text-xs font-bold">
              {username.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-dark-text truncate">{username}</p>
          </div>
          <button
            onClick={onLogout}
            className="text-dark-muted hover:text-red-400 transition flex-shrink-0"
            title="로그아웃"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

export default memo(Sidebar);
