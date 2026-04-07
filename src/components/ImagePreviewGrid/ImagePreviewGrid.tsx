import { useState } from 'react';

// URL 내 유니코드 이스케이프(\u002F 등)를 정상 문자로 변환
function normalizeImageUrl(url: string): string {
  if (!url) return '';
  let normalized = url.replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  normalized = normalized
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  return normalized.trim();
}

interface ImagePreviewItem {
  url: string;
  alt?: string;
  sourceType?: string; // e.g., "naver", "external", "paid", "free"
  onRemove?: () => void;
}

interface ImagePreviewGridProps {
  images: ImagePreviewItem[];
  title?: string;
  maxHeight?: string;
  showSourceBadge?: boolean;
  removable?: boolean;
  emptyMessage?: string;
}

// Source type badge color mapping
function getSourceBadgeStyle(sourceType?: string): { bg: string; text: string; label: string } {
  switch (sourceType) {
    case 'naver':
      return { bg: 'bg-green-500/80', text: 'text-white', label: '네이버' };
    case 'external':
      return { bg: 'bg-orange-500/80', text: 'text-white', label: '외부' };
    case 'paid':
      return { bg: 'bg-blue-500/80', text: 'text-white', label: '유료' };
    case 'free':
      return { bg: 'bg-gray-500/80', text: 'text-white', label: '무료' };
    default:
      return { bg: 'bg-gray-500/60', text: 'text-white', label: '' };
  }
}

export default function ImagePreviewGrid({
  images,
  title,
  maxHeight = 'max-h-64',
  showSourceBadge = false,
  removable = false,
  emptyMessage = '이미지가 없습니다.',
}: ImagePreviewGridProps) {
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());
  const [loadingImages, setLoadingImages] = useState<Set<number>>(() => {
    const set = new Set<number>();
    images.forEach((_, i) => set.add(i));
    return set;
  });

  const handleImageError = (index: number) => {
    setFailedImages(prev => new Set(prev).add(index));
    setLoadingImages(prev => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const handleImageLoad = (index: number) => {
    setLoadingImages(prev => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  if (images.length === 0) {
    return (
      <div className="text-center py-6 text-dark-muted text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div>
      {title && (
        <h3 className="text-sm font-medium text-dark-muted mb-3">{title}</h3>
      )}
      <div className={`flex flex-wrap gap-3 overflow-y-auto ${maxHeight} p-1`}>
        {images.map((img, idx) => {
          const isFailed = failedImages.has(idx);
          const isLoading = loadingImages.has(idx);
          const badge = getSourceBadgeStyle(img.sourceType);

          return (
            <div
              key={idx}
              className="relative group w-24 h-24 rounded-lg overflow-hidden border border-dark-border bg-dark-bg flex-shrink-0"
            >
              {/* Loading state */}
              {isLoading && !isFailed && (
                <div className="absolute inset-0 flex items-center justify-center bg-dark-bg z-10">
                  <div className="w-5 h-5 border-2 border-naver-green border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}

              {/* Image or fallback */}
              {!isFailed ? (
                <img
                  src={normalizeImageUrl(img.url)}
                  alt={img.alt || `이미지 ${idx + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => handleImageError(idx)}
                  onLoad={() => handleImageLoad(idx)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-dark-bg">
                  <span className="text-dark-muted text-xs text-center px-1">로드 실패</span>
                </div>
              )}

              {/* Source type badge */}
              {showSourceBadge && img.sourceType && badge.label && (
                <div className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                  {badge.label}
                </div>
              )}

              {/* Remove button */}
              {removable && img.onRemove && (
                <button
                  onClick={img.onRemove}
                  className="absolute top-1 right-1 w-5 h-5 bg-red-500/80 rounded-full flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  title="이미지 제거"
                >
                  x
                </button>
              )}

              {/* Hover: show alt text */}
              {img.alt && (
                <div className="absolute inset-x-0 bottom-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                  <div className="text-[10px] text-gray-300 truncate">{img.alt}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
