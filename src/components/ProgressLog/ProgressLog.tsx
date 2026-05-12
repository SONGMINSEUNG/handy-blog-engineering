import { useEffect, useRef } from 'react';
import { AnalysisStatus } from '../../services/api';

interface ProgressLogProps {
  status: AnalysisStatus;
  keywords: string[];
}

export default function ProgressLog({ status, keywords }: ProgressLogProps) {
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [status.logs]);

  return (
    <div className="flex-1 flex flex-col p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2">분석 진행 중</h2>
        <p className="text-gray-900 dark:text-gray-400">
          {keywords.length}개 키워드 분석 중...
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-900 dark:text-gray-400">{status.current_task}</span>
          <span className="text-sm font-medium text-naver-green">{Math.round(status.progress)}%</span>
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full naver-gradient transition-all duration-500 ease-out"
            style={{ width: `${status.progress}%` }}
          />
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="glass-card p-4">
          <div className="text-2xl font-bold text-naver-green">{keywords.length}</div>
          <div className="text-sm text-gray-900 dark:text-gray-400">총 키워드</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-2xl font-bold text-amber-600 dark:text-yellow-400">
            {status.status === 'collecting' ? '수집 중' : status.status === 'analyzing' ? '분석 중' : status.status}
          </div>
          <div className="text-sm text-gray-900 dark:text-gray-400">현재 단계</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-2xl font-bold text-blue-400">{status.logs.length}</div>
          <div className="text-sm text-gray-900 dark:text-gray-400">로그 항목</div>
        </div>
      </div>

      {/* Log Container */}
      <div className="flex-1 glass-card overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 pulse-animation"></div>
          <span className="text-sm font-medium">실시간 로그</span>
        </div>
        <div
          ref={logContainerRef}
          className="flex-1 overflow-y-auto p-4 font-mono text-sm"
        >
          {status.logs.map((log, index) => (
            <div
              key={index}
              className={`py-1 ${
                log.includes('오류') || log.includes('실패')
                  ? 'text-red-400'
                  : log.includes('완료')
                    ? 'text-green-400'
                    : log.startsWith('=====')
                      ? 'text-amber-600 dark:text-yellow-400 font-bold mt-2'
                      : 'text-gray-900 dark:text-gray-100'
              }`}
            >
              <span className="text-gray-900 dark:text-gray-400 mr-2">[{String(index + 1).padStart(3, '0')}]</span>
              {log}
            </div>
          ))}
          {status.status === 'collecting' || status.status === 'analyzing' ? (
            <div className="py-1 text-gray-900 dark:text-gray-400 flex items-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-naver-green border-t-transparent rounded-full animate-spin"></span>
              처리 중...
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
