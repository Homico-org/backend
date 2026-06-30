const { chromium } = require('playwright');
const B='http://localhost:3001', F='http://localhost:3000', PID='6a2407662979eafdeca299af';
const WIDTH = parseInt(process.argv[2]||'360',10);
async function login(i,p){const r=await fetch(`${B}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:i,password:p})});return r.json();}
const ROUTES = [
  '/ge','/ge/professionals','/ge/jobs','/ge/tools','/ge/tools/calculator','/ge/tools/prices','/ge/tools/analyzer','/ge/tools/compare',
  '/about','/how-it-works','/become-pro','/for-business','/register','/shop','/ge/post-job',
  '/my-space','/projects',`/projects/${PID}`,'/orders','/bookings','/settings','/settings/payments','/my-work','/my-proposals','/pro/portfolio','/pro/analytics','/pro/reviews',
];
(async()=>{
  const c=await login('giorgi@demo.ge','Demo123!');
  const b=await chromium.launch({headless:true});
  const ctx=await b.newContext({viewport:{width:WIDTH,height:800},isMobile:true,hasTouch:true});
  const p=await ctx.newPage();
  await p.goto(F,{waitUntil:'domcontentloaded'});
  await p.evaluate(([a,r])=>{localStorage.setItem('access_token',a);localStorage.setItem('refresh_token',r);},[c.access_token,c.refresh_token]);
  let badCount=0;
  for(const route of ROUTES){
    try{
      await p.goto(F+route,{waitUntil:'domcontentloaded',timeout:30000});
      try{ await p.waitForFunction(()=>!document.querySelector('.animate-pulse'),{timeout:7000}); }catch(e){}
      await p.waitForTimeout(1200);
      const r=await p.evaluate(()=>{
        const vw=document.documentElement.clientWidth;
        const sw=document.documentElement.scrollWidth;
        const pageOverflow=sw-vw;
        // elements extending past the viewport right edge (clipped or scrolling page)
        const culprits=[]; const seen=new Set();
        for(const el of document.querySelectorAll('body *')){
          const rc=el.getBoundingClientRect();
          if(rc.width<2||rc.height<2) continue;
          if(rc.right>vw+3){
            const st=getComputedStyle(el);
            // skip legit horizontal scrollers (tabs etc.)
            if(st.overflowX==='auto'||st.overflowX==='scroll') continue;
            const cls=(el.className&&el.className.toString?el.className.toString():'').trim().slice(0,60).replace(/\s+/g,'.');
            const key=el.tagName+cls;
            if(seen.has(key))continue; seen.add(key);
            culprits.push(`${el.tagName.toLowerCase()}.${cls} w=${Math.round(rc.width)} right=${Math.round(rc.right)}`);
          }
        }
        return {pageOverflow, culprits:culprits.slice(0,5)};
      });
      const bad = r.pageOverflow>2 || r.culprits.length>0;
      if(bad){ badCount++; console.log(`BAD  ${route}  (pageOverflow=${r.pageOverflow})`); r.culprits.forEach(c=>console.log('     - '+c)); }
      else console.log(`ok   ${route}`);
    }catch(e){ console.log(`ERR  ${route}  ${e.message.slice(0,40)}`); }
  }
  console.log(`\n==== width ${WIDTH}: ${badCount}/${ROUTES.length} pages with off-screen elements ====`);
  await b.close();
})().catch(e=>{console.error(e.message);process.exit(1);});
