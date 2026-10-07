export function readCliOption(args: readonly string[], name: `--${string}`): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === name) {
      const value = args[index + 1]?.trim();
      return value && !value.startsWith('--') ? value : undefined;
    }
    if (argument.startsWith(`${name}=`)) {
      return argument.slice(name.length + 1).trim() || undefined;
    }
  }
  return undefined;
}
