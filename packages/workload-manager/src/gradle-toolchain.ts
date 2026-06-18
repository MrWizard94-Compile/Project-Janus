import { access, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const BUILD_GRADLE = "build.gradle";
const BUILD_GRADLE_KTS = "build.gradle.kts";

export interface ResolvedWorkspaceJava {
  version: number;
  home: string;
}

export async function parseGradleJavaVersion(workspaceRoot: string): Promise<number | null> {
  const candidates = [
    join(workspaceRoot, BUILD_GRADLE),
    join(workspaceRoot, BUILD_GRADLE_KTS),
  ];

  for (const filePath of candidates) {
    const version = await readJavaVersionFromGradleFile(filePath);
    if (version !== null) {
      return version;
    }
  }

  return null;
}

async function readJavaVersionFromGradleFile(filePath: string): Promise<number | null> {
  try {
    const content = await readFile(filePath, "utf8");
    return extractJavaVersion(content);
  } catch {
    return null;
  }
}

function extractJavaVersion(content: string): number | null {
  const toolchainMatch = content.match(/JavaLanguageVersion\.of\((\d+)\)/);
  if (toolchainMatch) {
    return Number.parseInt(toolchainMatch[1]!, 10);
  }

  const sourceCompatPatterns = [
    /sourceCompatibility\s*=\s*JavaVersion\.VERSION_(\d+)(?:_\d+)?/,
    /sourceCompatibility\s*=\s*['"](\d+)['"]/,
    /sourceCompatibility\s*=\s*(\d+)(?:\s|$)/m,
  ];

  for (const pattern of sourceCompatPatterns) {
    const match = content.match(pattern);
    if (match) {
      return Number.parseInt(match[1]!, 10);
    }
  }

  return null;
}

export async function resolveGradleJdkHome(javaVersion: number): Promise<string | null> {
  const gradleJdksRoot = join(homedir(), ".gradle", "jdks");

  let entries;
  try {
    entries = await readdir(gradleJdksRoot, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const jdkHome = join(gradleJdksRoot, entry.name);
    const nameMatches = directoryNameMatchesVersion(entry.name, javaVersion);
    const releaseMatches = nameMatches ? false : await releaseFileMatchesVersion(jdkHome, javaVersion);

    if (!nameMatches && !releaseMatches) {
      continue;
    }

    if (await javaExecutableExists(jdkHome)) {
      return jdkHome;
    }
  }

  return null;
}

function directoryNameMatchesVersion(dirName: string, version: number): boolean {
  return dirName.includes(`-${version}-`);
}

async function releaseFileMatchesVersion(jdkHome: string, version: number): Promise<boolean> {
  try {
    const releaseContent = await readFile(join(jdkHome, "release"), "utf8");
    return releaseMatchesVersion(releaseContent, version);
  } catch {
    return false;
  }
}

function releaseMatchesVersion(releaseContent: string, version: number): boolean {
  const javaVersionMatch = releaseContent.match(/^JAVA_VERSION="([^"]+)"/m);
  if (!javaVersionMatch) {
    return false;
  }

  const major = Number.parseInt(javaVersionMatch[1]!.split(".")[0] ?? "", 10);
  return major === version;
}

function resolveJavaExecutable(jdkHome: string): string {
  const executable = process.platform === "win32" ? "java.exe" : "java";
  return join(jdkHome, "bin", executable);
}

async function javaExecutableExists(jdkHome: string): Promise<boolean> {
  try {
    await access(resolveJavaExecutable(jdkHome));
    return true;
  } catch {
    return false;
  }
}

export async function resolveWorkspaceJavaHome(
  workspaceRoot: string,
): Promise<ResolvedWorkspaceJava | null> {
  const version = await parseGradleJavaVersion(workspaceRoot);
  if (version === null) {
    return null;
  }

  const home = await resolveGradleJdkHome(version);
  if (home === null) {
    return null;
  }

  return { version, home };
}