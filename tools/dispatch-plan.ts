import { readFileSync } from 'node:fs';

type Version = [number, number, number];

interface OpenPr {
  branch: string;
  version: Version;
  major: boolean;
}

/**
 * Decides what the regenerate workflow does with one spec-published dispatch: refuse it, skip it, or regenerate, with
 * the commit type, the auto-merge choice and the older regenerate PRs to close. The rules of puntjes-dotnet.
 */
export function dispatchPlan(args: string[], out: (line: string) => void, err: (line: string) => void): number {
  const [tag = '', level = '', url = '', source = '', open = ''] = args;
  const current = version(tag);

  if (current === null) {
    err(`The tag ${tag} is not vX.Y.Z.`);
    return 1;
  }

  if (url !== `https://raw.githubusercontent.com/PuntjesApp/puntjes-openapi/${tag}/api.json`) {
    err(`The url is not api.json of puntjes-openapi at ${tag}.`);
    return 1;
  }

  if (level !== 'major' && level !== 'minor' && level !== 'patch') {
    err(`The level ${level} is not major, minor or patch.`);
    return 1;
  }

  const sourced = version(source.trim());
  const openPrs: OpenPr[] = open
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .flatMap((line) => {
      const [branch = '', title = ''] = splitOnce(line);
      const found = branch.startsWith('regenerate/') ? version(branch.slice('regenerate/'.length)) : null;
      return found === null ? [] : [{ branch, version: found, major: title.startsWith('feat!:') }];
    });

  const skip = (sourced !== null && compare(sourced, current) >= 0) || openPrs.some((pr) => compare(pr.version, current) > 0);
  const close = skip ? [] : openPrs.filter((pr) => compare(pr.version, current) < 0);
  const major = level === 'major' || close.some((pr) => pr.major) || (sourced !== null && sourced[0] < current[0]);

  out(`skip=${skip}`);
  out(`commit_type=${major ? 'feat!' : level === 'minor' ? 'feat' : 'fix'}`);
  out(`auto_merge=${!major}`);
  out(`branch=regenerate/${tag}`);
  out(`close=${close.map((pr) => pr.branch).join(' ')}`);

  return 0;
}

function version(reference: string): Version | null {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(reference);

  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compare(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function splitOnce(line: string): [string, string] {
  const space = line.search(/\s/);

  return space === -1 ? [line, ''] : [line.slice(0, space), line.slice(space).trim()];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [tag = '', level = '', url = '', open = ''] = process.argv.slice(2);
  const source = readFileSync('spec/SOURCE', 'utf8');
  process.exitCode = dispatchPlan([tag, level, url, source, open], (line) => console.log(line), (line) => console.error(line));
}
