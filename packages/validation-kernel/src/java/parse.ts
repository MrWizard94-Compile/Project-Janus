export interface MixinAnnotation {
  line: number;
  kind: "Mixin" | "Inject" | "Redirect" | "Overwrite" | "Accessor" | "Invoker";
  target: string | null;
  methodSignature: string | null;
}

export type NullableSite = "field" | "parameter" | "return";

export interface NullableAnnotation {
  line: number;
  kind: "Nullable" | "Nonnull";
  site: NullableSite | null;
}

export interface JavaFileAnalysis {
  path: string;
  packageName: string | null;
  annotations: MixinAnnotation[];
  rawTypeHits: Array<{ line: number; token: string }>;
  nullableAnnotations: NullableAnnotation[];
}

const MIXIN_ANNOTATION =
  /@(Mixin|Inject|Redirect|Overwrite|Accessor|Invoker)\s*(?:\(([^)]*)\))?/g;
const PACKAGE_DECL = /^\s*package\s+([a-zA-Z0-9_.]+)\s*;/m;
const RAW_TYPE_PATTERN =
  /\b(Map|List|Set|HashMap|ArrayList)\s+[a-zA-Z_]|(?:\(\s*Class\s*\))/g;
const NULLABLE_PATTERN = /@(?:[\w$]+\.)*(Nullable|Nonnull)\b/g;
const SUPPRESS_WARNINGS_PATTERN = /@SuppressWarnings\s*\(\s*(?:value\s*=\s*)?(.+?)\s*\)/;
const CLASS_DECL_PATTERN =
  /^\s*(?:public\s+|protected\s+|private\s+)?(?:abstract\s+|static\s+|final\s+)*class\s+\w+/;
const METHOD_DECL_PATTERN =
  /^\s*(?:public|private|protected)(?:\s+(?:static|final|abstract|synchronized|native|strictfp))*\s+[\w.<>,\s\[\]?@$]+\s+[\w$]+\s*\(/;
const FIELD_DECL_PATTERN =
  /^\s*(?:public|private|protected)(?:\s+(?:static|final|volatile|transient))*\s+[\w.<>,\s\[\]?]+\s+\w+\s*(?:=.*)?;/;

interface SuppressScope {
  bodyStartLine: number;
  bodyEndLine: number;
  warnings: string[];
}

export function analyzeJavaSource(path: string, content: string): JavaFileAnalysis {
  const lines = content.split(/\r?\n/);
  const packageMatch = PACKAGE_DECL.exec(content);
  const annotations: MixinAnnotation[] = [];
  const rawTypeHits: Array<{ line: number; token: string }> = [];
  const nullableAnnotations: NullableAnnotation[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index] ?? "";

    for (const match of line.matchAll(MIXIN_ANNOTATION)) {
      const kind = match[1] as MixinAnnotation["kind"];
      const args = match[2] ?? "";
      const target = extractAnnotationValue(args, "value", "target");
      const methodSignature = extractMethodSignature(lines, index);
      annotations.push({
        line: lineNumber,
        kind,
        target,
        methodSignature,
      });
    }

    for (const match of line.matchAll(NULLABLE_PATTERN)) {
      const kind = match[1] as "Nullable" | "Nonnull";
      nullableAnnotations.push({
        line: lineNumber,
        kind,
        site: kind === "Nullable" ? classifyNullableSite(lines, index) : null,
      });
    }

    for (const match of line.matchAll(RAW_TYPE_PATTERN)) {
      rawTypeHits.push({
        line: lineNumber,
        token: match[0],
      });
    }
  }

  const suppressScopes = collectSuppressScopes(lines);
  const filteredRawTypeHits = rawTypeHits.filter(
    (hit) => !isRawTypeSuppressed(hit.line, suppressScopes),
  );

  return {
    path,
    packageName: packageMatch?.[1] ?? null,
    annotations,
    rawTypeHits: filteredRawTypeHits,
    nullableAnnotations,
  };
}

function classifyNullableSite(lines: string[], lineIndex: number): NullableSite {
  const line = lines[lineIndex] ?? "";
  const trimmed = line.trim();
  const nullableIndex = findNullableAnnotationIndex(line);

  if (nullableIndex !== -1) {
    const openParenBeforeNullable = line.lastIndexOf("(", nullableIndex);
    if (openParenBeforeNullable !== -1) {
      return "parameter";
    }
  }

  if (FIELD_DECL_PATTERN.test(trimmed) && !trimmed.includes("(")) {
    return "field";
  }

  if (METHOD_DECL_PATTERN.test(trimmed)) {
    return "return";
  }

  for (let offset = 1; offset <= 4; offset += 1) {
    const nextLine = lines[lineIndex + offset];
    if (!nextLine) {
      continue;
    }

    const nextTrimmed = nextLine.trim();
    if (!nextTrimmed || nextTrimmed.startsWith("@")) {
      continue;
    }

    if (METHOD_DECL_PATTERN.test(nextTrimmed)) {
      return "return";
    }

    if (FIELD_DECL_PATTERN.test(nextTrimmed)) {
      return "field";
    }

    break;
  }

  return "field";
}

