const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ihub Registry</title>
<style>
:root{
  --bg:#0f0f1a;--surface:#1a1a2e;--card:#16213e;--card-hover:#1a2744;
  --text:#e8e8f0;--muted:#8a8a9a;--accent:#e94560;--accent-hover:#ff6b81;
  --accent2:#0f3460;--border:#2a2a4a;--radius:10px;--shadow:0 4px 20px rgba(0,0,0,.4);
  --success:#2ecc71;--warning:#f39c12;--danger:#e74c3c;--info:#3498db;
  --star:#f1c40f;--star-empty:#444;
  --header-bg:#12121f;--nav-width:220px;--toast-bg:#2d2d44;
}
[data-theme="light"]{
  --bg:#f0f2f5;--surface:#ffffff;--card:#ffffff;--card-hover:#f8f9fa;
  --text:#1a1a2e;--muted:#666;--accent:#e94560;--accent-hover:#c0392b;
  --accent2:#e8f4fd;--border:#e0e0e0;--shadow:0 2px 12px rgba(0,0,0,.08);
  --success:#27ae60;--warning:#e67e22;--danger:#c0392b;--info:#2980b9;
  --star:#f39c12;--star-empty:#ddd;
  --header-bg:#ffffff;--toast-bg:#333;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;min-height:100vh}
button{font-family:inherit;cursor:pointer}
input,textarea,select{font-family:inherit;font-size:inherit}

/* Layout */
.app{display:flex;min-height:100vh}
.sidebar{width:var(--nav-width);background:var(--header-bg);border-right:1px solid var(--border);position:fixed;top:0;left:0;height:100vh;display:flex;flex-direction:column;z-index:100;transition:transform .3s}
.sidebar .logo{padding:1.2rem 1.5rem;font-size:1.3rem;font-weight:700;color:var(--accent);border-bottom:1px solid var(--border)}
.sidebar nav{flex:1;padding:.5rem 0;overflow-y:auto}
.sidebar nav a{display:flex;align-items:center;gap:.75rem;padding:.7rem 1.5rem;color:var(--muted);text-decoration:none;font-size:.9rem;transition:all .15s;border-left:3px solid transparent}
.sidebar nav a:hover{color:var(--text);background:var(--surface)}
.sidebar nav a.active{color:var(--accent);border-left-color:var(--accent);background:var(--surface)}
.sidebar nav a .icon{font-size:1.1rem;width:1.4rem;text-align:center}
.sidebar .user-section{padding:1rem 1.5rem;border-top:1px solid var(--border);font-size:.85rem}
.sidebar .user-section .username{color:var(--accent);font-weight:600}
.sidebar .user-section .role-badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:.7rem;background:var(--accent2);color:var(--accent);margin-left:.5rem}

.main-content{margin-left:var(--nav-width);flex:1;display:flex;flex-direction:column;min-height:100vh}
.top-bar{position:sticky;top:0;background:var(--header-bg);border-bottom:1px solid var(--border);padding:.8rem 1.5rem;display:flex;align-items:center;gap:1rem;z-index:50;flex-wrap:wrap}
.top-bar .search-box{flex:1;min-width:200px;max-width:400px;position:relative}
.top-bar .search-box input{width:100%;padding:.5rem 1rem .5rem 2.2rem;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:.9rem;outline:none;transition:border-color .2s}
.top-bar .search-box input:focus{border-color:var(--accent)}
.top-bar .search-box::before{content:"\\2315";position:absolute;left:.7rem;top:50%;transform:translateY(-50%);color:var(--muted);font-size:1.1rem}
.top-bar .actions{display:flex;gap:.5rem;align-items:center;margin-left:auto}
.btn{padding:.45rem 1rem;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:.85rem;transition:all .15s;display:inline-flex;align-items:center;gap:.4rem}
.btn:hover{background:var(--card-hover);border-color:var(--muted)}
.btn-primary{background:var(--accent);color:#fff;border-color:var(--accent)}
.btn-primary:hover{background:var(--accent-hover)}
.btn-danger{background:var(--danger);color:#fff;border-color:var(--danger)}
.btn-danger:hover{opacity:.85}
.btn-sm{padding:.3rem .7rem;font-size:.8rem}

.content{padding:1.5rem;flex:1}

/* Tabs */
.type-tabs{display:flex;gap:.4rem;margin-bottom:1.2rem;flex-wrap:wrap}
.type-tab{padding:.4rem 1rem;border-radius:var(--radius);cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:.85rem;transition:all .2s}
.type-tab.active,.type-tab:hover{background:var(--accent);color:#fff;border-color:var(--accent)}

/* Sort */
.sort-bar{display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;font-size:.85rem;color:var(--muted)}
.sort-bar select{background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:.3rem .6rem;font-size:.82rem}
.sort-bar .count{margin-left:auto}

/* Cards grid */
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:1.2rem;cursor:pointer;transition:all .2s}
.card:hover{transform:translateY(-2px);box-shadow:var(--shadow);border-color:var(--accent);background:var(--card-hover)}
.card h3{font-size:.95rem;margin-bottom:.3rem;color:var(--text)}
.card p{font-size:.82rem;color:var(--muted);margin-bottom:.6rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-meta{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;font-size:.75rem}
.tag{background:var(--accent2);padding:2px 8px;border-radius:4px;color:var(--text);font-weight:500}
.stars{color:var(--star)}
.stars .empty{color:var(--star-empty)}
.card-footer{display:flex;justify-content:space-between;align-items:center;margin-top:.6rem;font-size:.75rem;color:var(--muted)}

/* Detail view */
.detail-view{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:2rem;max-width:900px}
.detail-header{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:1rem;flex-wrap:wrap}
.detail-header h2{font-size:1.4rem}
.detail-meta{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;margin-bottom:1.2rem;font-size:.85rem;color:var(--muted)}
.detail-body{font-size:.9rem;line-height:1.8}
.detail-body h1,.detail-body h2,.detail-body h3{margin:1.2rem 0 .5rem;color:var(--accent)}
.detail-body h1{font-size:1.3rem}
.detail-body h2{font-size:1.1rem}
.detail-body h3{font-size:1rem}
.detail-body code{background:var(--bg);padding:2px 6px;border-radius:4px;font-size:.85em;font-family:'SF Mono',Monaco,monospace}
.detail-body pre{background:var(--bg);padding:1rem;border-radius:var(--radius);overflow-x:auto;margin:.8rem 0;border:1px solid var(--border)}
.detail-body pre code{background:none;padding:0}
.detail-body ul,.detail-body ol{padding-left:1.5rem;margin:.5rem 0}
.detail-body a{color:var(--accent);text-decoration:none}
.detail-body a:hover{text-decoration:underline}
.detail-body blockquote{border-left:3px solid var(--accent);padding-left:1rem;color:var(--muted);margin:.5rem 0}

/* Comments section */
.comments-section{margin-top:2rem;border-top:1px solid var(--border);padding-top:1.5rem}
.comments-section h3{margin-bottom:1rem}
.comment{background:var(--bg);padding:1rem;border-radius:var(--radius);margin-bottom:.75rem;border:1px solid var(--border)}
.comment .c-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem;font-size:.82rem}
.comment .c-user{font-weight:600;color:var(--accent)}
.comment .c-date{color:var(--muted)}
.comment .c-body{font-size:.88rem}

/* Review form */
.review-form{margin-top:1.5rem;padding:1.2rem;background:var(--bg);border-radius:var(--radius);border:1px solid var(--border)}
.review-form h4{margin-bottom:.8rem}
.star-input{display:flex;gap:.3rem;margin-bottom:.8rem;font-size:1.5rem;cursor:pointer}
.star-input span{color:var(--star-empty);transition:color .15s}
.star-input span.active{color:var(--star)}
.star-input span:hover,.star-input span:hover~span{color:var(--star)}
.review-form textarea{width:100%;min-height:80px;padding:.7rem;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);resize:vertical}
.review-form .form-actions{margin-top:.8rem;display:flex;justify-content:flex-end}

/* Version list */
.version-list{margin-top:1.5rem;border-top:1px solid var(--border);padding-top:1rem}
.version-item{padding:.5rem .8rem;border-radius:6px;margin-bottom:.4rem;background:var(--bg);border:1px solid var(--border);display:flex;justify-content:space-between;font-size:.85rem}
.version-item .v-num{font-weight:600;color:var(--accent)}

/* Modal */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1000;opacity:0;visibility:hidden;transition:all .2s}
.modal-overlay.active{opacity:1;visibility:visible}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:2rem;max-width:500px;width:90%;max-height:80vh;overflow-y:auto}
.modal h3{margin-bottom:1rem}
.modal .form-group{margin-bottom:1rem}
.modal label{display:block;font-size:.85rem;color:var(--muted);margin-bottom:.3rem}
.modal input,.modal textarea,.modal select{width:100%;padding:.5rem .8rem;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);outline:none}
.modal input:focus,.modal textarea:focus,.modal select:focus{border-color:var(--accent)}
.modal textarea{min-height:120px;resize:vertical}
.modal .modal-actions{display:flex;gap:.5rem;justify-content:flex-end;margin-top:1.2rem}

