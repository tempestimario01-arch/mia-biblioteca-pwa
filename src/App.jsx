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
    if (clean === "coda" || clean === "in coda") return "Coda";
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
  if (u.includes("onenote") || u.includes("docs.google") || u.includes("drive.google") || u.includes("notion")) {
    return "📝"; 
  }
  return "🔗";
}

function exportItemsToCsv(rows){
  const headers = ["id","title","creator","kind","status","genre","mood","year","sources","video_url","note","finished_at","created_at"];
  const esc = v => `"${String(v ?? "").replace(/"/g,'""')}"`;
  const body = rows.map(i => headers.map(h => esc(i[h])).join(";")).join("\n");
  const headerRow = headers.map(h => esc(h)).join(";");
  const csvContent = [headerRow, body].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `biblioteca_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* =========================================
   3. COMPONENTI UI ISOLATI
   ========================================= */

const ToastContainer = ({ toasts }) => {
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', 
      zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none', width: '90%'
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          backgroundColor: t.type === 'error' ? '#c53030' : '#2d3748',
          color: 'white', padding: '10px 20px', borderRadius: 20,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: '0.95em', fontWeight: 500,
          animation: 'fadeIn 0.3s forwards', opacity: 0.95, textAlign: 'center'
        }}>
          {t.message}
        </div>
      ))}
    </div>
  );
};

const LibraryItem = memo(({ 
  it, 
  isArchiveView, 
  onToggleFocus, 
  onToggleQueue, 
  onMarkPurchased, 
  onArchive, 
  onEdit, 
  onReExperience, 
  onUnarchive, 
  onFilterAuthor 
}) => {
  const isArchived = it.status === 'archived';
  const hasWishlist = (it.sourcesArr || []).includes('Wishlist');
  const isInQueue = (it.sourcesArr || []).some(s => s.toLowerCase() === 'coda');

  const opacityValue = (isArchived && !isArchiveView) ? 0.6 : 1;
  const borderStyle = it.is_next ? '4px solid #38a169' : (isInQueue ? '4px solid #805ad5' : '1px solid #e2e8f0');

  return (
    <div className="card" style={{ 
      padding: 16, display: 'flex', flexDirection: 'column', gap: 12, 
      borderLeft: borderStyle, backgroundColor: 'white', 
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transform: 'translateZ(0)' 
    }}>
      <div style={{ opacity: opacityValue, transition: 'opacity 0.3s' }}>
        <div className="item-title" style={{ fontSize: '1.1rem', marginBottom: 6, display: 'flex', alignItems: 'center' }}>
          {it.is_next && <span title="In Corso" style={{ marginRight: 6 }}>🔥</span>} 
          {!it.is_next && isInQueue && <span title="In Coda" style={{ marginRight: 6 }}>⏳</span>} 
          {it.title}
        </div>
        <div className="item-meta" style={{ fontSize: '0.9rem', color: '#4a5568', lineHeight: 1.6 }}>
          <div onClick={() => onFilterAuthor(it.creator)} style={{ fontWeight: 500, marginBottom: 4, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(0,0,0,0.1)', textUnderlineOffset: '3px' }}>
            {TYPE_ICONS[it.kind]} {it.creator}
          </div>
          <div style={{display:'flex', flexWrap:'wrap', gap:6, alignItems:'center', marginTop:4}}>
            {it.mood && <span className="badge mood-badge" style={{ backgroundColor: '#ebf8ff', color: '#2c5282' }}>{it.mood}</span>}
            {it.genre && showGenreInput(it.kind) && <span style={{fontSize:'0.85em', opacity:0.8}}>• {canonGenere(it.genre)}</span>}
            {it.year && <span style={{fontSize:'0.85em', opacity:0.8}}>• {it.year}</span>}
            {hasWishlist && <span style={{fontSize:'0.8em', color:'#2b6cb0', backgroundColor:'#ebf8ff', padding:'0 4px', borderRadius:4}}>Wishlist</span>}
          </div>
          {it.finished_at && <div style={{marginTop:6, fontSize:'0.85em', color:'#718096', fontStyle:'italic'}}>🏁 Finito il: {new Date(it.finished_at).toLocaleDateString()}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 12, marginTop: 4, paddingTop: 12, borderTop: '1px solid #f0f4f8', flexWrap: 'wrap' }}>
        {it.video_url && ( <a href={it.video_url} target="_blank" rel="noopener noreferrer" className="ghost button" style={{ textDecoration: 'none', padding:'8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px' }}>{getLinkEmoji(it.video_url)}</a> )}
        {it.note && ( <button className="ghost" onClick={() => alert(it.note)} style={{padding:'8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px', lineHeight: 1}}>📝</button> )}
        
        {(!it.finished_at && !isArchived) && (
          <>
            <button className="ghost" onClick={() => onToggleFocus(it)} title={it.is_next ? "Pausa" : "Inizia"} style={{padding:'8px', fontSize:'1.2em', border: it.is_next ? '1px solid #38a169' : `1px solid ${BORDER_COLOR}`, backgroundColor: it.is_next ? '#f0fff4' : 'transparent', borderRadius: '8px'}}>
              {it.is_next ? "⏸️" : "🔥"}
            </button>
            {!it.is_next && (
              <button className="ghost" onClick={() => onToggleQueue(it)} title={isInQueue ? "Togli da Coda" : "Metti in Coda"} style={{padding:'8px', fontSize:'1.2em', border: isInQueue ? '1px solid #805ad5' : `1px solid ${BORDER_COLOR}`, backgroundColor: isInQueue ? '#faf5ff' : 'transparent', borderRadius: '8px'}}>
                ⏳
              </button>
            )}
          </>
        )}
        
        {hasWishlist && ( <button className="ghost" onClick={() => onMarkPurchased(it)} style={{padding:'8px', fontSize:'1.2em', color:'#2b6cb0', borderColor:'#bee3f8', border: `1px solid #bee3f8`, borderRadius: '8px'}}>🛒</button> )}
        {(it.finished_at || isArchived) ? (
          <>
            <button className="ghost" onClick={() => onReExperience(it)} style={{padding:'8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px'}}>🔄</button>
            <button className="ghost" onClick={() => onUnarchive(it)} style={{padding:'8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px'}}>↩️</button>
          </>
        ) : (
          <button className="ghost" onClick={() => onArchive(it)} style={{padding:'8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px'}}>📦</button>
        )}
        <button className="ghost" onClick={() => onEdit(it)} style={{ padding: '8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px' }}>✏️</button>
      </div>
    </div>
  );
});

