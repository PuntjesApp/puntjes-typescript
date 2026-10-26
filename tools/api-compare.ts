const DECLARATION = /^export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:const|type|interface|class|function|enum|namespace)\s+[\w$]+/;
const CHOICES = /^(.*?)((?:'[^']*'|null)(?:\s*\|\s*(?:'[^']*'|null))+)(.*)$/;
const CHOICE = /'[^']*'|null/g;

type Declarations = Map<string, string[]>;

/**
 * Lists every public declaration that the new API report removes or changes, as one line each. An added declaration, an
 * added member or a choice added to a union of literals is not listed. Both arguments are API Extractor reports.
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
    const lost = lines.filter((line) => !kept.has(line) && !current.some((now) => widens(line, now)));

    if (lost.length > 0) {
      findings.push(`${name} changed. No longer there: ${lost.map((line) => line.trim()).join(' | ')}`);
    }
  }

  return findings;
}

function widens(before: string, after: string): boolean {
  const [, oldHead, oldChoices = '', oldTail] = before.trimEnd().match(CHOICES) ?? [];
  const [, newHead, newChoices = '', newTail] = after.trimEnd().match(CHOICES) ?? [];

  if (oldHead === undefined || oldHead !== newHead || oldTail !== newTail) {
    return false;
  }

  const choices = new Set(newChoices.match(CHOICE));

  return (oldChoices.match(CHOICE) ?? []).every((choice) => choices.has(choice));
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
