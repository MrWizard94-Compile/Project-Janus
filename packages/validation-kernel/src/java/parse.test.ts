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