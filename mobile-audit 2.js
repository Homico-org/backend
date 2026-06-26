const { chromium } = require('playwright');
const B='http://localhost:3001', F='http://localhost:3000', PID='6a2407662979eafdeca299af';
async function login(i,p){const r=await fetch(`${B}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:i,password:p})});return r.json();}
const ROUTES = [
  '/', '/ge', '/ge/professionals', '/ge/jobs', '/ge/tools', '/ge/tools/calculator', '/ge/tools/prices',
  '/ge/tools/analyzer', '/ge/tools/compare', '/about', '/how-it-works', '/become-pro', '/for-business',
  '/register', '/shop', '/privacy', '/terms', '/ge/post-job',
  '/my-space', '/projects', `/projects/${PID}`, '/orders', '/bookings', '/settings', '/settings/payments',
  '/my-work', '/my-proposals', '/notifications', '/pro/portfolio', '/pro/analytics', '/pro/reviews', '/pro/accountability',
];
(async()=>{
  const c=await login('giorgi@demo.ge','Demo123!');
  const b=await chromium.launch({headless:true});
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const p=await ctx.newPage();
  await p.goto(F,{waitUntil:'domcontentloaded'});
  await p.evaluate(([a,r])=>{localStorage.setItem('access_token',a);localStorage.setItem('refresh_token',r);},[c.access_token,c.refresh_token]);
  const results=[];
  for(const route of ROUTES){
    try{
      await p.goto(F+route,{waitUntil:'domcontentloaded',timeout:30000});
      await p.waitForTimeout(1800);
      const r=await p.evaluate(()=>{
        const vw=document.documentElement.clientWidth;
        const sw=document.documentElement.scrollWidth;
        const overflow=sw-vw;
        let culprits=[];
        if(overflow>2){
          const seen=new Set();
          for(const el of document.querySelectorAll('body *')){
            const rc=el.getBoundingClientRect();
            if(rc.width<1||rc.height<1) continue;
            if(rc.right>vw+2 && rc.width<=vw+overflow+4){
              // prefer leaf-ish overflowing elements
              const cls=(el.className&&el.className.toString?el.className.toString():'').slice(0,50).replace(/\s+/g,'.');
              const key=el.tagName+'|'+cls+'|'+Math.round(rc.width);
              if(seen.has(key))continue; seen.add(key);
              culprits.push(`${el.tagName.toLowerCase()}.${cls} w=${Math.round(rc.width)} right=${Math.round(rc.right)}`);
            }
          }
        }
        return {vw,sw,overflow,culprits:culprits.slice(0,6)};
      });
      results.push({route, ...r});
      const flag = r.overflow>2 ? `OVERFLOW +${r.overflow}px` : 'ok';
      console.log(`${flag.padEnd(16)} ${route}`);
      if(r.overflow>2) r.culprits.forEach(c=>console.log('      - '+c));
    }catch(e){ console.log(`ERROR           ${route}  (${e.message.slice(0,40)})`); }
  }
  const bad=results.filter(r=>r.overflow>2);
  console.log(`\n==== ${bad.length}/${ROUTES.length} pages overflow ====`);
  await b.close();
})().catch(e=>{console.error(e.message);process.exit(1);});
