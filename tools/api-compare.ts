const DECLARATION = /^export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:const|type|interface|class|function|enum|namespace)\s+[\w$]+/;

type Declarations = Map<string, string[]>;

/**
 * Lists every public declaration that the new API report removes or changes, as one line each. An added declaration or
 * an added member is not listed. Both arguments are API Extractor reports.
 */
export function removedOrChanged(oldReport: string, newReport: string): string[] {
  const before = declarations(oldReport);
  const after = declarations(newReport);
  const findings: string[] = [];

  for (const [name, lines] of before) {
    const current = after.get(name);

    if (current === undefined) {
      findings.push(`${name} was removed.`);
      continue;
    }

    const kept = new Set(current);
    const lost = lines.filter((line) => !kept.has(line));

    if (lost.length > 0) {
      findings.push(`${name} changed. No longer there: ${lost.map((line) => line.trim()).join(' | ')}`);
    }
  }

  return findings;
}

function declarations(report: string): Declarations {
  const found: Declarations = new Map();
  const body = report.split('```ts')[1]?.split('```')[0] ?? '';

  for (const block of body.split(/\n\s*\n/)) {
    const lines = block.split('\n').filter((line) => line.trim() !== '' && !line.trim().startsWith('//'));
    const header = lines[0]?.match(DECLARATION)?.[0] ?? lines[0];

    if (header !== undefined) {
      found.set(header, [...(found.get(header) ?? []), ...lines]);
    }
  }

  return found;
}
