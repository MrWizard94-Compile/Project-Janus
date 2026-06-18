import type { PatchProposal, Task, ValidationProfile } from "@aether/shared";
import { getValidationProfile } from "@aether/shared";
import { loadAetherConfig } from "./config.js";
import { runAstLayer } from "./layers/ast.js";
import { runBuildLayer } from "./layers/build.js";
import { runLspLayer } from "./layers/lsp.js";
import { runRulesLayer } from "./layers/rules.js";
import { applyPatch, revertWorkspace } from "./patch.js";
import { writeReceipt } from "./receipt.js";
import type { ValidationResult } from "./types.js";

export interface ValidateOptions {
  repoRoot: string;
  workspaceRoot: string;
  task: Task;
  proposal: PatchProposal;
  persistOnPass?: boolean;
}

export class ValidationKernel {
  async validate(options: ValidateOptions): Promise<ValidationResult> {
    const profile = getValidationProfile(options.task.validation_profile);
    const config = await loadAetherConfig(options.repoRoot);

    await applyPatch(options.workspaceRoot, options.proposal);

    try {
      const result = await this.runLayers(
        profile,
        options.proposal,
        options.task,
        options.workspaceRoot,
        config,
      );

      await writeReceipt(
        options.repoRoot,
        options.proposal,
        result.passed,
        options.workspaceRoot,
        profile.id,
      );

      if (!result.passed || !options.persistOnPass) {
        await revertWorkspace(options.workspaceRoot);
      }

      return result;
    } catch (error) {
      await revertWorkspace(options.workspaceRoot);
      throw error;
    }
  }

  private async runLayers(
    profile: ValidationProfile,
    proposal: PatchProposal,
    task: Task,
    workspaceRoot: string,
    config: Awaited<ReturnType<typeof loadAetherConfig>>,
  ): Promise<ValidationResult> {
    const layers = [];

    if (profile.layers.includes("lsp")) {
      layers.push(await runLspLayer(proposal, workspaceRoot, config));
    }

    if (profile.layers.includes("ast")) {
      layers.push(runAstLayer(proposal));
    }

    if (profile.layers.includes("rules")) {
      layers.push(runRulesLayer(profile, proposal, task.spec));
    }

    if (profile.layers.includes("build")) {
      layers.push(await runBuildLayer(profile, workspaceRoot, config));
    }

    const errors = layers.flatMap((layer) => layer.errors);
    const passed = layers.every((layer) => !layer.ran || layer.passed);

    return {
      passed,
      profile_id: profile.id,
      workspace_root: workspaceRoot,
      layers,
      errors,
    };
  }
}