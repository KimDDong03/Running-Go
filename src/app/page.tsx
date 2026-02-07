import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Activity, Map, Plus, Trophy, User } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-primary">🏃‍♂️ 러닝고</h1>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌱</span>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {/* Monthly Stats */}
        <Card className="rounded-3xl shadow-lg border-0">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4">📊 이번 달 통계</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">12.5</div>
                <div className="text-sm text-slate-600">km</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">2시간<br/>15분</div>
                <div className="text-sm text-slate-600">시간</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">3</div>
                <div className="text-sm text-slate-600">수집 코스</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Recommended Course */}
        <div>
          <h2 className="text-lg font-semibold mb-3">🎯 오늘의 추천 코스</h2>
          <Link href="/courses/1">
            <Card className="rounded-3xl shadow-lg border-0 overflow-hidden cursor-pointer hover:shadow-xl transition-shadow">
              <div className="h-32 bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                <span className="text-6xl">❤️</span>
              </div>
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg">한강 하트런</h3>
                <div className="flex items-center gap-4 text-sm text-slate-600 mt-1">
                  <span>⭐ 2.3km</span>
                  <span>❤️ 128</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Popular Courses */}
        <div>
          <h2 className="text-lg font-semibold mb-3">🔥 실시간 인기 코스 TOP 3</h2>
          <div className="space-y-3">
            {[
              { name: '한강 별코스', likes: 156, emoji: '⭐' },
              { name: '홍대 강아지', likes: 89, emoji: '🐕' },
              { name: '여의도 하트', likes: 76, emoji: '❤️' },
            ].map((course, i) => (
              <Card key={i} className="rounded-2xl shadow-md border-0">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{course.emoji}</span>
                    <div>
                      <div className="font-medium">{i + 1}. {course.name}</div>
                      <div className="text-sm text-slate-600">⭐ {course.likes}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Link href="/create">
            <Button size="lg" className="w-full h-20 rounded-2xl text-lg">
              <Plus className="w-6 h-6 mr-2" />
              코스 제작
            </Button>
          </Link>
          <Link href="/run">
            <Button size="lg" variant="secondary" className="w-full h-20 rounded-2xl text-lg">
              <Activity className="w-6 h-6 mr-2" />
              러닝 시작
            </Button>
          </Link>
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-6 left-4 right-4 bg-white rounded-full shadow-xl shadow-slate-300/50 h-16 flex items-center justify-around px-2 z-50">
        <Link href="/" className="flex flex-col items-center justify-center w-12 h-12 text-primary">
          <Activity className="w-6 h-6" />
          <span className="text-xs mt-1">홈</span>
        </Link>
        <Link href="/explore" className="flex flex-col items-center justify-center w-12 h-12 text-slate-400">
          <Map className="w-6 h-6" />
          <span className="text-xs mt-1">탐색</span>
        </Link>
        <Link href="/create" className="flex flex-col items-center justify-center w-14 h-14 -mt-4 bg-primary rounded-full text-white shadow-lg shadow-primary/40">
          <Plus className="w-8 h-8" />
        </Link>
        <Link href="/rankings" className="flex flex-col items-center justify-center w-12 h-12 text-slate-400">
          <Trophy className="w-6 h-6" />
          <span className="text-xs mt-1">랭킹</span>
        </Link>
        <Link href="/profile" className="flex flex-col items-center justify-center w-12 h-12 text-slate-400">
          <User className="w-6 h-6" />
          <span className="text-xs mt-1">프로필</span>
        </Link>
      </nav>
    </div>
  );
}
