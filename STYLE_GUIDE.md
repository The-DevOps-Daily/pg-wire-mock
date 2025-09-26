# Style Guide for pg-wire-mock

This style guide outlines the coding conventions and practices for the pg-wire-mock project.

## JavaScript Style

- We follow the ESLint and Prettier configurations in the project
- Indentation: 2 spaces
- Semicolons: required
- Quotes: single quotes for strings, except when avoiding escaping
- Line length: max 100 characters
- Trailing commas: always use trailing commas in multi-line objects and arrays
- No unused variables
- Use `const` for variables that don't need reassignment, `let` otherwise
- Never use `var`
- Always use strict equality comparisons (`===` and `!==`)

## File Organization

- Source code is in the `src/` directory
- Tests are in the `__tests__/` directory
- Each file should have a clear responsibility and focus
- Keep files to a reasonable size (under 500 lines if possible)

## Documentation

- Always add JSDoc comments for functions, classes, and interfaces
- Include `@param` tags for function parameters
- Include `@returns` tags for return values
- Explain complex logic with inline comments

## Tests

- Each module should have corresponding test file(s)
- Tests should be organized by functionality
- Use descriptive test names
- Test both happy paths and edge cases

## Git Workflow

- Create feature branches from `main`
- Use descriptive branch names (e.g., `feature/add-transaction-support`)
- Make small, focused commits with clear commit messages
- Submit PRs for review before merging to `main`
- Squash commits when merging to `main` to maintain a clean history
