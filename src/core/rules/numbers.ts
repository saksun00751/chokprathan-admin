/** Number-entry tools for the bet slip: กลับเลข, 19 ประตู, รูดหน้า/หลัง, เบิ้ล, ตอง. */

const ONE_DIGIT = /^[0-9]$/;
const DIGITS = "0123456789".split("");

function assertDigit(d: string) {
  if (!ONE_DIGIT.test(d)) throw new RangeError(`ต้องเป็นตัวเลขหลักเดียว (ได้รับ "${d}")`);
}

export function uniq(list: readonly string[]): string[] {
  return [...new Set(list)];
}

/** All distinct orderings of the digits, sorted ascending. */
export function permutations(n: string): string[] {
  if (!/^[0-9]{1,4}$/.test(n)) throw new RangeError(`กลับเลขได้เฉพาะตัวเลข 1-4 หลัก (ได้รับ "${n}")`);
  const out = new Set<string>();
  const walk = (prefix: string, rest: string) => {
    if (rest.length === 0) {
      out.add(prefix);
      return;
    }
    for (let i = 0; i < rest.length; i++) walk(prefix + rest[i], rest.slice(0, i) + rest.slice(i + 1));
  };
  walk("", n);
  return [...out].sort();
}

/** Every two-digit number containing the digit: 19 numbers. */
export function nineteenDoors(d: string): string[] {
  assertDigit(d);
  return uniq([...swipeFront(d), ...swipeBack(d)]);
}

export function swipeFront(d: string): string[] {
  assertDigit(d);
  return DIGITS.map((x) => d + x);
}

export function swipeBack(d: string): string[] {
  assertDigit(d);
  return DIGITS.map((x) => x + d);
}

export function doubles(): string[] {
  return DIGITS.map((x) => x + x);
}

export function triples(): string[] {
  return DIGITS.map((x) => x + x + x);
}
