# Tasks

## 1. Template (apply in this repo)

- [x] 1.1 Add a "Forking checklist" section to the root `README.md` covering every placeholder (brand assets, copy, names, billing and email, verification), each with its file path; link it from `frontend/README.md` (og-image note) and the `theme.js` header comment
- [x] 1.2 Document a placeholder scan (`grep -rnE "Your App|yourapp\.com|expressjs-template|Express\.js Template" …`, excluding `openspec/`, `.claude/`, lockfiles and READMEs); verified it lists exactly the known placeholders on the template
- [x] 1.3 `npx -y @fission-ai/openspec@1.16.0 validate replace-template-placeholders --strict` passes

## 2. Fork work

- [x] 2.1 The per-fork steps (brand assets, copy, names, billing and email, verification) live as the checkbox list in the root README "Forking checklist" — the single tracker a fork works through, instead of this change staying open in the template. A fork that wants it as OpenSpec work runs `/opsx:propose` from that list in its own repo
