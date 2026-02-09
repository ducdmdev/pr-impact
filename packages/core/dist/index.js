// src/analyzer.ts
import simpleGit4 from "simple-git";

// src/diff/diff-parser.ts
import simpleGit from "simple-git";

// src/diff/file-categorizer.ts
var SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".scala",
  ".cs",
  ".vue",
  ".svelte"
]);
var DOC_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".mdx", ".txt", ".rst"]);
var CONFIG_FILENAMES = /* @__PURE__ */ new Set([
  "package.json",
  "tsconfig.json",
  "turbo.json",
  "dockerfile",
  "makefile",
  ".gitignore",
  ".npmrc",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json"
]);
var CONFIG_PREFIXES = [
  ".eslintrc",
  ".prettierrc",
  "webpack.config.",
  "vite.config.",
  "jest.config.",
  "vitest.config.",
  "docker-compose.",
  ".env"
];
function isTestFile(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const fileName = normalized.split("/").pop() ?? "";
  return normalized.includes("__tests__/") || normalized.includes("__tests__\\") || normalized.includes("/test/") || normalized.includes("/tests/") || fileName.includes(".test.") || fileName.includes(".spec.") || fileName.startsWith("test");
}
function isDocFile(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const ext = getExtension(filePath);
  return DOC_EXTENSIONS.has(ext) || normalized.startsWith("docs/") || normalized.startsWith("doc/");
}
function isConfigFile(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const fileName = (normalized.split("/").pop() ?? "").toLowerCase();
  if (normalized.startsWith(".github/")) {
    return true;
  }
  if (CONFIG_FILENAMES.has(fileName)) {
    return true;
  }
  for (const prefix of CONFIG_PREFIXES) {
    if (fileName.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}
function isSourceFile(filePath) {
  const ext = getExtension(filePath);
  return SOURCE_EXTENSIONS.has(ext);
}
function getExtension(filePath) {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filePath.slice(lastDot).toLowerCase();
}
function categorizeFile(filePath) {
  if (isTestFile(filePath)) return "test";
  if (isDocFile(filePath)) return "doc";
  if (isConfigFile(filePath)) return "config";
  if (isSourceFile(filePath)) return "source";
  return "other";
}

// src/diff/diff-parser.ts
var EXTENSION_LANGUAGE_MAP = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".scala": "scala",
  ".cs": "csharp",
  ".vue": "vue",
  ".svelte": "svelte",
  ".md": "markdown",
  ".mdx": "markdown",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".xml": "xml",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".sql": "sql",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".dockerfile": "dockerfile",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".proto": "protobuf",
  ".txt": "text",
  ".rst": "restructuredtext"
};
function detectLanguage(filePath) {
  const fileName = filePath.split("/").pop() ?? "";
  const lowerName = fileName.toLowerCase();
  if (lowerName === "dockerfile") return "dockerfile";
  if (lowerName === "makefile") return "makefile";
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return "unknown";
  const ext = filePath.slice(lastDot).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] ?? "unknown";
}
function resolveFilePath(raw) {
  const braceMatch = raw.match(/^(.*?)\{(.+?) => (.+?)\}(.*)$/);
  if (braceMatch) {
    const [, prefix, oldPart, newPart, suffix] = braceMatch;
    const oldPath = `${prefix}${oldPart}${suffix}`.replace(/\/\//g, "/");
    const newPath = `${prefix}${newPart}${suffix}`.replace(/\/\//g, "/");
    return { newPath, oldPath };
  }
  const simpleMatch = raw.match(/^(.+?) => (.+?)$/);
  if (simpleMatch) {
    return { newPath: simpleMatch[2], oldPath: simpleMatch[1] };
  }
  return { newPath: raw };
}
function determineStatus(filePath, created, deleted, renamed) {
  if (created.includes(filePath)) return "added";
  if (deleted.includes(filePath)) return "deleted";
  if (renamed.includes(filePath)) return "renamed";
  return "modified";
}
async function parseDiff(repoPath, base, head) {
  const git = simpleGit(repoPath);
  const diffSummary = await git.diffSummary([`${base}..${head}`]);
  const createdFiles = diffSummary.created ?? [];
  const deletedFiles = diffSummary.deleted ?? [];
  const renamedFiles = diffSummary.renamed ?? [];
  const changedFiles = [];
  for (const file of diffSummary.files) {
    const { newPath, oldPath } = resolveFilePath(file.file);
    const status = determineStatus(
      file.file,
      createdFiles,
      deletedFiles,
      renamedFiles
    );
    const finalStatus = status === "modified" && oldPath ? "renamed" : status;
    const changedFile = {
      path: newPath,
      status: finalStatus,
      additions: "insertions" in file ? file.insertions : 0,
      deletions: "deletions" in file ? file.deletions : 0,
      language: detectLanguage(newPath),
      category: categorizeFile(newPath)
    };
    if (oldPath) {
      changedFile.oldPath = oldPath;
    }
    changedFiles.push(changedFile);
  }
  return changedFiles;
}

// src/breaking/detector.ts
import simpleGit2 from "simple-git";

// src/breaking/export-differ.ts
var EXPORT_FUNCTION_RE = /export\s+(?:async\s+)?function\s+(\w+)\s*(\([^)]*\)(?:\s*:\s*[^{;]+)?)/g;
var EXPORT_DEFAULT_FUNCTION_RE = /export\s+default\s+(?:async\s+)?function\s+(\w+)\s*(\([^)]*\)(?:\s*:\s*[^{;]+)?)/g;
var EXPORT_DEFAULT_ANON_FUNCTION_RE = /export\s+default\s+(?:async\s+)?function\s*(\([^)]*\)(?:\s*:\s*[^{;]+)?)/g;
var EXPORT_CLASS_RE = /export\s+class\s+(\w+)/g;
var EXPORT_DEFAULT_CLASS_RE = /export\s+default\s+class\s+(\w+)/g;
var EXPORT_VARIABLE_RE = /export\s+(const|let|var)\s+(\w+)\s*(?::\s*([^=;]+?))?(?:\s*=|;)/g;
var EXPORT_INTERFACE_RE = /export\s+interface\s+(\w+)/g;
var EXPORT_TYPE_RE = /export\s+type\s+(\w+)/g;
var EXPORT_ENUM_RE = /export\s+enum\s+(\w+)/g;
var EXPORT_NAMED_RE = /export\s*\{([^}]+)\}/g;
var EXPORT_DEFAULT_EXPR_RE = /export\s+default\s+(?!function|class|interface|type|enum)(\w+)/g;
function stripComments(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
function normalizeSignature(sig) {
  return sig.replace(/\s+/g, " ").trim();
}
function parseExports(content, filePath) {
  const symbols = [];
  const seen = /* @__PURE__ */ new Set();
  const stripped = stripComments(content);
  function addSymbol(sym) {
    const key = sym.isDefault ? `default::${sym.name}` : sym.name;
    if (!seen.has(key)) {
      seen.add(key);
      symbols.push(sym);
    }
  }
  {
    const re = new RegExp(EXPORT_DEFAULT_FUNCTION_RE.source, "g");
    let m;
    while ((m = re.exec(stripped)) !== null) {
      addSymbol({
        name: m[1],
        kind: "function",
        signature: normalizeSignature(m[2]),
        isDefault: true
      });
    }
  }
  {
    const re = new RegExp(EXPORT_DEFAULT_ANON_FUNCTION_RE.source, "g");
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const beforeParen = stripped.substring(0, m.index + m[0].indexOf("("));
      if (/function\s*$/.test(beforeParen)) {
        addSymbol({
          name: "default",
          kind: "function",
          signature: normalizeSignature(m[1]),
          isDefault: true
        });
      }
    }
  }
  {
    const re = new RegExp(EXPORT_FUNCTION_RE.source, "g");
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const prefix = stripped.substring(Math.max(0, m.index - 10), m.index + 7);
      if (prefix.includes("default")) continue;
      addSymbol({
        name: m[1],
        kind: "function",
        signature: normalizeSignature(m[2]),
        isDefault: false
      });
    }
  }
  {
    const re = new RegExp(EXPORT_DEFAULT_CLASS_RE.source, "g");
    let m;
    while ((m = re.exec(stripped)) !== null) {
      addSymbol({
        name: m[1],
        kind: "class",
        isDefault: true
      });
    }
  }
  {
    const re = new RegExp(EXPORT_CLASS_RE.source, "g");
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const prefix = stripped.substring(Math.max(0, m.index - 10), m.index + 7);
      if (prefix.includes("default")) continue;
      addSymbol({
        name: m[1],
        kind: "class",
        isDefault: false
      });
    }
  }
  {
    const re = new RegExp(EXPORT_VARIABLE_RE.source, "g");
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const varKeyword = m[1];
      const name = m[2];
      const typeAnnotation = m[3] ? normalizeSignature(m[3]) : void 0;
      addSymbol({
        name,
        kind: varKeyword === "const" ? "const" : "variable",
        signature: typeAnnotation,
        isDefault: false
      });
    }
  }
  {
    const re = new RegExp(EXPORT_INTERFACE_RE.source, "g");
    let m;
    while ((m = re.exec(stripped)) !== null) {
      addSymbol({
        name: m[1],
        kind: "interface",
        isDefault: false
      });
    }
  }
  {
    const re = new RegExp(EXPORT_TYPE_RE.source, "g");
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const afterMatch = stripped.substring(m.index + m[0].length).trimStart();
      if (afterMatch.startsWith("{")) continue;
      addSymbol({
        name: m[1],
        kind: "type",
        isDefault: false
      });
    }
  }
  {
    const re = new RegExp(EXPORT_ENUM_RE.source, "g");
    let m;
    while ((m = re.exec(stripped)) !== null) {
      addSymbol({
        name: m[1],
        kind: "enum",
        isDefault: false
      });
    }
  }
  {
    const re = new RegExp(EXPORT_NAMED_RE.source, "g");
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const preceding = stripped.substring(Math.max(0, m.index - 6), m.index);
      const isTypeOnly = /type\s*$/.test(preceding);
      const inner = m[1];
      const items = inner.split(",");
      for (const item of items) {
        const trimmed = item.trim();
        if (!trimmed) continue;
        const asMatch = trimmed.match(/^(\w+)\s+as\s+(\w+)$/);
        let exportedName;
        let isDefault = false;
        if (asMatch) {
          exportedName = asMatch[2];
          if (exportedName === "default") {
            isDefault = true;
            exportedName = asMatch[1];
          }
        } else {
          exportedName = trimmed;
        }
        if (!/^\w+$/.test(exportedName)) continue;
        addSymbol({
          name: exportedName,
          kind: isTypeOnly ? "type" : "variable",
          isDefault
        });
      }
    }
  }
  {
    const re = new RegExp(EXPORT_DEFAULT_EXPR_RE.source, "g");
    let m;
    while ((m = re.exec(stripped)) !== null) {
      addSymbol({
        name: m[1],
        kind: "variable",
        isDefault: true
      });
    }
  }
  return { filePath, symbols };
}
function diffExports(basePath, baseContent, headContent) {
  const baseExports = parseExports(baseContent, basePath);
  const headExports = parseExports(headContent, basePath);
  const baseMap = /* @__PURE__ */ new Map();
  for (const sym of baseExports.symbols) {
    const key = sym.isDefault ? `default::${sym.name}` : sym.name;
    baseMap.set(key, sym);
  }
  const headMap = /* @__PURE__ */ new Map();
  for (const sym of headExports.symbols) {
    const key = sym.isDefault ? `default::${sym.name}` : sym.name;
    headMap.set(key, sym);
  }
  const removed = [];
  const added = [];
  const modified = [];
  for (const [key, baseSym] of baseMap) {
    const headSym = headMap.get(key);
    if (!headSym) {
      removed.push(baseSym);
    } else {
      const baseSig = baseSym.signature ?? "";
      const headSig = headSym.signature ?? "";
      const kindChanged = baseSym.kind !== headSym.kind;
      const sigChanged = baseSig !== headSig;
      if (kindChanged || sigChanged) {
        modified.push({ before: baseSym, after: headSym });
      }
    }
  }
  for (const [key, headSym] of headMap) {
    if (!baseMap.has(key)) {
      added.push(headSym);
    }
  }
  return { removed, added, modified };
}

