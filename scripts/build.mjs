// Genera docs/index.html con resultados, calendario y posiciones de los equipos favoritos.
// Fuente de datos: API publica de ESPN (site.api.espn.com), no requiere API key.

const TEAMS = [
  {
    key: "real-madrid",
    name: "Real Madrid",
    teamId: "86",
    sportsDbId: "133738",
    logo: "assets/teams/real-madrid.webp",
    color: "#ffffff",
    badgeTextColor: "#111111",
    badgeLabel: "LALIGA",
    competitions: [
      { path: "soccer/esp.1", name: "LaLiga" },
      { path: "soccer/uefa.champions", name: "Champions League" },
      { path: "soccer/esp.copa_del_rey", name: "Copa del Rey" },
      { path: "soccer/esp.super_cup", name: "Supercopa de España" },
      { path: "soccer/club.friendly", name: "Amistoso" },
    ],
    rivals: [
      { match: "barcelona", label: "Clásico" },
      { match: "atletico madrid", label: "Derbi" },
      { match: "atletico de madrid", label: "Derbi" },
    ],
  },
  {
    key: "santos-laguna",
    name: "Santos Laguna",
    teamId: "225",
    sportsDbId: "134192",
    logo: "assets/teams/santos.png",
    color: "#0f9d58",
    badgeTextColor: "#ffffff",
    competitions: [{ path: "soccer/mex.1", name: "Liga MX" }],
  },
  {
    key: "raiders",
    name: "Las Vegas Raiders",
    teamId: "13",
    logo: "assets/teams/raiders.webp",
    color: "#a5acaf",
    badgeTextColor: "#111111",
    competitions: [{ path: "football/nfl", name: "NFL" }],
  },
  {
    key: "cubs",
    name: "Chicago Cubs",
    teamId: "16",
    logo: "assets/teams/cubs.webp",
    color: "#0e3386",
    badgeTextColor: "#ffffff",
    competitions: [{ path: "baseball/mlb", name: "MLB" }],
  },
  {
    key: "bulls",
    name: "Chicago Bulls",
    teamId: "4",
    logo: "assets/teams/bulls.png",
    color: "#ce1141",
    badgeTextColor: "#ffffff",
    competitions: [{ path: "basketball/nba", name: "NBA" }],
  },
  {
    key: "kings",
    name: "Los Angeles Kings",
    teamId: "8",
    logo: "assets/teams/la.png",
    color: "#8b5cf6",
    badgeTextColor: "#ffffff",
    competitions: [{ path: "hockey/nhl", name: "NHL" }],
  },
];

const MCLAREN = {
  key: "mclaren",
  name: "McLaren",
  logo: "assets/teams/mclaren.png",
  color: "#ff8700",
  badgeTextColor: "#111111",
  badgeLabel: "F1",
  drivers: ["Lando Norris", "Oscar Piastri"],
  sport: "racing",
  calendarTitle: (ev) => `F1: ${ev.rivalName}`,
  labels: { upcoming: "Proximas carreras" },
};

const SINNER = {
  key: "sinner",
  name: "Jannik Sinner",
  logo: "assets/teams/sinner.png",
  color: "#1d4ed8",
  badgeTextColor: "#ffffff",
  badgeLabel: "ATP",
  athleteId: "3623",
  sport: "tennis",
};

const BASE = "https://site.api.espn.com/apis/site/v2/sports";
const STANDINGS_BASE = "https://site.api.espn.com/apis/v2/sports";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}

function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function getSchedule(team) {
  // Se combinan temporada actual + anterior de cada competicion: entre temporadas,
  // la actual solo trae partidos futuros y la anterior aporta los ultimos resultados terminados.
  const previousYear = new Date().getUTCFullYear() - 1;
  const requests = [];
  for (const comp of team.competitions) {
    requests.push({ comp, url: `${BASE}/${comp.path}/teams/${team.teamId}/schedule` });
    requests.push({ comp, url: `${BASE}/${comp.path}/teams/${team.teamId}/schedule?season=${previousYear}` });
    // En futbol, /schedule solo trae partidos jugados; los proximos vienen con fixture=true.
    if (comp.path.startsWith("soccer/")) {
      requests.push({ comp, url: `${BASE}/${comp.path}/teams/${team.teamId}/schedule?fixture=true` });
    }
  }
  const results = await Promise.allSettled(requests.map((r) => fetchJson(r.url)));
  const eventsById = new Map();
  results.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const competitionName = requests[i].comp.name;
    for (const event of result.value.events || []) {
      eventsById.set(event.id, { event, competitionName });
    }
  });
  return [...eventsById.values()];
}

function findRivalry(team, rivalName) {
  if (!team.rivals) return null;
  const normalizedRival = normalize(rivalName);
  const rivalry = team.rivals.find((r) => normalizedRival.includes(normalize(r.match)));
  return rivalry ? rivalry.label : null;
}

function parseEvent({ event, competitionName }, team) {
  const comp = event.competitions[0];
  const competitors = comp.competitors;
  const self = competitors.find((c) => String(c.team.id) === String(team.teamId));
  const rival = competitors.find((c) => String(c.team.id) !== String(team.teamId));
  const completed = !!comp.status?.type?.completed;

  let result = null;
  if (completed) {
    if (self?.winner === true) result = "win";
    else if (rival?.winner === true) result = "loss";
    else result = "draw";
  }

  const rivalName = rival?.team?.displayName || "?";

  return {
    date: new Date(event.date),
    completed,
    live: comp.status?.type?.state === "in",
    timeValid: comp.timeValid !== false,
    statusDetail: liveDetail(comp.status),
    isTeamHome: self?.homeAway === "home",
    rivalName,
    // Nombres cortos ("Kings", "Capitals") para la agenda semanal.
    teamShort: self?.team?.shortDisplayName,
    rivalShort: rival?.team?.shortDisplayName,
    teamScore: scoreValue(self?.score),
    rivalScore: scoreValue(rival?.score),
    result,
    competitionName,
    rivalryLabel: findRivalry(team, rivalName),
  };
}

// /schedule devuelve el marcador como objeto y /scoreboard como texto.
function scoreValue(score) {
  if (score == null) return "";
  return typeof score === "object" ? score.displayValue ?? "" : String(score);
}

