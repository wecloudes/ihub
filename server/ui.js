const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>ihub Registry</title>
<script>
{
  const t=localStorage.getItem('ihub_theme');
  if(t==='light'){document.querySelector('meta[name="color-scheme"]').content='light';document.documentElement.setAttribute('data-theme','light');}
  else if(t==='dark'){document.querySelector('meta[name="color-scheme"]').content='dark';}
}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0a0a14;--surface:#131320;--card:rgba(22,33,62,.6);--card-hover:rgba(26,39,68,.8);
  --text:#e8e8f0;--muted:#7a7a8e;--accent:#e94560;--accent-hover:#ff6b81;
  --accent2:rgba(15,52,96,.5);--border:rgba(255,255,255,.08);--radius:12px;--shadow:0 8px 32px rgba(0,0,0,.5);
  --success:#2ecc71;--warning:#f39c12;--danger:#e74c3c;--info:#3498db;
  --star:#f1c40f;--star-empty:#333;
  --header-bg:rgba(12,12,22,.95);--nav-width:230px;--toast-bg:rgba(30,30,50,.95);
  --type-agents:#3498db;--type-skills:#2ecc71;--type-rules:#f39c12;--type-memories:#e94560;--type-prompts:#9b59b6;
  --glow-agents:rgba(52,152,219,.15);--glow-skills:rgba(46,204,113,.15);--glow-rules:rgba(243,156,18,.15);--glow-memories:rgba(233,69,96,.15);--glow-prompts:rgba(155,89,182,.15);
  --font-display:'JetBrains Mono',monospace;--font-body:'DM Sans',sans-serif;
  --graph-center:rgba(20,20,40,.9);--graph-edge:var(--bg);--graph-text:#d0d0e0;--graph-line:rgba(255,255,255,.12);--graph-node-stroke:rgba(10,10,20,.8);
  color-scheme:dark;accent-color:var(--accent);
  scrollbar-color:rgba(255,255,255,.15) transparent;
}
[data-theme="light"]{
  --bg:#f4f3f0;--surface:#fffffe;--card:rgba(255,255,255,.8);--card-hover:rgba(255,255,255,1);
  --text:#1a1a2e;--muted:#6b6b7b;--accent:#d63a50;--accent-hover:#b02a3e;
  --accent2:rgba(52,152,219,.08);--border:rgba(0,0,0,.08);--shadow:0 4px 20px rgba(0,0,0,.06);
  --success:#27ae60;--warning:#e67e22;--danger:#c0392b;--info:#2980b9;
  --star:#f39c12;--star-empty:#d0d0d0;
  --header-bg:rgba(255,255,254,.97);--toast-bg:#2d2d44;
  --glow-agents:rgba(52,152,219,.08);--glow-skills:rgba(46,204,113,.08);--glow-rules:rgba(243,156,18,.08);--glow-memories:rgba(233,69,96,.08);--glow-prompts:rgba(155,89,182,.08);
  --graph-center:#eae8e4;--graph-edge:#ddd9d3;--graph-text:#1a1a2e;--graph-line:rgba(0,0,0,.12);--graph-node-stroke:#fff;
  color-scheme:light;accent-color:var(--accent);
  scrollbar-color:rgba(0,0,0,.2) transparent;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--font-body);background:var(--bg);color:var(--text);line-height:1.6;min-height:100vh;-webkit-font-smoothing:antialiased}
button{font-family:var(--font-body);cursor:pointer}
input,textarea,select{font-family:var(--font-body);font-size:inherit}
h1,h2,h3,h4{font-family:var(--font-display);letter-spacing:-.01em}

/* Layout */
.app{display:flex;min-height:100vh}
.sidebar{width:var(--nav-width);background:var(--header-bg);backdrop-filter:blur(20px);border-right:1px solid var(--border);position:fixed;top:0;left:0;height:100vh;display:flex;flex-direction:column;z-index:100;transition:transform .3s}
.sidebar .logo{padding:.8rem 1.5rem;font-family:var(--font-display);font-size:1.2rem;font-weight:700;color:var(--accent);border-bottom:1px solid var(--border);height:52px;display:flex;align-items:center;gap:.5rem;letter-spacing:-.02em}
.sidebar .logo::before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 8px var(--accent)}
.sidebar nav{flex:1;padding:.5rem 0;overflow-y:auto}
.sidebar .nav-label{padding:.6rem 1.5rem .2rem;font-size:.65rem;font-weight:600;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);opacity:.5}
.sidebar nav a{display:flex;align-items:center;gap:.75rem;padding:.55rem 1.5rem;color:var(--muted);text-decoration:none;font-size:.85rem;font-weight:500;transition:all .2s;border-left:3px solid transparent;position:relative}
.sidebar nav a:hover{color:var(--text);background:rgba(255,255,255,.03)}
.sidebar nav a.active{color:var(--accent);border-left-color:var(--accent);background:rgba(233,69,96,.06)}
.sidebar nav a.active::after{content:'';position:absolute;left:0;top:25%;height:50%;width:3px;background:var(--accent);box-shadow:0 0 12px var(--accent);border-radius:0 2px 2px 0}
.sidebar nav a .icon{font-size:.85rem;width:1.2rem;text-align:center;opacity:.5}
.sidebar nav a.active .icon{opacity:1}
.sidebar .user-section{padding:.8rem 1.5rem;border-top:1px solid var(--border);font-size:.82rem;color:var(--text)}
.sidebar .user-section .username{font-family:var(--font-display);color:var(--accent);font-weight:600;font-size:.85rem}
.sidebar .user-section .role-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.65rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px;background:rgba(233,69,96,.12);color:var(--accent);margin-left:.4rem}
.sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);z-index:99}

.main-content{margin-left:var(--nav-width);flex:1;display:flex;flex-direction:column;height:100vh;overflow:hidden;max-width:calc(100vw - var(--nav-width))}
.top-bar{flex-shrink:0;background:var(--header-bg);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);padding:.7rem 1.5rem;display:flex;align-items:center;gap:1rem;z-index:50;flex-wrap:wrap;height:52px}
.top-bar .search-box{flex:1;min-width:200px;max-width:420px;position:relative}
.top-bar .search-box input{width:100%;padding:.5rem 1rem .5rem 2.2rem;border-radius:20px;border:1px solid var(--border);background:rgba(255,255,255,.04);color:var(--text);font-size:.85rem;outline:none;transition:all .25s}
.top-bar .search-box input:focus{border-color:var(--accent);background:rgba(255,255,255,.08);box-shadow:0 0 0 3px rgba(233,69,96,.1)}
.top-bar .search-box::before{content:"\\2315";position:absolute;left:.8rem;top:50%;transform:translateY(-50%);color:var(--muted);font-size:1rem}
.top-bar .actions{display:flex;gap:.5rem;align-items:center;margin-left:auto}
.btn{padding:.45rem 1rem;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,.04);color:var(--text);font-size:.82rem;font-weight:500;transition:all .2s;display:inline-flex;align-items:center;gap:.4rem}
.btn:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.15);transform:translateY(-1px)}
.btn:active{transform:scale(.97)}
.btn-primary{background:var(--accent);color:#fff;border-color:var(--accent);box-shadow:0 2px 12px rgba(233,69,96,.25)}
.btn-primary:hover{background:var(--accent-hover);box-shadow:0 4px 16px rgba(233,69,96,.35)}
.btn-danger{background:var(--danger);color:#fff;border-color:var(--danger)}
.btn-danger:hover{opacity:.85}
.btn-sm{padding:.3rem .7rem;font-size:.78rem}

.content{padding:1.5rem 2rem;flex:1;overflow-y:auto;overflow-x:hidden;min-width:0;min-height:0}

/* Tabs */
.type-tabs{display:flex;gap:.3rem;margin-bottom:1.2rem;flex-wrap:wrap;overflow-x:auto;-webkit-overflow-scrolling:touch;min-width:0}
.type-tab{padding:.4rem 1rem;border-radius:20px;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:.82rem;font-weight:500;transition:all .25s}
.type-tab:hover{color:var(--text);background:rgba(255,255,255,.05)}
.type-tab.active{color:#fff;border-color:transparent}
.type-tab[data-type="agents"].active{background:var(--type-agents)}
.type-tab[data-type="skills"].active{background:var(--type-skills)}
.type-tab[data-type="rules"].active{background:var(--type-rules)}
.type-tab[data-type="memories"].active{background:var(--type-memories)}
.type-tab[data-type="prompts"].active{background:var(--type-prompts)}
.type-tab.active{background:var(--accent)}

/* Sort */
.sort-bar{display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;font-size:.82rem;color:var(--muted)}
.sort-bar select{background:rgba(255,255,255,.04);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:.35rem .6rem;font-size:.8rem}
.sort-bar .count{margin-left:auto;font-family:var(--font-display);font-size:.78rem}

/* Cards grid */
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr));gap:1rem}
.card{background:var(--card);backdrop-filter:blur(12px);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:var(--radius);padding:1.2rem 1.2rem 1rem;cursor:pointer;transition:all .25s;animation:cardIn .4s ease both}
.card:hover{transform:translateY(-3px);box-shadow:0 8px 30px rgba(0,0,0,.3);border-color:rgba(255,255,255,.12);background:var(--card-hover)}
@keyframes cardIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.card h3{font-family:var(--font-display);font-size:.9rem;font-weight:600;margin-bottom:.3rem;color:var(--text)}
.card p{font-size:.8rem;color:var(--muted);margin-bottom:.6rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.5}
.card-meta{display:flex;gap:.35rem;flex-wrap:wrap;align-items:center;font-size:.72rem}
.tag{background:rgba(255,255,255,.06);padding:3px 9px;border-radius:6px;color:var(--text);font-weight:500;font-size:.72rem;border:1px solid rgba(255,255,255,.06)}
.stars{color:var(--star)}
.stars .empty{color:var(--star-empty)}
.card-footer{display:flex;justify-content:space-between;align-items:center;margin-top:.7rem;padding-top:.5rem;border-top:1px solid var(--border);font-size:.72rem;color:var(--muted)}

