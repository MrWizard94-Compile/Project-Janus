import { describe, expect, it } from "vitest";
import { analyzeJavaSource, packageMatchesPath } from "./parse.js";

const VALID_MIXIN = `package com.example.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;

@Mixin(TargetClass.class)
public class MixinExample {
    @Inject(method = "tick", at = @At("HEAD"))
    private void onTick(CallbackInfo ci) {
    }
}
`;

describe("analyzeJavaSource", () => {
  it("extracts mixin and inject annotations", () => {
    const analysis = analyzeJavaSource(
      "src/main/java/com/example/mixin/MixinExample.java",
      VALID_MIXIN,
    );

    expect(analysis.packageName).toBe("com.example.mixin");
    expect(analysis.annotations.some((entry) => entry.kind === "Mixin")).toBe(true);
    expect(analysis.annotations.some((entry) => entry.kind === "Inject")).toBe(true);
  });

  it("filters raw type hits suppressed by method-level @SuppressWarnings", () => {
    const content = `package com.example.mixin;

@Mixin(TargetClass.class)
public class MixinExample {
    @SuppressWarnings("rawtypes")
    private static void wrap(Class clazz) {
        Object value = (Class) clazz;
    }
}
`;

    const analysis = analyzeJavaSource(
      "src/main/java/com/example/mixin/MixinExample.java",
      content,
    );

    expect(analysis.rawTypeHits).toHaveLength(0);
  });

  it("classifies org.jspecify field nullable annotations separately from method usage", () => {
    const content = `package com.example.mixin;

public class MixinExample {
    @org.jspecify.annotations.Nullable
    private String cache;

    private void save(@org.jspecify.annotations.Nullable String data) {
    }
}
`;

    const analysis = analyzeJavaSource(
      "src/main/java/com/example/mixin/MixinExample.java",
      content,
    );

    const nullableEntries = analysis.nullableAnnotations.filter((entry) => entry.kind === "Nullable");
    expect(nullableEntries).toHaveLength(2);
    expect(nullableEntries[0]?.site).toBe("field");
    expect(nullableEntries[1]?.site).toBe("parameter");
  });

  it("matches package to source path", () => {
    expect(
      packageMatchesPath(
        "com.example.mixin",
        "src/main/java/com/example/mixin/MixinExample.java",
      ),
    ).toBe(true);

    expect(
      packageMatchesPath(
        "com.wrong.package",
        "src/main/java/com/example/mixin/MixinExample.java",
      ),
    ).toBe(false);
  });
});