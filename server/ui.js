const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ihub Registry</title>
<style>
:root{--bg:#1a1a2e;--surface:#16213e;--card:#0f3460;--text:#e0e0e0;--muted:#8a8a9a;--accent:#e94560;--accent2:#0f3460;--border:#2a2a4a;--radius:8px}
@media(prefers-color-scheme:light){:root{--bg:#f5f5f5;--surface:#fff;--card:#fff;--text:#222;--muted:#555;--accent:#c0392b;--accent2:#e8f0fe;--border:#ddd}}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
header{background:var(--surface);border-bottom:1px solid var(--border);padding:1rem 2rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
header h1{font-size:1.4rem;color:var(--accent)}
#search{flex:1;min-width:200px;padding:.5rem 1rem;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:.9rem}
.tabs{display:flex;gap:.5rem;padding:.75rem 2rem;background:var(--surface);border-bottom:1px solid var(--border);flex-wrap:wrap}
.tab{padding:.4rem 1rem;border-radius:var(--radius);cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text);font-size:.85rem;transition:all .2s}
.tab.active,.tab:hover{background:var(--accent);color:#fff;border-color:var(--accent)}
main{max-width:1200px;margin:0 auto;padding:1.5rem}
#list{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;cursor:pointer;transition:transform .15s,box-shadow .15s}
.card:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.3)}
.card h3{font-size:1rem;margin-bottom:.3rem}
.card p{font-size:.8rem;color:var(--muted);margin-bottom:.5rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-meta{display:flex;gap:.5rem;flex-wrap:wrap;font-size:.75rem}
.tag{background:var(--accent2);padding:2px 8px;border-radius:4px;color:var(--text);font-weight:500}
.stars{color:#f9ca24}
.owner{color:var(--muted);margin-left:auto}
#detail{display:none;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:2rem;margin-top:1rem}
#detail .back{cursor:pointer;color:var(--accent);margin-bottom:1rem;display:inline-block;font-size:.9rem}
#detail h2{margin-bottom:.5rem}
#detail .meta{color:var(--muted);font-size:.85rem;margin-bottom:1rem}
#detail .body{white-space:pre-wrap;font-size:.9rem;line-height:1.7}
#detail .body h1,#detail .body h2,#detail .body h3{margin:1rem 0 .5rem;color:var(--accent)}
#detail .body code{background:var(--bg);padding:2px 4px;border-radius:3px;font-size:.85em}
#detail .body pre{background:var(--bg);padding:1rem;border-radius:var(--radius);overflow-x:auto;margin:.5rem 0}
#comments{margin-top:1.5rem;border-top:1px solid var(--border);padding-top:1rem}
#comments h3{margin-bottom:.75rem}
.comment{background:var(--bg);padding:.75rem;border-radius:var(--radius);margin-bottom:.5rem;font-size:.85rem}
.comment .cmeta{color:var(--muted);font-size:.75rem;margin-top:.3rem}
.empty{text-align:center;color:var(--muted);padding:3rem;font-size:1.1rem}
</style>
</head>
<body>
<header>
<h1>ihub Registry</h1>
<input id="search" type="text" placeholder="Search artifacts...">
</header>
<div class="tabs" id="tabs"></div>
<main>
<div id="list"></div>
<div id="detail"></div>
</main>
<script>
const TYPES=['agents','skills','rules','memories','prompts'];
let currentType='agents',allItems=[],searchTerm='';

const $=id=>document.getElementById(id);

function init(){
  const tabs=$('tabs');
  TYPES.forEach(t=>{
    const btn=document.createElement('button');
    btn.className='tab'+(t===currentType?' active':'');
    btn.textContent=t;
    btn.onclick=()=>{currentType=t;document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');loadList()};
    tabs.appendChild(btn);
  });
  $('search').addEventListener('input',e=>{searchTerm=e.target.value.toLowerCase();renderList()});
  loadList();
}

async function loadList(){
  $('detail').style.display='none';
  $('list').style.display='grid';
  try{
    const r=await fetch('/api/'+currentType);
    if(!r.ok) throw new Error('HTTP '+r.status);
    const d=await r.json();
    allItems=Array.isArray(d)?d:[];
  }catch(e){allItems=[];console.error('loadList error:',e);}
  renderList();
}

function renderList(){
  const filtered=allItems.filter(i=>{
    const s=searchTerm;
    if(!s)return true;
    return (i.name||'').toLowerCase().includes(s)||(i.description||'').toLowerCase().includes(s)||(i.tags||[]).join(' ').toLowerCase().includes(s);
  });
  if(!filtered.length){$('list').innerHTML='<div class="empty">No artifacts found</div>';return;}
  $('list').innerHTML=filtered.map(i=>{
    const tags=(i.tags||[]).slice(0,3).map(t=>'<span class="tag">'+esc(t)+'</span>').join('');
    const stars=i.avg_rating?'<span class="stars">'+'★'.repeat(Math.round(i.avg_rating))+'☆'.repeat(5-Math.round(i.avg_rating))+'</span>':'';
    return '<div class="card" data-name="'+esc(i.name)+'"><h3>'+esc(i.name)+'</h3><p>'+esc(i.description||'')+'</p><div class="card-meta">'+tags+stars+'<span class="owner">'+(i.version?'v'+esc(i.version):'')+(i.owner?' · '+esc(i.owner):'')+'</span></div></div>';
  }).join('');
  document.querySelectorAll('.card').forEach(c=>c.onclick=()=>showDetail(c.dataset.name));
}

async function showDetail(name){
  $('list').style.display='none';
  const det=$('detail');det.style.display='block';
  det.innerHTML='<span class="back">&larr; Back to list</span><p>Loading...</p>';
  det.querySelector('.back').onclick=()=>{det.style.display='none';$('list').style.display='grid'};
  try{
    const r=await fetch('/api/'+currentType+'/'+encodeURIComponent(name));
    const d=await r.json();
    const tags=(d.tags||[]).map(t=>'<span class="tag">'+esc(t)+'</span>').join(' ');
    let stars='';
    let comments='';
    try{const cr=await fetch('/api/'+currentType+'/'+encodeURIComponent(name)+'/comments');const cs=await cr.json();
      const cmts=cs.comments||cs||[];
      const rating=cs.rating||{};
      if(rating.average)stars='<span class="stars">'+'★'.repeat(Math.round(rating.average))+'☆'.repeat(5-Math.round(rating.average))+' '+rating.average+'/5</span>';
      if(cmts.length)comments='<div id="comments"><h3>Comments ('+cmts.length+')</h3>'+cmts.map(c=>'<div class="comment">'+esc(c.body)+(c.rating?' <span class="stars">'+'★'.repeat(c.rating)+'</span>':'')+'<div class="cmeta">'+esc(c.username||'anon')+' · '+(c.created_at||'')+'</div></div>').join('')+'</div>';
    }catch{}
    det.innerHTML='<span class="back">&larr; Back to list</span><h2>'+esc(d.name||name)+'</h2><div class="meta">'+(d.version?'v'+esc(d.version)+' · ':'')+esc(d.owner||'')+' '+tags+' '+stars+'</div><div class="body">'+renderMd(d.body||'')+'</div>'+comments;
    det.querySelector('.back').onclick=()=>{det.style.display='none';$('list').style.display='grid'};
  }catch(e){det.innerHTML='<span class="back">&larr; Back</span><p>Error loading artifact: '+esc(e.message)+'</p>';det.querySelector('.back').onclick=()=>{det.style.display='none';$('list').style.display='grid'};}
}

function renderMd(text){
  return esc(text)
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^## (.+)$/gm,'<h2>$1</h2>')
    .replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/\`\`\`([\\s\\S]*?)\`\`\`/g,'<pre><code>$1</code></pre>')
    .replace(/\`([^\`]+)\`/g,'<code>$1</code>')
    .replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>')
    .replace(/\\*(.+?)\\*/g,'<em>$1</em>')
    .replace(/^- (.+)$/gm,'&bull; $1<br>')
    .replace(/\\n/g,'<br>');
}

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

init();
</script>
</body>
</html>`;

export function handleUiRequest(req, res, url) {
  if (!url.pathname.startsWith("/ui")) return false;
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(HTML);
  return true;
}