// src/breaking/signature-differ.ts
function normalize(s) {
  return s.replace(/\s+/g, " ").trim();
}
function splitParameters(paramStr) {
  const params = [];
  let depth = 0;
  let current = "";
  for (const ch of paramStr) {
    if (ch === "<" || ch === "(" || ch === "[" || ch === "{") {
      depth++;
      current += ch;
    } else if (ch === ">" || ch === ")" || ch === "]" || ch === "}") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      const trimmed2 = current.trim();
      if (trimmed2) params.push(trimmed2);
      current = "";
    } else {
      current += ch;
    }
  }
  const trimmed = current.trim();
  if (trimmed) params.push(trimmed);
  return params;
}
function parseSignature(sig) {
  const trimmed = normalize(sig);
  if (!trimmed.startsWith("(")) {
    return { params: [], returnType: null };
  }
  let depth = 0;
  let closeIndex = -1;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        closeIndex = i;
        break;
      }
    }
  }
  if (closeIndex === -1) {
    return { params: splitParameters(trimmed.slice(1)), returnType: null };
  }
  const paramStr = trimmed.slice(1, closeIndex);
  const params = paramStr.length > 0 ? splitParameters(paramStr) : [];
  const rest = trimmed.slice(closeIndex + 1).trim();
  let returnType = null;
  if (rest.startsWith(":")) {
    returnType = normalize(rest.slice(1));
  }
  return { params, returnType };
}
function extractParamType(param) {
  const cleaned = param.replace(/^\.\.\./, "").trim();
  let depth = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "<" || ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ">" || ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === ":" && depth === 0) {
      return normalize(cleaned.slice(i + 1));
    }
  }
  return normalize(cleaned);
}
function diffSignatures(baseSig, headSig) {
  if (baseSig === void 0 && headSig === void 0) {
    return { changed: false, details: "no signatures to compare" };
  }
  if (baseSig === void 0) {
    return { changed: true, details: "signature added" };
  }
  if (headSig === void 0) {
    return { changed: true, details: "signature removed" };
  }
  const normalizedBase = normalize(baseSig);
  const normalizedHead = normalize(headSig);
  if (normalizedBase === normalizedHead) {
    return { changed: false, details: "signatures are identical" };
  }
  const baseParsed = parseSignature(normalizedBase);
  const headParsed = parseSignature(normalizedHead);
  const differences = [];
  const baseCount = baseParsed.params.length;
  const headCount = headParsed.params.length;
  if (baseCount !== headCount) {
    differences.push(
      `parameter count changed from ${baseCount} to ${headCount}`
    );
  }
  const minCount = Math.min(baseCount, headCount);
  for (let i = 0; i < minCount; i++) {
    const baseType = extractParamType(baseParsed.params[i]);
    const headType = extractParamType(headParsed.params[i]);
    if (baseType !== headType) {
      const baseName = baseParsed.params[i].split(":")[0].replace(/[?.]/g, "").trim();
      differences.push(
        `parameter '${baseName}' type changed from '${baseType}' to '${headType}'`
      );
    }
  }
  const baseReturn = baseParsed.returnType;
  const headReturn = headParsed.returnType;
  if (baseReturn !== headReturn) {
    if (baseReturn === null) {
      differences.push(`return type added: '${headReturn}'`);
    } else if (headReturn === null) {
      differences.push(`return type removed (was '${baseReturn}')`);
    } else {
      differences.push(
        `return type changed from '${baseReturn}' to '${headReturn}'`
      );
    }
  }
  if (differences.length === 0) {
    return { changed: true, details: "signature changed" };
  }
  return { changed: true, details: differences.join("; ") };
}

