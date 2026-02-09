import { ChangedFile, TestCoverageReport, TestCoverageGap } from '../types.js';
import { mapTestFiles } from './test-mapper.js';

/**
 * Checks whether changed source files have corresponding test changes in the
 * same PR.  Returns a report with a coverage ratio and a list of "gaps" --
 * source files whose tests were not updated.
 */
export async function checkTestCoverage(
  repoPath: string,
  changedFiles: ChangedFile[],
): Promise<TestCoverageReport> {
  const sourceFiles = changedFiles.filter((f) => f.category === 'source');
  const changedTestPaths = new Set(
    changedFiles.filter((f) => f.category === 'test').map((f) => f.path),
  );

  if (sourceFiles.length === 0) {
    return {
      changedSourceFiles: 0,
      sourceFilesWithTestChanges: 0,
      coverageRatio: 1,
      gaps: [],
    };
  }

  const gaps: TestCoverageGap[] = [];
  let sourceFilesWithTestChanges = 0;

  for (const source of sourceFiles) {
    const expectedTestFiles = await mapTestFiles(repoPath, source.path);
    const testFileExists = expectedTestFiles.length > 0;
    const testFileChanged = expectedTestFiles.some((t) =>
      changedTestPaths.has(t),
    );

    if (testFileChanged) {
      sourceFilesWithTestChanges++;
    } else {
      gaps.push({
        sourceFile: source.path,
        expectedTestFiles,
        testFileExists,
        testFileChanged: false,
      });
    }
  }

  const coverageRatio =
    sourceFiles.length > 0
      ? sourceFilesWithTestChanges / sourceFiles.length
      : 0;

  return {
    changedSourceFiles: sourceFiles.length,
    sourceFilesWithTestChanges,
    coverageRatio,
    gaps,
  };
}
