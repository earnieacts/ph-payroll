import { describe, it, expect } from 'vitest';
import { parseDecimal, formatFixed } from '../decimal/index.js';
import { sss, monthlySalaryCredit } from './sss.js';

/**
 * Every row of the published schedule in SSS Circular No. 2024-006, page 2,
 * transcribed from the circular itself.
 *
 * The implementation DERIVES these rather than looking them up. This test is the
 * cross-check: if the derivation is wrong, or a row was mistranscribed, the two
 * disagree and the test fails. Neither error can hide behind the other.
 *
 * Columns: [rangeLow, msc, employerTotal, employeeTotal, grandTotal]
 * `rangeLow` is the first peso amount that maps to this MSC.
 * `employerTotal` includes EC; `employeeTotal` does not (EC is employer-only).
 */
const ROWS: ReadonlyArray<readonly [string, string, string, string, string]> = [
  ['0', '5000', '510', '250', '760'],
  ['5250', '5500', '560', '275', '835'],
  ['5750', '6000', '610', '300', '910'],
  ['6250', '6500', '660', '325', '985'],
  ['6750', '7000', '710', '350', '1060'],
  ['7250', '7500', '760', '375', '1135'],
  ['7750', '8000', '810', '400', '1210'],
  ['8250', '8500', '860', '425', '1285'],
  ['8750', '9000', '910', '450', '1360'],
  ['9250', '9500', '960', '475', '1435'],
  ['9750', '10000', '1010', '500', '1510'],
  ['10250', '10500', '1060', '525', '1585'],
  ['10750', '11000', '1110', '550', '1660'],
  ['11250', '11500', '1160', '575', '1735'],
  ['11750', '12000', '1210', '600', '1810'],
  ['12250', '12500', '1260', '625', '1885'],
  ['12750', '13000', '1310', '650', '1960'],
  ['13250', '13500', '1360', '675', '2035'],
  ['13750', '14000', '1410', '700', '2110'],
  ['14250', '14500', '1460', '725', '2185'],
  // EC steps from 10 to 30 here, at MSC 15,000.
  ['14750', '15000', '1530', '750', '2280'],
  ['15250', '15500', '1580', '775', '2355'],
  ['15750', '16000', '1630', '800', '2430'],
  ['16250', '16500', '1680', '825', '2505'],
  ['16750', '17000', '1730', '850', '2580'],
  ['17250', '17500', '1780', '875', '2655'],
  ['17750', '18000', '1830', '900', '2730'],
  ['18250', '18500', '1880', '925', '2805'],
  ['18750', '19000', '1930', '950', '2880'],
  ['19250', '19500', '1980', '975', '2955'],
  ['19750', '20000', '2030', '1000', '3030'],
  // MPF begins here: MSC above 20,000 funds the provident fund.
  ['20250', '20500', '2080', '1025', '3105'],
  ['20750', '21000', '2130', '1050', '3180'],
  ['21250', '21500', '2180', '1075', '3255'],
  ['21750', '22000', '2230', '1100', '3330'],
  ['22250', '22500', '2280', '1125', '3405'],
  ['22750', '23000', '2330', '1150', '3480'],
  ['23250', '23500', '2380', '1175', '3555'],
  ['23750', '24000', '2430', '1200', '3630'],
  ['24250', '24500', '2480', '1225', '3705'],
  ['24750', '25000', '2530', '1250', '3780'],
  ['25250', '25500', '2580', '1275', '3855'],
  ['25750', '26000', '2630', '1300', '3930'],
  ['26250', '26500', '2680', '1325', '4005'],
  ['26750', '27000', '2730', '1350', '4080'],
  ['27250', '27500', '2780', '1375', '4155'],
  ['27750', '28000', '2830', '1400', '4230'],
  ['28250', '28500', '2880', '1425', '4305'],
  ['28750', '29000', '2930', '1450', '4380'],
  ['29250', '29500', '2980', '1475', '4455'],
  ['29750', '30000', '3030', '1500', '4530'],
  ['30250', '30500', '3080', '1525', '4605'],
  ['30750', '31000', '3130', '1550', '4680'],
  ['31250', '31500', '3180', '1575', '4755'],
  ['31750', '32000', '3230', '1600', '4830'],
  ['32250', '32500', '3280', '1625', '4905'],
  ['32750', '33000', '3330', '1650', '4980'],
  ['33250', '33500', '3380', '1675', '5055'],
  ['33750', '34000', '3430', '1700', '5130'],
  ['34250', '34500', '3480', '1725', '5205'],
  ['34750', '35000', '3530', '1750', '5280'],
];

const PERIOD = '2026-03';
const peso = (v: bigint) => formatFixed(v, 2);
const fmt = (s: string) => formatFixed(parseDecimal(s), 2);

