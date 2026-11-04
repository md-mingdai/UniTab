/* Context menu basics: open on right-click, i18n labels, close on outside
   click, color-source items, settings toggle, viewport clamping. */
import { launch, stubRuntime, results, PAGE_URL } from './lib/harness.mjs';

export async function run() {
  const { evalJs, send, sleep, close } = await launch();
  const { ok, finish } = results();
  await stubRuntime({ evalJs, send });
  await send('Page.navigate', { url: PAGE_URL });
  for (let i = 0; i < 100; i++) { if (await evalJs(`typeof ContextMenu!=='undefined' && typeof Settings!=='undefined'`)) break; await sleep(150); }
  await sleep(600);

  ok('context menu node not created before first open', await evalJs(`!document.getElementById('context-menu')`));

  const rclick = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', clickCount: 1 });
    await sleep(250);
  };
  const lclick = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(300);
  };

  await rclick(600, 400);
  ok('menu opens on background right-click', await evalJs(`(()=>{
    const m=document.getElementById('context-menu');
    return m && m.dataset.open==='true' && m.getAttribute('aria-hidden')==='false';
  })()`));
  ok('menu items rendered', await evalJs(`(()=>{
    const m=document.getElementById('context-menu');
    const btns=m.querySelectorAll('.context-menu-item');
    return btns.length>=3;
  })()`));
  ok('menu labels resolved via i18n (refresh present for bing)',
    await evalJs(`(()=>{
      const m=document.getElementById('context-menu');
      const labels=[...m.querySelectorAll('.context-menu-label')].map(l=>l.textContent);
      return labels.some(t=>t.includes('刷新')||t.includes('Refresh'));
    })()`));
  await lclick(600, 700);
  ok('menu closes on outside click', await evalJs(`(()=>{
    const m=document.getElementById('context-menu');
    return m && m.dataset.open==='false';
  })()`));

  await evalJs(`(()=>{const s=Settings.getState();s.bgSource='color';})()`);
  await rclick(600, 400);
  ok('color source shows copy-color + settings (2 items, no refresh)',
    await evalJs(`(()=>{
      const m=document.getElementById('context-menu');
      const labels=[...m.querySelectorAll('.context-menu-label')].map(l=>l.textContent);
      return labels.length===2 && labels.some(t=>t.includes('复制')||t.includes('Copy'));
    })()`));
  await lclick(600, 700);

  await evalJs(`document.getElementById('settings-toggle').click()`); await sleep(400);
  await evalJs(`document.querySelector('.settings-tab[data-tab="display"]').click()`); await sleep(450);
  ok('context menu toggle exists, default on', await evalJs(`(()=>{
    const t=document.getElementById('show-context-menu-toggle');
    return t && t.classList.contains('on') && t.getAttribute('aria-checked')==='true';
  })()`));
  ok('toggle label present', await evalJs(`(()=>{
    const t=document.getElementById('show-context-menu-toggle');
    return t.closest('.setting-group').textContent.includes('右键') || t.closest('.setting-group').textContent.includes('right-click');
  })()`));
  await evalJs(`document.getElementById('show-context-menu-toggle').click()`); await sleep(400);
  ok('toggling off persists showContextMenu=false', await evalJs(`new Promise(r=>setTimeout(()=>r(Settings.getState().showContextMenu===false),300))`));
  await evalJs(`document.getElementById('settings-close').click()`); await sleep(300);

  await rclick(600, 400);
  ok('menu does not open when setting is off', await evalJs(`(()=>{
    const m=document.getElementById('context-menu');
    return m && m.dataset.open==='false';
  })()`));

  await evalJs(`document.getElementById('settings-toggle').click()`); await sleep(400);
  await evalJs(`document.querySelector('.settings-tab[data-tab="display"]').click()`); await sleep(450);
  await evalJs(`document.getElementById('show-context-menu-toggle').click()`); await sleep(300);
  await evalJs(`document.getElementById('settings-close').click()`); await sleep(300);

  await rclick(1150, 850);
  ok('menu clamped inside viewport', await evalJs(`(()=>{
    const m=document.getElementById('context-menu');
    const r=m.getBoundingClientRect();
    return r.right<=1200 && r.bottom<=900 && r.left>=0 && r.top>=0;
  })()`));

  const code = finish();
  close();
  return code;
}
