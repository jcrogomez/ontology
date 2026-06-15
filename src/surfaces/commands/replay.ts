import { readState, writeState } from "../../kernel/core/state/state-store.js";
import {
  diffReplayedState,
  materializeReplayedState,
  readEventLog,
  replayEvents,
} from "../../kernel/core/state/replay.js";
import { errorMessage } from "../../kernel/core/errors.js";

// `onto replay` — rebuild the state summary from events.jsonl alone and
// compare it to state.json (MATHEMATICAL_CLAIMS.md §4.4). Default is
// CHECK-ONLY (read-only, exits 1 on divergence or a broken chain);
// `--write` repairs state.json from the replayed fold — the recovery
// primitive for a diverged or hand-mangled state file.

export interface ReplayOptions {
  write?: boolean;
  json?: boolean;
}

export async function replayCommand(options: ReplayOptions): Promise<void> {
  let events;
  try {
    events = readEventLog();
  } catch (err: unknown) {
    failWith(`event log unreadable: ${errorMessage(err)}`, options.json);
    return;
  }
  if (events.length === 0) {
    failWith(`no events found — is this an initialised .ontology/ project?`, options.json);
    return;
  }

  const { replayed, chainViolations, warnings } = replayEvents(events);
  const onDisk = readState();
  const divergences = diffReplayedState(replayed, onDisk);
  const ok = divergences.length === 0 && chainViolations.length === 0;

  let written = false;
  if (options.write && chainViolations.length === 0) {
    writeState(materializeReplayedState(replayed, onDisk));
    written = true;
  }

  if (options.json) {
    console.log(JSON.stringify({
      ok,
      eventCount: events.length,
      replayed,
      divergences,
      chainViolations,
      warnings,
      written,
    }, null, 2));
  } else {
    console.log(`=== ONTOLOGY REPLAY (events.jsonl → state) ===`);
    console.log(`Events folded:   ${events.length}`);
    console.log(`Chain integrity: ${chainViolations.length === 0 ? "✓ intact (sequence + previousEventId)" : `✖ ${chainViolations.length} violation(s)`}`);
    for (const v of chainViolations) {
      console.error(`  ✖ seq ${v.sequence} (${v.eventId}): ${v.problem}`);
    }
    for (const w of warnings) console.error(`  ⚠ ${w}`);
    if (divergences.length === 0) {
      console.log(`State match:     ✓ every log-derived field of state.json equals its replay`);
    } else {
      console.log(`State match:     ✖ ${divergences.length} divergence(s)`);
      for (const d of divergences) {
        console.error(`  ✖ ${d.field}: replayed ${JSON.stringify(d.replayed)} ≠ on-disk ${JSON.stringify(d.onDisk)}`);
      }
    }
    if (written) {
      console.log(`Repair:          state.json rewritten from the replayed fold (--write)`);
    } else if (!ok && !options.write) {
      console.log(``);
      console.log(`Run \`onto replay --write\` to rebuild state.json from the log.`);
    }
    if (options.write && chainViolations.length > 0) {
      console.error(`✖ --write refused: the chain itself is broken — repair the log before trusting a replay of it`);
    }
  }

  // After a successful --write the state matches by construction.
  if (!ok && !written) process.exitCode = 1;
  if (options.write && chainViolations.length > 0) process.exitCode = 1;
}

function failWith(msg: string, json?: boolean): void {
  process.exitCode = 1;
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
}
