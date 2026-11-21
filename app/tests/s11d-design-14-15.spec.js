// S11d/e の受け入れ試験（7207f8a では落ちてよい）。design/34 §14・§15 と S11e 追加指示。
// このファイルを <worktree>/app/tests/ へ写し、npx playwright test s11d-design-14-15.spec.js --project=chromium --workers=1
import { test, expect } from '@playwright/test';
import { openApp, seed, ev, dbEvents, enableCalendars } from './helpers.js';
// 横の帯の位置は仮値。実機 D-16 のスクショで検証してから、ここ1か所を直す。
const GEO = Object.freeze({ portrait: { width:466,height:678 }, landscape:{width:678,height:466}, rail:84, homeBand:33, landRailX:594, landHomeY:433 });
const DAY='2026-11-12';
const EVENTS=[...Array.from({length:7},(_,i)=>ev(`q${i}`,`予定${i}`,`${DAY}T${String(9+i).padStart(2,'0')}:00`,`${DAY}T${String(9+i).padStart(2,'0')}:30`))];
const r = (loc)=>loc.evaluate(e=>{const b=e.getBoundingClientRect();return [b.left,b.top,b.right,b.bottom].map(v=>Math.round(v*100)/100);});
const near=(a,b,msg='')=>expect(Math.abs(a-b),`${msg}: ${a} vs ${b}`).toBeLessThanOrEqual(.6);
const rect=(a,b,msg='')=>{expect(a.length).toBe(b.length);a.forEach((v,i)=>near(v,b[i],`${msg}[${i}]`));};
async function boot(page,{sar=GEO.rail,fresh=false,data=true}={}){
 await page.addInitScript(sar=>document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.setProperty('--sar',`${sar}px`)),sar);
 await openApp(page,GEO.portrait,'',fresh?{fresh:true}:{});
 if(data)await seed(page,EVENTS);
 const m=page.getByRole('button',{name:'月',exact:true});if(await m.isVisible().catch(()=>false)){await m.click();await page.waitForTimeout(250);}
 await page.waitForTimeout(300);
}
async function toStage(page,n){const g=page.locator('.mgrab');await g.focus();for(let i=0;i<8;i++){const s=Number(await page.locator('.mpull').getAttribute('data-stage'));if(s===n)break;await page.keyboard.press(s<n?'ArrowUp':'ArrowDown');}await page.waitForTimeout(450);}
async function moreGo(page,name){await page.locator('.cmore').click();await page.getByRole('menuitem',{name}).click();await page.waitForTimeout(500);}
async function editNote(page){await page.locator('[data-act="daynote"]:visible').first().click();await page.waitForTimeout(450);await page.locator('.nsheet .ned-body').click();await page.waitForTimeout(200);}
const visRects=(page,selector)=>page.locator(selector).evaluateAll(es=>es.filter(e=>{const c=getComputedStyle(e),b=e.getBoundingClientRect();return c.visibility!=='hidden'&&Number(c.opacity)>.05&&b.width>0&&b.height>0;}).map(e=>{const b=e.getBoundingClientRect();return [b.left,b.top,b.right,b.bottom];}));

test('§14 帯あり横: 格子 x8〜374 y64〜424・行60×6・2件、日の欄 x382〜594・つまみ（上）なし（つまみ（下）は §17-3 で使う）',async({page})=>{
 await boot(page);await page.setViewportSize(GEO.landscape);await page.waitForTimeout(650);
 const g=page.locator('.mgrid:not([data-leaving])');rect(await r(g),[8,64,374,424],'格子');
 await expect(g.locator('.week')).toHaveCount(6);
 for(const w of await g.locator('.week').all()){const b=await r(w);near(b[3]-b[1],60,'行');}
 const d=g.locator(`[data-date="${DAY}"]`);const n=await d.locator('.chip').evaluateAll(es=>es.filter(e=>Number(getComputedStyle(e).opacity)>.5).length);expect(n).toBe(2);
 rect(await r(page.locator('.mday')),[382,0,GEO.landRailX,466],'日の欄');
 expect((await visRects(page,'.mgrab')).length,'横にはつまみ（上）がない').toBe(0);
});

test('§14 帯あり横: 右の列と「…」メニュー・ノートのシート',async({page})=>{
 await boot(page);await page.setViewportSize(GEO.landscape);await page.waitForTimeout(650);
 for(const [s,y]of [['.ctask',172],['.cmore',232],['.cadd',377]]){rect(await r(page.locator(s)),[608,y-4,664,y+52],s);rect(await r(page.locator(`${s} > :first-child`)),[612,y,660,y+48],`${s} 丸`);}
 await page.locator('.cmore').click();rect(await r(page.getByRole('menu')),[362,189,586,425],'メニュー');await page.keyboard.press('Escape');
 await editNote(page);rect(await r(page.locator('.nsheet')),[0,8,594,466],'横のシート');
});

test('§14.5 帯なし横: 格子と日の欄は左右、…・タスクは見出し右、＋56・下余白105',async({page})=>{
 await boot(page,{sar:0});await page.setViewportSize(GEO.landscape);await page.waitForTimeout(650);
 rect(await r(page.locator('.mgrid:not([data-leaving])')),[8,64,374,424]);rect(await r(page.locator('.mday')),[382,0,678,466]);
 rect(await r(page.locator('.cmore')),[590,0,634,44]);rect(await r(page.locator('.ctask')),[634,0,678,44]);
 rect(await r(page.locator('.cadd')),[614,369,670,425]);rect(await r(page.locator('.cadd > :first-child')),[618,373,666,421]);
 near(await page.locator('.mday').evaluate(e=>parseFloat(getComputedStyle(e).paddingBottom)),105);
});