// src/breaking/detector.ts
var ANALYZABLE_EXTENSIONS = /* @__PURE__ */ new Set([".ts", ".tsx", ".js", ".jsx"]);
function getExtension2(filePath) {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filePath.slice(lastDot).toLowerCase();
}
async function getFileAtRef(git, ref, filePath) {
  try {
    return await git.show([`${ref}:${filePath}`]);
  } catch {
    return null;
  }
}
async function detectBreakingChanges(repoPath, baseBranch, headBranch, changedFiles) {
  const git = simpleGit2(repoPath);
  const breakingChanges = [];
  const filesToAnalyze = changedFiles.filter((f) => {
    const ext = getExtension2(f.path);
    return ANALYZABLE_EXTENSIONS.has(ext) && (f.status === "modified" || f.status === "deleted");
  });
  for (const file of filesToAnalyze) {
    try {
      const baseContent = await getFileAtRef(git, baseBranch, file.path);
      if (baseContent === null) {
        continue;
      }
      if (file.status === "deleted") {
        const baseExports = parseExports(baseContent, file.path);
        for (const sym of baseExports.symbols) {
          breakingChanges.push({
            filePath: file.path,
            type: "removed_export",
            symbolName: sym.name,
            before: formatSymbolDescription(sym),
            after: null,
            severity: "high",
            consumers: []
          });
        }
      } else {
        const headContent = await getFileAtRef(git, headBranch, file.path);
        if (headContent === null) {
          continue;
        }
        const diff = diffExports(file.path, baseContent, headContent);
        for (const sym of diff.removed) {
          breakingChanges.push({
            filePath: file.path,
            type: "removed_export",
            symbolName: sym.name,
            before: formatSymbolDescription(sym),
            after: null,
            severity: "high",
            consumers: []
          });
        }
        for (const { before, after } of diff.modified) {
          const sigDiff = diffSignatures(before.signature, after.signature);
          if (sigDiff.changed || before.kind !== after.kind) {
            breakingChanges.push({
              filePath: file.path,
              type: before.kind !== after.kind ? "changed_type" : "changed_signature",
              symbolName: before.name,
              before: formatSymbolDescription(before),
              after: formatSymbolDescription(after),
              severity: "medium",
              consumers: []
            });
          }
        }
      }
    } catch (error) {
      continue;
    }
  }
  return breakingChanges;
}
function formatSymbolDescription(sym) {
  const parts = [];
  if (sym.isDefault) {
    parts.push("default");
  }
  parts.push(sym.kind);
  parts.push(sym.name);
  if (sym.signature) {
    parts.push(sym.signature);
  }
  return parts.join(" ");
}

