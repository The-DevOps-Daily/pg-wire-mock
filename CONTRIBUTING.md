# Contributing to pg-wire-mock

First off, thank you for considering contributing to pg-wire-mock! It's people like you that make this project such a great learning tool for PostgreSQL wire protocol.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

This section guides you through submitting a bug report. Following these guidelines helps maintainers understand your report, reproduce the behavior, and find related reports.

Before creating bug reports, please check [the issue list](https://github.com/username/pg-wire-mock/issues) as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* **Use a clear and descriptive title** for the issue to identify the problem.
* **Describe the exact steps which reproduce the problem** in as many details as possible.
* **Provide specific examples to demonstrate the steps**. Include links to files or GitHub projects, or copy/pasteable snippets, which you use in those examples.
* **Describe the behavior you observed after following the steps** and point out what exactly is the problem with that behavior.
* **Explain which behavior you expected to see instead and why.**
* **Include screenshots and animated GIFs** which show you following the described steps and clearly demonstrate the problem.
* **If the problem wasn't triggered by a specific action**, describe what you were doing before the problem happened.

### Suggesting Enhancements

This section guides you through submitting an enhancement suggestion, including completely new features and minor improvements to existing functionality.

* **Use a clear and descriptive title** for the issue to identify the suggestion.
* **Provide a step-by-step description of the suggested enhancement** in as many details as possible.
* **Provide specific examples to demonstrate the steps**. Include copy/pasteable snippets which you use in those examples.
* **Describe the current behavior** and **explain which behavior you expected to see instead** and why.
* **Include screenshots and animated GIFs** which help you demonstrate the steps or point out the part which the suggestion is related to.
* **Explain why this enhancement would be useful** to most users.

### Pull Requests

* Fill in the required template
* Do not include issue numbers in the PR title
* Include screenshots and animated GIFs in your pull request whenever possible
* Follow the JavaScript styleguide
* Include thoughtfully-worded, well-structured tests
* Document new code
* End all files with a newline

## Development Process

### Setting Up Development Environment

1. Fork the repository
2. Clone your fork: `git clone https://github.com/The-DevOps-Daily/pg-wire-mock.git`
3. Create a branch for your changes: `git checkout -b your-branch-name`
4. Install dependencies: `npm install`

### Coding Standards

* Use 2 spaces for indentation
* Use camelCase for variable names and functions
* Use PascalCase for class names
* Use meaningful variable names
* Add comments for complex logic
* Follow the principle of single responsibility

### Testing

* Write unit tests for all new code
* Ensure all tests pass before submitting a pull request
* Run tests with: `npm test`

### Documentation

* Update documentation for any changed functionality
* Document all functions and classes with JSDoc comments
* Keep the README.md updated with any significant changes

### Git Commit Messages

* Use the present tense ("Add feature" not "Added feature")
* Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
* Limit the first line to 72 characters or less
* Reference issues and pull requests liberally after the first line

## Additional Notes

### Message Implementations

When implementing a new PostgreSQL wire protocol message:

1. Create a new file in the `messages/` directory
2. Follow the existing pattern for message construction
3. Add appropriate tests in the `tests/` directory
4. Update the documentation

### Issue and Pull Request Labels

| Label name | Description |
| --- | --- |
| `bug` | Something isn't working |
| `documentation` | Improvements or additions to documentation |
| `enhancement` | New feature or request |
| `good first issue` | Good for newcomers |
| `help wanted` | Extra attention is needed |

Thank you for contributing to pg-wire-mock!