test('S11e 横では stage を書き換えず保存しない。横→縦で元の段5へ戻る',async({page})=>{
 await boot(page);await toStage(page,5);
 await page.evaluate(()=>{window.__qaStageWrites=[];const orig=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('duo.ui.v1')){try{window.__qaStageWrites.push(JSON.parse(v).stage);}catch{}}return orig.call(this,k,v);};});
 await page.setViewportSize(GEO.landscape);await page.waitForTimeout(650);
 const s=await page.locator('.mpull').getAttribute('data-stage');expect(s===null||s==='5','横で別の段に書き換えない').toBe(true);
 // 横で保存を起こしうる選択・メニューを使い、stage が保存に混じらないことも見る。
 await page.locator('.mgrid:not([data-leaving]) [data-date="2026-11-13"]').click({position:{x:8,y:10}});await page.waitForTimeout(200);
 const writes=await page.evaluate(()=>window.__qaStageWrites);expect(writes.every(v=>v===undefined||v===null),'横の saveUi は stage を書かない').toBe(true);
 await page.setViewportSize(GEO.portrait);await page.waitForTimeout(650);await expect(page.locator('.mpull')).toHaveAttribute('data-stage','5');
});

test('§15① 帯あり縦のシート x0〜382 y152〜678・完了 x326〜370',async({page})=>{
 await boot(page);await editNote(page);rect(await r(page.locator('.nsheet')),[0,152,382,678]);
 const done=page.locator('.nsheet').getByRole('button',{name:/完了/});const b=await r(done);near(b[0],326);near(b[2],370);near(b[3]-b[1],44);
});

test('§15② 帯ありノートは右の列だけに戻す/やり直す、シートの戻す群なし、＋非表示',async({page})=>{
 await boot(page);await editNote(page);
 const undo=await visRects(page,'button[aria-label="元に戻す"]');expect(undo.length,'見える戻すは1つ').toBe(1);rect(undo[0],[396,168,452,224]);
 const redo=await visRects(page,'button[aria-label="やり直す"]');expect(redo.length).toBe(1);rect(redo[0],[396,228,452,284]);
 await expect(page.locator('.cadd')).toBeHidden();expect((await visRects(page,'.nsheet .ned-undo,.nsheet .ned-redo')).length).toBe(0);
 await expect(page.getByRole('button',{name:'元に戻す',exact:true})).toHaveCount(1);await expect(page.getByRole('button',{name:'やり直す',exact:true})).toHaveCount(1);
 expect((await visRects(page,'.cmore')).length,'書いている間その他はやり直すへ').toBe(0);
});

test('§15② 戻す/やり直す: 空履歴の記号 #C9C5BA、使えないとき何もしない、本文焦点保持',async({page})=>{
 await boot(page);await editNote(page);
 const undo=page.getByRole('button',{name:'元に戻す',exact:true}),redo=page.getByRole('button',{name:'やり直す',exact:true});
 const gray=async loc=>loc.evaluate(e=>{const svg=e.querySelector('svg');const c=getComputedStyle(svg||e);return [c.color,c.stroke,svg?.getAttribute('stroke')];});
 expect((await gray(undo)).some(c=>c==='rgb(201, 197, 186)'||c==='#C9C5BA'),'元に戻すの使えない色').toBe(true);
 expect((await gray(redo)).some(c=>c==='rgb(201, 197, 186)'||c==='#C9C5BA'),'やり直すの使えない色').toBe(true);
 const body=page.locator('.ned-body');const before=await body.evaluate(e=>e.value??e.textContent);await undo.click();expect(await body.evaluate(e=>e.value??e.textContent)).toBe(before);
 await body.click();await page.keyboard.type('確認abc');await page.waitForTimeout(500);await undo.click();await redo.click();await expect(body).toBeFocused();expect(await body.evaluate(e=>e.value??e.textContent)).toContain('確認abc');
});

test('§15③ 帯なし縦: タスク/…44、今日へ64、見出し中心233、＋は見える48・押せる56',async({page})=>{
 await boot(page,{sar:0});rect(await r(page.locator('.ctask')),[414,0,458,44]);rect(await r(page.locator('.cmore')),[370,0,414,44]);
 rect(await r(page.locator('.cadd')),[402,581,458,637]);rect(await r(page.locator('.cadd > :first-child')),[406,585,454,633]);
 await page.locator('.mph [data-act="next"]').click({force:true});await page.waitForTimeout(400);await page.locator('.mph [data-act="next"]').click({force:true});await page.waitForTimeout(400);
 rect(await r(page.getByRole('button',{name:'今日へ'})),[306,0,370,44]);
 const h=await r(page.locator('.mph h2'));near((h[0]+h[2])/2,195,'題名箱 x84〜306 の中央');
 await page.locator('.cmore').click();rect(await r(page.getByRole('menu')),[190,48,414,284]);
});

test('§15③ 帯なし縦: 日の欄の下余白105、送り切ると最後の内容が＋上端581の8上',async({page})=>{
 await boot(page,{sar:0});await toStage(page,7);
 const pane=page.locator('.mday');near(await pane.evaluate(e=>parseFloat(getComputedStyle(e).paddingBottom)),105);
 await pane.evaluate(e=>e.scrollTop=e.scrollHeight);await page.waitForTimeout(300);
 const bottom=await pane.evaluate(e=>Math.max(...[...e.querySelectorAll('*')].filter(x=>x.getBoundingClientRect().height>0).map(x=>x.getBoundingClientRect().bottom)));expect(bottom).toBeLessThanOrEqual(573.6);
});

test('§15④ ホームのタイムライン → 段7・日の欄B（1時間44）、別の日の画面を開かない',async({page})=>{
 await boot(page);await moreGo(page,/ホーム/);await page.locator('.home').getByRole('button',{name:'タイムライン',exact:true}).click();await page.waitForTimeout(500);
 await expect(page.locator('.shell.closed.tv-day')).toHaveCount(0);await expect(page.locator('.mpull')).toHaveAttribute('data-stage','7');await expect(page.locator('.mday')).toHaveAttribute('data-dg','B');
 const hh=await page.locator('.mday .hour').evaluateAll(es=>es.slice(0,2).map(e=>e.getBoundingClientRect().top));expect(hh.length).toBe(2);near(hh[1]-hh[0],44);
});

