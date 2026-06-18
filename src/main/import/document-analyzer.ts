import fs from 'node:fs/promises';
import path from 'node:path';
import type { ClaimType, DocumentAnalysis, DocumentOcrStatus, DocumentPlateCheck, DocumentRequirement } from '../../shared/types';
import { KASKO_REQUIREMENTS, TRAFFIC_REQUIREMENTS } from '../../shared/document-rules';
import { TRACKING_FOLDER_NAME } from '../../shared/constants';
import { normalizeSearch, plateKey, safeFileDisplayName } from '../../shared/turkish';
import { isPcloudConflictFile } from '../storage/conflict-file-detector';
import { findCaseSubfolder, listFilesRecursive } from '../scanner/case-folder-utils';
import { extractPdfText } from './pdf-text';
import { ocrPdfFirstPage } from './ocr';
import { readLegacyNotes } from './legacy-notes';

interface NormalizedDocumentName {
  displayName: string;
  normalizedName: string;
  filePath: string;
}

export async function analyzeDocuments(caseFolderPath: string, claimTypeOverride?: ClaimType, expectedPlate = ''): Promise<DocumentAnalysis> {
  const evrak = await findCaseSubfolder(caseFolderPath, 'EVRAK');
  const listing = evrak.exists ? await listFilesRecursive(evrak.path) : { exists: false, files: [] as string[] };
  const legacyNotes = await readLegacyNotes(caseFolderPath);
  const documents = listing.files.map((file) => {
    const relativeName = safeFileDisplayName(path.relative(evrak.path, file) || path.basename(file));
    return { displayName: relativeName, normalizedName: normalizeSearch(relativeName), filePath: file } satisfies NormalizedDocumentName;
  });
  const normalized = documents.map((item) => item.normalizedName);
  const displayNames = documents.map((item) => item.displayName);
  const inferredClaimType = inferClaimType(normalized);
  const claimType = claimTypeOverride && claimTypeOverride !== 'unknown' ? claimTypeOverride : inferredClaimType;
  const notice = detectClaimNotice(documents);
  const plateCheck = await checkZararGorenPlate(documents, notice.files, expectedPlate);
  const trackingConflictFiles = await listTrackingConflictFiles(caseFolderPath);
  const conflictFiles = [...displayNames.filter(isPcloudConflictFile), ...trackingConflictFiles];
  const requirements = buildRequirements(claimType, documents);
  const missingCritical = requirements.filter((r) => !r.found).map((r) => r.label);
  const counterpartyPolicyCandidate = detectCounterpartyPolicyCandidate(normalized);
  const warnings: string[] = [];
  if (!listing.exists) warnings.push('EVRAK klasörü bulunamadı veya okunamadı.');
  if (conflictFiles.length > 0) warnings.push('pCloud çakışma/kopya dosyası tespit edildi. Ana veri gibi okunmadı.');
  if (claimType === 'unknown') warnings.push('Dosya tipi dosya adlarından net anlaşılamadı. Trafik/kasko seçimi kullanıcı tarafından doğrulanmalı.');
  if (claimTypeOverride && claimTypeOverride !== 'unknown' && claimTypeOverride !== inferredClaimType) warnings.push('Dosya tipi kullanıcı seçimiyle uygulanıyor. Program nihai dosya türü kararı vermez.');
  if (counterpartyPolicyCandidate) warnings.push('Karşı taraf poliçesi olabilecek belge var. Rücu açısından kullanıcı doğrulaması gerekir.');
  if (requirements.some((r) => r.key === 'tramer-sonucu' && !r.found)) warnings.push('Zabıtsız KTT/Beyan dosyasında Tramer sonucu eksik görünüyor; kullanıcı kontrolü gerekir.');
  if (plateCheck.check && plateCheck.check.status !== 'matched') warnings.push(plateCheck.check.message);
  if (legacyNotes.some((note) => note.text.length > 0)) warnings.push('Eski NOTLAR dosyası okundu; istenirse takip notuna aktarılabilir.');
  if (legacyNotes.some((note) => note.warning)) warnings.push(...legacyNotes.map((note) => note.warning).filter((warning): warning is string => Boolean(warning)));
  if (plateCheck.ocrStatus?.warnings.length) warnings.push(...plateCheck.ocrStatus.warnings);
  return {
    claimType,
    evrakFolderExists: listing.exists,
    filesScanned: displayNames.length,
    requirements,
    missingCritical,
    claimNoticeNo: notice.number,
    claimNoticeFiles: notice.files,
    hasKttOrZabitOrBeyan: hasAnyAccidentStatement(normalized),
    counterpartyPolicyCandidate,
    conflictFiles,
    ...(plateCheck.check ? { zararGorenPlateCheck: plateCheck.check } : {}),
    ...(legacyNotes.length > 0 ? { legacyNotes } : {}),
    ...(plateCheck.ocrStatus ? { ocrStatus: plateCheck.ocrStatus } : {}),
    warnings
  };
}

