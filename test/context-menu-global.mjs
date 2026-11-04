/* Global right-click coverage: custom menu opens anywhere on the page while
   the settings panel is closed, and stays off inside the open panel. */
import { launch, stubRuntime, results, PAGE_URL } from './lib/harness.mjs';

export async function run() {
  const { evalJs, send, sleep, close } = await launch();
  const { ok, finish } = results();
  await stubRuntime({ evalJs, send });
  await send('Page.navigate', { url: PAGE_URL });
  for (let i = 0; i < 100; i++) { if (await evalJs(`typeof ContextMenu!=='undefined'`)) break; await sleep(150); }
  await sleep(700);

  const rclick = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', clickCount: 1 }); await sleep(250); };
  const menuOpen = () => evalJs(`(()=>{const m=document.getElementById('context-menu');return m&&m.dataset.open==='true'})()`);
  const lclick = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(300); };

  await rclick(150, 150); ok('opens on empty top-left area', await menuOpen());
  await lclick(150, 700);
  await rclick(300, 80); ok('opens on the clock', await menuOpen());
  await lclick(150, 700);
  await rclick(500, 470); ok('opens on the search box', await menuOpen());
  await lclick(150, 700);
  await rclick(1160, 40); ok('opens on settings gear when panel closed', await menuOpen());
  await lclick(150, 700);
  await rclick(400, 810); ok('opens on bookmarks bar', await menuOpen());
  await lclick(150, 700);
  await rclick(1100, 500); ok('opens on right edge area', await menuOpen());
  await lclick(150, 700);

  await evalJs(`document.getElementById('settings-toggle').click()`); await sleep(450);
  await rclick(600, 300);
  ok('settings panel open: custom menu stays closed', !(await menuOpen()));
  await evalJs(`document.getElementById('settings-close').click()`); await sleep(450);
  await rclick(200, 200);
  ok('after closing panel, custom menu works again', await menuOpen());
  await lclick(150, 700);

  const code = finish();
  close();
  return code;
}
