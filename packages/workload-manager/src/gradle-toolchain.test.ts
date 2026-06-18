import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseGradleJavaVersion,
  resolveGradleJdkHome,
  resolveWorkspaceJavaHome,
} from "./gradle-toolchain.js";

describe("gradle-toolchain", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "aether-gradle-toolchain-"));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tempRoot, { recursive: true, force: true });
  });

  function stubHomedir(root: string): void {
    if (process.platform === "win32") {
      vi.stubEnv("USERPROFILE", root);
      return;
    }

    vi.stubEnv("HOME", root);
  }

  describe("parseGradleJavaVersion", () => {
    it("reads java.toolchain.languageVersion from build.gradle", async () => {
      await writeFile(
        join(tempRoot, "build.gradle"),
        "java.toolchain.languageVersion = JavaLanguageVersion.of(25)\n",
        "utf8",
      );

      await expect(parseGradleJavaVersion(tempRoot)).resolves.toBe(25);
    });

    it("reads JavaLanguageVersion from build.gradle.kts", async () => {
      await writeFile(
        join(tempRoot, "build.gradle.kts"),
        `
java {
  toolchain {
    languageVersion.set(JavaLanguageVersion.of(21))
  }
}
`,
        "utf8",
      );

      await expect(parseGradleJavaVersion(tempRoot)).resolves.toBe(21);
    });

    it("falls back to sourceCompatibility when toolchain is absent", async () => {
      await writeFile(
        join(tempRoot, "build.gradle"),
        "sourceCompatibility = JavaVersion.VERSION_17\n",
        "utf8",
      );

      await expect(parseGradleJavaVersion(tempRoot)).resolves.toBe(17);
    });

    it("returns null when no gradle build files exist", async () => {
      await expect(parseGradleJavaVersion(tempRoot)).resolves.toBeNull();
    });
  });

  describe("resolveGradleJdkHome", () => {
    async function seedGradleJdk(
      jdkName: string,
      options: {
        version: number;
        includeJava?: boolean;
        releaseVersion?: string;
      },
    ): Promise<string> {
      const gradleHome = join(tempRoot, ".gradle");
      const jdkHome = join(gradleHome, "jdks", jdkName);
      await mkdir(join(jdkHome, "bin"), { recursive: true });

      if (options.includeJava !== false) {
        const javaName = process.platform === "win32" ? "java.exe" : "java";
        await writeFile(join(jdkHome, "bin", javaName), "", "utf8");
      }

      const releaseVersion = options.releaseVersion ?? `${options.version}.0.1`;
      await writeFile(
        join(jdkHome, "release"),
        `JAVA_VERSION="${releaseVersion}"\n`,
        "utf8",
      );

      return gradleHome;
    }

    it("resolves a JDK home from a versioned directory name", async () => {
      const gradleHome = await seedGradleJdk("eclipse_adoptium-25-amd64-windows.2", {
        version: 25,
      });
      stubHomedir(tempRoot);
      expect(homedir()).toBe(tempRoot);

      const resolved = await resolveGradleJdkHome(25);
      expect(resolved).toBe(join(gradleHome, "jdks", "eclipse_adoptium-25-amd64-windows.2"));
    });

    it("resolves a JDK home from a release file when the directory name is ambiguous", async () => {
      const gradleHome = await seedGradleJdk("custom-jdk-layout", {
        version: 21,
        releaseVersion: "21.0.2",
      });
      stubHomedir(tempRoot);

      const resolved = await resolveGradleJdkHome(21);
      expect(resolved).toBe(join(gradleHome, "jdks", "custom-jdk-layout"));
    });

    it("returns null when no matching JDK has a java executable", async () => {
      await seedGradleJdk("eclipse_adoptium-25-amd64-windows.2", {
        version: 25,
        includeJava: false,
      });
      stubHomedir(tempRoot);

      await expect(resolveGradleJdkHome(25)).resolves.toBeNull();
    });
  });

  describe("resolveWorkspaceJavaHome", () => {
    it("combines gradle version parsing and JDK resolution", async () => {
      await writeFile(
        join(tempRoot, "build.gradle"),
        "java.toolchain.languageVersion = JavaLanguageVersion.of(25)\n",
        "utf8",
      );

      const gradleHome = join(tempRoot, ".gradle");
      const jdkHome = join(gradleHome, "jdks", "eclipse_adoptium-25-amd64-windows.2");
      await mkdir(join(jdkHome, "bin"), { recursive: true });

      const javaName = process.platform === "win32" ? "java.exe" : "java";
      await writeFile(join(jdkHome, "bin", javaName), "", "utf8");
      await writeFile(join(jdkHome, "release"), 'JAVA_VERSION="25.0.3"\n', "utf8");

      const workspaceRoot = join(tempRoot, "workspace");
      await mkdir(workspaceRoot, { recursive: true });
      await writeFile(
        join(workspaceRoot, "build.gradle"),
        "java.toolchain.languageVersion = JavaLanguageVersion.of(25)\n",
        "utf8",
      );

      stubHomedir(tempRoot);

      await expect(resolveWorkspaceJavaHome(workspaceRoot)).resolves.toEqual({
        version: 25,
        home: jdkHome,
      });
    });
  });
});