// src/coverage/test-mapper.ts
import fg from "fast-glob";
import { posix as path } from "path";
async function mapTestFiles(repoPath, sourceFile) {
  const candidates = buildCandidatePaths(sourceFile);
  if (candidates.length === 0) {
    return [];
  }
  const existing = await fg(candidates, {
    cwd: repoPath,
    dot: false,
    onlyFiles: true
  });
  return existing;
}
var TEST_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
function buildCandidatePaths(sourceFile) {
  const normalized = sourceFile.replace(/\\/g, "/");
  const dir = path.dirname(normalized);
  const ext = path.extname(normalized);
  const base = path.basename(normalized, ext);
  const subPath = stripLeadingSourceDir(normalized);
  const subDir = path.dirname(subPath);
  const candidates = [];
  for (const testExt of TEST_EXTENSIONS) {
    candidates.push(path.join(dir, `${base}.test${testExt}`));
    candidates.push(path.join(dir, `${base}.spec${testExt}`));
    const testsDir = path.join(dir, "__tests__");
    candidates.push(path.join(testsDir, `${base}${testExt}`));
    candidates.push(path.join(testsDir, `${base}.test${testExt}`));
    candidates.push(path.join(testsDir, `${base}.spec${testExt}`));
    for (const topDir of ["test", "tests"]) {
      candidates.push(path.join(topDir, subDir, `${base}${testExt}`));
      candidates.push(path.join(topDir, subDir, `${base}.test${testExt}`));
      candidates.push(path.join(topDir, subDir, `${base}.spec${testExt}`));
    }
  }
  return [...new Set(candidates)];
}
function stripLeadingSourceDir(filePath) {
  const srcIndex = filePath.lastIndexOf("src/");
  if (srcIndex !== -1) {
    return filePath.slice(srcIndex + "src/".length);
  }
  const libIndex = filePath.lastIndexOf("lib/");
  if (libIndex !== -1) {
    return filePath.slice(libIndex + "lib/".length);
  }
  return filePath;
}

// src/coverage/coverage-checker.ts
async function checkTestCoverage(repoPath, changedFiles) {
  const sourceFiles = changedFiles.filter((f) => f.category === "source");
  const changedTestPaths = new Set(
    changedFiles.filter((f) => f.category === "test").map((f) => f.path)
  );
  if (sourceFiles.length === 0) {
    return {
      changedSourceFiles: 0,
      sourceFilesWithTestChanges: 0,
      coverageRatio: 1,
      gaps: []
    };
  }
  const gaps = [];
  let sourceFilesWithTestChanges = 0;
  for (const source of sourceFiles) {
    const expectedTestFiles = await mapTestFiles(repoPath, source.path);
    const testFileExists = expectedTestFiles.length > 0;
    const testFileChanged = expectedTestFiles.some(
      (t) => changedTestPaths.has(t)
    );
    if (testFileChanged) {
      sourceFilesWithTestChanges++;
    } else {
      gaps.push({
        sourceFile: source.path,
        expectedTestFiles,
        testFileExists,
        testFileChanged: false
      });
    }
  }
  const coverageRatio = sourceFiles.length > 0 ? sourceFilesWithTestChanges / sourceFiles.length : 0;
  return {
    changedSourceFiles: sourceFiles.length,
    sourceFilesWithTestChanges,
    coverageRatio,
    gaps
  };
}