test('望ましい: 週の時間軸の見出し中心は x191（帯あり）',async({page})=>{
 await boot(page);await moreGo(page,'週の時間軸');
 // 箱（h2 は x0〜382）ではなく、見えている文字の範囲で見る。7207f8a は文字の中心が約 x251。
 const c=await page.locator('#ctitle').evaluate(e=>{const g=document.createRange();g.selectNodeContents(e);const b=g.getBoundingClientRect();return (b.left+b.right)/2;});near(c,191,'文字の中心');
});

test('S11e ヒントは指定の2行・13/400/18・上下内側8・段1で y520〜572、二度目は出さない',async({page})=>{
 await boot(page,{fresh:true,data:false});const h=page.locator('.mhint');await expect(h).toBeVisible();rect(await r(h),[56,520,326,572]);
 const q=await h.evaluate(e=>{const c=getComputedStyle(e);return{t:e.innerText,fs:c.fontSize,fw:c.fontWeight,lh:c.lineHeight,pt:c.paddingTop,pb:c.paddingBottom};});
 expect(q.t).toBe('上下に引くと、月・2週・1週が切り替わります。\n左右に送ると、前後の月へ動きます。');expect([q.fs,q.fw,q.lh,q.pt,q.pb]).toEqual(['13px','400','18px','8px','8px']);
 await page.mouse.click(50,30);await page.waitForTimeout(250);await page.reload();await page.waitForSelector('html[data-ready]');await page.waitForTimeout(500);await expect(page.locator('.mhint')).toHaveCount(0);
});

test('S11e ヒントは横では出さず、初めて縦で開いたら出す',async({page})=>{
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.setProperty('--sar','84px')));
 await openApp(page,GEO.landscape,'',{fresh:true});await page.waitForTimeout(500);await expect(page.locator('.mhint')).toHaveCount(0);
 await page.setViewportSize(GEO.portrait);await page.waitForTimeout(500);await expect(page.locator('.mhint')).toBeVisible();
});

test('S11e フォーカス: 指タップ後は枠なし、キーボードは :focus-visible 太さ2・#2F6B4F・角丸4・内側2',async({page})=>{
 await boot(page);const g=page.locator('.mgrab');await g.click();
 const style=()=>g.evaluate(e=>{const c=getComputedStyle(e);return{fv:e.matches(':focus-visible'),os:c.outlineStyle,ow:c.outlineWidth,oc:c.outlineColor,off:c.outlineOffset,rad:c.borderRadius};});
 const tap=await style();expect(tap.fv).toBe(false);expect(tap.os==='none'||tap.ow==='0px').toBe(true);
 await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');const kb=await style();expect(kb.fv,'キーボードで枠を消さない').toBe(true);expect([kb.os,kb.ow,kb.oc,kb.rad,kb.off]).toEqual(['solid','2px','rgb(47, 107, 79)','4px','-2px']);
});