/* Toast */
.toast-container{position:fixed;top:1rem;right:1rem;z-index:2000;display:flex;flex-direction:column;gap:.5rem}
.toast{padding:.7rem 1.2rem;border-radius:var(--radius);background:var(--toast-bg);color:#fff;font-size:.85rem;animation:slideIn .3s;box-shadow:var(--shadow);display:flex;align-items:center;gap:.5rem;max-width:350px}
.toast.success{border-left:3px solid var(--success)}
.toast.error{border-left:3px solid var(--danger)}
.toast.info{border-left:3px solid var(--info)}
@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}

/* Tables */
.data-table{width:100%;border-collapse:collapse;font-size:.85rem}
.data-table th,.data-table td{padding:.6rem .8rem;text-align:left;border-bottom:1px solid var(--border)}
.data-table th{background:var(--bg);font-weight:600;color:var(--muted);position:sticky;top:0}
.data-table tr:hover td{background:var(--card)}
.pagination{display:flex;align-items:center;gap:1rem;margin-top:1rem;justify-content:center;font-size:.85rem}

/* Metrics */
.metrics-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;margin-bottom:2rem}
.metric-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:1.2rem;text-align:center}
.metric-card .value{font-size:2rem;font-weight:700;color:var(--accent)}
.metric-card .label{font-size:.82rem;color:var(--muted);margin-top:.3rem}
.bar-chart{margin-top:1.5rem}
.bar-chart h4{margin-bottom:.8rem;font-size:.9rem}
.bar-row{display:flex;align-items:center;gap:.8rem;margin-bottom:.5rem;font-size:.82rem}
.bar-row .bar-label{width:120px;text-align:right;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-row .bar{flex:1;height:22px;background:var(--bg);border-radius:4px;overflow:hidden;position:relative}
.bar-row .bar-fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-hover));border-radius:4px;transition:width .3s}
.bar-row .bar-value{position:absolute;right:6px;top:2px;font-size:.75rem;color:var(--text)}

/* Projects */
.project-group{margin-bottom:1.5rem}
.project-group h4{padding:.5rem .8rem;background:var(--bg);border-radius:6px;margin-bottom:.5rem;font-size:.9rem;color:var(--accent);cursor:pointer}
.project-items{padding-left:1rem}
.project-item{padding:.4rem .6rem;font-size:.85rem;cursor:pointer;border-radius:4px;transition:background .15s}
.project-item:hover{background:var(--card)}
.project-item .p-type{color:var(--muted);font-size:.75rem;margin-left:.5rem}

/* Guide */
.guide-content{max-width:800px}
.guide-content h2{color:var(--accent);margin:1.5rem 0 .5rem;font-size:1.2rem}
.guide-content h3{margin:1rem 0 .5rem}
.guide-content p{margin-bottom:.8rem;color:var(--muted)}
.guide-content ul{padding-left:1.5rem;margin-bottom:1rem}
.guide-content li{margin-bottom:.4rem}
.guide-content code{background:var(--bg);padding:2px 6px;border-radius:4px;font-size:.85em}

/* Admin panel */
.admin-section{margin-bottom:2rem}
.admin-section h3{margin-bottom:1rem;padding-bottom:.5rem;border-bottom:1px solid var(--border)}