// src/docs/staleness-checker.ts
import simpleGit3 from "simple-git";
import fg2 from "fast-glob";
import { readFile } from "fs/promises";
import { join as joinPath } from "path";
async function checkDocStaleness(repoPath, changedFiles, baseBranch, headBranch) {
  const git = simpleGit3(repoPath);
  const docPatterns = ["**/*.md", "**/*.mdx"];
  const docFiles = await fg2(docPatterns, {
    cwd: repoPath,
    ignore: ["**/node_modules/**"],
    dot: false,
    onlyFiles: true
  });
  if (docFiles.length === 0) {
    return { staleReferences: [], checkedFiles: [] };
  }
  const deletedPaths = buildDeletedPaths(changedFiles);
  const renamedPaths = buildRenamedPaths(changedFiles);
  const removedSymbols = await collectRemovedSymbols(
    git,
    changedFiles,
    baseBranch,
    headBranch
  );
  if (deletedPaths.length === 0 && renamedPaths.length === 0 && removedSymbols.length === 0) {
    return { staleReferences: [], checkedFiles: docFiles };
  }
  const symbolPatterns = removedSymbols.map((sym) => ({
    ...sym,
    regex: new RegExp(`\\b${escapeRegex(sym.name)}\\b`)
  }));
  const staleReferences = [];
  for (const docFile of docFiles) {
    const content = await safeReadFile(repoPath, docFile, git, headBranch);
    if (content === null) {
      continue;
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      for (const dp of deletedPaths) {
        if (line.includes(dp)) {
          staleReferences.push({
            docFile,
            line: lineNumber,
            reference: dp,
            reason: "referenced file was deleted"
          });
        }
      }
      for (const rp of renamedPaths) {
        if (line.includes(rp.oldPath)) {
          staleReferences.push({
            docFile,
            line: lineNumber,
            reference: rp.oldPath,
            reason: `referenced file was renamed to ${rp.newPath}`
          });
        }
      }
      for (const sym of symbolPatterns) {
        if (sym.regex.test(line)) {
          staleReferences.push({
            docFile,
            line: lineNumber,
            reference: sym.name,
            reason: `referenced symbol was removed from ${sym.sourceFile}`
          });
        }
      }
    }
  }
  return { staleReferences, checkedFiles: docFiles };
}
function buildDeletedPaths(changedFiles) {
  return changedFiles.filter((f) => f.status === "deleted").map((f) => f.path);
}
function buildRenamedPaths(changedFiles) {
  return changedFiles.filter((f) => f.status === "renamed" && f.oldPath).map((f) => ({ oldPath: f.oldPath, newPath: f.path }));
}
async function collectRemovedSymbols(git, changedFiles, baseBranch, headBranch) {
  const removed = [];
  for (const file of changedFiles) {
    if (file.category !== "source") {
      continue;
    }
    if (file.status === "deleted") {
      const stem = filenameStem(file.path);
      if (stem && !isGenericName(stem)) {
        removed.push({ name: stem, sourceFile: file.path });
      }
      const baseContent = await safeShowFile(git, baseBranch, file.path);
      if (baseContent) {
        for (const sym of extractExportedSymbolNames(baseContent)) {
          removed.push({ name: sym, sourceFile: file.path });
        }
      }
    } else if (file.status === "modified") {
      const baseContent = await safeShowFile(git, baseBranch, file.path);
      const headContent = await safeShowFile(git, headBranch, file.path);
      if (baseContent) {
        const baseSymbols = extractExportedSymbolNames(baseContent);
        const headSymbols = new Set(
          headContent ? extractExportedSymbolNames(headContent) : []
        );
        for (const sym of baseSymbols) {
          if (!headSymbols.has(sym)) {
            removed.push({ name: sym, sourceFile: file.path });
          }
        }
      }
    }
  }
  return removed;
}
var EXPORT_REGEX = /export\s+(?:default\s+)?(?:async\s+)?(?:function\s*\*?\s*|class\s+|const\s+|let\s+|var\s+|type\s+|interface\s+|enum\s+)([A-Za-z_$][A-Za-z0-9_$]*)/g;
function extractExportedSymbolNames(content) {
  const names = [];
  let match;
  const regex = new RegExp(EXPORT_REGEX.source, EXPORT_REGEX.flags);
  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    if (name) {
      names.push(name);
    }
  }
  return [...new Set(names)];
}
function filenameStem(filePath) {
  const name = filePath.replace(/\\/g, "/").split("/").pop() ?? "";
  const dotIndex = name.indexOf(".");
  return dotIndex === -1 ? name : name.slice(0, dotIndex);
}
function isGenericName(name) {
  const GENERIC = /* @__PURE__ */ new Set([
    "index",
    "main",
    "app",
    "mod",
    "lib",
    "utils",
    "helpers",
    "types",
    "constants",
    "config"
  ]);
  return GENERIC.has(name.toLowerCase());
}
async function safeShowFile(git, branch, filePath) {
  try {
    return await git.show(`${branch}:${filePath}`);
  } catch {
    return null;
  }
}
async function safeReadFile(repoPath, relPath, git, headBranch) {
  try {
    return await readFile(joinPath(repoPath, relPath), "utf-8");
  } catch {
    return safeShowFile(git, headBranch, relPath);
  }
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/impact/impact-graph.ts
import fg3 from "fast-glob";
import { readFile as readFile2 } from "fs/promises";
import { resolve, relative, dirname } from "path";
var STATIC_IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
var DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
var REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
var RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
var INDEX_FILES = ["index.ts", "index.tsx", "index.js", "index.jsx"];
function extractImportPaths(content) {
  const paths = [];
  for (const re of [STATIC_IMPORT_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE]) {
    const pattern = new RegExp(re.source, re.flags);
    let match;
    while ((match = pattern.exec(content)) !== null) {
      paths.push(match[1]);
    }
  }
  return paths;
}
function isRelativeImport(importPath) {
  return importPath.startsWith("./") || importPath.startsWith("../");
}
function resolveImport(importPath, importerRepoRelPath, allFiles) {
  const importerDir = dirname(importerRepoRelPath);
  const resolved = resolve("/", importerDir, importPath).slice(1);
  const normalized = resolved.startsWith("/") ? resolved.slice(1) : resolved;
  if (allFiles.has(normalized)) {
    return normalized;
  }
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = normalized + ext;
    if (allFiles.has(candidate)) {
      return candidate;
    }
  }
  for (const indexFile of INDEX_FILES) {
    const candidate = normalized + "/" + indexFile;
    if (allFiles.has(candidate)) {
      return candidate;
    }
  }
  return null;
}
async function buildImpactGraph(repoPath, changedFiles, maxDepth = 3) {
  const absolutePaths = await fg3("**/*.{ts,tsx,js,jsx}", {
    cwd: repoPath,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
    absolute: true
  });
  const repoRelativePaths = absolutePaths.map((abs) => relative(repoPath, abs));
  const allFilesSet = new Set(repoRelativePaths);
  const reverseDeps = /* @__PURE__ */ new Map();
  const BATCH_SIZE = 50;
  for (let i = 0; i < repoRelativePaths.length; i += BATCH_SIZE) {
    const batch = repoRelativePaths.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (relPath) => {
        const absPath = resolve(repoPath, relPath);
        let content;
        try {
          content = await readFile2(absPath, "utf-8");
        } catch {
          return;
        }
        const importPaths = extractImportPaths(content);
        for (const importPath of importPaths) {
          if (!isRelativeImport(importPath)) {
            continue;
          }
          const resolved = resolveImport(importPath, relPath, allFilesSet);
          if (resolved === null) {
            continue;
          }
          let dependents = reverseDeps.get(resolved);
          if (!dependents) {
            dependents = /* @__PURE__ */ new Set();
            reverseDeps.set(resolved, dependents);
          }
          dependents.add(relPath);
        }
      })
    );
  }
  const directlyChanged = changedFiles.filter((f) => f.category === "source").map((f) => f.path);
  const directlyChangedSet = new Set(directlyChanged);
  const visited = new Set(directlyChanged);
  const edges = [];
  let frontier = [...directlyChanged];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const nextFrontier = [];
    for (const file of frontier) {
      const dependents = reverseDeps.get(file);
      if (!dependents) {
        continue;
      }
      for (const dependent of dependents) {
        edges.push({
          from: dependent,
          to: file,
          type: "imports"
        });
        if (!visited.has(dependent)) {
          visited.add(dependent);
          nextFrontier.push(dependent);
        }
      }
    }
    frontier = nextFrontier;
  }
  const indirectlyAffected = [...visited].filter(
    (f) => !directlyChangedSet.has(f)
  );
  return {
    directlyChanged,
    indirectlyAffected,
    edges
  };
}

