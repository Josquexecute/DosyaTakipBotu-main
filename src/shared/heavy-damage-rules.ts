import { normalizeSearch } from './turkish';
import type {
  HeavyDamageAssessmentPreview,
  HeavyDamageAssessmentRecord,
  HeavyDamageAssessmentRow,
  HeavyDamageAssessmentSummary,
  HeavyDamageConfidence,
  HeavyDamageDamageType,
  HeavyDamageGuideRule,
  HeavyDamagePartInput,
  HeavyDamageRepairSeverity,
  HeavyDamageRiskLevel,
  HeavyDamageRowEdit
} from './heavy-damage-types';

export const HEAVY_DAMAGE_THRESHOLD = 35;
export const HEAVY_DAMAGE_ECONOMIC_THRESHOLD = 60;

const CAPPED_SCORE_GROUPS = new Set(['airbag-seatbelt', 'main-electrical']);

const COMMON_CHASSIS_QUESTIONS = [
  'Bükülme, eğilme, çatlama veya yırtılma var mı?',
  'Ölçümlemede şasi sapması var mı?',
  'Doğrultma OEM sınırları içinde mi?',
  'Onarım sonrası geometri sapması kalacak mı?'
];

export const HEAVY_DAMAGE_GUIDE_RULES: HeavyDamageGuideRule[] = [
  rule('front-chassis-right', 'Sağ Ön Şasi Kolu', 20, { light: 2, medium: 5, heavy: 10 }, COMMON_CHASSIS_QUESTIONS),
  rule('front-chassis-left', 'Sol Ön Şasi Kolu', 20, { light: 2, medium: 5, heavy: 10 }, COMMON_CHASSIS_QUESTIONS),
  rule('front-chassis-unknown', 'Ön Şasi Kolu (Yön Kontrol)', 20, { light: 2, medium: 5, heavy: 10 }, COMMON_CHASSIS_QUESTIONS),
  rule('rear-chassis-right', 'Sağ Arka Şasi Kolu', 20, { light: 2, medium: 5, heavy: 10 }, [
    'Arka şasi kolunda eğilme veya deformasyon var mı?',
    'Bagaj, çamurluk ve direk hizaları oturuyor mu?',
    'Arka taban sacı veya koltuk altı bölgesinde deformasyon var mı?',
    'Arka taşıyıcı sistemde simetri/rijitlik kaybı var mı?'
  ]),
  rule('rear-chassis-left', 'Sol Arka Şasi Kolu', 20, { light: 2, medium: 5, heavy: 10 }, [
    'Arka şasi kolunda eğilme veya deformasyon var mı?',
    'Bagaj, çamurluk ve direk hizaları oturuyor mu?',
    'Arka taban sacı veya koltuk altı bölgesinde deformasyon var mı?',
    'Arka taşıyıcı sistemde simetri/rijitlik kaybı var mı?'
  ]),
  rule('rear-chassis-unknown', 'Arka Şasi Kolu (Yön Kontrol)', 20, { light: 2, medium: 5, heavy: 10 }, [
    'Arka şasi kolunda eğilme veya deformasyon var mı?',
    'Sağ/sol taraf net mi?',
    'Arka taşıyıcı sistemde simetri/rijitlik kaybı var mı?'
  ]),
  rule('rocker-floor-right', 'Taban ile Birlikte Sağ Marşpiyel', 10, { light: 2, medium: 5, heavy: 10 }, [
    'Marşpiyel kesilecek mi?',
    'Yeni parça kaynatılacak mı?',
    'Taban sacı veya taban traversi hasarlı mı?',
    'Yaşam kabininde yapısal deformasyon var mı?'
  ]),
  rule('rocker-floor-left', 'Taban ile Birlikte Sol Marşpiyel', 10, { light: 2, medium: 5, heavy: 10 }, [
    'Marşpiyel kesilecek mi?',
    'Yeni parça kaynatılacak mı?',
    'Taban sacı veya taban traversi hasarlı mı?',
    'Yaşam kabininde yapısal deformasyon var mı?'
  ]),
  rule('rocker-floor-unknown', 'Taban ile Birlikte Marşpiyel (Yön Kontrol)', 10, { light: 2, medium: 5, heavy: 10 }, [
    'Sağ/sol marşpiyel tarafı net mi?',
    'Taban sacı veya taban traversi hasarlı mı?',
    'Yaşam kabininde yapısal deformasyon var mı?'
  ]),
  rule('roof-panel', 'Tavan Sacı', 10, { light: 2, medium: 5, heavy: 10 }, [
    'Tavan yüzeyinde ezik, göçük, sehim veya sarkma var mı?',
    'Direk-tavan birleşimlerinde çatlak/açılma/deformasyon var mı?',
    'Tavan traversleriyle birlikte değişim gerekiyor mu?'
  ]),
  rule('b-pillar-right', 'Sağ Orta Direk', 7.5, { light: 1, medium: 3, heavy: 5 }, [
    'Orta direk iç sacı eğildi mi?',
    'Emniyet kemeri sabitleme noktası zarar gördü mü?',
    'Kaynak/kesim gerekiyor mu?',
    'Orta direk iç sacında katlanma/deformasyon var mı?'
  ]),
  rule('b-pillar-left', 'Sol Orta Direk', 7.5, { light: 1, medium: 3, heavy: 5 }, [
    'Orta direk iç sacı eğildi mi?',
    'Emniyet kemeri sabitleme noktası zarar gördü mü?',
    'Kaynak/kesim gerekiyor mu?',
    'Orta direk iç sacında katlanma/deformasyon var mı?'
  ]),
  rule('b-pillar-unknown', 'Orta Direk (Yön Kontrol)', 7.5, { light: 1, medium: 3, heavy: 5 }, [
    'Sağ/sol orta direk tarafı net mi?',
    'Emniyet kemeri sabitleme noktası zarar gördü mü?',
    'Kaynak/kesim gerekiyor mu?'
  ]),
  rule('firewall', 'Ön Göğüs Sacı', 40, { light: 3, medium: 5, heavy: 10 }, [
    'Şasi uzantılı göğüs sacında ezilme/yırtık/burulma var mı?',
    'Pedal sistemi etkilenmiş mi?',
    'Direksiyon kolonu montaj noktasında çatlak/deformasyon var mı?'
  ], true),
  rule('roof-crossmember-front', 'Tavan Sacı Ön Travers', 7.5, { light: 2, medium: 3, heavy: 5 }, [
    'Tavan destek traverslerinde eğilme var mı?',
    'Kapı oturum aralıklarında OEM sapması var mı?',
    'Tavan kirişlerinde deformasyon var mı?'
  ]),
  rule('roof-crossmember-rear', 'Tavan Sacı Arka Travers', 7.5, { light: 2, medium: 3, heavy: 5 }, [
    'Tavan destek traverslerinde eğilme var mı?',
    'Kapı oturum aralıklarında OEM sapması var mı?',
    'Tavan kirişlerinde deformasyon var mı?'
  ]),
  rule('roof-crossmember-unknown', 'Tavan Sacı Travers (Konum Kontrol)', 7.5, { light: 2, medium: 3, heavy: 5 }, [
    'Ön/arka tavan traversi net mi?',
    'Tavan kirişlerinde deformasyon var mı?'
  ]),
  rule('ev-battery-energy-line', 'Elektrikli Araç Bataryası ve Enerji Hattı', 5, { light: 1, medium: 2, heavy: 2.5 }, [
    'Bataryada fiziksel hasar, şişme, gaz çıkışı veya sıvı kaçağı var mı?',
    'Modüllerde darbe var mı?',
    'Ana enerji kablosunda kopma, ısınma, ezilme veya izolasyon kaybı var mı?',
    'HV sistem güvenlik moduna geçmiş mi?'
  ]),
  rule('airbag-seatbelt', 'Hava Yastıkları ve Emniyet Sistemleri', 10, undefined, [
    'Birden fazla hava yastığı açık mı?',
    'Açılmış airbag sayısı 2’den fazla mı?',
    'Emniyet kemeri gergileri / geri sarma mekanizması hasarlı mı?',
    'Emniyet kemeri mekanizması kilitli konumda mı kaldı?'
  ]),
  rule('main-electrical', 'Ana Elektrik Tesisatı ve Elektronik Sistem Parçaları', 10, undefined, [
    'Ana tesisat, sigorta kutusu, beyin modülleri, ABS/ESP/Radar sistemlerinde fiziksel hasar var mı?',
    'Su teması / kısa devre / CAN-BUS zararı var mı?',
    'Arıza hafızasında kalıcı kritik hata var mı?',
    'Güvenlik fonksiyonları devreye girmiyor mu?'
  ]),
  rule('truck-cabin', 'Kamyon / Çekici Kabin', 10, { light: 5, medium: 10, heavy: 20 }, [
    'Kabin ile şasi bağlantıları bozulmuş mu?',
    'Kabin bağlantı noktaları kopmuş mu?',
    'Kabin oturma pozisyonu eğilmiş mi?',
    'Kabin taşıyıcı direklerinde çatlak/kopma var mı?',
    'Direksiyon kolonu yerinde deformasyon var mı?'
  ]),
  rule('motorcycle-main-frame', 'Motosiklet Ana Şasi Doğrudan Risk', 35, undefined, [
    'Ana şaside değişim gerektirecek bükülme, çatlama, eğilme veya yırtılma var mı?',
    'Hasar tespit anındaki durum fotoğraf ve servis listesiyle teyit edildi mi?'
  ], true),
  rule('tractor-block-body', 'Traktör Blok Gövde Doğrudan Risk', 35, undefined, [
    'Blok gövdede değişim gerektirecek bükülme, çatlama, eğilme veya yırtılma var mı?',
    'Hasar tespit anındaki durum fotoğraf ve servis listesiyle teyit edildi mi?'
  ], true),
  {
    ...rule('special-oem-restoration-risk', 'OEM Standardına Dönüş Kontrolü', 0, undefined, [
      'Koku, kavrulma, nem veya iz aracın kullanımına engel mi?',
      'Araç OEM standardına döndürülemeyecek durumda mı?',
      'Eksper değerlendirmesiyle ağır hasar riski ayrıca incelendi mi?'
    ]),
    expertReviewOnly: true
  }
];