function liveDetail(status) {
  if (status?.type?.state === "in" && status.displayClock && status.displayClock !== "0'") {
    return status.type.name === "STATUS_HALFTIME" ? "Medio tiempo" : status.displayClock;
  }
  return status?.type?.shortDetail || status?.type?.description || "";
}

function parseSportsDbEvent(event, team, completed) {
  const isTeamHome = event.strHomeTeam === team.name;
  const rivalName = isTeamHome ? event.strAwayTeam : event.strHomeTeam;
  const date = new Date(`${event.strTimestamp}Z`);
  if (Number.isNaN(date.getTime())) return null;

  let result = null;
  let teamScore = "";
  let rivalScore = "";
  if (completed && event.intHomeScore != null && event.intAwayScore != null) {
    const homeScore = Number(event.intHomeScore);
    const awayScore = Number(event.intAwayScore);
    teamScore = String(isTeamHome ? homeScore : awayScore);
    rivalScore = String(isTeamHome ? awayScore : homeScore);
    result = homeScore === awayScore ? "draw" : (isTeamHome ? homeScore > awayScore : awayScore > homeScore) ? "win" : "loss";
  }

  return {
    date,
    completed,
    live: false,
    timeValid: true,
    statusDetail: "",
    isTeamHome,
    rivalName,
    teamScore,
    rivalScore,
    result,
    competitionName: event.strLeague || "",
    rivalryLabel: findRivalry(team, rivalName),
  };
}

async function getSportsDbEvent(team, endpoint, resultsKey, completed) {
  if (!team.sportsDbId) return null;
  try {
    const data = await fetchJson(`https://www.thesportsdb.com/api/v1/json/3/${endpoint}.php?id=${team.sportsDbId}`);
    const event = (data[resultsKey] || [])[0];
    if (!event) return null;
    return parseSportsDbEvent(event, team, completed);
  } catch {
    return null;
  }
}

function getSportsDbUpcoming(team) {
  return getSportsDbEvent(team, "eventsnext", "events", false);
}

function getSportsDbLast(team) {
  return getSportsDbEvent(team, "eventslast", "results", true);
}

async function getSeasonStatus(team) {
  const primaryCompetition = team.competitions[0];
  try {
    const data = await fetchJson(`${BASE}/${primaryCompetition.path}/teams/${team.teamId}/schedule`);
    const seasonLabel = `${data.season?.name || ""} ${data.season?.displayName || ""}`.toLowerCase();
    if (seasonLabel.includes("off season") || seasonLabel.includes("preseason")) return "not-started";
    const now = new Date();
    const hasStarted = (data.events || []).some((e) => new Date(e.date) <= now);
    return hasStarted ? "started" : "not-started";
  } catch {
    return "not-started";
  }
}

async function getStandingEntry(team) {
  const primaryCompetition = team.competitions[0];
  const data = await fetchJson(`${STANDINGS_BASE}/${primaryCompetition.path}/standings`);
  const groups = data.children && data.children.length ? data.children : [{ name: data.name, standings: data.standings }];
  for (const group of groups) {
    const entries = group.standings?.entries || [];
    const idx = entries.findIndex((e) => String(e.team.id) === String(team.teamId));
    if (idx !== -1) {
      const entry = entries[idx];
      const statByName = (name) => entry.stats.find((s) => s.name === name)?.displayValue;
      const overall = entry.stats.find((s) => s.type === "total")?.displayValue;
      return {
        groupName: group.name || group.abbreviation || "",
        competitionName: primaryCompetition.name,
        rank: idx + 1,
        totalInGroup: entries.length,
        record: overall || `${statByName("wins") ?? "-"}-${statByName("losses") ?? "-"}`,
        winPercent: statByName("winPercent"),
      };
    }
  }
  return null;
}

const RESULT_LABEL = { win: "V", loss: "D", draw: "E" };
const MAZATLAN_TZ = "America/Mazatlan";

function fmtDate(d) {
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: MAZATLAN_TZ });
}

function fmtTime(d) {
  return d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", timeZone: MAZATLAN_TZ });
}

// Etiquetas cortas para que las filas no ocupen dos lineas (incluye nombres de TheSportsDB).
const COMPETITION_SHORT = {
  "Champions League": "UCL",
  "Copa del Rey": "Copa",
  "Supercopa de España": "Supercopa",
  "Spanish La Liga": "LaLiga",
  "Mexican Primera League": "Liga MX",
};

function compTagHtml(ev, showCompetition) {
  if (!showCompetition || !ev.competitionName) return "";
  return `<span class="comp-tag">${COMPETITION_SHORT[ev.competitionName] || ev.competitionName}</span>`;
}

function fmtMatchTime(ev) {
  return ev.timeValid === false ? "Por confirmar" : fmtTime(ev.date);
}

function renderResultRow(ev, showCompetition) {
  const sede = ev.isRace ? "" : ev.isTeamHome ? "vs" : '<span class="away-marker">@</span>';
  const rivalryTag = ev.rivalryLabel ? `<span class="rivalry-tag">★ ${ev.rivalryLabel}</span>` : "";
  const compTag = compTagHtml(ev, showCompetition);
  const score = ev.rivalScore !== "" ? `${ev.teamScore}&ndash;${ev.rivalScore}` : ev.teamScore;
  return `<div class="result-row ${ev.result}${ev.rivalryLabel ? " rivalry" : ""}">
    <span class="result-badge">${ev.formLabel || RESULT_LABEL[ev.result]}</span>
    <span class="result-date">${fmtDate(ev.date)}</span>
    <span class="result-matchup">${sede} ${ev.rivalName} ${rivalryTag}${compTag}</span>
    <span class="result-score">${score}</span>
  </div>`;
}

// Duracion aproximada del evento en el calendario, segun el deporte.
const EVENT_HOURS = { soccer: 2, football: 3.5, baseball: 3, basketball: 2.5, hockey: 2.5, racing: 2, tennis: 3 };

function toCalendarDate(d, allDay) {
  const iso = d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return allDay ? iso.slice(0, 8) : iso;
}

