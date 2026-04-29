# Ecolístico Ontology Compiler

The Ecolístico Ontology Compiler is a deterministic, antifragile toolchain for semantic UI generation. It acts as a CLI bridge between human intent and strictly validated Ontology Specification Language (OSL) views.

## Features

- **Semantic Parser**: Converts natural language intent into strictly-typed OSL Views using LLMs (e.g. Ollama).
- **Deep Planning Mode**: Explores and resolves the context of a workspace domain.
- **Deterministic Validations**: Leverages Zod schemas to guarantee structural integrity of the generated artifacts.
- **Dependency Injected architecture**: Pure core logic decoupled from the CLI interface layer.

## Usage

```bash
# Initialize a new workspace
onto init workspace

# Plan a view based on an intent
onto plan "Confirm harvest weight and queue offline sync if needed." --mock
```

## Testing

The tool is tested strictly by verifying deterministic reality (YAML file creation, valid OSL content) instead of asserting presentation outputs.

```bash
npm test
```