export const HEAVY_DAMAGE_FILTERS = [
  'all',
  'scored',
  'review',
  'low',
  'threshold',
  'out',
  'change',
  'repair-light',
  'repair-medium',
  'repair-heavy'
] as const;

export type HeavyDamageFilter = typeof HEAVY_DAMAGE_FILTERS[number];

function rule(
  id: string,
  displayName: string,
  changeScore: number,
  repairScores: HeavyDamageGuideRule['repairScores'],
  questions: string[],
  directThreshold = false
): HeavyDamageGuideRule {
  return { id, displayName, changeScore, ...(repairScores ? { repairScores } : {}), questions, directThreshold };
}

export function classifyHeavyDamagePart(input: HeavyDamagePartInput, rowNumber = 1): HeavyDamageAssessmentRow {
  const text = `${input.name} ${input.note ?? ''}`.trim();
  const normalized = normalizeSearch(text);
  if (isUnconfirmedFrontPanel(normalized, input)) return frontPanelReviewRow(input, normalized, rowNumber);
  const matched = matchGuideRule(normalized, input);
  if (!matched) return outOfScopeRow(input, normalized, rowNumber);

  const detectedDamageType = detectInputDamageType(input, normalized);
  const implicitGroupScore = detectedDamageType === 'unknown' && CAPPED_SCORE_GROUPS.has(matched.rule.id);
  const damageType = implicitGroupScore ? 'change' : detectedDamageType;
  const repairSeverity = damageType === 'repair' ? detectRepairSeverity(normalized) : damageType === 'change' ? 'none' : 'unknown';
  const score = scoreFor(matched.rule, damageType, repairSeverity);
  const ambiguous = matched.ambiguous || implicitGroupScore || damageType === 'unknown' || (damageType === 'repair' && repairSeverity === 'unknown') || matched.rule.expertReviewOnly === true;
  const confidence: HeavyDamageConfidence = score > 0 && !ambiguous ? 'Yüksek' : matched.ambiguous || damageType !== 'unknown' ? 'Orta' : 'Düşük';
  const needsReview = ambiguous || confidence !== 'Yüksek';
  const reasonParts = [
    `${matched.reason} → ${matched.rule.displayName}`,
    damageTypeLabel(damageType, repairSeverity),
    score > 0 ? `${formatScore(score)} puan` : 'puan için hasar türü/derecesi kontrol edilmeli'
  ];
  if (matched.rule.expertReviewOnly) reasonParts.push('eksper değerlendirmesi gerekli');
  if (input.structuralConfirmed === true && matched.rule.id === 'firewall') reasonParts.push('eksper teyidi: yapısal ön göğüs sacı / firewall');
  if (implicitGroupScore) reasonParts.push('aynı sistem grubunda mükerrer puanlama özet toplamda engellenir');
  return {
    id: `hd-${rowNumber}-${matched.rule.id}`,
    rowNumber,
    sourcePartName: input.name,
    source: input.source,
    normalizedPartName: matched.rule.displayName,
    guideCategory: matched.rule.id,
    guideCategoryLabel: matched.rule.displayName,
    damageType,
    repairSeverity,
    score,
    confidence,
    needsReview,
    reason: reasonParts.join(' • '),
    questions: matched.rule.questions,
    inScope: true,
    affectsThreshold: score > 0,
    directThreshold: matched.rule.directThreshold === true && score >= HEAVY_DAMAGE_THRESHOLD,
    ...(input.structuralConfirmed !== undefined ? { structuralConfirmed: input.structuralConfirmed } : {}),
    ...(isFrontPanelExpression(normalized) ? { structuralConfirmationRequired: input.structuralConfirmed !== true } : {}),
    ...(CAPPED_SCORE_GROUPS.has(matched.rule.id) ? { scoreGroupKey: matched.rule.id } : {})
  };
}

