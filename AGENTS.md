# AI Coding Assistant Guidelines

This is a public OSS project. Please follow these guidelines when making changes:

## Important Rules

1. **NO REAL PRODUCT NAMES**: Do not use real company or product names in code comments, examples, or documentation. Use generic names like "MyApp", "example-app", etc.

2. **ALWAYS TEST BEFORE COMMITTING**: After making code changes, always run:
   ```bash
   npm test
   npm run lint
   ```

3. **MAINTAIN TYPE SAFETY**: This is a TypeScript project. Avoid using `any` type. Use proper type definitions.

4. **DEBUG MODE**: All commands support `--debug` flag for troubleshooting. Ensure debug logs don't expose sensitive information.

5. **ERROR MESSAGES**: Make error messages helpful and actionable. Include suggestions for fixing common issues.

## Project Structure

- `/src/cli/` - Command line interface files
- `/src/providers/` - API provider implementations
- `/src/utils/` - Utility functions
- `/src/types/` - TypeScript type definitions
- `/src/config/` - Configuration management

## Code Style

- Use ES modules (import/export)
- Follow existing code patterns
- Keep functions small and focused
- Add debug logging for important operations
- Handle errors gracefully

## Testing

- Write tests for new functionality
- Ensure all tests pass before submitting
- Test with both `--debug` and without

## Security

- Never commit API keys or credentials
- Use environment variables for sensitive data
- Validate all user inputs
- Be careful with file system operations

## Documentation

- Update README.md when adding features
- Keep examples generic and universally applicable
- Document all command options clearly