import { describe, expect, it } from 'vitest';
import { nameInitial } from '../src';

describe('nameInitial', () => {
  it('takes the first letter', () => {
    expect(nameInitial('ບົວພັນ ສີສຸວັນ')).toBe('ບ');
    expect(nameInitial('Alice')).toBe('A');
  });
  it('skips a pre-posed Lao vowel for the consonant after it', () => {
    expect(nameInitial('ເພັດ ດາວັນ')).toBe('ພ');
    expect(nameInitial('ແສງ')).toBe('ສ');
    expect(nameInitial('ໂຊກ')).toBe('ຊ');
  });
  it('copes with blank names and a lone vowel', () => {
    expect(nameInitial('  ')).toBe('');
    expect(nameInitial('ເ')).toBe('ເ');
  });
});