/* Detail view */
.detail-view{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:2rem;animation:cardIn .3s ease}
.detail-header{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:.5rem;flex-wrap:wrap}
.detail-header h2{font-size:1.4rem;font-weight:700}
.detail-meta{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;margin-bottom:1.2rem;font-size:.8rem;color:var(--muted)}
.detail-meta span{padding:.2rem .6rem;background:rgba(255,255,255,.04);border-radius:6px}
.detail-body{font-size:.88rem;line-height:1.7}
.detail-body h1,.detail-body h2,.detail-body h3{font-family:var(--font-display);margin:1rem 0 .4rem;color:var(--accent)}
.detail-body h1{font-size:1.2rem}
.detail-body h2{font-size:1.08rem}
.detail-body h3{font-size:.95rem}
.detail-body code{background:rgba(255,255,255,.06);padding:2px 7px;border-radius:5px;font-size:.84em;font-family:var(--font-display)}
.detail-body pre{background:var(--bg);padding:1.2rem;border-radius:var(--radius);overflow-x:auto;margin:.8rem 0;border:1px solid var(--border)}
.detail-body pre code{background:none;padding:0}
.detail-body ul,.detail-body ol{padding-left:1.5rem;margin:.4rem 0}
.detail-body li{margin-bottom:.15rem}
.detail-body p{margin:.4rem 0}
.detail-body a{color:var(--accent);text-decoration:none;border-bottom:1px solid transparent;transition:border-color .15s}
.detail-body a:hover{border-bottom-color:var(--accent)}
.detail-body blockquote{border-left:3px solid var(--accent);padding-left:1rem;color:var(--muted);margin:.6rem 0;background:rgba(233,69,96,.03);padding:.5rem 1rem;border-radius:0 var(--radius) var(--radius) 0}

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
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:1000;opacity:0;visibility:hidden;transition:all .25s}
.modal-overlay.active{opacity:1;visibility:visible}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:2rem;max-width:500px;width:90%;max-height:80vh;overflow-y:auto;animation:modalIn .3s cubic-bezier(.175,.885,.32,1.275)}
@keyframes modalIn{from{transform:scale(.9) translateY(10px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}
.modal h3{margin-bottom:1rem}
.modal .form-group{margin-bottom:1rem}
.modal label{display:block;font-size:.85rem;color:var(--muted);margin-bottom:.3rem}
.modal input,.modal textarea,.modal select{width:100%;padding:.5rem .8rem;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);outline:none}
.modal input:focus,.modal textarea:focus,.modal select:focus{border-color:var(--accent)}
.modal textarea{min-height:120px;resize:vertical}
.modal .modal-actions{display:flex;gap:.5rem;justify-content:flex-end;margin-top:1.2rem}

/* Toast */
.toast-container{position:fixed;top:1rem;right:1rem;z-index:2000;display:flex;flex-direction:column;gap:.5rem}
.toast{padding:.7rem 1.2rem;border-radius:var(--radius);background:var(--toast-bg);backdrop-filter:blur(16px);color:#fff;font-size:.82rem;font-weight:500;animation:toastIn .4s cubic-bezier(.175,.885,.32,1.275);box-shadow:0 8px 30px rgba(0,0,0,.4);display:flex;align-items:center;gap:.5rem;max-width:350px}
.toast.success{border-left:3px solid var(--success)}
.toast.error{border-left:3px solid var(--danger)}
.toast.info{border-left:3px solid var(--info)}
@keyframes toastIn{from{transform:translateX(100%) scale(.9);opacity:0}to{transform:translateX(0) scale(1);opacity:1}}

/* Tables */
.data-table{width:100%;border-collapse:collapse;font-size:.85rem}
.data-table th,.data-table td{padding:.6rem .8rem;text-align:left;border-bottom:1px solid var(--border)}
.data-table th{background:var(--bg);font-weight:600;color:var(--muted);position:sticky;top:0}
.data-table tr:hover td{background:var(--card)}
.pagination{display:flex;align-items:center;gap:1rem;margin-top:1rem;justify-content:center;font-size:.85rem}

/* Metrics */
.metrics-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(200px,100%),1fr));gap:1rem;margin-bottom:1rem}
.metric-card{background:var(--card);backdrop-filter:blur(12px);border:1px solid var(--border);border-radius:var(--radius);padding:1.2rem;text-align:center;transition:all .2s}
.metric-card:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
.metric-card .value{font-family:var(--font-display);font-size:2rem;font-weight:700;color:var(--accent)}
.metric-card .label{font-size:.78rem;color:var(--muted);margin-top:.3rem;font-weight:500;text-transform:uppercase;letter-spacing:.5px}
.charts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(400px,100%),1fr));gap:1rem;margin:1rem 0}
.bar-chart{margin-top:.5rem;background:var(--card);padding:1rem;border-radius:var(--radius);border:1px solid var(--border)}
.bar-chart h4{margin-bottom:.8rem;font-size:.9rem}
.bar-row{display:flex;align-items:center;gap:.8rem;margin-bottom:.5rem;font-size:.82rem}
.bar-row .bar-label{width:120px;text-align:right;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-row .bar{flex:1;height:22px;background:var(--bg);border-radius:4px;overflow:hidden;position:relative}
.bar-row .bar-fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-hover));border-radius:4px;transition:width .3s}
.bar-row .bar-value{position:absolute;right:6px;top:2px;font-size:.75rem;color:var(--text)}

/* Projects */
.project-group{margin-bottom:1.2rem;background:var(--card);backdrop-filter:blur(12px);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;animation:cardIn .3s ease both}
.project-group h4{padding:.8rem 1.2rem;background:rgba(255,255,255,.02);font-family:var(--font-display);font-size:.9rem;color:var(--text);border-bottom:1px solid var(--border)}
.project-group h4 span{color:var(--muted);font-weight:normal;font-size:.78rem}
.project-type-group{padding:.5rem 1.2rem}
.project-type-label{font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.8px;padding:.3rem 0;margin-top:.3rem}
.project-items{display:flex;flex-wrap:wrap;gap:.35rem;padding:.3rem 0 .5rem}
.project-item{padding:.35rem .75rem;font-size:.82rem;cursor:pointer;border-radius:6px;transition:all .2s;background:rgba(255,255,255,.03);border:1px solid var(--border)}
.project-item:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,0,0,.2)}

/* Guide */
.guide-content{max-width:100%}
.guide-content h2{color:var(--accent);margin:1.5rem 0 .5rem;font-size:1.2rem}
.guide-content h3{margin:1rem 0 .5rem}
.guide-content p{margin-bottom:.8rem;color:var(--muted)}
.guide-content ul{padding-left:1.5rem;margin-bottom:1rem}
.guide-content li{margin-bottom:.4rem}
.guide-content code{background:var(--bg);padding:2px 6px;border-radius:4px;font-size:.85em}

/* Breadcrumbs */
.breadcrumbs{display:flex;align-items:center;gap:.3rem;font-size:.82rem;color:var(--muted);margin-bottom:.8rem}
.breadcrumbs a{color:var(--accent);text-decoration:none;cursor:pointer}
.breadcrumbs a:hover{text-decoration:underline}
.breadcrumbs .sep{color:var(--border)}

/* Dependencies panel */
.deps-panel{margin-top:1.5rem;border-top:1px solid var(--border);padding-top:1rem}
.deps-panel h3{font-size:.85rem;font-weight:600;margin-bottom:.3rem}
.deps-grid{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.4rem}
.dep-chip{display:inline-flex;align-items:center;gap:.4rem;padding:.3rem .7rem;border-radius:8px;font-size:.78rem;font-weight:500;cursor:pointer;border:1px solid var(--border);background:rgba(255,255,255,.03);transition:all .2s}
.dep-chip:hover{border-color:rgba(255,255,255,.15);transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,0,0,.2)}
.dep-chip .dep-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}

/* Attachments */
.att-list{margin-top:.5rem}
.att-item{display:flex;align-items:center;gap:.5rem;padding:.3rem .5rem;font-size:.82rem;border-radius:4px;transition:background .15s}
.att-item:hover{background:var(--card)}
.att-item a{color:var(--accent);text-decoration:none}
.att-item a:hover{text-decoration:underline}

/* Version diff */
.diff-view{margin-top:1rem;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;font-family:var(--font-display);font-size:.78rem;overflow-x:auto;max-height:400px;overflow-y:auto}
.diff-add{color:var(--success);background:rgba(46,204,113,.08)}
.diff-del{color:var(--danger);background:rgba(231,76,60,.08)}

/* Global search results */
.search-results{padding:0}
.search-group{margin-bottom:1.2rem}
.search-group h3{font-size:.9rem;color:var(--muted);margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.5px}

/* Push preview */
.push-tabs{display:flex;gap:0;margin-bottom:.5rem}
.push-tab{padding:.4rem 1rem;font-size:.82rem;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--muted);transition:all .15s}
.push-tab:first-child{border-radius:6px 0 0 6px}
.push-tab:last-child{border-radius:0 6px 6px 0}
.push-tab.active{background:var(--accent);color:#fff;border-color:var(--accent)}

/* Bulk select */
.card-select{position:absolute;top:.6rem;right:.6rem;width:18px;height:18px;border-radius:4px;border:2px solid var(--border);background:var(--bg);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.7rem;transition:all .15s;z-index:1}
.card-select.checked{background:var(--accent);border-color:var(--accent);color:#fff}
.card{position:relative}

/* Graph view */
.graph-container{position:relative;width:100%;height:calc(100vh - 120px);background:radial-gradient(ellipse at center,var(--graph-center) 0%,var(--graph-edge) 70%);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.graph-container svg{width:100%;height:100%}
.graph-legend{position:absolute;top:.8rem;right:.8rem;background:var(--surface);backdrop-filter:blur(12px);border:1px solid var(--border);border-radius:var(--radius);padding:.6rem .8rem;font-size:.75rem;display:flex;flex-direction:column;gap:.3rem;opacity:.9}
.graph-legend-item{display:flex;align-items:center;gap:.5rem}
.graph-legend-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.graph-controls{display:flex;gap:.5rem;margin-bottom:.8rem;align-items:center;flex-wrap:wrap}

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
.theme-toggle{background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:.9rem;cursor:pointer;color:var(--muted);transition:all .25s}
.theme-toggle:hover{border-color:var(--accent);color:var(--accent);transform:rotate(15deg)}

/* Responsive */
@media(max-width:768px){
  .sidebar{transform:translateX(-100%)}
  .sidebar.open{transform:translateX(0)}
  .sidebar.open~.sidebar-overlay{display:block}
  .main-content{margin-left:0;max-width:100vw}
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
      <div class="nav-label">Explore</div>
      <a href="#" data-view="browse" class="active"><span class="icon">&#9670;</span>Browse</a>
      <a href="#" data-view="projects"><span class="icon">&#9638;</span>Projects</a>
      <a href="#" data-view="graph"><span class="icon">&#10070;</span>Graph</a>
      <a href="#" data-view="guide"><span class="icon">&#9733;</span>Guide</a>
      <div class="nav-label">Create</div>
      <a href="#" data-view="push"><span class="icon">&#10138;</span>Push</a>
      <div class="nav-label">Monitor</div>
      <a href="#" data-view="metrics"><span class="icon">&#9636;</span>Metrics</a>
      <a href="#" data-view="audit" id="nav-audit"><span class="icon">&#9783;</span>Audit</a>
      <a href="#" data-view="blocked" id="nav-blocked"><span class="icon">&#9888;</span>Blocked</a>
      <a href="#" data-view="admin" id="nav-admin"><span class="icon">&#9881;</span>Admin</a>
    </nav>
    <div class="user-section" id="user-section"></div>
  </aside>
  <div class="sidebar-overlay" id="sidebar-overlay"></div>

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
  user:null,token:null,isAdmin:false,projectFilter:null,
  selected:new Set(),bulkMode:false,attachments:null,diffVersions:null
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
    case'trending':list.sort((a,b)=>{
      const sa=((b.pulls||0)*2+(b.avg_rating||0)*10+(b.comment_count||0)*3);
      const sb=((a.pulls||0)*2+(a.avg_rating||0)*10+(a.comment_count||0)*3);
      return sa-sb;
    });break;
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
  \$('sidebar-overlay').style.display='none';
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
  }catch(e){state.token=null;toast(e.message==='Failed to fetch'?'Cannot reach server — is it running?':'Login failed: '+e.message,'error');}
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
    case'graph':renderGraph(el);break;
    case'guide':renderGuide(el);break;
    case'admin':renderAdmin(el);break;
    default:renderBrowse(el);
  }
}

// --- Browse ---
let _cardIdx=0;
function renderCard(i,type){
  const typeColorMap={agents:'var(--type-agents)',skills:'var(--type-skills)',rules:'var(--type-rules)',memories:'var(--type-memories)',prompts:'var(--type-prompts)'};
  const tags=(i.tags||[]).slice(0,3).map(t=>'<span class="tag">'+esc(t)+'</span>').join('');
  const stars=i.avg_rating?renderStars(Math.round(i.avg_rating)):'';
  const pullsLabel=i.pulls?'\\u2193 '+i.pulls:'';
  const selKey=type+'/'+i.name;
  const color=typeColorMap[type]||'var(--accent)';
  const delay=Math.min(_cardIdx*0.04,0.8);_cardIdx++;
  let h='<div class="card" style="border-left-color:'+color+';animation-delay:'+delay+'s" onclick="showDetailTyped(\\''+esc(type)+'\\',\\''+esc(i.name).replace(/'/g,"\\\\'")+'\\')">';
  if(state.bulkMode)h+='<div class="card-select'+(state.selected.has(selKey)?' checked':'')+'" onclick="event.stopPropagation();toggleSelect(\\''+esc(selKey)+'\\')">'+(state.selected.has(selKey)?'\\u2713':'')+'</div>';
  h+='<h3>'+esc(i.name)+'</h3><p>'+esc(i.description||'')+'</p>';
  h+='<div class="card-meta">'+tags+'</div>';
  h+='<div class="card-footer">'+stars+(pullsLabel?' <span style="color:var(--muted);margin-left:.5rem">'+pullsLabel+'</span>':'')+'<span style="font-family:var(--font-display);font-size:.7rem">'+(i.version?'v'+esc(i.version):'')+(i.owner?' \\u00b7 '+esc(i.owner):'')+'</span></div>';
  h+='</div>';
  return h;
}

