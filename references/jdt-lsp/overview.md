# Eclipse JDT Language Server Reference

Target LSP backend for the Aether Validation Kernel (Phase 0 layer 1).

## Official sources

- eclipse.jdt.ls repository: https://github.com/eclipse-jdtls/eclipse.jdt.ls
- Eclipse project page: https://projects.eclipse.org/projects/eclipse.jdt.ls
- Red Hat vscode-java (ships JDT.LS): https://github.com/redhat-developer/vscode-java

## Bootstrap (Windows / cross-platform)

```powershell
pnpm aether setup jdtls
# or
./scripts/setup-jdtls.ps1
```

This downloads the latest JDT.LS snapshot from `download.eclipse.org`, extracts it to `.tools/jdtls/`, and writes `.aether/config.json`.

Requires JDK 21+ available as `java` on PATH (override with `--java`).

## Integration approach

1. Spawn or attach to a JDT.LS instance with workspace rooted at the task worktree.
2. Open proposed Java files from patch proposals before apply.
3. Collect `textDocument/publishDiagnostics` results as structured kernel errors (`layer: "lsp"`).
4. Fail closed: unresolved compile errors block apply.

## Client options

- **vscode-languageserver/node** — standard LSP client for Node/TypeScript kernel.
- **Subprocess bridge** — invoke JDT.LS via its standard launcher if direct embedding is heavy in Phase 0.

## Diagnostics mapping

| LSP severity | Kernel treatment |
|--------------|------------------|
| Error        | Blocking failure   |
| Warning      | Blocking in Phase 0 (SOUL: zero warnings) |
| Info/Hint    | Logged, non-blocking unless rule pack says otherwise |