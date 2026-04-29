#!/usr/bin/env node

import { createCliProgram } from './cli/program.js';
import { resolveCliVersion } from './core/version.js';

const version = await resolveCliVersion();
const program = createCliProgram({ version });

await program.parseAsync(process.argv);