interface PlateCheckResult {
  check?: DocumentPlateCheck;
  ocrStatus?: DocumentOcrStatus;
}

interface ZararGorenPlateDetection {
  expectedInRegion: boolean;
  detectedPlate: string;
}


function detectClaimNotice(documents: NormalizedDocumentName[]): { number: string; files: string[] } {
  const candidates: Array<{ number: string; file: string; score: number }> = [];
  for (const document of documents) {
    const base = path.basename(document.displayName).replace(/\.[^.]+$/, '');
    const normalized = document.normalizedName;
    const exact = base.match(/\b(\d{1,3}[-_ ]\d{5,12})\b/);
    const long = base.match(/\b(\d{7,12})\b/);
    const hasNoticeWord = /IHBAR|FOY|HASAR DOSYA|DOSYA NO|CLAIM/.test(normalized);
    if (exact) candidates.push({ number: normalizeNoticeNumber(exact[1] ?? ''), file: document.displayName, score: hasNoticeWord ? 100 : 70 });
    else if (long && hasNoticeWord) candidates.push({ number: normalizeNoticeNumber(long[1] ?? ''), file: document.displayName, score: 60 });
  }
  candidates.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file, 'tr'));
  const number = candidates[0]?.number ?? '';
  return { number, files: candidates.filter((candidate) => candidate.number === number).map((candidate) => candidate.file) };
}

function normalizeNoticeNumber(value: string): string {
  return value.replace(/[ _]+/g, '-').replace(/-+/g, '-').trim();
}