export function buildHeavyDamagePreview(args: {
  folderPath: string;
  plate: string;
  officeFileNo: string;
  assessedBy: string;
  inputs: HeavyDamagePartInput[];
  repairCost?: number;
  marketValue?: number;
  now?: string;
}): HeavyDamageAssessmentPreview {
  const assessedAt = args.now ?? new Date().toISOString();
  const rows = args.inputs.map((input, index) => classifyHeavyDamagePart(input, index + 1));
  const summary = summarizeHeavyDamageRows(rows, args.repairCost, args.marketValue);
  return {
    schemaVersion: 1,
    folderPath: args.folderPath,
    plate: args.plate,
    officeFileNo: args.officeFileNo,
    assessedAt,
    assessedBy: args.assessedBy,
    sourceInputs: args.inputs,
    rows,
    summary,
    userApproved: false,
    userNotes: ''
  };
}

export function applyHeavyDamageEdits(
  preview: HeavyDamageAssessmentPreview,
  edits: Record<string, HeavyDamageRowEdit>,
  userNotes = '',
  now = new Date().toISOString()
): HeavyDamageAssessmentRecord {
  const rows = preview.rows.map((row) => applyRowEdit(row, edits[row.id]));
  const summary = summarizeHeavyDamageRows(rows, preview.summary.repairCost, preview.summary.marketValue);
  return {
    ...preview,
    assessedAt: now,
    rows,
    summary,
    userApproved: true,
    userNotes: userNotes.trim().slice(0, 1000)
  };
}