/* =========================================
   4. APP PRINCIPALE
   ========================================= */

export default function App(){
  const [items,setItems] = useState([]);
  const [pinnedItems, setPinnedItems] = useState([]); 
  const [loading,setLoading] = useState(false); 
  const [visibleCount, setVisibleCount] = useState(50); 
  const [toasts, setToasts] = useState([]); 
  const [planTab, setPlanTab] = useState('active');

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

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== id)); }, 3000);
  }, []);

  const fetchPinnedItems = useCallback(async () => {
    const { data, error } = await supabase.from('items').select('*, note').eq('is_next', true).neq('status', 'archived'); 
    if (!error && data) {
      const adapted = data.map(row => ({...row, kind: normType(row.type), creator: row.author, sourcesArr: parseSources(row.source)}));
      setPinnedItems(adapted);
    }
  }, []);

  const fetchItems = useCallback(async () => {
    let query = supabase.from("items").select("id,title,creator:author,kind:type,status,created_at,genre,mood,year,sources:source,video_url,note,is_next,finished_at:ended_on").order("created_at", { ascending:false }).limit(500); 
    if (q) query = query.or(`title.ilike.%${q}%,author.ilike.%${q}%`);
    if (statusFilter) query = query.eq('status', statusFilter);
    if (typeFilter) query = query.eq('type', typeFilter);
    if (genreFilter) query = query.eq('genre', canonGenere(genreFilter));
    if (moodFilter) query = query.eq('mood', moodFilter);
    if (sourceFilter === 'Wishlist') query = query.or('source.ilike.%Wishlist%,source.ilike.%da comprare%');
    else if (sourceFilter) query = query.ilike('source', `%${sourceFilter}%`);
    if (letterFilter) query = query.ilike(letterMode === 'title' ? 'title' : 'author', `${letterFilter}%`);
    if (yearFilter) query = query.eq('year', Number(yearFilter));
    if (completionYearFilter) {
      const y = Number(completionYearFilter), m = completionMonthFilter ? Number(completionMonthFilter) : null;
      const start = m ? `${y}-${String(m).padStart(2,'0')}-01` : `${y}-01-01`;
      const end = m ? (m===12?`${y+1}-01-01`:`${y}-${String(m+1).padStart(2,'0')}-01`) : `${y+1}-01-01`;
      query = query.gte('ended_on', start).lt('ended_on', end);
    }
    const { data, error } = await query;
    if (error) console.error(error); 
    else setItems((data || []).map(row => ({...row, kind: normType(row.kind), creator: row.creator, sourcesArr: parseSources(row.sources)})));
    setLoading(false);
  }, [q, statusFilter, typeFilter, genreFilter, moodFilter, sourceFilter, letterFilter, letterMode, yearFilter, completionMonthFilter, completionYearFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const { count: total } = await supabase.from("items").select('*', { count: 'exact', head: true });
      const { count: archived } = await supabase.from("items").select('*', { count: 'exact', head: true }).or("ended_on.not.is.null, status.eq.archived");
      const typeProm = TYPES.map(t => supabase.from("items").select('*', { count: 'exact', head: true }).eq('type', t));
      const typeRes = await Promise.all(typeProm);
      const byType = typeRes.map((r, i) => ({ t: TYPES[i], n: r.count || 0 }));
      const { count: toBuy } = await supabase.from("items").select('*', { count: 'exact', head: true }).or('source.ilike.%Wishlist%,source.ilike.%da comprare%');
      setStats({ total: total??0, archived: archived??0, active: (total??0)-(archived??0), byType, bySource: [{s:'Wishlist',n:toBuy??0}] });
    } catch (e) { console.error(e); }
  }, []); 

  const fetchPeriodStats = useCallback(async () => {
    if (!statYear) return;
    setPeriodLoading(true);
    const y = Number(statYear), m = statMonth ? Number(statMonth) : null;
    const start = m ? `${y}-${String(m).padStart(2,'0')}-01` : `${y}-01-01`;
    const end = m ? (m===12?`${y+1}-01-01`:`${y}-${String(m+1).padStart(2,'0')}-01`) : `${y+1}-01-01`;
    const { data, error } = await supabase.from('items').select('type').gte('ended_on', start).lt('ended_on', end);
    if (!error) {
      const c = { total: 0, libro: 0, audiolibro: 0, film: 0, album: 0, video: 0, gioco: 0 };
      (data||[]).forEach(i => { c.total++; const t=normType(i.type); if(c[t]!==undefined) c[t]++; });
      setPeriodStats(c);
    }
    setPeriodLoading(false);
  }, [statYear, statMonth]); 

  useEffect(() => { setVisibleCount(50); }, [q, statusFilter, typeFilter, genreFilter, moodFilter, sourceFilter, letterFilter, completionYearFilter]);
  useEffect(() => { const h = () => { if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) setVisibleCount(p => p + 50); }; window.addEventListener('scroll', h); return () => window.removeEventListener('scroll', h); }, []);
  useEffect(() => { const t = setTimeout(() => { setQ(qInput.trim()); if(qInput.trim()) setStatusFilter(""); else setStatusFilter("active"); }, 250); return () => clearTimeout(t); }, [qInput]);

  const isSearchActive = useMemo(() => {
    return q.length > 0 || statusFilter !== 'active' || typeFilter || genreFilter || moodFilter || sourceFilter || letterFilter || yearFilter || completionYearFilter;
  }, [q, statusFilter, typeFilter, genreFilter, moodFilter, sourceFilter, letterFilter, yearFilter, completionYearFilter]);

  const addItem = useCallback(async (e) => {
    e.preventDefault(); if(!title.trim()) return;
    const payload = {
      title, author: creator, type: kind, status: isInstantArchive?"archived":"active",
      genre: showGenreInput(kind)?canonGenere(genre):null, year: year?Number(year):null,
      source: isToBuy?"Wishlist":"", mood: mood||null, video_url: videoUrl||null, note: note||null, 
      is_next: isInstantArchive?false:isNext, ended_on: isInstantArchive?(instantDate||new Date().toISOString().slice(0,10)):null
    };
    const { error } = await supabase.from("items").insert(payload);
    if(!error){
      setTitle(""); setCreator(""); setKind("libro"); setGenre(""); setYear(""); setMood(""); setVideoUrl(""); setNote(""); setIsNext(false); setIsInstantArchive(false); setInstantDate(""); setIsToBuy(false); setAddModalOpen(false); 
      showToast("Aggiunto!", "success"); if (isSearchActive) fetchItems(); fetchStats(); fetchPinnedItems();
    } else showToast(error.message, "error");
  }, [title, creator, kind, genre, year, mood, videoUrl, note, isNext, isInstantArchive, instantDate, isToBuy, isSearchActive, fetchItems, fetchStats, fetchPinnedItems, showToast]);

  const toggleQueue = useCallback(async (it) => {
    const currentSources = it.sourcesArr || [];
    const isInQueue = currentSources.some(s => s.toLowerCase() === "coda");
    
    if (!isInQueue) {
      const queueCount = items.filter(x => (x.sourcesArr||[]).some(s => s.toLowerCase() === "coda")).length;
      if (queueCount >= 7) { showToast("✋ Coda piena (Max 7)!", "error"); return; }
    }

    let newSources;
    if (isInQueue) newSources = currentSources.filter(s => s.toLowerCase() !== "coda");
    else newSources = [...currentSources, "Coda"];

    const newSourceStr = joinSources(newSources);
    const { error } = await supabase.from("items").update({ source: newSourceStr }).eq("id", it.id);
    if (!error) {
       setItems(prev => prev.map(x => x.id === it.id ? {...x, sourcesArr: parseSources(newSourceStr)} : x));
       showToast(isInQueue ? "Rimosso dalla Coda" : "Messo in Coda ⏳", "success");
    }
  }, [items, showToast]);

  const toggleFocus = useCallback(async (it) => {
    if (!it.is_next) {
      if (pinnedItems.length >= 3) { showToast("🧠 Sovraccarico! Max 3 in corso.", "error"); return; }
      const hasRelax = pinnedItems.some(p => p.mood === 'Relax');
      const hasFocus = pinnedItems.some(p => p.mood === 'Focus');
      if (it.mood === 'Relax' && hasRelax) { showToast("✋ Hai già un 'Relax' attivo.", "error"); return; }
      if (it.mood === 'Focus' && hasFocus) { showToast("✋ Hai già un 'Focus' attivo.", "error"); return; }
    } else {
        if(!window.confirm(`Metti in pausa "${it.title}"?`)) return;
    }

    const newVal = !it.is_next;
    const { error } = await supabase.from("items").update({ is_next: newVal }).eq("id", it.id);
    if (!error) { 
      setItems(prev => prev.map(x => x.id === it.id ? {...x, is_next: newVal} : x));
      fetchPinnedItems(); 
      showToast(newVal ? "In Corso 🔥" : "Messo in Pausa");
    }
  }, [pinnedItems, fetchPinnedItems, showToast]);

  const markAsPurchased = useCallback(async (it) => {
    const s = new Set(it.sourcesArr||[]); s.delete("Wishlist"); s.delete("da comprare");
    const { error } = await supabase.from("items").update({ source: joinSources(Array.from(s)) }).eq("id", it.id);
    if (!error) { setItems(p => p.map(x => x.id === it.id ? {...x, sourcesArr: parseSources(joinSources(Array.from(s)))} : x)); fetchStats(); showToast("Preso! 🛒", "success"); }
  }, [fetchStats, showToast]);

  const openArchiveModal = useCallback((it) => setArchModal({ id: it.id, title: it.title, kind: it.kind, sourcesArr: it.sourcesArr||[], dateISO: new Date().toISOString().slice(0,10) }), []);
  const saveArchiveFromModal = useCallback(async (m) => { await supabase.from("items").update({ status: "archived", ended_on: m.dateISO, source: joinSources(m.sourcesArr), is_next: false }).eq("id", m.id); setArchModal(null); showToast("Archiviato! 📦", "success"); if(isSearchActive) fetchItems(); fetchStats(); fetchPinnedItems(); if(statsModalOpen) fetchPeriodStats(); }, [isSearchActive, statsModalOpen, fetchItems, fetchStats, fetchPeriodStats, fetchPinnedItems, showToast]);
  const unarchive = useCallback(async (it) => { await supabase.from("items").update({ status: "active", ended_on: null }).eq("id", it.id); showToast("Ripristinato!", "success"); if(isSearchActive) fetchItems(); fetchStats(); }, [isSearchActive, fetchItems, fetchStats, showToast]);
  const reExperience = useCallback(async (it) => { if(!window.confirm("Rileggi?")) return; await supabase.from("items").insert({title:it.title, author:it.creator, type:it.kind, genre:it.genre, mood:it.mood, status:"active", is_next:true}); if(isSearchActive) fetchItems(); fetchStats(); fetchPinnedItems(); showToast("Nuova copia creata!", "success"); }, [isSearchActive, fetchItems, fetchStats, fetchPinnedItems, showToast]);
  const deleteItem = useCallback(async (id) => { await supabase.from('items').delete().eq('id', id); setEditState(null); setItems(p=>p.filter(x=>x.id!==id)); fetchStats(); fetchPinnedItems(); showToast("Eliminato.", "success"); }, [fetchStats, fetchPinnedItems, showToast]);
  const handleUpdateItem = useCallback(async (e) => { e.preventDefault(); const p = { title:editState.title, author:editState.creator, type:editState.type, genre:editState.genre, year:editState.year, mood:editState.mood, video_url:editState.video_url, note:editState.note, is_next:editState.is_next, source:editState.source }; await supabase.from("items").update(p).eq('id', editState.id); setItems(prev=>prev.map(i=>i.id===editState.id?{...i, ...p, kind:p.type, creator:p.author, sourcesArr:parseSources(p.source)}:i)); setEditState(null); fetchPinnedItems(); showToast("Salvato.", "success"); }, [editState, fetchPinnedItems, showToast]);
  
  const handleSuggest = useCallback(async () => { setSuggestion(null); const { data } = await supabase.rpc('get_random_suggestion', { p_kind: randKind, p_genre: randGenre||null, p_mood: randMood||null }); if(data&&data[0]) setSuggestion({...data[0], kind:normType(data[0].type)}); else showToast("Nessun risultato.", "error"); }, [randKind, randGenre, randMood, showToast]);
  const handleCleanupSuggest = useCallback(async () => { const d = new Date(); d.setMonth(d.getMonth()-6); const {data} = await supabase.from('items').select('*').eq('status','active').lt('created_at', d.toISOString()); if(data&&data.length) { const r=data[Math.floor(Math.random()*data.length)]; setCleanupItem({...r, kind:normType(r.type)}); setAdvOpen(false); } else showToast("Tutto pulito!", "success"); }, [showToast]);
  const confirmDeleteCleanup = useCallback(async () => { if(!cleanupItem) return; await deleteItem(cleanupItem.id); setCleanupItem(null); }, [cleanupItem, deleteItem]);

  const openEditModal = useCallback((it) => setEditState({ id:it.id, title:it.title, creator:it.creator, type:it.kind, genre:it.genre||'', year:it.year||'', mood:it.mood||'', video_url:it.video_url||'', note:it.note||'', is_next:it.is_next||false, source:joinSources(it.sourcesArr) }), []);
  const handleAddKindChange = useCallback((e) => { setKind(e.target.value); if(!showGenreInput(e.target.value)) setGenre(""); }, []);
  const clearAllFilters = useCallback(() => { setQ(""); setQInput(""); setTypeFilter(""); setGenreFilter(""); setMoodFilter(""); setSourceFilter(""); setLetterFilter(""); setYearFilter(""); setCompletionYearFilter(""); setStatusFilter("active"); }, []);
  const handleStatClick = useCallback((t) => { if(t) setTypeFilter(t); else setTypeFilter(""); setStatusFilter("archived"); setCompletionYearFilter(String(statYear)); setCompletionMonthFilter(String(statMonth)); setStatsModalOpen(false); }, [statYear, statMonth]);
  const handleFilterAuthor = useCallback((a) => { setQInput(a); window.scrollTo({top:0, behavior:'smooth'}); }, []);

  useEffect(()=>{ fetchStats(); fetchPinnedItems(); },[fetchStats, fetchPinnedItems]);
  useEffect(() => { if (isSearchActive) { setLoading(true); fetchItems(); } else { setItems([]); setLoading(false); } }, [isSearchActive, fetchItems]);
  useEffect(() => { if (statsModalOpen) fetchPeriodStats(); }, [statsModalOpen, statMonth, statYear, fetchPeriodStats]);
  useEffect(() => { (async () => { const { data } = await supabase.from('items').select('title, ended_on, author').not('ended_on', 'is', null); if(data&&data.length) { const r = data[Math.floor(Math.random()*data.length)]; setMemoryItem({...r, daysAgo: Math.ceil(Math.abs(new Date()-new Date(r.ended_on))/(86400000))}); } })(); }, []);

  return (
    <div className="app">
      <ToastContainer toasts={toasts} />
      <h1 style={{textAlign:'center'}}>Biblioteca personale</h1>
      
      {/* RICERCA STICKY */}
      <section className="card" style={{marginBottom:0, padding: "6px 12px", display:'flex', alignItems:'center', gap:8, backgroundColor:'#FFF9F0', borderRadius: 12, boxShadow:'0 1px 3px rgba(0,0,0,0.05)', position: 'sticky', top: 10, zIndex: 100}}>
        <div style={{flex:1, display:'flex', alignItems:'center', gap:8}}>
          <span style={{opacity:0.4, fontSize:'1.1em'}}>🔍</span>
          <input style={{width:'100%', border:'none', outline:'none', background:'transparent', fontSize:'1rem', padding:0, margin:0, height: 40}} placeholder="Cerca..." value={qInput} onChange={e=>setQInput(e.target.value)} />
          {qInput && <button onClick={() => { setQInput(""); setStatusFilter("active"); }} style={{background:'transparent', border:'none', fontSize:'1.1em', color:'#718096', cursor:'pointer', padding:'0 8px'}}>✖</button>}
        </div>
        <button className="ghost" onClick={()=>setStatsModalOpen(true)} style={{padding:'8px', fontSize:'1.1em', opacity:0.7}} title="Statistiche">📊</button>
        <button className="ghost" onClick={()=>setAdvOpen(true)} style={{padding:'8px', fontSize:'1.1em', opacity:0.7}} title="Menu Avanzato">⚙️</button>
      </section>

      {/* FILTRI ATTIVI */}
      {(statusFilter!=='active' || sourceFilter || genreFilter || moodFilter || yearFilter || letterFilter || completionYearFilter) && (
        <div style={{display:'flex', justifyContent:'space-between', padding:'12px', gap:12}}>
          <div style={{display:'flex', flexWrap:'wrap', gap:8, flex:1}}>
            <span style={{fontSize:'0.8em', opacity:0.6}}>Filtri:</span>
            {statusFilter!=='active' && <button className="ghost" onClick={()=>setStatusFilter('active')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0'}}>{statusFilter==='archived'?'📦 Archivio':'👁️ Tutto'} ✖</button>}
            {typeFilter && <button className="ghost" onClick={()=>setTypeFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0'}}>{TYPE_ICONS[typeFilter]} {typeFilter} ✖</button>}
            {sourceFilter && <button className="ghost" onClick={()=>setSourceFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#ebf8ff', color:'#2b6cb0'}}>{sourceFilter} ✖</button>}
            {genreFilter && <button className="ghost" onClick={()=>setGenreFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0'}}>{genreFilter} ✖</button>}
            {moodFilter && <button className="ghost" onClick={()=>setMoodFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#feebc8', color:'#c05621'}}>{moodFilter} ✖</button>}
            {yearFilter && <button className="ghost" onClick={()=>setYearFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0'}}>{yearFilter} ✖</button>}
            {letterFilter && <button className="ghost" onClick={()=>setLetterFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0'}}>{letterFilter} ✖</button>}
            {completionYearFilter && <button className="ghost" onClick={()=>{setCompletionYearFilter(''); setCompletionMonthFilter('');}} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#fbb6ce', color:'#822727'}}>{completionYearFilter} ✖</button>}
          </div>
          <button className="ghost" onClick={clearAllFilters} style={{fontSize:'0.85em', fontWeight:'600', color:'#fd8383ff'}}>Pulisci</button>
        </div>
      )}

      {/* PIANO DI LETTURA (HOME) */}
      {!isSearchActive && !loading && (
        <>
          <section className="card" style={{marginTop: 12, marginBottom:12, borderLeft: planTab === 'active' ? '4px solid #38a169' : '4px solid #805ad5', backgroundColor: planTab === 'active' ? '#f0fff4' : '#faf5ff', padding:'0', overflow:'hidden', transition:'all 0.3s'}}>
            <div style={{display:'flex', borderBottom:'1px solid rgba(0,0,0,0.05)'}}>
              <button onClick={() => setPlanTab('active')} style={{flex:1, padding:'12px', border:'none', background: planTab === 'active' ? 'rgba(255,255,255,0.6)' : 'transparent', color: planTab === 'active' ? '#22543d' : '#718096', fontWeight:'bold', cursor:'pointer', borderRight:'1px solid rgba(0,0,0,0.05)'}}>🔥 In Corso ({pinnedItems.length}/3)</button>
              <button onClick={() => setPlanTab('queue')} style={{flex:1, padding:'12px', border:'none', background: planTab === 'queue' ? 'rgba(255,255,255,0.6)' : 'transparent', color: planTab === 'queue' ? '#553c9a' : '#718096', fontWeight:'bold', cursor:'pointer'}}>⏳ In Coda ({items.filter(i => (i.sourcesArr||[]).some(s => s.toLowerCase() === 'coda')).length})</button>
            </div>
            <div style={{padding:'12px 16px', minHeight: 100}}>
              {/* VISTA 1: IN CORSO */}
              {planTab === 'active' && (
                <div style={{animation:'fadeIn 0.3s'}}>
                  {pinnedItems.length === 0 ? <p style={{textAlign:'center', opacity:0.6, fontStyle:'italic'}}>Nessun progetto attivo.</p> : (
                    <div style={{display:'flex', flexDirection:'column', gap:12}}>
                      {pinnedItems.map((p) => (
                        <div key={p.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor:'rgba(255,255,255,0.5)', padding:8, borderRadius:8}}>
                          <div style={{flex: 1}}>
                            <div style={{fontWeight:'600', color:'#2f855a'}}>{TYPE_ICONS[p.kind]} {p.title}</div>
                            {/* AUTORE & UMORE */}
                            <div style={{display:'flex', alignItems:'center', gap:6, marginTop:2}}>
                                <span style={{fontSize:'0.85em', color:'#276749', opacity:0.9}}>{p.creator}</span>
                                {p.mood && <span style={{fontSize:'0.65em', padding:'2px 6px', borderRadius:6, backgroundColor:'#fff', border:'1px solid #c6f6d5', color:'#276749'}}>{p.mood}</span>}
                            </div>
                          </div>
                          <button className="ghost" onClick={() => openArchiveModal(p)} title="Finito! Archivia" style={{fontSize:'1.2em', padding:'6px', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px', backgroundColor:'white'}}>📦</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {pinnedItems.length >= 3 && <div style={{marginTop:12, padding:8, backgroundColor:'#fed7d7', color:'#822727', borderRadius:8, fontSize:'0.85em', textAlign:'center'}}>🛑 <strong>Slot pieni (3/3).</strong></div>}
                </div>
              )}
              {/* VISTA 2: IN CODA */}
              {planTab === 'queue' && (
                <div style={{animation:'fadeIn 0.3s'}}>
                   {items.filter(i => (i.sourcesArr||[]).some(s => s.toLowerCase() === 'coda')).length === 0 ? <p style={{textAlign:'center', opacity:0.6}}>La coda è vuota.</p> : (
                     items.filter(i => (i.sourcesArr||[]).some(s => s.toLowerCase() === 'coda')).map(w => (
                       <div key={w.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom:8, paddingBottom:8, borderBottom:'1px dashed rgba(0,0,0,0.1)'}}>
                          <div style={{flex: 1}}>
                            <div style={{color:'#44337a', fontWeight:'600'}}>{TYPE_ICONS[w.kind]} {w.title}</div>
                            {/* AUTORE & UMORE */}
                            <div style={{display:'flex', alignItems:'center', gap:6, marginTop:2}}>
                                <span style={{fontSize:'0.85em', color:'#553c9a', opacity:0.8}}>{w.creator}</span>
                                {w.mood && <span style={{fontSize:'0.65em', marginLeft:6, opacity:0.7, border:'1px solid #d6bc9b', borderRadius:4, padding:'0 4px', backgroundColor:'white'}}>{w.mood}</span>}
                            </div>
                          </div>
                          <div style={{display:'flex', gap:4}}>
                            <button className="ghost" onClick={() => toggleFocus(w)} title="Inizia ora" style={{fontSize:'1.1em', padding:'4px 8px', borderRadius:'6px', backgroundColor:'white', border:'1px solid #bee3f8', cursor:'pointer'}}>🔥</button>
                            <button className="ghost" onClick={() => toggleQueue(w)} title="Rimuovi" style={{fontSize:'1.1em', padding:'4px 8px', borderRadius:'6px', backgroundColor:'white', border:'1px solid #e2e8f0', color:'#e53e3e', cursor:'pointer'}}>✖</button>
                          </div>
                       </div>
                     ))
                   )}
                </div>
              )}
            </div>
          </section>

          {/* ALTRI BLOCCHI HOME */}
          {memoryItem && (<div className="card" style={{marginTop:12, marginBottom:12, backgroundColor:'transparent', border:'1px dashed #cbd5e0', padding:'10px 12px'}}><p style={{fontSize:'0.85rem', color:'#718096', margin:0, textAlign:'center', fontStyle:'italic'}}>🕰️ {memoryItem.daysAgo < 30 ? `${memoryItem.daysAgo} giorni fa` : `${Math.floor(memoryItem.daysAgo / 30)} mesi fa`} finivi <strong>{memoryItem.title}</strong></p></div>)}
          {suggestion && (
            <section className="card" style={{marginBottom:12, borderLeft: '4px solid #ed8936', backgroundColor: '#fffaf0', padding:'12px 16px'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                <div style={{flex:1}}> 
                  <h3 style={{marginTop:0, marginBottom:4, fontSize:'1em', color:'#c05621'}}>🎲 Perché non provi...</h3>
                  <div style={{fontSize:'1.1em', fontWeight:'bold', marginBottom:2}}>{suggestion.title}</div>
                  <div style={{fontSize:'0.9em', opacity:0.8, marginBottom:8}}>{TYPE_ICONS[suggestion.kind]} {suggestion.author}</div>
                  <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>{suggestion.mood && <span className="badge mood-badge" style={{backgroundColor:'#bee3f8', color:'#2a4365'}}>{suggestion.mood}</span>}{suggestion.genre && <span className="badge" style={{backgroundColor:'#edf2f7', color:'#4a5568'}}>{suggestion.genre}</span>}</div>
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:8, alignItems:'center'}}>
                   {suggestion.video_url && (<a href={suggestion.video_url} target="_blank" rel="noopener noreferrer" className="ghost button" style={{display:'flex', alignItems:'center', justifyContent:'center', width:40, height:40, borderRadius:'50%', backgroundColor:'#feebc8', textDecoration:'none', fontSize:'1.4em'}}>{getLinkEmoji(suggestion.video_url)}</a>)}
                   {!suggestion.is_next && (<button className="ghost" onClick={() => { toggleFocus(suggestion); setSuggestion(null); }} style={{display:'flex', alignItems:'center', justifyContent:'center', width:40, height:40, borderRadius:'50%', backgroundColor:'#c6f6d5', color:'#2f855a', fontSize:'1.4em', border:'1px solid #9ae6b4', cursor:'pointer'}}>📌</button>)}
                </div>
              </div>
            </section>
          )}
          <section className="card" style={{marginBottom:16, marginTop:16, padding:'12px', backgroundColor:'#FDF8F2', borderRadius:16, border:'1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.03)'}}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <div style={{display:'flex', gap:8, flex:1, minWidth:0}}>
                <select value={randKind} onChange={e=>setRandKind(e.target.value)} style={{flex:1, minWidth:0, padding:'10px 4px', borderRadius:10, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', fontSize:'0.9em', color:'#2d3748', textOverflow:'ellipsis'}}>{TYPES.filter(t => t !== 'audiolibro').map(t=> <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}</select>
                <select value={randMood} onChange={e=>setRandMood(e.target.value)} style={{flex:1, minWidth:0, padding:'10px 4px', borderRadius:10, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', fontSize:'0.9em', color:'#2d3748', textOverflow:'ellipsis'}}><option value="">Umore</option>{MOODS.map(m=> <option key={m} value={m}>{m}</option>)}</select>
                {showGenreInput(randKind) && (<select value={randGenre} onChange={e=>setRandGenre(e.target.value)} style={{flex:1, minWidth:0, padding:'10px 4px', borderRadius:10, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', fontSize:'0.9em', color:'#2d3748', textOverflow:'ellipsis'}}><option value="">Genere</option>{GENRES.map(g=> <option key={g} value={g}>{g}</option>)}</select>)}
              </div>
              <button onClick={handleSuggest} style={{width:48, height:48, borderRadius:12, border:'1px solid #ed8936', backgroundColor:'#FDF8F2', color:'#ed8936', fontSize:'1.6rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 5px rgba(237, 137, 54, 0.3)', flexShrink:0}}>🎲</button>
            </div>
          </section>
        </>
      )}
      
      {/* LISTA RISULTATI (SEMPRE AGGIORNATA) */}
      {isSearchActive && (
        <section className="card" style={{marginTop: 12}}>
          {loading ? <p>Caricamento…</p> : (
            <div className="list" style={{ gap: 16, display: 'flex', flexDirection: 'column' }}>
              {items.slice(0, visibleCount).map(it => (
                <LibraryItem key={it.id} it={it} isArchiveView={statusFilter === 'archived'} onToggleFocus={toggleFocus} onToggleQueue={toggleQueue} onMarkPurchased={markAsPurchased} onArchive={openArchiveModal} onEdit={openEditModal} onReExperience={reExperience} onUnarchive={unarchive} onFilterAuthor={handleFilterAuthor} />
              ))}
              {items.length === 0 && <p style={{opacity:.8, textAlign:'center'}}>Nessun elemento trovato.</p>}
              {items.length > visibleCount && <div style={{textAlign:'center', padding:20, color:'#718096', fontStyle:'italic'}}>Scorri per caricare altri elementi...</div>}
            </div>
          )}
        </section>
      )}

      <button onClick={() => setAddModalOpen(true)} className="fab">+</button>
      
      {/* ===== MODALI FIXED E RESPONSIVE ===== */}
      {/* Modale Aggiunta */}
      {addModalOpen && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center'}} onClick={()=>setAddModalOpen(false)}>
          <div className="card" style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '90%', maxWidth: '500px', maxHeight: '85vh', overflowY: 'auto', padding:"20px 24px", borderRadius: 20, backgroundColor:'#FDF8F2'}} onClick={e=>e.stopPropagation()}>
            <h2 style={{marginTop:0, fontSize:'1.4rem', color:'#2d3748', textAlign:'center'}}>Nuovo Elemento</h2>
            <form onSubmit={addItem} id="add-form" style={{display:'flex', flexDirection:'column', gap:12}}>
              <input placeholder="Titolo" value={title} onChange={e=>setTitle(e.target.value)} style={{padding:'12px', fontSize:'1.1rem', borderRadius:12, border:`1px solid ${BORDER_COLOR}`, background:'transparent'}} autoFocus />
              <input placeholder="Autore" value={creator} onChange={e=>setCreator(e.target.value)} style={{padding:'12px', borderRadius:12, border:`1px solid ${BORDER_COLOR}`, background:'transparent'}} />
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <select value={kind} onChange={handleAddKindChange} style={{padding:'10px', borderRadius:12, border:`1px solid ${BORDER_COLOR}`, background:'transparent'}}>{TYPES.filter(t=>t!=='audiolibro').map(t=><option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}</select>
                <input type="number" placeholder="Anno" value={year} onChange={e=>setYear(e.target.value)} style={{padding:'10px', borderRadius:12, border:`1px solid ${BORDER_COLOR}`, background:'transparent'}} />
                {showGenreInput(kind)?<select value={genre} onChange={e=>setGenre(e.target.value)} style={{padding:'10px', borderRadius:12, border:`1px solid ${BORDER_COLOR}`, background:'transparent'}}><option value="">Genere</option>{GENRES.map(g=><option key={g} value={g}>{g}</option>)}</select>:<div></div>}
                <select value={mood} onChange={e=>setMood(e.target.value)} style={{padding:'10px', borderRadius:12, border:`1px solid ${BORDER_COLOR}`, background:'transparent'}}><option value="">Umore</option>{MOODS.map(m=><option key={m} value={m}>{m}</option>)}</select>
              </div>
              <input placeholder="Link" value={videoUrl} onChange={e=>setVideoUrl(e.target.value)} style={{padding:'10px', borderRadius:12, border:`1px solid ${BORDER_COLOR}`, background:'transparent'}} />
              <textarea placeholder="Note..." value={note} onChange={e=>setNote(e.target.value)} rows={3} style={{padding:'10px', borderRadius:12, border:`1px solid ${BORDER_COLOR}`, background:'transparent'}} />
              <div style={{marginTop:8, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
                  <div onClick={()=>setIsToBuy(!isToBuy)} style={{border:isToBuy?'2px solid #3182ce':`1px solid ${BORDER_COLOR}`, backgroundColor:isToBuy?'#ebf8ff':'transparent', borderRadius:12, padding:'10px 4px', textAlign:'center'}}>🛒 Wishlist</div>
                  <div onClick={()=>{setIsNext(!isNext); if(!isNext) setIsInstantArchive(false);}} style={{border:isNext?'2px solid #38a169':`1px solid ${BORDER_COLOR}`, backgroundColor:isNext?'#f0fff4':'transparent', borderRadius:12, padding:'10px 4px', textAlign:'center'}}>📌 In Corso</div>
                  <div onClick={()=>{setIsInstantArchive(!isInstantArchive); if(!isInstantArchive) setIsNext(false);}} style={{border:isInstantArchive?'2px solid #d69e2e':`1px solid ${BORDER_COLOR}`, backgroundColor:isInstantArchive?'#fffff0':'transparent', borderRadius:12, padding:'10px 4px', textAlign:'center'}}>✅ Finito</div>
              </div>
              {isInstantArchive && <input type="date" value={instantDate} onChange={e=>setInstantDate(e.target.value)} style={{marginTop:8, padding:'6px', borderRadius:8, border:`1px solid ${BORDER_COLOR}`, background:'transparent'}} />}
            </form>
            <div style={{display:'flex', gap:12, marginTop:24}}>
              <button className="ghost" onClick={()=>setAddModalOpen(false)} style={{flex:1}}>Annulla</button>
              <button type="submit" form="add-form" style={{flex:2, padding:'14px', borderRadius:12, backgroundColor:'#3e3e3e', color:'white', fontWeight:'600'}}>Salva</button>
            </div>
          </div>
        </div>
      )}

      {/* Modale Avanzato */}
      {advOpen && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center'}} onClick={()=>setAdvOpen(false)}>
          <div className="card" style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '90%', maxWidth: '500px', maxHeight: '85vh', overflowY: 'auto', padding:"20px", borderRadius:20, backgroundColor:'#FDF8F2'}} onClick={e=>e.stopPropagation()}>
            <h2 style={{marginTop:0, textAlign:'center'}}>Filtri & Strumenti</h2>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20}}>
                <button onClick={()=>{setStatusFilter('active'); setAdvOpen(false);}} style={{padding:12, borderRadius:12, border:'1px solid #d6bc9b', background:'white'}}>👁️ Tutto</button>
                <button onClick={()=>{setSourceFilter('Wishlist'); setAdvOpen(false);}} style={{padding:12, borderRadius:12, border:'1px solid #bee3f8', background:'#ebf8ff', color:'#2b6cb0'}}>🛒 Wishlist</button>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:16}}>
               <button className="ghost" onClick={()=>exportItemsToCsv(items)} style={{padding:12, border:`1px solid ${BORDER_COLOR}`, borderRadius:12}}>📤 Esporta CSV</button>
               <button onClick={()=>setAdvOpen(false)} style={{padding:'12px', borderRadius:12, backgroundColor:'#3e3e3e', color:'white'}}>Chiudi</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modale Statistiche */}
      {statsModalOpen && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center'}} onClick={()=>setStatsModalOpen(false)}>
           <div className="card" style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '90%', maxWidth: '600px', maxHeight: '85vh', overflowY: 'auto', backgroundColor:'#FDF8F2', padding:20, borderRadius:20}} onClick={e=>e.stopPropagation()}>
              <h2 style={{marginTop:0, textAlign:'center'}}>Statistiche</h2>
              <div style={{textAlign:'center', marginBottom:20}}>
                 <div style={{fontSize:'3em', fontWeight:'bold'}}>{stats.total}</div>
                 <div>Elementi Totali</div>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
                 <div style={{padding:10, background:'white', borderRadius:8}}>In Corso: <strong>{stats.active}</strong></div>
                 <div style={{padding:10, background:'white', borderRadius:8}}>Archiviati: <strong>{stats.archived}</strong></div>
              </div>
              <button onClick={()=>setStatsModalOpen(false)} style={{marginTop:20, width:'100%', padding:12, backgroundColor:'#3e3e3e', color:'white', borderRadius:12}}>Chiudi</button>
           </div>
        </div>
      )}

      {/* Modale Archivia */}
      {archModal && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center'}} onClick={()=>setArchModal(null)}>
           <div className="card" style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '90%', maxWidth: '500px', padding:20, backgroundColor:'white', borderRadius:16}} onClick={e=>e.stopPropagation()}>
              <h3>Archivia: {archModal.title}</h3>
              <input type="date" value={archModal.dateISO} onChange={e=>setArchModal({...archModal, dateISO:e.target.value})} style={{width:'100%', padding:10, margin:'10px 0'}} />
              <div style={{display:'flex', gap:12, marginTop:16}}>
                 <button onClick={()=>saveArchiveFromModal(archModal)}>Conferma</button>
                 <button className="ghost" onClick={()=>setArchModal(null)}>Annulla</button>
              </div>
           </div>
        </div>
      )}
      
      {/* Modale Modifica */}
      {editState && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center'}} onClick={()=>setEditState(null)}>
           <div className="card" style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '90%', maxWidth: '500px', maxHeight: '85vh', overflowY: 'auto', padding:20, backgroundColor:'white', borderRadius:16}} onClick={e=>e.stopPropagation()}>
              <h3>Modifica</h3>
              <form onSubmit={handleUpdateItem} id="edit-form" style={{display:'flex', flexDirection:'column', gap:12}}>
                 <input placeholder="Titolo" value={editState.title} onChange={e=>setEditState({...editState, title:e.target.value})} style={{padding:'10px', borderRadius:8, border:`1px solid ${BORDER_COLOR}`}} />
                 <input placeholder="Autore" value={editState.creator} onChange={e=>setEditState({...editState, creator:e.target.value})} style={{padding:'10px', borderRadius:8, border:`1px solid ${BORDER_COLOR}`}} />
                 <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                    <select value={editState.type} onChange={e=>setEditState({...editState, type:e.target.value})} style={{padding:'10px', borderRadius:8, border:`1px solid ${BORDER_COLOR}`}}>{TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select>
                    {showGenreInput(editState.type) ? <select value={editState.genre} onChange={e=>setEditState({...editState, genre:e.target.value})} style={{padding:'10px', borderRadius:8, border:`1px solid ${BORDER_COLOR}`}}><option value="">Genere</option>{GENRES.map(g=><option key={g} value={g}>{g}</option>)}</select> : <div></div>}
                 </div>
                 <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                    <input type="number" placeholder="Anno" value={editState.year} onChange={e=>setEditState({...editState, year:e.target.value})} style={{padding:'10px', borderRadius:8, border:`1px solid ${BORDER_COLOR}`}} />
                    <select value={editState.mood||""} onChange={e=>setEditState({...editState, mood:e.target.value})} style={{padding:'10px', borderRadius:8, border:`1px solid ${BORDER_COLOR}`}}><option value="">Umore</option>{MOODS.map(m=><option key={m} value={m}>{m}</option>)}</select>
                 </div>
                 <input placeholder="Link" value={editState.video_url} onChange={e=>setEditState({...editState, video_url:e.target.value})} style={{padding:'10px', borderRadius:8, border:`1px solid ${BORDER_COLOR}`}} />
                 <textarea placeholder="Note..." value={editState.note} onChange={e=>setEditState({...editState, note:e.target.value})} rows={3} style={{padding:'10px', borderRadius:8, border:`1px solid ${BORDER_COLOR}`}} />
                 <div style={{display:'flex', alignItems:'center', gap:8, padding:8, border:`1px solid ${BORDER_COLOR}`, borderRadius:8}}>
                    <input type="checkbox" checked={parseSources(editState.source).includes('Wishlist')} onChange={e=>{const active=e.target.checked; const current=parseSources(editState.source).filter(x=>x!=='Wishlist'&&x!=='da comprare'); if(active) current.push('Wishlist'); setEditState({...editState, source:joinSources(current)})}} />
                    <span>🛒 Wishlist</span>
                 </div>
                 <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <input type="checkbox" checked={editState.is_next} onChange={e=>setEditState({...editState, is_next:e.target.checked})} />
                    <span>📌 In Corso</span>
                 </div>
              </form>
              <div style={{display:'flex', gap:12, marginTop:16}}>
                 <button type="submit" form="edit-form">Salva</button>
                 <button className="ghost" onClick={()=>setEditState(null)}>Annulla</button>
                 <button className="ghost" style={{color:'red'}} onClick={()=>{if(confirm("Eliminare?")) deleteItem(editState.id)}}>Elimina</button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
}