async function checkZararGorenPlate(documents: NormalizedDocumentName[], claimNoticeFiles: string[], expectedPlate: string): Promise<PlateCheckResult> {
  const expected = plateKey(expectedPlate);
  if (!expected) return {};
  const candidates = selectZararGorenPlatePdfCandidates(documents, claimNoticeFiles);
  if (candidates.length === 0) return {};

  let firstUnreadable: DocumentPlateCheck | undefined;
  let ocrToolsAvailable = false;
  let ocrPdfAvailable = false;
  const checkedFiles: string[] = [];
  const usedFiles: string[] = [];
  const ocrWarnings = new Set<string>();
  for (const document of candidates) {
    const text = await extractPdfText(document.filePath);
    if (!text.ok) {
      firstUnreadable ??= {
        source: 'zarar-goren-arac',
        status: 'unreadable',
        expectedPlate: expected,
        detectedPlate: '',
        fileName: document.displayName,
        method: 'pdf-text',
        message: `İhbar PDF metni okunamadı; Zarar Gören Araç plakası doğrulanamadı. Kullanıcı kontrol etmeli. (${document.displayName})`
      };
    } else {
      const detection = analyzeZararGorenAracPlate(text.text, expected);
      if (detection.expectedInRegion || detection.detectedPlate) {
        const matched = detection.expectedInRegion;
        const detectedPlate = matched ? expected : plateKey(detection.detectedPlate);
        return withOcrStatus({
          source: 'zarar-goren-arac',
          status: matched ? 'matched' : 'mismatch',
          expectedPlate: expected,
          detectedPlate,
          fileName: document.displayName,
          method: 'pdf-text',
          message: matched
            ? `İhbar PDF Zarar Gören Araç plakası klasör plakasıyla uyumlu. (${document.displayName})`
            : `İhbar PDF plaka uyuşmazlığı: Zarar Gören Araç plakası ${detectedPlate}, klasör plakası ${expected}. Kullanıcı doğrulamalı. (${document.displayName})`
        }, checkedFiles, usedFiles, ocrWarnings, ocrToolsAvailable, ocrPdfAvailable);
      }
    }

    if (shouldAttemptOcr(text.ok ? text.text : '')) {
      checkedFiles.push(document.displayName);
      const ocr = await ocrPdfFirstPage(document.filePath);
      ocrToolsAvailable ||= ocr.tools.available;
      ocrPdfAvailable ||= ocr.tools.pdfAvailable;
      for (const warning of ocr.tools.warnings) ocrWarnings.add(warning);
      if (!ocr.ok) {
        if (ocr.reason) ocrWarnings.add(`OCR denenemedi veya sonuç vermedi (${document.displayName}): ${ocr.reason}`);
        continue;
      }
      usedFiles.push(document.displayName);
      const detection = analyzeZararGorenAracPlate(ocr.text, expected);
      if (!detection.expectedInRegion && !detection.detectedPlate) continue;
      const matched = detection.expectedInRegion;
      const detectedPlate = matched ? expected : plateKey(detection.detectedPlate);
      return withOcrStatus({
        source: 'zarar-goren-arac',
        status: matched ? 'matched' : 'mismatch',
        expectedPlate: expected,
        detectedPlate,
        fileName: document.displayName,
        method: 'ocr',
        message: matched
          ? `İhbar PDF Zarar Gören Araç plakası OCR ile klasör plakasıyla uyumlu okundu. (${document.displayName})`
          : `İhbar PDF OCR plaka uyuşmazlığı: Zarar Gören Araç plakası ${detectedPlate}, klasör plakası ${expected}. Kullanıcı doğrulamalı. (${document.displayName})`
      }, checkedFiles, usedFiles, ocrWarnings, ocrToolsAvailable, ocrPdfAvailable);
    }
  }

  const fallback = firstUnreadable ?? {
    source: 'zarar-goren-arac',
    status: 'not-found',
    expectedPlate: expected,
    detectedPlate: '',
    fileName: candidates[0]?.displayName ?? '',
    method: checkedFiles.length > 0 ? 'ocr' as const : 'pdf-text' as const,
    message: `İhbar PDF içinde Zarar Gören Araç plakası okunamadı; PDF taranmış/OCR'siz olabilir. Kullanıcı kontrol etmeli. (${candidates[0]?.displayName ?? 'PDF'})`
  };
  return withOcrStatus(fallback, checkedFiles, usedFiles, ocrWarnings, ocrToolsAvailable, ocrPdfAvailable);
}

function withOcrStatus(
  check: DocumentPlateCheck,
  checkedFiles: string[],
  usedFiles: string[],
  warnings: Set<string>,
  available: boolean,
  pdfAvailable: boolean
): PlateCheckResult {
  if (checkedFiles.length === 0) return { check };
  return {
    check,
    ocrStatus: {
      available,
      pdfAvailable,
      used: usedFiles.length > 0,
      checkedFiles,
      usedFiles,
      warnings: [...warnings]
    }
  };
}

function shouldAttemptOcr(text: string): boolean {
  const normalized = normalizeSearch(text);
  return normalized.length < 120 || !normalized.includes('ZARAR GOREN ARAC');
}

function selectZararGorenPlatePdfCandidates(documents: NormalizedDocumentName[], claimNoticeFiles: string[]): NormalizedDocumentName[] {
  const claimNoticeSet = new Set(claimNoticeFiles);
  const selected = documents.filter((document) => isPdf(document.displayName) && !isPcloudConflictFile(document.displayName) && claimNoticeSet.has(document.displayName));
  if (selected.length > 0) return selected.slice(0, 3);
  return documents
    .filter((document) => isPdf(document.displayName) && !isPcloudConflictFile(document.displayName) && /IHBAR|FOY|HASAR DOSYA|CLAIM/.test(document.normalizedName))
    .slice(0, 3);
}

function analyzeZararGorenAracPlate(text: string, expectedPlate: string): ZararGorenPlateDetection {
  const normalized = normalizeSearch(text);
  const headingIndex = normalized.indexOf('ZARAR GOREN ARAC');
  if (headingIndex < 0) return { expectedInRegion: false, detectedPlate: '' };
  const afterHeading = normalized.slice(headingIndex, headingIndex + 700);
  const beforeHeading = normalized.slice(Math.max(0, headingIndex - 350), headingIndex);
  const region = `${afterHeading} ${beforeHeading}`;
  const expected = plateKey(expectedPlate);
  if (expected && plateKey(region).includes(expected)) return { expectedInRegion: true, detectedPlate: expected };
  return {
    expectedInRegion: false,
    detectedPlate: findPlateNearZararGorenHeading(afterHeading) || findPlateNearZararGorenHeading(beforeHeading)
  };
}