function findNullableAnnotationIndex(line: string): number {
  const patterns = ["@Nullable", "@org.jspecify.annotations.Nullable"];
  let earliest = -1;

  for (const pattern of patterns) {
    const index = line.indexOf(pattern);
    if (index !== -1 && (earliest === -1 || index < earliest)) {
      earliest = index;
    }
  }

  return earliest;
}

function collectSuppressScopes(lines: string[]): SuppressScope[] {
  const scopes: SuppressScope[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const match = SUPPRESS_WARNINGS_PATTERN.exec(line);
    if (!match?.[1]) {
      continue;
    }

    const warnings = parseSuppressWarnings(match[1]);
    if (warnings.length === 0) {
      continue;
    }

    const methodSignatureLine = findDeclarationLine(lines, index, "method");
    if (methodSignatureLine !== null) {
      const bodyBounds = findBodyBounds(lines, methodSignatureLine);
      if (bodyBounds) {
        scopes.push({
          bodyStartLine: bodyBounds.startLine,
          bodyEndLine: bodyBounds.endLine,
          warnings,
        });
        continue;
      }
    }

    const classDeclarationLine = findDeclarationLine(lines, index, "class");
    if (classDeclarationLine !== null) {
      const bodyBounds = findBodyBounds(lines, classDeclarationLine);
      if (bodyBounds) {
        scopes.push({
          bodyStartLine: bodyBounds.startLine,
          bodyEndLine: bodyBounds.endLine,
          warnings,
        });
      }
    }
  }

  return scopes;
}

function parseSuppressWarnings(args: string): string[] {
  const warnings: string[] = [];
  for (const match of args.matchAll(/"([^"]+)"/g)) {
    const warning = match[1];
    if (warning) {
      warnings.push(warning.toLowerCase());
    }
  }
  return warnings;
}

function findDeclarationLine(
  lines: string[],
  annotationLineIndex: number,
  kind: "method" | "class",
): number | null {
  for (let offset = 1; offset <= 8; offset += 1) {
    const line = lines[annotationLineIndex + offset];
    if (!line) {
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("@")) {
      continue;
    }

    if (kind === "method" && METHOD_DECL_PATTERN.test(trimmed)) {
      return annotationLineIndex + offset;
    }

    if (kind === "class" && CLASS_DECL_PATTERN.test(trimmed)) {
      return annotationLineIndex + offset;
    }
  }

  return null;
}

function findBodyBounds(
  lines: string[],
  declarationLineIndex: number,
): { startLine: number; endLine: number } | null {
  for (let index = declarationLineIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const braceIndex = line.indexOf("{");
    if (braceIndex === -1) {
      continue;
    }

    const endLineIndex = findBlockEnd(lines, index);
    return {
      startLine: index + 1,
      endLine: endLineIndex,
    };
  }

  return null;
}

function findBlockEnd(lines: string[], openBraceLineIndex: number): number {
  let depth = 0;
  let started = false;

  for (let index = openBraceLineIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    for (const character of line) {
      if (character === "{") {
        depth += 1;
        started = true;
      } else if (character === "}") {
        depth -= 1;
        if (started && depth === 0) {
          return index + 1;
        }
      }
    }
  }

  return lines.length;
}

function isRawTypeSuppressed(line: number, scopes: SuppressScope[]): boolean {
  return scopes.some(
    (scope) =>
      line >= scope.bodyStartLine &&
      line <= scope.bodyEndLine &&
      scope.warnings.some((warning) => warning === "rawtypes" || warning === "unchecked"),
  );
}

function extractAnnotationValue(
  args: string,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const quoted = new RegExp(`${key}\\s*=\\s*"([^"]+)"`).exec(args);
    if (quoted?.[1]) {
      return quoted[1];
    }

    const classRef = new RegExp(`${key}\\s*=\\s*([A-Za-z0-9_.$]+\\.class)`).exec(args);
    if (classRef?.[1]) {
      return classRef[1];
    }
  }

  const bareClass = /^\s*([A-Za-z0-9_.$]+\.class)\s*$/.exec(args.trim());
  if (bareClass?.[1]) {
    return bareClass[1];
  }

  return null;
}

function extractMethodSignature(lines: string[], annotationLineIndex: number): string | null {
  for (let offset = 1; offset <= 6; offset += 1) {
    const line = lines[annotationLineIndex + offset];
    if (!line) {
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.startsWith("@")) {
      continue;
    }

    if (/^(public|private|protected|static|final|abstract|synchronized|\s)+/.test(trimmed)) {
      return trimmed.replace(/\s+/g, " ");
    }
  }

  return null;
}

export function packageMatchesPath(packageName: string, filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const marker = "src/main/java/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex === -1) {
    return true;
  }

  const relative = normalized.slice(markerIndex + marker.length).replace(/\.java$/, "");
  const slashIndex = relative.lastIndexOf("/");
  const directory = slashIndex === -1 ? "" : relative.slice(0, slashIndex);
  const expectedDirectory = packageName.replace(/\./g, "/");
  return directory === expectedDirectory;
}