/* Login form */
.login-view{display:flex;align-items:center;justify-content:center;min-height:60vh}
.login-box{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:2.5rem;width:100%;max-width:380px}
.login-box h2{text-align:center;margin-bottom:1.5rem;color:var(--accent)}
.login-box .form-group{margin-bottom:1.2rem}
.login-box label{display:block;font-size:.85rem;color:var(--muted);margin-bottom:.4rem}
.login-box input{width:100%;padding:.6rem 1rem;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);outline:none}
.login-box input:focus{border-color:var(--accent)}
.login-box button{width:100%;margin-top:.5rem}

/* Loading */
.spinner{display:inline-block;width:1.2rem;height:1.2rem;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.loading-state{display:flex;align-items:center;justify-content:center;padding:3rem;gap:.8rem;color:var(--muted)}

/* Empty state */
.empty-state{text-align:center;padding:3rem;color:var(--muted)}
.empty-state .icon{font-size:2.5rem;margin-bottom:.8rem}
.empty-state p{font-size:1rem}

/* Hamburger */
.hamburger{display:none;background:none;border:none;color:var(--text);font-size:1.5rem;padding:.5rem;cursor:pointer}

/* Theme toggle */
.theme-toggle{background:none;border:1px solid var(--border);border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:1rem;cursor:pointer;color:var(--text);transition:all .2s}
.theme-toggle:hover{border-color:var(--accent)}

/* Responsive */
@media(max-width:768px){
  .sidebar{transform:translateX(-100%)}
  .sidebar.open{transform:translateX(0)}
  .main-content{margin-left:0}
  .hamburger{display:block}
  .card-grid{grid-template-columns:1fr}
  .top-bar .search-box{min-width:150px}
  :root{--nav-width:260px}
}
</style>
</head>
<body>
<div class="app">
  <!-- Sidebar -->
  <aside class="sidebar" id="sidebar">
    <div class="logo">ihub</div>
    <nav>
      <a href="#" data-view="browse" class="active"><span class="icon">&#9670;</span>Browse</a>
      <a href="#" data-view="projects"><span class="icon">&#128194;</span>Projects</a>
      <a href="#" data-view="push"><span class="icon">&#10514;</span>Push</a>
      <a href="#" data-view="metrics"><span class="icon">&#9636;</span>Metrics</a>
      <a href="#" data-view="audit" id="nav-audit"><span class="icon">&#128220;</span>Audit</a>
      <a href="#" data-view="blocked" id="nav-blocked"><span class="icon">&#9940;</span>Blocked</a>
      <a href="#" data-view="guide"><span class="icon">&#128218;</span>Guide</a>
      <a href="#" data-view="admin" id="nav-admin"><span class="icon">&#9881;</span>Admin</a>
    </nav>
    <div class="user-section" id="user-section"></div>
  </aside>

  <!-- Main -->
  <div class="main-content">
    <div class="top-bar">
      <button class="hamburger" id="hamburger">&#9776;</button>
      <div class="search-box"><input id="search" type="text" placeholder="Search artifacts..."></div>
      <div class="actions">
        <button class="theme-toggle" id="theme-toggle" title="Toggle theme">&#9790;</button>
      </div>
    </div>
    <div class="content" id="content"></div>
  </div>
</div>

<!-- Modal -->
<div class="modal-overlay" id="modal-overlay">
  <div class="modal" id="modal"></div>
</div>

<!-- Toasts -->
<div class="toast-container" id="toasts"></div>

<script>
(function(){
const TYPES=['agents','skills','rules','memories','prompts'];
const TYPE_DESC={agents:'Autonomous coding agents',skills:'Reusable capabilities',rules:'Coding standards and constraints',memories:'Context and knowledge',prompts:'Prompt templates'};

// State
let state={
  view:'browse',currentType:'agents',items:[],allItems:{},detail:null,
  comments:null,versions:null,sortBy:'name',searchTerm:'',
  user:null,token:null,isAdmin:false,projectFilter:null
};

// Auth from localStorage
const saved=localStorage.getItem('ihub_auth');
if(saved){try{const a=JSON.parse(saved);state.token=a.token;state.user=a.user;state.isAdmin=a.isAdmin||false;}catch{}}

// Theme
let theme=localStorage.getItem('ihub_theme')||'dark';
if(theme==='light')document.documentElement.setAttribute('data-theme','light');

// Helpers
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const \$=id=>document.getElementById(id);

function authHeaders(){
  const h={'Content-Type':'application/json'};
  if(state.token)h['Authorization']='Bearer '+state.token;
  return h;
}

async function api(path,opts={}){
  const o={...opts};
  if(!o.headers)o.headers=authHeaders();
  const r=await fetch('/api'+path,o);
  return r;
}

function toast(msg,type='info'){
  const c=\$('toasts');
  const t=document.createElement('div');
  t.className='toast '+type;
  t.textContent=msg;
  c.appendChild(t);
  setTimeout(()=>t.remove(),4000);
}

function showModal(html){
  \$('modal').innerHTML=html;
  \$('modal-overlay').classList.add('active');
}
function hideModal(){\$('modal-overlay').classList.remove('active');}

function renderStars(rating,max=5){
  let s='';
  for(let i=1;i<=max;i++)s+=(i<=rating)?'\\u2605':'<span class="empty">\\u2606</span>';
  return '<span class="stars">'+s+'</span>';
}

function renderMd(text){
  if(!text)return'';
  let html=esc(text);
  // Code blocks
  html=html.replace(/\\\`\\\`\\\`([\\s\\S]*?)\\\`\\\`\\\`/g,function(m,code){return'<pre><code>'+code+'</code></pre>';});
  // Inline code
  html=html.replace(/\\\`([^\\\`]+)\\\`/g,'<code>$1</code>');
  // Headings
  html=html.replace(/^### (.+)$/gm,'<h3>$1</h3>');
  html=html.replace(/^## (.+)$/gm,'<h2>$1</h2>');
  html=html.replace(/^# (.+)$/gm,'<h1>$1</h1>');
  // Bold and italic
  html=html.replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>');
  html=html.replace(/\\*(.+?)\\*/g,'<em>$1</em>');
  // Links
  html=html.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g,'<a href="$2" target="_blank">$1</a>');
  // Lists
  html=html.replace(/^- (.+)$/gm,'<li>$1</li>');
  html=html.replace(/(<li>.*<\\/li>)/gs,'<ul>$1</ul>');
  // Blockquote
  html=html.replace(/^&gt; (.+)$/gm,'<blockquote>$1</blockquote>');
  // Line breaks
  html=html.replace(/\\n/g,'<br>');
  return html;
}

// Sort items
function sortItems(items){
  const list=[...items];
  switch(state.sortBy){
    case'name':list.sort((a,b)=>(a.name||'').localeCompare(b.name||''));break;
    case'date':list.sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));break;
    case'rating':list.sort((a,b)=>(b.avg_rating||0)-(a.avg_rating||0));break;
    case'pulls':list.sort((a,b)=>(b.pulls||0)-(a.pulls||0));break;
  }
  return list;
}

function filterItems(items){
  if(!state.searchTerm)return items;
  const s=state.searchTerm.toLowerCase();
  return items.filter(i=>(i.name||'').toLowerCase().includes(s)||(i.description||'').toLowerCase().includes(s)||(i.tags||[]).join(' ').toLowerCase().includes(s));
}

// Navigation
function navigate(view){
  state.view=view;
  state.detail=null;
  document.querySelectorAll('.sidebar nav a').forEach(a=>a.classList.toggle('active',a.dataset.view===view));
  render();
  // Close mobile sidebar
  \$('sidebar').classList.remove('open');
}

// Load data
async function loadItems(type){
  try{
    const r=await api('/'+type);
    if(!r.ok)throw new Error('HTTP '+r.status);
    const d=await r.json();
    state.allItems[type]=Array.isArray(d)?d:[];
  }catch(e){state.allItems[type]=[];console.error(e);}
}

async function loadAllTypes(){
  await Promise.all(TYPES.map(t=>loadItems(t)));
}

// Check auth
async function checkAuth(){
  if(!state.token)return;
  try{
    const r=await api('/whoami');
    if(r.ok){const d=await r.json();state.user=d.username||d.user;state.isAdmin=d.role==='admin';}
    else{state.token=null;state.user=null;state.isAdmin=false;localStorage.removeItem('ihub_auth');}
  }catch{}
  updateAdminNav();
  renderUserSection();
}

function updateAdminNav(){
  \$('nav-audit').style.display=state.isAdmin?'':'none';
  \$('nav-blocked').style.display=state.isAdmin?'':'none';
  \$('nav-admin').style.display=state.isAdmin?'':'none';
}

function renderUserSection(){
  const el=\$('user-section');
  if(state.user){
    el.innerHTML='<span class="username">'+esc(state.user)+'</span>'+(state.isAdmin?'<span class="role-badge">admin</span>':'')+'<br><button class="btn btn-sm" style="margin-top:.5rem" onclick="logout()">Logout</button>';
  }else{
    el.innerHTML='<button class="btn btn-sm btn-primary" onclick="navigate(\\'browse\\');showLoginForm()">Login</button>';
  }
}

window.logout=function(){
  state.token=null;state.user=null;state.isAdmin=false;
  localStorage.removeItem('ihub_auth');
  updateAdminNav();renderUserSection();
  toast('Logged out','info');
  render();
};

window.navigate=navigate;

function showLoginForm(){
  showModal(\`
    <h3>Login</h3>
    <div class="form-group"><label>Username</label><input id="login-user" type="text" placeholder="username"></div>
    <div class="form-group"><label>API Key</label><input id="login-key" type="password" placeholder="your API key"></div>
    <div class="modal-actions"><button class="btn" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="doLogin()">Login</button></div>
  \`);
}
window.showLoginForm=showLoginForm;

window.doLogin=async function(){
  const username=\$('login-user').value.trim();
  const key=\$('login-key').value.trim();
  if(!username||!key){toast('Please fill both fields','error');return;}
  state.token=key;
  try{
    const r=await api('/whoami');
    if(r.ok){
      const d=await r.json();
      state.user=d.username||d.user||username;
      state.isAdmin=d.role==='admin';
      localStorage.setItem('ihub_auth',JSON.stringify({token:key,user:state.user,isAdmin:state.isAdmin}));
      hideModal();toast('Logged in as '+state.user,'success');
      updateAdminNav();renderUserSection();render();
    }else{
      state.token=null;toast('Invalid credentials','error');
    }
  }catch(e){state.token=null;toast('Login failed: '+e.message,'error');}
};

// Main render
function render(){
  const el=\$('content');
  switch(state.view){
    case'browse':renderBrowse(el);break;
    case'projects':renderProjects(el);break;
    case'push':renderPush(el);break;
    case'metrics':renderMetrics(el);break;
    case'audit':renderAudit(el);break;
    case'blocked':renderBlocked(el);break;
    case'guide':renderGuide(el);break;
    case'admin':renderAdmin(el);break;
    default:renderBrowse(el);
  }
}

// --- Browse ---
function renderBrowse(el){
  if(state.detail)return renderDetail(el);
  const items=sortItems(filterItems(state.allItems[state.currentType]||[]));
  let html='<div class="type-tabs">';
  TYPES.forEach(t=>{html+='<button class="type-tab'+(t===state.currentType?' active':'')+'" onclick="switchType(\\''+t+'\\')">'+t+' ('+(state.allItems[t]||[]).length+')</button>';});
  html+='</div>';
  html+='<div class="sort-bar"><span>Sort by:</span><select onchange="changeSort(this.value)">';
  ['name','date','rating','pulls'].forEach(s=>{html+='<option value="'+s+'"'+(state.sortBy===s?' selected':'')+'>'+s+'</option>';});
  html+='</select><span class="count">'+items.length+' artifacts</span></div>';
  if(!items.length){
    html+='<div class="empty-state"><div class="icon">\\u2205</div><p>No artifacts found</p></div>';
  }else{
    html+='<div class="card-grid">';
    items.forEach(i=>{
      const tags=(i.tags||[]).slice(0,3).map(t=>'<span class="tag">'+esc(t)+'</span>').join('');
      const stars=i.avg_rating?renderStars(Math.round(i.avg_rating)):'';
      html+='<div class="card" onclick="showDetail(\\''+esc(i.name).replace(/'/g,"\\\\'")+'\\')">';
      html+='<h3>'+esc(i.name)+'</h3><p>'+esc(i.description||'')+'</p>';
      html+='<div class="card-meta">'+tags+'</div>';
      html+='<div class="card-footer">'+stars+'<span>'+(i.version?'v'+esc(i.version):'')+(i.owner?' \\u00b7 '+esc(i.owner):'')+'</span></div>';
      html+='</div>';
    });
    html+='</div>';
  }
  el.innerHTML=html;
}

window.switchType=function(t){state.currentType=t;render();};
window.changeSort=function(s){state.sortBy=s;render();};

window.showDetail=async function(name){
  \$('content').innerHTML='<div class="loading-state"><div class="spinner"></div> Loading...</div>';
  try{
    const r=await api('/'+state.currentType+'/'+encodeURIComponent(name));
    state.detail=await r.json();
    try{const cr=await api('/'+state.currentType+'/'+encodeURIComponent(name)+'/comments');state.comments=await cr.json();}catch{state.comments=null;}
    try{const vr=await api('/'+state.currentType+'/'+encodeURIComponent(name)+'/versions');state.versions=await vr.json();}catch{state.versions=null;}
  }catch(e){toast('Error loading: '+e.message,'error');return;}
  render();
};

function renderDetail(el){
  const d=state.detail;
  if(!d){renderBrowse(el);return;}
  const tags=(d.tags||[]).map(t=>'<span class="tag">'+esc(t)+'</span>').join(' ');
  const cmts=(state.comments&&(state.comments.comments||state.comments))||[];
  const rating=state.comments?.rating||{};
  const versions=Array.isArray(state.versions)?state.versions:[];

  let html='<div class="detail-view">';
  html+='<div class="detail-header"><div><button class="btn btn-sm" onclick="backToList()">\\u2190 Back</button></div><div>';
  if(state.token)html+='<button class="btn btn-danger btn-sm" onclick="confirmDelete(\\''+esc(d.name).replace(/'/g,"\\\\'")+'\\')" title="Delete">\\u2716 Delete</button>';
  html+='</div></div>';
  html+='<h2>'+esc(d.name)+'</h2>';
  html+='<div class="detail-meta">';
  if(d.version)html+='<span>v'+esc(d.version)+'</span>';
  if(d.owner)html+='<span>by '+esc(d.owner)+'</span>';
  html+=tags;
  if(rating.average)html+=' '+renderStars(Math.round(rating.average))+' <span style="color:var(--muted)">'+rating.average.toFixed(1)+'/5 ('+( rating.count||0)+' reviews)</span>';
  html+='</div>';
  html+='<div class="detail-body">'+renderMd(d.body||'')+'</div>';

  // Version history
  if(versions.length){
    html+='<div class="version-list"><h3>Version History</h3>';
    versions.forEach(v=>{
      html+='<div class="version-item"><span class="v-num">v'+esc(v.version||v)+'</span><span>'+esc(v.created_at||v.date||'')+'</span></div>';
    });
    html+='</div>';
  }

  // Comments
  html+='<div class="comments-section"><h3>Comments'+(cmts.length?' ('+cmts.length+')':'')+'</h3>';
  if(Array.isArray(cmts)&&cmts.length){
    cmts.forEach(c=>{
      html+='<div class="comment"><div class="c-header"><span class="c-user">'+esc(c.username||'anon')+(c.rating?' '+renderStars(c.rating):'')+'</span><span class="c-date">'+esc(c.created_at||'')+'</span></div><div class="c-body">'+esc(c.body||'')+'</div></div>';
    });
  }else{html+='<p style="color:var(--muted)">No comments yet</p>';}

  // Write review form
  if(state.token){
    html+='<div class="review-form"><h4>Write a Review</h4>';
    html+='<div class="star-input" id="star-input">';
    for(let i=1;i<=5;i++)html+='<span data-v="'+i+'" onclick="setRating('+i+')">\\u2606</span>';
    html+='</div>';
    html+='<textarea id="review-body" placeholder="Your review..."></textarea>';
    html+='<div class="form-actions"><button class="btn btn-primary" onclick="submitReview()">Submit</button></div></div>';
  }
  html+='</div></div>';
  el.innerHTML=html;
}

let _reviewRating=0;
window.setRating=function(v){
  _reviewRating=v;
  document.querySelectorAll('#star-input span').forEach((s,i)=>{
    s.textContent=(i<v)?'\\u2605':'\\u2606';
    s.classList.toggle('active',i<v);
  });
};

window.submitReview=async function(){
  const body=\$('review-body')?.value.trim();
  if(!_reviewRating){toast('Please select a rating','error');return;}
  if(!body){toast('Please write a comment','error');return;}
  try{
    const r=await api('/'+state.currentType+'/'+encodeURIComponent(state.detail.name)+'/comments',{method:'POST',headers:authHeaders(),body:JSON.stringify({rating:_reviewRating,body:body})});
    if(r.ok){toast('Review submitted!','success');_reviewRating=0;const cr=await api('/'+state.currentType+'/'+encodeURIComponent(state.detail.name)+'/comments');state.comments=await cr.json();render();}
    else{const e=await r.json().catch(()=>({}));toast(e.error||'Failed','error');}
  }catch(e){toast('Error: '+e.message,'error');}
};

window.backToList=function(){state.detail=null;state.comments=null;state.versions=null;render();};

window.confirmDelete=function(name){
  showModal('<h3>Delete Artifact</h3><p>Are you sure you want to delete <strong>'+esc(name)+'</strong>? This cannot be undone.</p><div class="modal-actions"><button class="btn" onclick="hideModal()">Cancel</button><button class="btn btn-danger" onclick="doDelete(\\''+esc(name).replace(/'/g,"\\\\'")+'\\')"">Delete</button></div>');
};
window.hideModal=hideModal;

window.doDelete=async function(name){
  try{
    const r=await api('/'+state.currentType+'/'+encodeURIComponent(name),{method:'DELETE',headers:authHeaders()});
    if(r.ok){hideModal();toast('Deleted '+name,'success');await loadItems(state.currentType);state.detail=null;render();}
    else{const e=await r.json().catch(()=>({}));toast(e.error||'Delete failed','error');}
  }catch(e){toast('Error: '+e.message,'error');}
  hideModal();
};

// --- Projects ---
async function renderProjects(el){
  const allEntries=[];
  for(const t of TYPES)(state.allItems[t]||[]).forEach(e=>allEntries.push({...e,_type:t}));
  const projects={};
  const unassigned=[];
  allEntries.forEach(e=>{
    const proj=e.project||e.meta?.project||'';
    if(proj){if(!projects[proj])projects[proj]=[];projects[proj].push(e);}
    else unassigned.push(e);
  });
  const pnames=Object.keys(projects).sort();
  let html='<h2>Projects</h2>';
  if(!pnames.length&&!unassigned.length){html+='<div class="empty-state"><div class="icon">\\ud83d\\udcc2</div><p>No projects found</p></div>';el.innerHTML=html;return;}
  pnames.forEach(p=>{
    const items=projects[p];
    html+='<div class="project-group"><h4>'+esc(p)+' ('+items.length+')</h4><div class="project-items">';
    items.forEach(i=>{
      html+='<div class="project-item" onclick="navToArtifact(\\''+esc(i._type)+'\\',\\''+esc(i.name).replace(/'/g,"\\\\'")+'\\')"">'+esc(i.name)+'<span class="p-type">'+i._type+'</span></div>';
    });
    html+='</div></div>';
  });
  if(unassigned.length){
    html+='<div class="project-group"><h4>Unassigned ('+unassigned.length+')</h4><div class="project-items">';
    unassigned.slice(0,20).forEach(i=>{
      html+='<div class="project-item" onclick="navToArtifact(\\''+esc(i._type)+'\\',\\''+esc(i.name).replace(/'/g,"\\\\'")+'\\')"">'+esc(i.name)+'<span class="p-type">'+i._type+'</span></div>';
    });
    html+='</div></div>';
  }
  el.innerHTML=html;
}

window.navToArtifact=function(type,name){
  state.currentType=type;state.view='browse';
  document.querySelectorAll('.sidebar nav a').forEach(a=>a.classList.toggle('active',a.dataset.view==='browse'));
  showDetail(name);
};

// --- Push ---
function renderPush(el){
  if(!state.token){el.innerHTML='<div class="empty-state"><div class="icon">\\ud83d\\udd12</div><p>Please login to push artifacts</p></div>';return;}
  let html='<h2>Push Artifact</h2>';
  html+='<div style="max-width:600px;margin-top:1rem">';
  html+='<div class="form-group" style="margin-bottom:1rem"><label style="display:block;font-size:.85rem;color:var(--muted);margin-bottom:.3rem">Type</label><select id="push-type" style="width:100%;padding:.5rem;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text)">';
  TYPES.forEach(t=>{html+='<option value="'+t+'">'+t+'</option>';});
  html+='</select></div>';
  html+='<div class="form-group" style="margin-bottom:1rem"><label style="display:block;font-size:.85rem;color:var(--muted);margin-bottom:.3rem">Name</label><input id="push-name" placeholder="my-artifact" style="width:100%;padding:.5rem;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text)"></div>';
  html+='<div class="form-group" style="margin-bottom:1rem"><label style="display:block;font-size:.85rem;color:var(--muted);margin-bottom:.3rem">Version</label><input id="push-version" placeholder="1.0.0" style="width:100%;padding:.5rem;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text)"></div>';
  html+='<div class="form-group" style="margin-bottom:1rem"><label style="display:block;font-size:.85rem;color:var(--muted);margin-bottom:.3rem">Description</label><input id="push-desc" placeholder="Brief description" style="width:100%;padding:.5rem;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text)"></div>';
  html+='<div class="form-group" style="margin-bottom:1rem"><label style="display:block;font-size:.85rem;color:var(--muted);margin-bottom:.3rem">Tags (comma-separated)</label><input id="push-tags" placeholder="tag1, tag2" style="width:100%;padding:.5rem;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text)"></div>';
  html+='<div class="form-group" style="margin-bottom:1rem"><label style="display:block;font-size:.85rem;color:var(--muted);margin-bottom:.3rem">Body</label><textarea id="push-body" rows="8" placeholder="Artifact body content (markdown)" style="width:100%;padding:.7rem;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);resize:vertical"></textarea></div>';
  html+='<button class="btn btn-primary" onclick="doPush()">Push Artifact</button>';
  html+='</div>';
  el.innerHTML=html;
}

window.doPush=async function(){
  const type=\$('push-type').value;
  const name=\$('push-name').value.trim();
  const version=\$('push-version').value.trim();
  const description=\$('push-desc').value.trim();
  const tags=\$('push-tags').value.split(',').map(t=>t.trim()).filter(Boolean);
  const body=\$('push-body').value;
  if(!name){toast('Name is required','error');return;}
  if(!version){toast('Version is required','error');return;}
  try{
    const r=await api('/'+type+'/'+encodeURIComponent(name),{method:'POST',headers:authHeaders(),body:JSON.stringify({name,version,description,tags,body})});
    if(r.ok){toast('Pushed '+type+'/'+name+' successfully!','success');await loadItems(type);\$('push-name').value='';\$('push-version').value='';\$('push-desc').value='';\$('push-tags').value='';\$('push-body').value='';}
    else{const e=await r.json().catch(()=>({}));toast(e.error||'Push failed','error');}
  }catch(e){toast('Error: '+e.message,'error');}
};

// --- Metrics ---
async function renderMetrics(el){
  el.innerHTML='<div class="loading-state"><div class="spinner"></div> Loading metrics...</div>';
  try{
    const r=await api('/metrics');
    if(!r.ok)throw new Error('HTTP '+r.status);
    const text=await r.text();
    const metrics=parsePrometheus(text);
    let html='<h2>Metrics Dashboard</h2>';
    // Summary cards
    html+='<div class="metrics-grid">';
    const cards=[
      {label:'Total Entries',key:'ihub_entries_total'},
      {label:'Total Users',key:'ihub_users_total'},
      {label:'Total Comments',key:'ihub_comments_total'},
      {label:'Total Pushes',key:'ihub_pushes_total'},
      {label:'Total Views',key:'ihub_views_total'}
    ];
    cards.forEach(c=>{
      const v=metrics.gauges[c.key]||metrics.counters[c.key]||'0';
      html+='<div class="metric-card"><div class="value">'+esc(String(v))+'</div><div class="label">'+c.label+'</div></div>';
    });
    html+='</div>';

    // Bar charts
    const byType=metrics.labeled['ihub_entries_by_type']||{};
    if(Object.keys(byType).length){
      html+=renderBarChart('Entries by Type',byType);
    }
    const byUser=metrics.labeled['ihub_pushes_by_user']||{};
    if(Object.keys(byUser).length){
      html+=renderBarChart('Pushes by User',byUser);
    }
    const byTypeViews=metrics.labeled['ihub_views_by_type']||{};
    if(Object.keys(byTypeViews).length){
      html+=renderBarChart('Views by Type',byTypeViews);
    }
    el.innerHTML=html;
  }catch(e){el.innerHTML='<div class="empty-state"><div class="icon">\\u26a0</div><p>Could not load metrics: '+esc(e.message)+'</p></div>';}
}

function parsePrometheus(text){
  const gauges={},counters={},labeled={};
  text.split('\\n').forEach(line=>{
    if(line.startsWith('#')||!line.trim())return;
    // labeled metric: name{label="value"} number
    const lm=line.match(/^(\\w+)\\{(\\w+)="([^"]+)"\\}\\s+([\\d.]+)/);
    if(lm){
      const[,name,,lval,val]=lm;
      if(!labeled[name])labeled[name]={};
      labeled[name][lval]=parseFloat(val);
      return;
    }
    // simple metric
    const sm=line.match(/^(\\w+)\\s+([\\d.]+)/);
    if(sm){
      const[,name,val]=sm;
      if(name.includes('total'))counters[name]=parseFloat(val);
      else gauges[name]=parseFloat(val);
    }
  });
  return{gauges,counters,labeled};
}

function renderBarChart(title,data){
  const entries=Object.entries(data).sort((a,b)=>b[1]-a[1]);
  const max=Math.max(...entries.map(e=>e[1]),1);
  let html='<div class="bar-chart"><h4>'+esc(title)+'</h4>';
  entries.forEach(([label,val])=>{
    const pct=Math.round((val/max)*100);
    html+='<div class="bar-row"><span class="bar-label">'+esc(label)+'</span><div class="bar"><div class="bar-fill" style="width:'+pct+'%"></div><span class="bar-value">'+val+'</span></div></div>';
  });
  html+='</div>';
  return html;
}

// --- Audit ---
let auditPage=1;
async function renderAudit(el){
  if(!state.isAdmin){el.innerHTML='<div class="empty-state"><p>Admin access required</p></div>';return;}
  el.innerHTML='<div class="loading-state"><div class="spinner"></div> Loading audit log...</div>';
  try{
    const r=await api('/audit?page='+auditPage);
    if(!r.ok)throw new Error('HTTP '+r.status);
    const d=await r.json();
    const entries=d.entries||d.log||d||[];
    const total=d.total||entries.length;
    let html='<h2>Audit Trail</h2>';
    if(!entries.length){html+='<div class="empty-state"><p>No audit entries</p></div>';el.innerHTML=html;return;}
    html+='<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Type</th><th>Name</th><th>Detail</th></tr></thead><tbody>';
    entries.forEach(e=>{
      html+='<tr><td>'+esc(e.timestamp||e.created_at||'')+'</td><td>'+esc(e.username||'')+'</td><td>'+esc(e.action||'')+'</td><td>'+esc(e.type||'')+'</td><td>'+esc(e.name||'')+'</td><td>'+esc((e.detail||'').substring(0,60))+'</td></tr>';
    });
    html+='</tbody></table></div>';
    html+='<div class="pagination"><button class="btn btn-sm" onclick="auditPrev()" '+(auditPage<=1?'disabled':'')+'>\\u2190 Prev</button><span>Page '+auditPage+'</span><button class="btn btn-sm" onclick="auditNext()" '+(entries.length<50?'disabled':'')+'>Next \\u2192</button></div>';
    el.innerHTML=html;
  }catch(e){el.innerHTML='<div class="empty-state"><p>Error: '+esc(e.message)+'</p></div>';}
}
window.auditPrev=function(){if(auditPage>1){auditPage--;renderAudit(\$('content'));}};
window.auditNext=function(){auditPage++;renderAudit(\$('content'));};

// --- Blocked ---
async function renderBlocked(el){
  if(!state.isAdmin){el.innerHTML='<div class="empty-state"><p>Admin access required</p></div>';return;}
  el.innerHTML='<div class="loading-state"><div class="spinner"></div> Loading...</div>';
  try{
    const r=await api('/blocked');
    if(!r.ok)throw new Error('HTTP '+r.status);
    const items=await r.json();
    let html='<h2>Blocked Artifacts</h2>';
    if(!items.length){html+='<div class="empty-state"><div class="icon">\\u2714</div><p>No blocked artifacts</p></div>';el.innerHTML=html;return;}
    html+='<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Type</th><th>Name</th><th>Owner</th><th>Reason</th><th>Action</th></tr></thead><tbody>';
    items.forEach(i=>{
      html+='<tr><td>'+esc(i.type||'')+'</td><td>'+esc(i.name||'')+'</td><td>'+esc(i.owner||'')+'</td><td>'+esc(i.reason||'')+'</td><td><button class="btn btn-sm btn-primary" onclick="approveArtifact(\\''+esc(i.type)+'\\',\\''+esc(i.name).replace(/'/g,"\\\\'")+'\\')"">Approve</button></td></tr>';
    });
    html+='</tbody></table></div>';
    el.innerHTML=html;
  }catch(e){el.innerHTML='<div class="empty-state"><p>Error: '+esc(e.message)+'</p></div>';}
}

window.approveArtifact=async function(type,name){
  try{
    const r=await api('/blocked/'+encodeURIComponent(name),{method:'DELETE',headers:authHeaders()});
    if(r.ok){toast('Approved '+name,'success');renderBlocked(\$('content'));}
    else{toast('Approve failed','error');}
  }catch(e){toast('Error: '+e.message,'error');}
};

// --- Guide ---
function renderGuide(el){
  let html='<div class="guide-content"><h2>Artifact Types Guide</h2>';
  html+='<h3>Agents</h3><p>Autonomous coding agents that perform complex tasks. Define their capabilities, inputs/outputs, and which skills/rules they use.</p>';
  html+='<h3>Skills</h3><p>Reusable capabilities that agents can invoke. Each skill defines triggers, arguments, and which agents can use it.</p>';
  html+='<h3>Rules</h3><p>Coding standards, constraints, and guidelines. Rules have a scope (global, project, file) and severity level.</p>';
  html+='<h3>Memories</h3><p>Persistent context and knowledge. Memories carry context between sessions and can be scoped to projects or global.</p>';
  html+='<p><strong>Context types:</strong></p><ul>';
  html+='<li><code>architecture</code> - System design decisions</li>';
  html+='<li><code>decision</code> - Key choices and rationale</li>';
  html+='<li><code>pattern</code> - Recurring code patterns</li>';
  html+='<li><code>preference</code> - User/team preferences</li>';
  html+='<li><code>fact</code> - Factual information</li>';
  html+='</ul>';
  html+='<h3>Prompts</h3><p>Reusable prompt templates for specific models or tasks. Prompts specify compatible agents and target models.</p>';
  html+='<h2>Boundaries</h2><ul>';
  html+='<li><strong>Agent vs Skill:</strong> An agent orchestrates; a skill is a single capability.</li>';
  html+='<li><strong>Rule vs Memory:</strong> Rules are prescriptive (what to do); memories are descriptive (what is).</li>';
  html+='<li><strong>Skill vs Prompt:</strong> Skills define behavior/logic; prompts define text templates.</li>';
  html+='</ul>';
  html+='<h2>Cross-references</h2><p>Artifacts reference each other by <code>name</code>. The <code>validate</code> command checks all refs resolve. Agents reference skills and rules; memories reference related artifacts.</p>';
  html+='</div>';
  el.innerHTML=html;
}

// --- Admin ---
async function renderAdmin(el){
  if(!state.isAdmin){el.innerHTML='<div class="empty-state"><p>Admin access required</p></div>';return;}
  let html='<h2>Admin Panel</h2>';

  // Role management
  html+='<div class="admin-section"><h3>User Role Management</h3>';
  html+='<div style="display:flex;gap:.5rem;align-items:flex-end;flex-wrap:wrap">';
  html+='<div><label style="display:block;font-size:.82rem;color:var(--muted)">Username</label><input id="admin-user" placeholder="username" style="padding:.4rem .7rem;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text)"></div>';
  html+='<div><label style="display:block;font-size:.82rem;color:var(--muted)">Role</label><select id="admin-role" style="padding:.4rem .7rem;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text)"><option>user</option><option>admin</option><option>moderator</option></select></div>';
  html+='<button class="btn btn-primary btn-sm" onclick="setRole()">Set Role</button>';
  html+='</div></div>';

  // Backup
  html+='<div class="admin-section"><h3>Backup</h3>';
  html+='<button class="btn" onclick="downloadBackup()">Download Backup</button></div>';

  // Config
  html+='<div class="admin-section"><h3>Server Config</h3>';
  html+='<div id="config-view"><div class="loading-state"><div class="spinner"></div></div></div></div>';

  el.innerHTML=html;
  // Load config
  try{
    const r=await api('/config');
    if(r.ok){const cfg=await r.json();\$('config-view').innerHTML='<pre style="background:var(--bg);padding:1rem;border-radius:var(--radius);overflow:auto;font-size:.82rem;border:1px solid var(--border)">'+esc(JSON.stringify(cfg,null,2))+'</pre>';}
    else{\$('config-view').innerHTML='<p style="color:var(--muted)">Could not load config</p>';}
  }catch{
    \$('config-view').innerHTML='<p style="color:var(--muted)">Could not load config</p>';
  }
}

window.setRole=async function(){
  const user=\$('admin-user').value.trim();
  const role=\$('admin-role').value;
  if(!user){toast('Enter a username','error');return;}
  try{
    const r=await api('/admin/role',{method:'POST',headers:authHeaders(),body:JSON.stringify({username:user,role})});
    if(r.ok){toast('Role set: '+user+' -> '+role,'success');}
    else{const e=await r.json().catch(()=>({}));toast(e.error||'Failed','error');}
  }catch(e){toast('Error: '+e.message,'error');}
};

window.downloadBackup=async function(){
  try{
    const r=await api('/backup');
    if(!r.ok)throw new Error('HTTP '+r.status);
    const blob=await r.blob();
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='ihub-backup.json';a.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded','success');
  }catch(e){toast('Backup failed: '+e.message,'error');}
};

// --- Theme toggle ---
\$('theme-toggle').onclick=function(){
  theme=theme==='dark'?'light':'dark';
  localStorage.setItem('ihub_theme',theme);
  if(theme==='light')document.documentElement.setAttribute('data-theme','light');
  else document.documentElement.removeAttribute('data-theme');
  this.textContent=theme==='dark'?'\\u263e':'\\u2600';
};
\$('theme-toggle').textContent=theme==='dark'?'\\u263e':'\\u2600';

// --- Search ---
\$('search').addEventListener('input',function(e){
  state.searchTerm=e.target.value;
  if(state.view==='browse'&&!state.detail)render();
});

// --- Hamburger ---
\$('hamburger').onclick=function(){\$('sidebar').classList.toggle('open');};

// --- Nav clicks ---
document.querySelectorAll('.sidebar nav a').forEach(a=>{
  a.addEventListener('click',function(e){e.preventDefault();navigate(this.dataset.view);});
});

// --- Modal close on overlay click ---
\$('modal-overlay').addEventListener('click',function(e){if(e.target===this)hideModal();});

// --- Init ---
async function init(){
  await loadAllTypes();
  await checkAuth();
  updateAdminNav();
  renderUserSection();
  render();
}
init();

})();
</script>
</body>
</html>`;

export function handleUiRequest(req, res, url) {
  if (!url.pathname.startsWith("/ui")) return false;
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(HTML);
  return true;
}