export function summarizeHeavyDamageRows(rows: readonly HeavyDamageAssessmentRow[], repairCost?: number, marketValue?: number): HeavyDamageAssessmentSummary {
  const scoreModel = summarizeEffectiveScores(rows);
  const totalScore = scoreModel.totalScore;
  const directThresholdExceeded = rows.some((row) => row.directThreshold || row.score >= 40);
  const thresholdExceeded = directThresholdExceeded || totalScore >= HEAVY_DAMAGE_THRESHOLD;
  const ratio = Number.isFinite(repairCost) && Number.isFinite(marketValue) && (marketValue ?? 0) > 0
    ? roundScore(((repairCost ?? 0) / (marketValue ?? 1)) * 100)
    : undefined;
  const riskLevel: HeavyDamageRiskLevel = thresholdExceeded ? 'threshold-exceeded' : totalScore >= 20 ? 'review' : 'low';
  const needsReviewRows = rows.filter((row) => row.needsReview).length;
  const lowConfidenceRows = rows.filter((row) => row.confidence === 'Düşük').length;
  const warnings = [
    'Bu değerlendirme yapay zekâ destekli ön kontroldür. Nihai ağır hasar kararı eksper onayı ve dosya içeriği değerlendirmesiyle verilmelidir.',
    'Kritik parça puanı fotoğraf ve servis listesi ile teyit edilmelidir.',
    'Şasi/direk/tavan/göğüs sacı gibi yapısal parçalar için hasar fotoğrafı ve gerekiyorsa ölçümleme aranmalıdır.',
    'Hasar tespit anındaki fiziksel durum esas alınmalıdır.'
  ];
  if (rows.some((row) => row.guideCategory === 'main-electrical' && /YANGIN|SEL|SEYLAP|SU/.test(normalizeSearch(row.sourcePartName)))) {
    warnings.push('Ana elektrik tesisatı yangın/sel/seylap şüphesinde 40 puana kadar eksper değerlendirmesi gerektirir; otomatik kesin puan verilmedi.');
  }
  if (scoreModel.groupedScoreAdjustments > 0) {
    warnings.push('Airbag/emniyet ve ana elektrik sistemi gibi aynı rehber grubundaki çoklu kalemler toplam puanı mükerrer şişirmeyecek şekilde tek grup puanı ile sayıldı.');
  }
  if (ratio !== undefined && ratio < HEAVY_DAMAGE_ECONOMIC_THRESHOLD && thresholdExceeded) {
    warnings.push('Ekonomik %60 eşik aşılmadı ancak yapısal kritik parça eşiği aşıldı; ağır hasar riski kapatılmadı.');
  }
  const noteInput: {
    totalScore: number;
    thresholdExceeded: boolean;
    directThresholdExceeded: boolean;
    riskLevel: HeavyDamageRiskLevel;
    ratio?: number;
    needsReviewRows: number;
    lowConfidenceRows: number;
  } = { totalScore, thresholdExceeded, directThresholdExceeded, riskLevel, needsReviewRows, lowConfidenceRows };
  if (ratio !== undefined) noteInput.ratio = ratio;
  const summary: HeavyDamageAssessmentSummary = {
    totalScore,
    threshold: HEAVY_DAMAGE_THRESHOLD,
    criticalPartCount: scoreModel.criticalPartCount,
    thresholdExceeded,
    directThresholdExceeded,
    riskLevel,
    riskLabel: riskLabel(riskLevel, directThresholdExceeded),
    economicThresholdExceeded: ratio !== undefined && ratio >= HEAVY_DAMAGE_ECONOMIC_THRESHOLD,
    needsReviewRows,
    lowConfidenceRows,
    outOfScopeRows: rows.filter((row) => !row.inScope).length,
    groupedScoreAdjustments: scoreModel.groupedScoreAdjustments,
    aiSummary: generateHeavyDamageNote(noteInput),
    warnings
  };
  if (typeof repairCost === 'number' && Number.isFinite(repairCost)) summary.repairCost = repairCost;
  if (typeof marketValue === 'number' && Number.isFinite(marketValue)) summary.marketValue = marketValue;
  if (ratio !== undefined) summary.repairToMarketRatio = ratio;
  return summary;
}

function summarizeEffectiveScores(rows: readonly HeavyDamageAssessmentRow[]): { totalScore: number; criticalPartCount: number; groupedScoreAdjustments: number } {
  let uncappedScore = 0;
  let uncappedCount = 0;
  const capped = new Map<string, { maxScore: number; rowCount: number }>();
  for (const row of rows) {
    if (!row.inScope || row.score <= 0) continue;
    const key = row.scoreGroupKey && CAPPED_SCORE_GROUPS.has(row.scoreGroupKey) ? row.scoreGroupKey : '';
    if (!key) {
      uncappedScore += row.score;
      uncappedCount += 1;
      continue;
    }
    const current = capped.get(key) ?? { maxScore: 0, rowCount: 0 };
    current.maxScore = Math.max(current.maxScore, row.score);
    current.rowCount += 1;
    capped.set(key, current);
  }
  const cappedScore = [...capped.values()].reduce((sum, group) => sum + group.maxScore, 0);
  const groupedScoreAdjustments = [...capped.values()].reduce((sum, group) => sum + Math.max(0, group.rowCount - 1), 0);
  return {
    totalScore: roundScore(uncappedScore + cappedScore),
    criticalPartCount: uncappedCount + capped.size,
    groupedScoreAdjustments
  };
}

