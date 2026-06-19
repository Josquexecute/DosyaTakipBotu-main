import { generateHeavyDamageAssessmentNote } from '../../shared/heavy-damage-rules';
import type { HeavyDamageAssessmentPreview, HeavyDamageAssessmentRecord } from '../../shared/heavy-damage-types';

export class HeavyDamageNoteService {
  generate(assessment: HeavyDamageAssessmentPreview | HeavyDamageAssessmentRecord): string {
    return generateHeavyDamageAssessmentNote(assessment);
  }
}
