'use client';

import Image from 'next/image';
import { Heart, MapPin } from 'lucide-react';
import { Difficulty } from '@prisma/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const difficultyColors: Record<Difficulty, string> = {
  EASY: 'bg-[#67c93a] text-[#102449]',
  MEDIUM: 'bg-[#ffb020] text-[#102449]',
  HARD: 'bg-[#ff5a36] text-white',
};

interface MapCourseCardProps {
  id: string;
  title: string;
  totalDistance: number;
  estimatedTime: number;
  likeCount: number;
  centerLat: number;
  centerLng: number;
  previewUrl: string;
  difficulty: Difficulty;
  isSelected: boolean;
  isEnglish: boolean;
  difficultyText: string;
  distanceText: string;
  isLiked: boolean;
  onSelect: (courseId: string, centerLat: number, centerLng: number) => void;
  onToggleLike: (courseId: string, fallbackLikeCount: number) => void;
}

export function MapCourseCard({
  id,
  title,
  totalDistance,
  estimatedTime,
  likeCount,
  centerLat,
  centerLng,
  previewUrl,
  difficulty,
  isSelected,
  isEnglish,
  difficultyText,
  distanceText,
  isLiked,
  onSelect,
  onToggleLike,
}: MapCourseCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="w-full text-left"
      onClick={() => onSelect(id, centerLat, centerLng)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(id, centerLat, centerLng);
        }
      }}
    >
      <Card className={`rg-interactive-card rounded-2xl border bg-white/80 shadow-[0_16px_32px_-26px_rgba(15,23,42,0.55)] overflow-hidden ${isSelected ? 'rg-selected border-[#1d8fff]/45 ring-2 ring-[#1d8fff]/20' : isLiked ? 'border-[#ffb020]/40 ring-1 ring-[#ffb020]/25' : 'border-white/70'}`}>
        <CardContent className="p-3">
          <div className="flex gap-3">
            <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-[#e5f3ff] via-white to-[#f2fbe8]">
              <Image
                src={previewUrl}
                alt={isEnglish ? `${title} map` : `${title} 지도`}
                fill
                sizes="120px"
                quality={70}
                unoptimized
                className="object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
                {isLiked ? <Heart className="h-3.5 w-3.5 shrink-0 fill-[#ff5a36] text-[#ff5a36]" /> : null}
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                <MapPin className="h-3.5 w-3.5" />
                <span>{totalDistance.toFixed(1)}km</span>
                <span>•</span>
                <span>{estimatedTime}{isEnglish ? ' min' : '분'}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{isEnglish ? 'From my location' : '내 위치에서'} {distanceText}</p>
              <div className="mt-2 flex items-center gap-2">
                <Badge className={`${difficultyColors[difficulty]} rounded-full text-[11px]`}>
                  {difficultyText}
                </Badge>
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-full px-1 py-0.5 text-xs text-slate-600 transition-colors hover:bg-slate-100/90"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleLike(id, likeCount);
                  }}
                  aria-label={isEnglish ? 'Toggle like' : '좋아요 토글'}
                >
                  <Heart className={`h-3.5 w-3.5 ${isLiked ? 'fill-[#ff5a36] text-[#ff5a36]' : ''}`} />
                  <span>{likeCount}</span>
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