export function generateHeavyDamageAssessmentNote(assessment: HeavyDamageAssessmentPreview | HeavyDamageAssessmentRecord): string {
  const s = assessment.summary;
  const plateText = assessment.plate ? `${assessment.plate} plakalı araç` : 'Konu araç';
  const scoredRows = assessment.rows.filter((row) => row.inScope && row.score > 0);
  const frontFirewall = assessment.rows.find((row) => row.guideCategory === 'firewall' && row.score >= 40);
  const structuralText = frontFirewall
    ? ` Dosya kapsamında yer alan ${frontFirewall.sourcePartName} kaleminin yapısal ön göğüs sacı / firewall niteliğinde olduğu değerlendirilmiş; ön göğüs sacı değişimi 40 puan olarak 35 puan ağır hasar eşiğini tek başına aşmıştır.`
    : '';
  const ratioText = s.repairToMarketRatio !== undefined
    ? ` Hasar/rayiç oranı %${formatScore(s.repairToMarketRatio)} olarak hesaplanmıştır; ekonomik %60 eşik ${s.economicThresholdExceeded ? 'aşılmıştır' : 'aşılmamıştır'}.`
    : ' Hasar/rayiç oranı için rayiç ve hasar tutarı girilmemiştir.';
  const economicVsStructural = s.repairToMarketRatio !== undefined && !s.economicThresholdExceeded && s.thresholdExceeded
    ? ' Ekonomik eşik aşılmamakla birlikte yapısal kritik parça eşiği aşıldığı için ağır hasar riski kapatılmamıştır.'
    : '';
  const rowText = scoredRows.length
    ? ` Puanlamaya etki eden ana kalemler: ${scoredRows.slice(0, 8).map((row) => row.guideCategoryLabel).join(', ')}.`
    : '';
  return `${plateText} üzerinde yapılan AI destekli ön değerlendirmede, yapısal kritik parça puanlama rehberi kapsamında tespit edilen kalemler toplamı ${formatScore(s.totalScore)} puan olarak hesaplanmış olup 35 puan ağır hasar eşiği bakımından ${s.riskLabel.toLocaleLowerCase('tr-TR')} değerlendirilmiştir.${ratioText}${structuralText}${economicVsStructural}${rowText} ${s.needsReviewRows} satır kontrol gerekli olarak işaretlenmiştir. Nihai değerlendirme dosya kapsamı, hasar fotoğrafları, ölçümleme/servis tespitleri ve eksper kanaati ile yapılmalıdır.`;
}

export function generateHeavyDamageAssessmentMailDraft(assessment: HeavyDamageAssessmentPreview | HeavyDamageAssessmentRecord): string {
  const s = assessment.summary;
  const subject = `Konu: ${assessment.officeFileNo || '-'} / ${assessment.plate || '-'} ağır hasar ön değerlendirme`;
  const ratio = s.repairToMarketRatio === undefined ? '-' : `%${formatScore(s.repairToMarketRatio)}`;
  const frontFirewall = assessment.rows.some((row) => row.guideCategory === 'firewall' && row.score >= 40);
  return [
    subject,
    '',
    'Merhaba,',
    '',
    `${assessment.officeFileNo || '-'} dosya numaralı, ${assessment.plate || '-'} plakalı araç için AI destekli ağır hasar ön değerlendirme özeti aşağıdadır.`,
    '',
    `Rayiç değer: ${s.marketValue !== undefined ? formatMoney(s.marketValue) : '-'}`,
    `KDV dahil hasar toplamı: ${s.repairCost !== undefined ? formatMoney(s.repairCost) : '-'}`,
    `Hasar/rayiç oranı: ${ratio}`,
    `%60 ekonomik eşik sonucu: ${s.economicThresholdExceeded ? 'Aşıldı' : 'Aşılmadı'}`,
    `Yapısal kritik parça sonucu: ${s.riskLabel}`,
    frontFirewall ? 'Ön göğüs sacı / firewall değişimi: 40 puan, 35 puan eşiğini tek başına aşar.' : 'Ön göğüs sacı / firewall teyidi: kontrol gerekli.',
    '',
    'Eksper kanaati ve dosya kapsamı doğrultusunda görüş/onayınızı rica ederim.',
    '',
    'Not: Bu metin AI destekli ön değerlendirme taslağıdır; nihai karar eksper onayı ile verilmelidir.'
  ].join('\n');
}

export function heavyDamageFilterMatches(row: HeavyDamageAssessmentRow, filter: HeavyDamageFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'scored') return row.inScope && row.score > 0;
  if (filter === 'review') return row.needsReview;
  if (filter === 'low') return row.confidence === 'Düşük';
  if (filter === 'threshold') return row.affectsThreshold;
  if (filter === 'out') return !row.inScope;
  if (filter === 'change') return row.damageType === 'change';
  if (filter === 'repair-light') return row.damageType === 'repair' && row.repairSeverity === 'light';
  if (filter === 'repair-medium') return row.damageType === 'repair' && row.repairSeverity === 'medium';
  if (filter === 'repair-heavy') return row.damageType === 'repair' && row.repairSeverity === 'heavy';
  return true;
}