// Enlace de Google Calendar; si la hora no es oficial se agrega como evento de todo el dia.
function googleCalendarUrl(ev, team) {
  const title = team.calendarTitle
    ? team.calendarTitle(ev)
    : ev.isTeamHome ? `${team.name} vs ${ev.rivalName}` : `${ev.rivalName} vs ${team.name}`;
  const allDay = ev.timeValid === false;
  const start = allDay ? new Date(`${ev.date.toLocaleDateString("en-CA", { timeZone: MAZATLAN_TZ })}T00:00:00Z`) : ev.date;
  const end = new Date(start.getTime() + (allDay ? 24 : EVENT_HOURS[team.sport || team.competitions?.[0]?.path.split("/")[0]] || 2) * 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toCalendarDate(start, allDay)}/${toCalendarDate(end, allDay)}`,
    details: [ev.competitionName, "Agregado desde STRICKEOUT"].filter(Boolean).join(" · "),
  });
  return `https://calendar.google.com/calendar/render?${params.toString().replace(/&/g, "&amp;")}`;
}

function renderUpcomingRow(ev, showCompetition, team) {
  const sede = ev.isRace ? "" : ev.isTeamHome ? "vs" : '<span class="away-marker">@</span>';
  const rivalryTag = ev.rivalryLabel ? `<span class="rivalry-tag">★ ${ev.rivalryLabel}</span>` : "";
  const compTag = compTagHtml(ev, showCompetition);
  return `<div class="upcoming-row${ev.rivalryLabel ? " rivalry" : ""}">
    <span class="result-date">${fmtDate(ev.date)}</span>
    <span class="result-matchup">${sede} ${ev.rivalName} ${rivalryTag}${compTag}</span>
    <span class="upcoming-time${ev.timeValid === false ? " tbd" : ""}">${fmtMatchTime(ev)}</span>
    <a class="cal-link" href="${googleCalendarUrl(ev, team)}" target="_blank" rel="noopener" title="Agregar a Google Calendar" aria-label="Agregar a Google Calendar">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v5M9.5 16.5h5"/></svg>
    </a>
  </div>`;
}

function renderLiveRow(ev, showCompetition) {
  const sede = ev.isRace ? "" : ev.isTeamHome ? "vs" : '<span class="away-marker">@</span>';
  const rivalryTag = ev.rivalryLabel ? `<span class="rivalry-tag">★ ${ev.rivalryLabel}</span>` : "";
  const compTag = compTagHtml(ev, showCompetition);
  const score = ev.rivalScore !== "" ? `${ev.teamScore || 0}&ndash;${ev.rivalScore}` : ev.teamScore;
  return `<div class="live-row${ev.rivalryLabel ? " rivalry" : ""}">
    <span class="live-badge">EN VIVO</span>
    <span class="result-matchup">${sede} ${ev.rivalName} ${rivalryTag}${compTag}</span>
    <span class="live-clock">${ev.statusDetail}</span>
    <span class="result-score">${score}</span>
  </div>`;
}

function renderLiveSection(liveEvents, showCompetition) {
  if (!liveEvents.length) return "";
  return `<h3 class="live-title">En vivo</h3>${liveEvents.map((e) => renderLiveRow(e, showCompetition)).join("")}`;
}

// Quita el año de temporada ("2026-27 LALIGA" -> "LALIGA") y no repite la competicion.
function standingLabel(groupName, competitionName) {
  const group = groupName.replace(/^\d{4}(-\d{2,4})?\s*/, "").trim();
  const compact = (str) => normalize(str).replace(/\s/g, "");
  if (!group || compact(group).includes(compact(competitionName))) return competitionName;
  return `${group} (${competitionName})`;
}

async function gatherTeamData(team, order) {
  let resultados = "";
  let proximos = "";
  let standingsHtml = "";
  let lastUpdated = 0;
  let nextMatch = null;
  let envivo = "";
  let form = [];
  let agenda = [];
  const showCompetition = team.competitions.length > 1;

  try {
    const rawEvents = await getSchedule(team);
    const parsed = rawEvents.map((e) => parseEvent(e, team));
    const now = new Date();

    const finishedBase = parsed.filter((e) => e.completed).sort((a, b) => b.date - a.date);
    const liveEvents = parsed.filter((e) => e.live).sort((a, b) => a.date - b.date);
    const upcomingBase = parsed.filter((e) => !e.completed && !e.live && e.date >= now).sort((a, b) => a.date - b.date);

    // ESPN aun no publica el calendario/resultados de algunas competiciones (ej. Leagues Cup);
    // TheSportsDB rellena el ultimo y el proximo partido mientras tanto. Se compara solo por fecha
    // porque los nombres de rival difieren entre APIs (ej. "Atletico de San Luis" vs "Atlético de San Luis").
    const [sportsDbLast, sportsDbEvent] = await Promise.all([getSportsDbLast(team), getSportsDbUpcoming(team)]);

    let finished = finishedBase;
    if (sportsDbLast) {
      const alreadyHave = parsed.some((e) => Math.abs(e.date - sportsDbLast.date) < 12 * 60 * 60 * 1000);
      if (!alreadyHave) {
        finished = [sportsDbLast, ...finishedBase].sort((a, b) => b.date - a.date);
      }
    }
    finished = finished.slice(0, 5);
    form = finished;
    lastUpdated = liveEvents.length ? now.getTime() : finished.length ? finished[0].date.getTime() : 0;

    let upcoming = upcomingBase;
    if (sportsDbEvent) {
      const alreadyHave = parsed.some((e) => Math.abs(e.date - sportsDbEvent.date) < 12 * 60 * 60 * 1000);
      if (!alreadyHave) {
        upcoming = [sportsDbEvent, ...upcomingBase].sort((a, b) => a.date - b.date);
      }
    }
    upcoming = upcoming.slice(0, 5);

    nextMatch = liveEvents[0] || upcoming[0] || null;
    agenda = [...liveEvents, ...upcoming];

    const primaryCompetitionNames = new Set(team.competitions.map((c) => c.name));
    envivo = renderLiveSection(liveEvents, showCompetition || liveEvents.some((e) => !primaryCompetitionNames.has(e.competitionName)));
    const showResultCompetition = showCompetition || finished.some((e) => !primaryCompetitionNames.has(e.competitionName));
    resultados = finished.length
      ? finished.map((e) => renderResultRow(e, showResultCompetition)).join("")
      : `<p class="muted">Sin resultados recientes disponibles.</p>`;

    const showUpcomingCompetition = showCompetition || upcoming.some((e) => !primaryCompetitionNames.has(e.competitionName));
    proximos = upcoming.length
      ? upcoming.map((e) => renderUpcomingRow(e, showUpcomingCompetition, team)).join("")
      : `<p class="muted">Calendario aun no publicado.</p>`;
  } catch (err) {
    resultados = `<p class="muted">No se pudo cargar (${err.message}).</p>`;
    proximos = `<p class="muted">No se pudo cargar.</p>`;
  }

  const seasonStatus = await getSeasonStatus(team);

  try {
    const standing = await getStandingEntry(team);
    standingsHtml = standing
      ? `<div class="standing-row">
          <span class="rank-badge">${standing.rank}º</span>
          <span class="standing-detail" title="de ${standing.totalInGroup} en ${standingLabel(standing.groupName, standing.competitionName)}">de ${standing.totalInGroup} &middot; ${standing.competitionName}</span>
        </div>`
      : `<p class="muted">Posicion no disponible.</p>`;
  } catch (err) {
    standingsHtml = `<p class="muted">No se pudo cargar (${err.message}).</p>`;
  }

  return { team, order, lastUpdated, nextMatch, seasonStatus, standingsHtml, resultados, proximos, envivo, form, agenda };
}

