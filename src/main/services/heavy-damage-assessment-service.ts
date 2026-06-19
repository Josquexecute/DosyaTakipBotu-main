import type {
  CaseIndexItem,
  TrackingWriteResult
} from '../../shared/types';
import type {
  HeavyDamageAssessmentPreview,
  HeavyDamageAssessmentRecord,
  HeavyDamageClearArgs,
  HeavyDamageGenerateNoteArgs,
  HeavyDamageGetArgs,
  HeavyDamagePartInput,
  HeavyDamagePreviewArgs,
  HeavyDamageSaveArgs
} from '../../shared/heavy-damage-types';
import { buildHeavyDamagePreview, generateHeavyDamageAssessmentNote, normalizeHeavyDamageAssessmentRecord } from '../../shared/heavy-damage-rules';
import { assertSafeCasePath } from '../security';
import { nowIso } from '../tracking/tracking-defaults';
import type { IpcDomainContext } from './ipc-domain-services';
import type { CasesQueryService } from './cases-query-service';
import { HeavyDamageNoteService } from './heavy-damage-note-service';

const MAX_INPUTS = 120;

export class HeavyDamageAssessmentService {
  private readonly notes = new HeavyDamageNoteService();

  constructor(private readonly context: IpcDomainContext, private readonly cases: CasesQueryService) {}

  async preview(args: HeavyDamagePreviewArgs): Promise<HeavyDamageAssessmentPreview> {
    const item = await this.loadCase(args.folderPath);
    const settings = await this.context.getSettings();
    const inputs = collectHeavyDamageInputs(item, args.manualText);
    return buildHeavyDamagePreview({
      folderPath: item.folderPath,
      plate: item.plate,
      officeFileNo: item.officeFileNo || item.dosyaNo || '',
      assessedBy: settings.activeUser || 'Sistem',
      inputs,
      ...(Number.isFinite(args.repairCost) ? { repairCost: Number(args.repairCost) } : {}),
      ...(Number.isFinite(args.marketValue) ? { marketValue: Number(args.marketValue) } : {})
    });
  }

  async get(args: HeavyDamageGetArgs): Promise<HeavyDamageAssessmentRecord | null> {
    const item = await this.loadCase(args.folderPath);
    return item.tracking.heavyDamageAssessment ?? null;
  }

  async save(args: HeavyDamageSaveArgs): Promise<TrackingWriteResult> {
    if (args.userConfirmed !== true) throw new Error('Kullanıcı son onayı olmadan ağır hasar değerlendirmesi kaydedilemez.');
    const item = await this.loadCase(args.folderPath);
    const settings = await this.context.getSettings();
    await this.cases.assertMutationAllowed(args.folderPath, args.allowClosedMutation === true);
    const record = normalizeHeavyDamageAssessmentRecord({
      ...args.assessment,
      folderPath: item.folderPath,
      plate: item.plate,
      officeFileNo: item.officeFileNo || item.dosyaNo || args.assessment.officeFileNo || '',
      assessedAt: nowIso(),
      assessedBy: settings.activeUser || args.assessment.assessedBy || 'Sistem',
      userApproved: true
    });
    const note = this.notes.generate(record);
    const result = await this.context.tracking.mutate(args.folderPath, args.expectedRevision, this.cases.expectedWriteIdFor(args), settings.activeUser, (tracking) => {
      tracking.heavyDamageAssessment = record;
      tracking.heavyDamage.enabled = record.summary.riskLevel !== 'low' || record.summary.totalScore > 0;
      tracking.heavyDamage.skor = Math.round(record.summary.totalScore);
      tracking.heavyDamage.not = trimNote([note, record.userNotes].filter(Boolean).join('\n\n'));
    });
    await this.cases.refreshMutationResult(args.folderPath, result);
    return result;
  }

  async clear(args: HeavyDamageClearArgs): Promise<TrackingWriteResult> {
    const item = await this.loadCase(args.folderPath);
    const settings = await this.context.getSettings();
    await this.cases.assertMutationAllowed(item.folderPath, args.allowClosedMutation === true);
    const result = await this.context.tracking.mutate(item.folderPath, args.expectedRevision, this.cases.expectedWriteIdFor(args), settings.activeUser, (tracking) => {
      delete tracking.heavyDamageAssessment;
      delete tracking.heavyDamage.skor;
      tracking.heavyDamage.not = '';
      tracking.heavyDamage.enabled = false;
    });
    await this.cases.refreshMutationResult(item.folderPath, result);
    return result;
  }

  async generateNote(args: HeavyDamageGenerateNoteArgs): Promise<string> {
    return generateHeavyDamageAssessmentNote(args.assessment);
  }

  private async loadCase(folderPath: string): Promise<CaseIndexItem> {
    const settings = await this.context.getSettings();
    assertSafeCasePath(folderPath, settings.rootPath);
    const item = await this.cases.get(folderPath);
    if (!item) throw new Error('Ağır hasar değerlendirmesi için seçili dosya bulunamadı.');
    return item;
  }
}

function collectHeavyDamageInputs(item: CaseIndexItem, manualText = ''): HeavyDamagePartInput[] {
  const inputs: HeavyDamagePartInput[] = [];
  for (const line of splitLines(manualText)) inputs.push({ name: line, source: 'manual' });
  for (const note of item.tracking.notes) {
    for (const line of splitLines(note.text)) inputs.push({ name: line, source: 'tracking-note' });
  }
  for (const line of splitLines(item.tracking.labor.not)) inputs.push({ name: line, source: 'labor-note' });
  for (const line of splitLines(item.tracking.heavyDamage.not)) inputs.push({ name: line, source: 'heavy-note' });
  for (const legacy of item.documentAnalysis.legacyNotes ?? []) {
    for (const line of splitLines(legacy.text)) inputs.push({ name: line, source: 'legacy-note' });
  }
  for (const group of item.folderContents.groups ?? []) {
    for (const file of group.sampleFiles) inputs.push({ name: file, source: 'folder', note: group.key });
  }
  const unique = new Map<string, HeavyDamagePartInput>();
  for (const input of inputs) {
    const cleaned = cleanInput(input.name);
    if (!cleaned) continue;
    const key = `${cleaned.toLocaleUpperCase('tr-TR')}::${input.source}`;
    if (!unique.has(key)) unique.set(key, { ...input, name: cleaned });
    if (unique.size >= MAX_INPUTS) break;
  }
  if (unique.size === 0) {
    unique.set('kontrol::system', {
      name: 'Yapısal kritik parça bilgisi bulunamadı',
      source: 'system',
      note: 'Kullanıcı parça/hasar listesini manuel girmeli veya dosya notlarını tamamlamalı.'
    });
  }
  return [...unique.values()];
}

function splitLines(text: string): string[] {
  return String(text || '')
    .split(/\r?\n|;|\u2022/g)
    .map(cleanInput)
    .filter(Boolean);
}

function cleanInput(text: string): string {
  return text.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function trimNote(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000);
}
