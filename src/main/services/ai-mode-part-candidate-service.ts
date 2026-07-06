/**
 * v0.6.x — AI İşçilik v3.6: Onaylı AI Mode parça kodu aday servisi (yerel store yönetimi).
 * Yalnız kullanıcı onaylı adayı yerel depoya yazar; Excel'e/D sütununa/takip.json'a hiçbir şey yazmaz.
 */
import { AiModePartCandidateStoreFile } from '../local-cache/ai-mode-part-candidate-store-file';
import {
  listUsableCandidates,
  mergeApprovedCandidates,
  normalizeAiModeCandidateEntry,
  removeCandidate,
  replaceDuplicateAiModeCandidateWithApproval,
  setCandidateActive
} from '../../shared/labor/ai-mode-part-candidate-store';
import type {
  AiModePartCandidateApproveResult,
  AiModePartCandidateStoreState,
  ApprovedAiModePartCandidateEntry
} from '../../shared/labor/ai-mode-part-candidate-store-types';
import type { AiModeCandidateReplaceArgs, ExpertLearningIdArg } from '../../shared/ipc-contract';
import type { IpcDomainContext } from './ipc-domain-services';

export class AiModePartCandidateService {
  constructor(private readonly context: IpcDomainContext) {}

  private store(): AiModePartCandidateStoreFile {
    return new AiModePartCandidateStoreFile(this.context.cache.cacheRoot);
  }

  private toState(entries: ApprovedAiModePartCandidateEntry[], corrupt: boolean): AiModePartCandidateStoreState {
    const activeCount = entries.filter((e) => e.isActive).length;
    return { entries, corrupt, activeCount, passiveCount: entries.length - activeCount };
  }

  async list(): Promise<AiModePartCandidateStoreState> {
    const { entries, corrupt } = await this.store().read();
    return this.toState(entries, corrupt);
  }

  /** Kullanıcının onayladığı adayları yerel depoya yazar; duplicate'leri atlar. Onaysız/bozuk yazılmaz. */
  async approve(candidates: unknown): Promise<AiModePartCandidateApproveResult> {
    if (!Array.isArray(candidates) || candidates.length === 0) throw new Error('Onaylanacak aday bulunamadı.');
    const approved: ApprovedAiModePartCandidateEntry[] = [];
    for (const raw of candidates) {
      const entry = normalizeAiModeCandidateEntry(raw);
      if (entry) approved.push({ ...entry, approvedByUser: true, isActive: true });
    }
    if (approved.length === 0) throw new Error('Geçerli aday bulunamadı (parça adı/aday kod eksik).');
    const { entries } = await this.store().read();
    const merged = mergeApprovedCandidates(entries, approved);
    await this.store().write(merged.entries);
    return { ...this.toState(merged.entries, false), added: merged.added, skippedDuplicates: merged.skippedDuplicates };
  }

  /** Kullanıcı onaylı duplicate yenileme: eski adayı pasifleştirir (silmez), yeni adayı aktif ekler. */
  async replaceDuplicate(args: AiModeCandidateReplaceArgs): Promise<AiModePartCandidateApproveResult> {
    const duplicateId = typeof args?.duplicateId === 'string' ? args.duplicateId.trim() : '';
    if (!duplicateId) throw new Error('Yenilenecek mevcut kayıt kimliği (duplicateId) gereklidir.');
    const entry = normalizeAiModeCandidateEntry(args?.entry);
    if (!entry) throw new Error('Geçerli aday bulunamadı (parça adı/aday kod eksik).');
    const { entries } = await this.store().read();
    const result = replaceDuplicateAiModeCandidateWithApproval(entries, { ...entry, approvedByUser: true, isActive: true }, duplicateId);
    if (!result.replaced) throw new Error(result.skippedReason ?? 'Yenileme yapılamadı.');
    await this.store().write(result.entries);
    return { ...this.toState(result.entries, false), added: 1, skippedDuplicates: 0 };
  }

  async deactivate(args: ExpertLearningIdArg): Promise<AiModePartCandidateStoreState> {
    const next = setCandidateActive((await this.store().read()).entries, this.requireId(args), false);
    await this.store().write(next);
    return this.toState(next, false);
  }

  async reactivate(args: ExpertLearningIdArg): Promise<AiModePartCandidateStoreState> {
    const next = setCandidateActive((await this.store().read()).entries, this.requireId(args), true);
    await this.store().write(next);
    return this.toState(next, false);
  }

  async delete(args: ExpertLearningIdArg): Promise<AiModePartCandidateStoreState> {
    const next = removeCandidate((await this.store().read()).entries, this.requireId(args));
    await this.store().write(next);
    return this.toState(next, false);
  }

  /** AI İşçilik önizlemesine verilecek AKTIF + onaylı adaylar (matcher girdisi). */
  async usableEntries(): Promise<ApprovedAiModePartCandidateEntry[]> {
    return listUsableCandidates((await this.store().read()).entries);
  }

  private requireId(args: ExpertLearningIdArg): string {
    const id = args && typeof args === 'object' ? args.id : undefined;
    if (typeof id !== 'string' || !id.trim()) throw new Error('Geçerli bir kayıt kimliği (id) gereklidir.');
    return id.trim();
  }
}
