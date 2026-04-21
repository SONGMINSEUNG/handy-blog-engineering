import { useState, useCallback, useEffect, memo } from 'react';
import { testNaverAdConnection, saveNaverAdSettings, getNaverAdSettings } from '../../services/api';

export interface NaverAdSettings {
  customer_id: string;
  api_key: string;
  secret_key: string;
}

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess: () => void;
}

function ApiSettingsModal({ isOpen, onClose, onSaveSuccess }: ApiSettingsModalProps) {
  const [settings, setSettings] = useState<NaverAdSettings>({
    customer_id: '',
    api_key: '',
    secret_key: '',
  });
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 기존 설정 불러오기
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      getNaverAdSettings()
        .then((data) => {
          if (data.customer_id) {
            setSettings({
              customer_id: data.customer_id || '',
              api_key: data.api_key || '',
              secret_key: '', // 보안상 secret_key는 마스킹 처리
            });
          }
        })
        .catch(() => {
          // 설정이 없는 경우 무시
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen]);

  // 입력 핸들러
  const handleChange = useCallback(
    (field: keyof NaverAdSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setSettings((prev) => ({
        ...prev,
        [field]: e.target.value,
      }));
      setTestResult(null);
    },
    []
  );

  // 연결 테스트
  const handleTest = useCallback(async () => {
    if (!settings.customer_id || !settings.api_key || !settings.secret_key) {
      setTestResult({
        success: false,
        message: '모든 필드를 입력해주세요.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testNaverAdConnection(settings);
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        message: '연결 테스트 중 오류가 발생했습니다.',
      });
    } finally {
      setIsTesting(false);
    }
  }, [settings]);

  // 저장
  const handleSave = useCallback(async () => {
    if (!settings.customer_id || !settings.api_key || !settings.secret_key) {
      setTestResult({
        success: false,
        message: '모든 필드를 입력해주세요.',
      });
      return;
    }

    setIsSaving(true);
    try {
      await saveNaverAdSettings(settings);
      onSaveSuccess();
      onClose();
    } catch (error) {
      setTestResult({
        success: false,
        message: '저장 중 오류가 발생했습니다.',
      });
    } finally {
      setIsSaving(false);
    }
  }, [settings, onSaveSuccess, onClose]);

  // 모달 닫기 핸들러
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // ESC 키로 닫기
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 fade-in"
      onClick={handleBackdropClick}
    >
      <div className="bg-dark-card border border-dark-border rounded-xl w-full max-w-md mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h2 className="text-lg font-semibold">네이버 광고 API 설정</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-dark-hover rounded-lg transition"
          >
            <svg
              className="w-5 h-5 text-dark-muted hover:text-dark-text"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-2 border-naver-green border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <>
              {/* CUSTOMER_ID */}
              <div>
                <label className="block text-sm font-medium text-dark-muted mb-1">
                  CUSTOMER_ID
                </label>
                <input
                  type="text"
                  value={settings.customer_id}
                  onChange={handleChange('customer_id')}
                  placeholder="네이버 광고 고객 ID"
                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text placeholder-dark-muted focus:outline-none focus:border-naver-green transition"
                />
              </div>

              {/* API_KEY */}
              <div>
                <label className="block text-sm font-medium text-dark-muted mb-1">
                  API_KEY
                </label>
                <input
                  type="text"
                  value={settings.api_key}
                  onChange={handleChange('api_key')}
                  placeholder="API 액세스 라이센스"
                  className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text placeholder-dark-muted focus:outline-none focus:border-naver-green transition"
                />
              </div>

              {/* SECRET_KEY */}
              <div>
                <label className="block text-sm font-medium text-dark-muted mb-1">
                  SECRET_KEY
                </label>
                <div className="relative">
                  <input
                    type={showSecretKey ? 'text' : 'password'}
                    value={settings.secret_key}
                    onChange={handleChange('secret_key')}
                    placeholder="API 비밀키"
                    className="w-full px-3 py-2 pr-16 bg-dark-bg border border-dark-border rounded-lg text-dark-text placeholder-dark-muted focus:outline-none focus:border-naver-green transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-dark-muted hover:text-dark-text transition"
                  >
                    {showSecretKey ? '숨기기' : '보기'}
                  </button>
                </div>
              </div>

              {/* 테스트 결과 */}
              {testResult && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    testResult.success
                      ? 'bg-green-500/20 text-green-400 border border-green-500'
                      : 'bg-red-500/20 text-red-400 border border-red-500'
                  }`}
                >
                  {testResult.message}
                </div>
              )}

              {/* 도움말 */}
              <div className="text-xs text-dark-muted">
                <p>네이버 광고 API 키는 네이버 검색광고 관리자 페이지에서 발급받을 수 있습니다.</p>
                <a
                  href="https://manage.searchad.naver.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-naver-green hover:underline"
                >
                  네이버 검색광고 바로가기
                </a>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-dark-border">
          <button
            onClick={handleTest}
            disabled={isTesting || isLoading}
            className="px-4 py-2 bg-dark-border hover:bg-dark-hover text-dark-text font-medium rounded-lg transition disabled:opacity-50"
          >
            {isTesting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                테스트 중...
              </span>
            ) : (
              '연결 테스트'
            )}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="px-4 py-2 bg-naver-green hover:bg-naver-light text-white font-medium rounded-lg transition disabled:opacity-50"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                저장 중...
              </span>
            ) : (
              '저장'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(ApiSettingsModal);
