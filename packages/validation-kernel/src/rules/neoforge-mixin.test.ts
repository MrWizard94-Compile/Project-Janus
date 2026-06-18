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

const FILE_PATH = "src/main/java/com/example/mixin/MixinExample.java";

function runRules(content: string) {
  return runNeoForgeMixinRules({
    proposal: {
      task_id: "task-test",
      files: [{ path: FILE_PATH, content }],
    },
    spec: {
      objective: "test",
      constraints: [],
      files_in_scope: [FILE_PATH],
      acceptance_criteria: [],
    },
  });
}

describe("runNeoForgeMixinRules", () => {
  it("accepts a valid mixin patch", () => {
    const errors = runRules(VALID_MIXIN);
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
    const errors = runRules(content);
    expect(errors.some((error) => error.rule === "M003")).toBe(true);
  });

  it("suppresses M006 when method has @SuppressWarnings(rawtypes)", () => {
    const content = `package com.example.mixin;

import org.spongepowered.asm.mixin.Mixin;

@Mixin(TargetClass.class)
public class MixinExample {
    @SuppressWarnings("rawtypes")
    private static void wrap(Class clazz) {
        Object value = (Class) clazz;
    }
}
`;
    const errors = runRules(content);
    expect(errors.some((error) => error.rule === "M006")).toBe(false);
  });

  it("suppresses M006 when class has @SuppressWarnings(unchecked)", () => {
    const content = `package com.example.mixin;

import org.spongepowered.asm.mixin.Mixin;

@SuppressWarnings({"unchecked"})
@Mixin(TargetClass.class)
public class MixinExample {
    private void wrap() {
        Map map = null;
    }
}
`;
    const errors = runRules(content);
    expect(errors.some((error) => error.rule === "M006")).toBe(false);
  });

  it("still reports M006 for raw types outside suppressed scopes", () => {
    const content = `package com.example.mixin;

import org.spongepowered.asm.mixin.Mixin;

@Mixin(TargetClass.class)
public class MixinExample {
    private void wrap() {
        Map map = null;
    }
}
`;
    const errors = runRules(content);
    expect(errors.some((error) => error.rule === "M006")).toBe(true);
  });

  it("accepts field-only org.jspecify @Nullable without @Nonnull", () => {
    const content = `package com.example.mixin;

import org.jspecify.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;

@Mixin(TargetClass.class)
public class MixinExample {
    @Nullable
    private String framedblocks$stateCache;
}
`;
    const errors = runRules(content);
    expect(errors.some((error) => error.rule === "T001")).toBe(false);
  });

  it("accepts method parameter @Nullable without any @Nonnull", () => {
    const content = `package com.example.mixin;

import org.jspecify.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;

@Mixin(TargetClass.class)
public class MixinExample {
    private void save(@Nullable String data) {
    }
}
`;
    const errors = runRules(content);
    expect(errors.some((error) => error.rule === "T001")).toBe(false);
  });

  it("reports T001 for method return @Nullable without any @Nonnull", () => {
    const content = `package com.example.mixin;

import org.jspecify.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;

@Mixin(TargetClass.class)
public class MixinExample {
    @Nullable
    private String load() {
        return null;
    }
}
`;
    const errors = runRules(content);
    expect(errors.some((error) => error.rule === "T001")).toBe(true);
  });

  it("accepts nullable return when file also has @Nonnull", () => {
    const content = `package com.example.mixin;

import org.jspecify.annotations.Nonnull;
import org.jspecify.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;

@Mixin(TargetClass.class)
public class MixinExample {
    @Nonnull
    private String required;

    @Nullable
    private String load() {
        return null;
    }
}
`;
    const errors = runRules(content);
    expect(errors.some((error) => error.rule === "T001")).toBe(false);
  });

  it("suppresses M006 for mixin methods with dollar signs in the name", () => {
    const content = `package com.example.mixin;

import org.spongepowered.asm.mixin.Mixin;

@Mixin(TargetClass.class)
public class MixinExample {
    @SuppressWarnings("rawtypes")
    private Object framedblocks$wrap(Class clazz) {
        return (Class) clazz;
    }
}
`;
    const errors = runRules(content);
    expect(errors.some((error) => error.rule === "M006")).toBe(false);
  });
});