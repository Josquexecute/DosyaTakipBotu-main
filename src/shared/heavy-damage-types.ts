export type HeavyDamageDamageType = 'change' | 'repair' | 'unknown';
export type HeavyDamageRepairSeverity = 'none' | 'light' | 'medium' | 'heavy' | 'unknown';
export type HeavyDamageConfidence = 'Yüksek' | 'Orta' | 'Düşük';
export type HeavyDamageRiskLevel = 'low' | 'review' | 'threshold-exceeded';
export type HeavyDamageSource = 'manual' | 'tracking-note' | 'labor-note' | 'heavy-note' | 'legacy-note' | 'folder' | 'system';
export type HeavyDamageOperation = 'replacement' | 'repair' | 'unknown';

export interface HeavyDamageGuideRule {
  id: string;
  displayName: string;
  changeScore?: number;
  repairScores?: Partial<Record<Exclude<HeavyDamageRepairSeverity, 'none' | 'unknown'>, number>>;
  questions: string[];
  directThreshold?: boolean;
  expertReviewOnly?: boolean;
}

export interface HeavyDamagePartInput {
  name: string;
  source: HeavyDamageSource;
  note?: string;
  operation?: HeavyDamageOperation;
  structuralConfirmed?: boolean;
}

export interface HeavyDamageAssessmentRow {
  id: string;
  rowNumber: number;
  sourcePartName: string;
  source: HeavyDamageSource;
  normalizedPartName: string;
  guideCategory: string;
  guideCategoryLabel: string;
  damageType: HeavyDamageDamageType;
  repairSeverity: HeavyDamageRepairSeverity;
  score: number;
  confidence: HeavyDamageConfidence;
  needsReview: boolean;
  reason: string;
  questions: string[];
  inScope: boolean;
  affectsThreshold: boolean;
  directThreshold: boolean;
  structuralConfirmed?: boolean;
  structuralConfirmationRequired?: boolean;
  scoreGroupKey?: string;
  supportOnly?: boolean;
  userEdited?: boolean;
  userNote?: string;
}

export interface HeavyDamageAssessmentSummary {
  totalScore: number;
  threshold: number;
  criticalPartCount: number;
  thresholdExceeded: boolean;
  directThresholdExceeded: boolean;
  riskLevel: HeavyDamageRiskLevel;
  riskLabel: string;
  repairCost?: number;
  marketValue?: number;
  repairToMarketRatio?: number;
  economicThresholdExceeded: boolean;
  needsReviewRows: number;
  lowConfidenceRows: number;
  outOfScopeRows: number;
  groupedScoreAdjustments: number;
  aiSummary: string;
  warnings: string[];
}

export interface HeavyDamageAssessmentPreview {
  schemaVersion: 1;
  folderPath: string;
  plate: string;
  officeFileNo: string;
  assessedAt: string;
  assessedBy: string;
  sourceInputs: HeavyDamagePartInput[];
  rows: HeavyDamageAssessmentRow[];
  summary: HeavyDamageAssessmentSummary;
  userApproved: false;
  userNotes: string;
}

export interface HeavyDamageAssessmentRecord extends Omit<HeavyDamageAssessmentPreview, 'userApproved'> {
  userApproved: boolean;
}

export interface HeavyDamageRowEdit {
  guideCategory?: string;
  damageType?: HeavyDamageDamageType;
  repairSeverity?: HeavyDamageRepairSeverity;
  score?: number;
  needsReview?: boolean;
  structuralConfirmed?: boolean;
  userNote?: string;
}

export interface HeavyDamagePreviewArgs {
  folderPath: string;
  manualText?: string;
  repairCost?: number;
  marketValue?: number;
}

export interface HeavyDamageSaveArgs {
  folderPath: string;
  expectedRevision: number;
  expectedWriteId?: string;
  allowClosedMutation?: boolean;
  assessment: HeavyDamageAssessmentRecord;
  userConfirmed: boolean;
}

export interface HeavyDamageClearArgs {
  folderPath: string;
  expectedRevision: number;
  expectedWriteId?: string;
  allowClosedMutation?: boolean;
}

export interface HeavyDamageGetArgs {
  folderPath: string;
}

export interface HeavyDamageGenerateNoteArgs {
  assessment: HeavyDamageAssessmentRecord | HeavyDamageAssessmentPreview;
}
