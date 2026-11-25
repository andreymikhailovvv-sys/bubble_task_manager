#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const dist=resolve('client/dist');
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1');
    const name=url.pathname==='/android-mascot'?'android-mascot.html':url.pathname.slice(1);
    const file=resolve(dist,name);
    if(!file.startsWith(dist+sep)){res.writeHead(403).end();return;}
    const content=await readFile(file);
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'};
    res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream'}).end(content);
  } catch { res.writeHead(404).end(); }
});
let browser;
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:84,height:90},deviceScaleFactor:2});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const apiRequests=[];
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))apiRequests.push(request.url());});
  const skins=['classic','cat','northern','maestro','zoomer','pirate','wizard','ninja','space'];
  async function verifyPixels(label){
    const png=PNG.sync.read(await page.screenshot({omitBackground:true,animations:'disabled'}));
    const alpha=(x,y)=>png.data[(y*png.width+x)*4+3];
    let visible=0,transparent=0;
    for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++){
      const a=alpha(x,y);
      if(a>100)visible++;
      if(a<64)transparent++;
    }
    const area=png.width*png.height;
    assert.ok(visible/area>.08,label+' must actually paint the mascot');
    // Wide capes and accessories may legitimately occupy the corners at
    // the new uniform body scale. Verify actual background area instead.
    assert.ok(transparent/area>.08,label+' must retain a transparent background: '+transparent/area);
  }
  const bodyWidths=new Map();
  for(const theme of ['dark','light'])for(const skin of skins){
    await page.goto(origin+'/android-mascot?skin='+skin+'&theme='+theme+'&mode=idle');
    await page.waitForFunction(()=>document.documentElement.dataset.androidMascotReady==='true');
    await page.waitForFunction(()=>document.querySelector('.android-mascot-artwork')?.getAttribute('data-arriving')==='false');
    assert.equal(await page.locator('.android-mascot-artwork').getAttribute('data-skin'),skin);
    assert.equal(await page.locator('body').getAttribute('data-theme'),theme);
    await verifyPixels(theme+'/'+skin+'/launcher');
    const width=await page.locator('.planik-body-surface').evaluate(el=>{
      const matrix=el.getScreenCTM();
      return el.getBBox().width*Math.hypot(matrix.a,matrix.b);
    });
    if(skin==='classic')bodyWidths.set(theme,width);
    else assert.ok(Math.abs(width-bodyWidths.get(theme))<2,theme+'/'+skin+' body scale must match classic: '+width);
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('planik-native-mode',{detail:'thinking'})));
    await page.waitForFunction(()=>document.querySelector('.android-mascot-artwork')?.getAttribute('data-mode')==='thinking');
    await verifyPixels(theme+'/'+skin+'/thinking');
  }
  await page.setViewportSize({width:180,height:150});
  await page.goto(origin+'/android-mascot?skin=pirate&theme=light&mode=idle');
  await page.waitForFunction(()=>document.documentElement.dataset.androidMascotReady==='true');
  await page.waitForFunction(()=>document.querySelector('.android-mascot-artwork')?.getAttribute('data-arriving')==='false');
  await verifyPixels('wardrobe preview');
  assert.deepEqual(errors,[]);
  assert.deepEqual(apiRequests,[],'mascot entry must not read account or planner data');
  console.log('Mascot smoke: all nine planner skins paint actual pixels in both themes, launcher and wardrobe.');
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
