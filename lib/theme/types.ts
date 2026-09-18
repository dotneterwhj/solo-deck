export type ThemeId =
  | 'dark'
  | 'midnight'
  | 'aurora'
  | 'cyberpunk'
  | 'titanium'
  | 'light'

export interface ThemeConfig {
  id: ThemeId
  name: string
  label: string
  description: string
  category: 'dark' | 'light'
  preview: {
    bg: string
    card: string
    primary: string
    border: string
    accent: string
  }
  badge?: string
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'titanium',
    name: '钛金工矿',
    label: 'Titanium Amber',
    description: '工业拉丝冷灰基底搭配航天安全琥珀金仪表，硬核工控质感',
    category: 'dark',
    preview: {
      bg: '#1c2028',
      card: '#272d39',
      primary: '#f59e0b',
      border: '#404859',
      accent: '#333b4b',
    },
    badge: '默认',
  },
  {
    id: 'midnight',
    name: '星际极夜蓝',
    label: 'Midnight Navy',
    description: '深邃蔚蓝深空星海，科技青蓝冷光漫射，宏大静谧沉稳',
    category: 'dark',
    preview: {
      bg: '#0a162b',
      card: '#112340',
      primary: '#00d8ff',
      border: '#1d3b6a',
      accent: '#183057',
    },
    badge: '热门',
  },
  {
    id: 'aurora',
    name: '极光秘境',
    label: 'Aurora Emerald',
    description: '暗夜冷萃翡翠玉石，北欧极光荧光漫射，清新宁静高雅',
    category: 'dark',
    preview: {
      bg: '#081d17',
      card: '#0f2d25',
      primary: '#00ffa3',
      border: '#194a3d',
      accent: '#143d32',
    },
  },
  {
    id: 'cyberpunk',
    name: '赛博深霓',
    label: 'Cyberpunk Purple',
    description: '深邃暗夜幻紫与高饱和霓虹品红，赛博朋克未来感拉满',
    category: 'dark',
    preview: {
      bg: '#170b28',
      card: '#251240',
      primary: '#f43f5e',
      border: '#4e1e7e',
      accent: '#37165c',
    },
  },
  {
    id: 'dark',
    name: '极客暗黑',
    label: 'Obsidian Dark',
    description: '纯粹黑曜石灰黑，极简护眼低疲劳，黑曜终端沉浸感',
    category: 'dark',
    preview: {
      bg: '#0a0d14',
      card: '#121620',
      primary: '#10b981',
      border: '#232938',
      accent: '#191f2d',
    },
  },
  {
    id: 'light',
    name: '纯净白昼',
    label: 'Pure Light',
    description: '清爽通透的高对比日间模式，纯白卡片配合日光蓝，明亮清晰',
    category: 'light',
    preview: {
      bg: '#f1f5f9',
      card: '#ffffff',
      primary: '#0284c7',
      border: '#cbd5e1',
      accent: '#e0f2fe',
    },
  },
]
