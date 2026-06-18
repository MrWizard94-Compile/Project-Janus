# AETHER — Dual-AI Development System Architecture

**Version:** 1.0 (Final)  
**Date:** 2026-06-17  
**Status:** Locked for Phase 0 implementation

## 1. Overview

Aether is a long-term, reusable dual-AI development platform designed to maximize velocity and quality across complex, multi-project workflows. It treats **Claude** as the high-context Architect/Orchestrator and **Grok** as the high-speed parallel Executor, with a deterministic Validation Kernel acting as the gate between all agent output and the filesystem.

The system is built to scale from Minecraft modding (NeoForge/Java) into other languages and domains over time.

## 2. Core Philosophy

- Validation before mutation — no code reaches disk without passing automated checks.
- Extreme context discipline — Claude owns the large context; all other agents receive minimal, targeted input.
- Leverage existing platforms (Theia AI + LSP + MCP) rather than building everything from scratch.
- Start deterministic and add intelligence only where it delivers clear value.
- The system itself is the product. Individual mods and projects are workloads that exercise it.

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Theia Custom IDE (Aether)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Ghost      │  │   Phantom    │  │   Validation     │  │
│  │   Buffer     │  │   Cursor     │  │   Dashboard      │  │
│  │ (Claude)     │  │ (Grok)       │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌─────────────────┐    ┌───────────────┐
│ Orchestration │    │ Execution       │    │ Validation    │
│ Core          │    │ Runtime         │    │ Kernel        │
│ (Claude)      │    │ (Grok + agents) │    │ (Deterministic)│
└───────────────┘    └─────────────────┘    └───────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
            ┌───────────────┐   ┌───────────────┐
            │ Git Worktrees │   │ Task Queue +  │
            │               │   │ Shared Context│
            └───────────────┘   └───────────────┘
```

## 4. Layer Descriptions

**Orchestration Layer (Claude)**
- Maintains the full project context and long-term architectural decisions.
- Owns and manages prompt caching for maximum token efficiency.
- Decomposes work into precisely scoped tasks.
- Reviews Grok output and makes final acceptance decisions.
- Prepares minimal, cache-friendly context slices for the Execution Layer.

**Execution Layer (Grok)**
- Receives only the smallest possible, fully-specified tasks.
- Spawns parallel sub-agents for independent work.
- Operates exclusively through the Validation Kernel.
- Returns results upward only after passing validation.

**Validation Kernel (Deterministic Core)**
- Primary gate for all code changes.
- Built on LSP (Eclipse JDT) + AST analysis + explicit domain rules.
- Catches structural, type, mapping, and Minecraft-specific errors before any file is written.
- Provides structured feedback to Grok on failure.
- Local LLM Critic layer rejected (see Decisions section).

**Workspace & State Layer**
- Git worktrees for safe parallel work.
- Structured task queue (instead of loose markdown files).
- Shared context via MCP with strict scoping.
- Persistent project memory for architecture decisions and known-good patterns.

## 5. Context & Token Strategy

Claude’s context window and prompt caching are treated as core infrastructure:

- Claude is the sole maintainer of large, stable context.
- All tasks sent to Grok must be minimal and reference cached material wherever possible.
- Validation feedback is kept concise and structured to avoid unnecessary context bloat.
- The system is explicitly designed to minimize cache misses and redundant context transmission.

## 6. Validation Kernel Design

The kernel is **deterministic-first**:

1. LSP + AST analysis（structural and type correctness）
2. Explicit domain rules（Mixin patterns, return types, null-safety, modding conventions）
3. Sandboxed build/test execution where needed

**Rejected Idea:** Adding a small local LLM as a Validation Critic or manager.  
**Reason:** Marginal benefit relative to added complexity, serving overhead, and consistency risk. The deterministic core + Claude review is expected to provide sufficient feedback quality in early phases. This decision can be revisited later with usage data.

## 7. Phased Implementation Roadmap

**Phase 0 – Foundation**
- Define task format and handoff protocol.
- Implement minimal Validation Kernel (LSP + basic AST + core rules).
- Establish Git worktree discipline and task queue.
- Execute the FramedBlocks mass mixin end-to-end as the first test case.

**Phase 1 – Orchestration Core**
- Claude drives work through structured task delegation.
- Grok operates exclusively through the validation gate.
- Prove reliable, low-intervention delivery of clean code.

**Phase 2 – Theia Integration**
- Move core workflow into a custom Theia product.
- Implement Ghost Buffer and Phantom Cursor interfaces.
- Deepen LSP proxy capabilities and validation dashboard.

**Phase 3 – Maturation**
- Expand domain rule packs.
- Improve long-term project memory.
- Add support for additional languages as needed.

## 8. Key Decisions & Tradeoffs

| Decision                              | Rationale                                                        | Status     |
|---------------------------------------|------------------------------------------------------------------|------------|
| Deterministic Validation Kernel first | Reliability and predictability over marginal intelligence gains  | Locked     |
| Local LLM in Validation Kernel        | Added complexity not justified at this stage                     | **Rejected** |
| Claude owns primary cached context    | Maximizes token efficiency and context quality                   | Locked     |
| Theia as long-term IDE platform       | Better modularity and AI integration than forking VS Code        | Locked     |
| Git worktrees + structured task queue | Safe parallelism and clear handoff                               | Locked     |

---

**End of Aether Architecture v1.0**

This document is the reference for all future development of the system.