export function normalizeHeavyDamageAssessmentRecord(value: HeavyDamageAssessmentRecord): HeavyDamageAssessmentRecord {
  return {
    schemaVersion: 1,
    folderPath: String(value.folderPath || ''),
    plate: String(value.plate || ''),
    officeFileNo: String(value.officeFileNo || ''),
    assessedAt: validDate(value.assessedAt) ? value.assessedAt : new Date().toISOString(),
    assessedBy: String(value.assessedBy || 'Sistem').slice(0, 80),
    sourceInputs: Array.isArray(value.sourceInputs) ? value.sourceInputs.slice(0, 200) : [],
    rows: Array.isArray(value.rows) ? value.rows.slice(0, 200) : [],
    summary: summarizeHeavyDamageRows(Array.isArray(value.rows) ? value.rows : [], value.summary?.repairCost, value.summary?.marketValue),
    userApproved: value.userApproved === true,
    userNotes: String(value.userNotes || '').slice(0, 1000)
  };
}

export function heavyDamageGuideOptions(): Array<{ value: string; label: string }> {
  return [
    ...HEAVY_DAMAGE_GUIDE_RULES.map((rule) => ({ value: rule.id, label: rule.displayName })),
    { value: 'out-of-scope', label: 'Kapsam Dışı' }
  ];
}

function applyRowEdit(row: HeavyDamageAssessmentRow, edit?: HeavyDamageRowEdit): HeavyDamageAssessmentRow {
  if (!edit) return row;
  const { scoreGroupKey: _previousScoreGroupKey, ...rowWithoutScoreGroupKey } = row;
  const structuralConfirmed = edit.structuralConfirmed ?? row.structuralConfirmed;
  const guideCategory = structuralConfirmed === true && row.structuralConfirmationRequired ? 'firewall' : edit.guideCategory ?? row.guideCategory;
  const rule = HEAVY_DAMAGE_GUIDE_RULES.find((item) => item.id === guideCategory) ?? HEAVY_DAMAGE_GUIDE_RULES.find((item) => item.id === row.guideCategory);
  const inScope = guideCategory === 'out-of-scope' ? false : row.inScope || Boolean(rule);
  const damageType = structuralConfirmed === true && guideCategory === 'firewall' ? 'change' : edit.damageType ?? row.damageType;
  const repairSeverity = damageType === 'change' ? 'none' : edit.repairSeverity ?? row.repairSeverity;
  const score = structuralConfirmed === false && row.structuralConfirmationRequired
    ? 0
    : Number.isFinite(edit.score)
      ? Math.max(0, roundScore(edit.score ?? 0))
      : structuralConfirmed === true && guideCategory === 'firewall'
        ? 40
        : rule ? scoreFor(rule, damageType, repairSeverity) : row.score;
  const label = guideCategory === 'out-of-scope' ? 'Kapsam Dışı' : rule?.displayName ?? row.guideCategoryLabel;
  const needsReview = structuralConfirmed === true && guideCategory === 'firewall'
    ? false
    : structuralConfirmed === false && row.structuralConfirmationRequired
      ? true
      : edit.needsReview ?? row.needsReview;
  return {
    ...rowWithoutScoreGroupKey,
    guideCategory,
    guideCategoryLabel: label,
    normalizedPartName: label,
    damageType,
    repairSeverity,
    score,
    needsReview,
    inScope,
    affectsThreshold: inScope && score > 0,
    directThreshold: inScope && (score >= 40 || rule?.directThreshold === true && score >= HEAVY_DAMAGE_THRESHOLD),
    reason: `${row.reason} • Kullanıcı tarafından düzeltildi.${structuralConfirmed === true && guideCategory === 'firewall' ? ' Yapısal ön göğüs sacı / firewall teyit edildi.' : ''}`,
    ...(structuralConfirmed !== undefined ? { structuralConfirmed } : {}),
    ...(CAPPED_SCORE_GROUPS.has(guideCategory) ? { scoreGroupKey: guideCategory } : {}),
    ...(edit.userNote ? { userNote: edit.userNote.slice(0, 500) } : {}),
    userEdited: true
  };
}

function detectInputDamageType(input: HeavyDamagePartInput, normalized: string): HeavyDamageDamageType {
  if (input.operation === 'replacement') return 'change';
  if (input.operation === 'repair') return 'repair';
  return detectDamageType(normalized);
}

function isFrontPanelExpression(normalized: string): boolean {
  return /\bON\s+GOGUS\b|\bFIREWALL\b|\bTORPIDO\s+SACI\b|\bPEDAL\s+SACI\b/.test(normalized);
}

function isUnconfirmedFrontPanel(normalized: string, input: HeavyDamagePartInput): boolean {
  if (input.structuralConfirmed === true) return false;
  if (/\b(ON\s+GOGUS\s+SACI|FIREWALL|TORPIDO\s+SACI|PEDAL\s+SACI)\b/.test(normalized)) return false;
  return /\bON\s+GOGUS\b/.test(normalized);
}