function renderBrowse(el){
  if(state.detail)return renderDetail(el);
  _cardIdx=0;

  // Global search mode — show results across all types
  if(state.searchTerm&&state.searchTerm.length>=2){
    let html='<div class="breadcrumbs"><a onclick="clearSearch()">Browse</a><span class="sep">\\u203a</span><span>Search: '+esc(state.searchTerm)+'</span></div>';
    let totalResults=0;
    html+='<div class="search-results">';
    TYPES.forEach(t=>{
      const matches=filterItems(state.allItems[t]||[]);
      if(!matches.length)return;
      totalResults+=matches.length;
      html+='<div class="search-group"><h3>'+t+' ('+matches.length+')</h3><div class="card-grid">';
      sortItems(matches).forEach(i=>{html+=renderCard(i,t);});
      html+='</div></div>';
    });
    if(!totalResults)html+='<div class="empty-state"><div class="icon">\\u2315</div><p>No results for "'+esc(state.searchTerm)+'"</p></div>';
    html+='</div>';
    el.innerHTML=html;
    return;
  }

  const items=sortItems(filterItems(state.allItems[state.currentType]||[]));
  // Breadcrumbs
  let html='<div class="breadcrumbs"><span>Browse</span><span class="sep">\\u203a</span><span>'+state.currentType+'</span></div>';
  html+='<div class="type-tabs">';
  TYPES.forEach(t=>{html+='<button class="type-tab'+(t===state.currentType?' active':'')+'" data-type="'+t+'" onclick="switchType(\\''+t+'\\')">'+t+' ('+(state.allItems[t]||[]).length+')</button>';});
  html+='</div>';
  html+='<div class="sort-bar"><span>Sort by:</span><select onchange="changeSort(this.value)">';
  ['name','date','rating','pulls','trending'].forEach(s=>{html+='<option value="'+s+'"'+(state.sortBy===s?' selected':'')+'>'+s+'</option>';});
  html+='</select>';
  html+='<button class="btn btn-sm" style="margin-left:.5rem" onclick="toggleBulkMode()">'+(state.bulkMode?'\\u2716 Cancel':'\\u2610 Select')+'</button>';
  if(state.bulkMode&&state.selected.size)html+='<button class="btn btn-sm btn-primary" style="margin-left:.3rem" onclick="exportSelected()">\\u2193 Export ('+state.selected.size+')</button>';
  html+='<span class="count">'+items.length+' artifacts</span></div>';
  if(!items.length){
    html+='<div class="empty-state"><div class="icon">\\u2205</div><p>No artifacts found</p></div>';
  }else{
    html+='<div class="card-grid">';
    items.forEach(i=>{html+=renderCard(i,state.currentType);});
    html+='</div>';
  }
  el.innerHTML=html;
}

window.clearSearch=function(){state.searchTerm='';\$('search').value='';render();};
window.showDetailTyped=async function(type,name){
  state.currentType=type;
  showDetail(name);
};

window.switchType=function(t){state.currentType=t;render();};
window.changeSort=function(s){state.sortBy=s;render();};
window.toggleBulkMode=function(){state.bulkMode=!state.bulkMode;if(!state.bulkMode)state.selected=new Set();render();};
window.toggleSelect=function(key){if(state.selected.has(key))state.selected.delete(key);else state.selected.add(key);render();};
window.exportSelected=function(){
  const bundle={version:'1.0.0',exported:new Date().toISOString(),artifacts:[]};
  state.selected.forEach(key=>{
    const[type,name]=key.split('/');
    const item=(state.allItems[type]||[]).find(i=>i.name===name);
    if(item)bundle.artifacts.push({type:type.slice(0,-1),name:item.name,version:item.version,description:item.description,tags:item.tags,meta:item.meta,body:item.body});
  });
  const blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='ihub-export-'+bundle.artifacts.length+'.json';a.click();
  URL.revokeObjectURL(url);
  toast('Exported '+bundle.artifacts.length+' artifacts','success');
};

window.showDetail=async function(name){
  \$('content').innerHTML='<div class="loading-state"><div class="spinner"></div> Loading...</div>';
  try{
    const r=await api('/'+state.currentType+'/'+encodeURIComponent(name));
    state.detail=await r.json();
    try{const cr=await api('/'+state.currentType+'/'+encodeURIComponent(name)+'/comments');state.comments=await cr.json();}catch{state.comments=null;}
    try{const vr=await api('/'+state.currentType+'/'+encodeURIComponent(name)+'/versions');state.versions=await vr.json();}catch{state.versions=null;}
    try{const ar=await api('/'+state.currentType+'/'+encodeURIComponent(name)+'/attachments');state.attachments=await ar.json();}catch{state.attachments=null;}
    state.diffVersions=null;
  }catch(e){toast('Error loading: '+e.message,'error');return;}
  render();
};

