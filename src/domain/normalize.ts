export const normalizeJa = (s: string) => s.trim().normalize('NFKC');
export const normalizeEn = (s: string) => s.trim().normalize('NFC').toLowerCase();
export const splitCandidates = (def: string) =>
  def
    .split(/[,、，]/)
    .map(normalizeJa)
    .filter((c) => c.length > 0);

/** 英→日: 登録された日本語訳のいずれかの候補と完全一致すれば正解 */
export function checkJa(definition: string, input: string): boolean {
  const answer = normalizeJa(input);
  if (answer.length === 0) return false;
  return splitCandidates(definition).includes(answer);
}

/** 日→英: 英単語と完全一致すれば正解 */
export function checkEn(englishTerm: string, input: string): boolean {
  const answer = normalizeEn(input);
  if (answer.length === 0) return false;
  return normalizeEn(englishTerm) === answer;
}
