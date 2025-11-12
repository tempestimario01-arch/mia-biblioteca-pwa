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

    if (q) { query = query.or(`title.ilike.%${q}%,author.ilike.%${q}%`); }
    if (typeFilter) { query = query.eq('type', typeFilter); }
    if (genreFilter) { query = query.eq('genre', canonGenere(genreFilter)); }
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
    if (error) {
      console.error("Supabase select error (fetchItems):", error);
      // alert("Errore nel leggere i dati...") // Rimosso per Vercel
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
    setPeriodLoading(true);
    const p_year = statYear ? Number(statYear) : null;
    const p_month = statMonth ? Number(statMonth) : null;

    const { data, error } = await supabase.rpc('get_period_stats', {
      p_year: p_year,
      p_month: p_month
    });

    if (error) {
      console.error("Error fetching period stats:", error);
      // alert("Errore nel calcolo...") // Rimosso per Vercel
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
    setArchModal({
      id: it.id, title: it.title, kind: it.kind,
      sourcesArr: it.sourcesArr || [], source: "", 
      dateISO: new Date().toISOString().slice(0,10),
    });
  }, []);
  
  const saveArchiveFromModal = useCallback(async (m) => {
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
      alert("Nessun elemento 'attivo' trovato per i criteri scelti.");
      return;
    }
    const msg = data.map(p => `• “${p.title}” — ${p.creator || "autore sconosciuto"}`).join("\n");
    alert(`🎲 Consigli ${randKind}:\n${msg}`);
  }, [randKind, randGenre]);

  const handleTypeChange = useCallback((e) => {
    const newType = e.target.value;
    setTypeFilter(newType);
    if (newType !== 'libro' && newType !== 'audiolibro') {
      setGenreFilter(""); 
    }
  }, []);

  const handleAddKindChange = useCallback((e) => {
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

  /* --- MODIFICA: Funzione Elimina con ALERT per il debug --- */
  const deleteItem = useCallback(async (itemId) => {
    // La conferma è gestita nell'onClick
    
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', itemId);

    if (error) {
      // Mostra l'errore REALE di Supabase in un popup
      alert("ERRORE DA SUPABASE:\n" + error.message); 
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
        <div className="search" style={{flexWrap:"wrap", gap:8}}>
          <input
            style={{flex:1, minWidth:200}}
            placeholder="Inizia a cercare..."
            value={qInput}
            onChange={e=>setQInput(e.target.value)}
          />
          <button className="ghost" onClick={()=>setAdvOpen(true)}>
            🔎 Filtri
          </button>
          <button className="ghost" onClick={()=>setStatsModalOpen(true)}>
            📊 Statistiche
          </button>
          <button className="ghost" onClick={clearAllFilters}>
            Pulisci
          </button>
        </div>
      </section>
      
      {/* ===== 2. Lista (Condizionale) ===== */}
      {isSearchActive && (
        <section className="card">
          {loading ? <p>Caricamento…</p> : (
            <div className="list">
              {items.map(it=>
                <div key={it.id} className="item">
                  <div>
                    <div className="item-title">{it.title}</div>
                    <div className="item-meta">
                      {it.creator}
                      {" · "}<span className="badge">{it.kind}</span>
                      {it.genre ? <> {" · "}genere: {canonGenere(it.genre)}</> : null}
                      {it.year ? <> {" · "}anno: {it.year}</> : null}
                      {Array.isArray(it.sourcesArr) && it.sourcesArr.length ? <> {" · "}sorgente: {it.sourcesArr.map(s=> (SOURCE_ICONS[s]||"") + " " + s).join(" + ")}</> : null}
                      {it.finished_at ? <> {" · "}finito: {new Date(it.finished_at).toLocaleDateString()}</> : null}
                      {" · "}{new Date(it.created_at).toLocaleDateString()}
                    </div>
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
              {items.length===0 && (
                <p style={{opacity:.8}}>
                  Nessun elemento trovato per questa ricerca.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Messaggio di benvenuto E "Consiglia" (se la ricerca non è attiva) */}
      {!isSearchActive && !loading && (
        <>
          <section className="card">
            <p style={{opacity:.8, textAlign:'center'}}>
              Usa la barra in alto per cercare, o clicca su 'Filtri' per esplorare.
            </p>
          </section>

          <section className="card" style={{marginBottom:12, marginTop:12}}>
            <div className="row" style={{alignItems:"center", gap:8, flexWrap:"wrap"}}>
              <select value={randKind} onChange={e=>setRandKind(e.target.value)}>
                {TYPES.map(t=> <option key={t} value={t}>{t}</option>)}
              </select>
              {(randKind==="libro" || randKind==="audiolibro") && (
                <select value={randGenre} onChange={e=>setRandGenre(e.target.value)}>
                  <option value="">Genere (opz.)</option>
                  {GENRES.map(g=> <option key={g} value={g}>{g}</option>)}
                </select>
              )}
              <button className="ghost" onClick={handleSuggest}>
                🎲 Consiglia
              </button>
            </div>
          </section>
        </>
      )}

      {/* ===== Pulsante Aggiungi (FAB) ===== */}
      <button 
        onClick={() => setAddModalOpen(true)}
        className="fab"
      >
        +
      </button>

      {/* ===== Modale Aggiungi Elemento ===== */}
      {addModalOpen && (
        <div className="modal-backdrop" onClick={() => setAddModalOpen(false)}>
          <div className="card" style={{maxWidth:560, width:"92%", padding:16}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0}}>Aggiungi elemento</h2>
            <form onSubmit={addItem} className="grid grid-2">
              <input placeholder="Titolo" value={title} onChange={e=>setTitle(e.target.value)} />
              <input placeholder="Autore/Regista/Artista" value={creator} onChange={e=>setCreator(e.target.value)} />
              <select value={kind} onChange={handleAddKindChange}>
                {TYPES.map(t=> <option key={t} value={t}>{t}</option>)}
              </select>
              {(kind === 'libro' || kind === 'audiolibro') && (
                <select value={genre} onChange={e=>setGenre(e.target.value)}>
                  <option value="">Genere (facoltativo)</option>
                  {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              )}
              <input 
                type="number" 
                placeholder="Anno di uscita (es. 1984)" 
                value={year} 
                onChange={e=>setYear(e.target.value)} 
              />
              <button type="submit">Aggiungi</button>
            </form>
            <div className="row" style={{justifyContent:"flex-end", marginTop:12}}>
              <button className="ghost" onClick={()=>setAddModalOpen(false)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modale Filtri & Avanzate ===== */}
      {advOpen && (
        <div className="modal-backdrop" onClick={() => setAdvOpen(false)}>
          <div className="card" style={{maxWidth:720, width:"92%", padding:16}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0}}>Filtri & Strumenti</h2>
            
            <div style={{borderBottom:"1px solid #ddd", paddingBottom:12}}>
              <div className="sub" style={{marginBottom:8}}>Filtri per Proprietà</div>
              <div className="grid grid-2">
                <select value={typeFilter} onChange={handleTypeChange}> 
                  <option value="">Tutti i tipi</option>
                  {TYPES.map(t=> <option key={t} value={t}>{t}</option>)}
                </select>
                {(typeFilter === 'libro' || typeFilter === 'audiolibro') && (
                  <select value={genreFilter} onChange={e=>setGenreFilter(e.target.value)}>
                    <option value="">Tutti i generi</option>
                    {GENRES.map(g=> <option key={g} value={g}>{g}</option>)}
                  </select>
                )}
                <select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}>
                  <option value="">Tutte le sorgenti</option>
                  {SOURCE_OPTIONS.map(s=> <option key={s} value={s}>{s}</option>)}
                </select>
                <input
                  type="number"
                  placeholder="Filtra per Anno Uscita"
                  value={yearFilter}
                  onChange={e => setYearFilter(e.target.value)}
                />
              </div>
            </div>

            <div style={{margin:"12px 0", borderBottom:"1px solid #ddd", paddingBottom:12}}>
              <div className="sub" style={{marginBottom:8}}>Filtri per Completamento</div>
              <div className="grid grid-2">
                <input
                  type="number"
                  placeholder="Mese completamento (1-12)"
                  value={completionMonthFilter}
                  onChange={e => setCompletionMonthFilter(e.target.value)}
                />
                <input
                  type="number"
                  placeholder="Anno completamento (es. 2025)"
                  value={completionYearFilter}
                  onChange={e => setCompletionYearFilter(e.target.value)}
                />
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

            <div style={{margin:"12px 0"}}>
              <div className="sub" style={{marginBottom:8}}>Strumenti</div>
              <button className="ghost" onClick={()=>exportItemsToCsv(items)}>Esporta CSV (risultati attuali)</button>
            </div>

            <div className="row" style={{justifyContent:"flex-end"}}>
              <button onClick={()=>setAdvOpen(false)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modale Statistiche ===== */}
      {statsModalOpen && (
        <div className="modal-backdrop" onClick={() => setStatsModalOpen(false)}>
          <div className="card" style={{maxWidth:720, width:"92%", padding:16}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0}}>Statistiche</h2>
            
            <div className="row" style={{gap: 8, marginBottom: 16}}>
              <button className={statsView === 'periodo' ? '' : 'ghost'} onClick={() => setStatsView('periodo')}>
                Completati nel Periodo
              </button>
              <button className={statsView === 'totale' ? '' : 'ghost'} onClick={() => setStatsView('totale')}>
                Dettagli Collezione
              </button>
            </div>

            {statsView === 'periodo' && (
              <div>
                <div className="row" style={{gap: 8, alignItems: 'center', flexWrap:'wrap'}}>
                  <input type="number" placeholder="Mese (1–12)" value={statMonth} onChange={e=>setStatMonth(e.target.value)} />
                  <input type="number" placeholder="Anno (es. 2025)" value={statYear} onChange={e=>setStatYear(e.target.value)} />
                  <button className="ghost" onClick={() => {
                    setStatMonth(new Date().getMonth() + 1);
                    setStatYear(new Date().getFullYear());
                  }}>Oggi</button>
                  {periodLoading && <p className="sub" style={{margin:0}}>Caricamento...</p>}
                </div>
                
                <div className="row kpi-row" style={{marginTop: 12, flexWrap: 'wrap', gap: 8}}>
                  <button className="kpi-button" onClick={() => handleStatClick(null)}>
                    <strong>{periodStats.total}</strong> totali
                  </button>
                  <button className="kpi-button" onClick={() => handleStatClick('libro')}>
                    <span className="badge">libro</span><strong>{periodStats.libro}</strong>
                  </button>
                  <button className="kpi-button" onClick={() => handleStatClick('audiolibro')}>
                    <span className="badge">audiolibro</span><strong>{periodStats.audiolibro}</strong>
                  </button>
                  <button className="kpi-button" onClick={() => handleStatClick('film')}>
                    <span className="badge">film</span><strong>{periodStats.film}</strong>
                  </button>
                  <button className="kpi-button" onClick={() => handleStatClick('album')}>
                    <span className="badge">album</span><strong>{periodStats.album}</strong>
                  </button>
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
                  {stats.byType.map(x=> (
                    <div key={x.t} className="kpi">
                      <span className="badge">{x.t}</span><strong>{x.n}</strong>
                    </div>
                  ))}
                </div>
                <div className="row" style={{flexWrap:"wrap", gap:8, marginTop:8}}>
                  {stats.bySource.map(x=>(
                    <div key={x.s} className="kpi">
                      <span className="badge">{x.s}</span><strong>{x.n}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="row" style={{justifyContent:"flex-end", marginTop: 16}}>
              <button onClick={()=>setStatsModalOpen(false)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modale Archiviazione (invariato) ===== */}
      {archModal && (
        <div className="modal-backdrop" onClick={() => setArchModal(null)}>
          <div className="card" style={{maxWidth:560, width:"92%", padding:16}} onClick={e => e.stopPropagation()}>
            <h2 style={{marginTop:0}}>Archivia — {archModal.title}</h2>
            <div className="row" style={{gap:8, flexWrap:"wrap", alignItems:"center"}}>
              <label className="sub">Sorgente</label>
              <select value={archModal.source||""} onChange={e=>setArchModal(m=>({...m, source:e.target.value}))}>
                <option value="">(nessuna)</option>
                {SOURCE_OPTIONS.map(s=> <option key={s} value={s}>{s}</option>)}
              </select>
              <label className="sub">Data fine</label>
              <input type="date" value={archModal.dateISO} onChange={e=>setArchModal(m=>({...m, dateISO:e.target.value}))} />
            </div>
            <div className="sub" style={{marginTop:8, opacity:.8}}>
              Sorgenti già presenti: {(archModal.sourcesArr||[]).join(" + ") || "—"}
            </div>
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
            </form>

            <div className="row" style={{justifyContent:"space-between", marginTop:12}}>
              <button 
                type="button" 
                className="ghost" 
                style={{ color: '#c53030', borderColor: '#c53030' }} // Stile "danger"
                onClick={() => {
                  if (window.confirm("Sei sicuro di voler eliminare questo elemento?\nL'azione è permanente e non può essere annullata.")) {
                    deleteItem(editState.id);
                  }
                }}
              >
                Elimina
              </button>
              
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