import { useState, KeyboardEvent, CompositionEvent } from 'react';

interface KeywordInputProps {
  keywords: string[];
  onKeywordsChange: (keywords: string[]) => void;
}

export default function KeywordInput({ keywords, onKeywordsChange }: KeywordInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 한글 IME 조합 중이면 무시
    if (isComposing) return;

    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      if (!keywords.includes(inputValue.trim())) {
        onKeywordsChange([...keywords, inputValue.trim()]);
      }
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && keywords.length > 0) {
      onKeywordsChange(keywords.slice(0, -1));
    }
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = (_e: CompositionEvent<HTMLInputElement>) => {
    setIsComposing(false);
  };

  const removeKeyword = (index: number) => {
    onKeywordsChange(keywords.filter((_, i) => i !== index));
  };

  return (
    <div className="glass-card p-6">
      <label className="block text-sm font-medium text-dark-muted mb-3">
        분석할 키워드 ({keywords.length}개)
      </label>

      <div className="flex flex-wrap gap-2 p-4 bg-dark-bg rounded-lg border border-dark-border min-h-[80px] w-full">
        {keywords.map((keyword, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-naver-green/20 text-naver-green rounded-full text-sm"
          >
            {keyword}
            <button
              onClick={() => removeKeyword(index)}
              className="hover:text-dark-text transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={keywords.length === 0 ? "키워드를 입력하고 Enter를 누르세요..." : ""}
          className="flex-1 min-w-[200px] bg-transparent outline-none text-dark-text placeholder-dark-muted"
        />
      </div>

      <p className="text-xs text-dark-muted mt-2">
        Enter로 키워드 추가, Backspace로 마지막 키워드 삭제
      </p>
    </div>
  );
}
