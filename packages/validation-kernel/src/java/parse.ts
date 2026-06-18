export interface MixinAnnotation {
  line: number;
  kind: "Mixin" | "Inject" | "Redirect" | "Overwrite" | "Accessor" | "Invoker";
  target: string | null;
  methodSignature: string | null;
}

export interface JavaFileAnalysis {
  path: string;
  packageName: string | null;
  annotations: MixinAnnotation[];
  rawTypeHits: Array<{ line: number; token: string }>;
  nullableAnnotations: Array<{ line: number; kind: "Nullable" | "Nonnull" }>;
}

const MIXIN_ANNOTATION =
  /@(Mixin|Inject|Redirect|Overwrite|Accessor|Invoker)\s*(?:\(([^)]*)\))?/g;
const PACKAGE_DECL = /^\s*package\s+([a-zA-Z0-9_.]+)\s*;/m;
const RAW_TYPE_PATTERN =
  /\b(Map|List|Set|HashMap|ArrayList|Optional|Consumer|Function|Supplier|Predicate)\s*<\s*>|\b(Map|List|Set|HashMap|ArrayList)\s+[a-zA-Z_]/g;
const NULLABLE_PATTERN = /@(Nullable|Nonnull)/g;

export function analyzeJavaSource(path: string, content: string): JavaFileAnalysis {
  const lines = content.split(/\r?\n/);
  const packageMatch = PACKAGE_DECL.exec(content);
  const annotations: MixinAnnotation[] = [];
  const rawTypeHits: Array<{ line: number; token: string }> = [];
  const nullableAnnotations: Array<{ line: number; kind: "Nullable" | "Nonnull" }> = [];

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
      nullableAnnotations.push({ line: lineNumber, kind });
    }

    for (const match of line.matchAll(RAW_TYPE_PATTERN)) {
      rawTypeHits.push({
        line: lineNumber,
        token: match[0],
      });
    }
  }

  return {
    path,
    packageName: packageMatch?.[1] ?? null,
    annotations,
    rawTypeHits,
    nullableAnnotations,
  };
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