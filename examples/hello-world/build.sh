#!/usr/bin/env bash
#
# examples/hello-world/build.sh
#
# The canonical hello world of Ontology.
#
# Builds a small intention graph (canon -> project -> target -> domain ->
# workflow -> artifact), compiles the artifact node through the topological
# plan, and writes a working Python script to disk. If python3 is on PATH,
# the script is executed and "hello world" is printed.
#
# This is the simplest possible demonstration that Ontology compiles
# intentions into running programs. The mock provider acts as the identity
# functor (axiom 6 made trivial); the real story plays out the same way
# with `--provider ollama` or any future model adapter.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EXAMPLE_DIR="$SCRIPT_DIR"
ONTO="npx tsx ${REPO_ROOT}/src/cli.ts"

# 1. Wipe any prior example state and start clean. The example is
#    deterministic; running it twice should produce the same artifact.
rm -rf "$EXAMPLE_DIR/.ontology"
cd "$EXAMPLE_DIR"

echo "=== ONTOLOGY HELLO WORLD ==="
echo ""
echo "Step 1: initialize the kernel"
$ONTO init >/dev/null
echo "  ✓ .ontology/ created"
echo ""

# 2. Build the intention chain. Each step is a typed semantic node at a
#    specific abstraction level. Together they refine canon's mathematical
#    statement into an executable Python script.
echo "Step 2: build the intention chain"
$ONTO node create \
  --level project \
  --kind decision \
  --prompt "A demo project that prints a greeting." \
  --label "Greeting demo" >/dev/null
echo "  ✓ node_0001  project    Greeting demo"

$ONTO node create \
  --level target \
  --kind decision \
  --prompt "Compile this project as a single Python script." \
  --label "Python target" >/dev/null
echo "  ✓ node_0002  target     Python target"

$ONTO node create \
  --level domain \
  --kind entity \
  --prompt "The greeting domain: a function that prints a string." \
  --label "Greeting domain" >/dev/null
echo "  ✓ node_0003  domain     Greeting domain"

$ONTO node create \
  --level workflow \
  --kind action \
  --prompt "Print a greeting." \
  --label "Print greeting" >/dev/null
echo "  ✓ node_0004  workflow   Print greeting"

# The leaf: manifestation=code, language=python, prompt is the literal
# Python source. Mock provider passes it through verbatim (identity functor).
# A real model (--provider ollama) would generate similar code from a
# higher-level prompt.
$ONTO node create \
  --level artifact \
  --kind artifact \
  --manifestation code \
  --language python \
  --prompt 'print("hello world")' \
  --label "hello world artifact" >/dev/null
echo "  ✓ node_0005  artifact   hello world artifact (manifestation=code, language=python)"
echo ""

# 3. Link the chain with refinement edges. Each child refines its parent
#    in the abstraction poset (axiom 3). Refinement edges are the canonical
#    hard dependency for compilation order.
echo "Step 3: link refinement edges"
$ONTO node link --from node_0001 --to node_0000_canon --type refines >/dev/null
$ONTO node link --from node_0002 --to node_0001 --type refines >/dev/null
$ONTO node link --from node_0003 --to node_0002 --type refines >/dev/null
$ONTO node link --from node_0004 --to node_0003 --type refines >/dev/null
$ONTO node link --from node_0005 --to node_0004 --type refines >/dev/null
echo "  ✓ 5 refines edges (each level refines its higher abstraction)"
echo ""

# 4. Verify topology before compiling. Loud error if anything is off.
echo "Step 4: validate"
$ONTO validate | tail -2 | sed 's/^/  /'
echo ""

# 5. Preview the compile order (no artifact written yet).
echo "Step 5: preview compile plan"
$ONTO compile plan node_0005 | tail -8 | sed 's/^/  /'
echo ""

# 6. Compile. This dispatches each node's prompt through the mock provider
#    in topological order; the leaf's prompt produces the artifact.
echo "Step 6: compile"
$ONTO compile run node_0005 --provider mock | tail -10 | sed 's/^/  /'
echo ""

ARTIFACT="$EXAMPLE_DIR/.ontology/artifacts/generated/node_0005.py"

echo "Step 7: artifact"
echo "  Path:     $ARTIFACT"
echo "  Contents:"
sed 's/^/    /' "$ARTIFACT"
echo ""

# 7. Run the artifact. Optional — only if python3 is available.
if command -v python3 >/dev/null 2>&1; then
  echo "Step 8: run the artifact"
  echo "  $ python3 $ARTIFACT"
  OUT="$(python3 "$ARTIFACT")"
  echo "  $OUT"
  echo ""
  if [ "$OUT" = "hello world" ]; then
    echo "✓ Ontology compiled an intention into a working program."
  else
    echo "✖ Unexpected output: $OUT"
    exit 1
  fi
else
  echo "Step 8: (python3 not on PATH; skipping execution)"
  echo "        Run manually: python3 $ARTIFACT"
fi