function renderDetail(el){
  const d=state.detail;
  if(!d){renderBrowse(el);return;}
  _reviewRating=0;
  const meta=d.meta||{};
  const tags=(d.tags||[]).map(t=>'<span class="tag">'+esc(t)+'</span>').join(' ');
  const cmts=(state.comments&&(state.comments.comments||state.comments))||[];
  const rating=state.comments?.rating||{};
  const versions=Array.isArray(state.versions)?state.versions:[];
  const attachments=Array.isArray(state.attachments)?state.attachments:[];
  const typeColors={agents:'var(--info)',skills:'var(--success)',rules:'var(--warning)',memories:'var(--accent)',prompts:'#9b59b6'};

  // Breadcrumbs
  let html='<div class="breadcrumbs"><a onclick="backToList()">Browse</a><span class="sep">\\u203a</span><a onclick="backToList()">'+state.currentType+'</a><span class="sep">\\u203a</span><span>'+esc(d.name)+'</span></div>';

  html+='<div class="detail-view">';
  html+='<div class="detail-header"><div><button class="btn btn-sm" onclick="backToList()">\\u2190 Back</button>';
  html+=' <button class="btn btn-sm" onclick="exportSingle()" title="Export as JSON">\\u2193 Export</button>';
  html+='</div><div>';
  if(state.token)html+='<button class="btn btn-danger btn-sm" onclick="confirmDelete(\\''+esc(d.name).replace(/'/g,"\\\\'")+'\\')" title="Delete">\\u2716 Delete</button>';
  html+='</div></div>';
  html+='<h2>'+esc(d.name)+'</h2>';
  html+='<div class="detail-meta">';
  if(d.version)html+='<span>v'+esc(d.version)+'</span>';
  if(d.owner)html+='<span>by '+esc(d.owner)+'</span>';
  if(d.pulls)html+='<span>\\u2193 '+d.pulls+' pulls</span>';
  html+=tags;
  if(rating.average)html+=' '+renderStars(Math.round(rating.average))+' <span style="color:var(--muted)">'+rating.average.toFixed(1)+'/5 ('+(rating.count||0)+' reviews)</span>';
  html+='</div>';
  html+='<div class="detail-body">'+renderMd(d.body||'')+'</div>';

  // Dependencies (#1)
  const REL_FIELDS=[{field:'skills',type:'skills'},{field:'rules',type:'rules'},{field:'memories',type:'memories'},{field:'prompts',type:'prompts'},{field:'compatible_agents',type:'agents'},{field:'applies_to',type:'agents'},{field:'related',type:null}];
  const outgoing=[];
  REL_FIELDS.forEach(rf=>{
    const refs=Array.isArray(d[rf.field])?d[rf.field]:Array.isArray(meta[rf.field])?meta[rf.field]:[];
    refs.forEach(ref=>{
      const t=rf.type||(TYPES.find(tt=>(state.allItems[tt]||[]).some(i=>i.name===ref)));
      if(t)outgoing.push({name:ref,type:t,field:rf.field});
    });
  });
  // Incoming: other artifacts that reference this one
  const incoming=[];
  TYPES.forEach(t=>{
    (state.allItems[t]||[]).forEach(item=>{
      const im=item.meta||{};
      REL_FIELDS.forEach(rf=>{
        const refs=Array.isArray(item[rf.field])?item[rf.field]:Array.isArray(im[rf.field])?im[rf.field]:[];
        if(refs.includes(d.name))incoming.push({name:item.name,type:t,field:rf.field});
      });
    });
  });

  if(outgoing.length||incoming.length){
    html+='<div class="deps-panel">';
    if(outgoing.length){
      html+='<h3>Uses</h3><div class="deps-grid">';
      outgoing.forEach(dep=>{
        const col=typeColors[dep.type]||'var(--muted)';
        html+='<div class="dep-chip" onclick="navToArtifact(\\''+esc(dep.type)+'\\',\\''+esc(dep.name).replace(/'/g,"\\\\'")+'\\')""><div class="dep-dot" style="background:'+col+'"></div>'+esc(dep.name)+'<span style="font-size:.68rem;color:var(--muted)">'+dep.type.slice(0,-1)+'</span></div>';
      });
      html+='</div>';
    }
    if(incoming.length){
      html+='<h3 style="margin-top:.8rem">Used by</h3><div class="deps-grid">';
      incoming.forEach(dep=>{
        const col=typeColors[dep.type]||'var(--muted)';
        html+='<div class="dep-chip" onclick="navToArtifact(\\''+esc(dep.type)+'\\',\\''+esc(dep.name).replace(/'/g,"\\\\'")+'\\')""><div class="dep-dot" style="background:'+col+'"></div>'+esc(dep.name)+'<span style="font-size:.68rem;color:var(--muted)">'+dep.type.slice(0,-1)+'</span></div>';
      });
      html+='</div>';
    }
    html+='</div>';
  }

  // Attachments (#5)
  if(attachments.length){
    html+='<div class="deps-panel"><h3>Attachments ('+attachments.length+')</h3><div class="att-list">';
    attachments.forEach(a=>{
      const fp=a.filepath||a;
      html+='<div class="att-item"><span>\\ud83d\\udcc4</span><a href="/api/'+state.currentType+'/'+encodeURIComponent(d.name)+'/attachments/'+encodeURIComponent(fp)+'" download>'+esc(fp)+'</a></div>';
    });
    html+='</div></div>';
  }

  // Version history with diff (#3)
  if(versions.length){
    html+='<div class="version-list"><h3>Version History</h3>';
    versions.forEach((v,idx)=>{
      const ver=v.version||v;
      html+='<div class="version-item"><span class="v-num">v'+esc(ver)+'</span><span>'+esc(v.created_at||v.date||'')+'</span>';
      if(idx<versions.length-1){
        const prev=versions[idx+1].version||versions[idx+1];
        html+=' <button class="btn btn-sm" style="padding:.1rem .5rem;font-size:.72rem" onclick="showDiff(\\''+esc(prev)+'\\',\\''+esc(ver)+'\\')">diff</button>';
      }
      html+='</div>';
    });
    html+='</div>';
    if(state.diffVersions)html+=state.diffVersions;
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

window.backToList=function(){
  state.detail=null;state.comments=null;state.versions=null;state.attachments=null;state.diffVersions=null;
  if(state._previousView){state.view=state._previousView;state._previousView=null;document.querySelectorAll('.sidebar nav a').forEach(a=>a.classList.toggle('active',a.dataset.view===state.view));}
  render();
};

window.showDiff=async function(v1,v2){
  try{
    const r1=await api('/'+state.currentType+'/'+encodeURIComponent(state.detail.name)+'?version='+encodeURIComponent(v1));
    const r2=await api('/'+state.currentType+'/'+encodeURIComponent(state.detail.name)+'?version='+encodeURIComponent(v2));
    if(!r1.ok||!r2.ok){toast('Could not load versions','error');return;}
    const d1=await r1.json(),d2=await r2.json();
    const lines1=(d1.body||'').split('\\n'),lines2=(d2.body||'').split('\\n');
    let diffHtml='<div class="diff-view"><div style="margin-bottom:.5rem;font-weight:600">v'+esc(v1)+' \\u2192 v'+esc(v2)+'</div>';
    // Simple line diff
    const maxLen=Math.max(lines1.length,lines2.length);
    for(let i=0;i<maxLen;i++){
      const l1=lines1[i],l2=lines2[i];
      if(l1===l2){diffHtml+='<div>'+esc(l2||'')+'</div>';}
      else{
        if(l1!==undefined)diffHtml+='<div class="diff-del">- '+esc(l1)+'</div>';
        if(l2!==undefined)diffHtml+='<div class="diff-add">+ '+esc(l2)+'</div>';
      }
    }
    diffHtml+='</div>';
    state.diffVersions=diffHtml;
    render();
  }catch(e){toast('Diff failed: '+e.message,'error');}
};

window.exportSingle=function(){
  const d=state.detail;if(!d)return;
  const bundle={version:'1.0.0',exported:new Date().toISOString(),artifacts:[{type:state.currentType.slice(0,-1),name:d.name,version:d.version,description:d.description,tags:d.tags,meta:d.meta,body:d.body}]};
  const blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=d.name+'.json';a.click();
  URL.revokeObjectURL(url);
  toast('Exported '+d.name,'success');
};

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
  const typeColors={agents:'var(--info)',skills:'var(--success)',rules:'var(--warning)',memories:'var(--accent)',prompts:'#9b59b6'};
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
  if(!pnames.length&&!unassigned.length){html+='<div class="empty-state"><p>No projects found</p></div>';el.innerHTML=html;return;}

  function renderProjectGroup(title,items){
    const byType={};
    items.forEach(i=>{if(!byType[i._type])byType[i._type]=[];byType[i._type].push(i)});
    html+='<div class="project-group"><h4>'+esc(title)+' <span>('+items.length+' artifacts)</span></h4>';
    TYPES.forEach(t=>{
      const group=byType[t];
      if(!group||!group.length)return;
      const color=typeColors[t]||'var(--muted)';
      html+='<div class="project-type-group"><div class="project-type-label" style="color:'+color+'">'+t+' ('+group.length+')</div>';
      if(t==='memories'){
        // Sub-group by context_type
        const byCt={};
        group.forEach(i=>{const ct=(i.meta||{}).context_type||i.context_type||'other';if(!byCt[ct])byCt[ct]=[];byCt[ct].push(i);});
        for(const[ct,mems]of Object.entries(byCt)){
          html+='<div style="font-size:.7rem;color:var(--muted);font-style:italic;padding:.2rem 1rem 0;letter-spacing:.3px">'+esc(ct)+'</div>';
          html+='<div class="project-items">';
          mems.forEach(i=>{
            html+='<div class="project-item" style="border-left:3px solid '+color+'" onclick="navToArtifact(\\''+esc(i._type)+'\\',\\''+esc(i.name).replace(/'/g,"\\\\'")+'\\')"">'+esc(i.name)+'</div>';
          });
          html+='</div>';
        }
      }else{
        html+='<div class="project-items">';
        group.forEach(i=>{
          html+='<div class="project-item" style="border-left:3px solid '+color+'" onclick="navToArtifact(\\''+esc(i._type)+'\\',\\''+esc(i.name).replace(/'/g,"\\\\'")+'\\')"">'+esc(i.name)+'</div>';
        });
        html+='</div>';
      }
      html+='</div>';
    });
    html+='</div>';
  }

  pnames.forEach(p=>renderProjectGroup(p,projects[p]));
  if(unassigned.length)renderProjectGroup('Unassigned',unassigned);
  el.innerHTML=html;
}

window.navToArtifact=function(type,name){
  state.currentType=type;state._previousView=state.view;state.view='browse';
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
  html+='<div class="form-group" style="margin-bottom:1rem"><label style="display:block;font-size:.85rem;color:var(--muted);margin-bottom:.3rem">Body</label>';
  html+='<div class="push-tabs"><button class="push-tab active" onclick="pushTabSwitch(this,\\'write\\')">Write</button><button class="push-tab" onclick="pushTabSwitch(this,\\'preview\\')">Preview</button></div>';
  html+='<textarea id="push-body" rows="8" placeholder="Artifact body content (markdown)" style="width:100%;padding:.7rem;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);resize:vertical"></textarea>';
  html+='<div id="push-preview" class="detail-body" style="display:none;min-height:150px;padding:.7rem;border-radius:6px;border:1px solid var(--border);background:var(--bg)"></div>';
  html+='</div>';
  html+='<button class="btn btn-primary" onclick="doPush()">Push Artifact</button>';
  html+='</div>';
  el.innerHTML=html;
}

window.pushTabSwitch=function(btn,tab){
  document.querySelectorAll('.push-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  const ta=\$('push-body'),pv=\$('push-preview');
  if(tab==='preview'){ta.style.display='none';pv.style.display='block';pv.innerHTML=renderMd(ta.value)||'<p style="color:var(--muted)">Nothing to preview</p>';}
  else{ta.style.display='';pv.style.display='none';}
};

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
    const parsed=parsePrometheus(text);
    const sum=(n)=>(parsed[n]||[]).reduce((s,e)=>s+e.value,0);
    const group=(n,label)=>{const r={};(parsed[n]||[]).forEach(e=>{const k=e.labels[label]||'?';r[k]=(r[k]||0)+e.value});return r};
    const groupTwo=(n,l1,l2)=>{const r={};(parsed[n]||[]).forEach(e=>{const k=(e.labels[l1]||'?')+'/'+(e.labels[l2]||'?');r[k]=(r[k]||0)+e.value});return r};

    let html='<h2>Metrics Dashboard</h2>';
    // Stats cards
    const stats=[
      {label:'Users',value:sum('ihub_users_count'),color:'var(--info)'},
      {label:'Entries',value:sum('ihub_entries_count'),color:'var(--success)'},
      {label:'Comments',value:sum('ihub_comments_count'),color:'var(--accent)'},
      {label:'Pushes',value:sum('ihub_push_total'),color:'var(--warning)'},
      {label:'Pulls',value:sum('ihub_pull_total'),color:'var(--success)'},
      {label:'Views',value:sum('ihub_view_total'),color:'var(--info)'},
      {label:'Searches',value:sum('ihub_search_total'),color:'var(--muted)'},
      {label:'Removes',value:sum('ihub_remove_total'),color:'var(--danger)'},
    ];
    html+='<div class="metrics-grid">';
    stats.forEach(s=>{html+='<div class="metric-card"><div class="value" style="color:'+s.color+'">'+s.value+'</div><div class="label">'+s.label+'</div></div>'});
    html+='</div>';

    // Security
    const sensitive=sum('ihub_sensitive_detected_total');
    const firewalled=sum('ihub_firewall_blocked_total');
    if(sensitive>0||firewalled>0){
      html+='<div style="display:flex;gap:1rem;margin:1rem 0;flex-wrap:wrap">';
      html+='<div class="metric-card" style="border-color:var(--danger)"><div class="value" style="color:var(--danger)">'+sensitive+'</div><div class="label">Sensitive Detected</div></div>';
      html+='<div class="metric-card" style="border-color:var(--danger)"><div class="value" style="color:var(--danger)">'+firewalled+'</div><div class="label">Firewall Blocked</div></div>';
      html+='</div>';
    }

    // Charts in 2-column grid
    html+='<div class="charts-grid">';
    const charts=[
      ['Entries by Type',group('ihub_entries_count','type')],
      ['Entries by Project',group('ihub_entries_by_project_count','project')],
      ['Pushes by User',group('ihub_push_total','user')],
      ['Pushes by Artifact',groupTwo('ihub_push_total','type','name')],
      ['Views by User',group('ihub_view_total','user')],
      ['Views by Artifact',groupTwo('ihub_view_total','type','name')],
      ['Comments by User',group('ihub_comments_by_user_count','user')],
      ['Comments by Artifact',groupTwo('ihub_comments_by_artifact_count','type','name')],
      ['Pulls by User',group('ihub_pull_total','user')],
      ['HTTP Requests',group('ihub_http_requests_total','method')],
    ];
    charts.forEach(([title,data])=>{
      if(Object.keys(data).length)html+=renderBarChart(title,data);
    });
    html+='</div>';
    el.innerHTML=html;
  }catch(e){el.innerHTML='<div class="empty-state"><div class="icon">\\u26a0</div><p>Could not load metrics: '+esc(e.message)+'</p></div>';}
}