function findPlateNearZararGorenHeading(text: string): string {
  const labelled = text.match(/\bPLAKA(?: NO| NUMARASI)?\s+((?:0[1-9]|[1-7][0-9]|8[01])\s*[A-Z]{1,3}\s*[0-9]{2,4})\b/);
  if (labelled) return labelled[1] ?? '';
  const fallback = text.match(/\b((?:0[1-9]|[1-7][0-9]|8[01])\s*[A-Z]{1,3}\s*[0-9]{2,4})\b/);
  return fallback?.[1] ?? '';
}

function isPdf(fileName: string): boolean {
  return /\.pdf$/i.test(fileName);
}

function inferClaimType(normalizedNames: string[]): ClaimType {
  const all = normalizedNames.join(' | ');
  const hasTrafficPartyDocs = normalizedNames.some((name) => hasPartyToken(name, 'M') || hasPartyToken(name, 'S') || /MAGDUR|ZARAR GOREN/.test(name));
  const hasKaskoPartyDocs = normalizedNames.some((name) => hasPartyToken(name, 'K') || /KASKO|KASKOLU/.test(name));
  const hasCounterpartyOnly = /KARSI TARAF|RUCU/.test(all);
  if (hasKaskoPartyDocs && !hasTrafficPartyDocs) return 'kasko';
  if (hasTrafficPartyDocs) return 'trafik';
  if (hasKaskoPartyDocs) return 'kasko';
  if (hasCounterpartyOnly) return 'unknown';
  return 'unknown';
}

function buildRequirements(claimType: ClaimType, documents: NormalizedDocumentName[]): DocumentRequirement[] {
  if (claimType === 'unknown') {
    return [{
      key: 'dosya-tipi-dogrulama',
      label: 'Dosya tipi kullanıcı tarafından trafik/kasko olarak doğrulanmalı',
      found: false,
      matchedFiles: [],
      warning: 'Dosya adlarından net karar verilemedi. Program trafik veya kasko kararı vermez.'
    }];
  }

  const normalized = documents.map((document) => document.normalizedName);
  const reqs = claimType === 'kasko' ? KASKO_REQUIREMENTS : TRAFFIC_REQUIREMENTS;
  const requirements = reqs.map((req) => requirementResult(req.key, req.label, documents));
  if (claimType === 'trafik' && needsTramerResult(normalized)) {
    requirements.splice(requirements.length - 1, 0, requirementResult('tramer-sonucu', 'Tramer Sonucu', documents, 'Zabıtsız KTT/Beyan dosyalarında Tramer sonucu zorunlu takip edilir.'));
  }
  return requirements;
}

function requirementResult(key: string, label: string, documents: NormalizedDocumentName[], warning?: string): DocumentRequirement {
  const matchedFiles = documents
    .filter((document) => matchesRequirement(key, document.normalizedName))
    .map((document) => document.displayName);
  return { key, label, found: matchedFiles.length > 0, matchedFiles, ...(warning && matchedFiles.length === 0 ? { warning } : {}) };
}