describe('SSS Circular 2024-006 schedule', () => {
  it('has all 61 published rows transcribed', () => {
    expect(ROWS).toHaveLength(61);
  });

  it.each(ROWS)(
    'range from %s maps to MSC %s: employer %s, employee %s, total %s',
    (rangeLow, msc, employerTotal, employeeTotal, grandTotal) => {
      const r = sss(parseDecimal(rangeLow), PERIOD);
      expect(peso(r.msc)).toBe(fmt(msc));
      expect(peso(r.employer)).toBe(fmt(employerTotal));
      expect(peso(r.employee)).toBe(fmt(employeeTotal));
      expect(peso(r.employer + r.employee)).toBe(fmt(grandTotal));
    },
  );

  it('gives the same result at the top of each range as at the bottom', () => {
    // The row is a RANGE. Every peso inside it must produce one answer, and the
    // last centavo before the next boundary is where an off-by-one shows up.
    for (const [rangeLow, msc] of ROWS) {
      const low = parseDecimal(rangeLow);
      const atLow = monthlySalaryCredit(low, PERIOD);
      expect(peso(atLow), `bottom of range ${rangeLow}`).toBe(fmt(msc));
    }
    for (let i = 0; i < ROWS.length - 1; i++) {
      const nextLow = parseDecimal(ROWS[i + 1]![0]);
      const lastCentavo = nextLow - parseDecimal('0.01');
      expect(peso(monthlySalaryCredit(lastCentavo, PERIOD)), `top of range ${i}`).toBe(
        fmt(ROWS[i]![1]),
      );
    }
  });
});

describe('SSS bracket boundaries', () => {
  const msc = (s: string) => peso(monthlySalaryCredit(parseDecimal(s), PERIOD));

  it('floors at MSC 5,000 for anything below 5,250', () => {
    expect(msc('0')).toBe('5000.00');
    expect(msc('1')).toBe('5000.00');
    expect(msc('5000')).toBe('5000.00');
    expect(msc('5249.99')).toBe('5000.00');
  });

  it('steps up exactly at X,250', () => {
    expect(msc('5249.99')).toBe('5000.00');
    expect(msc('5250')).toBe('5500.00');
    expect(msc('5749.99')).toBe('5500.00');
    expect(msc('5750')).toBe('6000.00');
  });

  it('ceilings at MSC 35,000 from 34,750 upward', () => {
    expect(msc('34749.99')).toBe('34500.00');
    expect(msc('34750')).toBe('35000.00');
    expect(msc('100000')).toBe('35000.00');
    expect(msc('9999999')).toBe('35000.00');
  });
});

describe('programme split', () => {
  it('routes nothing to MPF at or below MSC 20,000', () => {
    const r = sss(parseDecimal('19750'), PERIOD);
    expect(peso(r.msc)).toBe('20000.00');
    expect(peso(r.mpfMsc)).toBe('0.00');
    expect(peso(r.detail.employeeMpf)).toBe('0.00');
  });

  it('routes only the excess above 20,000 to MPF', () => {
    const r = sss(parseDecimal('25000'), PERIOD);
    expect(peso(r.regularSsMsc)).toBe('20000.00');
    expect(peso(r.mpfMsc)).toBe('5000.00');
    expect(peso(r.detail.employeeMpf)).toBe('250.00'); // 5% of 5,000
    expect(peso(r.detail.employerMpf)).toBe('500.00'); // 10% of 5,000
  });

  it('caps the Regular SS slice at 20,000 even at the MSC ceiling', () => {
    const r = sss(parseDecimal('50000'), PERIOD);
    expect(peso(r.regularSsMsc)).toBe('20000.00');
    expect(peso(r.mpfMsc)).toBe('15000.00');
  });

  it('charges EC 10 below MSC 15,000 and 30 at or above', () => {
    expect(peso(sss(parseDecimal('14250'), PERIOD).detail.ec)).toBe('10.00');
    expect(peso(sss(parseDecimal('14750'), PERIOD).detail.ec)).toBe('30.00');
  });

  it('keeps EC out of the employee deduction entirely', () => {
    const r = sss(parseDecimal('25000'), PERIOD);
    expect(peso(r.employee)).toBe('1250.00'); // no EC component
    expect(peso(r.employer)).toBe('2530.00'); // 2,000 + 500 + 30 EC
  });

  it('refuses a period before the circular took effect', () => {
    // Circular 2024-006 repealed 2022-033. Applying 2025 rates to 2024 would be
    // wrong by a full rate step.
    expect(() => sss(parseDecimal('25000'), '2024-06')).toThrow();
  });
});
