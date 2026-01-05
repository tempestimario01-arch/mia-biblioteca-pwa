import { useEffect, useMemo, useState, useCallback, memo } from "react";
import "./index.css";
import { supabase } from "./supabaseClient";

/* =========================================
   1. COSTANTI E CONFIGURAZIONI GLOBALI
   ========================================= */

const TYPE_ICONS = {
  libro: "📚",
  audiolibro: "🎧",
  film: "🎬",
  album: "💿",
  video: "▶️",
  gioco: "🎮"
};

const TYPES = ["libro", "audiolibro", "film", "album", "video", "gioco"];

const GENRES = [
 "ambiente","arte","asia","biografia","cinema","filosofia","fumetto","musica","psicologia","romanzi","scienza","sociologia","sport","storia","vari"
];
// NOTA: 'Focus' è il livello medio (Flow), 'Apprendimento/Impegnativo' è il livello Hard.
const MOODS = ["Relax", "Focus", "Apprendimento", "Impegnativo"];
const GENRE_ALIAS = { socilogia: "sociologia" };
const BORDER_COLOR = '#d6bc9b';

/* =========================================
   2. HELPER FUNCTIONS
   ========================================= */

function showGenreInput(t) { return t === 'libro' || t === 'video'; }

function canonGenere(g){
  if(!g) return "";
  const x = String(g).toLowerCase().trim();
  return GENRE_ALIAS[x] || x;
}
function normType(v){ return String(v ?? "").trim().toLowerCase(); }

function parseSources(str){
  if (!str) return [];
  return String(str).toLowerCase().split(/[,;/|+]+/).map(s => {
    const clean = s.trim();
    if (clean === "da comprare" || clean === "wishlist") return "Wishlist";
    return clean;
  }).filter(Boolean);
}

function joinSources(arr){
  const uniq = Array.from(new Set((arr||[]).map(s=>s.trim()).filter(Boolean)));
  return uniq.join(", ");
}

function getLinkEmoji(url) {
  if (!url) return "🔗";
  const u = url.toLowerCase();
  if (u.includes("onenote") || u.includes("docs.google") || u.includes("drive.google") || u.includes("notion")) return "📝"; 
  return "🔗";
}

function exportItemsToCsv(rows){
  const headers = ["id","title","creator","kind","status","genre","mood","year","sources","video_url","note","finished_at","created_at"];
  const esc = v => `"${String(v ?? "").replace(/"/g,'""')}"`;
  const body = rows.map(i => headers.map(h => esc(i[h])).join(";")).join("\n");
  const headerRow = headers.map(h => esc(h)).join(";");
  const blob = new Blob(["\uFEFF" + [headerRow, body].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `biblioteca_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/* =========================================
   3. COMPONENTI UI ISOLATI
   ========================================= */

const ToastContainer = ({ toasts }) => (
  <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
    {toasts.map(t => (
      <div key={t.id} style={{ backgroundColor: t.type === 'error' ? '#c53030' : '#2d3748', color: 'white', padding: '10px 20px', borderRadius: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: '0.95em', fontWeight: 500, animation: 'fadeIn 0.3s forwards', opacity: 0.95 }}>
        {t.message}
      </div>
    ))}
  </div>
);

const LibraryItem = memo(({ it, isArchiveView, onToggleFocus, onMarkPurchased, onArchive, onEdit, onReExperience, onUnarchive, onFilterAuthor }) => {
  const isArchived = it.status === 'archived';
  const hasWishlist = (it.sourcesArr || []).includes('Wishlist');
  const opacityValue = (isArchived && !isArchiveView) ? 0.6 : 1;

  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, borderLeft: it.is_next ? '4px solid #38a169' : '1px solid #e2e8f0', backgroundColor: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transform: 'translateZ(0)' }}>
      <div style={{ opacity: opacityValue, transition: 'opacity 0.3s' }}>
        <div className="item-title" style={{ fontSize: '1.1rem', marginBottom: 6, display: 'flex', alignItems: 'center' }}>
          {it.is_next && <span title="In Coda" style={{ marginRight: 6 }}>📌</span>} {it.title}
        </div>
        <div className="item-meta" style={{ fontSize: '0.9rem', color: '#4a5568', lineHeight: 1.6 }}>
          <div onClick={() => onFilterAuthor(it.creator)} title="Filtra per questo autore" style={{ fontWeight: 500, marginBottom: 4, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(0,0,0,0.1)', textUnderlineOffset: '3px' }}>
            {TYPE_ICONS[it.kind]} {it.creator}
          </div>
          <div style={{display:'flex', flexWrap:'wrap', gap:6, alignItems:'center', marginTop:4}}>
            {it.mood && <span className="badge mood-badge" style={{ backgroundColor: '#ebf8ff', color: '#2c5282' }}>{it.mood}</span>}
            {it.genre && showGenreInput(it.kind) && <span style={{fontSize:'0.85em', opacity:0.8}}>• {canonGenere(it.genre)}</span>}
            {it.year && <span style={{fontSize:'0.85em', opacity:0.8}}>• {it.year}</span>}
            {Array.isArray(it.sourcesArr) && it.sourcesArr.length > 0 && (<span style={{ marginLeft: 6, display:'inline-flex', gap:4, opacity:0.9 }}>{it.sourcesArr.map((s, idx) => <span key={idx} title="Wishlist">🛒</span>)}</span>)}
          </div>
          {it.finished_at && <div style={{marginTop:6, fontSize:'0.85em', color:'#718096', fontStyle:'italic'}}>🏁 Finito il: {new Date(it.finished_at).toLocaleDateString()}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 12, marginTop: 4, paddingTop: 12, borderTop: '1px solid #f0f4f8', flexWrap: 'wrap' }}>
        {it.video_url && ( <a href={it.video_url} target="_blank" rel="noopener noreferrer" className="ghost button" title="Apri Link" style={{ textDecoration: 'none', padding:'8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px' }}>{getLinkEmoji(it.video_url)}</a> )}
        {it.note && (<button className="ghost" onClick={() => alert(it.note)} title="Leggi nota personale" style={{padding:'8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px', lineHeight: 1}}>📝</button>)}
        {(!it.finished_at && !isArchived) && (<button className="ghost" onClick={() => onToggleFocus(it)} title={it.is_next ? "Togli Focus" : "Metti Focus"} style={{padding:'8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px'}}>{it.is_next ? "🚫" : "📌"}</button>)}
        {hasWishlist && (<button className="ghost" onClick={() => onMarkPurchased(it)} title="Ho comprato!" style={{padding:'8px', fontSize:'1.2em', color:'#2b6cb0', borderColor:'#bee3f8', border: `1px solid #bee3f8`, borderRadius: '8px'}}>🛒</button>)}
        {(it.finished_at || isArchived) ? (<><button className="ghost" onClick={() => onReExperience(it)} title="Rileggi" style={{padding:'8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px'}}>🔄</button><button className="ghost" onClick={() => onUnarchive(it)} title="Ripristina" style={{padding:'8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px'}}>↩️</button></>) : (<button className="ghost" onClick={() => onArchive(it)} title="Archivia" style={{padding:'8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px'}}>📦</button>)}
        <button className="ghost" onClick={() => onEdit(it)} title="Modifica" style={{ padding: '8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px' }}>✏️</button>
      </div>
    </div>
  );
});

