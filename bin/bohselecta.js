#!/usr/bin/env node
import { main } from '../src/cli.ts';
main().catch(error => {
  console.error(`\nbohselecta: ${error.message}`);
  process.exitCode = 1;
});