function frontPanelReviewRow(input: HeavyDamagePartInput, normalized: string, rowNumber: number): HeavyDamageAssessmentRow {
  return {
    id: `hd-${rowNumber}-firewall-review`,
    rowNumber,
    sourcePartName: input.name,
    source: input.source,
    normalizedPartName: 'Ön Göğüs Sacı (Yapısal Teyit Gerekli)',
    guideCategory: 'firewall',
    guideCategoryLabel: 'Ön Göğüs Sacı',
    damageType: detectInputDamageType(input, normalized),
    repairSeverity: 'unknown',
    score: 0,
    confidence: 'Düşük',
    needsReview: true,
    reason: 'Ön Göğüs ifadesi yapısal ön göğüs sacı/firewall veya torpido-plastik göğüs olabilir; yapısal teyit olmadan 40 puan verilmedi.',
    questions: ['Bu parça torpido/plastik göğüs mü, yoksa yapısal ön göğüs sacı / firewall bölgesi mi?'],
    inScope: true,
    affectsThreshold: false,
    directThreshold: false,
    structuralConfirmed: false,
    structuralConfirmationRequired: true
  };
}

function matchGuideRule(normalized: string, input?: HeavyDamagePartInput): { rule: HeavyDamageGuideRule; reason: string; ambiguous: boolean } | null {
  const has = (pattern: RegExp) => pattern.test(normalized);
  const side = has(/\bSAG\b/) ? 'right' : has(/\bSOL\b/) ? 'left' : 'unknown';
  const front = has(/\bON\b/);
  const rear = has(/\bARKA\b/);
  if (input?.structuralConfirmed === true && isFrontPanelExpression(normalized)) return found('firewall', 'eksper teyitli yapısal ön göğüs sacı/firewall');
  if (has(/\b(MOTOSIKLET|MOTORCYCLE)\b/) && has(/\b(ANA\s+)?(SASI|SASE|SASI)\b/)) return found('motorcycle-main-frame', 'motosiklet ana şasi eşleşmesi');
  if (has(/\bTRAKTOR\b/) && has(/\b(BLOK|GOVDE)\b/)) return found('tractor-block-body', 'traktör blok gövde eşleşmesi');
  if (has(/\b(KOKU|KAVRULMA|NEM|OEM)\b/)) return found('special-oem-restoration-risk', 'OEM standardına dönüş riski');
  if (has(/\b(SASI|SASE)\b/) && front) return found(`front-chassis-${side}`, 'ön şasi kelime kanıtı', side === 'unknown');
  if (has(/\b(SASI|SASE)\b/) && rear) return found(`rear-chassis-${side}`, 'arka şasi kelime kanıtı', side === 'unknown');
  if (has(/\b(MARSPIYEL|MARSBIYEL|ESIK\s+SACI|IC\s+MARSPIYEL|TABAN\s+ILE\s+MARSPIYEL)\b/)) return found(`rocker-floor-${side}`, 'marşpiyel/taban kelime kanıtı', side === 'unknown');
  if (has(/\b(TAVAN\s+TRAVERS|ON\s+TAVAN\s+TRAVERS|ARKA\s+TAVAN\s+TRAVERS)\b/)) {
    if (front) return found('roof-crossmember-front', 'ön tavan traversi kanıtı');
    if (rear) return found('roof-crossmember-rear', 'arka tavan traversi kanıtı');
    return found('roof-crossmember-unknown', 'tavan traversi kanıtı', true);
  }
  if (has(/\b(TAVAN\s+SACI|TAVAN\s+PANELI)\b/)) return found('roof-panel', 'tavan sacı/paneli kanıtı');
  if (has(/\b(ORTA\s+DIREK|B\s+DIREGI|B\s+PILLAR)\b/)) return found(`b-pillar-${side}`, 'orta direk/B direği kanıtı', side === 'unknown');
  if (has(/\b(ON\s+GOGUS\s+SACI|FIREWALL|TORPIDO\s+SACI|PEDAL\s+SACI)\b/)) return found('firewall', 'ön göğüs sacı/firewall kanıtı');
  if (has(/\b(BATARYA|YUKSEK\s+VOLTAJ|HV\s+KABLO|HV\s+BATARYA|ENERJI\s+HATTI)\b/)) return found('ev-battery-energy-line', 'batarya/HV enerji hattı kanıtı');
  if (has(/\b(AIRBAG|HAVA\s+YASTIGI|EMNIYET\s+KEMERI|KEMER\s+GERGISI|KEMER\s+TOKASI)\b/)) return found('airbag-seatbelt', 'airbag/emniyet sistemi kanıtı');
  if (has(/\b(SIGORTA\s+KUTUSU|ANA\s+TESISAT|MOTOR\s+ELEKTRIK\s+TESISATI|TESISAT|BEYIN|ECU|ABS|ESP|RADAR|KAMERA|SENSOR|SENSORU|DARBE\s+SENSORU|CAN\s+HATTI)\b/)) return found('main-electrical', 'ana elektrik/elektronik sistem kanıtı');
  if (has(/\b(KAMYON\s+KABIN|CEKICI\s+KABIN|CEKICI\s+KABINI|KABIN)\b/)) return found('truck-cabin', 'kamyon/çekici kabin kanıtı');
  if (has(/\b(AMORTISOR\s+KULE|AMORTISOR\s+KULESI)\b/)) return found(front ? `front-chassis-${side}` : rear ? `rear-chassis-${side}` : 'front-chassis-unknown', 'amortisör kulesi şasi ölçeğiyle kontrol', true);
  return null;
}

