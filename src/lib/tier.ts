export type Tier = {
  level: number
  name: string
  icon: string
  color: string
  threshold: number
  nextThreshold: number | null
}

const TIERS: Tier[] = [
  { level: 1, name: '흙', icon: '🌱', color: '#8B4513', threshold: 1, nextThreshold: 5 },
  { level: 2, name: '브론즈', icon: '🥉', color: '#CD7F32', threshold: 5, nextThreshold: 15 },
  { level: 3, name: '실버', icon: '🥈', color: '#C0C0C0', threshold: 15, nextThreshold: 35 },
  { level: 4, name: '골드', icon: '🥇', color: '#FFD700', threshold: 35, nextThreshold: 70 },
  { level: 5, name: '플래티넘', icon: '💎', color: '#40E0D0', threshold: 70, nextThreshold: 120 },
  { level: 6, name: '다이아', icon: '💠', color: '#00BFFF', threshold: 120, nextThreshold: 200 },
  { level: 7, name: '마스터', icon: '👑', color: '#4169E1', threshold: 200, nextThreshold: 350 },
  { level: 8, name: '그랜드마스터', icon: '👑✨', color: '#FFD700', threshold: 350, nextThreshold: 500 },
  { level: 9, name: '러닝고', icon: '👑🌟', color: '#FF6B6B', threshold: 500, nextThreshold: null },
]

export const getTier = (collectionCount: number): Tier => {
  if (collectionCount >= 500) return TIERS[8]
  if (collectionCount >= 350) return TIERS[7]
  if (collectionCount >= 200) return TIERS[6]
  if (collectionCount >= 120) return TIERS[5]
  if (collectionCount >= 70) return TIERS[4]
  if (collectionCount >= 35) return TIERS[3]
  if (collectionCount >= 15) return TIERS[2]
  if (collectionCount >= 5) return TIERS[1]
  return TIERS[0]
}
