import type { ClaimType, Priority, WorkflowStatus } from './types';

export const WORKFLOW_STATUSES: WorkflowStatus[] = [
  'Yeni Dosya',
  'Föy Bekleniyor',
  'Evrak Bekleniyor',
  'Fotoğraf Bekleniyor',
  'Portal Kontrol',
  'Parça Listesi Bekleniyor',
  'Parça Kodu Bekleniyor',
  'Ön Rapor',
  'Uzman Onayı Bekleniyor',
  'Onarımda',
  'Kapanış Kontrolü',
  'Kapalı'
];

export const DOSYA_DURUMLARI = [
  'İncelemede',
  'Eksik Evrak',
  'Eksik Fotoğraf',
  'Portal Bekliyor',
  'Parça Bekliyor',
  'Uzman Onayı Bekliyor',
  'Onarımda',
  'Kapanışta',
  'Kapalı'
] as const;

export const TEAM_MEMBERS = [
  'Ömer Faruk İşleyen',
  'Enes Özmen',
  'Baran Gürbüz',
  'Berfin Kapar'
] as const;


export const CLAIM_TYPES: readonly ClaimType[] = ['unknown', 'trafik', 'kasko'] as const;
export const PRIORITIES: readonly Priority[] = ['Düşük', 'Normal', 'Yüksek', 'Kritik'] as const;
