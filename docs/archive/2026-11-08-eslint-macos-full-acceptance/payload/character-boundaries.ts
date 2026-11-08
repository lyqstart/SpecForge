/** Explicit UTF-16 scan for the ASCII controls rejected by existing path/command contracts. */
export function hasAsciiControl(
  value: string,
  options: { includeSpace?: boolean; includeDelete?: boolean } = {}
): boolean {
  const maximum = options.includeSpace ? 0x20 : 0x1f;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= maximum || (options.includeDelete === true && code === 0x7f)) return true;
  }
  return false;
}
