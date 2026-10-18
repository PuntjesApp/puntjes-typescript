import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Extractor, ExtractorConfig, ExtractorLogLevel } from '@microsoft/api-extractor';
import { removedOrChanged } from './api-compare.ts';

const BREAKING_TITLE = /^\w+(\([^)]*\))?!:/;
const BREAKING_BODY = /^BREAKING[ -]CHANGE:/m;

/**
 * Compares the public API of the built package with the last npm release. A removed or changed public declaration
 * fails unless the PR title is `type!:` or the PR body has a `BREAKING CHANGE:` line.
 */
function main(oldEntry: string, newEntry: string, title: string, body: string): number {
  const findings = removedOrChanged(report(oldEntry), report(newEntry));

  if (findings.length === 0) {
    console.log('The public API keeps every declaration of the last release.');
    return 0;
  }

  console.log(findings.map((finding) => `- ${finding}`).join('\n'));

  if (BREAKING_TITLE.test(title) || BREAKING_BODY.test(body)) {
    console.log('\nThe PR is marked as breaking, so this is allowed.');
    return 0;
  }

  console.error(
    '\nThis PR breaks the public API of the last release, and its title is not marked as breaking.' +
      '\nRetitle it with `feat!:` (or `fix!:`), or add a `BREAKING CHANGE:` line to the body. CI runs again at once.' +
      '\nThe release is then a major version.',
  );
  return 1;
}

function report(entry: string): string {
  const folder = mkdtempSync(join(tmpdir(), 'api-report-'));
  const config = ExtractorConfig.prepare({
    configObject: {
      projectFolder: process.cwd(),
      mainEntryPointFilePath: entry,
      compiler: {
        overrideTsconfig: {
          compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', skipLibCheck: true, types: ['node'] },
        },
      },
      apiReport: { enabled: true, reportFileName: 'api.md', reportFolder: folder, reportTempFolder: folder },
      docModel: { enabled: false },
      dtsRollup: { enabled: false },
      tsdocMetadata: { enabled: false },
      messages: { extractorMessageReporting: { default: { logLevel: ExtractorLogLevel.None } } },
    },
    configObjectFullPath: join(process.cwd(), 'api-extractor.json'),
    packageJsonFullPath: join(process.cwd(), 'package.json'),
  });
  const result = Extractor.invoke(config, { localBuild: true });

  if (!result.succeeded) {
    throw new Error(`API Extractor failed on ${entry}.`);
  }

  return readFileSync(config.reportFilePath, 'utf8');
}

const [oldEntry = '', newEntry = ''] = process.argv.slice(2);
process.exitCode = main(oldEntry, newEntry, process.env.PR_TITLE ?? '', process.env.PR_BODY ?? '');
