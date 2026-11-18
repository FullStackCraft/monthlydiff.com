import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor,
  pointerWithin, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import "@fontsource-variable/dm-sans/wght.css";
import "@fontsource/pt-serif/latin-400.css";
import { chapterLabels, columns, currentMonth, monthPattern, timeZone } from "../model.mjs";
import "./style.css";

const selectedMonth = new URLSearchParams(location.search).get("month");
const month = monthPattern.test(selectedMonth ?? "") ? selectedMonth : currentMonth();
const monthTitle = new Intl.DateTimeFormat("en", { timeZone, month: "long", year: "numeric" })
  .format(new Date(`${month}-15T12:00:00Z`));
const days = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short" });
const times = new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "short", timeStyle: "short" });
const cardId = (card) => `card:${card.id}`;

async function api(path, method = "GET", body) {
  const response = await fetch(`/api/${path}?month=${month}`, {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "The board could not complete that request.");
  return data;
}

function collision(args) {
  if (!args.pointerCoordinates) return closestCorners(args);
  const hits = pointerWithin(args);
  return hits.some(({ id }) => String(id).startsWith("card:"))
    ? hits.filter(({ id }) => String(id).startsWith("card:"))
    : hits;
}

function CardContent({ card }) {
  const remaining = (card.highlights ?? []).filter((highlight) => highlight !== card.hook).slice(0, 2);
  return (
    <>
      <span className="card-project">{card.project} <span>{card.version}</span></span>
      <span className="hook">{card.hook}</span>
      {remaining.length > 0 && <span className="release-highlights">
        {remaining.map((highlight, index) => <span key={index}>{highlight}</span>)}
      </span>}
      <span className="card-meta">
        <time dateTime={new Date(card.published).toISOString()}>{days.format(card.published)}</time>
        {card.carryover ? <span>Carryover</span> : null}
        {card.needsReview ? <span>Check source</span> : null}
        {card.chapter ? <span>{card.chapter}</span> : null}
      </span>
    </>
  );
}

function Card({ card, disabled, onOpen, onMove }) {
  const sortable = useSortable({
    id: cardId(card), data: { status: card.status, releaseId: card.id },
    disabled: { draggable: disabled, droppable: false },
  });
  return (
    <article className={`card ${sortable.isDragging ? "dragging" : ""} ${sortable.isOver ? "over" : ""}`}
      ref={sortable.setNodeRef} data-release={card.id}>
      <div className="card-top">
        <button type="button" className="handle" aria-label={`Drag ${card.project} ${card.version}`}
          ref={sortable.setActivatorNodeRef} {...sortable.attributes} {...sortable.listeners} disabled={disabled}>
          <span aria-hidden="true">⠿</span>
        </button>
        <button type="button" className="card-open" onClick={() => onOpen(card)} aria-label={`Details for ${card.project} ${card.version}`}>
          <CardContent card={card} />
        </button>
      </div>
      <div className="card-actions">
        <a href={card.url} target="_blank" rel="noreferrer">Sources ↗</a>
        {!disabled && <select aria-label={`Move ${card.project} ${card.version}`} value={card.status}
          onChange={(event) => onMove({ id: card.id, status: event.target.value })}>
          {columns.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select>}
      </div>
    </article>
  );
}

function Lane({ column, cards, disabled, onOpen, onMove, allUntriaged, onSkipAll }) {
  const drop = useDroppable({ id: `lane:${column.id}`, data: { status: column.id }, disabled });
  return (
    <section className={`lane lane-${column.id} ${drop.isOver ? "over" : ""}`}
      aria-label={column.label} ref={drop.setNodeRef}>
      <header className="lane-title">
        <h2>{column.label}</h2>
        {column.id === "untriaged" && <button type="button" className="danger lane-action"
          title="Move every untriaged card in this edition to Skip"
          disabled={disabled || !allUntriaged} onClick={onSkipAll}>Move all to unused</button>}
        <span>{cards.length}</span>
      </header>
      <div className="lane-cards">
        <SortableContext items={cards.map(cardId)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => <Card key={card.id} {...{ card, disabled, onOpen, onMove }} />)}
        </SortableContext>
        {!cards.length && <p className="empty-lane">{disabled ? "No releases" : "Drop releases here"}</p>}
      </div>
    </section>
  );
}

function Details({ card, frozen, busy, onSave, onClose }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  const submit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (await onSave({
      id: card.id,
      status: data.get("status"), note: data.get("note"), chapter: data.get("chapter"),
      ...(data.get("hook") !== card.hook ? { hook: data.get("hook") } : {}),
    })) onClose();
  };
  return (
    <dialog ref={dialog} onClose={onClose} className="details" aria-labelledby="details-title">
      <form onSubmit={submit}>
        <div className="dialog-title">
          <div><p className="eyebrow">{card.ecosystem}</p><h2 id="details-title">{card.project} {card.version}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close card details">×</button>
        </div>
        <label>Hook <textarea name="hook" defaultValue={card.hook} maxLength={300} disabled={frozen} rows={2} /></label>
        <div className="detail-selects">
          <label>Status <select name="status" defaultValue={card.status} disabled={frozen}>
            {columns.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select></label>
          <label>Chapter <select name="chapter" defaultValue={card.chapter} disabled={frozen}>
            <option value="">Choose later</option>
            {chapterLabels.map((label) => <option key={label}>{label}</option>)}
          </select></label>
        </div>
        <label>Editorial note <textarea name="note" defaultValue={card.note} maxLength={4000} rows={3} disabled={frozen} /></label>
        <details><summary>Upstream notes</summary><p className="excerpt">{card.excerpt || "No excerpt in the feed."}</p></details>
        <div className="dialog-actions">
          <a href={card.url} target="_blank" rel="noreferrer">Open official source ↗</a>
          {!frozen && <button type="submit" className="primary" disabled={busy}>Save card</button>}
        </div>
      </form>
    </dialog>
  );
}

function Coverage({ sources }) {
  return (
    <details className="coverage">
      <summary>{sources.filter(({ fresh }) => fresh).length} of {sources.length} sources up to date</summary>
      <ul>
        {sources.map((source) => (
          <li key={source.key}>
            <strong>{source.project}</strong>
            <span>{source.checked ? `Checked ${times.format(source.checked)}` : "Awaiting first check"}</span>
            {source.error && <span className="source-error">{source.error}</span>}
            {source.gap && <span className="source-error">{source.gap}</span>}
            {source.checked && !source.fresh && !source.error && !source.gap && <span>Selected month needs a refresh</span>}
            {source.retry && <span>Retry after {times.format(source.retry)}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState("");
  const [view, setView] = useState("board");
  const [dragged, setDragged] = useState(null);
  const [details, setDetails] = useState(null);
  const request = useRef(0);
  const paused = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (paused.current) return;
      const generation = ++request.current;
      try {
        const next = await api("board");
        if (alive && generation === request.current) setData(next);
      } catch (err) {
        if (alive && generation === request.current) setError(err.message);
      }
    };
    void load();
    const timer = setInterval(load, 4000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const run = async (path, method, body) => {
    const generation = ++request.current;
    paused.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api(path, method, body);
      if (generation === request.current) setData(result);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      paused.current = false;
      setBusy(false);
    }
  };

  if (!data) return <main className="loading">{error || "Loading the editorial board…"}</main>;
  const frozen = Boolean(data.freeze);
  const readonly = frozen || busy;
  const move = (change) => run("card", "PATCH", change);
  const ecosystems = [...new Set(data.cards.map(({ ecosystem }) => ecosystem))];
  const cards = section ? data.cards.filter(({ ecosystem }) => ecosystem === section) : data.cards;
  const lanes = Object.fromEntries(columns.map(({ id }) => [id, cards.filter(({ status }) => status === id)
    .sort((a, b) => id === "untriaged" ? b.published - a.published || b.id - a.id : a.position - b.position)]));
  const shortlist = data.cards.filter(({ status }) => status === "shortlist");
  const allUntriaged = data.cards.filter(({ status }) => status === "untriaged").length;

  const finish = ({ active, over }) => {
    setDragged(null);
    paused.current = false;
    if (!over || readonly || active.id === over.id) return;
    const source = active.data.current;
    const destination = over.data.current;
    if (!source || !destination) return;
    const ordered = lanes[destination.status];
    const target = ordered.findIndex(({ id }) => id === destination.releaseId);
    const origin = ordered.findIndex(({ id }) => id === source.releaseId);
    const insert = origin >= 0 && target > origin ? target + 1 : target;
    const beforeId = insert < 0 ? null : ordered[insert]?.id ?? null;
    void move({ id: source.releaseId, status: destination.status, beforeId });
  };

  return (
    <main className="shell">
      <header className="mast">
        <p className="eyebrow">The Monthly Diff</p>
        <div className="headline-row">
          <div><h1>Editorial board</h1><p className="edition">{monthTitle}{["2026-11", "2026-12"].includes(month) ? " · Practice edition" : ""}</p></div>
          <div className="header-actions">
            <label className="month-label">Edition <input type="month" defaultValue={month} onChange={(event) => {
              if (monthPattern.test(event.target.value)) location.search = `?month=${event.target.value}`;
            }} /></label>
            <button type="button" disabled={!data.canSync || busy || Boolean(data.running)} onClick={() => run("sync", "POST", {})}>
              {data.running ? "Syncing…" : "Sync now"}
            </button>
            <button type="button" className="primary" disabled={busy} onClick={() => {
              if (frozen || confirm(`Freeze ${shortlist.length} shortlisted releases for ${monthTitle}?`)) {
                void run("freeze", "POST", { frozen: !frozen });
              }
            }}>{frozen ? "Unfreeze" : "Freeze shortlist"}</button>
            <button type="button" className="danger" disabled={readonly || allUntriaged === data.cards.length} onClick={() => {
              if (confirm(`All current triaging statuses for ${monthTitle} will be removed. Reset every card to Untriaged?`)) {
                void run("bulk-triage", "POST", { action: "reset" });
              }
            }}>Reset all to untriaged</button>
          </div>
        </div>
      </header>

      <div className="toolbar">
        <div className="view-toggle" aria-label="Release view">
          <button type="button" aria-pressed={view === "board"} onClick={() => setView("board")}>Board</button>
          <button type="button" aria-pressed={view === "scan"} onClick={() => setView("scan")}>Ecosystem scan</button>
        </div>
        <div className="ecosystem-filter"><label htmlFor="ecosystem-select">Ecosystem</label><select id="ecosystem-select" value={section} onChange={(event) => setSection(event.target.value)}>
          <option value="">All ecosystems</option>
          {ecosystems.map((group) => <option key={group}>{group}</option>)}
        </select></div>
        <span className="counts">{cards.length} releases · {lanes.untriaged.length} untriaged</span>
        <Coverage sources={data.sources} />
      </div>

      {data.running && <p className="notice" role="status">Collecting {data.running.month} · {data.running.progress || "Starting"}</p>}
      {!data.canSync && <p className="notice">Collection starts on the first day of {monthTitle}.</p>}
      {frozen && <p className="notice frozen">Shortlist frozen · {shortlist.length} releases <a href={`/api/export?month=${month}`}>Download Markdown</a></p>}
      {(error || data.manualError) && <p className="notice error" role="alert">{error || data.manualError}</p>}

      {view === "board" ? (
        <DndContext sensors={sensors} collisionDetection={collision}
          onDragStart={({ active }) => {
            paused.current = true;
            request.current++;
            setDragged(cards.find((card) => cardId(card) === active.id) ?? null);
          }}
          onDragEnd={finish} onDragCancel={() => { setDragged(null); paused.current = false; }}>
          <div className="board">
            {columns.map((column) => <Lane key={column.id} column={column} cards={lanes[column.id]}
              disabled={readonly} onOpen={setDetails} onMove={move} allUntriaged={allUntriaged}
              onSkipAll={() => {
                const cardsLabel = allUntriaged === 1 ? "card" : "cards";
                if (confirm(`Move all ${allUntriaged} untriaged ${cardsLabel} in ${monthTitle} to Skip? This includes any cards hidden by the ecosystem filter.`)) {
                  void run("bulk-triage", "POST", { action: "skip-untriaged" });
                }
              }} />)}
          </div>
          <DragOverlay>{dragged && <div className="card drag-preview"><CardContent card={dragged} /></div>}</DragOverlay>
        </DndContext>
      ) : (
        <div className="scan">
          {!cards.length && <p>No releases in this view.</p>}
          {ecosystems.filter((group) => !section || group === section).map((group) => {
            const groupCards = cards.filter(({ ecosystem }) => ecosystem === group);
            return (
              <section key={group} className="scan-group">
                <h2>{group} <span>{groupCards.length} releases · {groupCards.filter(({ status }) => status === "untriaged").length} untriaged</span></h2>
                <ol>
                  {groupCards.map((card) => (
                    <li key={card.id}><button className="scan-card" type="button" onClick={() => setDetails(card)}>
                      <CardContent card={card} />
                    </button><span>{columns.find(({ id }) => id === card.status).label}</span></li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}

      {details && <Details card={details} frozen={frozen} busy={busy} onSave={move} onClose={() => setDetails(null)} />}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