// "Esta semana": hoy y los 6 dias siguientes (hora de Mazatlan), con los partidos de todos los equipos.
function dayKey(d) {
  return d.toLocaleDateString("en-CA", { timeZone: MAZATLAN_TZ });
}

function renderAgenda(teamData) {
  const now = new Date();
  const week = Array.from({ length: 7 }, (_, i) => new Date(now.getTime() + i * 24 * 60 * 60 * 1000));
  const groups = new Map(week.map((d) => [dayKey(d), []]));
  const today = dayKey(now);
  const items = teamData
    .flatMap((d) => (d.agenda || []).map((ev) => ({ team: d.team, ev })))
    .filter(({ ev }) => ev.live || (ev.date >= now && groups.has(dayKey(ev.date))))
    .sort((a, b) => a.ev.date - b.ev.date);
  if (!items.length) return "";

  for (const item of items) {
    groups.get(item.ev.live ? today : dayKey(item.ev.date)).push(item);
  }

  const days = week.map((date) => {
    const list = groups.get(dayKey(date));
    const weekday = date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short", timeZone: MAZATLAN_TZ });
    if (!list.length) {
      return `<div class="agenda-day empty"><h3>${weekday}</h3><p class="agenda-empty">Sin partidos</p></div>`;
    }
    const rows = list.map(({ team, ev }) => {
      const time = ev.live ? `<span class="live-badge">EN VIVO</span>` : fmtMatchTime(ev);
      const sede = ev.isRace ? "" : ev.isTeamHome ? "vs " : '<span class="away-marker">@</span> ';
      // En futbol el nombre corto de ESPN pierde acentos ("Queretaro"), asi que solo se usa en las ligas de EE.UU.
      const useShort = team.competitions && !team.competitions[0].path.startsWith("soccer/");
      const teamLabel = useShort && ev.teamShort ? ev.teamShort : team.name;
      const rivalLabel = useShort && ev.rivalShort ? ev.rivalShort : ev.rivalName;
      const matchup = `<strong class="agenda-team">${teamLabel}</strong> <span class="agenda-rival">${sede}${rivalLabel}</span>`;
      return `<a class="agenda-row" href="#${team.key}" style="--team-color: ${team.color}">
        <img class="agenda-logo" src="${team.logo}" alt="" />
        <span class="agenda-match">${matchup}</span>
        <span class="agenda-meta">
          <span class="agenda-time${ev.timeValid === false ? " tbd" : ""}">${time}</span>
          ${compTagHtml(ev, true)}
        </span>
      </a>`;
    }).join("");
    return `<div class="agenda-day"><h3>${weekday}</h3>${rows}</div>`;
  }).join("");

  return `<section class="agenda"><h2>Esta semana</h2><div class="agenda-days">${days}</div></section>`;
}

// Racha: ultimos resultados del mas antiguo (izquierda) al mas reciente (derecha).
function renderForm(form) {
  if (!form || !form.length) return "";
  const squares = [...form].reverse().map((e) => `<span class="form-dot ${e.result}">${e.formLabel || RESULT_LABEL[e.result]}</span>`).join("");
  return `<div class="form" title="Ultimos ${form.length} resultados, del mas antiguo al mas reciente">${squares}</div>`;
}

function renderTeamCard(data) {
  const { team, order, lastUpdated, nextMatch, seasonStatus, standingsHtml, resultados, proximos, envivo = "", form } = data;
  const countdownHtml = nextMatch?.live
    ? `<span class="countdown live">● EN VIVO</span>`
    : nextMatch
      ? `<span class="countdown" data-target="${nextMatch.date.getTime()}">Calculando...</span>`
      : `<span class="countdown no-match">Sin Anunciar</span>`;
  return `
  <section class="card" id="${team.key}" data-order="${order}" data-updated="${lastUpdated}" style="--team-color: ${team.color}; --team-badge-text: ${team.badgeTextColor}">
    <span class="status-dot ${seasonStatus}" title="${seasonStatus === "started" ? "Temporada en curso" : "Temporada aun no comienza"}"></span>
    <div class="card-header">
      <img class="logo" src="${team.logo}" alt="${team.name}" />
      <h2>${team.name}</h2>
      <span class="league">${team.badgeLabel || team.competitions.map((c) => c.name).join(" · ")}</span>
      ${renderForm(form)}
      ${standingsHtml}
    </div>
    ${envivo}
    <div class="card-details">
      <h3>Ultimos resultados</h3>
      ${resultados}
      <h3>${team.labels?.upcoming || "Proximos partidos"}</h3>
      ${proximos}
    </div>
    ${countdownHtml}
    <button class="card-toggle" type="button" aria-expanded="false">Ver más</button>
  </section>`;
}

// "Singapore Airlines Singapore GP" -> "Singapore GP"
const F1_SPONSORS = /^(Singapore Airlines|MSC Cruises|Heineken|Qatar Airways|Etihad Airways|Gulf Air|Aramco|STC|Lenovo|Pirelli|Crypto\.com|AWS|Louis Vuitton|Tag Heuer|Moët & Chandon|Rolex|Formula 1)\s+/i;

function raceName(event) {
  return (event.shortName || event.name).replace(F1_SPONSORS, "");
}