/* =========================================
   4. APP PRINCIPALE
   ========================================= */

export default function App(){
  
  /* --- STATI --- */
  const [items,setItems] = useState([]);
  const [pinnedItems, setPinnedItems] = useState([]); 
  const [loading,setLoading] = useState(false); 
  const [visibleCount, setVisibleCount] = useState(50); 
  const [toasts, setToasts] = useState([]); 

  // MODALITÀ VISTA PIANO DI LETTURA
  // 'ALL' = Tutto
  // 'HARD' = Apprendimento/Impegnativo (Università/Studio)
  // 'MEDIUM' = Focus (Interesse/Flow)
  // 'SOFT' = Relax
  // 'AUDIO' = Audiolibri
  const [viewMode, setViewMode] = useState('ALL'); 

  // Stats & Filtri
  const [stats, setStats] = useState({ total: 0, active: 0, archived: 0, byType: [], bySource: [] });
  const [periodStats, setPeriodStats] = useState({ total: 0, libro: 0, audiolibro: 0, film: 0, album: 0, video: 0, gioco: 0 });
  const [periodLoading, setPeriodLoading] = useState(false);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState(""); 
  const [statusFilter, setStatusFilter] = useState("active"); 
  const [typeFilter,setTypeFilter] = useState("");
  const [genreFilter,setGenreFilter] = useState("");
  const [moodFilter, setMoodFilter] = useState("");
  const [sourceFilter,setSourceFilter] = useState(""); 
  const [letterFilter, setLetterFilter] = useState("");
  const [letterMode, setLetterMode] = useState("author"); 
  const [yearFilter, setYearFilter] = useState(""); 
  const [completionMonthFilter, setCompletionMonthFilter] = useState("");
  const [completionYearFilter, setCompletionYearFilter] = useState("");

  // Modali & Form
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [advOpen, setAdvOpen] = useState(false); 
  const [archModal, setArchModal] = useState(null); 
  const [statsModalOpen, setStatsModalOpen] = useState(false); 
  const [statsView, setStatsView] = useState('periodo'); 
  const [editState, setEditState] = useState(null);
  const [cleanupItem, setCleanupItem] = useState(null);
  const [title,setTitle] = useState("");
  const [creator,setCreator] = useState("");
  const [kind,setKind] = useState("libro");
  const [genre,setGenre] = useState("");
  const [mood, setMood] = useState(""); 
  const [videoUrl, setVideoUrl] = useState("");
  const [year,setYear] = useState("");
  const [note, setNote] = useState(""); 
  const [isNext, setIsNext] = useState(false);
  const [isInstantArchive, setIsInstantArchive] = useState(false);
  const [instantDate, setInstantDate] = useState("");
  const [isToBuy, setIsToBuy] = useState(false); 
  const [randKind,setRandKind] = useState("libro");
  const [randGenre,setRandGenre] = useState("");
  const [randMood, setRandMood] = useState(""); 
  const [suggestion, setSuggestion] = useState(null); 
  const [memoryItem, setMemoryItem] = useState(null);
  const [statMonth,setStatMonth] = useState(new Date().getMonth() + 1);
  const [statYear,setStatYear] = useState(new Date().getFullYear());

  // NOTIFICHE
  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now(); setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== id)); }, 3000);
  }, []);

  // FETCH DATA
  const fetchPinnedItems = useCallback(async () => {
    const { data, error } = await supabase.from('items').select('*, note').eq('is_next', true).neq('status', 'archived'); 
    if (!error && data) {
      setPinnedItems(data.map(row => ({ ...row, kind: normType(row.type), creator: row.author, sourcesArr: parseSources(row.source) })));
    }
  }, []);

  const fetchItems = useCallback(async () => {
    let query = supabase.from("items").select("id,title,creator:author,kind:type,status,created_at,genre,mood,year,sources:source,video_url,note,is_next,finished_at:ended_on").order("created_at", { ascending:false }).limit(500); 
    if (q) { query = query.or(`title.ilike.%${q}%,author.ilike.%${q}%`); }
    if (statusFilter) { query = query.eq('status', statusFilter); }
    if (typeFilter) { query = query.eq('type', typeFilter); }
    if (genreFilter) { query = query.eq('genre', canonGenere(genreFilter)); }
    if (moodFilter) { query = query.eq('mood', moodFilter); }
    if (sourceFilter === 'Wishlist') { query = query.or('source.ilike.%Wishlist%,source.ilike.%da comprare%'); } else if (sourceFilter) { query = query.ilike('source', `%${sourceFilter}%`); }
    if (letterFilter) { query = query.ilike(letterMode === 'title' ? 'title' : 'author', `${letterFilter}%`); }
    if (yearFilter) { query = query.eq('year', Number(yearFilter)); }
    if (completionYearFilter) {
      const y = Number(completionYearFilter); const m = completionMonthFilter ? Number(completionMonthFilter) : null;
      const start = m ? `${y}-${String(m).padStart(2,'0')}-01` : `${y}-01-01`;
      const end = m ? (m===12 ? `${y+1}-01-01` : `${y}-${String(m+1).padStart(2,'0')}-01`) : `${y+1}-01-01`;
      query = query.gte('ended_on', start).lt('ended_on', end);
    }
    const { data, error } = await query;
    if (!error) { setItems((data || []).map(row => ({ ...row, kind: normType(row.kind), creator: row.creator, sourcesArr: parseSources(row.sources) }))); }
    setLoading(false);
  }, [q, statusFilter, typeFilter, genreFilter, moodFilter, sourceFilter, letterFilter, letterMode, yearFilter, completionMonthFilter, completionYearFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const { count: total } = await supabase.from("items").select('*', { count: 'exact', head: true });
      const { count: arch } = await supabase.from("items").select('*', { count: 'exact', head: true }).or("ended_on.not.is.null, status.eq.archived");
      const typeProms = TYPES.map(t => supabase.from("items").select('*', { count: 'exact', head: true }).eq('type', t));
      const typeRes = await Promise.all(typeProms);
      const { count: toBuy } = await supabase.from("items").select('*', { count: 'exact', head: true }).or('source.ilike.%Wishlist%,source.ilike.%da comprare%');
      setStats({ total: total??0, archived: arch??0, active: (total??0)-(arch??0), byType: typeRes.map((r,i)=>({t:TYPES[i], n:r.count||0})), bySource: [{s:'Wishlist', n:toBuy||0}] });
    } catch (e) { console.error(e); }
  }, []); 

  const fetchPeriodStats = useCallback(async () => {
    if (!statYear) return; setPeriodLoading(true);
    const y = Number(statYear); const m = statMonth ? Number(statMonth) : null;
    const start = m ? `${y}-${String(m).padStart(2,'0')}-01` : `${y}-01-01`;
    const end = m ? (m===12 ? `${y+1}-01-01` : `${y}-${String(m+1).padStart(2,'0')}-01`) : `${y+1}-01-01`;
    const { data } = await supabase.from('items').select('type').gte('ended_on', start).lt('ended_on', end);
    const c = { total: 0, libro: 0, audiolibro: 0, film: 0, album: 0, video: 0, gioco: 0 };
    (data||[]).forEach(i => { c.total++; const t = normType(i.type); if(c[t]!==undefined) c[t]++; });
    setPeriodStats(c); setPeriodLoading(false);
  }, [statYear, statMonth]); 

  // HANDLERS
  useEffect(() => { setVisibleCount(50); }, [q, statusFilter, typeFilter, genreFilter, moodFilter, sourceFilter, letterFilter]);
  useEffect(() => { const h = () => { if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) setVisibleCount(p => p+50); }; window.addEventListener('scroll', h); return () => window.removeEventListener('scroll', h); }, []);
  useEffect(() => { const t = setTimeout(() => { const v = qInput.trim(); setQ(v); if(v.length>0) setStatusFilter(""); else setStatusFilter("active"); }, 250); return () => clearTimeout(t); }, [qInput]);
  useEffect(()=>{ fetchStats(); fetchPinnedItems(); },[fetchStats, fetchPinnedItems]); 
  useEffect(() => { if (q || statusFilter!=='active' || typeFilter || genreFilter || moodFilter || sourceFilter || letterFilter) { setLoading(true); fetchItems(); } else { setItems([]); setLoading(false); } }, [q, statusFilter, typeFilter, genreFilter, moodFilter, sourceFilter, letterFilter, yearFilter, completionYearFilter, fetchItems]);
  useEffect(() => { if(statsModalOpen) fetchPeriodStats(); }, [statsModalOpen, statMonth, statYear, fetchPeriodStats]);
  useEffect(() => { const fm = async () => { const { data } = await supabase.from('items').select('title, ended_on, author').not('ended_on', 'is', null); if (data && data.length > 0) { const r = data[Math.floor(Math.random() * data.length)]; const d = Math.ceil(Math.abs(new Date() - new Date(r.ended_on)) / (86400000)); if(d>0) setMemoryItem({ ...r, daysAgo: d }); } }; fm(); }, []);

  const addItem = useCallback(async (e) => { e.preventDefault(); if(!title.trim()) return;
    const p = { title, author: creator, type: kind, status: isInstantArchive?"archived":"active", genre: showGenreInput(kind)?canonGenere(genre):null, year: year?Number(year):null, source: isToBuy?"Wishlist":"", mood: mood||null, video_url: videoUrl||null, note: note||null, is_next: isInstantArchive?false:isNext, ended_on: isInstantArchive?(instantDate||new Date().toISOString().slice(0,10)):null };
    const { error } = await supabase.from("items").insert(p);
    if(!error){ setTitle(""); setCreator(""); setKind("libro"); setGenre(""); setYear(""); setMood(""); setVideoUrl(""); setNote(""); setIsNext(false); setIsInstantArchive(false); setIsToBuy(false); setAddModalOpen(false); showToast("Salvato!", "success"); if(q) fetchItems(); fetchStats(); fetchPinnedItems(); } else { showToast("Errore: "+error.message, "error"); }
  }, [title, creator, kind, genre, year, mood, videoUrl, note, isNext, isInstantArchive, instantDate, isToBuy, q, fetchItems, fetchStats, fetchPinnedItems, showToast]);

  const toggleFocus = useCallback(async (it) => { const n = !it.is_next; const { error } = await supabase.from("items").update({ is_next: n }).eq("id", it.id); if(!error){ setItems(p => p.map(x => x.id===it.id ? {...x, is_next: n} : x)); fetchPinnedItems(); showToast(n?"Focus attivo 📌":"Focus rimosso"); } }, [fetchPinnedItems, showToast]);
  const markAsPurchased = useCallback(async (it) => { const s = new Set([...(it.sourcesArr||[])]); s.delete("Wishlist"); s.delete("da comprare"); const ns = joinSources(Array.from(s)); await supabase.from("items").update({ source: ns }).eq("id", it.id); setItems(p => p.map(x => x.id===it.id ? {...x, sourcesArr: parseSources(ns)} : x)); fetchStats(); showToast("Preso! 🛒", "success"); }, [fetchStats, showToast]);
  const handleUpdate = useCallback(async (e) => { e.preventDefault(); if(!editState || !editState.title.trim()) return;
    const p = { title: editState.title, author: editState.creator, type: editState.type, genre: showGenreInput(editState.type)?canonGenere(editState.genre):null, year: editState.year?Number(editState.year):null, mood: editState.mood||null, video_url: editState.video_url||null, note: editState.note||null, is_next: editState.is_next, source: editState.source };
    const { error } = await supabase.from("items").update(p).eq('id', editState.id);
    if(!error){ setItems(prev => prev.map(it => it.id===editState.id ? { ...it, ...p, creator: p.author, kind: p.type, sourcesArr: parseSources(p.source) } : it)); setEditState(null); fetchPinnedItems(); showToast("Aggiornato! 💾", "success"); } else { showToast("Errore: "+error.message, "error"); }
  }, [editState, fetchPinnedItems, showToast]);

  const deleteItem = useCallback(async (id) => { await supabase.from('items').delete().eq('id', id); setEditState(null); setItems(p => p.filter(x => x.id !== id)); fetchStats(); fetchPinnedItems(); showToast("Eliminato.", "success"); if(statsModalOpen) fetchPeriodStats(); }, [statsModalOpen, fetchStats, fetchPeriodStats, fetchPinnedItems, showToast]);
  
  // LOGICA HOME PURA: Il piano di lettura appare solo se non ci sono filtri attivi
  const isStrictHome = !q && statusFilter === 'active' && !typeFilter && !genreFilter && !moodFilter && !sourceFilter && !yearFilter && !letterFilter && !completionYearFilter && !loading;

  return (
    <div className="app">
      <ToastContainer toasts={toasts} />
      <h1 style={{textAlign:'center'}}>Biblioteca personale</h1>
      
      <section className="card" style={{marginBottom:16, padding: "6px 12px", display:'flex', alignItems:'center', gap:8, backgroundColor:'#FFF9F0', borderRadius: 12, boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
        <div style={{flex:1, display:'flex', alignItems:'center', gap:8}}>
          <span style={{opacity:0.4, fontSize:'1.1em'}}>🔍</span>
          <input style={{width:'100%', border:'none', outline:'none', background:'transparent', fontSize:'1rem', padding:0, margin:0, height: 40}} placeholder="Cerca..." value={qInput} onChange={e=>setQInput(e.target.value)} />
          {qInput && (<button onClick={() => { setQInput(""); setStatusFilter("active"); }} style={{background:'transparent', border:'none', fontSize:'1.1em', color:'#718096', cursor:'pointer', padding:'0 8px'}}>✖</button>)}
        </div>
        <button className="ghost" onClick={()=>setStatsModalOpen(true)} style={{padding:'8px', fontSize:'1.1em', opacity:0.7}}>📊</button>
        <button className="ghost" onClick={()=>setAdvOpen(true)} style={{padding:'8px', fontSize:'1.1em', opacity:0.7}}>⚙️</button>
      </section>

      {/* ===== ETICHETTE FILTRI ATTIVI ===== */}
      {(!isStrictHome && !loading) && (
         <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'0 12px 16px', gap:12}}>
            <div style={{display:'flex', flexWrap:'wrap', gap:8, alignItems:'center', flex:1}}>
              <span style={{fontSize:'0.8em', opacity:0.6}}>Filtri:</span>
              {statusFilter !== 'active' && (<button className="ghost" onClick={()=>setStatusFilter('active')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0', color:'#4a5568'}}> {statusFilter === 'archived' ? '📦 Archivio' : '👁️ Tutto'} ✖</button>)}
              {typeFilter && (<button className="ghost" onClick={()=>setTypeFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0', color:'#4a5568'}}>{TYPE_ICONS[typeFilter]} {typeFilter} ✖</button>)}
              {genreFilter && (<button className="ghost" onClick={()=>setGenreFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0', color:'#4a5568'}}>{genreFilter} ✖</button>)}
              {moodFilter && (<button className="ghost" onClick={()=>setMoodFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#feebc8', color:'#c05621'}}>{moodFilter} ✖</button>)}
              {letterFilter && (<button className="ghost" onClick={()=>setLetterFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0', color:'#4a5568'}}>{letterFilter}... ✖</button>)}
            </div>
            <button className="ghost" onClick={()=>{setQ("");setQInput("");setTypeFilter("");setGenreFilter("");setMoodFilter("");setSourceFilter("");setLetterFilter("");setStatusFilter("active");}} style={{fontSize:'0.85em', color:'#fd8383ff', padding:'4px 8px', fontWeight:'600'}}>Pulisci</button>
         </div>
      )}

      {/* ===== PIANO DI LETTURA (SOLO HOME) ===== */}
      {isStrictHome && pinnedItems.length > 0 && (
        <section className="card" style={{marginTop:0, marginBottom:16, borderLeft:'4px solid #38a169', backgroundColor:'#f0fff4', padding:'12px 16px'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8}}>
             <h3 style={{margin:0, fontSize:'1em', color:'#22543d', textTransform:'uppercase', letterSpacing:'0.05em'}}>📌 Piano di Lettura</h3>
             {/* CONTROLLI SEMAFORO DENTRO LA CARD */}
             <div style={{display:'flex', gap:6}}>
                <button onClick={()=>setViewMode(prev=>prev==='HARD'?'ALL':'HARD')} title="Studio / Impegnativo" style={{width:28, height:28, borderRadius:'50%', border: viewMode==='HARD'?'2px solid #c53030':'1px solid #cbd5e0', backgroundColor: viewMode==='HARD'?'#feb2b2':'white', color:'#c53030', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8em', cursor:'pointer'}}>🔴</button>
                <button onClick={()=>setViewMode(prev=>prev==='MEDIUM'?'ALL':'MEDIUM')} title="Focus / Flow" style={{width:28, height:28, borderRadius:'50%', border: viewMode==='MEDIUM'?'2px solid #d69e2e':'1px solid #cbd5e0', backgroundColor: viewMode==='MEDIUM'?'#fefcbf':'white', color:'#d69e2e', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8em', cursor:'pointer'}}>🟡</button>
                <button onClick={()=>setViewMode(prev=>prev==='SOFT'?'ALL':'SOFT')} title="Relax / Chill" style={{width:28, height:28, borderRadius:'50%', border: viewMode==='SOFT'?'2px solid #38a169':'1px solid #cbd5e0', backgroundColor: viewMode==='SOFT'?'#c6f6d5':'white', color:'#38a169', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8em', cursor:'pointer'}}>🟢</button>
                <button onClick={()=>setViewMode(prev=>prev==='AUDIO'?'ALL':'AUDIO')} title="Audio Only" style={{width:28, height:28, borderRadius:'50%', border: viewMode==='AUDIO'?'2px solid #3182ce':'1px solid #cbd5e0', backgroundColor: viewMode==='AUDIO'?'#bee3f8':'white', color:'#3182ce', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.1em', cursor:'pointer'}}>🎧</button>
             </div>
          </div>
          <div style={{display:'flex', flexDirection:'column'}}>
            {pinnedItems.filter(p => {
                if (viewMode === 'ALL') return true;
                if (viewMode === 'HARD') return ['Apprendimento', 'Impegnativo'].includes(p.mood);
                if (viewMode === 'MEDIUM') return p.mood === 'Focus';
                if (viewMode === 'SOFT') return p.mood === 'Relax';
                if (viewMode === 'AUDIO') return ['audiolibro', 'album'].includes(p.kind);
                return true;
            }).map((p, idx) => (
              <div key={p.id} style={{padding: '10px 0', borderBottom: '1px solid #c6f6d5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12}}>
                <div style={{flex: 1}}>
                  <div style={{fontWeight:'600', fontSize:'1rem', color:'#2f855a'}}>{TYPE_ICONS[p.kind]} {p.title}</div>
                  <div style={{fontSize:'0.85em', opacity:0.8, color:'#276749'}}>{p.creator}</div>
                </div>
                <div style={{display:'flex', alignItems:'center', gap: 8}}>
                    <button className="ghost" onClick={() => setArchModal({ id: p.id, title: p.title, kind: p.kind, sourcesArr: p.sourcesArr || [], source: "", dateISO: new Date().toISOString().slice(0,10) })} style={{fontSize:'1.3em', padding:'6px', cursor:'pointer', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px'}}>📦</button>
                    {p.video_url && (<a href={p.video_url} target="_blank" rel="noopener noreferrer" className="ghost button" style={{fontSize:'1.3em', textDecoration:'none', padding:'6px', display:'flex', alignItems:'center', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px'}}>{getLinkEmoji(p.video_url)}</a>)}
                </div>
              </div>
            ))}
            {pinnedItems.filter(p => {
                if (viewMode === 'ALL') return true;
                if (viewMode === 'HARD') return ['Apprendimento', 'Impegnativo'].includes(p.mood);
                if (viewMode === 'MEDIUM') return p.mood === 'Focus';
                if (viewMode === 'SOFT') return p.mood === 'Relax';
                if (viewMode === 'AUDIO') return ['audiolibro', 'album'].includes(p.kind);
                return true;
            }).length === 0 && <div style={{fontStyle:'italic', color:'#276749', opacity:0.7, padding:'8px 0', fontSize:'0.9rem'}}>Nessun elemento attivo per questa modalità.</div>}
          </div>
        </section>
      )}

      {/* ===== HOME WIDGETS (SOLO HOME) ===== */}
      {isStrictHome && (
        <>
          {memoryItem && <div className="card" style={{marginBottom: 16, border: '1px dashed #cbd5e0', padding: '10px 12px'}}><p style={{fontSize: '0.85rem', color: '#718096', margin: 0, textAlign: 'center', fontStyle: 'italic'}}>🕰️ {memoryItem.daysAgo < 30 ? `${memoryItem.daysAgo} giorni fa` : `${Math.floor(memoryItem.daysAgo / 30)} mesi fa`} finivi <strong>{memoryItem.title}</strong></p></div>}
          {suggestion && (
            <section className="card" style={{marginBottom:16, borderLeft: '4px solid #ed8936', backgroundColor: '#fffaf0', padding:'12px 16px'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                <div style={{flex:1}}> 
                  <h3 style={{marginTop:0, marginBottom:4, fontSize:'1em', color:'#c05621'}}>🎲 Perché non provi...</h3>
                  <div style={{fontSize:'1.1em', fontWeight:'bold', marginBottom:2}}>{suggestion.title}</div>
                  <div style={{fontSize:'0.9em', opacity:0.8, marginBottom:8}}>{TYPE_ICONS[suggestion.kind]} {suggestion.author}</div>
                  <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>{suggestion.mood && <span className="badge mood-badge" style={{backgroundColor:'#bee3f8', color:'#2a4365'}}>{suggestion.mood}</span>}{suggestion.genre && <span className="badge" style={{backgroundColor:'#edf2f7', color:'#4a5568'}}>{suggestion.genre}</span>}</div>
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:8, alignItems:'center'}}>
                   {suggestion.video_url && (<a href={suggestion.video_url} target="_blank" rel="noopener noreferrer" style={{display:'flex', alignItems:'center', justifyContent:'center', width: 40, height: 40, borderRadius: '50%', backgroundColor: '#feebc8', textDecoration:'none', fontSize:'1.4em'}}>{getLinkEmoji(suggestion.video_url)}</a>)}
                   {!suggestion.is_next && (<button className="ghost" onClick={() => { toggleFocus(suggestion); setSuggestion(null); }} style={{display:'flex', alignItems:'center', justifyContent:'center', width: 40, height: 40, borderRadius: '50%', backgroundColor: '#c6f6d5', color: '#2f855a', fontSize:'1.4em', border: '1px solid #9ae6b4', cursor:'pointer'}}>📌</button>)}
                </div>
              </div>
            </section>
          )}
          <section className="card" style={{marginBottom:16, padding:'12px', backgroundColor:'#FDF8F2', borderRadius:16, border:'1px solid #e2e8f0'}}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <div style={{display:'flex', gap:8, flex:1, minWidth:0}}>
                <select value={randKind} onChange={e=>setRandKind(e.target.value)} style={{flex:1, minWidth:0, padding:'10px 4px', borderRadius:10, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent'}}>{TYPES.filter(t => t !== 'audiolibro').map(t=> <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}</select>
                <select value={randMood} onChange={e=>setRandMood(e.target.value)} style={{flex:1, minWidth:0, padding:'10px 4px', borderRadius:10, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent'}}><option value="">Umore</option>{MOODS.map(m=> <option key={m} value={m}>{m}</option>)}</select>
                {showGenreInput(randKind) && (<select value={randGenre} onChange={e=>setRandGenre(e.target.value)} style={{flex:1, minWidth:0, padding:'10px 4px', borderRadius:10, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent'}}><option value="">Genere</option>{GENRES.map(g=> <option key={g} value={g}>{g}</option>)}</select>)}
              </div>
              <button onClick={async () => { setSuggestion(null); const { data } = await supabase.rpc('get_random_suggestion', { p_kind: randKind, p_genre: showGenreInput(randKind) ? (canonGenere(randGenre)||null) : null, p_mood: randMood||null }); if(data && data.length){ const r=data[0]; setSuggestion({...r, kind:normType(r.type), author:r.author||r.creator}); } else showToast("Nessun risultato","error"); }} style={{width: 48, height: 48, borderRadius: 12, border: '1px solid #ed8936', backgroundColor: '#FDF8F2', color: '#ed8936', fontSize: '1.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>🎲</button>
            </div>
          </section>
        </>
      )}

      {/* ===== LISTA RISULTATI (SEMPRE VISIBILE SE C'È RICERCA O SCORRIMENTO) ===== */}
      {(items.length > 0 || q) && (
        <section className="card" style={{marginTop: 12}}>
          {loading ? <p>Caricamento…</p> : (
            <div className="list" style={{ gap: 16, display: 'flex', flexDirection: 'column' }}>
              {items.slice(0, visibleCount).map(it => <LibraryItem key={it.id} it={it} isArchiveView={statusFilter === 'archived'} onToggleFocus={toggleFocus} onMarkPurchased={markAsPurchased} onArchive={it=>setArchModal({ id: it.id, title: it.title, kind: it.kind, sourcesArr: it.sourcesArr || [], source: "", dateISO: new Date().toISOString().slice(0,10) })} onEdit={openEditModal} onReExperience={reExperience} onUnarchive={unarchive} onFilterAuthor={a => { setQInput(a); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />)}
              {items.length > visibleCount && (<div style={{textAlign: 'center', padding: 20, color: '#718096', fontStyle:'italic'}}>Scorri per caricare altri elementi...</div>)}
            </div>
          )}
        </section>
      )}

      {/* ===== FAB & MODALI ===== */}
      <button onClick={() => setAddModalOpen(true)} className="fab">+</button>
      
      {/* MODALE AGGIUNTA */}
      {addModalOpen && (
        <div className="modal-backdrop" onClick={() => setAddModalOpen(false)}>
          <div className="card" style={{maxWidth:500, width:"94%", padding:"20px 24px", borderRadius: 20, backgroundColor:'#FDF8F2'}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0, marginBottom:20, textAlign:'center'}}>Nuovo Elemento</h2>
            <form onSubmit={addItem} id="add-form" style={{display:'flex', flexDirection:'column', gap:12}}>
              <input placeholder="Titolo" value={title} onChange={e=>setTitle(e.target.value)} style={{padding:'12px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent'}} autoFocus />
              <input placeholder="Autore" value={creator} onChange={e=>setCreator(e.target.value)} style={{padding:'12px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent'}} />
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <select value={kind} onChange={handleAddKindChange} style={{padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent'}}>{TYPES.filter(t => t !== 'audiolibro').map(t=> <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}</select>
                <select value={mood} onChange={e=>setMood(e.target.value)} style={{padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent'}}><option value="">Umore</option>{MOODS.map(m => <option key={m} value={m}>{m}</option>)}</select>
              </div>
              <textarea placeholder="Note..." value={note} onChange={e=>setNote(e.target.value)} rows={3} style={{padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent'}} />
              <div style={{marginTop:8, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
                  <div onClick={() => setIsToBuy(!isToBuy)} style={{border: isToBuy ? '2px solid #3182ce' : `1px solid ${BORDER_COLOR}`, backgroundColor: isToBuy ? '#ebf8ff' : 'transparent', color: isToBuy ? '#2b6cb0' : '#718096', borderRadius: 12, padding: '10px 4px', textAlign:'center', cursor:'pointer'}}>🛒 Wishlist</div>
                  <div onClick={() => { setIsNext(!isNext); setIsInstantArchive(false); }} style={{border: isNext ? '2px solid #38a169' : `1px solid ${BORDER_COLOR}`, backgroundColor: isNext ? '#f0fff4' : 'transparent', color: isNext ? '#2f855a' : '#718096', borderRadius: 12, padding: '10px 4px', textAlign:'center', cursor:'pointer'}}>📌 In Corso</div>
                  <div onClick={() => { setIsInstantArchive(!isInstantArchive); setIsNext(false); }} style={{border: isInstantArchive ? '2px solid #d69e2e' : `1px solid ${BORDER_COLOR}`, backgroundColor: isInstantArchive ? '#fffff0' : 'transparent', color: isInstantArchive ? '#b7791f' : '#718096', borderRadius: 12, padding: '10px 4px', textAlign:'center', cursor:'pointer'}}>✅ Finito</div>
              </div>
            </form>
            <div style={{display:'flex', gap:12, marginTop:24}}><button className="ghost" onClick={()=>setAddModalOpen(false)} style={{flex:1}}>Annulla</button><button type="submit" form="add-form" style={{flex:2, padding:'14px', borderRadius:12, backgroundColor:'#3e3e3e', color:'white', fontWeight:'600', border:'none'}}>Salva</button></div>
          </div>
        </div>
      )}

      {/* MODALE AVANZATO */}
      {advOpen && (
        <div className="modal-backdrop" onClick={() => setAdvOpen(false)}>
          <div className="card" style={{maxWidth:500, width:"94%", maxHeight:"90vh", overflowY:"auto", padding:"20px 24px", borderRadius: 20, backgroundColor:'#FDF8F2'}} onClick={e => e.stopPropagation()}>
            <h2 style={{textAlign:'center'}}>Filtri & Strumenti</h2>
            <div style={{display:'flex', flexDirection:'column', gap:20}}>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                   <button onClick={() => { setStatusFilter(prev => prev === 'active' ? 'archived' : 'active'); }} style={{padding:16, borderRadius:16, border: `1px solid ${BORDER_COLOR}`, backgroundColor: statusFilter==='active'?'#f0fff4':'#fffff0'}}> {statusFilter==='active'?'🟢 In Corso':'📦 Archivio'} </button>
                   <button onClick={() => setSourceFilter(prev => prev === 'Wishlist' ? '' : 'Wishlist')} style={{padding:16, borderRadius:16, border: sourceFilter==='Wishlist'?'2px solid #3182ce':`1px solid ${BORDER_COLOR}`, backgroundColor: sourceFilter==='Wishlist'?'#ebf8ff':'transparent'}}>🛒 Wishlist</button>
                </div>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{padding:'12px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent'}}><option value="">Tutti i Tipi</option>{TYPES.map(t=> <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}</select>
                <div style={{display:'flex', flexWrap:'wrap', gap:6, justifyContent:'center'}}>{"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(L=>(<button key={L} className={`ghost ${letterFilter === L ? 'active-letter' : ''}`} onClick={()=>setLetterFilter(L)} style={{padding:'8px 12px', borderRadius:8, border: `1px solid ${BORDER_COLOR}`, backgroundColor: letterFilter === L ? '#e2e8f0' : 'transparent', fontWeight: letterFilter === L ? 'bold' : 'normal'}}>{L}</button>))}</div>
                <div style={{display:'flex', gap:12}}>
                    <button className="ghost" onClick={()=>exportItemsToCsv(items)} style={{flex:1, border:`1px solid ${BORDER_COLOR}`, padding:12, borderRadius:12}}>📤 CSV</button>
                    <button className="ghost" onClick={async () => { const d = new Date(); d.setMonth(d.getMonth()-6); const {data} = await supabase.from('items').select('*').eq('status','active').lt('created_at', d.toISOString()); if(data?.length) { setCleanupItem({...data[Math.floor(Math.random()*data.length)], kind:normType(data[0].type)}); setAdvOpen(false); } else showToast("Nulla da pulire!","success"); }} style={{flex:1, border:`1px solid ${BORDER_COLOR}`, padding:12, borderRadius:12}}>🧹 Pulizia</button>
                </div>
            </div>
            <button onClick={()=>setAdvOpen(false)} style={{marginTop:20, padding:'14px', borderRadius:12, backgroundColor:'#3e3e3e', color:'white', width:'100%', border:'none'}}>Chiudi</button>
          </div>
        </div>
      )}

      {/* MODALE STATS */}
      {statsModalOpen && (
        <div className="modal-backdrop" onClick={() => setStatsModalOpen(false)}>
          <div className="card" style={{maxWidth:600, width:"94%", maxHeight:"90vh", overflowY:"auto", padding:"20px 24px", borderRadius: 20, backgroundColor:'#FDF8F2'}} onClick={e => e.stopPropagation()}>
            <h2 style={{textAlign:'center'}}>Statistiche</h2>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20}}>
              <div onClick={() => setStatsView('periodo')} style={{border: statsView === 'periodo' ? '2px solid #d53f8c' : `1px solid ${BORDER_COLOR}`, backgroundColor: statsView === 'periodo' ? '#fff5f7' : 'transparent', padding: '10px', textAlign:'center', borderRadius:12}}>📅 Periodo</div>
              <div onClick={() => setStatsView('totale')} style={{border: statsView === 'totale' ? '2px solid #3182ce' : `1px solid ${BORDER_COLOR}`, backgroundColor: statsView === 'totale' ? '#ebf8ff' : 'transparent', padding: '10px', textAlign:'center', borderRadius:12}}>📈 Totale</div>
            </div>
            {statsView === 'periodo' ? (
                <div>
                   <div style={{display:'flex', gap:8, justifyContent:'center', marginBottom:20}}><input type="number" value={statMonth} onChange={e=>setStatMonth(e.target.value)} style={{width:60, textAlign:'center'}} /><input type="number" value={statYear} onChange={e=>setStatYear(e.target.value)} style={{width:80, textAlign:'center'}} /></div>
                   <div style={{textAlign:'center', fontSize:'3em', fontWeight:'bold', marginBottom:20}}>{periodStats.total}</div>
                   <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12}}>{Object.entries(periodStats).filter(([k])=>k!=='total').map(([k,v])=>(<div key={k} style={{border:`1px solid ${BORDER_COLOR}`, padding:8, borderRadius:12, textAlign:'center'}}><div>{TYPE_ICONS[k]||k}</div><strong>{v}</strong></div>))}</div>
                </div>
            ) : (
                <div>
                    <div style={{display:'flex', justifyContent:'space-between', padding:16, border:`1px solid ${BORDER_COLOR}`, borderRadius:16, marginBottom:20}}>
                        <div style={{textAlign:'center'}}><div>{stats.total}</div><small>Tot</small></div>
                        <div style={{textAlign:'center', color:'#38a169'}}><div>{stats.active}</div><small>Active</small></div>
                        <div style={{textAlign:'center', color:'#d69e2e'}}><div>{stats.archived}</div><small>Arch</small></div>
                    </div>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>{stats.byType.map(x=> (<div key={x.t} style={{display:'flex', justifyContent:'space-between', padding:8, border:`1px solid ${BORDER_COLOR}`, borderRadius:12}}><span>{TYPE_ICONS[x.t]} {x.t}</span><strong>{x.n}</strong></div>))}</div>
                </div>
            )}
            <button onClick={()=>setStatsModalOpen(false)} style={{marginTop:24, padding:'14px', borderRadius:12, backgroundColor:'#3e3e3e', color:'white', border:'none', width:'100%'}}>Chiudi</button>
          </div>
        </div>
      )}

      {/* MODALE ARCHIVIAZIONE */}
      {archModal && (
        <div className="modal-backdrop" onClick={() => setArchModal(null)}>
          <div className="card" style={{maxWidth:560, width:"92%", padding:16}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0}}>Archivia — {archModal.title}</h2>
            <div style={{margin:'16px 0'}}>
              <label style={{display:'flex', alignItems:'center', gap:8, padding:'10px', borderRadius:8, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'#f7fafc'}}>
                 <input type="checkbox" checked={(archModal.sourcesArr||[]).includes("Wishlist")} onChange={e => { const c = new Set(archModal.sourcesArr || []); if(e.target.checked) c.add("Wishlist"); else { c.delete("Wishlist"); c.delete("da comprare"); } setArchModal(p => ({...p, sourcesArr: Array.from(c)})); }} />
                 <span>🛒 Mi è piaciuto (Wishlist)</span>
              </label>
              <input type="date" value={archModal.dateISO} onChange={e=>setArchModal(m=>({...m, dateISO:e.target.value}))} style={{marginTop:12, width:'100%'}} />
            </div>
            <div className="row" style={{justifyContent:"flex-end", gap:8}}><button className="ghost" onClick={()=>setArchModal(null)}>Annulla</button><button onClick={()=>saveArchiveFromModal(archModal)}>Conferma</button></div>
          </div>
        </div>
      )}

      {/* MODALE EDIT */}
      {editState && (
        <div className="modal-backdrop" onClick={() => setEditState(null)}>
          <div className="card" style={{maxWidth:560, width:"92%", padding:16}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0}}>Modifica</h2>
            <form onSubmit={handleUpdate} id="edit-form" className="grid grid-2">
              <input placeholder="Titolo" value={editState.title} onChange={e => setEditState(c => ({...c, title: e.target.value}))} />
              <input placeholder="Autore" value={editState.creator} onChange={e => setEditState(c => ({...c, creator: e.target.value}))} />
              <select value={editState.type} onChange={e => setEditState(c => ({...c, type: e.target.value}))}>{TYPES.map(t=> <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}</select>
              <select value={editState.mood || ""} onChange={e => setEditState(c => ({...c, mood: e.target.value}))}><option value="">Umore</option>{MOODS.map(m => <option key={m} value={m}>{m}</option>)}</select>
              <input placeholder="Link" value={editState.video_url || ""} onChange={e => setEditState(c => ({...c, video_url: e.target.value}))} />
              <div style={{gridColumn:"1/-1"}}><textarea placeholder="Note..." value={editState.note||""} onChange={e=>setEditState(c=>({...c, note:e.target.value}))} rows={3} style={{width:'100%', padding:10, borderRadius:12, border:`1px solid ${BORDER_COLOR}`}} /></div>
              <div style={{gridColumn:"1/-1", display:'flex', gap:12, alignItems:'center'}}>
                  <label><input type="checkbox" checked={parseSources(editState.source).includes('Wishlist')} onChange={e => { const c = parseSources(editState.source).filter(x=>x!=='Wishlist'&&x!=='da comprare'); if(e.target.checked) c.push('Wishlist'); setEditState(s=>({...s, source:joinSources(c)})); }} /> Wishlist</label>
                  <label><input type="checkbox" checked={editState.is_next} onChange={e => setEditState(c => ({...c, is_next: e.target.checked}))} /> 📌 In Coda</label>
              </div>
            </form>
            <div className="row" style={{justifyContent:"space-between", marginTop:12}}><button type="button" className="ghost" style={{color:'#c53030'}} onClick={() => { if(window.confirm("Eliminare?")) deleteItem(editState.id); }}>Elimina</button><div className="row" style={{gap:8}}><button className="ghost" onClick={()=>setEditState(null)}>Annulla</button><button type="submit" form="edit-form">Salva</button></div></div>
          </div>
        </div>
      )}
      
      {cleanupItem && (
          <div className="modal-backdrop">
              <div className="card" style={{maxWidth:400, padding:20, textAlign:'center'}}>
                  <h3>Pulizia Zen 🧹</h3>
                  <p>È passato tanto tempo da quando hai aggiunto: <br/><strong>{cleanupItem.title}</strong></p>
                  <p>Ti interessa ancora?</p>
                  <div style={{display:'flex', gap:10, justifyContent:'center', marginTop:20}}>
                      <button onClick={()=>confirmDeleteCleanup()} style={{backgroundColor:'#c53030', color:'white', border:'none'}}>No, cancella</button>
                      <button onClick={()=>setCleanupItem(null)} className="ghost">Sì, tienilo</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}