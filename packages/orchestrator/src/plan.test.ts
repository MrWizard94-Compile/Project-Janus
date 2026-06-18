import { describe, expect, it } from "vitest";
import { DelegationPlanSchema } from "./plan.js";

describe("DelegationPlanSchema", () => {
  it("requires claude parent and grok children with nested task input", () => {
    const parsed = DelegationPlanSchema.parse({
      parent: {
        assignee: "claude",
        validation_profile: "typescript-v1",
        spec: {
          objective: "Delegate work",
          constraints: [],
          files_in_scope: [],
          acceptance_criteria: ["Children complete"],
        },
      },
      children: [
        {
          assignee: "grok",
          patch_mode: "manual",
          task: {
            validation_profile: "typescript-v1",
            spec: {
              objective: "Manual child",
              constraints: [],
              files_in_scope: ["README.md"],
              acceptance_criteria: [],
            },
          },
        },
      ],
    });

    expect(parsed.parent.assignee).toBe("claude");
    expect(parsed.children[0]?.assignee).toBe("grok");
    expect(parsed.children[0]?.patch_mode).toBe("manual");
    expect(parsed.provision.auto_worktree).toBe(true);
    expect(parsed.provision.auto_prepare).toBe(false);
  });

  it("defaults patch_mode to identity and provision flags", () => {
    const parsed = DelegationPlanSchema.parse({
      parent: {
        assignee: "claude",
        validation_profile: "typescript-v1",
        spec: {
          objective: "Delegate",
          constraints: [],
          files_in_scope: [],
          acceptance_criteria: [],
        },
      },
      children: [
        {
          assignee: "grok",
          task: {
            validation_profile: "typescript-v1",
            spec: {
              objective: "Child",
              constraints: [],
              files_in_scope: [],
              acceptance_criteria: [],
            },
          },
        },
      ],
    });

    expect(parsed.children[0]?.patch_mode).toBe("identity");
    expect(parsed.provision).toEqual({
      auto_worktree: true,
      auto_prepare: false,
    });
  });
});