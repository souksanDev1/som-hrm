/**
 * Lao administrative divisions for the address picker (FR-EMP-01.4).
 * 17 provinces + Vientiane Capital; codes follow ISO 3166-2:LA. Villages (ບ້ານ) and
 * districts (ເມືອງ) stay free text.
 */
export interface LaoProvince {
  code: string;
  lo: string;
  en: string;
}

export const LAO_PROVINCES = [
  { code: 'VT', lo: 'ນະຄອນຫຼວງວຽງຈັນ', en: 'Vientiane Capital' },
  { code: 'AT', lo: 'ອັດຕະປື', en: 'Attapeu' },
  { code: 'BK', lo: 'ບໍ່ແກ້ວ', en: 'Bokeo' },
  { code: 'BL', lo: 'ບໍລິຄຳໄຊ', en: 'Bolikhamxay' },
  { code: 'CH', lo: 'ຈຳປາສັກ', en: 'Champasak' },
  { code: 'HO', lo: 'ຫົວພັນ', en: 'Houaphanh' },
  { code: 'KH', lo: 'ຄຳມ່ວນ', en: 'Khammouane' },
  { code: 'LM', lo: 'ຫຼວງນ້ຳທາ', en: 'Luang Namtha' },
  { code: 'LP', lo: 'ຫຼວງພະບາງ', en: 'Luang Prabang' },
  { code: 'OU', lo: 'ອຸດົມໄຊ', en: 'Oudomxay' },
  { code: 'PH', lo: 'ຜົ້ງສາລີ', en: 'Phongsaly' },
  { code: 'SL', lo: 'ສາລະວັນ', en: 'Salavan' },
  { code: 'SV', lo: 'ສະຫວັນນະເຂດ', en: 'Savannakhet' },
  { code: 'VI', lo: 'ວຽງຈັນ', en: 'Vientiane Province' },
  { code: 'XA', lo: 'ໄຊຍະບູລີ', en: 'Xayaboury' },
  { code: 'XE', lo: 'ເຊກອງ', en: 'Sekong' },
  { code: 'XI', lo: 'ຊຽງຂວາງ', en: 'Xiangkhouang' },
  { code: 'XS', lo: 'ໄຊສົມບູນ', en: 'Xaisomboun' },
] as const satisfies readonly LaoProvince[];

export type LaoProvinceCode = (typeof LAO_PROVINCES)[number]['code'];
export const LAO_PROVINCE_CODES = LAO_PROVINCES.map((p) => p.code) as [LaoProvinceCode, ...LaoProvinceCode[]];

/** Province name in the given locale, or the raw value when it is not a known code. */
export const laoProvinceName = (code: string | null | undefined, locale: 'lo' | 'en'): string | null => {
  if (!code) return null;
  const p = LAO_PROVINCES.find((x) => x.code === code);
  return p ? p[locale] : code;
};

/**
 * Resolve a province from a code or a Lao/English name (case- and space-insensitive), e.g. for
 * spreadsheet imports. Returns the code or null.
 */
export const findLaoProvinceCode = (value: string | null | undefined): LaoProvinceCode | null => {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const v = value ? norm(value) : '';
  if (!v) return null;
  return LAO_PROVINCES.find((p) => norm(p.code) === v || norm(p.lo) === v || norm(p.en) === v)?.code ?? null;
};