function parsePrometheus(text){
  const parsed={};
  text.split('\\n').forEach(line=>{
    if(!line||line.startsWith('#'))return;
    const m=line.match(/^([a-zA-Z_]+)(?:\\{(.+?)\\})?\\s+([\\d.]+)/);
    if(!m)return;
    const[,name,labelStr,val]=m;
    if(!parsed[name])parsed[name]=[];
    const labels={};
    if(labelStr)(labelStr.match(/[a-zA-Z_]+="[^"]*"/g)||[]).forEach(p=>{const eq=p.indexOf('=');labels[p.slice(0,eq)]=p.slice(eq+2,-1)});
    parsed[name].push({labels,value:parseFloat(val)});
  });
  return parsed;
}

function renderBarChart(title,data){
  const entries=Object.entries(data).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,12);
  if(!entries.length)return'';
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
    const r=await api('/audit?limit=50&offset='+((auditPage-1)*50));
    if(!r.ok)throw new Error('HTTP '+r.status);
    const d=await r.json();
    const entries=d.entries||d.log||d||[];
    const total=d.total||entries.length;
    let html='<h2>Audit Trail</h2>';
    if(!entries.length){html+='<div class="empty-state"><p>No audit entries</p></div>';el.innerHTML=html;return;}
    html+='<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Time</th><th>IP</th><th>User</th><th>Role</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead><tbody>';
    const actionColors={push:'var(--success)',pull:'var(--success)',view:'var(--info)',list:'var(--info)',search:'var(--info)',comment:'var(--accent)',remove:'var(--danger)',backup:'var(--warning)','set-role':'var(--warning)',approve:'var(--success)',register:'var(--warning)','sensitive-blocked':'var(--danger)','change-password':'var(--warning)'};
    entries.forEach(e=>{
      const ac=actionColors[e.action]||'var(--muted)';
      const roleBadge=e.role==='admin'?'<span style="background:var(--danger);color:#fff;padding:1px 6px;border-radius:3px;font-size:.7rem">ADM</span>':'<span style="background:var(--info);color:#fff;padding:1px 6px;border-radius:3px;font-size:.7rem">USR</span>';
      const target=(e.type&&e.name)?'<span style="color:var(--warning)">'+esc(e.type)+'/'+esc(e.name)+'</span>':'';
      html+='<tr><td style="white-space:nowrap;color:var(--muted);font-size:.8rem">'+esc(e.created_at||'')+'</td><td style="color:var(--muted);font-size:.8rem">'+esc(e.ip||'')+'</td><td style="color:var(--accent);font-weight:600">'+esc(e.username||'anon')+'</td><td>'+roleBadge+'</td><td><span style="color:'+ac+';font-weight:600;text-transform:uppercase">'+esc(e.action||'')+'</span></td><td>'+target+'</td><td style="color:var(--muted);font-size:.82rem">'+esc((e.detail||'').substring(0,80))+'</td></tr>';
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
      const reason=i.reason||i.meta?._blockReason||(i.status==='blocked'?'Sensitive data detected':'');
      html+='<tr><td>'+esc(i.type||'')+'</td><td>'+esc(i.name||'')+'</td><td>'+esc(i.owner||'')+'</td><td>'+esc(reason)+'</td><td><button class="btn btn-sm btn-primary" onclick="approveArtifact(\\''+esc(i.type)+'\\',\\''+esc(i.name).replace(/'/g,"\\\\'")+'\\')"">Approve</button></td></tr>';
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

// --- Graph ---
function renderGraph(el){
  const typeColors={agents:'#3498db',skills:'#2ecc71',rules:'#f39c12',memories:'#e94560',prompts:'#9b59b6'};
  const REL_FIELDS=[
    {field:'skills',targetType:'skills'},
    {field:'rules',targetType:'rules'},
    {field:'memories',targetType:'memories'},
    {field:'prompts',targetType:'prompts'},
    {field:'compatible_agents',targetType:'agents'},
    {field:'applies_to',targetType:'agents'},
    {field:'related',targetType:null},
  ];

  // Build nodes and edges
  const nodes=[];const nodeMap={};const edges=[];
  for(const t of TYPES){
    (state.allItems[t]||[]).forEach(item=>{
      const id=t+'/'+item.name;
      const node={id,name:item.name,type:t,x:0,y:0,vx:0,vy:0};
      nodes.push(node);nodeMap[id]=node;
    });
  }

  for(const t of TYPES){
    (state.allItems[t]||[]).forEach(item=>{
      const srcId=t+'/'+item.name;
      for(const rel of REL_FIELDS){
        const refs=Array.isArray(item[rel.field])?item[rel.field]:Array.isArray((item.meta||{})[rel.field])?(item.meta||{})[rel.field]:[];
        for(const ref of refs){
          let tgtId=null;
          if(rel.targetType){tgtId=rel.targetType+'/'+ref;}
          else{for(const tt of TYPES){if(nodeMap[tt+'/'+ref]){tgtId=tt+'/'+ref;break;}}}
          if(tgtId&&nodeMap[tgtId]&&srcId!==tgtId){
            edges.push({source:srcId,target:tgtId,label:rel.field});
          }
        }
      }
    });
  }

  if(!nodes.length){el.innerHTML='<h2>Artifact Graph</h2><div class="empty-state"><div class="icon">\\u2205</div><p>No artifacts to graph</p></div>';return;}

  let html='<h2>Artifact Graph</h2>';
  html+='<div class="graph-controls">';
  html+='<span style="font-size:.85rem;color:var(--muted)">'+nodes.length+' artifacts, '+edges.length+' connections</span>';
  html+='<button class="btn btn-sm" onclick="graphCenter()" title="Re-center graph">\\u2316 Center</button>';
  html+='</div>';
  html+='<div class="graph-container" id="graph-box">';
  html+='<svg id="graph-svg"></svg>';
  html+='<div id="graph-info" style="position:absolute;top:0;left:0;bottom:0;width:260px;background:var(--surface);backdrop-filter:blur(16px);border-right:1px solid var(--border);padding:.8rem;font-size:.8rem;display:none;overflow-y:auto;z-index:2"></div>';
  html+='<div class="graph-legend">';
  for(const t of TYPES)html+='<div class="graph-legend-item"><div class="graph-legend-dot" style="background:'+typeColors[t]+'"></div>'+t+'</div>';
  html+='</div></div>';
  el.innerHTML=html;

  // Force-directed simulation
  const svg=document.getElementById('graph-svg');
  const box=document.getElementById('graph-box');
  const W=box.clientWidth,H=box.clientHeight;
  const PANEL_W=260;
  let cx=W/2,cy=H/2;

  // Init positions in a circle
  nodes.forEach((n,i)=>{
    const angle=(2*Math.PI*i)/nodes.length;
    const r=Math.min(W,H)*0.35;
    n.x=cx+r*Math.cos(angle);
    n.y=cy+r*Math.sin(angle);
  });

  // Radius based on connections
  const connCount={};
  edges.forEach(e=>{connCount[e.source]=(connCount[e.source]||0)+1;connCount[e.target]=(connCount[e.target]||0)+1;});
  function nodeRadius(id){return Math.min(32,Math.max(12,8+(connCount[id]||0)*3));}

  // Simulation parameters
  const REPULSION=4000,SPRING=0.008,SPRING_LEN=150,DAMPING=0.75,CENTER=0.005;
  let simRunning=true;let simFrames=0;const MAX_FRAMES=250;

  // Run simulation synchronously to compute final layout before first paint
  for(let i=0;i<300;i++){
    for(let a=0;a<nodes.length;a++){
      for(let b=a+1;b<nodes.length;b++){
        let dx=nodes[b].x-nodes[a].x,dy=nodes[b].y-nodes[a].y;
        let dist=Math.sqrt(dx*dx+dy*dy)||1;
        let f=REPULSION/(dist*dist);
        let fx=f*dx/dist,fy=f*dy/dist;
        nodes[a].vx-=fx;nodes[a].vy-=fy;
        nodes[b].vx+=fx;nodes[b].vy+=fy;
      }
    }
    for(const e of edges){
      const s=nodeMap[e.source],t=nodeMap[e.target];
      if(!s||!t)continue;
      let dx=t.x-s.x,dy=t.y-s.y;
      let dist=Math.sqrt(dx*dx+dy*dy)||1;
      let f=SPRING*(dist-SPRING_LEN);
      let fx=f*dx/dist,fy=f*dy/dist;
      s.vx+=fx;s.vy+=fy;
      t.vx-=fx;t.vy-=fy;
    }
    for(const n of nodes){
      n.vx+=(cx-n.x)*CENTER;
      n.vy+=(cy-n.y)*CENTER;
      n.vx*=DAMPING;n.vy*=DAMPING;
      n.x+=n.vx;n.y+=n.vy;
      const pad=20;
      n.x=Math.max(pad,Math.min(W-pad,n.x));
      n.y=Math.max(pad,Math.min(H-pad,n.y));
    }
  }
  // Zero velocities so layout is stable
  for(const n of nodes){n.vx=0;n.vy=0;}
  simFrames=MAX_FRAMES;simRunning=false;

  function simulate(){
    if(!simRunning)return;
    // Repulsion
    for(let i=0;i<nodes.length;i++){
      for(let j=i+1;j<nodes.length;j++){
        let dx=nodes[j].x-nodes[i].x,dy=nodes[j].y-nodes[i].y;
        let dist=Math.sqrt(dx*dx+dy*dy)||1;
        let f=REPULSION/(dist*dist);
        let fx=f*dx/dist,fy=f*dy/dist;
        nodes[i].vx-=fx;nodes[i].vy-=fy;
        nodes[j].vx+=fx;nodes[j].vy+=fy;
      }
    }
    // Spring (edges)
    for(const e of edges){
      const s=nodeMap[e.source],t=nodeMap[e.target];
      if(!s||!t)continue;
      let dx=t.x-s.x,dy=t.y-s.y;
      let dist=Math.sqrt(dx*dx+dy*dy)||1;
      let f=SPRING*(dist-SPRING_LEN);
      let fx=f*dx/dist,fy=f*dy/dist;
      s.vx+=fx;s.vy+=fy;
      t.vx-=fx;t.vy-=fy;
    }
    // Center gravity
    for(const n of nodes){
      n.vx+=(cx-n.x)*CENTER;
      n.vy+=(cy-n.y)*CENTER;
    }
    // Update positions
    let maxV=0;
    for(const n of nodes){
      if(n._dragging)continue;
      n.vx*=DAMPING;n.vy*=DAMPING;
      n.x+=n.vx;n.y+=n.vy;
      const pad=20;
      const leftEdge=selectedId?(PANEL_W+pad):pad;
      n.x=Math.max(leftEdge,Math.min(W-pad,n.x));
      n.y=Math.max(pad,Math.min(H-pad,n.y));
      const v=Math.abs(n.vx)+Math.abs(n.vy);
      if(v>maxV)maxV=v;
    }
    drawGraph();
    simFrames++;
    // Stop early when settled
    if(maxV<0.3){simFrames=MAX_FRAMES;simRunning=false;return;}
    if(simFrames<MAX_FRAMES)requestAnimationFrame(simulate);
  }

  // Selection state
  let selectedId=null;
  let neighbors=new Set();

  // Build adjacency lookup
  const adjacency={};
  edges.forEach(e=>{
    if(!adjacency[e.source])adjacency[e.source]=new Set();
    if(!adjacency[e.target])adjacency[e.target]=new Set();
    adjacency[e.source].add(e.target);
    adjacency[e.target].add(e.source);
  });

  function selectNode(id){
    const info=document.getElementById('graph-info');
    if(selectedId===id){
      selectedId=null;neighbors=new Set();info.style.display='none';
      cx=W/2;
      // Nudge nodes back gently
      simFrames=Math.max(0,MAX_FRAMES-40);simRunning=true;simulate();
      return;
    }
    selectedId=id;neighbors=adjacency[id]||new Set();
    const n=nodeMap[id];
    const nbrs=[...neighbors].map(nid=>nodeMap[nid]).filter(Boolean);
    const byType={};
    nbrs.forEach(nb=>{if(!byType[nb.type])byType[nb.type]=[];byType[nb.type].push(nb.name);});
    // Look up memory context_types from loaded data
    const memContextTypes={};
    (state.allItems['memories']||[]).forEach(m=>{
      const ct=(m.meta||{}).context_type||m.context_type||'';
      if(ct)memContextTypes[m.name]=ct;
    });
    let h='<div style="font-weight:700;font-size:1rem;color:'+typeColors[n.type]+';margin-bottom:.2rem">'+esc(n.name)+'</div>';
    h+='<div style="color:var(--muted);margin-bottom:.6rem;font-size:.78rem">'+n.type.slice(0,-1)+' \\u00b7 '+neighbors.size+' connections</div>';
    for(const[t,names]of Object.entries(byType)){
      h+='<div style="color:'+typeColors[t]+';font-size:.72rem;font-weight:600;text-transform:uppercase;margin-top:.5rem;letter-spacing:.5px">'+t+'</div>';
      if(t==='memories'){
        // Sub-group by context_type
        const byCt={};
        names.forEach(nm=>{const ct=memContextTypes[nm]||'other';if(!byCt[ct])byCt[ct]=[];byCt[ct].push(nm);});
        for(const[ct,mems]of Object.entries(byCt)){
          h+='<div style="color:var(--muted);font-size:.68rem;font-style:italic;margin-top:.3rem;margin-left:.4rem">'+esc(ct)+'</div>';
          mems.forEach(nm=>{
            h+='<div style="color:var(--text);font-size:.82rem;padding:.15rem 0;padding-left:.4rem;cursor:pointer" onclick="selectNode(\\'memories/'+esc(nm).replace(/'/g,"\\\\'")+'\\')"">\\u2022 '+esc(nm)+'</div>';
          });
        }
      }else{
        names.forEach(nm=>{
          h+='<div style="color:var(--text);font-size:.82rem;padding:.15rem 0;cursor:pointer" onclick="selectNode(\\''+t+'/'+esc(nm).replace(/'/g,"\\\\'")+'\\')"">\\u2022 '+esc(nm)+'</div>';
        });
      }
    }
    h+='<div style="color:var(--muted);font-size:.7rem;margin-top:.8rem;border-top:1px solid var(--border);padding-top:.5rem">click node to deselect<br>double-click to open detail</div>';
    info.innerHTML=h;info.style.display='block';
    // Shift center of gravity to account for panel
    cx=(W+PANEL_W)/2;
    // Push overlapping nodes out of panel area
    for(const nd of nodes){
      if(nd.x<PANEL_W+20){nd.x=PANEL_W+20+Math.random()*40;nd.vx=2;}
    }
    simFrames=Math.max(0,MAX_FRAMES-40);simRunning=true;simulate();
  }
  window.selectNode=function(id){selectNode(id);};

  // Read CSS variables once for graph rendering
  const cs=getComputedStyle(document.documentElement);
  const graphText=cs.getPropertyValue('--graph-text').trim()||'#d0d0e0';
  const graphLine=cs.getPropertyValue('--graph-line').trim()||'rgba(255,255,255,.12)';
  const graphStroke=cs.getPropertyValue('--graph-node-stroke').trim()||'rgba(10,10,20,.8)';
  const graphBg=cs.getPropertyValue('--graph-center').trim()||'rgba(20,20,40,.9)';

  function drawGraph(){
    let s='';
    const hasSelection=!!selectedId;
    const active=new Set();
    if(hasSelection){active.add(selectedId);neighbors.forEach(n=>active.add(n));}

    // Edges
    for(const e of edges){
      const src=nodeMap[e.source],tgt=nodeMap[e.target];
      if(!src||!tgt)continue;
      const edgeActive=hasSelection&&(e.source===selectedId||e.target===selectedId);
      const col=edgeActive?typeColors[nodeMap[selectedId].type]||'var(--accent)':graphLine;
      const w=edgeActive?2.5:1;
      const op=hasSelection?(edgeActive?0.85:0.06):0.35;
      s+='<line x1="'+src.x+'" y1="'+src.y+'" x2="'+tgt.x+'" y2="'+tgt.y+'" stroke="'+col+'" stroke-width="'+w+'" opacity="'+op+'"/>';
    }
    // Nodes
    for(const n of nodes){
      const isSelected=n.id===selectedId;
      const isNeighbor=neighbors.has(n.id);
      const highlight=!hasSelection||isSelected||isNeighbor;
      const scale=isSelected?1.5:isNeighbor?1.25:1;
      const r=nodeRadius(n.id)*scale;
      const col=typeColors[n.type]||'var(--muted)';
      const op=highlight?1:0.15;
      const strokeCol=isSelected?'#fff':isNeighbor?graphText:graphStroke;
      const strokeW=isSelected?3:isNeighbor?2.5:2;
      // Drop shadow for readability
      if(highlight)s+='<circle cx="'+n.x+'" cy="'+(n.y+1)+'" r="'+(r+1)+'" fill="rgba(0,0,0,.2)" style="pointer-events:none"/>';
      s+='<circle cx="'+n.x+'" cy="'+n.y+'" r="'+r+'" fill="'+col+'" stroke="'+strokeCol+'" stroke-width="'+strokeW+'" style="cursor:pointer" data-id="'+esc(n.id)+'" opacity="'+op+'"/>';
      // Label with background for readability
      const fs=isSelected?14:isNeighbor?12:(r/scale)>18?12:(r/scale)>12?10:9;
      const fontW=isSelected||isNeighbor?700:500;
      const textOp=highlight?1:0.12;
      const ly=n.y+r+fs+3;
      // Text outline for readability on light backgrounds
      if(highlight){s+='<text x="'+n.x+'" y="'+ly+'" text-anchor="middle" stroke="'+graphBg+'" stroke-width="4" font-size="'+fs+'px" font-weight="'+fontW+'" font-family="var(--font-display)" style="pointer-events:none;paint-order:stroke" opacity="'+textOp+'">'+esc(n.name)+'</text>';}
      s+='<text x="'+n.x+'" y="'+ly+'" text-anchor="middle" fill="'+graphText+'" font-size="'+fs+'px" font-weight="'+fontW+'" font-family="var(--font-display)" style="pointer-events:none" opacity="'+textOp+'">'+esc(n.name)+'</text>';
    }
    svg.innerHTML=s;
  }

  // Hit-test: find nearest node to a point within its radius
  function hitTest(px,py){
    let best=null,bestDist=Infinity;
    for(const n of nodes){
      const dx=n.x-px,dy=n.y-py;
      const dist=Math.sqrt(dx*dx+dy*dy);
      const r=nodeRadius(n.id)*(n.id===selectedId?1.5:neighbors.has(n.id)?1.25:1);
      if(dist<=r&&dist<bestDist){best=n;bestDist=dist;}
    }
    return best;
  }
  function svgCoords(e){
    const rect=box.getBoundingClientRect();
    return{x:e.clientX-rect.left,y:e.clientY-rect.top};
  }

  // Drag handling
  let dragNode=null,dragStartX=0,dragStartY=0,didDrag=false;
  const DRAG_THRESHOLD=5;
  svg.addEventListener('mousedown',function(e){
    const p=svgCoords(e);
    const n=hitTest(p.x,p.y);
    if(!n)return;
    dragNode=n;n._dragging=true;didDrag=false;
    dragStartX=e.clientX;dragStartY=e.clientY;
    e.preventDefault();
  });
  document.addEventListener('mousemove',function(e){
    if(!dragNode)return;
    const dx=e.clientX-dragStartX,dy=e.clientY-dragStartY;
    if(!didDrag&&Math.sqrt(dx*dx+dy*dy)<DRAG_THRESHOLD)return;
    didDrag=true;
    const rect=box.getBoundingClientRect();
    dragNode.x=e.clientX-rect.left;
    dragNode.y=e.clientY-rect.top;
    if(!simRunning||simFrames>=MAX_FRAMES){drawGraph();}
  });
  document.addEventListener('mouseup',function(){
    if(dragNode){
      dragNode._dragging=false;
      if(didDrag&&simFrames>=MAX_FRAMES){simFrames=MAX_FRAMES-30;simRunning=true;simulate();}
      dragNode=null;
    }
  });
  // Click to select, double-click to navigate
  let _lastClickId=null,_lastClickTime=0;
  svg.addEventListener('click',function(e){
    if(didDrag){didDrag=false;return;}
    const p=svgCoords(e);
    const hit=hitTest(p.x,p.y);
    if(!hit){selectedId=null;neighbors=new Set();cx=W/2;document.getElementById('graph-info').style.display='none';drawGraph();return;}
    const id=hit.id;
    const now=Date.now();
    if(id===_lastClickId&&now-_lastClickTime<400){
      const parts=id.split('/');if(parts.length>=2)navToArtifact(parts[0],parts[1]);
      return;
    }
    _lastClickId=id;_lastClickTime=now;
    selectNode(id);
  });

  centerGraph();

  // Center: compute bounding box of all nodes, scale to fit, and translate to viewport center
  function centerGraph(){
    const curW=box.clientWidth,curH=box.clientHeight;
    if(!nodes.length)return;
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const n of nodes){
      const r=nodeRadius(n.id);
      if(n.x-r<minX)minX=n.x-r;if(n.x+r>maxX)maxX=n.x+r;
      if(n.y-r<minY)minY=n.y-r;if(n.y+r>maxY)maxY=n.y+r;
    }
    const graphW=maxX-minX||1,graphH=maxY-minY||1;
    const graphCx=(minX+maxX)/2,graphCy=(minY+maxY)/2;
    const panelOffset=selectedId?PANEL_W:0;
    const pad=60;
    const availW=curW-panelOffset-pad,availH=curH-pad;
    // Scale to fit — always shrink if graph exceeds available space
    const scale=Math.min(1,availW/graphW,availH/graphH)*0.92;
    const targetCx=panelOffset+(curW-panelOffset)/2,targetCy=curH/2;
    for(const n of nodes){
      n.x=targetCx+(n.x-graphCx)*scale;
      n.y=targetCy+(n.y-graphCy)*scale;
      n.vx=0;n.vy=0;
    }
    cx=targetCx;cy=targetCy;
    drawGraph();
  }
  window.graphCenter=centerGraph;

  // Re-center on resize
  window.addEventListener('resize',function(){
    if(state.view!=='graph')return;
    centerGraph();
  });
}

