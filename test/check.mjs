/* UniTab test suite entry.
   Run with: node test/check.mjs
   Kept at a fixed path/name so it can be allowlisted in Claude Code settings. */
import { run as fold } from './fold.mjs';
import { run as contextMenu } from './context-menu.mjs';
import { run as contextMenuGlobal } from './context-menu-global.mjs';
import { run as bingSwitch } from './bing-switch.mjs';
import { run as copyrightLink } from './copyright-link.mjs';
import { run as refresh } from './refresh.mjs';
import { run as notice } from './notice.mjs';

const suites = [
  ['fold (collapsible settings categories)', fold],
  ['context-menu (right-click basics)', contextMenu],
  ['context-menu-global (whole-page coverage)', contextMenuGlobal],
  ['bing-switch (stale auto-refresh)', bingSwitch],
  ['copyright-link (open source page)', copyrightLink],
  ['refresh (right-click refresh link)', refresh],
  ['notice (refresh toast notifications)', notice],
];

let failed = 0;
for (const [name, run] of suites) {
  console.log(`\n=== ${name} ===`);
  try {
    const code = await run();
    if (code !== 0) failed++;
  } catch (e) {
    console.error('SUITE ERROR:', e);
    failed++;
  }
}

console.log(failed ? `\n${failed} suite(s) failed` : '\nAll suites passed');
process.exit(failed ? 1 : 0);
