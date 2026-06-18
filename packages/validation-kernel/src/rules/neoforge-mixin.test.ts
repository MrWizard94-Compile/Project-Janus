import { describe, expect, it } from "vitest";
import { runNeoForgeMixinRules } from "./neoforge-mixin.js";

const VALID_MIXIN = `package com.example.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(TargetClass.class)
public class MixinExample {
    @Inject(method = "tick", at = @At("HEAD"))
    private void onTick(CallbackInfo ci) {
    }
}
`;

describe("runNeoForgeMixinRules", () => {
  it("accepts a valid mixin patch", () => {
    const errors = runNeoForgeMixinRules({
      proposal: {
        task_id: "task-test",
        files: [
          {
            path: "src/main/java/com/example/mixin/MixinExample.java",
            content: VALID_MIXIN,
          },
        ],
      },
      spec: {
        objective: "test",
        constraints: [],
        files_in_scope: ["src/main/java/com/example/mixin/MixinExample.java"],
        acceptance_criteria: [],
      },
    });

    expect(errors).toHaveLength(0);
  });

  it("rejects overwrite without allow_overwrite", () => {
    const content = `package com.example.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Overwrite;

@Mixin(TargetClass.class)
public class MixinExample {
    @Overwrite
    public void tick() {
    }
}
`;
    const errors = runNeoForgeMixinRules({
      proposal: {
        task_id: "task-test",
        files: [
          {
            path: "src/main/java/com/example/mixin/MixinExample.java",
            content,
          },
        ],
      },
      spec: {
        objective: "test",
        constraints: [],
        files_in_scope: [],
        acceptance_criteria: [],
      },
    });

    expect(errors.some((error) => error.rule === "M003")).toBe(true);
  });
});