// S11e (a) B-1: 見えない「前の月」「次の月」の送る幅は今の段で決める（34 §9.1-1・§10・§12 Q-14）。段1〜3は1か月、段4〜6は1週（7日）、段7は7日。
// 保存に monthForm がなく段だけある初回の形（monthForm 既定 'two' と食い違う）と、まっさらの起動の両方で見る。押し方は detail=0 の合成クリック（VoiceOver・スイッチと同じ）。
const STEP = { 1: 'm', 2: 'm', 3: 'm', 4: 7, 5: 7, 6: 7, 7: 7 };
const addDays = (k, n) => { const d = new Date(`${k}T12:00:00+09:00`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (k, n) => { const [y, m, d] = k.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`; };
const selOf = (page) => page.evaluate(() => document.querySelector('.mgrid:not([data-leaving]) .day[aria-selected="true"], .mgrid:not([data-leaving]) .day.selected')?.dataset.date);
const press0 = (page, dir) => page.locator(`.mph [data-act="${dir}"]`).first().evaluate((e) => e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 })));
for (const n of [1, 2, 3, 4, 5, 6, 7]) {
  test(`S11e(a) 段${n}（保存は段だけ）: 見えない「次の月」「前の月」は ${STEP[n] === 'm' ? '1か月' : '7日'}送る`, async ({ page }) => {
    await page.addInitScript(({ n }) => { if (!sessionStorage.getItem('qa-set')) { localStorage.setItem('duo.ui.v1', JSON.stringify({ stage: n, home: false })); sessionStorage.setItem('qa-set', '1'); } }, { n });
    await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', '84px')));
    await openApp(page, GEO.portrait, '', { fresh: true }); await page.waitForTimeout(400);
    await expect(page.locator('.mpull')).toHaveAttribute('data-stage', String(n));
    const k0 = await selOf(page); expect(k0).toBeTruthy();
    const want = STEP[n] === 'm' ? addMonths(k0, 1) : addDays(k0, 7);
    await press0(page, 'next'); await page.waitForTimeout(450); expect(await selOf(page), `段${n} 次`).toBe(want);
    await press0(page, 'prev'); await page.waitForTimeout(450); expect(await selOf(page), `段${n} 前`).toBe(STEP[n] === 'm' ? addMonths(want, -1) : k0);
    await expect(page.locator('.mpull')).toHaveAttribute('data-stage', String(n));
  });
}
test('S11e(a) まっさらの初回起動（段1）: detail=0 の「次の月」で見出しの月が1回で変わる', async ({ page }) => {
  await boot(page, { fresh: true, data: false });
  const t0 = await page.locator('#ctitle').textContent(); const k0 = await selOf(page);
  await press0(page, 'next'); await page.waitForTimeout(450);
  expect(await page.locator('#ctitle').textContent()).not.toBe(t0); expect(await selOf(page)).toBe(addMonths(k0, 1));
});
test('a11y: 段を往復して同期した後も detail=0 の「次の月」「前の月」が使える', async ({ page }) => {
  await boot(page, { fresh: true, data: false }); await toStage(page, 4); await toStage(page, 1);
  for (const [dir, title] of [['next', '2026年12月'], ['prev', '2026年11月']]) { await page.locator(`.mph [data-act="${dir}"]`).evaluate((e) => e.click()); await page.waitForTimeout(450); await expect(page.locator('#ctitle')).toHaveText(title); }
});

// S11e (b): 画面の記憶は閉じた画面と開いた画面で分ける。閉じた画面が読み書きするのは 段（stage）・選んだ日（selected）・日の欄のつまみの段（dayGrip）だけ。
const OPEN = { width: 626, height: 890 };
const CLOSED_KEYS = ['stage', 'selected', 'dayGrip'];
async function openSideView(page, how) {
  if (how === 'day') { const b = page.getByRole('button', { name: '日', exact: true }).first(); await b.click(); await page.waitForTimeout(400); return '.shell.tv-day'; }
  return null; // 'week'・'home' は起動前に保存値で開いた側を作る（下の preset）

}
const PRESET = { week: { view: 'week', home: false }, home: { home: true } };
for (const how of ['day', 'week', 'home']) {
  test(`S11e(b) 開いた縦で「${how}」→ 閉じた画面で起動し日を選ぶ → 開くと元の画面。開いた側の保存値は変わらない`, async ({ page }) => {
    if (PRESET[how]) await page.addInitScript((p) => { if (!sessionStorage.getItem('qa-set')) { const k = 'duo.ui.v1'; let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { s = {}; } localStorage.setItem(k, JSON.stringify({ ...s, ...p })); sessionStorage.setItem('qa-set', '1'); } }, PRESET[how]);
    await openApp(page, OPEN); await seed(page, EVENTS); await page.waitForTimeout(300);
    const sel = await openSideView(page, how);
    const snap = () => page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'));
    const shellCls = () => page.evaluate(() => document.querySelector('.shell')?.className || '');
    const before = await snap(), cls0 = await shellCls();
    await page.setViewportSize(GEO.portrait); await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(500);
    await page.locator('.mgrid:not([data-leaving]) .day[data-date="2026-11-13"]').click({ position: { x: 20, y: 18 } }); await page.waitForTimeout(300); // saveUi が走る操作
    const mid = await snap();
    const changed = Object.keys(before).filter( // 開いた側で保存してあった値が変わったか（足された既定値は見ない）
      (k) => JSON.stringify(before[k]) !== JSON.stringify(mid[k]) && !CLOSED_KEYS.includes(k));
    expect(changed, '閉じた画面が書き換えた開いた側のキー').toEqual([]);
    await page.setViewportSize(OPEN); await page.waitForTimeout(600);
    if (sel) await expect(page.locator(sel)).toHaveCount(1);
    const cls1 = await shellCls(); expect(cls1.split(/\s+/).filter((c) => /^tv-|^home|^v-/.test(c)).sort(), '開くと元の画面').toEqual(cls0.split(/\s+/).filter((c) => /^tv-|^home|^v-/.test(c)).sort());
    await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(400);
    const cls2 = await shellCls(); expect(cls2.split(/\s+/).filter((c) => /^tv-|^home|^v-/.test(c)).sort(), '開いた画面で読み込み直しても元の画面').toEqual(cls0.split(/\s+/).filter((c) => /^tv-|^home|^v-/.test(c)).sort());
  });
}


// ===== design/34 §16（2026-11-21。S11e/S11f で入る。0568d18 では落ちてよい） =====
const LINE = 'rgb(228, 224, 214)';
const hasTopLine = (el) => { const c = getComputedStyle(el), b = getComputedStyle(el, '::before'), a = getComputedStyle(el, '::after');
  const line = 'rgb(228, 224, 214)';
  if (parseFloat(c.borderTopWidth) > 0 && parseFloat(c.borderTopWidth) <= 1 && c.borderTopColor === line && c.borderTopStyle !== 'none') return true;
  if (c.boxShadow.includes(line)) return true;
  for (const p of [b, a]) if (p.content !== 'none' && (p.backgroundColor === line || p.borderTopColor === line) && parseFloat(p.height) <= 1) return true;
  return false; };
async function gripAt(page) { return page.evaluate((fn) => { const hasTopLine = eval(fn); const d = document.querySelector('.mpull.browse .mday') || document.querySelector('.mday'), g = d.querySelector('.mdgrab'); const gb = g.getBoundingClientRect(), db = d.getBoundingClientRect(); const ln = g.querySelector('i')?.getBoundingClientRect(); const hit = document.elementFromPoint(191, gb.top + 22); return { r: [gb.left, gb.top, gb.right, gb.bottom], pane: [db.top, db.bottom], line: ln && [ln.left, ln.top, ln.right, ln.bottom], pos: getComputedStyle(g).position, topLine: hasTopLine(g), hit: !!hit && (hit === g || g.contains(hit)), z: getComputedStyle(g).zIndex, st: d.scrollTop, max: d.scrollHeight - d.clientHeight }; }, hasTopLine.toString()); }

for (const n of [2, 3, 4, 5, 6, 7]) {
  test(`§16-1 段${n} 予定の多い日: つまみ（下）は日の欄の下端に貼り付く（押せる x8〜374 y593〜637、線 y611〜615、上に 0.5 #E4E0D6）`, async ({ page }) => {
    await boot(page); await toStage(page, n);
    const g = await gripAt(page);
    expect(g.pos, 'sticky').toBe('sticky');
    rect(g.r, [8, 593, 374, 637], `段${n} 押せる範囲`);
    if (g.line) { rect(g.line, [173, 611, 209, 615], `段${n} 線 36×4`); }
    expect(g.topLine, '貼り付いている間は上の辺に 0.5 の線').toBe(true);
    expect(g.hit, 'その位置をたたくとつまみ').toBe(true);
    expect(g.r[3], 'ホームバーの帯 y645 に入らない').toBeLessThanOrEqual(645 - 8 + 0.5);
    await expect(page.locator('.mdtl:visible')).toHaveCount(0);
    // 送り切ると元の位置（最後のカードの下端から 44）へ戻り、上の線は消える
    await page.locator('.mpull.browse .mday').evaluate((d) => { d.scrollTop = d.scrollHeight; }); await page.waitForTimeout(250);
    const e = await gripAt(page);
    const lastBottom = await page.evaluate(() => { const c = [...document.querySelectorAll('.mpull.browse .mday .mdcard, .mpull.browse .mday .mdnone2')].at(-1); return c.getBoundingClientRect().bottom; });
    near(e.r[1], lastBottom, `段${n} 送り切ると最後のカードの下端から`);
    expect(e.topLine, '送り切ったら上の線はない').toBe(false);
  });
}
test('§16-1 段1は貼り付けない。「時間軸」入口（.mdtl）はどの段にもない', async ({ page }) => {
  await boot(page); await toStage(page, 1);
  const g = await gripAt(page); expect(g.r[1], '段1のつまみ（下）は元の位置（日の欄の外）').toBeGreaterThan(678);
  for (const n of [1, 2, 3, 4, 5, 6, 7]) { await toStage(page, n); await expect(page.locator('.mdtl'), `段${n}`).toHaveCount(0); }
});
test('§16-1 帯なし: 貼り付いたつまみの押せる範囲は x8〜402（＋の左）、線の中心 x233', async ({ page }) => {
  await boot(page, { sar: 0 }); await toStage(page, 4);
  const g = await gripAt(page); rect(g.r, [8, 593, 402, 637], '帯なしの押せる範囲');
  if (g.line) near((g.line[0] + g.line[2]) / 2, 233, '線の中心');
});
for (const n of [2, 4, 7]) {
  test(`§16-2 段${n}: 日の見出し .mdh は sticky top:0 z6、送ってもカードが上 20 に入らない`, async ({ page }) => {
    await boot(page); await toStage(page, n);
    const h = page.locator('.mpull.browse .mday .mdh');
    const st = await h.evaluate((e) => { const c = getComputedStyle(e); return [c.position, c.top, c.zIndex, c.backgroundColor]; });
    expect(st).toEqual(['sticky', '0px', '6', 'rgb(239, 236, 228)']);
    const r = await page.locator('.mpull.browse .mday').evaluate(async (d) => { d.scrollTop = 160; await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); const dt = d.getBoundingClientRect().top, ht = d.querySelector('.mdh').getBoundingClientRect().top; const cards = [...d.querySelectorAll('.mdcard')].filter((c) => { const b = c.getBoundingClientRect(); return b.bottom > dt && b.top < dt + 20; }); const hit = document.elementFromPoint(190, dt + 30); return { dt, ht, cardsInTop20Visible: cards.filter((c) => { const b = c.getBoundingClientRect(); const e = document.elementFromPoint(190, Math.max(dt + 1, b.top + 1)); return !!e && c.contains(e); }).length, hitHead: !!hit?.closest('.mdh') }; });
    near(r.ht, r.dt, '見出しは日の欄の上端に貼り付く');
    expect(r.cardsInTop20Visible, '上 20 にカードが見えて入らない').toBe(0);
    expect(r.hitHead, '上端から 30 は見出し').toBe(true);
  });
}
test('§16-2 段1は .mdh を貼り付けない', async ({ page }) => {
  await boot(page); await toStage(page, 1);
  expect(await page.locator('.mpull.browse .mday .mdh').evaluate((e) => getComputedStyle(e).position)).not.toBe('sticky');
});
test('§16-2 D1: 押して 0.22 秒はマスの地 #E2DDD2、つかんで（0.35 秒）0.10 秒で元の地へ。0.50 秒で元の地', async ({ page }) => {
  await boot(page); await toStage(page, 1);
  const cellSel = `.mgrid:not([data-leaving]) .day[data-date="${DAY}"]`;
  const bg0 = await page.locator(cellSel).evaluate((e) => getComputedStyle(e).backgroundColor);
  const chip = page.locator(`${cellSel} .strip.chip`).last(); const b = await chip.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.waitForTimeout(220); expect(await page.locator(cellSel).evaluate((e) => getComputedStyle(e).backgroundColor), '0.22 秒').toBe('rgb(226, 221, 210)');
  await page.waitForTimeout(280); expect(await page.locator('.chip.grabbed').count(), 'つかんでいる').toBe(1);
  expect(await page.locator(cellSel).evaluate((e) => getComputedStyle(e).backgroundColor), '0.50 秒は元の地').toBe(bg0);
  await page.mouse.up();
});

