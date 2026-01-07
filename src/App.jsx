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

// LOGICA WISHLIST (MANTENUTA)
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
      zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none'
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          backgroundColor: t.type === 'error' ? '#c53030' : '#2d3748',
          color: 'white', padding: '10px 20px', borderRadius: 20,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: '0.95em', fontWeight: 500,
          animation: 'fadeIn 0.3s forwards', opacity: 0.95
        }}>
          {t.message}
        </div>
      ))}
    </div>
  );
};

// La barra sottile e minimalista
const ZenBar = ({ active }) => {
  if (!active) return null;
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '3px', // Sottilissima
      backgroundColor: 'transparent', // Sfondo invisibile
      zIndex: 99999, // Sopra a tutto, anche ai modali
      pointerEvents: 'none'
    }}>
      <div style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#d6bc9b', // COLORE SABBIA/ORO DEL TUO TEMA
        animation: 'zenFlow 1.5s infinite ease-in-out',
        transformOrigin: '0% 50%'
      }} />
      <style>{`
        @keyframes zenFlow {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(-20%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

// LIBRARY ITEM (Card ottimizzata con Note a Comparsa)
const LibraryItem = memo(({ 
  it, 
  isArchiveView, 
  onToggleFocus, 
  onMarkPurchased, 
  onArchive, 
  onEdit, 
  onReExperience, 
  onUnarchive, 
  onFilterAuthor 
}) => {
  const isArchived = it.status === 'archived';
  const hasWishlist = (it.sourcesArr || []).includes('Wishlist');

  // 1. NUOVO STATO LOCALE PER LA NOTA
  const [showNote, setShowNote] = useState(false);

  // LOGICA VISIVA
  const opacityValue = (isArchived && !isArchiveView) ? 0.6 : 1;

  // STILE UNIFICATO PER I BOTTONI
  const btnStyle = {
    width: '40px', height: '40px', padding: 0, 
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    fontSize: '1.2em', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px',
    backgroundColor: 'transparent', cursor: 'pointer', color: '#2d3748', textDecoration: 'none'
  };

  return (
    <div className="card" style={{ 
      padding: 16, display: 'flex', flexDirection: 'column', gap: 12, 
      borderLeft: it.is_next ? '4px solid #38a169' : '1px solid #e2e8f0', 
      backgroundColor: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      transform: 'translateZ(0)' // GPU acceleration hint
    }}>
      {/* ZONA 1: INFO */}
      <div style={{ opacity: opacityValue, transition: 'opacity 0.3s' }}>
        <div className="item-title" style={{ fontSize: '1.1rem', marginBottom: 6, display: 'flex', alignItems: 'center' }}>
          {it.is_next && <span title="In Coda" style={{ marginRight: 6 }}>📌</span>} {it.title}
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
            {Array.isArray(it.sourcesArr) && it.sourcesArr.length > 0 && (
              <span style={{ marginLeft: 6, display:'inline-flex', gap:4, opacity:0.9 }}>
                {it.sourcesArr.map((s, idx) => <span key={idx} title="Wishlist">🛒</span>)}
              </span>
            )}
          </div>
          {it.finished_at && <div style={{marginTop:6, fontSize:'0.85em', color:'#718096', fontStyle:'italic'}}>🏁 Finito il: {new Date(it.finished_at).toLocaleDateString()}</div>}
        </div>
      </div>
      
      {/* ZONA 2: AZIONI */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 12, marginTop: 4, paddingTop: 12, borderTop: '1px solid #f0f4f8', flexWrap: 'wrap' }}>
        
        {it.video_url && ( 
            <a href={it.video_url} target="_blank" rel="noopener noreferrer" className="ghost button" title="Apri Link" style={btnStyle}>
                {getLinkEmoji(it.video_url)}
            </a> 
        )}

        {/* 2. BOTTONE NOTA CHE ATTIVA IL TOGGLE */}
        {it.note && (
          <button 
            className="ghost" 
            onClick={() => setShowNote(!showNote)} 
            title={showNote ? "Nascondi nota" : "Leggi nota personale"} 
            style={{
                ...btnStyle, 
                backgroundColor: showNote ? '#FFF9F0' : 'transparent', // Feedback visivo se attivo
                borderColor: showNote ? '#d6bc9b' : BORDER_COLOR
            }}
          >
            📝
          </button>
        )}

        {(!it.finished_at && !isArchived) && (
          <button className="ghost" onClick={() => onToggleFocus(it)} title={it.is_next ? "Togli Focus" : "Metti Focus"} style={btnStyle}>
            {it.is_next ? "🚫" : "📌"}
          </button>
        )}
        
        {hasWishlist && (
          <button className="ghost" onClick={() => onMarkPurchased(it)} title="Ho comprato! Rimuovi dalla lista." style={btnStyle}>
            🛒
          </button>
        )}

        {(it.finished_at || isArchived) ? (
          <>
            <button className="ghost" onClick={() => onReExperience(it)} title="Rileggi/Riguarda" style={btnStyle}>🔄</button>
            <button className="ghost" onClick={() => onUnarchive(it)} title="Ripristina" style={btnStyle}>↩️</button>
          </>
        ) : (
          <button className="ghost" onClick={() => onArchive(it)} title="Archivia" style={btnStyle}>📦</button>
        )}
        
        <button className="ghost" onClick={() => onEdit(it)} title="Modifica" style={btnStyle}>✏️</button>
      </div>

      {/* 3. VISUALIZZAZIONE NOTA (Stile Zen Corretto) */}
      {showNote && (
        <div style={{ 
            marginTop: 12, 
            padding: '12px 16px', 
            backgroundColor: '#FDF8F2', // <--- LO STESSO COLORE DEL MODALE
            borderLeft: `3px solid ${BORDER_COLOR}`, 
            borderRadius: '0 8px 8px 0',
            color: '#4a5568', 
            fontSize: '0.95rem', 
            lineHeight: 1.5,
            fontStyle: 'italic',
            animation: 'fadeIn 0.3s'
        }}>
          "{it.note}"
        </div>
      )}

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
  const [isSaving, setIsSaving] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50); // INFINITE SCROLL STATE
  const [toasts, setToasts] = useState([]); // TOAST NOTIFICATIONS

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

    // LOGICA RICERCA INTELLIGENTE
    if (q) {
      // Se la ricerca inizia con un Hashtag (#)...
      if (q.startsWith('#')) {
         // ...cerca ANCHE nelle note (così trovi i tuoi tag)
         query = query.or(`title.ilike.%${q}%,author.ilike.%${q}%,note.ilike.%${q}%`);
      } else {
         // ...altrimenti cerca SOLO in Titolo e Autore (ricerca pulita)
        query = query.or(`title.ilike.%${q}%,author.ilike.%${q}%`);}}
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

  // 1. Snapshot dei dati attuali
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

  // 2. CHIUSURA ISTANTANEA & RESET FORM
  setAddModalOpen(false);
  setTitle(""); setCreator(""); setKind("libro"); setGenre(""); setYear(""); 
  setMood(""); setVideoUrl(""); setNote(""); setIsNext(false); 
  setIsInstantArchive(false); setInstantDate(""); setIsToBuy(false);

  // 3. ATTIVAZIONE ZEN BAR
  setIsSaving(true);

  // 4. CHIAMATA SUPABASE
  const { error } = await supabase.from("items").insert(payload);

  // 5. FINE
  setIsSaving(false);

  if(!error){
    showToast("Elemento aggiunto con successo!", "success");
    if (isSearchActive) fetchItems(); 
    fetchStats(); 
    fetchPinnedItems();
  } else { 
    showToast("Errore salvataggio: " + (error?.message), "error"); 
    // Nota: I dati del form sono persi perché l'abbiamo resettato. 
    // Se vuoi essere ultra-sicuro, resetta il form SOLO se !error, 
    // ma per un'app personale questo va benissimo.
  }
}, [title, creator, kind, genre, year, mood, videoUrl, note, isNext, isInstantArchive, instantDate, isToBuy, isSearchActive, fetchItems, fetchStats, fetchPinnedItems, showToast]);

  const toggleFocus = useCallback(async (it) => {
    const newVal = !it.is_next;
    const { error } = await supabase.from("items").update({ is_next: newVal }).eq("id", it.id);
    if (!error) { 
      setItems(prev => prev.map(x => x.id === it.id ? {...x, is_next: newVal} : x));
      fetchPinnedItems(); 
      showToast(newVal ? "Aggiunto ai Focus 📌" : "Focus rimosso");
    }
  }, [fetchPinnedItems, showToast]);

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
  // 1. CHIUDI SUBITO
  setArchModal(null);
  
  // 2. ZEN BAR ON
  setIsSaving(true);

  // 3. AGGIORNA
  const { error } = await supabase.from("items")
    .update({ status: "archived", ended_on: m.dateISO, source: joinSources(m.sourcesArr), is_next: false })
    .eq("id", m.id);

  // 4. ZEN BAR OFF
  setIsSaving(false);

  if (!error) {
    showToast("Archiviato con successo! 📦", "success");
    // Aggiornamento ottimistico o fetch
    if(isSearchActive) fetchItems(); fetchStats(); fetchPinnedItems();
    if(statsModalOpen) fetchPeriodStats(); 
  } else {
    showToast("Errore: " + error.message, "error");
  }
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

  // 1. PREPARIAMO I DATI
  const payload = {
    title: editState.title, author: editState.creator, type: editState.type,
    genre: showGenreInput(editState.type) ? canonGenere(editState.genre) : null,
    year: editState.year ? Number(editState.year) : null, mood: editState.mood || null, 
    video_url: editState.video_url || null, note: editState.note || null,
    is_next: editState.is_next, source: editState.source 
  };
  
  const idToUpdate = editState.id; // Salviamo l'ID perché stiamo per chiudere il modale

  // 2. CHIUDIAMO SUBITO IL MODALE (Percezione istantanea)
  setEditState(null); 
  
  // 3. ATTIVIAMO LA ZEN BAR (Il feedback "sto pensando")
  setIsSaving(true);

  // 4. ESEGUIAMO IL SALVATAGGIO REALE (In background)
  const { error } = await supabase.from("items").update(payload).eq('id', idToUpdate);

  // 5. FINITO: SPEGNI BARRA E MOSTRA TOAST
  setIsSaving(false);

  if (!error) {
    // Aggiorniamo la lista locale
    setItems(prevItems => prevItems.map(it => {
      if (it.id === idToUpdate) {
        return { ...it, ...payload, creator: payload.author, kind: payload.type, sourcesArr: parseSources(payload.source) };
      } return it;
    }));
    fetchPinnedItems(); 
    showToast("Modifiche salvate! 💾", "success"); // <-- Il toast arriva qui
  } else { 
    // Se c'è un errore, dobbiamo riaprire il modale o avvisare
    showToast("Errore aggiornamento: " + error.message, "error"); 
    // Opzionale: potresti riaprire il modale qui se vuoi
  }
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
  
  /* =========================================
     NUOVA LOGICA: RITUALE DELLA POLVERE
     ========================================= */

  // Funzione "Sì, lo tengo" (Spolvera)
  // Aggiorna la data di creazione ad OGGI, riportandolo in cima alla lista.
  const confirmKeep = useCallback(async () => {
  if(!cleanupItem) return;
  const id = cleanupItem.id;

  // 1. VIA LA MODALE
  setCleanupItem(null);
  
  // 2. BARRA
  setIsSaving(true);
  
  const now = new Date().toISOString();
  const { error } = await supabase.from('items').update({ created_at: now }).eq('id', id);

  setIsSaving(false);

  if (!error) {
    // Aggiornamento lista locale...
    setItems(prev => {
      const updatedList = prev.map(x => x.id === id ? {...x, created_at: now} : x);
      return updatedList.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    });
    showToast("Elemento spolverato e riconfermato! ✨", "success");
  } else {
    showToast("Errore: " + error.message, "error");
  }
}, [cleanupItem, showToast]);

  // (Opzionale) Modifica confirmDeleteCleanup per chiudere la modale se non l'hai già fatto
  // Assicurati che la tua 'confirmDeleteCleanup' esistente chiami setCleanupItem(null) alla fine.

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
      <ZenBar active={isSaving} /> 
      <ToastContainer toasts={toasts} />
      
      <h1 style={{textAlign:'center'}}>Biblioteca personale</h1>
      
      {/* ===== Ricerca Zen "Cool Gray" CON TASTO X ===== */}
      <section className="card" style={{marginBottom:0, padding: "6px 12px", display:'flex', alignItems:'center', gap:8, backgroundColor:'#FFF9F0', borderRadius: 12, boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
        <div style={{flex:1, display:'flex', alignItems:'center', gap:8}}>
          <span style={{opacity:0.4, fontSize:'1.1em'}}>🔍</span>
          <input 
            style={{width:'100%', border:'none', outline:'none', background:'transparent', fontSize:'1rem', padding:0, margin:0, height: 40}} 
            placeholder="Cerca..." 
            value={qInput} 
            onChange={e=>setQInput(e.target.value)} 
          />
          {/* TASTO X */}
          {qInput && (
            <button 
              onClick={() => { setQInput(""); setStatusFilter("active"); }} 
              style={{background:'transparent', border:'none', fontSize:'1.1em', color:'#718096', cursor:'pointer', padding:'0 8px'}}
            >
              ✖
            </button>
          )}
        </div>
        
        {/* Tasto STATISTICHE */}
        <button className="ghost" onClick={()=>setStatsModalOpen(true)} style={{padding:'8px', fontSize:'1.1em', opacity:0.7}} title="Statistiche">📊</button>

        {/* Menu Avanzato */}
        <button className="ghost" onClick={()=>setAdvOpen(true)} style={{padding:'8px', fontSize:'1.1em', opacity:0.7}} title="Menu Avanzato">⚙️</button>
      </section>

      {/* ===== ETICHETTE FILTRI ATTIVI (Split Layout) ===== */}
      {(statusFilter !== 'active' || sourceFilter || genreFilter || moodFilter || yearFilter || letterFilter || typeFilter || completionYearFilter) && (
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'12px', gap:12}}>
          
          {/* COLONNA SINISTRA (Tag Flessibili) */}
          <div style={{display:'flex', flexWrap:'wrap', gap:8, alignItems:'center', flex:1}}>
            <span style={{fontSize:'0.8em', opacity:0.6}}>Filtri:</span>
            {statusFilter !== 'active' && (<button className="ghost" onClick={()=>setStatusFilter('active')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0', color:'#4a5568', display:'flex', alignItems:'center', gap:4}}>{statusFilter === 'archived' ? '📦 Archivio' : '👁️ Tutto'} <span>✖</span></button>)}
            {typeFilter && (<button className="ghost" onClick={()=>setTypeFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0', color:'#4a5568', display:'flex', alignItems:'center', gap:4}}>{TYPE_ICONS[typeFilter]} {typeFilter} <span>✖</span></button>)}
            {sourceFilter === 'Wishlist' && (<button className="ghost" onClick={()=>setSourceFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#ebf8ff', color:'#2b6cb0', display:'flex', alignItems:'center', gap:4, border:'1px solid #bee3f8'}}>🛒 Wishlist <span>✖</span></button>)}
            {genreFilter && (<button className="ghost" onClick={()=>setGenreFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0', color:'#4a5568', display:'flex', alignItems:'center', gap:4}}>{genreFilter} <span>✖</span></button>)}
            {moodFilter && (<button className="ghost" onClick={()=>setMoodFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#feebc8', color:'#c05621', display:'flex', alignItems:'center', gap:4}}>{moodFilter} <span>✖</span></button>)}
            {yearFilter && (<button className="ghost" onClick={()=>setYearFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0', color:'#4a5568', display:'flex', alignItems:'center', gap:4}}>Anno: {yearFilter} <span>✖</span></button>)}
            
            {/* TAG LETTERA MODIFICATO CON INDICAZIONE TIPO */}
            {letterFilter && (
                <button className="ghost" onClick={()=>setLetterFilter('')} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#e2e8f0', color:'#4a5568', display:'flex', alignItems:'center', gap:4}}>
                    {letterMode === 'title' ? 'Titolo' : 'Autore'}: {letterFilter}... <span>✖</span>
                </button>
            )}

            {(completionYearFilter) && (<button className="ghost" onClick={()=>{setCompletionYearFilter(''); setCompletionMonthFilter(''); setStatusFilter('active');}} style={{padding:'2px 8px', fontSize:'0.85em', borderRadius:12, backgroundColor:'#fbb6ce', color:'#822727', display:'flex', alignItems:'center', gap:4}}>📅 {completionMonthFilter ? `${completionMonthFilter}/` : ''}{completionYearFilter} <span>✖</span></button>)}
          </div>

          {/* COLONNA DESTRA (Bottone Pulisci Fisso) */}
          <div style={{flexShrink:0}}>
            <button 
              className="ghost" 
              onClick={clearAllFilters} 
              style={{
                fontSize:'0.85em', 
                fontWeight:'600', 
                color:'#fd8383ff', 
                padding:'4px 8px',
                cursor:'pointer',
                whiteSpace:'nowrap'
              }}
            >
              Pulisci
            </button>
          </div>
        </div>
      )}

      {/* ===== HOME ZEN (Minimalista) ===== */}
      {!isSearchActive && !loading && (
        <>
          {/* FOCUS ZEN - DISCIPLINA */}
          {pinnedItems.length > 0 && (
            <section className="card" style={{marginTop: 12, marginBottom:12, borderLeft:'4px solid #38a169', backgroundColor:'#f0fff4', padding:'12px 16px'}}>
              <h3 style={{marginTop:0, marginBottom:8, fontSize:'1em', color:'#22543d', textTransform:'uppercase', letterSpacing:'0.05em', display:'flex', justifyContent:'space-between'}}>
                <span>📌 Piano di Lettura</span>
                <span style={{fontSize:'0.8em', opacity:0.6, fontWeight:'normal'}}>{pinnedItems.length} in programma</span>
              </h3>
              <div style={{display:'flex', flexDirection:'column'}}>
                {pinnedItems.map((p, idx) => (
                  <div key={p.id} style={{padding: '10px 0', borderBottom: idx === pinnedItems.length-1 ? 'none' : '1px solid #c6f6d5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12}}>
                    <div style={{flex: 1}}>
                      <div style={{fontWeight:'600', fontSize:'1rem', color:'#2f855a'}}>{TYPE_ICONS[p.kind]} {p.title}</div>
                      <div style={{fontSize:'0.85em', opacity:0.8, color:'#276749'}}>{p.creator}</div>
                    </div>
                    <div style={{display:'flex', alignItems:'center', gap: 8}}>
                        <button className="ghost" onClick={() => openArchiveModal(p)} title="Obiettivo Raggiunto! Archivia" style={{fontSize:'1.3em', padding:'6px', cursor:'pointer', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px'}}>📦</button>
                        {p.video_url && (<a href={p.video_url} target="_blank" rel="noopener noreferrer" title="Inizia ora" className="ghost button" style={{fontSize:'1.3em', textDecoration:'none', padding:'6px', display:'flex', alignItems:'center', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px'}}>{getLinkEmoji(p.video_url)}</a>)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

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
                  isArchiveView={statusFilter === 'archived'} // Passa true se stiamo guardando solo l'archivio
                  onToggleFocus={toggleFocus}
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
      
      {/* ===== MODALE AGGIUNTA (Beige + Trasparenza) ===== */}
      {addModalOpen && (
        <div className="modal-backdrop" onClick={() => setAddModalOpen(false)}>
          <div className="card" onClick={e => e.stopPropagation()} 
               style={{
                 maxWidth:500, width:"94%", padding:"24px", borderRadius: 24, // Arrotondamento coerente
                 backgroundColor:'#FDF8F2', position:'relative', border:'1px solid #fff',
                 boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
               }}>
            
            {/* HEADER ZEN BILANCIATO */}
            <div style={{position:'relative', marginBottom: 20, marginTop: 4}}>
              <h2 style={{margin:0, color:'#2d3748', fontSize:'1.4rem', textAlign:'center'}}>Nuovo Elemento</h2>
              <div style={{width: 40, height: 3, backgroundColor: '#d6bc9b', margin: '8px auto', borderRadius: 2}}></div>
              
              {/* TASTO CHIUDI ROTONDO */}
              <button 
                onClick={() => setAddModalOpen(false)}
                style={{
                  position: 'absolute', right: -10, top: -14, // Posizionato nell'angolo
                  width: 40, height: 40, borderRadius: '50%', // Cerchio perfetto
                  background: 'transparent', border: 'none', 
                  display:'flex', alignItems:'center', justifyContent:'center', // Icona centrata
                  fontSize: '1.4rem', color: '#718096', cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >✕</button>
            </div>

            <form onSubmit={addItem} id="add-form" style={{display:'flex', flexDirection:'column', gap:12}}>
              {/* INPUT TITOLO (Stile Zen) */}
              <input placeholder="Titolo" value={title} onChange={e=>setTitle(e.target.value)} style={{padding:'12px', fontSize:'1.1rem', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, width:'100%', boxSizing:'border-box', backgroundColor:'transparent', textAlign:'center', fontWeight:'bold', color:'#2d3748'}} autoFocus />
              <input placeholder="Autore / Regista" value={creator} onChange={e=>setCreator(e.target.value)} style={{padding:'12px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, width:'100%', boxSizing:'border-box', backgroundColor:'transparent', textAlign:'center', color:'#4a5568'}} />
              
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <select value={kind} onChange={handleAddKindChange} style={{padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', color:'#2d3748'}}>{TYPES.filter(t => t !== 'audiolibro').map(t=> <option key={t} value={t}>{TYPE_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>)}</select>
                <input type="number" placeholder="Anno" value={year} onChange={e=>setYear(e.target.value)} style={{padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, width:'100%', boxSizing:'border-box', backgroundColor:'transparent'}} />
                {showGenreInput(kind) ? (<select value={genre} onChange={e=>setGenre(e.target.value)} style={{padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', color:'#2d3748'}}><option value="">Genere</option>{GENRES.map(g => <option key={g} value={g}>{g}</option>)}</select>) : <div />}
                <select value={mood} onChange={e=>setMood(e.target.value)} style={{padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', color:'#2d3748'}}><option value="">Umore</option>{MOODS.map(m => <option key={m} value={m}>{m}</option>)}</select>
              </div>

              <input placeholder="Link (opzionale)" value={videoUrl} onChange={e=>setVideoUrl(e.target.value)} style={{padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, width:'100%', boxSizing:'border-box', fontSize:'0.9em', backgroundColor:'transparent'}} />
              <textarea placeholder="Note personali..." value={note} onChange={e=>setNote(e.target.value)} rows={3} style={{padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, width:'100%', boxSizing:'border-box', fontSize:'0.9em', backgroundColor:'transparent', fontFamily:'inherit', resize:'vertical'}} />
              
              <div style={{marginTop:8}}>
                <label style={{fontSize:'0.75em', fontWeight:'bold', color:'#a0aec0', marginBottom:8, display:'block', textAlign:'center', textTransform:'uppercase', letterSpacing:'0.05em'}}>STATO</label>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
                  <div onClick={() => setIsToBuy(!isToBuy)} style={{border: isToBuy ? '1px solid #3182ce' : `1px solid ${BORDER_COLOR}`, backgroundColor: isToBuy ? '#ebf8ff' : 'transparent', color: isToBuy ? '#2b6cb0' : '#718096', borderRadius: 12, padding: '10px 4px', textAlign:'center', cursor:'pointer', transition:'all 0.2s', opacity: isToBuy ? 1 : 0.7}}><div style={{fontSize:'1.3em', marginBottom:2}}>🛒</div><div style={{fontSize:'0.75em', fontWeight:'bold'}}>Wishlist</div></div>
                  <div onClick={() => { setIsNext(!isNext); if(!isNext) setIsInstantArchive(false); }} style={{border: isNext ? '1px solid #38a169' : `1px solid ${BORDER_COLOR}`, backgroundColor: isNext ? '#f0fff4' : 'transparent', color: isNext ? '#2f855a' : '#718096', opacity: isInstantArchive ? 0.4 : (isNext ? 1 : 0.7), borderRadius: 12, padding: '10px 4px', textAlign:'center', cursor:'pointer', transition:'all 0.2s'}}><div style={{fontSize:'1.3em', marginBottom:2}}>📌</div><div style={{fontSize:'0.75em', fontWeight:'bold'}}>In Corso</div></div>
                  <div onClick={() => { setIsInstantArchive(!isInstantArchive); if(!isInstantArchive) setIsNext(false); }} style={{border: isInstantArchive ? '1px solid #d69e2e' : `1px solid ${BORDER_COLOR}`, backgroundColor: isInstantArchive ? '#fffff0' : 'transparent', color: isInstantArchive ? '#b7791f' : '#718096', borderRadius: 12, padding: '10px 4px', textAlign:'center', cursor:'pointer', transition:'all 0.2s', opacity: isInstantArchive ? 1 : 0.7}}><div style={{fontSize:'1.3em', marginBottom:2}}>✅</div><div style={{fontSize:'0.75em', fontWeight:'bold'}}>Finito</div></div>
                </div>
                {isInstantArchive && (<div style={{marginTop:12, animation:'fadeIn 0.3s', textAlign:'center'}}><label style={{fontSize:'0.85em', color:'#718096'}}>Data: </label><input type="date" value={instantDate} onChange={e=>setInstantDate(e.target.value)} style={{marginLeft:8, padding:'6px', borderRadius:8, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent'}} /></div>)}
              </div>
            </form>
            
            <div style={{display:'flex', gap:12, marginTop:24}}>
              <button type="button" className="ghost" onClick={()=>setAddModalOpen(false)} style={{flex:1, padding:'14px', borderRadius:12, color:'#718096', fontWeight:'600', backgroundColor:'transparent'}}>Annulla</button>
              <button type="submit" form="add-form" style={{flex:2, padding:'14px', borderRadius:12, backgroundColor:'#3e3e3e', color:'white', fontWeight:'600', border:'none', boxShadow:'0 4px 6px rgba(0,0,0,0.1)'}}>Salva</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODALE FILTRI (Zen Coerente) ===== */}
      {advOpen && (
        <div className="modal-backdrop" onClick={() => setAdvOpen(false)} style={{display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)'}}>
          <div className="card" style={{maxWidth:500, width:"94%", maxHeight:"90vh", overflowY:"auto", padding:"24px", borderRadius: 24, backgroundColor:'#FDF8F2', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', border:'1px solid #fff', position:'relative'}} onClick={e => e.stopPropagation()}>
            
            {/* HEADER ZEN */}
            <div style={{position:'relative', marginBottom: 20, marginTop: 4}}>
              <h2 style={{margin:0, color:'#2d3748', fontSize:'1.4rem', textAlign:'center'}}>Filtri & Strumenti</h2>
              <div style={{width: 40, height: 3, backgroundColor: '#d6bc9b', margin: '8px auto', borderRadius: 2}}></div>
              
              {/* TASTO CHIUDI ROTONDO */}
              <button 
                onClick={() => setAdvOpen(false)}
                style={{
                  position: 'absolute', right: -10, top: -14,
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'transparent', border: 'none', 
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize: '1.4rem', color: '#718096', cursor: 'pointer'
                }}
              >✕</button>
            </div>

            <div style={{display:'flex', flexDirection:'column', gap:24}}>
              {/* VISUALIZZAZIONE */}
              <div>
                <label style={{fontSize:'0.75em', fontWeight:'bold', color:'#a0aec0', marginBottom:8, display:'block', textTransform:'uppercase', letterSpacing:'0.05em'}}>Visualizzazione</label>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                  <div onClick={() => { if (statusFilter === 'active') setStatusFilter('archived'); else if (statusFilter === 'archived') setStatusFilter(''); else setStatusFilter('active'); }} style={{border: statusFilter === 'active' ? '1px solid #38a169' : (statusFilter === 'archived' ? '1px solid #d69e2e' : '1px solid #718096'), backgroundColor: statusFilter === 'active' ? '#f0fff4' : (statusFilter === 'archived' ? '#fffff0' : '#edf2f7'), color: statusFilter === 'active' ? '#2f855a' : (statusFilter === 'archived' ? '#b7791f' : '#2d3748'), borderRadius: 16, padding: '16px', textAlign:'center', cursor:'pointer', transition:'all 0.2s', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4}}>
                    <div style={{fontSize:'1.8em', marginBottom:2}}>{statusFilter === 'active' ? '🟢' : (statusFilter === 'archived' ? '📦' : '👁️')}</div><div style={{fontSize:'0.9em', fontWeight:'bold'}}>{statusFilter === 'active' ? 'In Corso' : (statusFilter === 'archived' ? 'Archivio' : 'Mostra Tutti')}</div>
                  </div>
                  <div onClick={() => setSourceFilter(prev => prev === 'Wishlist' ? '' : 'Wishlist')} style={{border: sourceFilter === 'Wishlist' ? '1px solid #3182ce' : `1px solid ${BORDER_COLOR}`, backgroundColor: sourceFilter === 'Wishlist' ? '#ebf8ff' : 'transparent', color: sourceFilter === 'Wishlist' ? '#2b6cb0' : '#718096', borderRadius: 16, padding: '16px', textAlign:'center', cursor:'pointer', transition:'all 0.2s', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4}}>
                    <div style={{fontSize:'1.8em', marginBottom:2}}>🛒</div><div style={{fontSize:'0.9em', fontWeight:'bold'}}>Wishlist</div>
                  </div>
                </div>
              </div>

              {/* DETTAGLI */}
              <div>
                <label style={{fontSize:'0.75em', fontWeight:'bold', color:'#a0aec0', marginBottom:8, display:'block', textTransform:'uppercase', letterSpacing:'0.05em'}}>Filtra per</label>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                  <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{padding:'12px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', fontSize:'0.95em', color:'#2d3748'}}><option value="">Tutti i Tipi</option>{TYPES.map(t=> <option key={t} value={t}>{TYPE_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>)}</select>
                  <select value={moodFilter} onChange={e=>setMoodFilter(e.target.value)} style={{padding:'12px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', fontSize:'0.95em', color:'#2d3748'}}><option value="">Qualsiasi Umore</option>{MOODS.map(m=> <option key={m} value={m}>{m}</option>)}</select>
                  <input type="number" placeholder="Anno" value={yearFilter} onChange={e => setYearFilter(e.target.value)} style={{padding:'12px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, width:'100%', boxSizing:'border-box', fontSize:'0.95em', backgroundColor:'transparent', color:'#2d3748'}} />
                  {showGenreInput(typeFilter) ? (<select value={genreFilter} onChange={e=>setGenreFilter(e.target.value)} style={{padding:'12px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', fontSize:'0.95em', color:'#2d3748'}}><option value="">Qualsiasi Genere</option>{GENRES.map(g=> <option key={g} value={g}>{g}</option>)}</select>) : (<div style={{padding:'12px', borderRadius:12, border: `1px dashed ${BORDER_COLOR}`, backgroundColor:'transparent', color:'#cbd5e0', fontSize:'0.9em', display:'flex', alignItems:'center', justifyContent:'center'}}>Genere n/a</div>)}
                </div>
              </div>
              
              {/* INDICE A-Z */}
               <div>
                <label style={{fontSize:'0.75em', fontWeight:'bold', color:'#a0aec0', marginBottom:8, display:'block', textTransform:'uppercase', letterSpacing:'0.05em'}}>Indice Rapido</label>
                 <div style={{display:'flex', flexWrap:"wrap", gap:6, justifyContent:'center'}}>{"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(L=>(<button key={L} className={`ghost ${letterFilter === L ? 'active-letter' : ''}`} onClick={()=>setLetterFilter(L)} style={{padding:'8px 12px', borderRadius:8, fontSize:'0.9em', border: `1px solid ${BORDER_COLOR}`, backgroundColor: letterFilter === L ? '#e2e8f0' : 'transparent', color: letterFilter === L ? '#2d3748' : '#4a5568', fontWeight: letterFilter === L ? 'bold' : 'normal'}}>{L}</button>))}</div>
               </div>
            </div>

            <div style={{height:1, backgroundColor:'#e2e8f0', margin:'20px 0'}}></div>
            
            {/* FOOTER */}
            <div style={{display:'flex', flexDirection:'column', gap:16}}>
              <div style={{display:'flex', gap:12}}>
                 <button className="ghost" onClick={()=>exportItemsToCsv(items)} style={{flex:1, padding:'12px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', color:'#4a5568', display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:'0.95em'}}>📤 CSV</button>
                 <button className="ghost" onClick={handleCleanupSuggest} style={{flex:1, padding:'12px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', color:'#4a5568', display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:'0.95em'}}>🧹 Pulizia</button>
              </div>
              <button onClick={()=>setAdvOpen(false)} style={{padding:'14px', borderRadius:12, backgroundColor:'#3e3e3e', color:'white', fontWeight:'600', border:'none', width:'100%', fontSize:'1rem'}}>Chiudi</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODALE STATISTICHE (Zen Coerente) ===== */}
      {statsModalOpen && (
        <div className="modal-backdrop" onClick={() => setStatsModalOpen(false)}>
          <div className="card" style={{maxWidth:600, width:"94%", maxHeight:"90vh", overflowY:"auto", padding:"24px", borderRadius: 24, backgroundColor:'#FDF8F2', position:'relative', border:'1px solid #fff'}} onClick={e => e.stopPropagation()}>
            
            {/* HEADER ZEN */}
            <div style={{position:'relative', marginBottom: 20, marginTop: 4}}>
              <h2 style={{margin:0, color:'#2d3748', fontSize:'1.4rem', textAlign:'center'}}>Statistiche</h2>
              <div style={{width: 40, height: 3, backgroundColor: '#d6bc9b', margin: '8px auto', borderRadius: 2}}></div>
              
              {/* TASTO CHIUDI ROTONDO */}
              <button 
                onClick={() => setStatsModalOpen(false)}
                style={{
                  position: 'absolute', right: -10, top: -14,
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'transparent', border: 'none', 
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize: '1.4rem', color: '#718096', cursor: 'pointer'
                }}
              >✕</button>
            </div>
            
            {/* TOGGLE */}
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20}}>
              <div onClick={() => setStatsView('periodo')} style={{border: statsView === 'periodo' ? '1px solid #d53f8c' : `1px solid ${BORDER_COLOR}`, backgroundColor: statsView === 'periodo' ? '#fff5f7' : 'transparent', color: statsView === 'periodo' ? '#b83280' : '#718096', borderRadius: 12, padding: '10px', textAlign:'center', cursor:'pointer', fontWeight:'bold', transition:'all 0.2s'}}>
                  📅 Periodo
              </div>
              <div onClick={() => setStatsView('totale')} style={{border: statsView === 'totale' ? '1px solid #3182ce' : `1px solid ${BORDER_COLOR}`, backgroundColor: statsView === 'totale' ? '#ebf8ff' : 'transparent', color: statsView === 'totale' ? '#2b6cb0' : '#718096', borderRadius: 12, padding: '10px', textAlign:'center', cursor:'pointer', fontWeight:'bold', transition:'all 0.2s'}}>
                  📈 Totale
              </div>
            </div>

            {/* CONTENUTO */}
            {statsView === 'periodo' && (
              <div style={{animation:'fadeIn 0.3s'}}>
                <div style={{display:'flex', gap: 8, alignItems: 'center', justifyContent:'center', marginBottom:20}}>
                  <input type="number" placeholder="Mese" value={statMonth} onChange={e=>setStatMonth(e.target.value)} style={{width:60, padding:8, borderRadius:8, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', textAlign:'center'}} />
                  <input type="number" placeholder="Anno" value={statYear} onChange={e=>setStatYear(e.target.value)} style={{width:80, padding:8, borderRadius:8, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', textAlign:'center'}} />
                  <button className="ghost" onClick={() => { setStatMonth(new Date().getMonth() + 1); setStatYear(new Date().getFullYear()); }} style={{fontSize:'0.9em', textDecoration:'underline'}}>Oggi</button>
                </div>
                
                <div onClick={() => handleStatClick(null)} style={{textAlign:'center', marginBottom:20, cursor:'pointer', transition:'all 0.2s', padding: 8, borderRadius: 12, border:'1px dashed transparent', ':hover': {borderColor:BORDER_COLOR}}}>
                  <div style={{fontSize:'3em', fontWeight:'bold', color:'#2d3748', lineHeight:1}}>{periodStats.total}</div>
                  <div style={{fontSize:'0.9em', color:'#718096', textTransform:'uppercase', letterSpacing:'0.05em'}}>Elementi completati</div>
                </div>

                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12}}>
                  <div onClick={() => handleStatClick('libro')} style={{backgroundColor:'transparent', border: `1px solid ${BORDER_COLOR}`, borderRadius:12, padding:8, textAlign:'center', cursor:'pointer'}}><div style={{fontSize:'1.5em'}}>📚</div><div style={{fontWeight:'bold'}}>{periodStats.libro}</div></div>
                  <div onClick={() => handleStatClick('film')} style={{backgroundColor:'transparent', border: `1px solid ${BORDER_COLOR}`, borderRadius:12, padding:8, textAlign:'center', cursor:'pointer'}}><div style={{fontSize:'1.5em'}}>🎬</div><div style={{fontWeight:'bold'}}>{periodStats.film}</div></div>
                  <div onClick={() => handleStatClick('gioco')} style={{backgroundColor:'transparent', border: `1px solid ${BORDER_COLOR}`, borderRadius:12, padding:8, textAlign:'center', cursor:'pointer'}}><div style={{fontSize:'1.5em'}}>🎮</div><div style={{fontWeight:'bold'}}>{periodStats.gioco || 0}</div></div>
                  <div onClick={() => handleStatClick('audiolibro')} style={{backgroundColor:'transparent', border: `1px solid ${BORDER_COLOR}`, borderRadius:12, padding:8, textAlign:'center', cursor:'pointer'}}><div style={{fontSize:'1.5em'}}>🎧</div><div style={{fontWeight:'bold'}}>{periodStats.audiolibro}</div></div>
                  <div onClick={() => handleStatClick('album')} style={{backgroundColor:'transparent', border: `1px solid ${BORDER_COLOR}`, borderRadius:12, padding:8, textAlign:'center', cursor:'pointer'}}><div style={{fontSize:'1.5em'}}>💿</div><div style={{fontWeight:'bold'}}>{periodStats.album}</div></div>
                  <div onClick={() => handleStatClick('video')} style={{backgroundColor:'transparent', border: `1px solid ${BORDER_COLOR}`, borderRadius:12, padding:8, textAlign:'center', cursor:'pointer'}}><div style={{fontSize:'1.5em'}}>▶️</div><div style={{fontWeight:'bold'}}>{periodStats.video || 0}</div></div>
                </div>
              </div>
            )}

            {statsView === 'totale' && (
               <div style={{animation:'fadeIn 0.3s'}}>
                 {/* KPI */}
                <div style={{display:'flex', justifyContent:'space-between', backgroundColor:'transparent', border: `1px solid ${BORDER_COLOR}`, borderRadius:16, padding:16, marginBottom:20}}>
                   <div style={{textAlign:'center'}}><div style={{fontSize:'1.4em', fontWeight:'bold'}}>{stats.total}</div><div style={{fontSize:'0.8em', color:'#718096'}}>Totali</div></div>
                   <div style={{width:1, backgroundColor:BORDER_COLOR}}></div>
                   <div style={{textAlign:'center'}}><div style={{fontSize:'1.4em', fontWeight:'bold', color:'#38a169'}}>{stats.active}</div><div style={{fontSize:'0.8em', color:'#718096'}}>In Corso</div></div>
                   <div style={{width:1, backgroundColor:BORDER_COLOR}}></div>
                   <div style={{textAlign:'center'}}><div style={{fontSize:'1.4em', fontWeight:'bold', color:'#d69e2e'}}>{stats.archived}</div><div style={{fontSize:'0.8em', color:'#718096'}}>Archivio</div></div>
                </div>
                <h4 style={{marginTop:0, marginBottom:8, color:'#718096', fontSize:'0.9em', textTransform:'uppercase'}}>Per Tipo</h4>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:20}}>
                   {stats.byType.map(x=> (
                     <div key={x.t} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', border: `1px solid ${BORDER_COLOR}`, borderRadius:12}}>
                       <span>{TYPE_ICONS[x.t]} {x.t.charAt(0).toUpperCase() + x.t.slice(1)}</span>
                       <strong>{x.n}</strong>
                     </div>
                   ))}
                </div>
               </div>
            )}

            <button onClick={()=>setStatsModalOpen(false)} style={{marginTop:24, padding:'14px', borderRadius:12, backgroundColor:'#3e3e3e', color:'white', fontWeight:'600', border:'none', width:'100%'}}>Chiudi</button>
          </div>
        </div>
      )}

      {archModal && (
        <div className="modal-backdrop" onClick={() => setArchModal(null)}>
          <div className="card" style={{maxWidth:560, width:"92%", padding:16}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0}}>Archivia — {archModal.title}</h2>
            <div style={{display:'flex', flexDirection:'column', gap:12, margin:'16px 0'}}>
              <label style={{display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:8, border: `1px solid ${BORDER_COLOR}`, cursor:'pointer', backgroundColor:'#f7fafc'}}>
                 <input type="checkbox" checked={(archModal.sourcesArr||[]).includes("Wishlist")} onChange={e => { const isChecked = e.target.checked; setArchModal(prev => { const current = new Set(prev.sourcesArr || []); if(isChecked) current.add("Wishlist"); else { current.delete("Wishlist"); current.delete("da comprare"); } return {...prev, sourcesArr: Array.from(current)}; }); }} />
                 <span style={{color:'#4a5568'}}>🛒 Mi è piaciuto! Metti in Wishlist</span>
              </label>
              <label style={{fontWeight:'bold', fontSize:'0.9rem', color:'#4a5568', marginTop:8}}>Data fine:</label>
              <input type="date" value={archModal.dateISO} onChange={e=>setArchModal(m=>({...m, dateISO:e.target.value}))} />
            </div>
            <div className="row" style={{justifyContent:"flex-end", gap:8, marginTop:12}}><button className="ghost" onClick={()=>setArchModal(null)}>Annulla</button><button onClick={()=>saveArchiveFromModal(archModal)}>Archivia</button></div>
          </div>
        </div>
      )}

      {/* ===== MODALE PULIZIA ZEN (RITUALE DELLA POLVERE) ===== */}
      {cleanupItem && (
        <div className="modal-backdrop" onClick={() => setCleanupItem(null)}>
          <div 
            className="card" 
            style={{
              maxWidth: 400, 
              width: "90%", 
              padding: 24, 
              textAlign: 'center', 
              backgroundColor: '#FFF9F0', 
              borderRadius: 20,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }} 
            onClick={e => e.stopPropagation()}
          >
            
            <div style={{fontSize:'3rem', marginBottom:10, filter: 'grayscale(0.5)'}}>💨</div>
            
            <h3 style={{marginTop:0, marginBottom: 12, color:'#2d3748', fontSize:'1.4rem'}}>
              C'è un po' di polvere...
            </h3>
            
            <p style={{color:'#718096', lineHeight:1.6, marginBottom: 20, fontSize: '0.95rem'}}>
              Hai aggiunto questo elemento molto tempo fa e non l'hai ancora finito. Ha ancora valore per te?
            </p>

            {/* CARD DELL'ELEMENTO CONTESTUALE */}
            <div style={{
               backgroundColor: 'white',
               border: `1px solid #d6bc9b`, 
               borderRadius: 12, 
               padding: '16px', 
               marginBottom: 24,
               display: 'flex',
               flexDirection: 'column',
               gap: 4,
               boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
            }}>
               <div style={{fontWeight: 'bold', fontSize: '1.1rem', color: '#2d3748'}}>
                 {TYPE_ICONS[cleanupItem.kind]} {cleanupItem.title}
               </div>
               <div style={{fontSize: '0.9rem', color: '#718096'}}>
                 {cleanupItem.creator} • {cleanupItem.year || 'Anno N/A'}
               </div>
               {cleanupItem.note && (
                 <div style={{fontSize: '0.85rem', color: '#a0aec0', fontStyle: 'italic', marginTop: 4}}>
                   "{cleanupItem.note}"
                 </div>
               )}
            </div>

            {/* AZIONI ZEN */}
            <div style={{display:'flex', gap:12}}>
              {/* OPZIONE 1: BUTTARE */}
              <button 
                className="ghost"
                onClick={confirmDeleteCleanup} 
                style={{
                  flex:1, 
                  padding:'12px', 
                  border:'1px solid #feb2b2', 
                  backgroundColor: '#fff5f5',
                  color:'#c53030', 
                  borderRadius:12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                No, elimina 🗑️
              </button>

              {/* OPZIONE 2: TENERE (Riconferma) */}
              <button 
                onClick={confirmKeep} 
                style={{
                  flex:1, 
                  padding:'12px', 
                  backgroundColor:'#38a169', 
                  color:'white', 
                  borderRadius:12, 
                  border:'none', 
                  fontWeight: 600,
                  boxShadow:'0 4px 6px rgba(56, 161, 105, 0.3)',
                  cursor: 'pointer'
                }}
              >
                Sì, lo tengo ✨
              </button>
            </div>

            <button 
              className="ghost" 
              onClick={()=>setCleanupItem(null)} 
              style={{marginTop:16, fontSize:'0.9em', textDecoration:'underline', color:'#a0aec0', background: 'transparent', border: 'none', cursor: 'pointer'}}
            >
              Non ora (lascia lì)
            </button>

          </div>
        </div>
      )}

      {editState && (
        <div className="modal-backdrop" onClick={() => setEditState(null)}>
          <div className="card" onClick={e => e.stopPropagation()} 
               style={{
                 maxWidth: 450, 
                 width: "90%", 
                 maxHeight: "90vh", 
                 overflowY: "auto", 
                 padding: "24px", // Un po' più di aria
                 borderRadius: 24, 
                 backgroundColor: '#FDF8F2', // Beige Zen
                 boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
                 border: '1px solid #fff',
                 position: 'relative' // Per posizionare la X
               }}>
            
            {/* HEADER: TITOLO + TASTO X (Annulla) */}
            <div style={{display:'flex', alignItems:'center', justifyContent:'center', marginBottom: 20, position:'relative'}}>
              {/* Titolo centrato */}
              <div style={{textAlign:'center'}}>
                <h2 style={{margin:0, color:'#2d3748', fontSize:'1.3rem'}}>Modifica Elemento</h2>
                <div style={{width: 40, height: 3, backgroundColor: '#d6bc9b', margin: '8px auto', borderRadius: 2}}></div>
              </div>
              
              {/* Tasto X (Sostituisce Annulla) posizionato assolutamente a destra */}
              <button 
                onClick={()=>setEditState(null)} 
                style={{
                  position: 'absolute', 
                  right: 0, 
                  top: 0,
                  background: 'transparent', 
                  border: 'none', 
                  fontSize: '1.5rem', 
                  color: '#a0aec0', 
                  cursor: 'pointer',
                  padding: '8px'
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateItem} id="edit-form" style={{display:'flex', flexDirection:'column', gap:12}}>
              
              {/* --- I TUOI INPUT (Rimasti uguali ma ordinati) --- */}
              <div style={{display:'flex', flexDirection:'column', gap:12}}>
                <input 
                  placeholder="Titolo" 
                  value={editState.title} 
                  onChange={e => setEditState(curr => ({...curr, title: e.target.value}))} 
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    fontSize:'1.1rem', fontWeight:'bold', padding:'12px', borderRadius:12, 
                    border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', color:'#2d3748', textAlign:'center'
                  }}
                />
                <input 
                  placeholder="Autore / Regista" 
                  value={editState.creator} 
                  onChange={e => setEditState(curr => ({...curr, creator: e.target.value}))} 
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    fontSize:'1rem', padding:'10px', borderRadius:12, 
                    border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', color:'#4a5568', textAlign:'center'
                  }}
                />
              </div>

              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <select value={editState.type} onChange={e => { const newType = e.target.value; setEditState(curr => ({...curr, type: newType})); }} style={{width: '100%', boxSizing: 'border-box', padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', color:'#2d3748'}}>
                    {TYPES.map(t=> <option key={t} value={t}>{TYPE_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
                
                <input 
                  type="number" 
                  placeholder="Anno" 
                  value={editState.year} 
                  onChange={e => setEditState(curr => ({...curr, year: e.target.value}))}
                  style={{width: '100%', boxSizing: 'border-box', padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent'}}
                />

                {showGenreInput(editState.type) ? (
                  <select value={editState.genre} onChange={e => setEditState(curr => ({...curr, genre: e.target.value}))} style={{width: '100%', boxSizing: 'border-box', padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent'}}>
                    <option value="">Genere...</option>
                    {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                ) : <div/>}

                <select value={editState.mood || ""} onChange={e => setEditState(curr => ({...curr, mood: e.target.value}))} style={{width: '100%', boxSizing: 'border-box', padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent'}}>
                    <option value="">Umore...</option>
                    {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <input 
                  placeholder="Link (URL video, wiki, ecc)..." 
                  value={editState.video_url || ""} 
                  onChange={e => setEditState(curr => ({...curr, video_url: e.target.value}))} 
                  style={{width: '100%', boxSizing: 'border-box', padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, backgroundColor:'transparent', fontSize:'0.9em'}}
              />
              <textarea 
                  placeholder="Note personali..." 
                  value={editState.note || ""} 
                  onChange={e=>setEditState(curr => ({...curr, note: e.target.value}))} 
                  rows={3} 
                  style={{width: '100%', boxSizing: 'border-box', padding:'10px', borderRadius:12, border: `1px solid ${BORDER_COLOR}`, fontSize:'0.95em', backgroundColor:'transparent', fontFamily:'inherit', resize:'vertical'}} 
              />

              <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:12, marginTop:4}}>
                 <span style={{fontSize:'0.75em', fontWeight:'bold', color:'#a0aec0', textTransform:'uppercase', letterSpacing:'0.05em'}}>STATO</span>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                 <div 
                    onClick={() => { 
                        const currentArr = parseSources(editState.source);
                        const isW = currentArr.includes('Wishlist');
                        const newArr = isW ? currentArr.filter(x => x !== 'Wishlist') : [...currentArr, 'Wishlist'];
                        setEditState(curr => ({...curr, source: joinSources(newArr)})); 
                    }} 
                    style={{
                        padding: '12px', borderRadius: 12, cursor:'pointer', textAlign:'center', transition:'all 0.3s',
                        border: parseSources(editState.source).includes('Wishlist') ? '1px solid #3182ce' : `1px solid ${BORDER_COLOR}`,
                        backgroundColor: parseSources(editState.source).includes('Wishlist') ? '#ebf8ff' : 'transparent',
                        color: parseSources(editState.source).includes('Wishlist') ? '#2b6cb0' : '#718096',
                        opacity: parseSources(editState.source).includes('Wishlist') ? 1 : 0.6
                    }}
                 >
                    <div style={{fontSize:'1.3rem', marginBottom:2}}>🛒</div>
                    <div style={{fontSize:'0.75em', fontWeight:'bold'}}>Wishlist</div>
                 </div>

                 <div 
                    onClick={() => setEditState(curr => ({...curr, is_next: !curr.is_next}))} 
                    style={{
                        padding: '12px', borderRadius: 12, cursor:'pointer', textAlign:'center', transition:'all 0.3s',
                        border: editState.is_next ? '1px solid #38a169' : `1px solid ${BORDER_COLOR}`,
                        backgroundColor: editState.is_next ? '#f0fff4' : 'transparent',
                        color: editState.is_next ? '#2f855a' : '#718096',
                        opacity: editState.is_next ? 1 : 0.6
                    }}
                 >
                    <div style={{fontSize:'1.3rem', marginBottom:2}}>📌</div>
                    <div style={{fontSize:'0.75em', fontWeight:'bold'}}>In Coda</div>
                 </div>
              </div>
            </form>

            {/* --- NUOVO FOOTER PULITO --- */}
            <div style={{marginTop: 24, display:'flex', flexDirection:'column', gap:16}}>
                
                {/* 1. TASTONE SALVA (Protagonista) */}
                <button 
                    type="submit" form="edit-form" 
                    style={{
                        width: '100%', 
                        padding:'16px', 
                        borderRadius:16, 
                        backgroundColor:'#2d3748', // O usa #3e3e3e
                        color:'white', 
                        fontWeight:'bold', 
                        fontSize: '1rem',
                        border:'none', 
                        boxShadow:'0 4px 12px rgba(45, 55, 72, 0.2)',
                        cursor: 'pointer'
                    }}
                >
                    Salva Modifiche
                </button>

                {/* 2. LINK ELIMINA (Discreto e Minimal) */}
                <button 
                    type="button" 
                    className="ghost"
                    onClick={() => { if (window.confirm("Sei sicuro di voler eliminare definitivamente questo elemento?")) deleteItem(editState.id); }}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#e53e3e',
                        fontSize: '0.85rem',
                        textDecoration: 'none',
                        cursor: 'pointer',
                        opacity: 0.8
                    }}
                >
                    🗑️ Elimina elemento
                </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}