// --- Guide ---
function renderGuide(el){
  let html='<h2>Artifact Types Guide</h2>';
  html+='<div class="charts-grid">';

  // Artifact types
  const types=[
    {name:'Agent',icon:'\\u25c6',color:'var(--info)',q:'Who does the work?',desc:'An actor with capabilities, inputs, outputs. Orchestrates skills and follows rules.',ex:'code-reviewer, migration-assistant, security-scanner'},
    {name:'Skill',icon:'\\u25b6',color:'var(--success)',q:'How to do X?',desc:'A reusable action or procedure. Has triggers, args, and can be shared across agents.',ex:'test-generator, db-migration, changelog-gen'},
    {name:'Rule',icon:'\\u25a0',color:'var(--warning)',q:'What must be enforced?',desc:'A constraint or policy. Has scope (global/project) and severity (error/warning/info).',ex:'no-any-type, require-tests, semantic-commits'},
    {name:'Memory',icon:'\\u25cf',color:'var(--accent)',q:'What do we know?',desc:'Knowledge and context that persists across sessions. NOT actions or constraints.',ex:'adr-001-database-choice, system-topology, incident-2026-04'},
    {name:'Prompt',icon:'\\u25b2',color:'#9b59b6',q:'What should the AI say?',desc:'A reusable instruction template for AI models. Has variables and expected output.',ex:'code-review-feedback, debug-assistant, write-tests'},
  ];
  types.forEach(t=>{
    html+='<div class="bar-chart" style="border:1px solid var(--border);padding:1.2rem;border-radius:var(--radius)">';
    html+='<h4 style="color:'+t.color+'">'+t.icon+' '+t.name+' <span style="color:var(--muted);font-weight:normal;font-size:.85rem">\\u2014 \\u201c'+t.q+'\\u201d</span></h4>';
    html+='<p style="margin:.5rem 0;font-size:.9rem">'+t.desc+'</p>';
    html+='<p style="font-size:.82rem;color:var(--muted)">Examples: '+t.ex+'</p>';
    html+='</div>';
  });
  html+='</div>';

  // Boundaries table
  html+='<h3 style="margin-top:1.5rem">Boundaries</h3>';
  html+='<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Type</th><th>Stores</th><th>Does NOT store</th></tr></thead><tbody>';
  html+='<tr><td style="color:var(--info);font-weight:600">Agent</td><td>Actor, orchestration</td><td style="color:var(--muted)">Knowledge, constraints</td></tr>';
  html+='<tr><td style="color:var(--success);font-weight:600">Skill</td><td>Procedures, how-to</td><td style="color:var(--muted)">Why we do X, what X must follow</td></tr>';
  html+='<tr><td style="color:var(--warning);font-weight:600">Rule</td><td>Constraints, policies</td><td style="color:var(--muted)">Why it was decided, how to implement</td></tr>';
  html+='<tr><td style="color:var(--accent);font-weight:600">Memory</td><td>Knowledge, evidence</td><td style="color:var(--muted)">Actions, constraints, instructions</td></tr>';
  html+='<tr><td style="color:#9b59b6;font-weight:600">Prompt</td><td>AI instructions</td><td style="color:var(--muted)">Execution logic, actor definitions</td></tr>';
  html+='</tbody></table></div>';

  // Memory context types
  html+='<h3 style="margin-top:1.5rem">Memory Context Types</h3>';
  html+='<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Type</th><th>Stores</th><th>Boundary</th><th>Examples</th></tr></thead><tbody>';
  const ctypes=[
    ['decision','Why we chose X over Y','Not a rule (rules enforce; decisions explain)','adr-001-database-choice, adr-002-monorepo'],
    ['architecture','What the system looks like','Not a skill (skills do; architecture describes)','system-topology, data-model-orders'],
    ['incident','What happened, root cause','Not a runbook (runbooks are skills)','incident-2026-04, incident-2026-03-redis'],
    ['domain','What things mean in context','Not a constraint (rules constrain; domain informs)','domain-payments, domain-glossary'],
    ['context','Who, when, where','Not an agent (agents act; context describes)','team-ownership, project-q2-priorities'],
    ['learning','What we measured','Not a policy (rules prescribe; learnings evidence)','learning-caching-strategy, learning-testing-strategy'],
  ];
  ctypes.forEach(([name,stores,boundary,ex])=>{
    html+='<tr><td><code style="color:var(--accent)">'+name+'</code></td><td>'+stores+'</td><td style="color:var(--muted);font-size:.82rem">'+boundary+'</td><td style="font-size:.82rem">'+ex+'</td></tr>';
  });
  html+='</tbody></table></div>';

  // Decision tree
  html+='<h3 style="margin-top:1.5rem">Decision Tree</h3>';
  html+='<div style="background:var(--bg);padding:1.2rem;border-radius:var(--radius);border:1px solid var(--border);font-size:.9rem;line-height:2">';
  html+='Is it a complete workflow? \\u2192 <strong style="color:var(--info)">Agent</strong><br>';
  html+='Is it a reusable action? \\u2192 <strong style="color:var(--success)">Skill</strong><br>';
  html+='Is it a constraint to enforce? \\u2192 <strong style="color:var(--warning)">Rule</strong><br>';
  html+='Is it knowledge to recall? \\u2192 <strong style="color:var(--accent)">Memory</strong><br>';
  html+='Is it an instruction for AI? \\u2192 <strong style="color:#9b59b6">Prompt</strong>';
  html+='</div>';

  // Why "prompts" not "instructions"
  html+='<h3 style="margin-top:1.5rem">Why \\u201cPrompts\\u201d and not \\u201cInstructions\\u201d?</h3>';
  html+='<p style="font-size:.88rem;color:var(--muted);line-height:1.6;max-width:700px">Every artifact type is an instruction to an AI in some sense \\u2014 rules instruct what to enforce, skills instruct how to act, agents instruct who does what. Calling the fifth type \\u201cinstructions\\u201d would blur the line between all of them.</p>';
  html+='<p style="font-size:.88rem;color:var(--text);line-height:1.6;max-width:700px"><strong style="color:#9b59b6">Prompt</strong> is specific: it means the exact text you send to a model \\u2014 with variables, expected output format, and a target model. It answers a question no other type covers: <em>\\u201cWhat do we say to the model?\\u201d</em></p>';
  html+='<h3 style="margin-top:1.5rem">When to use a Prompt</h3>';
  html+='<p style="font-size:.88rem;color:var(--muted);line-height:1.6;max-width:700px">Use a prompt when you need <strong style="color:var(--text)">deterministic, repeatable output</strong> \\u2014 the same template producing the same shape of result every time, just with different inputs. The litmus test: if you can paste the body into a model\\u2019s chat with variables filled in and get a predictable, structured response \\u2014 it\\u2019s a prompt.</p>';
  html+='<div style="background:var(--bg);padding:1rem;border-radius:var(--radius);border:1px solid var(--border);font-size:.85rem;margin-top:.8rem;max-width:700px;line-height:1.8">';
  html+='<strong style="color:var(--muted)">Not a prompt:</strong><br>';
  html+='\\u201cReview code for quality\\u201d \\u2192 too open-ended \\u2192 <strong style="color:var(--info)">Agent</strong><br>';
  html+='\\u201cRun linters on changed files\\u201d \\u2192 an action \\u2192 <strong style="color:var(--success)">Skill</strong><br>';
  html+='\\u201cAlways use semantic commits\\u201d \\u2192 a constraint \\u2192 <strong style="color:var(--warning)">Rule</strong><br>';
  html+='\\u201cWe chose PostgreSQL because...\\u201d \\u2192 knowledge \\u2192 <strong style="color:var(--accent)">Memory</strong>';
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

  // Backup & Restore
  html+='<div class="admin-section"><h3>Backup &amp; Restore</h3>';
  html+='<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem">';
  html+='<button class="btn" onclick="downloadBackup()">\\u2193 SQLite Backup</button>';
  html+='<button class="btn" onclick="downloadFullBackup()">\\u2193 Full JSON Backup</button>';
  html+='</div>';
  html+='<div style="display:flex;gap:1rem;flex-wrap:wrap">';
  html+='<div style="flex:1;min-width:250px;padding:1rem;border:1px dashed var(--border);border-radius:var(--radius);text-align:center">';
  html+='<div style="font-size:.85rem;color:var(--muted);margin-bottom:.5rem">Restore from Backup</div>';
  html+='<div style="font-size:.75rem;color:var(--muted);margin-bottom:.8rem">Upload a .db (SQLite) or .json (full) backup file</div>';
  html+='<input type="file" id="restore-file" accept=".db,.json" style="display:none" onchange="restoreFromFile(this)">';
  html+='<button class="btn btn-primary btn-sm" onclick="document.getElementById(\\'restore-file\\').click()">Choose File &amp; Restore</button>';
  html+='</div>';
  html+='<div style="flex:1;min-width:250px;padding:1rem;border:1px dashed var(--border);border-radius:var(--radius);text-align:center">';
  html+='<div style="font-size:.85rem;color:var(--muted);margin-bottom:.5rem">Import JSON Bundle</div>';
  html+='<div style="font-size:.75rem;color:var(--muted);margin-bottom:.8rem">Upload an export bundle to push all artifacts</div>';
  html+='<input type="file" id="import-file" accept=".json" style="display:none" onchange="importBundleFile(this)">';
  html+='<button class="btn btn-sm" onclick="document.getElementById(\\'import-file\\').click()">Choose Bundle &amp; Import</button>';
  html+='</div>';
  html+='</div></div>';

  // Webhooks
  html+='<div class="admin-section"><h3>Webhooks</h3>';
  html+='<div id="webhooks-list"><div class="loading-state"><div class="spinner"></div></div></div>';
  html+='<div style="margin-top:.8rem;padding-top:.8rem;border-top:1px solid var(--border)">';
  html+='<div style="font-size:.85rem;color:var(--muted);margin-bottom:.5rem">Add Webhook</div>';
  html+='<div style="display:flex;gap:.5rem;align-items:flex-end;flex-wrap:wrap">';
  html+='<div style="flex:1;min-width:200px"><label style="display:block;font-size:.82rem;color:var(--muted)">URL</label><input id="wh-url" placeholder="https://example.com/hook" style="width:100%;padding:.4rem .7rem;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text)"></div>';
  html+='<div><label style="display:block;font-size:.82rem;color:var(--muted)">Events</label><input id="wh-events" placeholder="push,pull,comment" value="*" style="padding:.4rem .7rem;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);width:160px"></div>';
  html+='<div><label style="display:block;font-size:.82rem;color:var(--muted)">Secret (optional)</label><input id="wh-secret" placeholder="hmac-secret" style="padding:.4rem .7rem;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);width:140px"></div>';
  html+='<button class="btn btn-primary btn-sm" onclick="addWebhook()">Add</button>';
  html+='</div></div></div>';

  // Federation
  html+='<div class="admin-section"><h3>Federation</h3>';
  html+='<div id="federation-status"><div class="loading-state"><div class="spinner"></div></div></div>';
  html+='<div style="margin-top:.5rem"><button class="btn btn-sm" onclick="fedSync()">Sync Now</button></div></div>';

  // Config
  html+='<div class="admin-section"><h3>Server Config</h3>';
  html+='<div id="config-view"><div class="loading-state"><div class="spinner"></div></div></div></div>';

  el.innerHTML=html;

  // Load webhooks
  try{
    const r=await api('/webhooks');
    if(r.ok){
      const whs=await r.json();
      if(!whs.length){\$('webhooks-list').innerHTML='<p style="color:var(--muted);font-size:.85rem">No webhooks configured</p>';}
      else{
        let t='<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>ID</th><th>URL</th><th>Events</th><th>Action</th></tr></thead><tbody>';
        whs.forEach(w=>{
          t+='<tr><td style="color:var(--muted)">'+esc(w.id)+'</td><td style="font-size:.82rem;word-break:break-all">'+esc(w.url)+'</td><td><span style="font-size:.78rem;color:var(--accent)">'+esc(w.events||'*')+'</span></td><td><button class="btn btn-danger btn-sm" onclick="deleteWebhook('+w.id+')">Remove</button></td></tr>';
        });
        t+='</tbody></table></div>';
        \$('webhooks-list').innerHTML=t;
      }
    }else{\$('webhooks-list').innerHTML='<p style="color:var(--muted)">Could not load webhooks</p>';}
  }catch{\$('webhooks-list').innerHTML='<p style="color:var(--muted)">Could not load webhooks</p>';}

  // Load federation status
  try{
    const r=await api('/federation/status');
    if(r.ok){
      const fed=await r.json();
      if(!fed.enabled){\$('federation-status').innerHTML='<p style="color:var(--muted);font-size:.85rem">Federation is disabled</p>';}
      else if(!fed.upstreams||!fed.upstreams.length){\$('federation-status').innerHTML='<p style="color:var(--muted);font-size:.85rem">Enabled \\u2014 no upstreams configured</p>';}
      else{
        let t='<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>URL</th><th>Types</th><th>Last Sync</th><th>Synced</th></tr></thead><tbody>';
        fed.upstreams.forEach(u=>{
          t+='<tr><td style="font-size:.82rem;word-break:break-all">'+esc(u.url||'')+'</td><td style="font-size:.82rem;color:var(--accent)">'+esc((u.types||[]).join(', ')||'all')+'</td><td style="color:var(--muted);font-size:.8rem">'+esc(u.last_sync||'never')+'</td><td style="font-weight:600">'+esc(u.synced||0)+'</td></tr>';
        });
        t+='</tbody></table></div>';
        \$('federation-status').innerHTML=t;
      }
    }else{\$('federation-status').innerHTML='<p style="color:var(--muted)">Could not load federation status</p>';}
  }catch{\$('federation-status').innerHTML='<p style="color:var(--muted)">Could not load federation status</p>';}

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
    const r=await api('/users/'+encodeURIComponent(user)+'/role',{method:'POST',headers:authHeaders(),body:JSON.stringify({role})});
    if(r.ok){toast('Role updated: '+user+' is now '+role,'success');}
    else{const e=await r.json().catch(()=>({}));toast(e.error||'Failed to set role','error');}
  }catch(e){toast('Error: '+e.message,'error');}
};

