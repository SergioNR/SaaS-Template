# Tasks

## 1. Template (apply in this repo)

- [ ] 1.1 Add a "Forking checklist" section to the root `README.md` covering every item in groups 2–6, each with its file path; link it from `frontend/README.md` (og-image note) and the `theme.js` header comment
- [ ] 1.2 Optional: document a placeholder scan, e.g. `grep -rnE "Your App|yourapp\.com|expressjs-template|Express\.js Template" --exclude-dir=node_modules --exclude-dir=.git .`; verify it lists exactly the known placeholders on the template
- [ ] 1.3 `npx -y @fission-ai/openspec@1.16.0 validate replace-template-placeholders --strict` passes

## 2. Fork: brand assets

- [ ] 2.1 Replace `frontend/public/og-image.png` (1200×630) and `frontend/public/logo.svg`; verify the built `/pricing` page's `og:image` loads the new image
- [ ] 2.2 Set the `brand` colour scale in `frontend/src/theme/theme.js` (10 shades); check contrast of primary buttons and links

## 3. Fork: copy

- [ ] 3.1 `es.json`: `common.siteName`, `common.contactEmail`, `footer.tagline`, homepage sections, FAQ, pricing plan copy, `seo.*` defaults
- [ ] 3.2 Terms page copy (legal review; support email); `frontend/index.html` fallback `<title>`

## 4. Fork: names

- [ ] 4.1 Image names in `.github/workflows/docker-build-push.yaml`, `compose.yaml`, `compose.dev.yaml`, both READMEs; create the Docker Hub repositories
- [ ] 4.2 Package names in `backend/package.json`, `frontend/package.json` (regenerate lockfiles with `npm install --package-lock-only`); OpenAPI title in `backend/server/config/swagger.js`

## 5. Fork: billing and email

- [ ] 5.1 Plans in `frontend/src/config/plans.js` and `backend/server/config/planPrices.js`; Stripe products/prices created (boot validates every plan resolves to a price)
- [ ] 5.2 Brevo sender and template ids in `backend/.env` / root `.env`

## 6. Fork: verification

- [ ] 6.1 Placeholder scan from 1.2 returns nothing; `npm test`, lint and `npm run build` pass in both packages
