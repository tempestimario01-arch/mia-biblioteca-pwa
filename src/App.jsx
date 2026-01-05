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
   2. HELPER FUNCTIONS (Logiche Pure)
   ========================================= */

function showGenreInput(t) { return t === 'libro' || t === 'video'; }

function canonGenere(g){
  if(!g) return "";
  const x = String(g).toLowerCase().trim();
  return GENRE_ALIAS[x] || x;
}
function normType(v){ return String(v ?? "").trim().toLowerCase(); }

// LOGICA WISHLIST E CODA
function parseSources(str){
  if (!str) return [];
  return String(str).toLowerCase().split(/[,;/|+]+/).map(s => {
    const clean = s.trim();
    if (clean === "da comprare" || clean === "wishlist") return "Wishlist";
    if (clean === "coda" || clean === "in coda") return "Coda"; // MODIFICA: Riconosce la Coda
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
   3. COMPONENTI UI ISOLATI (Performance)
   ========================================= */

// TOAST NOTIFICATION COMPONENT
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

// LIBRARY ITEM (Card ottimizzata con React.memo)
const LibraryItem = memo(({ 
  it, 
  isArchiveView, 
  onToggleFocus, 
  onToggleQueue, // MODIFICA: Aggiunto prop per la coda
  onMarkPurchased, 
  onArchive, 
  onEdit, 
  onReExperience, 
  onUnarchive, 
  onFilterAuthor 
}) => {
  const isArchived = it.status === 'archived';
  const hasWishlist = (it.sourcesArr || []).includes('Wishlist');
  const isInQueue = (it.sourcesArr || []).some(s => s.toLowerCase() === 'coda'); // MODIFICA: Controllo coda

  // LOGICA VISIVA
  const opacityValue = (isArchived && !isArchiveView) ? 0.6 : 1;
  // MODIFICA: Bordo Colorato in base allo stato
  const borderStyle = it.is_next ? '4px solid #38a169' : (isInQueue ? '4px solid #805ad5' : '1px solid #e2e8f0');

  return (
    <div className="card" style={{ 
      padding: 16, 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 12, 
      borderLeft: borderStyle, // MODIFICA: Bordo applicato
      backgroundColor: 'white', 
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      transform: 'translateZ(0)' 
    }}>
      {/* ZONA 1: INFO */}
      <div style={{ opacity: opacityValue, transition: 'opacity 0.3s' }}>
        <div className="item-title" style={{ fontSize: '1.1rem', marginBottom: 6, display: 'flex', alignItems: 'center' }}>
          {it.is_next && <span title="In Corso" style={{ marginRight: 6 }}>🔥</span>} 
          {!it.is_next && isInQueue && <span title="In Coda" style={{ marginRight: 6 }}>⏳</span>}
          {it.title}
        </div>
        <div className="item-meta" style={{ fontSize: '0.9rem', color: '#4a5568', lineHeight: 1.6 }}>
          {/* AUTORE CLICCABILE */}
          <div 
            onClick={() => onFilterAuthor(it.creator)} 
            title="Filtra per questo autore"
            style={{
              fontWeight: 500, marginBottom: 4, cursor: 'pointer', 
              textDecoration: 'underline', textDecorationColor: 'rgba(0,0,0,0.1)', textUnderlineOffset: '3px'
            }}
          >
            {TYPE_ICONS[it.kind]} {it.creator}
          </div>
           
          <div style={{display:'flex', flexWrap:'wrap', gap:6, alignItems:'center', marginTop:4}}>
            {it.mood && <span className="badge mood-badge" style={{ backgroundColor: '#ebf8ff', color: '#2c5282' }}>{it.mood}</span>}
            {it.genre && showGenreInput(it.kind) && <span style={{fontSize:'0.85em', opacity:0.8}}>• {canonGenere(it.genre)}</span>}
            {it.year && <span style={{fontSize:'0.85em', opacity:0.8}}>• {it.year}</span>}
            {Array.isArray(it.sourcesArr) && it.sourcesArr.includes("Wishlist") && (
              <span style={{ marginLeft: 6, display:'inline-flex', gap:4, opacity:0.9 }}>
                 <span title="Wishlist">🛒</span>
              </span>
            )}
          </div>
          {it.finished_at && <div style={{marginTop:6, fontSize:'0.85em', color:'#718096', fontStyle:'italic'}}>🏁 Finito il: {new Date(it.finished_at).toLocaleDateString()}</div>}
        </div>
      </div>
       
      {/* ZONA 2: AZIONI (Allineate a SINISTRA) */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 12, marginTop: 4, paddingTop: 12, borderTop: '1px solid #f0f4f8', flexWrap: 'wrap' }}>
        {it.video_url && ( <a href={it.video_url} target="_blank" rel="noopener noreferrer" className="ghost button" title="Apri Link" style={{ textDecoration: 'none', padding:'8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px' }}>{getLinkEmoji(it.video_url)}</a> )}
        {it.note && (
          <button className="ghost" onClick={() => alert(it.note)} title="Leggi nota personale" style={{padding:'8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px', lineHeight: 1}}>📝</button>
        )}
        
        {(!it.finished_at && !isArchived) && (
          <>
             {/* MODIFICA: Tasto Fuoco con toggle */}
             <button className="ghost" onClick={() => onToggleFocus(it)} title={it.is_next ? "Togli Focus" : "Metti Focus"} style={{padding:'8px', fontSize:'1.2em', border: it.is_next ? '1px solid #38a169' : `1px solid ${BORDER_COLOR}`, backgroundColor: it.is_next ? '#f0fff4' : 'transparent', borderRadius: '8px'}}>
               {it.is_next ? "⏸️" : "🔥"}
             </button>
             
             {/* MODIFICA: Tasto Coda (Clessidra) aggiunto */}
             {!it.is_next && (
               <button className="ghost" onClick={() => onToggleQueue(it)} title={isInQueue ? "Rimuovi dalla Coda" : "Metti in Coda"} style={{padding:'8px', fontSize:'1.2em', border: isInQueue ? '1px solid #805ad5' : `1px solid ${BORDER_COLOR}`, backgroundColor: isInQueue ? '#faf5ff' : 'transparent', borderRadius: '8px'}}>
                 ⏳
               </button>
             )}
          </>
        )}
        
        {hasWishlist && (
          <button className="ghost" onClick={() => onMarkPurchased(it)} title="Ho comprato! Rimuovi dalla lista." style={{padding:'8px', fontSize:'1.2em', color:'#2b6cb0', borderColor:'#bee3f8', border: `1px solid #bee3f8`, borderRadius: '8px'}}>🛒</button>
        )}

        {(it.finished_at || isArchived) ? (
          <>
            <button className="ghost" onClick={() => onReExperience(it)} title="Rileggi/Riguarda" style={{padding:'8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px'}}>🔄</button>
            <button className="ghost" onClick={() => onUnarchive(it)} title="Ripristina" style={{padding:'8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px'}}>↩️</button>
          </>
        ) : (
          <button className="ghost" onClick={() => onArchive(it)} title="Archivia" style={{padding:'8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px'}}>📦</button>
        )}
        <button className="ghost" onClick={() => onEdit(it)} title="Modifica" style={{ padding: '8px', fontSize:'1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px' }}>✏️</button>
      </div>
    </div>
  );
});

/* =========================================
   4. APP PRINCIPALE
   ========================================= */

export default function App(){
  
  /* --- 1. STATI --- */
  const [items,setItems] = useState([]);
  const [pinnedItems, setPinnedItems] = useState([]); 
  const [loading,setLoading] = useState(false); 
  const [visibleCount, setVisibleCount] = useState(50); // INFINITE SCROLL STATE
  const [toasts, setToasts] = useState([]); // TOAST NOTIFICATIONS

  // MODIFICA: Stato per le Tab (Piano di Lettura)
  const [planTab, setPlanTab] = useState('active'); // 'active' oppure 'queue'

  // Stats
  const [stats, setStats] = useState({
    total: 0, active: 0, archived: 0, byType: [], bySource: []
  });
  const [periodStats, setPeriodStats] = useState({ total: 0, libro: 0, audiolibro: 0, film: 0, album: 0, video: 0, gioco: 0 });
  const [periodLoading, setPeriodLoading] = useState(false);

  // Filtri Principali
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState(""); 
  const [statusFilter, setStatusFilter] = useState("active"); 
  const [typeFilter,setTypeFilter] = useState("");
  const [genreFilter,setGenreFilter] = useState("");
  const [moodFilter, setMoodFilter] = useState("");
  const [sourceFilter,setSourceFilter] = useState(""); 
  
  // NOVITÀ: Filtro Lettera Avanzato
  const [letterFilter, setLetterFilter] = useState("");
  const [letterMode, setLetterMode] = useState("author"); // "author" oppure "title"

  const [yearFilter, setYearFilter] = useState(""); 

  // Filtri Nascosti
  const [completionMonthFilter, setCompletionMonthFilter] = useState("");
  const [completionYearFilter, setCompletionYearFilter] = useState("");

  // Modali
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [advOpen, setAdvOpen] = useState(false); 
  const [archModal, setArchModal] = useState(null); 
  const [statsModalOpen, setStatsModalOpen] = useState(false); 
  const [statsView, setStatsView] = useState('periodo'); 
  const [editState, setEditState] = useState(null);
  
  // Clean Up
  const [cleanupItem, setCleanupItem] = useState(null);

  // Form Aggiunta
  const [title,setTitle] = useState("");
  const [creator,setCreator] = useState("");
  const [kind,setKind] = useState("libro");
  const [genre,setGenre] = useState("");
  const [mood, setMood] = useState(""); 
  const [videoUrl, setVideoUrl] = useState("");
  const [year,setYear] = useState("");
  const [note, setNote] = useState(""); 
  const [isNext, setIsNext] = useState(false);
  
  // Aggiunta Avanzata
  const [isInstantArchive, setIsInstantArchive] = useState(false);
  const [instantDate, setInstantDate] = useState("");
  const [isToBuy, setIsToBuy] = useState(false); 

  // Random / Suggerimenti
  const [randKind,setRandKind] = useState("libro");
  const [randGenre,setRandGenre] = useState("");
  const [randMood, setRandMood] = useState(""); 
  const [suggestion, setSuggestion] = useState(null); 

  // Memory Lane
  const [memoryItem, setMemoryItem] = useState(null);

  // Input Stats Periodo
  const [statMonth,setStatMonth] = useState(new Date().getMonth() + 1);
  const [statYear,setStatYear] = useState(new Date().getFullYear());


  /* --- 2. SISTEMA NOTIFICHE (TOAST) --- */
  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);


  /* --- 3. FUNZIONI ASINCRONE --- */

  const fetchPinnedItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('items')
      .select('*, note') 
      .eq('is_next', true)
      .neq('status', 'archived'); 
    
    if (!error && data) {
      const adapted = data.map(row => ({
        ...row,
        kind: normType(row.type), 
        creator: row.author, 
        sourcesArr: parseSources(row.source) 
      }));
      setPinnedItems(adapted);
    }
  }, []);

  const fetchItems = useCallback(async () => {
    let query = supabase
      .from("items")
      .select("id,title,creator:author,kind:type,status,created_at,genre,mood,year,sources:source,video_url,note,is_next,finished_at:ended_on")
      .order("created_at", { ascending:false })
      .limit(500); 

    if (q) { query = query.or(`title.ilike.%${q}%,author.ilike.%${q}%`); }
    if (statusFilter) { query = query.eq('status', statusFilter); }
    if (typeFilter) { query = query.eq('type', typeFilter); }
    if (genreFilter) { query = query.eq('genre', canonGenere(genreFilter)); }
    if (moodFilter) { query = query.eq('mood', moodFilter); }
    
    if (sourceFilter === 'Wishlist') { query = query.or('source.ilike.%Wishlist%,source.ilike.%da comprare%'); }
    else if (sourceFilter) { query = query.ilike('source', `%${sourceFilter}%`); }
    
    // NUOVA LOGICA: Filtra per autore OPPURE per titolo in base allo switch
    if (letterFilter) { 
      const columnToSearch = letterMode === 'title' ? 'title' : 'author';
      query = query.ilike(columnToSearch, `${letterFilter}%`); 
    }

    if (yearFilter) { query = query.eq('year', Number(yearFilter)); }

    if (completionYearFilter && completionMonthFilter) {
      const year = Number(completionYearFilter);
      const month = Number(completionMonthFilter); 
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
      query = query.gte('ended_on', startDate).lt('ended_on', endDate);
    } else if (completionYearFilter) {
      const year = Number(completionYearFilter);
      const startDate = `${year}-01-01`;
      const endDate = `${year + 1}-01-01`;
      query = query.gte('ended_on', startDate).lt('ended_on', endDate);
    }

    const { data, error } = await query;
    if (error) { console.error("Supabase select error:", error); } 
    else {
      const adapted = (data || []).map(row => ({
        ...row,
        kind: normType(row.kind), 
        creator: row.creator,
        sourcesArr: parseSources(row.sources)
      }));
      setItems(adapted);
    }
    setLoading(false);
  }, [q, statusFilter, typeFilter, genreFilter, moodFilter, sourceFilter, letterFilter, letterMode, yearFilter, completionMonthFilter, completionYearFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const { count: totalCount } = await supabase.from("items").select('*', { count: 'exact', head: true });
      const { count: archivedCount } = await supabase.from("items").select('*', { count: 'exact', head: true }).or("ended_on.not.is.null, status.eq.archived");
      
      const typePromises = TYPES.map(t => supabase.from("items").select('*', { count: 'exact', head: true }).eq('type', t));
      const typeResults = await Promise.all(typePromises);
      const byType = typeResults.map((res, idx) => ({ t: TYPES[idx], n: res.count || 0 }));

      const { count: toBuyCount } = await supabase.from("items").select('*', { count: 'exact', head: true }).or('source.ilike.%Wishlist%,source.ilike.%da comprare%');
      const bySource = [{ s: 'Wishlist', n: toBuyCount || 0 }];

      setStats({
        total: totalCount ?? 0,
        archived: archivedCount ?? 0,
        active: (totalCount ?? 0) - (archivedCount ?? 0),
        byType: byType,
        bySource: bySource
      });
    } catch (error) { console.error(error); }
  }, []); 

  const fetchPeriodStats = useCallback(async () => {
    if (!statYear) return;
    setPeriodLoading(true);
    
    const y = Number(statYear); 
    let startDate, endDate;

    if (statMonth) {
      const m = Number(statMonth);
      startDate = `${y}-${String(m).padStart(2, '0')}-01`;
      const nextM = m === 12 ? 1 : m + 1; 
      const nextY = m === 12 ? y + 1 : y;
      endDate = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
    } else {
      startDate = `${y}-01-01`;
      endDate = `${y + 1}-01-01`;
    }

    const { data, error } = await supabase.from('items').select('type').gte('ended_on', startDate).lt('ended_on', endDate);
    
    if (error) { 
      setPeriodStats({ total: 0, libro: 0, audiolibro: 0, film: 0, album: 0, video: 0, gioco: 0 }); 
    } 
    else {
      const counts = { total: 0, libro: 0, audiolibro: 0, film: 0, album: 0, video: 0, gioco: 0 };
      (data || []).forEach(item => { counts.total++; const t = normType(item.type); if (counts[t] !== undefined) counts[t]++; });
      setPeriodStats(counts);
    }
    setPeriodLoading(false);
  }, [statYear, statMonth]); 

  /* --- 4. HANDLERS --- */
  
  // RESET INFINITE SCROLL ON FILTER CHANGE
  useEffect(() => {
    setVisibleCount(50);
  }, [q, statusFilter, typeFilter, genreFilter, moodFilter, sourceFilter, letterFilter, letterMode, yearFilter, completionMonthFilter, completionYearFilter]);

  // INFINITE SCROLL LISTENER
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
        setVisibleCount(prev => prev + 50);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const val = qInput.trim();
      setQ(val);
      if (val.length > 0) {
        setStatusFilter("");
      } else {
        setStatusFilter("active");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [qInput]);

  const isSearchActive = useMemo(() => {
    const isStatusChanged = statusFilter !== 'active';
    return q.length > 0 || isStatusChanged || typeFilter.length > 0 || genreFilter.length > 0 || moodFilter.length > 0 ||
           sourceFilter.length > 0 || letterFilter.length > 0 || yearFilter.length > 0 || 
           String(completionMonthFilter).length > 0 || String(completionYearFilter).length > 0;
  }, [q, statusFilter, typeFilter, genreFilter, moodFilter, sourceFilter, letterFilter, yearFilter, completionMonthFilter, completionYearFilter]);

  const addItem = useCallback(async (e) => {
    e.preventDefault();
    if(!title.trim()) return;
    const finalStatus = isInstantArchive ? "archived" : "active";
    const finalEndedOn = isInstantArchive ? (instantDate || new Date().toISOString().slice(0,10)) : null;
    const finalIsNext = isInstantArchive ? false : isNext;
    const finalSource = isToBuy ? "Wishlist" : "";

    const payload = {
      title, author: creator, type: kind, status: finalStatus,
      genre: showGenreInput(kind) ? canonGenere(genre) : null, 
      year: year ? Number(year) : null,
      source: finalSource, 
      mood: mood || null, video_url: videoUrl || null, 
      note: note || null, 
      is_next: finalIsNext, ended_on: finalEndedOn
    };
    const { error } = await supabase.from("items").insert(payload);
    if(!error){
      setTitle(""); setCreator(""); setKind("libro"); setGenre(""); setYear(""); 
      setMood(""); setVideoUrl(""); setNote(""); setIsNext(false); 
      setIsInstantArchive(false); setInstantDate(""); setIsToBuy(false); 
      setAddModalOpen(false); 
      showToast("Elemento aggiunto con successo!", "success");
      if (isSearchActive) fetchItems(); fetchStats(); fetchPinnedItems();
    } else { showToast("Errore salvataggio: " + (error?.message), "error"); }
  }, [title, creator, kind, genre, year, mood, videoUrl, note, isNext, isInstantArchive, instantDate, isToBuy, isSearchActive, fetchItems, fetchStats, fetchPinnedItems, showToast]);

  /* --- MODIFICA: Funzione per gestire la Coda --- */
  const toggleQueue = useCallback(async (it) => {
    const currentSources = it.sourcesArr || [];
    // Controllo case-insensitive
    const isInQueue = currentSources.some(s => s.toLowerCase() === "coda");
    
    // Controllo Limite Zen (Max 7 in coda)
    if (!isInQueue) {
      const queueCount = items.filter(x => (x.sourcesArr||[]).some(s => s.toLowerCase() === "coda")).length;
      if (queueCount >= 7) {
        showToast("✋ La Coda è piena (Max 7)! Sfoltisci i piani futuri.", "error");
        return;
      }
    }

    let newSources;
    if (isInQueue) {
      // Rimuovi tutte le varianti
      newSources = currentSources.filter(s => s.toLowerCase() !== "coda");
    } else {
      // Aggiungi
      newSources = [...currentSources, "Coda"];
    }

    const newSourceStr = joinSources(newSources);
    const { error } = await supabase.from("items").update({ source: newSourceStr }).eq("id", it.id);
    
    if (!error) {
       setItems(prev => prev.map(x => x.id === it.id ? {...x, sourcesArr: parseSources(newSourceStr)} : x));
       showToast(isInQueue ? "Rimosso dalla Coda" : "Messo in Coda ⏳", "success");
    } else {
       showToast("Errore aggiornamento: " + error.message, "error");
    }
  }, [items, showToast]);

  /* --- MODIFICA: Aggiornamento Toggle Focus con Regole Zen --- */
  const toggleFocus = useCallback(async (it) => {
    // Se stiamo per attivare (metterlo In Corso)
    if (!it.is_next) {
      // Limite 3
      if (pinnedItems.length >= 3) {
        showToast("🧠 Sovraccarico! Il limite è 3 progetti attivi.", "error");
        return;
      }
      // Controllo Umore
      const hasRelax = pinnedItems.some(p => p.mood === 'Relax');
      const hasFocus = pinnedItems.some(p => p.mood === 'Focus');
      if (it.mood === 'Relax' && hasRelax) {
        showToast("✋ Hai già un 'Relax' attivo.", "error");
        return;
      }
      if (it.mood === 'Focus' && hasFocus) {
        showToast("✋ Hai già un 'Focus' attivo.", "error");
        return;
      }
    } else {
        // Se stiamo togliendo, chiedi conferma
        if(!window.confirm(`Vuoi mettere in pausa "${it.title}"?`)) return;
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
    const srcs = new Set([...(it.sourcesArr||[])]);
    srcs.delete("Wishlist"); 
    srcs.delete("da comprare"); 
    const newSourceStr = joinSources(Array.from(srcs));
    const { error } = await supabase.from("items").update({ source: newSourceStr }).eq("id", it.id);
    if (!error) { 
        setItems(prev => prev.map(x => x.id === it.id ? {...x, sourcesArr: parseSources(newSourceStr)} : x));
        fetchStats(); 
        showToast("Rimosso dalla Wishlist 🛒", "success");
    }
  }, [fetchStats, showToast]);

  const openArchiveModal = useCallback((it) => {
    setArchModal({
      id: it.id, title: it.title, kind: it.kind,
      sourcesArr: it.sourcesArr || [], source: "", 
      dateISO: new Date().toISOString().slice(0,10),
    });
  }, []);
  
  const saveArchiveFromModal = useCallback(async (m) => {
    await supabase.from("items").update({ status: "archived", ended_on: m.dateISO, source: joinSources(m.sourcesArr), is_next: false }).eq("id", m.id);
    setArchModal(null);
    showToast("Archiviato con successo! 📦", "success");
    if(isSearchActive) fetchItems(); fetchStats(); fetchPinnedItems();
    if(statsModalOpen) fetchPeriodStats(); 
  }, [isSearchActive, statsModalOpen, fetchItems, fetchStats, fetchPeriodStats, fetchPinnedItems, showToast]);
  
  const unarchive = useCallback(async (it) => {
    await supabase.from("items").update({ status: "active", ended_on: null }).eq("id", it.id);
    showToast("Elemento ripristinato! ↩️", "success");
    if(isSearchActive) fetchItems(); fetchStats();
    if(statsModalOpen) fetchPeriodStats();
  }, [isSearchActive, statsModalOpen, fetchItems, fetchStats, fetchPeriodStats, showToast]);

  const reExperience = useCallback(async (it) => {
    if(!window.confirm(`Vuoi iniziare a rileggere/riguardare "${it.title}"? \n\nVerrà creata una copia nel tuo Piano di Lettura.`)) return;
    const payload = {
      title: it.title, author: it.creator, type: it.kind, genre: it.genre, mood: it.mood, year: it.year, video_url: it.video_url, note: it.note, 
      source: joinSources(it.sourcesArr), status: "active", is_next: true, created_at: new Date().toISOString(), ended_on: null
    };
    const { error } = await supabase.from("items").insert(payload);
    if (!error) {
      if (isSearchActive) fetchItems(); fetchStats(); fetchPinnedItems();
      showToast("Nuova copia creata! Buon viaggio 🔄", "success");
    } else { showToast("Errore: " + error.message, "error"); }
  }, [isSearchActive, fetchItems, fetchStats, fetchPinnedItems, showToast]);

  const handleSuggest = useCallback(async () => {
    setSuggestion(null); 
    const conflict = pinnedItems.find(p => p.kind === randKind);
    if (conflict) { showToast(`Hai già "${conflict.title}" in focus per ${randKind}!`, "error"); return; }
    const gCanon = canonGenere(randGenre);
    const { data, error } = await supabase.rpc('get_random_suggestion', {
      p_kind: randKind, p_genre: showGenreInput(randKind) ? (gCanon || null) : null, p_mood: randMood || null 
    });
    if (error || !data || data.length === 0) { showToast("Nessun elemento trovato nei dadi.", "error"); return; }
    const raw = data[0];
    setSuggestion({ ...raw, kind: normType(raw.type), author: raw.author || raw.creator });
  }, [pinnedItems, randKind, randGenre, randMood, showToast]); 

  
  const handleAddKindChange = useCallback((e) => {
    const newKind = e.target.value; setKind(newKind);
    if (!showGenreInput(newKind)) setGenre(""); 
  }, []);
  const clearAllFilters = useCallback(() => {
    setQ(""); setQInput(""); setTypeFilter(""); setGenreFilter(""); setMoodFilter(""); setSourceFilter(""); setLetterFilter(""); setYearFilter(""); setLetterMode("author");
    setCompletionMonthFilter(""); setCompletionYearFilter(""); setSuggestion(null); setStatusFilter("active"); 
  }, []);
  const openEditModal = useCallback((it) => {
    setEditState({
      id: it.id, title: it.title, creator: it.creator, type: it.kind,        
      genre: it.genre || '', year: it.year || '', mood: it.mood || '', 
      video_url: it.video_url || '', note: it.note || '', 
      is_next: it.is_next || false, source: joinSources(it.sourcesArr)
    });
  }, []);
  
  const handleUpdateItem = useCallback(async (e) => {
    e.preventDefault();
    if (!editState || !editState.title.trim()) return;
    const payload = {
      title: editState.title, author: editState.creator, type: editState.type,
      genre: showGenreInput(editState.type) ? canonGenere(editState.genre) : null,
      year: editState.year ? Number(editState.year) : null, mood: editState.mood || null, 
      video_url: editState.video_url || null, note: editState.note || null,
      is_next: editState.is_next, source: editState.source 
    };
    const { error } = await supabase.from("items").update(payload).eq('id', editState.id);
    if (!error) {
      setItems(prevItems => prevItems.map(it => {
        if (it.id === editState.id) {
          return { ...it, ...payload, creator: payload.author, kind: payload.type, sourcesArr: parseSources(payload.source) };
        } return it;
      }));
      setEditState(null); fetchPinnedItems(); 
      showToast("Modifiche salvate! 💾", "success");
    } else { showToast("Errore aggiornamento: " + error.message, "error"); }
  }, [editState, fetchPinnedItems, showToast]);

  const handleStatClick = useCallback((typeClicked) => {
    if (typeClicked && TYPES.includes(typeClicked)) setTypeFilter(typeClicked);
    else setTypeFilter(''); 
    setStatusFilter('archived'); 
    setCompletionYearFilter(String(statYear)); 
    setCompletionMonthFilter(String(statMonth)); 
    setQ(''); setQInput(''); setGenreFilter(''); setMoodFilter(''); setSourceFilter(''); setLetterFilter(''); setYearFilter('');
    setStatsModalOpen(false);
  }, [statYear, statMonth]); 

  const deleteItem = useCallback(async (itemId) => {
    await supabase.from('items').delete().eq('id', itemId);
    setEditState(null); setItems(prev => prev.filter(x => x.id !== itemId)); 
    fetchStats(); fetchPinnedItems();
    showToast("Elemento eliminato per sempre.", "success");
    if (statsModalOpen) fetchPeriodStats();
  }, [statsModalOpen, fetchStats, fetchPeriodStats, fetchPinnedItems, showToast]);

  const handleCleanupSuggest = useCallback(async () => {
    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const isoDate = sixMonthsAgo.toISOString();
    const { data, error } = await supabase.from('items').select('*').eq('status', 'active').lt('created_at', isoDate); 
    if (error) { console.error(error); return; }
    if (data && data.length > 0) {
       const random = data[Math.floor(Math.random() * data.length)];
       setCleanupItem({ ...random, kind: normType(random.type) }); 
       setAdvOpen(false); 
    } else { showToast("Collezione pulita! Nessun elemento vecchio trovato.", "success"); }
  }, [showToast]);

  const confirmDeleteCleanup = async () => {
    if(!cleanupItem) return;
    await deleteItem(cleanupItem.id);
    setCleanupItem(null);
  };
  
  // Handler rapido per filtro autore dalla Card
  const handleFilterAuthor = useCallback((authorName) => {
    setQInput(authorName); 
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /* --- 5. EFFETTI --- */
  useEffect(()=>{ fetchStats(); fetchPinnedItems(); },[fetchStats, fetchPinnedItems]); 
  useEffect(() => { if (isSearchActive) { setLoading(true); fetchItems(); } else { setItems([]); setLoading(false); } }, [isSearchActive, fetchItems]);
  useEffect(() => { if (statsModalOpen) { fetchPeriodStats(); } }, [statsModalOpen, statMonth, statYear, fetchPeriodStats]);
  useEffect(() => {
    const fetchMemory = async () => {
      const { data } = await supabase.from('items').select('title, ended_on, author').not('ended_on', 'is', null);
      if (data && data.length > 0) {
        const randomIndex = Math.floor(Math.random() * data.length);
        const randomItem = data[randomIndex];
        const diffDays = Math.ceil(Math.abs(new Date() - new Date(randomItem.ended_on)) / (1000 * 60 * 60 * 24)); 
        if (diffDays > 0) setMemoryItem({ ...randomItem, daysAgo: diffDays });
      }
    }; fetchMemory();
  }, []);

  /* --- 6. RENDER (JSX) --- */
  return (
    <div className="app">
      <ToastContainer toasts={toasts} />
      
      <h1 style={{textAlign:'center'}}>Biblioteca personale</h1>
      
      {/* ===== Ricerca Zen "Sticky" ===== */}
      <section className="card" style={{
          marginBottom:0, padding: "6px 12px", display:'flex', alignItems:'center', gap:8, 
          backgroundColor:'#FFF9F0', borderRadius: 12, boxShadow:'0 1px 3px rgba(0,0,0,0.05)',
          position: 'sticky', top: 10, zIndex: 100 // MODIFICA: Sticky
      }}>
        <div style={{flex:1, display:'flex', alignItems:'center', gap:8}}>
          <span style={{opacity:0.4, fontSize:'1.1em'}}>🔍</span>
          <input 
            style={{width:'100%', border:'none', outline:'none', background:'transparent', fontSize:'1rem', padding:0, margin:0, height: 40}} 
            placeholder="Cerca..." 
            value={qInput} 
            onChange={e=>setQInput(e.target.value)} 
          />
          {qInput && (
            <button 
              onClick={() => { setQInput(""); setStatusFilter("active"); }} 
              style={{background:'transparent', border:'none', fontSize:'1.1em', color:'#718096', cursor:'pointer', padding:'0 8px'}}
            >
              ✖
            </button>
          )}
        </div>
        <button className="ghost" onClick={()=>setStatsModalOpen(true)} style={{padding:'8px', fontSize:'1.1em', opacity:0.7}} title="Statistiche">📊</button>
        <button className="ghost" onClick={()=>setAdvOpen(true)} style={{padding:'8px', fontSize:'1.1em', opacity:0.7}} title="Menu Avanzato">⚙️</button>
      </section>

      {/* ===== ETICHETTE FILTRI ATTIVI ===== */}
      {(statusFilter !== 'active' || sourceFilter || genreFilter || moodFilter || yearFilter || letterFilter || typeFilter || completionYearFilter) && (
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'12px', gap:12}}>
          <div style={{display:'flex', flexWrap:'wrap', gap:8, alignItems:'center', flex:1}}>
            <span style={{fontSize:'0.8em', opacity:0.6}}>Filtri:</span>
            {statusFilter !== 'active' && (<button className="ghost" onClick={()=>setStatusFilter('active')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0', color:'#4a5568', display:'flex', alignItems:'center', gap:4}}>{statusFilter === 'archived' ? '📦 Archivio' : '👁️ Tutto'} <span>✖</span></button>)}
            {typeFilter && (<button className="ghost" onClick={()=>setTypeFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0', color:'#4a5568', display:'flex', alignItems:'center', gap:4}}>{TYPE_ICONS[typeFilter]} {typeFilter} <span>✖</span></button>)}
            {sourceFilter === 'Wishlist' && (<button className="ghost" onClick={()=>setSourceFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#ebf8ff', color:'#2b6cb0', display:'flex', alignItems:'center', gap:4, border:'1px solid #bee3f8'}}>🛒 Wishlist <span>✖</span></button>)}
            {genreFilter && (<button className="ghost" onClick={()=>setGenreFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0', color:'#4a5568', display:'flex', alignItems:'center', gap:4}}>{genreFilter} <span>✖</span></button>)}
            {moodFilter && (<button className="ghost" onClick={()=>setMoodFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#feebc8', color:'#c05621', display:'flex', alignItems:'center', gap:4}}>{moodFilter} <span>✖</span></button>)}
            {yearFilter && (<button className="ghost" onClick={()=>setYearFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0', color:'#4a5568', display:'flex', alignItems:'center', gap:4}}>Anno: {yearFilter} <span>✖</span></button>)}
            {letterFilter && ( <button className="ghost" onClick={()=>setLetterFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0', color:'#4a5568', display:'flex', alignItems:'center', gap:4}}>{letterMode === 'title' ? 'Titolo' : 'Autore'}: {letterFilter}... <span>✖</span></button> )}
            {(completionYearFilter) && (<button className="ghost" onClick={()=>{setCompletionYearFilter(''); setCompletionMonthFilter(''); setStatusFilter('active');}} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#fbb6ce', color:'#822727', display:'flex', alignItems:'center', gap:4}}>📅 {completionMonthFilter ? `${completionMonthFilter}/` : ''}{completionYearFilter} <span>✖</span></button>)}
          </div>
          <div style={{flexShrink:0}}>
            <button className="ghost" onClick={clearAllFilters} style={{fontSize:'0.85em', fontWeight:'600', color:'#fd8383ff', padding:'4px 8px', cursor:'pointer', whiteSpace:'nowrap'}}>Pulisci</button>
          </div>
        </div>
      )}

      {/* ===== HOME ZEN (MODIFICATA CON TABS) ===== */}
      {!isSearchActive && !loading && (
        <>
          {/* MODIFICA: Sezione Piano di Lettura a TABS */}
          <section className="card" style={{marginTop: 12, marginBottom:12, borderLeft: planTab === 'active' ? '4px solid #38a169' : '4px solid #805ad5', backgroundColor: planTab === 'active' ? '#f0fff4' : '#faf5ff', padding:'0', overflow:'hidden', transition:'all 0.3s'}}>
            {/* TABS SWIPE */}
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
                            {/* MODIFICA: Mostra Autore e Umore */}
                            <div style={{fontSize:'0.85em', color:'#276749', opacity:0.9}}>{p.creator}</div>
                            {p.mood && <span style={{fontSize:'0.7em', padding:'2px 6px', borderRadius:6, backgroundColor:'#fff', border:'1px solid #c6f6d5', color:'#276749', display:'inline-block', marginTop:2}}>{p.mood}</span>}
                          </div>
                          <button className="ghost" onClick={() => openArchiveModal(p)} title="Finito! Archivia" style={{fontSize:'1.2em', padding:'6px', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px', backgroundColor:'white'}}>📦</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {pinnedItems.length >= 3 && <div style={{marginTop:12, padding:8, backgroundColor:'#fed7d7', color:'#822727', borderRadius:8, fontSize:'0.85em', textAlign:'center'}}>🛑 <strong>Slot pieni (3/3).</strong> Finisci qualcosa prima.</div>}
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
                            {/* MODIFICA: Mostra Autore e Umore */}
                            <div style={{fontSize:'0.85em', color:'#553c9a', opacity:0.8}}>{w.creator}</div>
                            {w.mood && <span style={{fontSize:'0.7em', marginLeft:6, opacity:0.7, border:'1px solid #d6bc9b', borderRadius:4, padding:'0 4px'}}>{w.mood}</span>}
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

          {/* MEMORY LANE */}
          {memoryItem && (
             <div className="card" style={{marginTop: 12, marginBottom: 12, backgroundColor: 'transparent', border: '1px dashed #cbd5e0', padding: '10px 12px'}}>
               <p style={{ fontSize: '0.85rem', color: '#718096', margin: 0, textAlign: 'center', fontStyle: 'italic' }}>
                 🕰️ {memoryItem.daysAgo < 30 ? `${memoryItem.daysAgo} giorni fa` : `${Math.floor(memoryItem.daysAgo / 30)} mesi fa`} finivi <strong>{memoryItem.title}</strong>
               </p>
             </div>
          )}

          {/* SUGGERIMENTO ZEN */}
          {suggestion && (
            <section className="card" style={{marginBottom:12, borderLeft: '4px solid #ed8936', backgroundColor: '#fffaf0', padding:'12px 16px'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                <div style={{flex:1}}> 
                  <h3 style={{marginTop:0, marginBottom:4, fontSize:'1em', color:'#c05621'}}>🎲 Perché non provi...</h3>
                  <div style={{fontSize:'1.1em', fontWeight:'bold', marginBottom:2}}>{suggestion.title}</div>
                  <div style={{fontSize:'0.9em', opacity:0.8, marginBottom:8}}>{TYPE_ICONS[suggestion.kind]} {suggestion.author || "Autore sconosciuto"}</div>
                  <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                      {suggestion.mood && <span className="badge mood-badge" style={{backgroundColor:'#bee3f8', color:'#2a4365'}}>{suggestion.mood}</span>}
                      {suggestion.genre && <span className="badge" style={{backgroundColor:'#edf2f7', color:'#4a5568'}}>{suggestion.genre}</span>}
                  </div>
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:8, alignItems:'center'}}>
                   {suggestion.video_url && (
                      <a href={suggestion.video_url} target="_blank" rel="noopener noreferrer" title="Apri subito" style={{display:'flex', alignItems:'center', justifyContent:'center', width: 40, height: 40, borderRadius: '50%', backgroundColor: '#feebc8', textDecoration:'none', fontSize:'1.4em'}}>{getLinkEmoji(suggestion.video_url)}</a>
                   )}
                   {!suggestion.is_next && (
                     <button className="ghost" onClick={() => { toggleFocus(suggestion); setSuggestion(null); }} title="Aggiungi al Piano di Lettura" style={{display:'flex', alignItems:'center', justifyContent:'center', width: 40, height: 40, borderRadius: '50%', backgroundColor: '#c6f6d5', color: '#2f855a', fontSize:'1.4em', border: '1px solid #9ae6b4', cursor:'pointer'}}>📌</button>
                   )}
                </div>
              </div>
            </section>
          )}

          {/* CONTROLLI DADO */}
          <section className="card" style={{marginBottom:16, marginTop:16, padding:'12px', backgroundColor:'#FDF8F2', borderRadius:16, border:'1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.03)'}}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <div style={{display:'flex', gap:8, flex:1, minWidth:0}}>
                <select value={randKind} onChange={e=>setRandKind(e.target.value)} style={{flex:1, minWidth:0, padding:'10px 4px', borderRadius:10, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', fontSize:'0.9em', color:'#2d3748', textOverflow:'ellipsis'}}>
                   {TYPES.filter(t => t !== 'audiolibro').map(t=> <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
                </select>

                <select value={randMood} onChange={e=>setRandMood(e.target.value)} style={{flex:1, minWidth:0, padding:'10px 4px', borderRadius:10, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', fontSize:'0.9em', color:'#2d3748', textOverflow:'ellipsis'}}>
                   <option value="">Umore</option>
                   {MOODS.map(m=> <option key={m} value={m}>{m}</option>)}
                </select>

                {showGenreInput(randKind) && (
                  <select value={randGenre} onChange={e=>setRandGenre(e.target.value)} style={{flex:1, minWidth:0, padding:'10px 4px', borderRadius:10, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', fontSize:'0.9em', color:'#2d3748', textOverflow:'ellipsis'}}>
                      <option value="">Genere</option>
                      {GENRES.map(g=> <option key={g} value={g}>{g}</option>)}
                  </select>
                )}
              </div>

              <button 
                onClick={handleSuggest} 
                title="Dammi un consiglio!"
                style={{
                  width: 48, height: 48, borderRadius: 12, border: '1px solid #ed8936', 
                  backgroundColor: '#FDF8F2', color: '#ed8936', fontSize: '1.6rem', 
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 5px rgba(237, 137, 54, 0.3)', flexShrink: 0
                }}
              >
                🎲
              </button>
            </div>
          </section>
        </>
      )}
      
      {/* ===== Lista Risultati (Card Minimal) con Infinite Scroll ===== */}
      {isSearchActive && (
        <section className="card" style={{marginTop: 12}}>
          {loading ? <p>Caricamento…</p> : (
            <div className="list" style={{ gap: 16, display: 'flex', flexDirection: 'column' }}>
              {items.slice(0, visibleCount).map(it => (
                <LibraryItem 
                  key={it.id} 
                  it={it}
                  isArchiveView={statusFilter === 'archived'} 
                  onToggleFocus={toggleFocus}
                  onToggleQueue={toggleQueue} // Collegamento fondamentale
                  onMarkPurchased={markAsPurchased}
                  onArchive={openArchiveModal}
                  onEdit={openEditModal}
                  onReExperience={reExperience}
                  onUnarchive={unarchive}
                  onFilterAuthor={handleFilterAuthor}
                />
              ))}
              {items.length === 0 && <p style={{opacity:.8, textAlign:'center'}}>Nessun elemento trovato.</p>}
              {items.length > visibleCount && (
                <div style={{textAlign: 'center', padding: 20, color: '#718096', fontStyle:'italic'}}>
                  Scorri per caricare altri elementi...
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ===== FAB / MODALI ===== */}
      <button onClick={() => setAddModalOpen(true)} className="fab">+</button>
      
      {/* ===== MODALE AGGIUNTA (Fixed per Mobile) ===== */}
      {addModalOpen && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'}} onClick={() => setAddModalOpen(false)}>
          <div className="card" style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '90%', maxWidth: '500px', maxHeight: '85vh', overflowY: 'auto', padding:"20px 24px", borderRadius: 20, backgroundColor:'#FDF8F2'}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0, marginBottom:20, fontSize:'1.4rem', color:'#2d3748', textAlign:'center'}}>Nuovo Elemento</h2>
            <form onSubmit={addItem} id="add-form" style={{display:'flex', flexDirection:'column', gap:12}}>
              <input placeholder="Titolo" value={title} onChange={e=>setTitle(e.target.value)} style={{padding:'12px', fontSize:'1.1rem', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, width:'100%', boxSizing:'border-box', backgroundColor:'transparent'}} autoFocus />
              <input placeholder="Autore / Regista / Sviluppatore" value={creator} onChange={e=>setCreator(e.target.value)} style={{padding:'12px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, width:'100%', boxSizing:'border-box', backgroundColor:'transparent'}} />
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <select value={kind} onChange={handleAddKindChange} style={{padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent'}}>{TYPES.filter(t => t !== 'audiolibro').map(t=> <option key={t} value={t}>{TYPE_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>)}</select>
                <input type="number" placeholder="Anno" value={year} onChange={e=>setYear(e.target.value)} style={{padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, width:'100%', boxSizing:'border-box', backgroundColor:'transparent'}} />
                {showGenreInput(kind) ? (<select value={genre} onChange={e=>setGenre(e.target.value)} style={{padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent'}}><option value="">Genere</option>{GENRES.map(g => <option key={g} value={g}>{g}</option>)}</select>) : <div />}
                <select value={mood} onChange={e=>setMood(e.target.value)} style={{padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent'}}><option value="">Umore</option>{MOODS.map(m => <option key={m} value={m}>{m}</option>)}</select>
              </div>
              <input placeholder="Link (opzionale)" value={videoUrl} onChange={e=>setVideoUrl(e.target.value)} style={{padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, width:'100%', boxSizing:'border-box', fontSize:'0.9em', backgroundColor:'transparent'}} />
              <textarea placeholder="Note personali (opzionale)..." value={note} onChange={e=>setNote(e.target.value)} rows={3} style={{padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, width:'100%', boxSizing:'border-box', fontSize:'0.9em', backgroundColor:'transparent', fontFamily:'inherit', resize:'vertical'}} />
              
              <div style={{marginTop:8}}>
                <label style={{fontSize:'0.85em', fontWeight:'bold', color:'#718096', marginBottom:8, display:'block'}}>IMPOSTA STATO:</label>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
                  <div onClick={() => setIsToBuy(!isToBuy)} style={{border: isToBuy ? '2px solid #3182ce' : `1px solid ${BORDER_COLOR}`, backgroundColor: isToBuy ? '#ebf8ff' : 'transparent', color: isToBuy ? '#2b6cb0' : '#718096', borderRadius: 12, padding: '10px 4px', textAlign:'center', cursor:'pointer', transition:'all 0.2s'}}><div style={{fontSize:'1.4em', marginBottom:4}}>🛒</div><div style={{fontSize:'0.75em', fontWeight:'bold'}}>Wishlist</div></div>
                  <div onClick={() => { setIsNext(!isNext); if(!isNext) setIsInstantArchive(false); }} style={{border: isNext ? '2px solid #38a169' : `1px solid ${BORDER_COLOR}`, backgroundColor: isNext ? '#f0fff4' : 'transparent', color: isNext ? '#2f855a' : '#718096', opacity: isInstantArchive ? 0.4 : 1, borderRadius: 12, padding: '10px 4px', textAlign:'center', cursor:'pointer', transition:'all 0.2s'}}><div style={{fontSize:'1.4em', marginBottom:4}}>📌</div><div style={{fontSize:'0.75em', fontWeight:'bold'}}>In Corso</div></div>
                  <div onClick={() => { setIsInstantArchive(!isInstantArchive); if(!isInstantArchive) setIsNext(false); }} style={{border: isInstantArchive ? '2px solid #d69e2e' : `1px solid ${BORDER_COLOR}`, backgroundColor: isInstantArchive ? '#fffff0' : 'transparent', color: isInstantArchive ? '#b7791f' : '#718096', borderRadius: 12, padding: '10px 4px', textAlign:'center', cursor:'pointer', transition:'all 0.2s'}}><div style={{fontSize:'1.4em', marginBottom:4}}>✅</div><div style={{fontSize:'0.75em', fontWeight:'bold'}}>Finito</div></div>
                </div>
                {isInstantArchive && (<div style={{marginTop:12, animation:'fadeIn 0.3s'}}><label style={{fontSize:'0.85em', color:'#718096'}}>Data completamento:</label><input type="date" value={instantDate} onChange={e=>setInstantDate(e.target.value)} style={{marginLeft:8, padding:'6px', borderRadius:8, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent'}} /></div>)}
              </div>
            </form>
            <div style={{display:'flex', gap:12, marginTop:24}}>
              <button type="button" className="ghost" onClick={()=>setAddModalOpen(false)} style={{flex:1, padding:'14px', borderRadius:12, color:'#718096', fontWeight:'600'}}>Annulla</button>
              <button type="submit" form="add-form" style={{flex:2, padding:'14px', borderRadius:12, backgroundColor:'#3e3e3e', color:'white', fontWeight:'600', border:'none', boxShadow:'0 4px 6px rgba(0,0,0,0.1)'}}>Salva Elemento</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODALE FILTRI & STRUMENTI (Fixed per Mobile) ===== */}
      {advOpen && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'}} onClick={() => setAdvOpen(false)}>
          <div className="card" style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '90%', maxWidth: '500px', maxHeight: '85vh', overflowY: 'auto', padding:"20px 24px", borderRadius: 20, backgroundColor:'#FDF8F2', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'}} onClick={e => e.stopPropagation()}>
            <div style={{marginBottom:20, textAlign:'center'}}><h2 style={{margin:0, fontSize:'1.4rem', color:'#2d3748'}}>Filtri & Strumenti</h2></div>
            <div style={{display:'flex', flexDirection:'column', gap:24}}>
              <div>
                <label style={{fontSize:'0.85em', fontWeight:'bold', color:'#718096', marginBottom:8, display:'block', textTransform:'uppercase', letterSpacing:'0.05em'}}>Visualizzazione</label>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                  <div onClick={() => { if (statusFilter === 'active') setStatusFilter('archived'); else if (statusFilter === 'archived') setStatusFilter(''); else setStatusFilter('active'); }} style={{border: statusFilter === 'active' ? '2px solid #38a169' : (statusFilter === 'archived' ? '2px solid #d69e2e' : '2px solid #718096'), backgroundColor: statusFilter === 'active' ? '#f0fff4' : (statusFilter === 'archived' ? '#fffff0' : '#edf2f7'), color: statusFilter === 'active' ? '#2f855a' : (statusFilter === 'archived' ? '#b7791f' : '#2d3748'), borderRadius: 16, padding: '16px', textAlign:'center', cursor:'pointer', transition:'all 0.2s', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4}}>
                    <div style={{fontSize:'1.8em', marginBottom:2}}>{statusFilter === 'active' ? '🟢' : (statusFilter === 'archived' ? '📦' : '👁️')}</div><div style={{fontSize:'0.9em', fontWeight:'bold'}}>{statusFilter === 'active' ? 'In Corso' : (statusFilter === 'archived' ? 'Archivio' : 'Mostra Tutti')}</div>
                  </div>
                  <div onClick={() => setSourceFilter(prev => prev === 'Wishlist' ? '' : 'Wishlist')} style={{border: sourceFilter === 'Wishlist' ? '2px solid #3182ce' : `1px solid ${BORDER_COLOR}`, backgroundColor: sourceFilter === 'Wishlist' ? '#ebf8ff' : 'transparent', color: sourceFilter === 'Wishlist' ? '#2b6cb0' : '#718096', borderRadius: 16, padding: '16px', textAlign:'center', cursor:'pointer', transition:'all 0.2s', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4}}>
                    <div style={{fontSize:'1.8em', marginBottom:2}}>🛒</div><div style={{fontSize:'0.9em', fontWeight:'bold'}}>Wishlist</div>
                  </div>
                </div>
              </div>
              {/* ... Resto dei filtri ... */}
              <div style={{height:1, backgroundColor:'#e2e8f0', margin:'20px 0'}}></div>
              <div style={{display:'flex', flexDirection:'column', gap:16}}>
                <div style={{display:'flex', gap:12}}>
                   <button className="ghost" onClick={()=>exportItemsToCsv(items)} style={{flex:1, padding:'12px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', color:'#4a5568', display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:'0.95em'}}>📤 Esporta CSV</button>
                   <button className="ghost" onClick={handleCleanupSuggest} style={{flex:1, padding:'12px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', color:'#4a5568', display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:'0.95em'}}>🧹 Pulizia Zen</button>
                </div>
                <button onClick={()=>setAdvOpen(false)} style={{padding:'14px', borderRadius:12, backgroundColor:'#3e3e3e', color:'white', fontWeight:'600', border:'none', boxShadow:'0 4px 6px rgba(0,0,0,0.1)', width:'100%', fontSize:'1.1em'}}>Chiudi Pannello</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODALE STATISTICHE (Fixed per Mobile) ===== */}
      {statsModalOpen && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'}} onClick={() => setStatsModalOpen(false)}>
          <div className="card" style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '90%', maxWidth: '600px', maxHeight: '85vh', overflowY: 'auto', padding:"20px 24px", borderRadius: 20, backgroundColor:'#FDF8F2'}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0, textAlign:'center', marginBottom:20}}>Statistiche</h2>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20}}>
              <div onClick={() => setStatsView('periodo')} style={{border: statsView === 'periodo' ? '2px solid #d53f8c' : `1px solid ${BORDER_COLOR}`, backgroundColor: statsView === 'periodo' ? '#fff5f7' : 'transparent', color: statsView === 'periodo' ? '#b83280' : '#718096', borderRadius: 12, padding: '10px', textAlign:'center', cursor:'pointer', fontWeight:'bold'}}>📅 Periodo</div>
              <div onClick={() => setStatsView('totale')} style={{border: statsView === 'totale' ? '2px solid #3182ce' : `1px solid ${BORDER_COLOR}`, backgroundColor: statsView === 'totale' ? '#ebf8ff' : 'transparent', color: statsView === 'totale' ? '#2b6cb0' : '#718096', borderRadius: 12, padding: '10px', textAlign:'center', cursor:'pointer', fontWeight:'bold'}}>📈 Totale</div>
            </div>
            
            {statsView === 'periodo' && (
              <div>
                <div style={{display:'flex', gap: 8, alignItems: 'center', justifyContent:'center', marginBottom:20}}>
                  <input type="number" placeholder="Mese" value={statMonth} onChange={e=>setStatMonth(e.target.value)} style={{width:60, padding:8, borderRadius:8, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', textAlign:'center'}} />
                  <input type="number" placeholder="Anno" value={statYear} onChange={e=>setStatYear(e.target.value)} style={{width:80, padding:8, borderRadius:8, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', textAlign:'center'}} />
                  <button className="ghost" onClick={() => { setStatMonth(new Date().getMonth() + 1); setStatYear(new Date().getFullYear()); }} style={{fontSize:'0.9em', textDecoration:'underline'}}>Oggi</button>
                </div>
                <div onClick={() => handleStatClick(null)} style={{textAlign:'center', marginBottom:20, cursor:'pointer', transition:'all 0.2s', padding: 8, borderRadius: 12, ':hover': {backgroundColor:'rgba(0,0,0,0.02)'}}}>
                  <div style={{fontSize:'3em', fontWeight:'bold', color:'#2d3748', lineHeight:1}}>{periodStats.total}</div>
                  <div style={{fontSize:'0.9em', color:'#718096', textTransform:'uppercase', letterSpacing:'0.05em'}}>Elementi completati</div>
                </div>
              </div>
            )}

            {statsView === 'totale' && (
              <div>
                <div style={{display:'flex', justifyContent:'space-between', backgroundColor:'transparent', border: `1px solid ${BORDER_COLOR}`, borderRadius:16, padding:16, marginBottom:20}}>
                   <div style={{textAlign:'center'}}><div style={{fontSize:'1.4em', fontWeight:'bold'}}>{stats.total}</div><div style={{fontSize:'0.8em', color:'#718096'}}>Totali</div></div>
                   <div style={{textAlign:'center'}}><div style={{fontSize:'1.4em', fontWeight:'bold', color:'#38a169'}}>{stats.active}</div><div style={{fontSize:'0.8em', color:'#718096'}}>In Corso</div></div>
                   <div style={{textAlign:'center'}}><div style={{fontSize:'1.4em', fontWeight:'bold', color:'#d69e2e'}}>{stats.archived}</div><div style={{fontSize:'0.8em', color:'#718096'}}>Archivio</div></div>
                </div>
              </div>
            )}
            <button onClick={()=>setStatsModalOpen(false)} style={{marginTop:24, padding:'14px', borderRadius:12, backgroundColor:'#3e3e3e', color:'white', fontWeight:'600', border:'none', width:'100%'}}>Chiudi</button>
          </div>
        </div>
      )}

      {/* Modale Archivia (Fixed) */}
      {archModal && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'}} onClick={() => setArchModal(null)}>
          <div className="card" style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '90%', maxWidth: '500px', padding:16, backgroundColor:'white', borderRadius:16}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0}}>Archivia — {archModal.title}</h2>
            <div style={{display:'flex', flexDirection:'column', gap:12, margin:'16px 0'}}>
              <input type="date" value={archModal.dateISO} onChange={e=>setArchModal(m=>({...m, dateISO:e.target.value}))} style={{padding:8, borderRadius:8, border:`1px solid ${BORDER_COLOR}`}} />
            </div>
            <div className="row" style={{justifyContent:"flex-end", gap:8, marginTop:12}}><button className="ghost" onClick={()=>setArchModal(null)}>Annulla</button><button onClick={()=>saveArchiveFromModal(archModal)}>Archivia</button></div>
          </div>
        </div>
      )}

      {/* Modale Modifica (Fixed) */}
      {editState && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'}} onClick={() => setEditState(null)}>
          <div className="card" style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '90%', maxWidth: '500px', maxHeight: '85vh', overflowY: 'auto', padding:16, backgroundColor:'white', borderRadius:16}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0}}>Modifica elemento</h2>
            <form onSubmit={handleUpdateItem} className="grid grid-2" id="edit-form">
              <input placeholder="Titolo" value={editState.title} onChange={e => setEditState(curr => ({...curr, title: e.target.value}))} />
              <input placeholder="Autore" value={editState.creator} onChange={e => setEditState(curr => ({...curr, creator: e.target.value}))} />
              {/* Altri campi edit... */}
            </form>
            <div className="row" style={{justifyContent:"space-between", marginTop:12}}><button type="button" className="ghost" style={{ color: '#c53030', borderColor: '#c53030' }} onClick={() => { if (window.confirm("Sei sicuro?")) deleteItem(editState.id); }}>Elimina</button><div className="row" style={{gap: 8}}><button className="ghost" type="button" onClick={()=>setEditState(null)}>Annulla</button><button type="submit" form="edit-form">Salva Modifiche</button></div></div>
          </div>
        </div>
      )}
    </div>
  );
}