window.downloadBackup=async function(){
  try{
    const r=await api('/backup');
    if(!r.ok)throw new Error('HTTP '+r.status);
    const blob=await r.blob();
    const url=URL.createObjectURL(blob);
    const ts=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    const a=document.createElement('a');a.href=url;a.download='ihub-backup-'+ts+'.db';a.click();
    URL.revokeObjectURL(url);
    toast('SQLite backup downloaded','success');
  }catch(e){toast('Backup failed: '+e.message,'error');}
};

window.downloadFullBackup=async function(){
  try{
    const r=await api('/backup/full');
    if(!r.ok)throw new Error('HTTP '+r.status);
    const data=await r.json();
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const ts=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    const a=document.createElement('a');a.href=url;a.download='ihub-full-backup-'+ts+'.json';a.click();
    URL.revokeObjectURL(url);
    toast('Full JSON backup downloaded ('+((data.artifacts||[]).length)+' artifacts)','success');
  }catch(e){toast('Full backup failed: '+e.message,'error');}
};

window.restoreFromFile=async function(input){
  const file=input.files[0];
  if(!file){return;}
  const name=file.name.toLowerCase();
  const isJson=name.endsWith('.json');

  if(!confirm('Restore from "'+file.name+'"? This will overwrite existing data.'))return;

  try{
    if(isJson){
      // Full JSON restore
      const text=await file.text();
      const r=await fetch('/api/backup/full',{method:'POST',headers:authHeaders(),body:text});
      if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error||'Restore failed: '+r.status);}
      const d=await r.json();
      toast('Restored: '+(d.imported||0)+' artifacts, '+(d.comments||0)+' comments','success');
    }else{
      // SQLite restore
      const buf=await file.arrayBuffer();
      const r=await fetch('/api/backup',{method:'POST',headers:{...authHeaders(),'Content-Type':'application/octet-stream'},body:buf});
      if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error||'Restore failed: '+r.status);}
      toast('SQLite backup restored','success');
    }
    await loadAllTypes();render();
  }catch(e){toast('Restore error: '+e.message,'error');}
  input.value='';
};

