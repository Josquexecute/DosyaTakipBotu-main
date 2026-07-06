import type { UiState } from '../state';
import { escapeHtml } from '../validation';
import { icon } from '../icons';
import { calculateMotorExpertiseFee, calculateNonMotorExpertiseFee } from '../../../shared/fees/expertise-fee-calculator';
import type { FeeBreakdown } from '../../../shared/fees/expertise-fee-types';
import type { AiCaseContext } from '../selectors/ai-case-context';
import { aiFieldStatus, aiFieldBadge } from '../utils/ai-context-mapping';

// v0.6.x: Ekspertiz Ücreti Hesap Yardımcısı — saf fee calculator ile YEREL hesap. Yazma/ağ yok.
// Dosya seçiliyken hasar tutarı vb. dosyadan ön-doldurulur (rozetlerle işaretli).

function parseNum(value: string, fallback = 0): number {
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function formatTL(value: number): string {
  return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
}

export function renderExpertiseFeeHelper(state: UiState, ctx: AiCaseContext | null): string {
  const f = state.aiHelpers.fee;
  const edited = state.aiHelpers.userEdited;
  const has = !!ctx;
  const isMotor = f.kapsam === 'motorlu';
  const brutRaw = f.brutHasar.trim();
  const badgeBrut = aiFieldBadge(aiFieldStatus(has, !!ctx && ctx.grossDamageAmount !== null, edited['fee.brutHasar'] === true));
  // Araç grubu dosyada tutulmaz → dosya seçiliyken her zaman "kontrol gerekli".
  const badgeVehicle = aiFieldBadge(aiFieldStatus(has, false, edited['fee.vehicleClass'] === true));
  const agirUyari = has && (ctx.isHeavyDamage === true || ctx.isTotalLoss === true);

  const travel = f.travelEnabled
    ? {
        km: parseNum(f.km),
        ...(f.epdk.trim() ? { epdkFuelPrice: parseNum(f.epdk) } : {}),
        fileCount: f.fileCount.trim() ? parseNum(f.fileCount, 1) : 1,
        highway: parseNum(f.highway), bridge: parseNum(f.bridge), ferry: parseNum(f.ferry), parking: parseNum(f.parking)
      }
    : undefined;

  const kdvOrani = parseNum(f.kdvOrani, 20) / 100;
  let result: FeeBreakdown | null = null;
  if (brutRaw) {
    const brut = parseNum(brutRaw, NaN);
    result = isMotor
      ? calculateMotorExpertiseFee({
          brutHasarTutari: brut, vehicleClass: f.vehicleClass, jobType: f.jobType,
          degerKaybi: f.degerKaybi, kttTanzim: f.kttTanzim, sehirDisi: f.sehirDisi,
          kdvDahil: f.kdvDahil, kdvOrani, ...(travel ? { travel } : {})
        })
      : calculateNonMotorExpertiseFee({
          brutHasarTutari: brut, riziko: f.riziko,
          jobType: f.jobType === 'standart' ? 'standart' : 'uzaktan-ekspertiz',
          sehirDisi: f.sehirDisi, kdvDahil: f.kdvDahil, kdvOrani, ...(travel ? { travel } : {})
        });
  }

  return `<div class="aih-panel">
    <p class="settings-help">SEDDK taban ekspertiz ücret tarifesine (EK-1 / EK-2) göre yerel, deterministik hesap. KDV hariç esastır.</p>
    ${has ? '<p class="muted aih-prefill-note">Bu hesap dosya bilgilerinden ön-doldurulmuştur. Eksper kontrolü gerektirir ve dosyaya yazılmaz.</p>' : ''}
    ${agirUyari ? `<div class="app-alert warning">${icon('warning')}<span>Dosya ağır/tam hasar görünüyor; ücret hesabı yine de yardımcı/kontrol amaçlıdır.</span></div>` : ''}
    <div class="aih-form">
      <label class="aih-field"><span>Sigorta türü</span>
        <select data-aih="fee.kapsam">
          <option value="motorlu" ${isMotor ? 'selected' : ''}>Motorlu araç (EK-1)</option>
          <option value="motorlu-disi" ${!isMotor ? 'selected' : ''}>Motorlu araç dışı (EK-2)</option>
        </select>
      </label>
      <label class="aih-field"><span>Brüt hasar tutarı (TL) ${badgeBrut}</span>
        <input id="aih-fee-brut" data-aih="fee.brutHasar" data-aih-live="1" type="text" inputmode="decimal" placeholder="ör. 250000 (ondalık için virgül)" value="${escapeHtml(f.brutHasar)}" />
      </label>
      ${isMotor ? `<label class="aih-field"><span>Araç grubu ${badgeVehicle}</span>
        <select data-aih="fee.vehicleClass">
          <option value="binek-hafif-ticari-motosiklet" ${f.vehicleClass === 'binek-hafif-ticari-motosiklet' ? 'selected' : ''}>Binek / Hafif Ticari / Motosiklet</option>
          <option value="agir-vasita" ${f.vehicleClass === 'agir-vasita' ? 'selected' : ''}>Ağır Vasıta (×1,50)</option>
          <option value="is-makinesi" ${f.vehicleClass === 'is-makinesi' ? 'selected' : ''}>İş Makinesi (×2,20)</option>
        </select>
      </label>` : `<label class="aih-field"><span>Riziko</span>
        <select data-aih="fee.riziko">
          <option value="sivil" ${f.riziko === 'sivil' ? 'selected' : ''}>Sivil</option>
          <option value="ticari-sinai-endustriyel" ${f.riziko === 'ticari-sinai-endustriyel' ? 'selected' : ''}>Ticari / Sınai / Endüstriyel (×1,50)</option>
        </select>
      </label>`}
      <label class="aih-field"><span>İş tipi</span>
        <select data-aih="fee.jobType">
          <option value="standart" ${f.jobType === 'standart' ? 'selected' : ''}>Standart</option>
          <option value="uzaktan-ekspertiz" ${f.jobType === 'uzaktan-ekspertiz' ? 'selected' : ''}>Uzaktan ekspertiz (2/3)</option>
          ${isMotor ? `<option value="deger-tespiti" ${f.jobType === 'deger-tespiti' ? 'selected' : ''}>Değer tespiti (2/3)</option>` : ''}
        </select>
      </label>
      ${isMotor ? `<label class="aih-field"><span>Değer kaybı</span>
        <select data-aih="fee.degerKaybi">
          <option value="yok" ${f.degerKaybi === 'yok' ? 'selected' : ''}>Yok</option>
          <option value="tek-basina" ${f.degerKaybi === 'tek-basina' ? 'selected' : ''}>Tek başına (1.450 TL)</option>
          <option value="maddi-hasarla-birlikte" ${f.degerKaybi === 'maddi-hasarla-birlikte' ? 'selected' : ''}>Maddi hasarla birlikte (725 TL)</option>
        </select>
      </label>
      <label class="aih-check"><input type="checkbox" data-aih="fee.kttTanzim" ${f.kttTanzim ? 'checked' : ''} /> <span>KTT tanzim ücreti (2.100 TL)</span></label>` : ''}
      <label class="aih-check"><input type="checkbox" data-aih="fee.sehirDisi" ${f.sehirDisi ? 'checked' : ''} /> <span>Şehir dışı (%25 ilave)</span></label>
      <label class="aih-check"><input type="checkbox" data-aih="fee.kdvDahil" ${f.kdvDahil ? 'checked' : ''} /> <span>KDV dahil göster</span></label>
      ${f.kdvDahil ? `<label class="aih-field"><span>KDV oranı (%)</span><input data-aih="fee.kdvOrani" type="text" inputmode="decimal" value="${escapeHtml(f.kdvOrani)}" /></label>` : ''}
      <label class="aih-check"><input type="checkbox" data-aih="fee.travelEnabled" ${f.travelEnabled ? 'checked' : ''} /> <span>Yol masrafı hesapla</span></label>
      ${f.travelEnabled ? `<div class="aih-subform">
        <label class="aih-field"><span>Gidilen km</span><input data-aih="fee.km" type="text" inputmode="decimal" value="${escapeHtml(f.km)}" /></label>
        <label class="aih-field"><span>EPDK yakıt fiyatı (TL/lt)</span><input data-aih="fee.epdk" type="text" inputmode="decimal" value="${escapeHtml(f.epdk)}" /></label>
        <label class="aih-field"><span>Dosya sayısı</span><input data-aih="fee.fileCount" type="text" inputmode="numeric" value="${escapeHtml(f.fileCount)}" /></label>
        <label class="aih-field"><span>Otoyol</span><input data-aih="fee.highway" type="text" inputmode="decimal" value="${escapeHtml(f.highway)}" /></label>
        <label class="aih-field"><span>Köprü</span><input data-aih="fee.bridge" type="text" inputmode="decimal" value="${escapeHtml(f.bridge)}" /></label>
        <label class="aih-field"><span>Feribot</span><input data-aih="fee.ferry" type="text" inputmode="decimal" value="${escapeHtml(f.ferry)}" /></label>
        <label class="aih-field"><span>Otopark</span><input data-aih="fee.parking" type="text" inputmode="decimal" value="${escapeHtml(f.parking)}" /></label>
      </div>` : ''}
    </div>
    ${result ? renderFeeResult(result, isMotor) : '<p class="muted">Brüt hasar tutarı girince ücret otomatik hesaplanır.</p>'}
    <div class="app-alert warning">${icon('warning')}<span>Bu hesap yardım amaçlıdır. Resmî nihai ücret için tarife, dosya kapsamı ve eksper kontrolü esas alınmalıdır.</span></div>
  </div>`;
}

function renderFeeResult(r: FeeBreakdown, isMotor: boolean): string {
  const rows: string[] = [];
  rows.push(line('Kademe', String(r.kademe)));
  rows.push(line('Temel ücret (KDV hariç)', formatTL(r.baseFee)));
  if (r.vehicleMultiplier !== 1) rows.push(line(isMotor ? 'Araç grubu çarpanı' : 'Riziko çarpanı', '×' + r.vehicleMultiplier.toLocaleString('tr-TR')));
  if (r.jobTypeFactor !== 1) rows.push(line('İş tipi indirimi', '2/3 uygulandı'));
  rows.push(line('Ekspertiz ücreti', formatTL(r.ekspertizUcreti)));
  if (r.degerKaybiFee > 0) rows.push(line('Değer kaybı ücreti', formatTL(r.degerKaybiFee)));
  if (r.kttFee > 0) rows.push(line('KTT tanzim ücreti', formatTL(r.kttFee)));
  if (r.travelCost !== null && r.travelCost > 0) rows.push(line('Yol masrafı', formatTL(r.travelCost)));
  rows.push(line('<b>KDV hariç toplam</b>', '<b>' + formatTL(r.subtotalKdvHaric) + '</b>'));
  if (r.kdv > 0) {
    rows.push(line('KDV', formatTL(r.kdv)));
    rows.push(line('<b>KDV dahil toplam</b>', '<b>' + formatTL(r.total) + '</b>'));
  }

  const warnings: string[] = [];
  if (r.missingInputs.length) warnings.push('Eksik giriş: ' + r.missingInputs.join(', '));
  if (r.mutabakatGerekli) warnings.push('Üst kademe: tutar mutabakatla belirlenir.');

  return `<div class="aih-result">
    <div class="aih-result-head">${icon('labor')}<span>Hesap sonucu</span></div>
    <div class="aih-fee-table">${rows.join('')}</div>
    ${r.notes.length ? `<p class="muted">${escapeHtml(r.notes.join(' • '))}</p>` : ''}
    ${warnings.length ? `<div class="app-alert warning">${icon('warning')}<span>Kontrol gerekli: ${escapeHtml(warnings.join(' • '))}</span></div>` : ''}
  </div>`;
}

function line(label: string, value: string): string {
  return `<div class="aih-fee-row"><span>${label}</span><span>${value}</span></div>`;
}
