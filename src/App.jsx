import { useEffect, useMemo, useState, useCallback } from "react";
import "./index.css";
import { supabase } from "./supabaseClient";

/* === Costanti e normalizzazioni === */
const TYPES = ["libro", "audiolibro", "film", "album"];
const GENRES = [
  "ambiente","cinema","storia","romanzi","asia","sociologia","psicologia",
  "filosofia","musica","arte","biografia","vari","scienza","fumetto","sport"
];
const GENRE_ALIAS = { socilogia: "sociologia" };
const SOURCE_OPTIONS = ["fisico","biblio","da comprare","internet"];
const SOURCE_ICONS = { fisico:"📦", biblio:"🏛", "da comprare":"🛒", internet:"🌐" };

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
  const headers = ["id","title","creator","kind","status","genre","year","sources","finished_at","created_at"];
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
  const [loading,setLoading] = useState(false); 

  // Stats
  const [stats, setStats] = useState({
    total: 0, active: 0, archived: 0, byType: [], bySource: []
  });
  const [periodStats, setPeriodStats] = useState({ total: 0, libro: 0, audiolibro: 0, film: 0, album: 0 });
  const [periodLoading, setPeriodLoading] = useState(false);

  // Filtri Principali
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState(""); 
  const [typeFilter,setTypeFilter] = useState("");
  const [genreFilter,setGenreFilter] = useState("");
  const [sourceFilter,setSourceFilter] = useState("");
  const [letterFilter, setLetterFilter] = useState("");
  const [yearFilter, setYearFilter] = useState(""); 

  // Filtri di Completamento
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
  const [year,setYear] = useState("");

  // Random
  const [randKind,setRandKind] = useState("libro");
  const [randGenre,setRandGenre] = useState("");
  
  // Input Stats Periodo
  const [statMonth,setStatMonth] = useState(new Date().getMonth() + 1);
  const [statYear,setStatYear] = useState(new Date().getFullYear());


  /* --- 2. FUNZIONI ASINCRONE (Callback) --- */

  const fetchItems = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("items")
      .select("id,title,creator:author,kind:type,status,created_at,genre,year,sources:source,finished_at:ended_on")
      .order("created_at", { ascending:false })
      .limit(500); 

    // Filtri Principali
    if (q) { query = query.or(`title.ilike.%${q}%,author.ilike.%${q}%`); }
    if (typeFilter) { query = query.eq('type', typeFilter); }
    if (genreFilter) { query = query.eq('genre', canonGenere(genreFilter)); }
    if (sourceFilter) { query = query.ilike('source', `%${sourceFilter}%`); }
    if (letterFilter) { query = query.ilike('author', `${letterFilter}%`); }
    if (yearFilter) { query = query.eq('year', Number(yearFilter)); }

    // Filtri di Completamento
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
    if (error) {
      console.error("Supabase select error (fetchItems):", error);
      alert("Errore nel leggere i dati da Supabase. Vedi console.");
      setItems([]);
    } else {
      const adapted = (data || []).map(row => ({
        ...row,
        kind: normType(row.kind), 
        creator: row.creator,
        sourcesArr: parseSources(row.sources)
      }));
      setItems(adapted);
    }
    setLoading(false);
  }, [q, typeFilter, genreFilter, sourceFilter, letterFilter, yearFilter, completionMonthFilter, completionYearFilter]);

  const fetchStats = useCallback(async () => {
    // ... (codice invariato)
    try {
      const { count: totalCount, error: totalError } = await supabase
        .from("items").select('*', { count: 'exact', head: true });
      if (totalError) throw totalError;

      const { count: archivedCount, error: archivedError } = await supabase
        .from("items").select('*', { count: 'exact', head: true })
        .or("ended_on.not.is.null, status.eq.archived");
      if (archivedError) throw archivedError;

      const typePromises = TYPES.map(t =>
        supabase.from("items").select('*', { count: 'exact', head: true }).eq('type', t)
      );
      const typeResults = await Promise.all(typePromises);
      const byType = typeResults.map((res, idx) => ({ t: TYPES[idx], n: res.count || 0 }));

      const sourcePromises = SOURCE_OPTIONS.map(s =>
        supabase.from("items").select('*', { count: 'exact', head: true }).ilike('source', `%${s}%`)
      );
      const sourceResults = await Promise.all(sourcePromises);
      const bySource = sourceResults.map((res, idx) => ({ s: SOURCE_OPTIONS[idx], n: res.count || 0 }));

      setStats({
        total: totalCount ?? 0,
        archived: archivedCount ?? 0,
        active: (totalCount ?? 0) - (archivedCount ?? 0),
        byType: byType,
        bySource: bySource
      });
    } catch (error) {
      console.error("Supabase count error (fetchStats):", error);
    }
  }, []); 

  const fetchPeriodStats = useCallback(async () => {
    // ... (codice invariato)
    setPeriodLoading(true);
    const p_year = statYear ? Number(statYear) : null;
    const p_month = statMonth ? Number(statMonth) : null;

    const { data, error } = await supabase.rpc('get_period_stats', {
      p_year: p_year,
      p_month: p_month
    });

    if (error) {
      console.error("Error fetching period stats:", error);
      alert("Errore nel calcolo delle statistiche di periodo.");
      setPeriodStats({ total: 0, libro: 0, audiolibro: 0, film: 0, album: 0 });
    } else if (data && data.length > 0) {
      setPeriodStats(data[0]); 
    } else {
      setPeriodStats({ total: 0, libro: 0, audiolibro: 0, film: 0, album: 0 });
    }
    setPeriodLoading(false);
  }, [statYear, statMonth]); 


  /* --- 3. FUNZIONI HANDLER (evento) --- */
  
  const isSearchActive = useMemo(() => {
    return q.length > 0 || typeFilter.length > 0 || genreFilter.length > 0 || 
           sourceFilter.length > 0 || letterFilter.length > 0 || yearFilter.length > 0 ||
           completionMonthFilter.length > 0 || completionYearFilter.length > 0;
  }, [q, typeFilter, genreFilter, sourceFilter, letterFilter, yearFilter, completionMonthFilter, completionYearFilter]);

  const addItem = useCallback(async (e) => {
    // ... (codice invariato)
    e.preventDefault();
    if(!title.trim()) return;
    const payload = {
      title, 
      author: creator, 
      type: kind, 
      status: "active",
      genre: (kind === 'libro' || kind === 'audiolibro') ? canonGenere(genre) : null, 
      year: year ? Number(year) : null,
      source: joinSources([]),
    };
    const { error } = await supabase.from("items").insert(payload);
    if(!error){
      setTitle(""); setCreator(""); setKind("libro"); setGenre(""); setYear("");
      setAddModalOpen(false); 
      if (isSearchActive) fetchItems(); 
      fetchStats(); 
    } else {
      console.error(error);
      alert("Errore salvataggio elemento.");
    }
  }, [title, creator, kind, genre, year, isSearchActive, fetchItems, fetchStats]);

  const markAsPurchased = useCallback(async (it) => {
    // ... (codice invariato)
    const srcs = new Set([...(it.sourcesArr||[])]);
    if (!srcs.has("da comprare")) { alert("Questo elemento non è segnato come 'da comprare'."); return; }
    srcs.delete("da comprare");
    srcs.add("fisico");
    const { error } = await supabase
      .from("items")
      .update({ source: joinSources(Array.from(srcs)) }) 
      .eq("id", it.id);
    if (error) { console.error(error); alert("Errore nell'aggiornamento."); }
    else {
      if(isSearchActive) fetchItems();
      fetchStats();
    }
  }, [isSearchActive, fetchItems, fetchStats]);

  const openArchiveModal = useCallback((it) => {
    // ... (codice invariato)
    setArchModal({
      id: it.id, title: it.title, kind: it.kind,
      sourcesArr: it.sourcesArr || [], source: "", 
      dateISO: new Date().toISOString().slice(0,10),
    });
  }, []);
  
  const saveArchiveFromModal = useCallback(async (m) => {
    // ... (codice invariato)
    const next = new Set([...(m.sourcesArr||[])]);
    if (m.source && m.source !== "") next.add(m.source);
    const { error } = await supabase
      .from("items")
      .update({ 
        status: "archived", 
        ended_on: m.dateISO, 
        source: joinSources(Array.from(next)) 
      })
      .eq("id", m.id);
    if (error){ console.error(error); alert("Errore nell'archiviazione."); return; }
    setArchModal(null);
    if(isSearchActive) fetchItems();
    fetchStats();
    if(statsModalOpen) fetchPeriodStats(); 
  }, [isSearchActive, statsModalOpen, fetchItems, fetchStats, fetchPeriodStats]);
  
  const unarchive = useCallback(async (it) => {
    // ... (codice invariato)
    const { error } = await supabase
      .from("items")
      .update({ status: "active", ended_on: null }) 
      .eq("id", it.id);
    if (error){ console.error(error); alert("Errore ripristino."); return; }
    if(isSearchActive) fetchItems();
    fetchStats();
    if(statsModalOpen) fetchPeriodStats();
  }, [isSearchActive, statsModalOpen, fetchItems, fetchStats, fetchPeriodStats]);

  const handleSuggest = useCallback(async () => {
    // ... (codice invariato)
    const gCanon = canonGenere(randGenre);
    const { data, error } = await supabase.rpc('get_random_suggestion', {
      p_kind: randKind,
      p_genre: (randKind === 'libro' || randKind === 'audiolibro') ? (gCanon || null) : null
    });
    if (error) {
      console.error("Error fetching suggestion:", error);
      alert("Errore nel recuperare i suggerimenti.");
      return;
    }
    if (!data || data.length === 0) {
      return alert("Nessun elemento 'attivo' trovato per i criteri scelti.");
    }
    const msg = data.map(p => `• “${p.title}” — ${p.creator || "autore sconosciuto"}`).join("\n");
    alert(`🎲 Consigli ${randKind}:\n${msg}`);
  }, [randKind, randGenre]);

  const handleTypeChange = useCallback((e) => {
    // ... (codice invariato)
    const newType = e.target.value;
    setTypeFilter(newType);
    if (newType !== 'libro' && newType !== 'audiolibro') {
      setGenreFilter(""); 
    }
  }, []);

  const handleAddKindChange = useCallback((e) => {
    // ... (codice invariato)
    const newKind = e.target.value;
    setKind(newKind);
    if (newKind !== 'libro' && newKind !== 'audiolibro') {
      setGenre(""); 
    }
  }, []);

  const clearAllFilters = useCallback(() => {
    setQ(""); 
    setQInput(""); 
    setTypeFilter(""); 
    setGenreFilter(""); 
    setSourceFilter("");
    setLetterFilter("");
    setYearFilter(""); 
    setCompletionMonthFilter(""); 
    setCompletionYearFilter(""); 
  }, []);

  const openEditModal = useCallback((it) => {
    // ... (codice invariato)
    setEditState({
      id: it.id,
      title: it.title,
      creator: it.creator, 
      type: it.kind,     
      genre: it.genre || '',
      year: it.year || ''
    });
  }, []);
  
  const handleUpdateItem = useCallback(async (e) => {
    // ... (codice invariato)
    e.preventDefault();
    if (!editState || !editState.title.trim()) return;

    const payload = {
      title: editState.title,
      author: editState.creator, 
      type: editState.type,
      genre: (editState.type === 'libro' || editState.type === 'audiolibro') ? canonGenere(editState.genre) : null,
      year: editState.year ? Number(editState.year) : null
    };

    const { error } = await supabase
      .from("items")
      .update(payload)
      .eq('id', editState.id);
    
    if (error) {
      console.error(error);
      alert("Errore nell'aggiornamento dell'elemento.");
    } else {
      setEditState(null); 
      fetchItems(); 
    }
  }, [editState, fetchItems]);

  const handleStatClick = useCallback((typeClicked) => {
    // ... (codice invariato)
    setCompletionYearFilter(statYear);
    setCompletionMonthFilter(statMonth);

    if (typeClicked && TYPES.includes(typeClicked)) {
      setTypeFilter(typeClicked);
    } else {
      setTypeFilter(''); 
    }
    
    setQ('');
    setQInput('');
    setGenreFilter('');
    setSourceFilter('');
    setLetterFilter('');
    setYearFilter('');

    setStatsModalOpen(false);
  }, [statYear, statMonth]); 

  /* --- NUOVA FUNZIONE: Elimina Elemento --- */
  const deleteItem = useCallback(async (itemId) => {
    if (!window.confirm("Sei sicuro di voler eliminare questo elemento?\nL'azione è permanente e non può essere annullata.")) {
      return;
    }

    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', itemId);

    if (error) {
      console.error(error);
      alert("Errore: impossibile eliminare l'elemento.");
    } else {
      alert("Elemento eliminato con successo.");
      setEditState(null); // Chiudi il modale di modifica
      fetchItems();
      fetchStats();
      if (statsModalOpen) fetchPeriodStats();
    }
  }, [isSearchActive, statsModalOpen, fetchItems, fetchStats, fetchPeriodStats]);

  
  /* --- 4. EFFETTI (useEffect) --- */
  
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 250);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(()=>{
    fetchStats();
  },[fetchStats]); 

  useEffect(() => {
    if (isSearchActive) {
      fetchItems();
    } else {
      setItems([]); 
      setLoading(false);
    }
  }, [isSearchActive, fetchItems]); 

  useEffect(() => {
    if (statsModalOpen) {
      fetchPeriodStats();
    }
  }, [statsModalOpen, fetchPeriodStats]); 


  /* --- 5. RENDER (JSX) --- */
  return (
    <div className="app">
      <h1 style={{textAlign:'center'}}>Biblioteca personale</h1>

      {/* ===== 1. Ricerca (Sempre visibile) ===== */}
      <section className="card" style={{marginBottom:12}}>
        {/* ... (codice invariato) ... */}
      </section>
      
      {/* ===== 2. Lista (Condizionale) ===== */}
      {isSearchActive && (
        <section className="card">
          {loading ? <p>Caricamento…</p> : (
            <div className="list">
              {items.map(it=>
                <div key={it.id} className="item">
                  <div>
                    {/* ... (meta dati item invariati) ... */}
                  </div>
                  <div className="row" style={{gap:8}}>
                    <button className="ghost" title="Modifica" onClick={() => openEditModal(it)}>
                      ✏️
                    </button>
                    {(it.sourcesArr||[]).includes("da comprare") && (
                      <button className="ghost" onClick={()=>markAsPurchased(it)}>Acquistato</button>
                    )}
                    {(it.finished_at || it.status === "archived") ? (
                      <button className="ghost" onClick={()=>unarchive(it)}>Ripristina</button>
                    ) : (
                      <button className="ghost" onClick={()=>openArchiveModal(it)}>Archivia</button>
                    )}
                  </div>
                </div>
              )}
              {/* ... (codice 'items.length===0' invariato) ... */}
            </div>
          )}
        </section>
      )}

      {/* Messaggio di benvenuto E "Consiglia" (se la ricerca non è attiva) */}
      {!isSearchActive && !loading && (
        <>
          {/* ... (codice invariato) ... */}
        </>
      )}

      {/* ===== Pulsante Aggiungi (FAB) ===== */}
      <button 
        onClick={() => setAddModalOpen(true)}
        className="fab"
      >
        +
      </button>

      {/* ===== Modale Aggiungi Elemento (invariato) ===== */}
      {addModalOpen && (
        <div className="modal-backdrop" onClick={() => setAddModalOpen(false)}>
          {/* ... (codice invariato) ... */}
        </div>
      )}

      {/* ===== Modale Filtri & Avanzate (invariato) ===== */}
      {advOpen && (
        <div className="modal-backdrop" onClick={() => setAdvOpen(false)}>
          {/* ... (codice invariato) ... */}
        </div>
      )}

      {/* ===== Modale Statistiche (invariato) ===== */}
      {statsModalOpen && (
        <div className="modal-backdrop" onClick={() => setStatsModalOpen(false)}>
          {/* ... (codice invariato) ... */}
        </div>
      )}

      {/* ===== Modale Archiviazione (invariato) ===== */}
      {archModal && (
        <div className="modal-backdrop" onClick={() => setArchModal(null)}>
          {/* ... (codice invariato) ... */}
        </div>
      )}

      {/* --- MODIFICA: Modale di Modifica aggiornato con pulsante Elimina --- */}
      {editState && (
        <div className="modal-backdrop" onClick={() => setEditState(null)}>
          <div className="card" style={{maxWidth:560, width:"92%", padding:16}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0}}>Modifica elemento</h2>
            
            <form onSubmit={handleUpdateItem} className="grid grid-2" id="edit-form">
              <input 
                placeholder="Titolo" 
                value={editState.title} 
                onChange={e => setEditState(curr => ({...curr, title: e.target.value}))} 
              />
              <input 
                placeholder="Autore/Regista/Artista" 
                value={editState.creator} 
                onChange={e => setEditState(curr => ({...curr, creator: e.target.value}))} 
              />
              
              <select 
                value={editState.type} 
                onChange={e => {
                  const newType = e.target.value;
                  setEditState(curr => ({
                    ...curr, 
                    type: newType, 
                    genre: (newType === 'libro' || newType === 'audiolibro') ? curr.genre : ''
                  }));
                }}
              >
                {TYPES.map(t=> <option key={t} value={t}>{t}</option>)}
              </select>
              
              {(editState.type === 'libro' || editState.type === 'audiolibro') && (
                <select 
                  value={editState.genre} 
                  onChange={e => setEditState(curr => ({...curr, genre: e.target.value}))}
                >
                  <option value="">Genere (facoltativo)</option>
                  {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              )}
              
              <input 
                type="number" 
                placeholder="Anno di uscita (es. 1984)" 
                value={editState.year} 
                onChange={e => setEditState(curr => ({...curr, year: e.target.value}))}
              />
              {/* Il pulsante Salva è ora fuori dal form per il layout */}
            </form>

            <div className="row" style={{justifyContent:"space-between", marginTop:12}}>
              {/* Pulsante Elimina (a sinistra) */}
              <button 
                type="button" 
                className="ghost" 
                style={{ color: '#c53030', borderColor: '#c53030' }} // Stile "danger"
                onClick={() => deleteItem(editState.id)}
              >
                Elimina
              </button>
              
              {/* Pulsanti Annulla e Salva (a destra) */}
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