async function gatherMcLarenData(order) {
  let resultados = "";
  let proximos = "";
  let standingsHtml = "";
  let lastUpdated = 0;
  let nextMatch = null;
  let seasonStatus = "not-started";
  let envivo = "";
  let form = [];
  let agenda = [];

  try {
    const year = new Date().getUTCFullYear();
    const results = await Promise.allSettled([
      fetchJson(`${BASE}/racing/f1/scoreboard?dates=${year}`),
      fetchJson(`${BASE}/racing/f1/scoreboard?dates=${year - 1}`),
    ]);
    const eventsById = new Map();
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const event of r.value.events || []) eventsById.set(event.id, event);
    }

    const now = new Date();
    // Cada Gran Premio trae todas las sesiones (FP1, Qualy, Sprint...); solo interesa la carrera.
    const parsed = [...eventsById.values()].map((event) => {
      const comp = event.competitions.find((c) => c.type?.abbreviation === "Race") || event.competitions[event.competitions.length - 1];
      const completed = !!comp.status?.type?.completed;
      const live = comp.status?.type?.state === "in";
      const mclarenDrivers = (comp.competitors || [])
        .filter((c) => MCLAREN.drivers.includes(c.athlete?.displayName))
        .sort((a, b) => Number(a.order) - Number(b.order));
      const bestOrder = mclarenDrivers.length ? Number(mclarenDrivers[0].order) : null;
      const positions = mclarenDrivers.map((d) => `P${d.order}`).join(" · ");

      let result = null;
      if (completed && bestOrder != null) {
        result = bestOrder <= 3 ? "win" : bestOrder <= 10 ? "draw" : "loss";
      }

      return {
        date: new Date(comp.date || event.date),
        completed,
        live,
        isRace: true,
        formLabel: bestOrder != null ? String(bestOrder) : null,
        timeValid: comp.timeValid !== false,
        statusDetail: live ? comp.status?.type?.shortDetail || "" : "",
        isTeamHome: true,
        rivalName: raceName(event),
        teamScore: positions,
        rivalScore: "",
        result,
        competitionName: "F1",
        rivalryLabel: null,
      };
    });

    const finished = parsed
      .filter((e) => e.completed)
      .sort((a, b) => b.date - a.date)
      .slice(0, 5);
    const liveEvents = parsed.filter((e) => e.live);
    form = finished.filter((e) => e.result);
    lastUpdated = liveEvents.length ? now.getTime() : finished.length ? finished[0].date.getTime() : 0;
    seasonStatus = finished.length ? "started" : "not-started";

    const upcoming = parsed
      .filter((e) => !e.completed && !e.live && e.date >= now)
      .sort((a, b) => a.date - b.date)
      .slice(0, 5);
    nextMatch = liveEvents[0] || upcoming[0] || null;
    agenda = [...liveEvents, ...upcoming];
    envivo = renderLiveSection(liveEvents, false);

    resultados = finished.length
      ? finished.map((e) => renderResultRow(e, false)).join("")
      : `<p class="muted">Sin resultados recientes disponibles.</p>`;
    proximos = upcoming.length
      ? upcoming.map((e) => renderUpcomingRow(e, false, MCLAREN)).join("")
      : `<p class="muted">Calendario aun no publicado.</p>`;
  } catch (err) {
    resultados = `<p class="muted">No se pudo cargar (${err.message}).</p>`;
    proximos = `<p class="muted">No se pudo cargar.</p>`;
  }

  try {
    const standings = await fetchJson(`${STANDINGS_BASE}/racing/f1/standings`);
    const constructors = standings.children?.find((c) => c.name === "Constructor Standings");
    const entries = constructors?.standings?.entries || [];
    const idx = entries.findIndex((e) => e.team?.displayName === "McLaren");
    standingsHtml =
      idx !== -1
        ? `<div class="standing-row">
            <span class="rank-badge">${idx + 1}º</span>
            <span class="standing-detail" title="de ${entries.length} en Constructores (F1)">de ${entries.length} &middot; Constructores</span>
          </div>`
        : `<p class="muted">Posicion no disponible.</p>`;
  } catch (err) {
    standingsHtml = `<p class="muted">No se pudo cargar (${err.message}).</p>`;
  }

  return { team: MCLAREN, order, lastUpdated, nextMatch, seasonStatus, standingsHtml, resultados, proximos, envivo, form, agenda };
}

async function gatherSinnerData(order) {
  let resultados = "";
  let proximos = "";
  let standingsHtml = "";
  let lastUpdated = 0;
  let nextMatch = null;
  let form = [];
  let agenda = [];

  try {
    const year = new Date().getUTCFullYear();
    const log = await fetchJson(
      `https://sports.core.api.espn.com/v2/sports/tennis/leagues/atp/seasons/${year}/athletes/${SINNER.athleteId}/eventlog?lang=en&region=us`
    );
    const items = log.events?.items || [];
    const competitions = await Promise.allSettled(items.map((it) => fetchJson(it.competition.$ref)));
    const eventNameCache = new Map();

    async function getEventName(ref) {
      if (eventNameCache.has(ref)) return eventNameCache.get(ref);
      try {
        const ev = await fetchJson(ref);
        const name = ev.shortName || ev.name || "";
        eventNameCache.set(ref, name);
        return name;
      } catch {
        return "";
      }
    }

    const parsed = [];
    for (let i = 0; i < items.length; i++) {
      const compResult = competitions[i];
      if (compResult.status !== "fulfilled") continue;
      const comp = compResult.value;
      const sinnerC = comp.competitors.find((c) => c.id === SINNER.athleteId);
      const oppC = comp.competitors.find((c) => c.id !== SINNER.athleteId);
      if (!sinnerC || !oppC) continue;
      const completed = !!items[i].played;
      const tournamentName = await getEventName(items[i].event.$ref);
      parsed.push({
        date: new Date(comp.date),
        completed,
        statusDetail: "",
        isTeamHome: true,
        rivalName: oppC.name || "Rival",
        teamScore: "",
        rivalScore: "",
        result: completed ? (sinnerC.winner ? "win" : "loss") : null,
        competitionName: tournamentName,
        rivalryLabel: null,
      });
    }

    const now = new Date();
    const finished = parsed
      .filter((e) => e.completed)
      .sort((a, b) => b.date - a.date)
      .slice(0, 5);
    lastUpdated = finished.length ? finished[0].date.getTime() : 0;
    form = finished;

    const upcoming = parsed
      .filter((e) => !e.completed && e.date >= now)
      .sort((a, b) => a.date - b.date)
      .slice(0, 5);
    nextMatch = upcoming.length ? upcoming[0] : null;
    agenda = upcoming;

    resultados = finished.length
      ? finished.map((e) => renderResultRow(e, true)).join("")
      : `<p class="muted">Sin resultados recientes disponibles.</p>`;
    proximos = upcoming.length
      ? upcoming.map((e) => renderUpcomingRow(e, true, SINNER)).join("")
      : `<p class="muted">Calendario aun no publicado.</p>`;
  } catch (err) {
    resultados = `<p class="muted">No se pudo cargar (${err.message}).</p>`;
    proximos = `<p class="muted">No se pudo cargar.</p>`;
  }

  try {
    const rankings = await fetchJson(`${BASE}/tennis/atp/rankings`);
    const entry = rankings.rankings?.[0]?.ranks?.find((r) => String(r.athlete?.id) === SINNER.athleteId);
    standingsHtml = entry
      ? `<div class="standing-row">
          <span class="rank-badge">${entry.current}º</span>
          <span class="standing-detail">ATP &middot; ${entry.points} pts</span>
        </div>`
      : `<p class="muted">Ranking no disponible.</p>`;
  } catch (err) {
    standingsHtml = `<p class="muted">No se pudo cargar (${err.message}).</p>`;
  }

  return { team: SINNER, order, lastUpdated, nextMatch, seasonStatus: "started", standingsHtml, resultados, proximos, form, agenda };
}

