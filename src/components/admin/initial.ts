/** The first letter of a name, shown when no portrait is chosen. Thai vowels written before their consonant are skipped. */
export const initial = (name: string): string | undefined => [...name.replace(/^[\sเ-ไ]+/, "")][0]?.toUpperCase();
