import { useEffect, useMemo, useState, useCallback } from "react";
import "./index.css";
import { supabase } from "./supabaseClient";

/* === COSTANTI E ICONE === */
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
  "ambiente","cinema","storia","romanzi","asia","sociologia","psicologia",
  "filosofia","musica","arte","biografia","vari","scienza","fumetto","sport",
  "rpg", "fps", "avventura", "strategia", "documentario", "tutorial"
];
const MOODS = ["Relax", "Focus", "Energia", "Breve", "Apprendimento", "Impegnativo"];

const GENRE_ALIAS = { socilogia: "sociologia" };
const SOURCE_OPTIONS = ["fisico","biblio","da comprare","internet"];
const SOURCE_ICONS = { fisico:"📦", biblio:"🏛", "da comprare":"🛒", internet:"🌐" };

/* === HELPER FUNCTIONS === */

function showGenreInput(t) {
  return t === 'libro' || t === 'video';
}

function canonGenere(g){
  if(!g) return "";
  const x = String(g).toLowerCase().trim();
  return GENRE_ALIAS[x] || x;
}
function normType(v){ return String(v ?? "").trim().toLowerCase(); }
function parseSources(str){
  if (!str) return [];
  return String(str).toLowerCase().split(/[,;/|+]+/).map(s => s.trim()).filter(Boolean);
}
function joinSources(arr){
  const uniq = Array.from(new Set((arr||[]).map(s=>s.trim()).filter(Boolean)));
  return uniq.join(", ");
}
function exportItemsToCsv(rows){
  const headers = ["id","title","creator","kind","status","genre","mood","year","sources","video_url","finished_at","created_at"];
  const esc = v => `"${String(v ?? "").replace(/"/g,'""')}"`;
  const body = rows.map(i => headers.map(h => esc(i[h])).join(",")).join("\n");
  const csv = [headers.join(","), body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `items_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App(){
  
  /* --- 1. STATI --- */
  const [items,setItems] = useState([]);
  const [pinnedItems, setPinnedItems] = useState([]); 
  const [loading,setLoading] = useState(false); 

  // Stats
  const [stats, setStats] = useState({
    total: 0, active: 0, archived: 0, byType: [], bySource: []
  });
  const [periodStats, setPeriodStats] = useState({ total: 0, libro: 0, audiolibro: 0, film: 0, album: 0, video: 0, gioco: 0 });
  const [periodLoading, setPeriodLoading] = useState(false);

  // Filtri Principali
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState(""); 
  const [statusFilter, setStatusFilter] = useState("active"); // <--- NUOVO: Filtro Stato (default: active)
  const [typeFilter,setTypeFilter] = useState("");
  const [genreFilter,setGenreFilter] = useState("");
  const [moodFilter, setMoodFilter] = useState("");
  const [sourceFilter,setSourceFilter] = useState("");
  const [letterFilter, setLetterFilter] = useState("");
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

  // Form Aggiunta
  const [title,setTitle] = useState("");
  const [creator,setCreator] = useState("");
  const [kind,setKind] = useState("libro");
  const [genre,setGenre] = useState("");
  const [mood, setMood] = useState(""); 
  const [videoUrl, setVideoUrl] = useState("");
  const [year,setYear] = useState("");
  const [isNext, setIsNext] = useState(false);

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


  /* --- 2. FUNZIONI ASINCRONE --- */

  const fetchPinnedItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('items')
      .select('*')
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
    setLoading(true);
    let query = supabase
      .from("items")
      .select("id,title,creator:author,kind:type,status,created_at,genre,mood,year,sources:source,video_url,is_next,finished_at:ended_on")
      .order("created_at", { ascending:false })
      .limit(500); 

    if (q) { query = query.or(`title.ilike.%${q}%,author.ilike.%${q}%`); }
    
    // Filtro per Stato (Nuovo)
    if (statusFilter) { query = query.eq('status', statusFilter); }

    if (typeFilter) { query = query.eq('type', typeFilter); }
    if (genreFilter) { query = query.eq('genre', canonGenere(genreFilter)); }
    if (moodFilter) { query = query.eq('mood', moodFilter); }
    if (sourceFilter) { query = query.ilike('source', `%${sourceFilter}%`); }
    if (letterFilter) { query = query.ilike('author', `${letterFilter}%`); }
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
  }, [q, statusFilter, typeFilter, genreFilter, moodFilter, sourceFilter, letterFilter, yearFilter, completionMonthFilter, completionYearFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const { count: totalCount } = await supabase.from("items").select('*', { count: 'exact', head: true });
      const { count: archivedCount } = await supabase.from("items").select('*', { count: 'exact', head: true }).or("ended_on.not.is.null, status.eq.archived");
      
      const typePromises = TYPES.map(t => supabase.from("items").select('*', { count: 'exact', head: true }).eq('type', t));
      const typeResults = await Promise.all(typePromises);
      const byType = typeResults.map((res, idx) => ({ t: TYPES[idx], n: res.count || 0 }));

      const sourcePromises = SOURCE_OPTIONS.map(s => supabase.from("items").select('*', { count: 'exact', head: true }).ilike('source', `%${s}%`));
      const sourceResults = await Promise.all(sourcePromises);
      const bySource = sourceResults.map((res, idx) => ({ s: SOURCE_OPTIONS[idx], n: res.count || 0 }));

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
    setPeriodLoading(true);
    const { data } = await supabase.rpc('get_period_stats', {
      p_year: statYear ? Number(statYear) : null,
      p_month: statMonth ? Number(statMonth) : null
    });
    if (data && data.length > 0) {
      setPeriodStats(data[0]); 
    } else {
      setPeriodStats({ total: 0, libro: 0, audiolibro: 0, film: 0, album: 0, video: 0, gioco: 0 });
    }
    setPeriodLoading(false);
  }, [statYear, statMonth]); 


  /* --- 3. HANDLERS --- */
  
  const isSearchActive = useMemo(() => {
    return q.length > 0 || statusFilter.length > 0 || typeFilter.length > 0 || genreFilter.length > 0 || moodFilter.length > 0 ||
           sourceFilter.length > 0 || letterFilter.length > 0 || yearFilter.length > 0 || 
           String(completionMonthFilter).length > 0 || String(completionYearFilter).length > 0;
  }, [q, statusFilter, typeFilter, genreFilter, moodFilter, sourceFilter, letterFilter, yearFilter, completionMonthFilter, completionYearFilter]);

  const addItem = useCallback(async (e) => {
    e.preventDefault();
    if(!title.trim()) return;
    const payload = {
      title, author: creator, type: kind, status: "active",
      genre: showGenreInput(kind) ? canonGenere(genre) : null, 
      year: year ? Number(year) : null,
      source: joinSources([]),
      mood: mood || null, video_url: videoUrl || null, is_next: isNext
    };
    const { error } = await supabase.from("items").insert(payload);
    if(!error){
      setTitle(""); setCreator(""); setKind("libro"); setGenre(""); setYear(""); 
      setMood(""); setVideoUrl(""); setIsNext(false);
      setAddModalOpen(false); 
      if (isSearchActive) fetchItems(); 
      fetchStats(); fetchPinnedItems();
    } else { alert("Errore salvataggio: " + (error?.message || "sconosciuto")); }
  }, [title, creator, kind, genre, year, mood, videoUrl, isNext, isSearchActive, fetchItems, fetchStats, fetchPinnedItems]);

  const toggleFocus = useCallback(async (it) => {
    const newVal = !it.is_next;
    const { error } = await supabase.from("items").update({ is_next: newVal }).eq("id", it.id);
    if (!error) { fetchItems(); fetchPinnedItems(); }
  }, [fetchItems, fetchPinnedItems]);

  const markAsPurchased = useCallback(async (it) => {
    const srcs = new Set([...(it.sourcesArr||[])]);
    srcs.delete("da comprare"); srcs.add("fisico");
    const { error } = await supabase.from("items").update({ source: joinSources(Array.from(srcs)) }).eq("id", it.id);
    if (!error) { if(isSearchActive) fetchItems(); fetchStats(); }
  }, [isSearchActive, fetchItems, fetchStats]);

  const openArchiveModal = useCallback((it) => {
    setArchModal({
      id: it.id, title: it.title, kind: it.kind,
      sourcesArr: it.sourcesArr || [], source: "", 
      dateISO: new Date().toISOString().slice(0,10),
    });
  }, []);
  
  const saveArchiveFromModal = useCallback(async (m) => {
    const next = new Set([...(m.sourcesArr||[])]);
    if (m.source && m.source !== "") next.add(m.source);
    await supabase.from("items").update({ 
      status: "archived", ended_on: m.dateISO, source: joinSources(Array.from(next)), is_next: false 
    }).eq("id", m.id);
    setArchModal(null);
    if(isSearchActive) fetchItems(); fetchStats(); fetchPinnedItems();
    if(statsModalOpen) fetchPeriodStats(); 
  }, [isSearchActive, statsModalOpen, fetchItems, fetchStats, fetchPeriodStats, fetchPinnedItems]);
  
  const unarchive = useCallback(async (it) => {
    await supabase.from("items").update({ status: "active", ended_on: null }).eq("id", it.id);
    if(isSearchActive) fetchItems(); fetchStats();
    if(statsModalOpen) fetchPeriodStats();
  }, [isSearchActive, statsModalOpen, fetchItems, fetchStats, fetchPeriodStats]);

  /* --- LOGICA CONSIGLI --- */
  const handleSuggest = useCallback(async () => {
    setSuggestion(null); 
    const conflict = pinnedItems.find(p => p.kind === randKind);
    if (conflict) {
      alert(`✋ Alt! Per "${randKind}" hai già fissato:\n"${conflict.title}".\n\nFinisci prima quello.`);
      return; 
    }
    const gCanon = canonGenere(randGenre);
    
    const { data, error } = await supabase.rpc('get_random_suggestion', {
      p_kind: randKind,
      p_genre: showGenreInput(randKind) ? (gCanon || null) : null,
      p_mood: randMood || null 
    });

    if (error || !data || data.length === 0) {
      alert("Nessun elemento trovato con questi criteri (Tipo + Umore + Genere).");
      return;
    }
    const raw = data[0];
    const adaptedSuggestion = {
      ...raw,
      kind: normType(raw.type), 
      author: raw.author || raw.creator 
    };
    setSuggestion(adaptedSuggestion);
  }, [pinnedItems, randKind, randGenre, randMood]); 

  const handleTypeChange = useCallback((e) => {
    const newType = e.target.value;
    setTypeFilter(newType);
    if (!showGenreInput(newType)) setGenreFilter(""); 
    if (newType === 'gioco' || newType === 'video') setSourceFilter("");
  }, []);

  const handleAddKindChange = useCallback((e) => {
    const newKind = e.target.value;
    setKind(newKind);
    if (!showGenreInput(newKind)) setGenre(""); 
  }, []);

  const clearAllFilters = useCallback(() => {
    setQ(""); setQInput(""); setTypeFilter(""); setGenreFilter(""); 
    setMoodFilter(""); setSourceFilter(""); setLetterFilter(""); setYearFilter(""); 
    setCompletionMonthFilter(""); setCompletionYearFilter(""); 
    setSuggestion(null); 
    setStatusFilter("active"); // Reset status to active
  }, []);

  const openEditModal = useCallback((it) => {
    setEditState({
      id: it.id, title: it.title, creator: it.creator, type: it.kind,     
      genre: it.genre || '', year: it.year || '', mood: it.mood || '', 
      video_url: it.video_url || '', is_next: it.is_next || false,
      source: it.sources || ''
    });
  }, []);
  
  const handleUpdateItem = useCallback(async (e) => {
    e.preventDefault();
    if (!editState || !editState.title.trim()) return;
    const payload = {
      title: editState.title, author: editState.creator, type: editState.type,
      genre: showGenreInput(editState.type) ? canonGenere(editState.genre) : null,
      year: editState.year ? Number(editState.year) : null,
      mood: editState.mood || null, video_url: editState.video_url || null, is_next: editState.is_next,
      source: editState.source 
    };
    await supabase.from("items").update(payload).eq('id', editState.id);
    setEditState(null); fetchItems(); fetchPinnedItems();
  }, [editState, fetchItems, fetchPinnedItems]);

  const handleStatClick = useCallback((typeClicked) => {
    if (typeClicked && TYPES.includes(typeClicked)) setTypeFilter(typeClicked);
    else setTypeFilter(''); 
    setCompletionYearFilter(String(statYear)); 
    setCompletionMonthFilter(String(statMonth)); 
    setQ(''); setQInput(''); setGenreFilter(''); setMoodFilter(''); setSourceFilter(''); setLetterFilter(''); setYearFilter('');
    setStatsModalOpen(false);
  }, [statYear, statMonth]); 

  const deleteItem = useCallback(async (itemId) => {
    await supabase.from('items').delete().eq('id', itemId);
    setEditState(null); fetchItems(); fetchStats(); fetchPinnedItems();
    if (statsModalOpen) fetchPeriodStats();
  }, [statsModalOpen, fetchItems, fetchStats, fetchPeriodStats, fetchPinnedItems]);

  
  /* --- 4. EFFETTI --- */
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 250); return () => clearTimeout(t); }, [qInput]);
  useEffect(()=>{ fetchStats(); fetchPinnedItems(); },[fetchStats, fetchPinnedItems]); 
  useEffect(() => { if (isSearchActive) { fetchItems(); } else { setItems([]); setLoading(false); } }, [isSearchActive, fetchItems]); 
  useEffect(() => { if (statsModalOpen) fetchPeriodStats(); }, [statsModalOpen, fetchPeriodStats]); 

  useEffect(() => {
    const fetchMemory = async () => {
      const { data } = await supabase.from('items')
        .select('title, ended_on, author')
        .not('ended_on', 'is', null);

      if (data && data.length > 0) {
        const randomIndex = Math.floor(Math.random() * data.length);
        const randomItem = data[randomIndex];
        const diffDays = Math.ceil(Math.abs(new Date() - new Date(randomItem.ended_on)) / (1000 * 60 * 60 * 24)); 
        if (diffDays > 0) setMemoryItem({ ...randomItem, daysAgo: diffDays });
      }
    };
    fetchMemory();
  }, []);


  /* --- 5. RENDER (JSX) --- */
  return (
    <div className="app">
      <h1 style={{textAlign:'center'}}>Biblioteca personale</h1>

      {/* ===== Ricerca ===== */}
      <section className="card" style={{marginBottom:12}}>
        <div className="search" style={{flexWrap:"wrap", gap:8}}>
          <input style={{flex:1, minWidth:200}} placeholder="Inizia a cercare..." value={qInput} onChange={e=>setQInput(e.target.value)} />
          <button className="ghost" onClick={()=>setAdvOpen(true)}>🔎 Filtri</button>
          <button className="ghost" onClick={()=>setStatsModalOpen(true)}>📊 Statistiche</button>
          <button className="ghost" onClick={clearAllFilters}>Pulisci</button>
        </div>
      </section>

      {/* ===== HOME ===== */}
      {!isSearchActive && !loading && (
        <>
          {/* FOCUS */}
          {pinnedItems.length > 0 && (
            <section className="card" style={{marginBottom:12, borderLeft:'4px solid #38a169', backgroundColor:'#f0fff4'}}>
              <h3 style={{marginTop:0, fontSize:'1em', color:'#22543d'}}>📌 In Corso (Focus)</h3>
              <div style={{display:'flex', flexDirection:'column', gap:8}}>
                {pinnedItems.map(p => (
                  <div key={p.id} style={{paddingBottom:8, borderBottom: pinnedItems.indexOf(p) === pinnedItems.length-1 ? 'none' : '1px solid #c6f6d5'}}>
                    <div style={{fontWeight:'bold'}}>
                      {TYPE_ICONS[p.kind]} {p.title}
                    </div>
                    <div style={{fontSize:'0.9em', opacity:0.8}}>
                      {p.creator}
                    </div>
                    {p.video_url && (
                      <a href={p.video_url} target="_blank" rel="noopener noreferrer" style={{fontSize:'0.85em', color:'#276749'}}>
                        🔗 Apri Link
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* MEMORY LANE */}
          {memoryItem && (
             <div className="card" style={{
                marginBottom: 12, backgroundColor: 'transparent', border: '1px dashed #cbd5e0', padding: '8px 12px'
             }}>
               <p style={{ fontSize: '0.8rem', color: '#718096', margin: 0, textAlign: 'center', fontStyle: 'italic' }}>
                 🕰️ Riscoperta: {memoryItem.daysAgo < 30 ? `${memoryItem.daysAgo} giorni fa` : `${Math.floor(memoryItem.daysAgo / 30)} mesi fa`} finivi <strong>{memoryItem.title}</strong>
               </p>
             </div>
          )}

          {/* SUGGERIMENTO */}
          {suggestion && (
            <section className="card" style={{marginBottom:12, borderLeft: '4px solid #ed8936', backgroundColor: '#fffaf0'}}>
              <h3 style={{marginTop:0, fontSize:'1em', color:'#c05621'}}>🎲 Perché non provi questo?</h3>
              <div style={{fontSize:'1.1em', marginBottom:4}}>
                <strong>{suggestion.title}</strong>
              </div>
              <div style={{opacity:0.8, marginBottom:8}}>
                {TYPE_ICONS[suggestion.kind]} {suggestion.author || "Autore sconosciuto"}
              </div>
              <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                  {suggestion.mood && <span className="badge mood-badge" style={{backgroundColor:'#bee3f8', color:'#2a4365'}}>{suggestion.mood}</span>}
                  {suggestion.genre && <span className="badge">{suggestion.genre}</span>}
              </div>
              {suggestion.video_url && (
                  <div style={{marginTop:8}}>
                    <a href={suggestion.video_url} target="_blank" rel="noopener noreferrer" className="button" style={{display:'inline-flex', alignItems:'center', textDecoration:'none', gap:6}}>
                      🔗 Apri Link
                    </a>
                  </div>
              )}
            </section>
          )}

          {/* CONTROLLI SUGGERIMENTI */}
          <section className="card" style={{marginBottom:12, marginTop:12}}>
            <div className="row" style={{alignItems:"center", gap:8, flexWrap:"wrap"}}>
              <select value={randKind} onChange={e=>setRandKind(e.target.value)}>
                {TYPES.filter(t => t !== 'audiolibro').map(t=> <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
              </select>
              
              <select value={randMood} onChange={e=>setRandMood(e.target.value)}>
                <option value="">Qualsiasi Umore</option>
                {MOODS.map(m=> <option key={m} value={m}>{m}</option>)}
              </select>

              {showGenreInput(randKind) && (
                <select value={randGenre} onChange={e=>setRandGenre(e.target.value)}>
                  <option value="">Qualsiasi Genere</option>
                  {GENRES.map(g=> <option key={g} value={g}>{g}</option>)}
                </select>
              )}
              <button className="ghost" onClick={handleSuggest}>🎲 Consiglia</button>
            </div>
          </section>
        </>
      )}
      
      {/* ===== Lista Risultati ===== */}
      {isSearchActive && (
        <section className="card">
          {loading ? <p>Caricamento…</p> : (
            <div className="list">
              {items.map(it=>
                <div key={it.id} className="item" style={it.is_next ? {borderLeft: '4px solid #38a169', paddingLeft: 12} : {}}>
                  <div>
                    <div className="item-title">
                      {it.is_next && <span title="In Coda" style={{marginRight:6}}>📌</span>}
                      {it.title}
                    </div>
                    <div className="item-meta">
                      {TYPE_ICONS[it.kind]} {it.creator}
                      {" · "}<span className="badge">{it.kind}</span>
                      {it.mood && <span className="badge mood-badge" style={{backgroundColor:'#ebf8ff', color:'#2c5282', marginLeft:4}}>{it.mood}</span>}
                      {it.genre && showGenreInput(it.kind) ? <> {" · "}genere: {canonGenere(it.genre)}</> : null}
                      {it.year ? <> {" · "}anno: {it.year}</> : null}
                      {/* MODIFICA: SOLO ICONE SORGENTI */}
                      {Array.isArray(it.sourcesArr) && it.sourcesArr.length ? 
                        it.sourcesArr.map(s => (
                          <span key={s} title={s} style={{ marginLeft: 6, fontSize: '1.1em', cursor: 'help' }}>
                            {SOURCE_ICONS[s]}
                          </span>
                        ))
                      : null}
                      {it.finished_at ? <> {" · "}finito: {new Date(it.finished_at).toLocaleDateString()}</> : null}
                    </div>
                  </div>
                  <div className="row" style={{gap:8, flexWrap:'wrap', marginTop:8}}>
                    {it.video_url && (
                      <a href={it.video_url} target="_blank" rel="noopener noreferrer" className="ghost button" style={{textDecoration:'none', lineHeight:'normal'}}>
                        🔗 Apri
                      </a>
                    )}
                    {(!it.finished_at && it.status !== 'archived') && (
                        <button className="ghost" onClick={()=>toggleFocus(it)}>
                          {it.is_next ? "🚫 Togli Focus" : "📌 Focus"}
                        </button>
                    )}
                    <button className="ghost" onClick={() => openEditModal(it)}>✏️</button>
                    {(it.sourcesArr||[]).includes("da comprare") && <button className="ghost" onClick={()=>markAsPurchased(it)}>Acquistato</button>}
                    {(it.finished_at || it.status === "archived") ? <button className="ghost" onClick={()=>unarchive(it)}>Ripristina</button> : <button className="ghost" onClick={()=>openArchiveModal(it)}>Archivia</button>}
                  </div>
                </div>
              )}
              {items.length===0 && <p style={{opacity:.8}}>Nessun elemento trovato.</p>}
            </div>
          )}
        </section>
      )}

      {/* ===== FAB / MODALI ===== */}
      <button onClick={() => setAddModalOpen(true)} className="fab">+</button>

      {addModalOpen && (
        <div className="modal-backdrop" onClick={() => setAddModalOpen(false)}>
          <div className="card" style={{maxWidth:560, width:"92%", padding:16}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0}}>Aggiungi elemento</h2>
            <form onSubmit={addItem} className="grid grid-2">
              <input placeholder="Titolo" value={title} onChange={e=>setTitle(e.target.value)} />
              <input placeholder="Autore/Sviluppatore/Canale" value={creator} onChange={e=>setCreator(e.target.value)} />
              <select value={kind} onChange={handleAddKindChange}>
                {TYPES.filter(t => t !== 'audiolibro').map(t=> <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
              </select>
              {showGenreInput(kind) && (
                <select value={genre} onChange={e=>setGenre(e.target.value)}>
                  <option value="">Genere (facoltativo)</option>
                  {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              )}
              <select value={mood} onChange={e=>setMood(e.target.value)}>
                  <option value="">Umore / Energia (opz.)</option>
                  {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <input type="number" placeholder="Anno" value={year} onChange={e=>setYear(e.target.value)} />
              <input placeholder="Link (YouTube, Steam...)" value={videoUrl} onChange={e=>setVideoUrl(e.target.value)} style={{gridColumn: "1 / -1"}} />
              <div style={{gridColumn: "1 / -1", display:'flex', alignItems:'center', gap:8, marginTop:8}}>
                <input type="checkbox" id="chk_next" checked={isNext} onChange={e=>setIsNext(e.target.checked)} style={{width:'auto'}}/>
                <label htmlFor="chk_next">📌 Imposta come "Prossimo" (Focus)</label>
              </div>
              <button type="submit" style={{gridColumn: "1 / -1", marginTop:8}}>Aggiungi</button>
            </form>
            <div className="row" style={{justifyContent:"flex-end", marginTop:12}}><button className="ghost" onClick={()=>setAddModalOpen(false)}>Chiudi</button></div>
          </div>
        </div>
      )}

      {/* Modale Filtri */}
      {advOpen && (
        <div className="modal-backdrop" onClick={() => setAdvOpen(false)}>
          <div className="card" style={{maxWidth:720, width:"92%", padding:16}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0}}>Filtri & Strumenti</h2>
            <div style={{borderBottom:"1px solid #ddd", paddingBottom:12}}>
              <div className="sub" style={{marginBottom:8}}>Filtri per Proprietà</div>
              <div className="grid grid-2">
                
                {/* --- NUOVO FILTRO STATO --- */}
                <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{fontWeight:'bold', color: statusFilter==='active'?'#2f855a':'#2d3748'}}>
                  <option value="active">🟢 Solo Attivi (Da fare)</option>
                  <option value="archived">📦 Solo Archiviati (Storico)</option>
                  <option value="">👁️ Mostra Tutto</option>
                </select>

                <select value={typeFilter} onChange={handleTypeChange}> 
                  <option value="">Tutti i tipi</option>
                  {TYPES.map(t=> <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
                </select>
                {showGenreInput(typeFilter) && (
                  <select value={genreFilter} onChange={e=>setGenreFilter(e.target.value)}>
                    <option value="">Tutti i generi</option>
                    {GENRES.map(g=> <option key={g} value={g}>{g}</option>)}
                  </select>
                )}
                <select value={moodFilter} onChange={e=>setMoodFilter(e.target.value)}>
                    <option value="">Qualsiasi Umore</option>
                    {MOODS.map(m=> <option key={m} value={m}>{m}</option>)}
                </select>
                {(typeFilter !== 'video' && typeFilter !== 'gioco') && (
                  <select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}>
                    <option value="">Tutte le sorgenti</option>
                    {SOURCE_OPTIONS.map(s=> <option key={s} value={s}>{SOURCE_ICONS[s]} {s}</option>)}
                  </select>
                )}
                <input type="number" placeholder="Anno Uscita" value={yearFilter} onChange={e => setYearFilter(e.target.value)} />
              </div>
            </div>
            <div style={{margin:"12px 0", borderBottom:"1px solid #ddd", paddingBottom:12}}>
              <div className="sub" style={{marginBottom:8}}>Filtro Autori A–Z</div>
              <div className="row" style={{flexWrap:"wrap", gap:6}}>
                {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(L=>(
                  <button key={L} className="ghost" onClick={()=>{ setLetterFilter(L); setAdvOpen(false); }}>{L}</button>
                ))}
                <button className="ghost" onClick={()=>{ setLetterFilter(""); setAdvOpen(false); }}>Tutti</button>
              </div>
            </div>
            <div style={{margin:"12px 0"}}><button className="ghost" onClick={()=>exportItemsToCsv(items)}>Esporta CSV</button></div>
            <div className="row" style={{justifyContent:"flex-end"}}><button onClick={()=>setAdvOpen(false)}>Chiudi</button></div>
          </div>
        </div>
      )}

      {statsModalOpen && (
        <div className="modal-backdrop" onClick={() => setStatsModalOpen(false)}>
          <div className="card" style={{maxWidth:720, width:"92%", padding:16}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0}}>Statistiche</h2>
            <div className="row" style={{gap: 8, marginBottom: 16}}>
              <button className={statsView === 'periodo' ? '' : 'ghost'} onClick={() => setStatsView('periodo')}>Completati nel Periodo</button>
              <button className={statsView === 'totale' ? '' : 'ghost'} onClick={() => setStatsView('totale')}>Dettagli Collezione</button>
            </div>
            {statsView === 'periodo' && (
              <div>
                <div className="row" style={{gap: 8, alignItems: 'center', flexWrap:'wrap'}}>
                  <input type="number" placeholder="Mese" value={statMonth} onChange={e=>setStatMonth(e.target.value)} />
                  <input type="number" placeholder="Anno" value={statYear} onChange={e=>setStatYear(e.target.value)} />
                  <button className="ghost" onClick={() => { setStatMonth(new Date().getMonth() + 1); setStatYear(new Date().getFullYear()); }}>Oggi</button>
                  {periodLoading && <p className="sub" style={{margin:0}}>Caricamento...</p>}
                </div>
                <div className="row kpi-row" style={{marginTop: 12, flexWrap: 'wrap', gap: 8}}>
                  <button className="kpi-button" onClick={() => handleStatClick(null)}><strong>{periodStats.total}</strong> totali</button>
                  <button className="kpi-button" onClick={() => handleStatClick('libro')}>📚 <strong>{periodStats.libro}</strong></button>
                  <button className="kpi-button" onClick={() => handleStatClick('audiolibro')}>🎧 <strong>{periodStats.audiolibro}</strong></button>
                  <button className="kpi-button" onClick={() => handleStatClick('film')}>🎬 <strong>{periodStats.film}</strong></button>
                  <button className="kpi-button" onClick={() => handleStatClick('album')}>💿 <strong>{periodStats.album}</strong></button>
                  <button className="kpi-button" onClick={() => handleStatClick('video')}>▶️ <strong>{periodStats.video || 0}</strong></button>
                  <button className="kpi-button" onClick={() => handleStatClick('gioco')}>🎮 <strong>{periodStats.gioco || 0}</strong></button>
                </div>
              </div>
            )}
            {statsView === 'totale' && (
              <div>
                <div className="row" style={{flexWrap:"wrap", gap:8, marginTop:8}}>
                  <div className="kpi"><strong>{stats.total}</strong> totali</div>
                  <div className="kpi"><strong>{stats.active}</strong> attivi</div>
                  <div className="kpi"><strong>{stats.archived}</strong> archiviati</div>
                </div>
                <div className="row" style={{flexWrap:"wrap", gap:8, marginTop:8}}>
                  {stats.byType.map(x=> (<div key={x.t} className="kpi">{TYPE_ICONS[x.t]} <strong>{x.n}</strong></div>))}
                </div>
                <div className="row" style={{flexWrap:"wrap", gap:8, marginTop:8}}>
                  {stats.bySource.map(x=>(<div key={x.s} className="kpi">{SOURCE_ICONS[x.s]} <strong>{x.n}</strong></div>))}
                </div>
              </div>
            )}
            <div className="row" style={{justifyContent:"flex-end", marginTop: 16}}><button onClick={()=>setStatsModalOpen(false)}>Chiudi</button></div>
          </div>
        </div>
      )}

      {archModal && (
        <div className="modal-backdrop" onClick={() => setArchModal(null)}>
          <div className="card" style={{maxWidth:560, width:"92%", padding:16}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0}}>Archivia — {archModal.title}</h2>
            <div className="row" style={{gap:8, flexWrap:"wrap", alignItems:"center"}}>
              <label className="sub">Sorgente</label>
              <select value={archModal.source||""} onChange={e=>setArchModal(m=>({...m, source:e.target.value}))}>
                <option value="">(nessuna)</option>
                {SOURCE_OPTIONS.map(s=> <option key={s} value={s}>{SOURCE_ICONS[s]} {s}</option>)}
              </select>
              <label className="sub">Data fine</label>
              <input type="date" value={archModal.dateISO} onChange={e=>setArchModal(m=>({...m, dateISO:e.target.value}))} />
            </div>
            <div className="sub" style={{marginTop:8, opacity:.8}}>Sorgenti: {(archModal.sourcesArr||[]).join(" + ") || "—"}</div>
            <div className="row" style={{justifyContent:"flex-end", gap:8, marginTop:12}}>
              <button className="ghost" onClick={()=>setArchModal(null)}>Annulla</button>
              <button onClick={()=>saveArchiveFromModal(archModal)}>Archivia</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modale Modifica ===== */}
      {editState && (
        <div className="modal-backdrop" onClick={() => setEditState(null)}>
          <div className="card" style={{maxWidth:560, width:"92%", padding:16}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0}}>Modifica elemento</h2>
            <form onSubmit={handleUpdateItem} className="grid grid-2" id="edit-form">
              <input placeholder="Titolo" value={editState.title} onChange={e => setEditState(curr => ({...curr, title: e.target.value}))} />
              <input placeholder="Autore" value={editState.creator} onChange={e => setEditState(curr => ({...curr, creator: e.target.value}))} />
              <select value={editState.type} onChange={e => {
                  const newType = e.target.value;
                  setEditState(curr => ({...curr, type: newType, genre: showGenreInput(newType) ? curr.genre : ''}));
                }}>
                {TYPES.map(t=> <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
              </select>
              {showGenreInput(editState.type) && (
                <select value={editState.genre} onChange={e => setEditState(curr => ({...curr, genre: e.target.value}))}>
                  <option value="">Genere (facoltativo)</option>
                  {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              )}
              <select value={editState.mood || ""} onChange={e => setEditState(curr => ({...curr, mood: e.target.value}))}>
                  <option value="">Umore (opz.)</option>
                  {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              
              <input type="number" placeholder="Anno" value={editState.year} onChange={e => setEditState(curr => ({...curr, year: e.target.value}))}/>
              <input placeholder="Link" value={editState.video_url || ""} onChange={e => setEditState(curr => ({...curr, video_url: e.target.value}))} />
              
              {/* --- BLOCCO SORGENTI SPOSTATO IN FONDO --- */}
              <div style={{gridColumn: "1 / -1", marginTop: 8, marginBottom: 8}}>
                <span style={{fontSize: '0.9em', opacity: 0.7, display:'block', marginBottom:4}}>Sorgenti (puoi selezionarne più di una):</span>
                <div style={{display:'flex', gap: 8, flexWrap:'wrap'}}>
                  {SOURCE_OPTIONS.map(s => {
                    const active = parseSources(editState.source).includes(s);
                    return (
                      <label key={s} style={{
                          display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer',
                          padding: '6px 10px', borderRadius: 6, fontSize: '0.9rem',
                          backgroundColor: active ? '#ebf8ff' : '#f7fafc',
                          border: active ? '1px solid #4299e1' : '1px solid #cbd5e0',
                          color: active ? '#2b6cb0' : '#4a5568',
                          userSelect: 'none'
                        }}>
                        <input 
                          type="checkbox" 
                          checked={active}
                          onChange={() => {
                            const currentArr = parseSources(editState.source);
                            let newArr;
                            if (active) {
                              newArr = currentArr.filter(x => x !== s);
                            } else {
                              newArr = [...currentArr, s];
                            }
                            setEditState(curr => ({...curr, source: joinSources(newArr)}));
                          }}
                          style={{display:'none'}}
                        />
                        <span>{SOURCE_ICONS[s]} {s}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div style={{gridColumn: "1 / -1", display:'flex', alignItems:'center', gap:8}}>
                <input type="checkbox" id="edit_chk_next" checked={editState.is_next} onChange={e => setEditState(curr => ({...curr, is_next: e.target.checked}))} style={{width:'auto'}}/>
                <label htmlFor="edit_chk_next">📌 In Coda (Prossimo)</label>
              </div>
            </form>
            <div className="row" style={{justifyContent:"space-between", marginTop:12}}>
              <button type="button" className="ghost" style={{ color: '#c53030', borderColor: '#c53030' }} onClick={() => {
                  if (window.confirm("Sei sicuro?")) deleteItem(editState.id);
                }}>Elimina</button>
              <div className="row" style={{gap: 8}}>
                <button className="ghost" type="button" onClick={()=>setEditState(null)}>Annulla</button>
                <button type="submit" form="edit-form">Salva Modifiche</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}