// src/risk/factors.ts
var CI_BUILD_CONFIG_PATTERNS = [
  /^\.github\//,
  /Dockerfile/i,
  /docker-compose/i,
  /webpack\.config/,
  /vite\.config/,
  /rollup\.config/,
  /esbuild\.config/,
  /turbo\.json$/,
  /\.gitlab-ci/,
  /Jenkinsfile/i,
  /\.circleci\//
];
function evaluateBreakingChangesFactor(breakingChanges) {
  if (breakingChanges.length === 0) {
    return {
      name: "Breaking changes",
      score: 0,
      weight: 0.3,
      description: "No breaking API changes detected."
    };
  }
  const hasHigh = breakingChanges.some((bc) => bc.severity === "high");
  const hasMedium = breakingChanges.some((bc) => bc.severity === "medium");
  let score;
  if (hasHigh) {
    score = 100;
  } else if (hasMedium) {
    score = 60;
  } else {
    score = 30;
  }
  const details = breakingChanges.map(
    (bc) => `${bc.type} of "${bc.symbolName}" in ${bc.filePath} (${bc.severity})`
  );
  return {
    name: "Breaking changes",
    score,
    weight: 0.3,
    description: `${breakingChanges.length} breaking change(s) detected.`,
    details
  };
}
function evaluateUntestedChangesFactor(coverage) {
  const score = coverage.changedSourceFiles === 0 ? 0 : (1 - coverage.coverageRatio) * 100;
  const details = [];
  if (coverage.gaps.length > 0) {
    for (const gap of coverage.gaps) {
      const testStatus = gap.testFileExists ? "test exists but not updated" : "no test file found";
      details.push(`${gap.sourceFile}: ${testStatus}`);
    }
  }
  const description = coverage.changedSourceFiles === 0 ? "No source files changed." : `${coverage.sourceFilesWithTestChanges}/${coverage.changedSourceFiles} changed source files have corresponding test changes.`;
  return {
    name: "Untested changes",
    score,
    weight: 0.25,
    description,
    ...details.length > 0 ? { details } : {}
  };
}
function evaluateDiffSizeFactor(changedFiles) {
  const totalLines = changedFiles.reduce(
    (sum, f) => sum + f.additions + f.deletions,
    0
  );
  let score;
  if (totalLines > 1e3) {
    score = 100;
  } else if (totalLines >= 500) {
    score = 80;
  } else if (totalLines >= 100) {
    score = 50;
  } else {
    score = 0;
  }
  return {
    name: "Diff size",
    score,
    weight: 0.15,
    description: `${totalLines} total lines changed across ${changedFiles.length} file(s).`
  };
}
function evaluateDocStalenessFactor(staleness) {
  const score = Math.min(staleness.staleReferences.length * 20, 100);
  const details = staleness.staleReferences.length > 0 ? staleness.staleReferences.map(
    (ref) => `${ref.docFile}:${ref.line} - "${ref.reference}" (${ref.reason})`
  ) : void 0;
  const description = staleness.staleReferences.length === 0 ? "No stale documentation references found." : `${staleness.staleReferences.length} stale documentation reference(s) found.`;
  return {
    name: "Stale documentation",
    score,
    weight: 0.1,
    description,
    ...details ? { details } : {}
  };
}
function evaluateConfigChangesFactor(changedFiles) {
  const configFiles = changedFiles.filter((f) => f.category === "config");
  if (configFiles.length === 0) {
    return {
      name: "Config file changes",
      score: 0,
      weight: 0.1,
      description: "No configuration files changed."
    };
  }
  const hasCiBuildConfig = configFiles.some(
    (f) => CI_BUILD_CONFIG_PATTERNS.some((pattern) => pattern.test(f.path))
  );
  const score = hasCiBuildConfig ? 100 : 50;
  const details = configFiles.map((f) => f.path);
  const description = hasCiBuildConfig ? `CI/build configuration changed (${configFiles.length} config file(s)).` : `${configFiles.length} configuration file(s) changed.`;
  return {
    name: "Config file changes",
    score,
    weight: 0.1,
    description,
    details
  };
}
function evaluateImpactBreadthFactor(impact) {
  const count = impact.indirectlyAffected.length;
  const score = Math.min(count * 10, 100);
  const description = count === 0 ? "No indirectly affected files detected." : `${count} file(s) indirectly affected through import dependencies.`;
  const details = count > 0 ? impact.indirectlyAffected.slice(0, 20) : void 0;
  return {
    name: "Impact breadth",
    score,
    weight: 0.1,
    description,
    ...details ? { details } : {}
  };
}