function matchesRequirement(key: string, normalizedName: string): boolean {
  switch (key) {
    case 'm-ruhsat': return isRuhsat(normalizedName) && (hasPartyToken(normalizedName, 'M') || /MAGDUR|ZARAR GOREN/.test(normalizedName));
    case 'm-ehliyet': return isEhliyet(normalizedName) && (hasPartyToken(normalizedName, 'M') || /MAGDUR|ZARAR GOREN/.test(normalizedName));
    case 'm-police': return isPolicy(normalizedName) && (hasPartyToken(normalizedName, 'M') || /MAGDUR|ZARAR GOREN/.test(normalizedName));
    case 's-ruhsat': return isRuhsat(normalizedName) && (hasPartyToken(normalizedName, 'S') || /SIGORTALI/.test(normalizedName));
    case 's-ehliyet': return isEhliyet(normalizedName) && (hasPartyToken(normalizedName, 'S') || /SIGORTALI/.test(normalizedName));
    case 's-police': return isPolicy(normalizedName) && (hasPartyToken(normalizedName, 'S') || hasInsuredPolicyContext(normalizedName));
    case 'k-ruhsat': return isRuhsat(normalizedName) && (hasPartyToken(normalizedName, 'K') || /KASKOLU|SIGORTALI/.test(normalizedName)) && !/KARSI TARAF/.test(normalizedName);
    case 'k-ehliyet': return isEhliyet(normalizedName) && (hasPartyToken(normalizedName, 'K') || /KASKOLU|SIGORTALI/.test(normalizedName)) && !/KARSI TARAF/.test(normalizedName);
    case 'k-police': return isPolicy(normalizedName) && (hasPartyToken(normalizedName, 'K') || /KASKO|KASKOLU|SIGORTALI|SIGORTA/.test(normalizedName)) && !/KARSI TARAF/.test(normalizedName);
    case 'ktt-zabit-beyan': return hasAnyAccidentStatement([normalizedName]);
    case 'tramer-sonucu': return isTramerResult(normalizedName);
    case 'agir-hasar-kontrol': return /AGIR\s+HASAR|SBM|SBMM|PERT|PERTTOTAL|TOTAL LOSS|AHS|EKSPER\s+NOTU|ON\s+RAPOR/.test(normalizedName);
    default: return false;
  }
}

function hasPartyToken(normalizedName: string, token: 'M' | 'S' | 'K'): boolean {
  const parts = normalizedName.split(/[^A-Z0-9]+/).filter(Boolean);
  return parts.includes(token);
}

function isRuhsat(normalizedName: string): boolean {
  return /RUHSAT|TESCIL/.test(normalizedName);
}

function isEhliyet(normalizedName: string): boolean {
  return /EHLIYET|SURUCU BELGESI|SURUCU/.test(normalizedName);
}

function isPolicy(normalizedName: string): boolean {
  return /POLICE|POLI[CÇ]E|KASKO|SIGORTA/.test(normalizedName);
}

function hasInsuredPolicyContext(normalizedName: string): boolean {
  return /SIGORTALI|SIGORTA/.test(normalizedName);
}

function isTramerResult(normalizedName: string): boolean {
  if (/TRAMER|HASAR GECMISI|KAZA SORGUSU|KAZA SORGULAMA/.test(normalizedName)) return true;
  if (/SBM/.test(normalizedName) && !/AGIR\s+HASAR|SBMM|PERT|AHS|TOTAL LOSS/.test(normalizedName)) return true;
  return false;
}

function hasAnyAccidentStatement(normalizedNames: string[]): boolean {
  return normalizedNames.some((name) => hasKtt(name) || hasZabit(name) || hasBeyan(name));
}

function hasKtt(name: string): boolean {
  return /KTT|KAZA TESPIT|ANLASMALI TUTANAK|TUTANAK/.test(name);
}

function hasZabit(name: string): boolean {
  return /ZABIT|TRAFIK POLISI|JANDARMA|KOLLUK/.test(name);
}

function hasBeyan(name: string): boolean {
  return /BEYAN|IFADE/.test(name);
}

function needsTramerResult(normalizedNames: string[]): boolean {
  const hasNoZabit = !normalizedNames.some(hasZabit);
  const hasKttOrBeyan = normalizedNames.some((name) => hasKtt(name) || hasBeyan(name));
  return hasNoZabit && hasKttOrBeyan;
}

function detectCounterpartyPolicyCandidate(normalizedNames: string[]): boolean {
  const all = normalizedNames.join(' | ');
  return /KARSI TARAF.*POLICE|POLICE.*KARSI TARAF|RUCU.*POLICE|POLICE.*RUCU/.test(all)
    || normalizedNames.some((name) => /KARSI TARAF|KARSI/.test(name) && isPolicy(name))
    || (/POLICE/.test(all) && /KARSI|KTT|BEYAN|ZABIT|ANLASMALI TUTANAK/.test(all));
}

async function listTrackingConflictFiles(caseFolderPath: string): Promise<string[]> {
  const trackingFolder = path.join(caseFolderPath, TRACKING_FOLDER_NAME);
  const entries = await fs.readdir(trackingFolder, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && isPcloudConflictFile(entry.name) && /TAKIP|JSON/.test(normalizeSearch(entry.name)))
    .map((entry) => `${TRACKING_FOLDER_NAME}/${safeFileDisplayName(entry.name)}`);
}