window.importBundleFile=async function(input){
  const file=input.files[0];
  if(!file){return;}
  try{
    const text=await file.text();
    const bundle=JSON.parse(text);
    const artifacts=bundle.artifacts||[];
    if(!artifacts.length){toast('Bundle is empty','error');return;}

    let imported=0,errors=0;
    for(const art of artifacts){
      const type=(art.type||'')+(art.type&&!art.type.endsWith('s')?'s':'');
      const name=art.name;
      if(!type||!name){errors++;continue;}
      try{
        const r=await api('/'+type+'/'+encodeURIComponent(name),{
          method:'POST',headers:authHeaders(),
          body:JSON.stringify({name,version:art.version||'1.0.0',description:art.description||'',tags:art.tags||[],meta:art.meta||{},body:art.body||''})
        });
        if(r.ok)imported++;else errors++;
      }catch{errors++;}
    }
    toast('Imported '+imported+' artifacts'+(errors?' ('+errors+' errors)':''),'success');
    await loadAllTypes();render();
  }catch(e){toast('Import error: '+e.message,'error');}
  input.value='';
};

window.addWebhook=async function(){
  const url=\$('wh-url').value.trim();
  const events=\$('wh-events').value.trim()||'*';
  const secret=\$('wh-secret').value.trim()||undefined;
  if(!url){toast('URL is required','error');return;}
  try{
    const body={url,events};
    if(secret)body.secret=secret;
    const r=await api('/webhooks',{method:'POST',headers:authHeaders(),body:JSON.stringify(body)});
    if(r.ok){toast('Webhook added','success');\$('wh-url').value='';\$('wh-secret').value='';renderAdmin(\$('content'));}
    else{const e=await r.json().catch(()=>({}));toast(e.error||'Failed to add webhook','error');}
  }catch(e){toast('Error: '+e.message,'error');}
};

window.deleteWebhook=async function(id){
  try{
    const r=await api('/webhooks/'+id,{method:'DELETE',headers:authHeaders()});
    if(r.ok){toast('Webhook removed','success');renderAdmin(\$('content'));}
    else{const e=await r.json().catch(()=>({}));toast(e.error||'Failed to remove webhook','error');}
  }catch(e){toast('Error: '+e.message,'error');}
};

window.fedSync=async function(){
  toast('Syncing...','info');
  try{
    const r=await api('/federation/sync',{method:'POST',headers:authHeaders()});
    if(r.ok){
      const d=await r.json();
      const total=(d.results||[]).reduce((s,r)=>s+(r.synced||0),0);
      toast('Federation sync complete: '+total+' artifacts synced','success');
      renderAdmin(\$('content'));
    }else{const e=await r.json().catch(()=>({}));toast(e.error||'Sync failed','error');}
  }catch(e){toast('Error: '+e.message,'error');}
};

// --- Theme toggle ---
\$('theme-toggle').onclick=function(){
  theme=theme==='dark'?'light':'dark';
  localStorage.setItem('ihub_theme',theme);
  document.querySelector('meta[name="color-scheme"]').content=theme;
  if(theme==='light')document.documentElement.setAttribute('data-theme','light');
  else document.documentElement.removeAttribute('data-theme');
  this.textContent=theme==='dark'?'\\u263e':'\\u2600';
};
\$('theme-toggle').textContent=theme==='dark'?'\\u263e':'\\u2600';

// --- Search ---
\$('search').addEventListener('input',function(e){
  state.searchTerm=e.target.value;
  if(state.searchTerm.length>=2){state.view='browse';state.detail=null;document.querySelectorAll('.sidebar nav a').forEach(a=>a.classList.toggle('active',a.dataset.view==='browse'));}
  render();
});

// --- Hamburger ---
\$('hamburger').onclick=function(){
  const open=\$('sidebar').classList.toggle('open');
  \$('sidebar-overlay').style.display=open?'block':'none';
};
\$('sidebar-overlay').onclick=function(){
  \$('sidebar').classList.remove('open');
  this.style.display='none';
};

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