// src/risk/risk-calculator.ts
function scoreToLevel(score) {
  if (score <= 25) return "low";
  if (score <= 50) return "medium";
  if (score <= 75) return "high";
  return "critical";
}
function calculateRisk(changedFiles, breakingChanges, testCoverage, docStaleness, impactGraph) {
  const factors = [
    evaluateBreakingChangesFactor(breakingChanges),
    evaluateUntestedChangesFactor(testCoverage),
    evaluateDiffSizeFactor(changedFiles),
    evaluateDocStalenessFactor(docStaleness),
    evaluateConfigChangesFactor(changedFiles),
    evaluateImpactBreadthFactor(impactGraph)
  ];
  const weightedSum = factors.reduce(
    (sum, factor) => sum + factor.score * factor.weight,
    0
  );
  const totalWeight = factors.reduce(
    (sum, factor) => sum + factor.weight,
    0
  );
  const score = Math.round(weightedSum / totalWeight);
  const level = scoreToLevel(score);
  return {
    score,
    level,
    factors
  };
}

// src/analyzer.ts
async function resolveDefaultBaseBranch(repoPath) {
  const git = simpleGit4(repoPath);
  const branchSummary = await git.branch();
  if (branchSummary.all.includes("main")) {
    return "main";
  }
  if (branchSummary.all.includes("master")) {
    return "master";
  }
  return "main";
}
function generateSummary(changedFiles, breakingChanges, testCoverage, riskScore) {
  const totalAdditions = changedFiles.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = changedFiles.reduce((sum, f) => sum + f.deletions, 0);
  const parts = [];
  parts.push(
    `This PR changes ${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"} (+${totalAdditions}/-${totalDeletions}) with a ${riskScore.level} risk score of ${riskScore.score}/100.`
  );
  if (breakingChanges.length > 0) {
    parts.push(
      `Found ${breakingChanges.length} breaking change${breakingChanges.length === 1 ? "" : "s"} affecting exported APIs.`
    );
  }
  if (testCoverage.gaps.length > 0) {
    parts.push(
      `${testCoverage.gaps.length} source file${testCoverage.gaps.length === 1 ? "" : "s"} lack${testCoverage.gaps.length === 1 ? "s" : ""} corresponding test changes.`
    );
  }
  return parts.join(" ");
}
async function analyzePR(options) {
  const { repoPath, skipBreaking, skipCoverage, skipDocs } = options;
  const baseBranch = options.baseBranch ?? await resolveDefaultBaseBranch(repoPath);
  const headBranch = options.headBranch ?? "HEAD";
  const git = simpleGit4(repoPath);
  await git.checkIsRepo();
  await git.revparse([baseBranch]);
  await git.revparse([headBranch]);
  const changedFiles = await parseDiff(repoPath, baseBranch, headBranch);
  const [breakingChanges, testCoverage, docStaleness, impactGraph] = await Promise.all([
    // Breaking change detection
    skipBreaking ? Promise.resolve([]) : detectBreakingChanges(repoPath, baseBranch, headBranch, changedFiles),
    // Test coverage analysis
    skipCoverage ? Promise.resolve({
      changedSourceFiles: 0,
      sourceFilesWithTestChanges: 0,
      coverageRatio: 0,
      gaps: []
    }) : checkTestCoverage(repoPath, changedFiles),
    // Documentation staleness checking
    skipDocs ? Promise.resolve({
      staleReferences: [],
      checkedFiles: []
    }) : checkDocStaleness(repoPath, changedFiles, baseBranch, headBranch),
    // Impact graph building
    buildImpactGraph(repoPath, changedFiles)
  ]);
  const riskScore = calculateRisk(
    changedFiles,
    breakingChanges,
    testCoverage,
    docStaleness,
    impactGraph
  );
  const summary = generateSummary(
    changedFiles,
    breakingChanges,
    testCoverage,
    riskScore
  );
  return {
    repoPath,
    baseBranch,
    headBranch,
    changedFiles,
    breakingChanges,
    testCoverage,
    docStaleness,
    impactGraph,
    riskScore,
    summary
  };
}