// §16-4 元の日へ落としたら取り消し（7207f8a からある不具合。S11f）。Duo の単発・Duo の繰り返しの回・iPhone の予定。
const XCALS = [{ id: 'cal-1', title: '家族', color: '#d93025', sourceId: 's-g', source: 'Google', sourceType: 'caldav', allowsModify: true, isDefault: true }];
const XBASE = { calendarId: 'cal-1', all: false, place: '', notes: '', recurring: false, requestId: null, modifiedAt: 1763100000000, occurrenceDate: null, alarms: [], alarmsExtra: 0, rule: null, ruleText: '', detached: false, allowsModify: true, sourceType: 'caldav', editable: true };
const XDET = [{ ...XBASE, id: 'e1@2026-11-12T15:00', eventId: 'e1', itemId: 'it-e1', externalId: 'ex-e1', title: '歯医者', start: '2026-11-12T15:00', end: '2026-11-12T16:00' }];
async function mockNative(page) {
  await page.addInitScript((c) => {
    const M = window.__mock = { calls: [] };
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', nativeCallback: () => 'cb-1',
      nativePromise: async (plugin, method, opts) => { M.calls.push({ method, opts: JSON.parse(JSON.stringify(opts ?? {})) });
        switch (method) {
          case 'checkPermission': case 'requestPermission': return { status: 'granted' };
          case 'listCalendars': return { calendars: c.cals };
          case 'listEvents': return { events: c.det.filter((e) => opts.calendarIds.includes(e.calendarId) && e.start < opts.to && e.end >= opts.from).map(({ editable, reason, allowsModify, sourceType, alarms, alarmsExtra, rule, ruleText, detached, ...e }) => e) };
          case 'getEvent': { const d = c.det.find((x) => x.eventId === opts.eventId); if (!d) throw { code: 'NOT_FOUND' }; return JSON.parse(JSON.stringify(d)); }
          case 'notifyStatus': return { status: 'denied' };
          case 'notifySync': case 'notifyClear': return { scheduled: 0, removed: 0, skipped: 0 };
          case 'selectionHaptic': case 'impactHaptic': case 'notificationHaptic': return { performed: true };
          default: throw { code: 'UNAVAILABLE', message: method };
        } } };
    window.__qaIdbW = 0;
    for (const m of ['put', 'add', 'delete', 'clear']) { const o = IDBObjectStore.prototype[m]; IDBObjectStore.prototype[m] = function (...a) { window.__qaIdbW++; return o.apply(this, a); }; }
  }, { cals: XCALS, det: XDET });
}
const DROP_SEED = [
  ev('d1', '撮影', '2026-11-12T10:00', '2026-11-12T11:00'),
  ev('d3', '定例', '2026-11-12T09:00', '2026-11-12T09:30', { recurrence: { freq: 'weekly', interval: 1, byDay: [4] } }),
];
const READ = new Set(['checkPermission', 'requestPermission', 'listCalendars', 'listEvents', 'getEvent', 'notifyStatus', 'notifySync', 'notifyClear']);
const HAPT = new Set(['selectionHaptic', 'impactHaptic', 'notificationHaptic']);
for (const [kind, title, id] of [['単発', '撮影', 'd1'], ['繰り返しの回', '定例', 'd3'], ['iPhone の予定', '歯医者', null]]) {
  for (const how of ['その場で離す', '別の日へ動かしてから元の日へ戻して離す']) {
    test(`§16-4 ${kind}（${title}）を${how}: 取り消し。IndexedDB 書き込み 0・overrides/updatedAt 不変・知らせ/元に戻す/触覚なし・iPhone へ書かない`, async ({ page }) => {
      await mockNative(page);
      await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', '84px')));
      await openApp(page, GEO.portrait);
      await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...o, style: 'named', home: false })); });
      await seed(page, DROP_SEED); await enableCalendars(page);
      const m = page.getByRole('button', { name: '月', exact: true }); if (await m.isVisible().catch(() => false)) { await m.click(); await page.waitForTimeout(300); }
      await toStage(page, 1);
      const cellSel = `.mgrid:not([data-leaving]) .day[data-date="${DAY}"]`;
      const chip = page.locator(`${cellSel} .strip.chip`, { hasText: title }).first(); await expect(chip).toBeVisible();
      const db0 = await dbEvents(page); const pick = (l) => l.filter((e) => !id || e.id === id).map((e) => [e.id, JSON.stringify(e.overrides || {}), e.updatedAt]);
      const b = await chip.boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2;
      await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(450);
      await expect(page.locator('.chip.grabbed')).toHaveCount(1);
      const w0 = await page.evaluate(() => ({ idb: window.__qaIdbW, hl: (window.__duoHapticLog || []).length, calls: window.__mock.calls.length }));
      if (how.startsWith('別の日')) { const o = await page.locator(`.mgrid:not([data-leaving]) .day[data-date="2026-11-13"]`).boundingBox(); await page.mouse.move(o.x + o.width / 2, o.y + 40, { steps: 8 }); await page.waitForTimeout(150); await page.mouse.move(x, y, { steps: 8 }); await page.waitForTimeout(150); }
      const w1 = await page.evaluate(() => ({ idb: window.__qaIdbW, hl: (window.__duoHapticLog || []).length, calls: window.__mock.calls.length }));
      await page.mouse.up(); await page.waitForTimeout(700);
      const r = await page.evaluate(() => ({ idb: window.__qaIdbW, hl: (window.__duoHapticLog || []).length, after: window.__mock.calls }));
      const later = r.after.slice(w1.calls).map((c) => c.method);
      expect(r.idb - w0.idb, 'IndexedDB への書き込み').toBe(0);
      expect(later.filter((mm) => HAPT.has(mm)), '離したあとの触覚').toEqual([]);
      expect(later.filter((mm) => !READ.has(mm) && !HAPT.has(mm)), 'iPhone への書き込み').toEqual([]);
      expect(r.hl - w0.hl, '__duoHapticLog').toBe(0);
      await expect(page.locator('#native-toast'), '知らせ・元に戻す').toHaveCount(0);
      if (id) expect(pick(await dbEvents(page)), 'overrides・updatedAt 不変').toEqual(pick(db0));
      expect((await dbEvents(page)).length, '予定の数').toBe(db0.length);
      await expect(page.locator(`${cellSel} .strip.chip`, { hasText: title }).first(), '元の日に残る').toBeVisible();
    });
  }
}

