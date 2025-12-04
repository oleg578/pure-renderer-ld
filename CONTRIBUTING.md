# Contributing Rules

## 1. General
- Prefer simple, modular, and maintainable code.
- Keep dependencies minimal; choose native APIs when possible.

## 2. Code Style
- Enforce ESLint + Prettier; zero lint errors allowed.
- Import order: std → packages → aliases → relatives.
- Prefer `const`, reduce mutation, and use pure functions.

## 3. Naming Conventions
- Files: kebab-case  
- Components/Classes: PascalCase  
- Variables/Functions: camelCase  
- Booleans: is/has/should/can  
- Handlers: handleX / onX

## 4. TypeScript Rules
- Use interfaces/types in PascalCase.
- Avoid `any`; prefer `unknown` or explicit types.
- Ensure type safety for API contracts and business logic.

## 5. Architecture
- Recommended structure: api / services / db / utils.
- UI contains minimal business logic.
- Each module has a single responsibility.

## 6. Async & Error Handling
- Use async/await consistently.
- Handle errors via Error subclasses; avoid silent failures.

## 7. Tests
- All features and bug fixes must include tests.
- Mock network calls; test only logic.
- UI tests via testing-library.

## 8. Documentation
- Public APIs require JSDoc/TypeDoc.
- Keep README and runbooks updated.

## 9. Git & CI
- Commit small, meaningful changes.
- CI pipeline: lint → typecheck → tests → build.

## 10. Accessibility & i18n
- Follow WCAG AA guidelines.
- No hard-coded UI strings; use i18n.