// src/output/markdown-reporter.ts
function formatMarkdown(analysis) {
  const sections = [];
  sections.push("# PR Impact Analysis");
  sections.push("");
  sections.push(`**Repository:** ${analysis.repoPath}`);
  sections.push(`**Comparing:** \`${analysis.baseBranch}\` \u2190 \`${analysis.headBranch}\``);
  sections.push("");
  sections.push(`## Risk Score: ${analysis.riskScore.score}/100 (${analysis.riskScore.level})`);
  sections.push("");
  if (analysis.riskScore.factors.length > 0) {
    sections.push("| Factor | Score | Weight |");
    sections.push("|--------|------:|-------:|");
    for (const factor of analysis.riskScore.factors) {
      sections.push(`| ${factor.name} | ${factor.score} | ${factor.weight} |`);
    }
  } else {
    sections.push("No risk factors identified.");
  }
  sections.push("");
  sections.push("## Summary");
  sections.push("");
  sections.push(analysis.summary);
  sections.push("");
  sections.push(`## Changed Files (${analysis.changedFiles.length})`);
  sections.push("");
  if (analysis.changedFiles.length > 0) {
    sections.push("| File | Status | +/- | Category |");
    sections.push("|------|--------|-----|----------|");
    for (const file of analysis.changedFiles) {
      const change = `+${file.additions}/-${file.deletions}`;
      sections.push(`| ${file.path} | ${file.status} | ${change} | ${file.category} |`);
    }
  } else {
    sections.push("No files changed.");
  }
  sections.push("");
  sections.push(`## Breaking Changes (${analysis.breakingChanges.length})`);
  sections.push("");
  if (analysis.breakingChanges.length > 0) {
    sections.push("| Symbol | Type | Severity | File |");
    sections.push("|--------|------|----------|------|");
    for (const bc of analysis.breakingChanges) {
      const typeLabel = formatBreakingChangeType(bc.type);
      sections.push(`| ${bc.symbolName} | ${typeLabel} | ${bc.severity} | ${bc.filePath} |`);
    }
  } else {
    sections.push("No breaking changes detected.");
  }
  sections.push("");
  sections.push("## Test Coverage");
  sections.push("");
  const coveragePercent = Math.round(analysis.testCoverage.coverageRatio * 100);
  sections.push(`- **Changed source files:** ${analysis.testCoverage.changedSourceFiles}`);
  sections.push(`- **Files with test changes:** ${analysis.testCoverage.sourceFilesWithTestChanges}`);
  sections.push(`- **Coverage ratio:** ${coveragePercent}%`);
  if (analysis.testCoverage.gaps.length > 0) {
    sections.push("");
    sections.push("### Gaps");
    sections.push("");
    for (const gap of analysis.testCoverage.gaps) {
      const testStatus = gap.testFileExists ? "test file exists but was not changed" : "no test file found";
      sections.push(`- **${gap.sourceFile}** \u2014 ${testStatus}`);
      if (gap.expectedTestFiles.length > 0) {
        for (const tf of gap.expectedTestFiles) {
          sections.push(`  - ${tf}`);
        }
      }
    }
  }
  sections.push("");
  sections.push("## Documentation Staleness");
  sections.push("");
  if (analysis.docStaleness.staleReferences.length > 0) {
    for (const ref of analysis.docStaleness.staleReferences) {
      sections.push(`- **${ref.docFile}** (line ${ref.line}): \`${ref.reference}\` \u2014 ${ref.reason}`);
    }
  } else {
    sections.push("No stale references found.");
  }
  sections.push("");
  sections.push("## Impact Graph");
  sections.push("");
  sections.push(`- **Directly changed:** ${analysis.impactGraph.directlyChanged.length} file${analysis.impactGraph.directlyChanged.length === 1 ? "" : "s"}`);
  sections.push(`- **Indirectly affected:** ${analysis.impactGraph.indirectlyAffected.length} file${analysis.impactGraph.indirectlyAffected.length === 1 ? "" : "s"}`);
  if (analysis.impactGraph.edges.length > 0) {
    sections.push("");
    sections.push("### Dependency Edges");
    sections.push("");
    for (const edge of analysis.impactGraph.edges) {
      sections.push(`- ${edge.from} \u2192 ${edge.to} (\`${edge.type}\`)`);
    }
  }
  sections.push("");
  return sections.join("\n");
}
function formatBreakingChangeType(type) {
  switch (type) {
    case "removed_export":
      return "removed export";
    case "changed_signature":
      return "changed signature";
    case "changed_type":
      return "changed type";
    case "renamed_export":
      return "renamed export";
  }
}

// src/output/json-reporter.ts
function formatJSON(analysis) {
  return JSON.stringify(analysis, null, 2);
}
export {
  analyzePR,
  buildImpactGraph,
  calculateRisk,
  categorizeFile,
  checkDocStaleness,
  checkTestCoverage,
  detectBreakingChanges,
  diffExports,
  diffSignatures,
  formatJSON,
  formatMarkdown,
  mapTestFiles,
  parseDiff,
  parseExports
};
//# sourceMappingURL=index.js.map