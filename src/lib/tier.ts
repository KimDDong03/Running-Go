export type Tier = {
  level: number
  name: string
  icon: string
  color: string
  threshold: number
  nextThreshold: number | null
}

type TierTemplate = Omit<Tier, 'name'>;
type TierLocale = 'ko' | 'en';

const TIER_TEMPLATES: TierTemplate[] = [
  { level: 1, icon: '🌱', color: '#8B4513', threshold: 1, nextThreshold: 5 },
  { level: 2, icon: '🥉', color: '#CD7F32', threshold: 5, nextThreshold: 15 },
  { level: 3, icon: '🥈', color: '#C0C0C0', threshold: 15, nextThreshold: 35 },
  { level: 4, icon: '🥇', color: '#FFD700', threshold: 35, nextThreshold: 70 },
  { level: 5, icon: '💎', color: '#40E0D0', threshold: 70, nextThreshold: 120 },
  { level: 6, icon: '💠', color: '#00BFFF', threshold: 120, nextThreshold: 200 },
  { level: 7, icon: '👑', color: '#4169E1', threshold: 200, nextThreshold: 350 },
  { level: 8, icon: '👑✨', color: '#FFD700', threshold: 350, nextThreshold: 500 },
  { level: 9, icon: '👑🌟', color: '#FF6B6B', threshold: 500, nextThreshold: null },
]

const COLLECTOR_NAMES = [
  '새싹 탐험가',
  '브론즈 탐험가',
  '실버 탐험가',
  '골드 탐험가',
  '플래티넘 탐험가',
  '다이아 탐험가',
  '마스터 탐험가',
  '그랜드 탐험가',
  '러닝고 탐험왕',
];

const CREATOR_NAMES = [
  '새싹 설계자',
  '브론즈 설계자',
  '실버 설계자',
  '골드 설계자',
  '플래티넘 설계자',
  '다이아 설계자',
  '마스터 설계자',
  '그랜드 설계자',
  '러닝고 설계왕',
];

const COLLECTOR_NAMES_EN = [
  'Seed Explorer',
  'Bronze Explorer',
  'Silver Explorer',
  'Gold Explorer',
  'Platinum Explorer',
  'Diamond Explorer',
  'Master Explorer',
  'Grand Explorer',
  'Running-Go Explorer King',
];

const CREATOR_NAMES_EN = [
  'Seed Architect',
  'Bronze Architect',
  'Silver Architect',
  'Gold Architect',
  'Platinum Architect',
  'Diamond Architect',
  'Master Architect',
  'Grand Architect',
  'Running-Go Architect King',
];

const getTierIndexByCount = (count: number) => {
  if (count >= 500) return 8;
  if (count >= 350) return 7;
  if (count >= 200) return 6;
  if (count >= 120) return 5;
  if (count >= 70) return 4;
  if (count >= 35) return 3;
  if (count >= 15) return 2;
  if (count >= 5) return 1;
  return 0;
};

const getTierNames = (koNames: string[], enNames: string[], locale: TierLocale) => {
  return locale === 'en' ? enNames : koNames;
};

const buildTier = (count: number, names: string[]): Tier => {
  const index = getTierIndexByCount(count);
  const template = TIER_TEMPLATES[index];
  return {
    ...template,
    name: names[index],
  };
};

export const getCollectorTier = (collectionCount: number, locale: TierLocale = 'ko'): Tier => {
  return buildTier(collectionCount, getTierNames(COLLECTOR_NAMES, COLLECTOR_NAMES_EN, locale));
};

export const getCreatorTier = (createdCount: number, locale: TierLocale = 'ko'): Tier => {
  return buildTier(createdCount, getTierNames(CREATOR_NAMES, CREATOR_NAMES_EN, locale));
};

export const getTier = (collectionCount: number, locale: TierLocale = 'ko'): Tier => getCollectorTier(collectionCount, locale);