// ===== design/34 §17（2026-11-22。企画 K-1・K-2、設計の仕上げ）。61b9ce7 では落ちてよい =====
// §17-1 貼り付いている間だけ、つまみの下端から日の欄の下端までを #EFECE4 で埋める。ホームバーの帯も同じ色。埋めた所をたたいても何もしない。
const FILL = {
  '縦・帯あり': { sar: 84, size: GEO.portrait, fill: [8, 637, 374, 678], grip: [8, 593, 374, 637], ys: [640, 670] },
  '縦・帯なし': { sar: 0, size: GEO.portrait, fill: [8, 637, 458, 678], grip: [8, 593, 402, 637], ys: [640, 670] },
  '横・帯あり': { sar: 84, size: GEO.landscape, fill: [382, 425, 594, 466], grip: [382, 381, 594, 425], ys: [430, 460] },
  '横・帯なし': { sar: 0, size: GEO.landscape, fill: [382, 425, 678, 466], grip: [382, 381, 614, 425], ys: [430, 460] },
};
async function bootForm(page, f, stage = 4) { await boot(page, { sar: f.sar }); if (f.size === GEO.portrait) await toStage(page, stage); else { await page.setViewportSize(GEO.landscape); await page.waitForTimeout(650); } }
const fillHits = (page, f) => page.evaluate(({ f }) => {
  const d = document.querySelector('.mpull.browse .mday') || document.querySelector('.mday'); const out = [];
  for (const y of f.ys) for (let x = f.fill[0] + 4; x < f.fill[2] - 2; x += 10) { const e = document.elementFromPoint(x, y); const c = e?.closest('.mdcard, .tlev, .tl, .mdad > *, .mdnl, .dnote, .mdsec, .mdnone2'); const bg = e ? getComputedStyle(e).backgroundColor : ''; out.push({ x, y, card: !!c && d.contains(c), cls: e?.className?.split?.(' ')[0] || e?.tagName }); }
  return out;
}, { f });
for (const [name, f] of Object.entries(FILL)) {
  for (const dg of ['A', 'B']) {
    test(`§17-1 ${name}・${dg}: 貼り付いている間、つまみの下 ${f.fill.join(',')} に中身が見えない（elementFromPoint はカード・時間軸の枠でない）`, async ({ page }) => {
      await bootForm(page, f);
      if (dg === 'B') { await page.locator('.mpull.browse .mday, .mday').first().evaluate((d) => d.scrollTop = 0); const g = await page.locator('.mdgrab').boundingBox(); await page.mouse.move(g.x + g.width / 2, g.y + 20); await page.mouse.down(); await page.mouse.move(g.x + g.width / 2, g.y + 80, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(500); await expect(page.locator('.mday').first()).toHaveAttribute('data-dg', 'B'); }
      const g = await page.locator('.mdgrab').evaluate((e) => ({ stuck: e.classList.contains('stuck'), r: (({ left, top, right, bottom }) => [left, top, right, bottom])(e.getBoundingClientRect()) }));
      expect(g.stuck, '貼り付いている（予定の多い日）').toBe(true);
      const hits = await fillHits(page, f); const bad = hits.filter((h) => h.card);
      expect(bad.slice(0, 4), `埋める所に見える中身 ${bad.length} 点`).toEqual([]);
    });
  }
  test(`§17-1 ${name}: 埋めた所をたたいても何もしない（編集シート・段・日の欄の段が変わらない）`, async ({ page }) => {
    await bootForm(page, f);
    const before = await page.evaluate(() => ({ st: document.querySelector('.mpull')?.dataset.stage ?? null, dg: document.querySelector('.mday')?.dataset.dg, top: document.querySelector('.mday')?.scrollTop }));
    await page.mouse.click((f.fill[0] + f.fill[2]) / 2 - 40, f.ys[0]); await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({ st: document.querySelector('.mpull')?.dataset.stage ?? null, dg: document.querySelector('.mday')?.dataset.dg, top: document.querySelector('.mday')?.scrollTop }));
    expect(after).toEqual(before);
    await expect(page.locator('dialog[open], [role="dialog"]:visible, .nsheet:visible')).toHaveCount(0);
  });
}
test('§17-1 送り切ったときは今のまま（つまみは最後のカードの下、その下にノート、埋めない）', async ({ page }) => {
  await boot(page); await toStage(page, 4);
  await page.locator('.mpull.browse .mday').evaluate((d) => { d.scrollTop = d.scrollHeight; }); await page.waitForTimeout(250);
  const r = await page.evaluate(() => { const g = document.querySelector('.mdgrab'); const nl = document.querySelector('.mday .mdnl').getBoundingClientRect(); return { stuck: g.classList.contains('stuck'), gb: g.getBoundingClientRect().bottom, nlTop: nl.top }; });
  expect(r.stuck).toBe(false); near(r.nlTop, r.gb, 'ノート › はつまみの下');
});
// §17-2 帯なしで貼り付いている間、つまみの面を ＋ の上端まで（縦 面 y581〜637・線 y581／横 面 y369〜425・線 y369）。押せる範囲は変えない。
for (const [name, f, faceTop, gripTop, lineY] of [['縦', FILL['縦・帯なし'], 581, 593, [611, 615]], ['横', FILL['横・帯なし'], 369, 381, [399, 403]]]) {
  test(`§17-2 帯なし${name}: 面の上端 y${faceTop}（線 0.5 #E4E0D6）、押せる範囲は y${gripTop}〜、＋のまわりにカードが見えない`, async ({ page }) => {
    await bootForm(page, f);
    const r = await page.evaluate(({ faceTop, gripTop }) => {
      const g = document.querySelector('.mdgrab'), a = document.querySelector('.cadd'); const gb = g.getBoundingClientRect(), ab = a.getBoundingClientRect();
      const probe = []; for (let x = ab.left + 2; x < ab.right - 1; x += 6) for (const y of [faceTop + 2, faceTop + 6, gripTop - 2]) { const e = document.elementFromPoint(x, y); probe.push(!!e?.closest('.mdcard, .tlev, .mdnl, .dnote')); }
      const left = []; for (let x = 20; x < ab.left - 4; x += 20) { const e = document.elementFromPoint(x, faceTop + 4); left.push(e?.closest('.mdcard, .tlev') ? 'card' : (e?.closest('.mdgrab') ? 'grab' : (e?.className?.split?.(' ')[0] || ''))); }
      const hitGrab = document.elementFromPoint(100, faceTop + 4)?.closest('.mdgrab');
      return { gripTop: gb.top, cardNearPlus: probe.filter(Boolean).length, left, faceIsGrabTarget: !!hitGrab };
    }, { faceTop, gripTop });
    near(r.gripTop, gripTop, '押せる範囲の上端は変えない');
    expect(r.cardNearPlus, '＋のまわり（面の上）にカードが見えない').toBe(0);
    expect(r.left.filter((v) => v === 'card'), `面 y${faceTop}〜${gripTop} にカードが見えない`).toEqual([]);
    // 足した 12 をたたいても何もしない
    const st0 = await page.evaluate(() => [document.querySelector('.mpull')?.dataset.stage ?? null, document.querySelector('.mday').dataset.dg]);
    await page.mouse.click(100, faceTop + 4); await page.waitForTimeout(400);
    expect(await page.evaluate(() => [document.querySelector('.mpull')?.dataset.stage ?? null, document.querySelector('.mday').dataset.dg])).toEqual(st0);
    await expect(page.locator('dialog[open], [role="dialog"]:visible, .nsheet:visible')).toHaveCount(0);
  });
}
// §17-3 閉じた横でも つまみ（下）と見出しは貼り付ける（§14 の「使わない」はつまみ（上）と段）。
test('§17-3 閉じた横・帯あり: つまみ（下）は y381〜425 に貼り付き、線 y399〜403・中心 x488。つまみ（上）は出さない。見出しは sticky', async ({ page }) => {
  await bootForm(page, FILL['横・帯あり']);
  const g = await gripAt(page);
  expect(g.pos).toBe('sticky'); rect(g.r, [382, 381, 594, 425], '横のつまみ');
  if (g.line) { rect(g.line, [470, 399, 506, 403], '横の線 36×4'); }
  expect((await visRects(page, '.mgrab')).length, 'つまみ（上）').toBe(0);
  expect(await page.locator('.mday .mdh').evaluate((e) => getComputedStyle(e).position)).toBe('sticky');
});
test('§17-3 閉じた横・帯なし: つまみ（下）は x382〜614 y381〜425 に貼り付き（＋の左まで）、線 y399〜403', async ({ page }) => {
  await bootForm(page, FILL['横・帯なし']);
  const g = await gripAt(page);
  expect(g.pos).toBe('sticky'); rect(g.r, [382, 381, 614, 425], '横・帯なしのつまみ');
  if (g.line) { near(g.line[1], 399, '線の上'); near(g.line[3], 403, '線の下'); }
});
// §17-5 帯なしの横でノートを書いている間、タスクのバッジ（x660〜678 y0〜18）がシートの上に出ない。
test('§17-5 横・帯なしでノートを書いている間、タスクのバッジはシートの下（y8〜18 の点はシート）', async ({ page }) => {
  await boot(page, { sar: 0 });
  await page.evaluate(async (d) => { const m = await import('/js/db.js'); await m.putTask({ id: 'qa-t1', title: '今日のタスク', due: { date: d, time: null }, done: false, doneAt: null, createdAt: 1, updatedAt: 1, order: 1, note: '', notify: false }); }, DAY);
  await page.reload(); await page.waitForSelector('html[data-ready]'); await page.setViewportSize(GEO.landscape); await page.waitForTimeout(650);
  const bd = await page.locator('.ctask .bdg').evaluate((e) => (({ left, top, right, bottom }) => [left, top, right, bottom])(e.getBoundingClientRect()));
  expect(bd[1], 'バッジは y0〜18（再現の前提）').toBeLessThan(18);
  await editNote(page);
  const r = await page.evaluate(() => {
    // バッジが pointer-events:none でも見落とさないよう、elementsFromPoint の重なり順で見る（見えているバッジがシートより手前なら不可）
    const b = document.querySelector('.ctask .bdg'); const cs = b && getComputedStyle(b); const shown = !!b && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
    const out = []; for (const [x, y] of [[664, 12], [669, 14], [674, 16], [666, 10]]) { const st = document.elementsFromPoint(x, y); const ib = st.findIndex((e) => e === b || b?.contains(e)), is = st.findIndex((e) => e.closest('.nsheet')); out.push({ x, y, inSheet: !shown || ib < 0 || (is >= 0 && is < ib), top: st[0]?.className?.split?.(' ')[0] || st[0]?.tagName }); }
    return out; });
  expect(r.filter((p) => !p.inSheet), 'シートの右上の角にのぞくもの').toEqual([]);
});
// 連携 低①: 閉じた画面でバックアップを書き出しても settings.view は開いた側の画面（週）。戻すと開いた縦は週。
test('連携 低① 閉じた画面で書き出したバックアップの settings.view は開いた側の値（week）', async ({ page }, info) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('qa-set')) { const k = 'duo.ui.v1'; let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { s = {}; } localStorage.setItem(k, JSON.stringify({ ...s, view: 'week', home: false })); sessionStorage.setItem('qa-set', '1'); } });
  await openApp(page, { width: 626, height: 890 }); await seed(page, EVENTS); await page.waitForTimeout(300);
  await page.setViewportSize(GEO.portrait); await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(500);
  await page.locator('.cmore').click(); await page.getByRole('menuitem', { name: '設定' }).click();
  await page.getByRole('button', { name: 'バックアップ' }).click(); await expect(page.locator('#backup')).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'JSONを書き出す' }).click()]);
  const p = info.outputPath('closed-export.json'); await dl.saveAs(p);
  const j = JSON.parse((await import('node:fs')).readFileSync(p, 'utf8'));
  expect(j.settings?.view, '書き出した settings.view').toBe('week');
});
