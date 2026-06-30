const { chromium } = require('playwright'); const B='http://localhost:3001',F='http://localhost:3000',PID='6a2407662979eafdeca299af';
async function login(i,p){const r=await fetch(`${B}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:i,password:p})});return r.json();}
(async()=>{
  const c=await login('giorgi@demo.ge','Demo123!');
  const b=await chromium.launch({headless:true});
  for(const w of [360,320]){
    const ctx=await b.newContext({viewport:{width:w,height:820},isMobile:true,hasTouch:true});
    const p=await ctx.newPage();
    await p.goto(F,{waitUntil:'domcontentloaded'});
    await p.evaluate(([a,r])=>{localStorage.setItem('access_token',a);localStorage.setItem('refresh_token',r);},[c.access_token,c.refresh_token]);
    await p.goto(`${F}/projects/${PID}`,{waitUntil:'domcontentloaded'});
    try{ await p.waitForFunction(()=>!document.querySelector('.animate-pulse') && /ვაკის/.test(document.body.innerText),{timeout:12000}); }catch(e){}
    await p.waitForTimeout(1500);
    const m=await p.evaluate(()=>{
      const vw=document.documentElement.clientWidth, sw=document.documentElement.scrollWidth;
      const off=[]; for(const el of document.querySelectorAll('body *')){const rc=el.getBoundingClientRect(); if(rc.width<2)continue; const st=getComputedStyle(el); if(rc.right>vw+3 && st.overflowX!=='auto'&&st.overflowX!=='scroll'){const par=el.parentElement; const ps=par?getComputedStyle(par):null; if(ps&&(ps.overflowX==='auto'||ps.overflowX==='scroll'))continue; off.push((el.tagName+'.'+(el.className?.toString?.()||'').slice(0,40)).replace(/\s+/g,'.')+` r=${Math.round(rc.right)}`);} }
      return {overflow:sw-vw, off:[...new Set(off)].slice(0,5)};
    });
    console.log(`w=${w} pageOverflow=${m.overflow} offscreen(non-scroll):`, m.off);
    await p.screenshot({path:`/tmp/pe-${w}.png`, fullPage:false});
    await ctx.close();
  }
  await b.close();
})().catch(e=>{console.error(e.message);process.exit(1);});