async function main() {
  const teamData = [];
  for (let i = 0; i < TEAMS.length; i++) {
    teamData.push(await gatherTeamData(TEAMS[i], i));
  }
  teamData.push(await gatherMcLarenData(TEAMS.length));
  teamData.push(await gatherSinnerData(TEAMS.length + 1));

  let nextUp = null;
  for (const d of teamData) {
    if (d.nextMatch && (!nextUp || d.nextMatch.date < nextUp.match.date)) {
      nextUp = { team: d.team, match: d.nextMatch };
    }
  }
  const tickerHtml = nextUp
    ? (() => {
        const msg = `${nextUp.match.isRace ? "Proxima carrera" : "Proximo partido"}: <strong>${nextUp.team.name}</strong> ${nextUp.match.isRace ? "&middot;" : "vs"} <strong>${nextUp.match.rivalName}</strong> &mdash; ${fmtDate(nextUp.match.date)}, ${fmtMatchTime(nextUp.match)}`;
        const repeated = Array.from({ length: 10 }, () => msg).join(" &nbsp;•&nbsp; ");
        return `<div class="ticker"><div class="ticker-track"><span class="ticker-copy">${repeated} &nbsp;•&nbsp; </span><span class="ticker-copy">${repeated} &nbsp;•&nbsp; </span></div></div>`;
      })()
    : "";

  const cards = teamData.map((d) => renderTeamCard(d));

  const now = new Date();
  const updatedAt = now.toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: MAZATLAN_TZ,
  });

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>STRICKEOUT | @RicardoHdzm</title>
<link rel="icon" href="assets/favicon/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="assets/favicon/apple-touch-icon.png" type="image/png" />
<link rel="apple-touch-icon" href="assets/favicon/apple-touch-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Anton&display=swap" rel="stylesheet" />
<style>
  :root {
    color-scheme: dark;
    --bg: #050505;
    --card-bg: rgba(0,0,0,0.5);
    --card-border: rgba(255,255,255,0.1);
    --text: #f0f0f2;
    --muted: #8b8d94;
    --win: #22c55e;
    --loss: #ef4444;
    --draw: #eab308;
  }
  * { box-sizing: border-box; }
  html { background: var(--bg); -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  body {
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    margin: 0; padding: 0 .25rem 2rem; color: var(--text);
    background-color: var(--bg);
    background-image:
      linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
    background-size: 24px 24px;
    background-attachment: fixed;
    min-height: 100vh;
  }
  .ticker {
    overflow: hidden; white-space: nowrap; background: rgba(0,0,0,0.5);
    border-bottom: 1px solid var(--card-border); padding: .55rem 0; margin: 0 -.25rem 0;
  }
  .ticker-track {
    display: flex; width: max-content;
    animation: ticker-scroll 60s linear infinite;
  }
  .ticker-copy {
    font-size: .85rem; font-weight: 600; color: var(--text);
  }
  .ticker-track strong { color: #fff; }
  @keyframes ticker-scroll {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
  }
  h1 { text-align: center; margin: 3rem 0 .4rem; line-height: 1; }
  .brand {
    display: inline-block; font-family: "Anton", "Arial Black", sans-serif; transform: skewX(-8deg);
    font-size: clamp(2.75rem, 11vw, 5rem);
  }
  .brand-main { display: block; letter-spacing: .05em; margin-bottom: .18em; color: #ffffff; }
  .brand-sub {
    display: block; font-size: .2em; letter-spacing: .35em;
    color: #fff; padding-left: .35em;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; font-weight: 500;
  }
  .updated { text-align: center; color: var(--muted); font-size: .85rem; margin: .35rem 0 1.25rem; }
  .sort-bar { display: flex; justify-content: center; gap: .5rem; margin-bottom: 2.5rem; }
  .sort-btn {
    font-family: inherit; font-size: .8rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
    color: var(--muted); background: rgba(255,255,255,0.05); border: 1px solid var(--card-border);
    border-radius: 999px; padding: .4rem 1.1rem; cursor: pointer;
  }
  .sort-btn.active { color: #0a0a0b; background: #ffffff; border-color: #ffffff; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(max(320px, calc((100% - 1.5rem) / 3)), 1fr)); gap: .75rem; max-width: 1500px; margin: 0 auto; }
  .card {
    position: relative;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-top: 5px solid var(--team-color);
    border-radius: 12px;
    padding: 1.1rem;
  }
  .status-dot {
    position: absolute; top: .9rem; right: .9rem; width: 12px; height: 12px; border-radius: 50%;
  }
  .status-dot.started { background: var(--win); animation: pulse-started 1.6s infinite; }
  .status-dot.not-started { background: var(--loss); animation: pulse-not-started 1.6s infinite; }
  @keyframes pulse-started {
    0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.65); }
    70% { box-shadow: 0 0 0 9px rgba(34,197,94,0); }
    100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
  }
  @keyframes pulse-not-started {
    0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.65); }
    70% { box-shadow: 0 0 0 9px rgba(239,68,68,0); }
    100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
  }
  .card-header {
    display: grid; grid-template-columns: auto 1fr auto; grid-template-rows: auto auto auto; column-gap: 1rem;
    align-items: center; justify-items: start; text-align: left;
    margin: -1.1rem -1.1rem .25rem; padding: 1.1rem 2rem 1.1rem 1.1rem; border-radius: 7px 7px 0 0;
    background: linear-gradient(to bottom, color-mix(in srgb, var(--team-color) 22%, transparent), transparent);
  }
  .logo { width: 88px; height: 88px; object-fit: contain; grid-row: 1 / span 3; margin: 0; }
  .card-header h2 { margin: 0; font-size: 1.25rem; font-weight: 800; }
  .league { margin-top: .35rem; font-size: .7rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); border: 1px solid currentColor; border-radius: 999px; padding: .15rem .6rem; text-align: center; }
  .countdown {
    display: block; width: fit-content; margin: 1.1rem auto 0; font-size: .75rem; font-weight: 700; letter-spacing: .03em;
    color: var(--team-badge-text); background: var(--team-color); border-radius: 999px; padding: .3rem .9rem;
  }
  .card h3 { font-size: .75rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 1.1rem 0 .5rem; font-weight: 700; }
  .muted { color: var(--muted); font-size: .9rem; margin: 0; }

  .standing-row { display: flex; align-items: center; gap: .75rem; }
  .card-header .standing-row {
    grid-column: 3; grid-row: 1 / span 3; justify-self: end;
    flex-direction: column; gap: .3rem; text-align: center;
  }
  .card-header .rank-badge { width: 3rem; height: 3rem; font-size: 1.1rem; }
  .card-header .standing-detail { max-width: 5.5rem; font-size: .68rem; line-height: 1.3; color: var(--muted); }
  .card-header .muted { grid-column: 3; grid-row: 1 / span 3; max-width: 6.5rem; font-size: .7rem; }
  .rank-badge {
    flex: none; display: flex; align-items: center; justify-content: center;
    width: 2.5rem; height: 2.5rem; border-radius: 50%;
    background: var(--team-color); color: var(--team-badge-text); font-weight: 800; font-size: .95rem;
  }
  .standing-detail { font-size: .85rem; line-height: 1.4; }

  .result-row, .upcoming-row {
    display: flex; align-items: center; gap: .6rem; flex-wrap: wrap;
    padding: .4rem .5rem; margin-bottom: .3rem;
    border-radius: 6px; font-size: .85rem;
    background: rgba(255,255,255,0.04);
    border-left: 4px solid transparent;
  }
  .result-row.win { border-left-color: var(--win); }
  .result-row.loss { border-left-color: var(--loss); }
  .result-row.draw { border-left-color: var(--draw); }
  .result-row.rivalry, .upcoming-row.rivalry { background: rgba(234,179,8,0.12); }
  .result-badge {
    flex: none; width: 1.5rem; height: 1.5rem; border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: .75rem; color: #fff;
  }
  .win .result-badge { background: var(--win); }
  .loss .result-badge { background: var(--loss); }
  .draw .result-badge { background: var(--draw); }
  .result-date { flex: none; color: var(--muted); width: 5.5rem; }
  .result-matchup { flex: 1; font-weight: 600; }
  .result-score { flex: none; font-weight: 800; font-variant-numeric: tabular-nums; }
  .upcoming-row .result-date { width: 5.5rem; }
  .upcoming-time { flex: none; color: var(--muted); font-size: .78rem; }
  .rivalry-tag { color: #eab308; font-weight: 700; font-size: .75rem; margin-left: .35rem; }
  .away-marker { color: #ffffff; font-weight: 800; }
  .comp-tag {
    font-size: .68rem; font-weight: 600; text-transform: uppercase; letter-spacing: .03em;
    color: var(--muted); background: rgba(255,255,255,0.08); border-radius: 4px;
    padding: .05rem .4rem; margin-left: .35rem;
  }
  .upcoming-time.tbd { font-style: italic; }
  .cal-link {
    flex: none; display: flex; align-items: center; justify-content: center; width: 1.6rem; height: 1.6rem;
    color: var(--muted); border-radius: 4px; transition: color .15s, background .15s;
  }
  .cal-link:hover, .cal-link:focus-visible { color: #fff; background: rgba(255,255,255,0.1); }
  .form { display: flex; gap: .25rem; margin-top: .6rem; }
  .form-dot {
    width: 1.15rem; height: 1.15rem; border-radius: 3px;
    display: flex; align-items: center; justify-content: center;
    font-size: .62rem; font-weight: 800; color: #fff;
  }
  .form-dot.win { background: var(--win); }
  .form-dot.loss { background: var(--loss); }
  .form-dot.draw { background: var(--draw); }
  .card h3.live-title { color: var(--loss); }
  .live-row {
    display: flex; align-items: center; gap: .6rem; flex-wrap: wrap;
    padding: .4rem .5rem; margin-bottom: .3rem;
    border-radius: 6px; font-size: .85rem;
    background: rgba(239,68,68,0.12);
    border-left: 4px solid var(--loss);
  }
  .live-badge {
    flex: none; font-size: .62rem; font-weight: 800; letter-spacing: .05em;
    color: #fff; background: var(--loss); border-radius: 4px; padding: .15rem .35rem;
    animation: live-blink 1.6s infinite;
  }
  .live-clock { flex: none; color: var(--muted); font-size: .78rem; }
  .countdown.live { color: #fff; background: var(--loss); animation: live-blink 1.6s infinite; }
  @keyframes live-blink { 50% { opacity: .55; } }
  .site-footer {
    max-width: 1500px; margin: 3rem auto 0; padding: 1.5rem 1rem 0;
    border-top: 1px solid var(--card-border); text-align: center; color: var(--muted); font-size: .78rem; line-height: 1.6;
  }
  .site-footer p { margin: 0 0 .35rem; }
  .site-footer a { color: var(--text); text-decoration: underline; text-underline-offset: 2px; }
  .agenda {
    max-width: 1500px; margin: 0 auto 1.25rem; padding: 1rem 1.1rem;
    background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px;
  }
  .agenda h2 { margin: 0 0 .25rem; font-size: 1rem; font-weight: 800; }
  .agenda h3 { font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: .9rem 0 .4rem; font-weight: 700; }
  .agenda-row {
    display: flex; align-items: center; gap: .6rem; padding: .4rem .5rem; margin-bottom: .3rem;
    border-radius: 6px; font-size: .85rem; color: var(--text); text-decoration: none;
    background: rgba(255,255,255,0.04); border-left: 4px solid var(--team-color);
  }
  .agenda-row:hover { background: rgba(255,255,255,0.08); }
  .agenda-meta { display: contents; }
  .agenda-time { order: -1; flex: none; width: 4.6rem; color: var(--muted); font-size: .78rem; }
  .agenda-time.tbd { font-style: italic; }
  .agenda-logo { flex: none; width: 22px; height: 22px; object-fit: contain; }
  .agenda-match { flex: 1; min-width: 0; }
  .agenda-match strong { font-weight: 700; }
  .agenda-empty { margin: 0; font-size: .78rem; color: var(--muted); font-style: italic; }
  /* En escritorio la semana se ve como calendario: una columna por dia. */
  @media (min-width: 601px) {
    .agenda-days { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: .75rem; margin-top: .6rem; }
    .agenda-day { padding: .6rem; border-radius: 8px; background: rgba(255,255,255,0.03); }
    .agenda .agenda-day h3 { margin: 0 0 .5rem; }
    .agenda-row { display: grid; grid-template-columns: 22px 1fr; column-gap: .5rem; row-gap: .2rem; align-items: center; }
    .agenda-logo { grid-row: 1 / span 2; }
    .agenda-meta { display: flex; align-items: center; gap: .4rem; grid-column: 2; }
    .agenda-time { width: auto; }
    .agenda-meta .comp-tag { margin-left: 0; }
    .agenda-team, .agenda-rival { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .agenda-logo { align-self: start; margin-top: .1rem; }
  }
  @media (min-width: 1100px) {
    .agenda-days { grid-template-columns: repeat(7, minmax(0, 1fr)); gap: .5rem; }
  }
  .card-toggle { display: none; }
  /* En movil cada tarjeta muestra solo su encabezado; el resto aparece al tocarla. */
  @media (max-width: 600px) {
    .card { cursor: pointer; }
    .card .logo { width: 64px; height: 64px; }
    .card-header h2 { font-size: 1.05rem; }
    .card:not(.expanded) > :not(.card-header):not(.status-dot) { display: none; }
    .card:not(.expanded) .card-header { margin-bottom: -1.1rem; border-radius: 7px; }
    .card-toggle {
      display: block; margin: .9rem auto 0; font-family: inherit; font-size: .75rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: .04em; color: var(--muted);
      background: none; border: 1px solid var(--card-border); border-radius: 999px; padding: .35rem 1rem; cursor: pointer;
    }
  }
  @media (max-width: 480px) {
    h1 { padding: 0 .75rem; }
    .ticker-track { animation-duration: 110s; }
  }
</style>
</head>
<body>
  ${tickerHtml}
  <h1>
    <span class="brand">
      <span class="brand-main">STRICKEOUT</span>
      <span class="brand-sub">@RicardoHdzm</span>
    </span>
  </h1>
  <p class="updated">Actualizado: ${updatedAt}</p>
  <div class="sort-bar">
    <button class="sort-btn active" data-sort="deporte">Deporte</button>
    <button class="sort-btn" data-sort="reciente">Más reciente</button>
  </div>
  ${renderAgenda(teamData)}
  <div class="grid" id="grid">
    ${cards.join("\n")}
  </div>
  <footer class="site-footer">
    <p>&copy; ${now.getFullYear()} STRICKEOUT &middot; @RicardoHdzm &middot; Uso Personal</p>
    <p>Datos: <a href="https://www.espn.com" target="_blank" rel="noopener">ESPN</a> y <a href="https://www.thesportsdb.com" target="_blank" rel="noopener">TheSportsDB</a></p>
  </footer>
  <script>
    (function () {
      var els = document.querySelectorAll(".countdown");
      if (!els.length) return;
      function update() {
        els.forEach(function (el) {
          if (!el.dataset.target) return;
          var diff = Number(el.dataset.target) - Date.now();
          if (diff <= 0) {
            el.textContent = "¡Es hoy!";
            return;
          }
          var days = Math.floor(diff / 86400000);
          var hours = Math.floor((diff % 86400000) / 3600000);
          el.textContent = "Faltan " + days + "d " + hours + "h";
        });
      }
      update();
      setInterval(update, 60000);
    })();
  </script>
  <script>
    (function () {
      var grid = document.getElementById("grid");
      var buttons = document.querySelectorAll(".sort-btn");
      function sortBy(mode) {
        var items = Array.prototype.slice.call(grid.children);
        items.sort(function (a, b) {
          if (mode === "reciente") {
            return Number(b.dataset.updated) - Number(a.dataset.updated);
          }
          return Number(a.dataset.order) - Number(b.dataset.order);
        });
        items.forEach(function (item) { grid.appendChild(item); });
      }
      buttons.forEach(function (btn) {
        btn.addEventListener("click", function () {
          buttons.forEach(function (b) { b.classList.remove("active"); });
          btn.classList.add("active");
          sortBy(btn.dataset.sort);
        });
      });
    })();
  </script>
  <script>
    (function () {
      var mobile = window.matchMedia("(max-width: 600px)");
      document.getElementById("grid").addEventListener("click", function (e) {
        var card = e.target.closest(".card");
        if (!card || !mobile.matches) return;
        if (e.target.closest("a")) return;
        var expanded = card.classList.toggle("expanded");
        var btn = card.querySelector(".card-toggle");
        btn.textContent = expanded ? "Ver menos" : "Ver más";
        btn.setAttribute("aria-expanded", String(expanded));
      });
    })();
  </script>
</body>
</html>`;

  const fs = await import("node:fs/promises");
  // Solo GitHub Actions publica en docs/; localmente se genera en preview/ (ignorada por git)
  // para no chocar con los commits automaticos del bot.
  const outDir = process.env.GITHUB_ACTIONS ? "docs" : "preview";
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(`${outDir}/index.html`, html, "utf8");
  await fs.cp("assets/teams", `${outDir}/assets/teams`, { recursive: true });
  await fs.cp("assets/favicon", `${outDir}/assets/favicon`, { recursive: true });
  console.log(`${outDir}/index.html y assets generados.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