function found(id: string, reason: string, ambiguous = false): { rule: HeavyDamageGuideRule; reason: string; ambiguous: boolean } {
  const rule = HEAVY_DAMAGE_GUIDE_RULES.find((item) => item.id === id) ?? HEAVY_DAMAGE_GUIDE_RULES.find((item) => item.id === `${id.split('-').slice(0, -1).join('-')}-unknown`);
  if (!rule) throw new Error(`Ağır hasar rehber kuralı bulunamadı: ${id}`);
  return { rule, reason, ambiguous };
}

function detectDamageType(normalized: string): HeavyDamageDamageType {
  if (/\b(DEGISIM|DEGISECEK|DEGISTI|DEGISEN|YENILENECEK|KESILECEK|YENI\s+PARCA)\b/.test(normalized)) return 'change';
  if (/\b(ONARIM|TAMIR|DUZELTME|DOGRULTMA|KAYNAK|CEKME)\b/.test(normalized)) return 'repair';
  return 'unknown';
}

function detectRepairSeverity(normalized: string): HeavyDamageRepairSeverity {
  if (/\bAGIR\b/.test(normalized)) return 'heavy';
  if (/\bORTA\b/.test(normalized)) return 'medium';
  if (/\bHAFIF\b/.test(normalized)) return 'light';
  return 'unknown';
}

function scoreFor(rule: HeavyDamageGuideRule, damageType: HeavyDamageDamageType, severity: HeavyDamageRepairSeverity): number {
  if (damageType === 'change') return rule.changeScore ?? 0;
  if (damageType === 'repair' && severity !== 'none' && severity !== 'unknown') return rule.repairScores?.[severity] ?? 0;
  return 0;
}

function outOfScopeRow(input: HeavyDamagePartInput, normalized: string, rowNumber: number): HeavyDamageAssessmentRow {
  const structuralHint = /SASI|SASE|DIREK|TAVAN|BATARYA|AIRBAG|TESISAT|KABIN|TABAN/.test(normalized);
  return {
    id: `hd-${rowNumber}-out`,
    rowNumber,
    sourcePartName: input.name,
    source: input.source,
    normalizedPartName: 'Kapsam Dışı',
    guideCategory: 'out-of-scope',
    guideCategoryLabel: 'Kapsam Dışı',
    damageType: 'unknown',
    repairSeverity: 'unknown',
    score: 0,
    confidence: 'Düşük',
    needsReview: true,
    reason: structuralHint ? 'Yapısal olabilecek ifade var; rehber kalemi netleşmedi.' : 'Rehberdeki kritik yapısal parça listesine girmedi; eksper kapsam dışı olduğunu kontrol etmeli.',
    questions: structuralHint
      ? ['Parça rehberdeki kritik yapısal kalemlerden biri mi?', 'Hasar fotoğrafı ve servis listesiyle teyit edildi mi?']
      : ['Bu satır ağır hasar rehberindeki kritik yapısal parçalardan biri değil mi?'],
    inScope: false,
    affectsThreshold: false,
    directThreshold: false
  };
}

function generateHeavyDamageNote(args: {
  totalScore: number;
  thresholdExceeded: boolean;
  directThresholdExceeded: boolean;
  riskLevel: HeavyDamageRiskLevel;
  ratio?: number;
  needsReviewRows: number;
  lowConfidenceRows: number;
}): string {
  const thresholdText = args.directThresholdExceeded
    ? 'tekil yüksek puanlı kritik kalem nedeniyle ağır hasar eşiği doğrudan aşılmıştır'
    : args.thresholdExceeded
      ? '35 puan ağır hasar eşiği aşılmıştır'
      : args.riskLevel === 'review'
        ? 'eşik altında olmakla birlikte kritik takip/kontrol gereklidir'
        : 'eşik altında kalmıştır';
  const ratioText = args.ratio !== undefined ? ` Hasar/rayiç oranı %${formatScore(args.ratio)} olarak izlenmelidir.` : '';
  return `Yapısal kritik parça ön değerlendirme toplamı ${formatScore(args.totalScore)} puandır; ${thresholdText}.${ratioText} ${args.needsReviewRows} kontrol gerekli, ${args.lowConfidenceRows} düşük güvenli satır vardır. Nihai karar eksper onayı ile verilmelidir.`;
}

function riskLabel(level: HeavyDamageRiskLevel, directThresholdExceeded: boolean): string {
  if (directThresholdExceeded) return 'Ağır hasar eşiği doğrudan aşıldı';
  if (level === 'threshold-exceeded') return 'Ağır hasar eşiği aşıldı';
  if (level === 'review') return 'Kritik takip / kontrol gerekli';
  return 'Eşik altında';
}

function damageTypeLabel(type: HeavyDamageDamageType, severity: HeavyDamageRepairSeverity): string {
  if (type === 'change') return 'değişim';
  if (type === 'repair') return `onarım ${repairSeverityLabel(severity)}`;
  return 'hasar türü bilinmiyor';
}

function repairSeverityLabel(severity: HeavyDamageRepairSeverity): string {
  if (severity === 'light') return 'hafif';
  if (severity === 'medium') return 'orta';
  if (severity === 'heavy') return 'ağır';
  return 'derecesi bilinmiyor';
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(value);
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}
