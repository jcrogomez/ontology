// CLI parser fixture. Predicted: cli-parsing + operational-glue via
// /src/commands/<cmd>/index.ts rule. The behaviour depends on flag
// parsing, stdout shape, and exit codes — classic intent-resistant
// territory. A regenerated version may pick a different argument
// parser library, which is fine; the resistant axis acknowledges
// that small details of CLI behaviour are not faithfully recoverable
// from intent alone.

export interface GreetOptions {
  name?: string;
  loud?: boolean;
  json?: boolean;
}

export function runGreetCommand(options: GreetOptions): void {
  const name = options.name ?? "world";
  const phrase = options.loud ? `HELLO, ${name.toUpperCase()}!` : `Hello, ${name}.`;
  if (options.json) {
    console.log(JSON.stringify({ ok: true, phrase }));
  } else {
    console.log(phrase);
  }
}
