"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

type Position = "ARQ" | "DEF" | "MED" | "DEL"

type Group = { id: string; name: string }
type Player = { id: string; name: string; groups: string[]; positions: Position[]; active: boolean }
type Skill = { id: string; label: string; weight: number }
type Evaluation = { id: string; playerId: string; groupId: string; month: string; scores: Record<string, number>; updatedAt: string; raterIp?: string }
type TeamPlayer = { player: Player; rating: number }
type GeneratedTeams = { teamA: TeamPlayer[]; teamB: TeamPlayer[]; totalA: number; totalB: number; averageA: number; averageB: number }

type PlayerForm = {
  name: string
  positions: Position[]
  groups: string[]
}

const POSITIONS: Position[] = ["ARQ", "DEF", "MED", "DEL"]

const SKILLS: Skill[] = [
  { id: "tecnica", label: "Tecnica", weight: 15 },
  { id: "pase", label: "Pase", weight: 12 },
  { id: "marca", label: "Marca", weight: 12 },
  { id: "velocidad", label: "Velocidad", weight: 10 },
  { id: "resistencia", label: "Resistencia", weight: 10 },
  { id: "definicion", label: "Definicion", weight: 12 },
  { id: "vision", label: "Vision", weight: 10 },
  { id: "arquero", label: "Arquero", weight: 6 },
  { id: "actitud", label: "Actitud", weight: 8 },
  { id: "fisico", label: "Fisico", weight: 5 },
]

const blankPlayerForm = (): PlayerForm => ({ name: "", positions: [], groups: [] })

const GROUP_PARAM = "grupo"
const PLAYER_PARAM = "jugador"

function readUrlParams() {
  if (typeof window === "undefined") return { groupId: "", playerId: "" }
  const params = new URLSearchParams(window.location.search)
  return { groupId: params.get(GROUP_PARAM) || "", playerId: params.get(PLAYER_PARAM) || "" }
}

function buildPath(groupId: string, playerId?: string) {
  const params = new URLSearchParams()
  params.set(GROUP_PARAM, groupId)
  if (playerId) params.set(PLAYER_PARAM, playerId)
  return `${window.location.pathname}?${params.toString()}`
}

function buildShareUrl(groupId: string, playerId?: string) {
  return `${window.location.origin}${buildPath(groupId, playerId)}`
}

async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // sigue con el fallback
  }

  try {
    const area = document.createElement("textarea")
    area.value = text
    area.style.position = "fixed"
    area.style.opacity = "0"
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

function makeId(value: string) {
  const base = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return base || crypto.randomUUID().slice(0, 8)
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-")
  return `${monthNumber}/${year}`
}

function emptyScores() {
  return Object.fromEntries(SKILLS.map((skill) => [skill.id, 3])) as Record<string, number>
}

function round(value: number) {
  return Math.round(value * 10) / 10
}

function median(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b)
  const middle = Math.floor(ordered.length / 2)

  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}

function normalizeSkillValues(values: number[]) {
  if (values.length < 3) return values

  const center = median(values)
  const min = center - 1
  const max = center + 1

  return values.map((value) => Math.min(Math.max(value, min), max))
}

function getRating(scores: Record<string, number>) {
  const totalWeight = SKILLS.reduce((sum, skill) => sum + skill.weight, 0)
  const weightedTotal = SKILLS.reduce((sum, skill) => sum + (scores[skill.id] || 0) * skill.weight, 0)
  return totalWeight ? round((weightedTotal / totalWeight) * 20) : 0
}

function getAverageScores(items: Evaluation[]) {
  if (!items.length) return null

  return Object.fromEntries(SKILLS.map((skill) => {
    const values = normalizeSkillValues(items.map((evaluation) => evaluation.scores[skill.id] || 0))
    const total = values.reduce((sum, value) => sum + value, 0)
    return [skill.id, round(total / values.length)]
  })) as Record<string, number>
}

function ratingColor(value: number) {
  if (value >= 84) return "#16a34a"
  if (value >= 66) return "#d97706"
  if (value > 0) return "#e11d48"
  return "#64748b"
}

function latestPlayerEvaluation(playerId: string, evaluations: Evaluation[]) {
  return evaluations
    .filter((evaluation) => evaluation.playerId === playerId)
    .sort((a, b) => b.month.localeCompare(a.month) || b.updatedAt.localeCompare(a.updatedAt))[0]
}

function latestPlayerRating(playerId: string, evaluations: Evaluation[]) {
  const averageScores = getAverageScores(evaluations.filter((evaluation) => evaluation.playerId === playerId))

  return averageScores ? getRating(averageScores) : 50
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5)
}

function positionPenalty(team: TeamPlayer[], player: TeamPlayer) {
  return player.player.positions.reduce((sum, position) => {
    const repeated = team.filter((item) => item.player.positions.includes(position)).length
    return sum + repeated * (position === "ARQ" ? 20 : 5)
  }, 0)
}

function buildRandomTeams(players: Player[], evaluations: Evaluation[], groupId: string, playersPerTeam: number): GeneratedTeams | null {
  const selected = shuffle(players).slice(0, playersPerTeam * 2)
  if (selected.length < 4) return null

  const teamSizeA = playersPerTeam
  const teamSizeB = playersPerTeam
  const ordered = shuffle(selected)
    .map((player) => ({ player, rating: latestPlayerRating(player.id, evaluations) }))
    .sort((a, b) => b.rating - a.rating)
  const teamA: TeamPlayer[] = []
  const teamB: TeamPlayer[] = []

  ordered.forEach((item) => {
    const totalA = teamA.reduce((sum, current) => sum + current.rating, 0)
    const totalB = teamB.reduce((sum, current) => sum + current.rating, 0)
    const scoreA = teamA.length >= teamSizeA ? Infinity : Math.abs(totalA + item.rating - totalB) + positionPenalty(teamA, item)
    const scoreB = teamB.length >= teamSizeB ? Infinity : Math.abs(totalB + item.rating - totalA) + positionPenalty(teamB, item)

    if (scoreA <= scoreB) teamA.push(item)
    else teamB.push(item)
  })

  const totalA = teamA.reduce((sum, item) => sum + item.rating, 0)
  const totalB = teamB.reduce((sum, item) => sum + item.rating, 0)

  return {
    teamA,
    teamB,
    totalA: round(totalA),
    totalB: round(totalB),
    averageA: round(totalA / teamA.length),
    averageB: round(totalB / teamB.length),
  }
}

async function persist(type: "group" | "player" | "evaluation", action: "upsert" | "delete", data: { id: string } & Record<string, unknown>) {
  const response = await fetch("/api/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, action, data }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Error desconocido" }))
    throw new Error(body.error || "No se pudo guardar en la base de datos")
  }
}

export default function Home() {
  const [groups, setGroups] = useState<Group[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [groupId, setGroupId] = useState("")
  const [selectedPlayerId, setSelectedPlayerId] = useState("")
  const [scores, setScores] = useState<Record<string, number>>(emptyScores)
  const [search, setSearch] = useState("")
  const [groupForm, setGroupForm] = useState("")
  const [editingGroupId, setEditingGroupId] = useState("")
  const [playerForm, setPlayerForm] = useState<PlayerForm>(blankPlayerForm)
  const [editingPlayerId, setEditingPlayerId] = useState("")
  const [savedMessage, setSavedMessage] = useState("")
  const [screen, setScreen] = useState<"home" | "group" | "player">("home")
  const [playersPerTeam, setPlayersPerTeam] = useState(5)
  const [selectedTeamPlayerIds, setSelectedTeamPlayerIds] = useState<string[]>([])
  const [generatedTeams, setGeneratedTeams] = useState<GeneratedTeams | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [syncError, setSyncError] = useState("")
  const [invalidGroupLink, setInvalidGroupLink] = useState("")
  const [copiedLink, setCopiedLink] = useState(false)

  const month = currentMonth()
  const group = groups.find((item) => item.id === groupId) || groups[0]
  const groupPlayers = useMemo(() => players.filter((player) => player.groups.includes(groupId)), [players, groupId])
  const filteredPlayers = groupPlayers.filter((player) => {
    const query = search.trim().toLowerCase()
    return player.name.toLowerCase().includes(query)
  })
  const selectedPlayer = groupPlayers.find((player) => player.id === selectedPlayerId)
  const playerEvaluations = evaluations.filter((evaluation) => evaluation.playerId === selectedPlayer?.id)
  const classificationCount = playerEvaluations.length
  const averageScores = getAverageScores(playerEvaluations)
  const latestEvaluation = selectedPlayer ? latestPlayerEvaluation(selectedPlayer.id, evaluations) : undefined
  const currentRating = averageScores ? getRating(averageScores) : 0
  const formRating = useMemo(() => getRating(scores), [scores])
  const ranking = useMemo(() => {
    return groupPlayers
      .map((player) => {
        const count = evaluations.filter((evaluation) => evaluation.playerId === player.id).length
        const latest = latestPlayerEvaluation(player.id, evaluations)
        const average = getAverageScores(evaluations.filter((evaluation) => evaluation.playerId === player.id))
        return { player, rating: average ? getRating(average) : 0, month: latest?.month || "", groupId: latest?.groupId || "", count }
      })
      .sort((a, b) => b.rating - a.rating || a.player.name.localeCompare(b.player.name))
  }, [evaluations, groupId, groupPlayers])
  const playerHistory = useMemo(() => {
    return [...playerEvaluations]
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .map((evaluation, index) => ({
        evaluation,
        index: index + 1,
        rating: getRating(evaluation.scores),
        groupName: groups.find((item) => item.id === evaluation.groupId)?.name || "Grupo borrado",
      }))
  }, [playerEvaluations, groups])
  const historyBest = playerHistory.length ? Math.max(...playerHistory.map((item) => item.rating)) : 0
  const historyWorst = playerHistory.length ? Math.min(...playerHistory.map((item) => item.rating)) : 0
  const selectedTeamPlayers = groupPlayers.filter((player) => selectedTeamPlayerIds.includes(player.id))
  const teamOptions = Array.from({ length: Math.max(Math.floor(groupPlayers.length / 2) - 1, 0) }, (_, index) => index + 2)
  const effectivePlayersPerTeam = Math.min(playersPerTeam, Math.max(Math.floor(groupPlayers.length / 2), 2))

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const response = await fetch("/api/data", { cache: "no-store" })
        const data = (await response.json()) as { groups: Group[]; players: Player[]; evaluations: Evaluation[]; error?: string }
        if (!response.ok) throw new Error(data.error || "No se pudo leer la base de datos")

        if (cancelled) return

        setGroups(data.groups || [])
        setPlayers(data.players || [])
        setEvaluations(data.evaluations || [])
        setSyncError("")
      } catch (error) {
        if (!cancelled) setSyncError((error as Error).message)
      } finally {
        if (!cancelled) setHydrated(true)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  const applyUrl = useCallback((replace = false) => {
    const { groupId: urlGroupId, playerId: urlPlayerId } = readUrlParams()

    if (!urlGroupId) {
      setScreen("home")
      return
    }

    if (!groups.some((item) => item.id === urlGroupId)) {
      setInvalidGroupLink(urlGroupId)
      setScreen("home")
      if (replace) window.history.replaceState({}, "", window.location.pathname)
      return
    }

    setGroupId(urlGroupId)
    setInvalidGroupLink("")

    const playerExists = urlPlayerId && players.some(
      (player) => player.id === urlPlayerId && player.groups.includes(urlGroupId),
    )

    if (playerExists) {
      setSelectedPlayerId(urlPlayerId)
      setScreen("player")
    } else {
      setScreen("group")
      if (urlPlayerId && replace) window.history.replaceState({}, "", buildPath(urlGroupId))
    }
  }, [groups, players])

  useEffect(() => {
    if (!hydrated) return
    if (!readUrlParams().groupId) return
    applyUrl(true)
  }, [hydrated, applyUrl])

  useEffect(() => {
    function handlePopState() {
      applyUrl(false)
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [applyUrl])

  useEffect(() => {
    if (screen === "player" && selectedPlayer) document.title = `${selectedPlayer.name} · Futbol Amateur`
    else if (screen === "group" && group) document.title = `${group.name} · Futbol Amateur`
    else document.title = "Futbol Amateur"
  }, [screen, group, selectedPlayer])

  useEffect(() => {
    if (screen === "home") return
    if (!groups.length) return

    if (!groups.some((item) => item.id === groupId)) {
      setScreen("home")
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [groups, groupId, screen])

  useEffect(() => {
    if (screen !== "player") return
    if (!groupPlayers.length) return

    if (!groupPlayers.some((player) => player.id === selectedPlayerId)) {
      setScreen("group")
      window.history.replaceState({}, "", buildPath(groupId))
    }
  }, [groupPlayers, selectedPlayerId, screen, groupId])

  useEffect(() => {
    setScores(latestEvaluation?.scores || emptyScores())
    setSavedMessage("")
  }, [latestEvaluation?.id, selectedPlayer?.id, groupId])

  useEffect(() => {
    if (groupPlayers.length < 4) {
      setGeneratedTeams(null)
      return
    }

    setSelectedTeamPlayerIds(groupPlayers.map((player) => player.id))
    setPlayersPerTeam((current) => Math.min(Math.max(current, 2), Math.floor(groupPlayers.length / 2)))
    setGeneratedTeams(null)
  }, [groupId, groupPlayers.length])

  useEffect(() => {
    if (selectedTeamPlayers.length < 4) {
      setGeneratedTeams(null)
      return
    }

    setPlayersPerTeam(Math.floor(selectedTeamPlayers.length / 2))
    setGeneratedTeams(null)
  }, [selectedTeamPlayers.length])

  async function saveGroup() {
    const name = groupForm.trim()
    if (!name) return

    const nextGroup: Group = editingGroupId
      ? { id: editingGroupId, name }
      : { id: groups.some((item) => item.id === makeId(name)) ? `${makeId(name)}-${Date.now()}` : makeId(name), name }

    setGroups((current) => (
      current.some((item) => item.id === nextGroup.id)
        ? current.map((item) => (item.id === nextGroup.id ? nextGroup : item))
        : [...current, nextGroup]
    ))
    setGroupForm("")
    setEditingGroupId("")

    try {
      await persist("group", "upsert", nextGroup)
      setSyncError("")
    } catch (error) {
      setSyncError((error as Error).message)
    }
  }

  function editGroup(item: Group) {
    setGroupForm(item.name)
    setEditingGroupId(item.id)
  }

  async function deleteGroup(id: string) {
    setGroups((current) => current.filter((item) => item.id !== id))
    setPlayers((current) => current.map((player) => ({ ...player, groups: player.groups.filter((item) => item !== id) })))
    setEvaluations((current) => current.filter((evaluation) => evaluation.groupId !== id))

    try {
      await persist("group", "delete", { id })
      setSyncError("")
    } catch (error) {
      setSyncError((error as Error).message)
    }
  }

  async function savePlayer() {
    const name = playerForm.name.trim().toUpperCase()
    if (!name) return

    const baseId = makeId(name)
    const nextPlayer: Player = {
      id: editingPlayerId || (players.some((player) => player.id === baseId) ? `${baseId}-${Date.now()}` : baseId),
      name,
      positions: playerForm.positions,
      groups: playerForm.groups,
      active: true,
    }

    setPlayers((current) => (
      current.some((player) => player.id === nextPlayer.id)
        ? current.map((player) => (player.id === nextPlayer.id ? { ...player, ...nextPlayer } : player))
        : [...current, nextPlayer]
    ))
    setPlayerForm(blankPlayerForm())
    setEditingPlayerId("")

    try {
      await persist("player", "upsert", nextPlayer)
      setSyncError("")
    } catch (error) {
      setSyncError((error as Error).message)
    }
  }

  function editPlayer(player: Player) {
    setPlayerForm({ name: player.name, positions: player.positions, groups: player.groups })
    setEditingPlayerId(player.id)
  }

  async function deletePlayer(id: string) {
    setPlayers((current) => current.filter((player) => player.id !== id))
    setEvaluations((current) => current.filter((evaluation) => evaluation.playerId !== id))

    try {
      await persist("player", "delete", { id })
      setSyncError("")
    } catch (error) {
      setSyncError((error as Error).message)
    }
  }

  function togglePlayerGroup(id: string) {
    setPlayerForm((current) => ({
      ...current,
      groups: current.groups.includes(id) ? current.groups.filter((item) => item !== id) : [...current.groups, id],
    }))
  }

  function togglePlayerPosition(position: Position) {
    setPlayerForm((current) => ({
      ...current,
      positions: current.positions.includes(position) ? current.positions.filter((item) => item !== position) : [...current.positions, position],
    }))
  }

  async function saveEvaluation() {
    if (!selectedPlayer || !group) return

    const evaluation: Evaluation = {
      id: `${group.id}-${selectedPlayer.id}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      playerId: selectedPlayer.id,
      groupId: group.id,
      month,
      scores,
      updatedAt: new Date().toISOString(),
    }

    setEvaluations((current) => [...current, evaluation])
    setScores(emptyScores())
    setSavedMessage(`Nueva clasificacion guardada · ${formatMonth(month)}`)

    try {
      await persist("evaluation", "upsert", evaluation)
      setSyncError("")
    } catch (error) {
      setEvaluations((current) => current.filter((item) => item.id !== evaluation.id))
      setSyncError((error as Error).message)
      setSavedMessage("")
    }
  }

  function openGroup(id: string) {
    setGroupId(id)
    setSearch("")
    setGeneratedTeams(null)
    setScreen("group")
    setInvalidGroupLink("")
    setCopiedLink(false)
    window.history.pushState({}, "", buildPath(id))
  }

  function openPlayer(id: string) {
    setSelectedPlayerId(id)
    setScreen("player")
    setCopiedLink(false)
    setSavedMessage("")
    window.history.pushState({}, "", buildPath(groupId, id))
    window.scrollTo({ top: 0 })
  }

  function backToGroup() {
    setScreen("group")
    setCopiedLink(false)
    window.history.pushState({}, "", buildPath(groupId))
  }

  function goHome() {
    setScreen("home")
    setSearch("")
    setCopiedLink(false)
    window.history.pushState({}, "", window.location.pathname)
  }

  async function copyCurrentLink() {
    if (!group) return

    const url = screen === "player" && selectedPlayer
      ? buildShareUrl(group.id, selectedPlayer.id)
      : buildShareUrl(group.id)

    const ok = await copyToClipboard(url)
    if (ok) {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2500)
    } else {
      setSyncError("No se pudo copiar el link automaticamente. Copialo desde la barra del navegador")
    }
  }

  function generateTeams() {
    setGeneratedTeams(buildRandomTeams(selectedTeamPlayers, evaluations, groupId, effectivePlayersPerTeam))
  }

  function toggleTeamPlayer(id: string) {
    setSelectedTeamPlayerIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
    setGeneratedTeams(null)
  }

  return (
    <main>
      <style>{`
        * { box-sizing: border-box; }
        :root {
          --ink: #12150f;
          --ink-soft: #6a7265;
          --line: #e6e8df;
          --surface: #ffffff;
          --bg: #f4f5f0;
          --accent: #1f7a4d;
          --accent-soft: #edf6f0;
          --radius: 24px;
          --shadow-sm: 0 2px 8px rgba(18, 21, 15, .04);
          --shadow-md: 0 12px 32px rgba(18, 21, 15, .07);
          --shadow-lg: 0 28px 64px rgba(18, 21, 15, .1);
        }
        body { margin: 0; background: var(--bg); color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
        body:before { content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 0; background: radial-gradient(60% 45% at 12% 0%, rgba(31, 122, 77, .10), transparent 70%), radial-gradient(45% 40% at 96% 8%, rgba(234, 179, 8, .10), transparent 70%); }
        button, input, select { font: inherit; }
        button { -webkit-tap-highlight-color: transparent; }
        main { position: relative; z-index: 1; min-height: 100vh; padding: 32px 24px 56px; }
        .shell { max-width: 1280px; margin: 0 auto; }
        .landing { min-height: calc(100vh - 88px); max-width: 1080px; margin: 0 auto; display: grid; align-content: center; gap: 32px; }
        .landing-hero { display: grid; gap: 16px; max-width: 780px; }
        .landing-hero h1 { font-size: clamp(52px, 10vw, 112px); letter-spacing: -.055em; }
        .landing-hero p { font-size: 19px; line-height: 1.5; max-width: 620px; margin: 0; }
        .group-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
        .group-card { position: relative; overflow: hidden; border: 1px solid var(--line); border-radius: 28px; background: var(--surface); color: var(--ink); padding: 24px; min-height: 186px; cursor: pointer; text-align: left; box-shadow: var(--shadow-md); display: flex; flex-direction: column; justify-content: space-between; gap: 22px; transition: transform .2s cubic-bezier(.2,.7,.3,1), box-shadow .2s, border-color .2s; }
        .group-card:before { content: ""; position: absolute; inset: auto -30% -55% auto; width: 190px; height: 190px; border-radius: 50%; background: var(--accent-soft); transition: transform .25s; }
        .group-card > * { position: relative; }
        .group-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); border-color: rgba(18, 21, 15, .35); }
        .group-card:hover:before { transform: scale(1.25); }
        .group-card strong { display: block; font-size: 34px; letter-spacing: -.03em; margin-top: 6px; }
        .group-card small { color: var(--ink-soft); font-weight: 700; }
        .top-actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: flex-end; }
        .hero { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin-bottom: 22px; }
        .hero h1 { letter-spacing: -.045em; }
        .hero p { margin: 10px 0 0; max-width: 620px; line-height: 1.5; }
        .summary { display: flex; gap: 8px; flex-wrap: wrap; }
        .summary span { border: 1px solid var(--line); background: var(--surface); border-radius: 999px; padding: 9px 14px; color: var(--ink-soft); font-size: 13px; font-weight: 700; box-shadow: var(--shadow-sm); }
        .app { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 18px; align-items: start; }
        .card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 22px; box-shadow: var(--shadow-md); }
        .card-head { display: flex; justify-content: space-between; align-items: end; gap: 16px; margin-bottom: 18px; }
        .search-inline { max-width: 320px; margin-bottom: 0; }
        .sidebar { position: sticky; top: 20px; align-self: start; max-height: calc(100vh - 40px); overflow: auto; }
        .sidebar::-webkit-scrollbar { width: 6px; }
        .sidebar::-webkit-scrollbar-thumb { background: #dfe3d9; border-radius: 999px; }
        h1, h2, h3 { margin: 0; line-height: 1.04; letter-spacing: -.03em; }
        h1 { font-size: clamp(34px, 5vw, 60px); }
        h2 { font-size: clamp(32px, 5vw, 52px); }
        h3 { font-size: 13px; font-weight: 850; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-soft); margin: 28px 0 14px; padding-top: 18px; border-top: 1px solid var(--line); }
        .card h1 { font-size: 22px; letter-spacing: -.02em; }
        .card h2 { font-size: clamp(30px, 4vw, 42px); }
        .card > h1 + .field-label, .card > h1 + p { margin-top: 10px; }
        .card > .field-label + h2 { margin-top: 2px; }
        .muted { color: var(--ink-soft); line-height: 1.5; }
        .field-label { display: block; color: var(--ink-soft); font-size: 11px; font-weight: 850; letter-spacing: .14em; text-transform: uppercase; margin: 0 0 8px; }
        .input { width: 100%; border: 1px solid var(--line); border-radius: 14px; background: #fafbf7; padding: 13px 15px; outline: none; margin-bottom: 12px; transition: border-color .15s, box-shadow .15s, background .15s; }
        .input:focus { background: var(--surface); border-color: var(--ink); box-shadow: 0 0 0 4px rgba(18, 21, 15, .07); }
        .players, .ranking, .form, .current, .admin-list, .checks { display: grid; gap: 8px; }
        .player, .rank-row, .admin-row { width: 100%; border: 1px solid transparent; border-radius: 16px; background: #fafbf7; color: var(--ink); padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; text-align: left; transition: transform .18s cubic-bezier(.2,.7,.3,1), border-color .18s, box-shadow .18s, background .18s; }
        .player { cursor: pointer; }
        .player:hover { background: var(--surface); border-color: var(--line); box-shadow: var(--shadow-sm); transform: translateX(2px); }
        .player.active { background: var(--ink); color: #fff; border-color: var(--ink); box-shadow: var(--shadow-md); }
        .player strong, .rank-row strong, .admin-row strong { font-size: 16px; letter-spacing: -.01em; }
        .player small, .rank-row small, .admin-row small { display: block; color: var(--ink-soft); font-size: 12.5px; margin-top: 3px; line-height: 1.35; }
        .player.active small { color: rgba(255,255,255,.65); }
        .player > span:last-child { font-weight: 850; font-variant-numeric: tabular-nums; }
        .layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; align-items: start; }
        .stack { display: grid; gap: 18px; min-width: 0; }
        .admin { display: grid; grid-template-columns: 1fr 1.35fr; gap: 26px; margin-top: 22px; padding-top: 22px; border-top: 1px solid var(--line); }
        .admin-panel { min-width: 0; }
        .admin-shell { margin-top: 4px; }
        .admin-shell summary { cursor: pointer; list-style: none; font-size: 13px; font-weight: 850; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-soft); display: flex; justify-content: space-between; align-items: center; }
        .admin-shell summary::-webkit-details-marker { display: none; }
        .admin-shell summary:after { content: "+"; width: 30px; height: 30px; border-radius: 50%; background: #f1f3ec; color: var(--ink); font-size: 17px; display: grid; place-items: center; transition: background .15s; }
        .admin-shell summary:hover:after { background: var(--ink); color: #fff; }
        .admin-shell[open] summary:after { content: "−"; }
        .admin-row { background: #fafbf7; }
        .profile-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
        .rating { width: 110px; height: 110px; flex: 0 0 auto; border-radius: 26px; color: #fff; display: grid; place-items: center; font-size: 40px; font-weight: 850; font-variant-numeric: tabular-nums; letter-spacing: -.04em; box-shadow: inset 0 -20px 36px rgba(0,0,0,.14); }
        .pills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
        .pill { display: inline-flex; border-radius: 8px; background: #f1f3ec; color: #4a5246; padding: 7px 10px; font-size: 12px; font-weight: 750; }
        .skill-current, .rate-row { display: grid; grid-template-columns: 150px minmax(0, 1fr) 40px; align-items: center; gap: 14px; }
        .skill-current { padding: 9px 2px; border-bottom: 1px solid #f0f2ec; }
        .skill-current:last-child { border-bottom: 0; }
        .skill-name { display: grid; gap: 2px; font-size: 15px; }
        .skill-name small { color: var(--ink-soft); font-size: 11px; font-weight: 800; letter-spacing: .04em; }
        .bar { height: 8px; border-radius: 999px; background: #eceee6; overflow: hidden; }
        .bar span { display: block; height: 100%; background: linear-gradient(90deg, var(--ink), var(--accent)); border-radius: 999px; transition: width .35s cubic-bezier(.2,.7,.3,1); }
        .skill-current > span:last-child, .rate-row > span:last-child { text-align: right; font-weight: 850; font-variant-numeric: tabular-nums; }
        .rate-row { border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; background: #fafbf7; transition: border-color .15s, background .15s; }
        .rate-row:hover { background: var(--surface); border-color: #d9ded1; }
        .stars { display: flex; gap: 2px; justify-content: center; }
        .stars button { border: 0; background: transparent; color: #d8dccf; font-size: 26px; padding: 4px 3px; cursor: pointer; line-height: 1; transition: transform .12s, color .12s; }
        .stars button:hover { transform: scale(1.15); color: #f0c94a; }
        .stars button.on { color: #eab308; }
        .primary, .secondary, .danger { border: 0; border-radius: 14px; padding: 12px 16px; font-size: 14px; font-weight: 800; cursor: pointer; transition: transform .15s, opacity .15s, box-shadow .15s; }
        .primary:hover:not(:disabled), .secondary:hover:not(:disabled), .danger:hover:not(:disabled) { transform: translateY(-1px); }
        .primary:disabled, .secondary:disabled, .danger:disabled { opacity: .4; cursor: not-allowed; }
        .primary { width: 100%; background: var(--ink); color: #fff; margin-top: 18px; box-shadow: var(--shadow-md); }
        .primary:hover:not(:disabled) { box-shadow: var(--shadow-lg); }
        .secondary { background: #f1f3ec; color: var(--ink); }
        .secondary:hover:not(:disabled) { background: #e7eae1; }
        .secondary.dark { background: var(--ink); color: #fff; box-shadow: var(--shadow-sm); }
        .danger { background: #fdf1f2; color: #b4324a; }
        .actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
        .actions button { padding: 8px 12px; font-size: 13px; border-radius: 10px; }
        .saved { color: #15653c; background: var(--accent-soft); border: 1px solid #c9e5d5; border-radius: 14px; padding: 12px; font-weight: 800; text-align: center; margin: 12px 0 0; }
        .error { color: #b4324a; background: #fdf1f2; border: 1px solid #f3d3d8; border-radius: 14px; padding: 12px 14px; font-weight: 750; margin: 0; }
        .warning { color: #8a6116; background: #fdf7e7; border: 1px solid #f0e2bd; border-radius: 14px; padding: 12px 14px; font-weight: 750; margin: 0; }
        .secondary.ok { background: var(--accent-soft); color: #15653c; }
        .empty-state { border: 1px dashed #cdd4c4; border-radius: var(--radius); background: rgba(255,255,255,.6); padding: 32px 26px; text-align: center; }
        .empty-state h2 { font-size: 28px; margin-bottom: 10px; }
        .empty-state p { margin: 0 auto; max-width: 460px; }
        .rank-row { counter-increment: rank; }
        .rank-score { min-width: 46px; height: 42px; padding: 0 8px; border-radius: 12px; display: grid; place-items: center; color: #fff; font-weight: 850; font-variant-numeric: tabular-nums; flex: 0 0 auto; }
        .rank-list { display: grid; gap: 10px; }
        .rank-card { width: 100%; border: 1px solid var(--line); border-radius: 18px; background: #fafbf7; color: var(--ink); padding: 14px; display: grid; grid-template-columns: 44px minmax(0, 1fr) 64px; align-items: center; gap: 14px; text-align: left; cursor: pointer; transition: transform .18s cubic-bezier(.2,.7,.3,1), border-color .18s, box-shadow .18s, background .18s; }
        .rank-card:hover { background: var(--surface); border-color: rgba(18, 21, 15, .28); box-shadow: var(--shadow-sm); transform: translateY(-1px); }
        .rank-pos { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; background: #eceee6; color: var(--ink-soft); font-weight: 900; font-variant-numeric: tabular-nums; }
        .rank-pos.top { background: var(--ink); color: #fff; }
        .rank-info { min-width: 0; }
        .rank-info strong { display: block; font-size: clamp(18px, 3vw, 28px); letter-spacing: -.03em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rank-info small { display: block; color: var(--ink-soft); font-size: 13px; font-weight: 750; margin-top: 4px; }
        .rank-total { min-width: 58px; height: 58px; border-radius: 18px; color: #fff; display: grid; place-items: center; font-size: 22px; font-weight: 900; font-variant-numeric: tabular-nums; box-shadow: inset 0 -14px 24px rgba(0,0,0,.12); }
        .back { border: 0; background: transparent; color: var(--ink-soft); padding: 0; margin-bottom: 10px; font-weight: 850; cursor: pointer; }
        .back:hover { color: var(--ink); }
        .player-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(360px, 480px); gap: 18px; align-items: start; }
        .new-rating { position: sticky; top: 20px; }
        .of-total { color: var(--ink-soft); font-size: .42em; letter-spacing: -.02em; margin-left: 4px; }
        .chart { position: relative; height: 300px; display: flex; align-items: end; gap: 10px; padding: 28px 12px 26px; border: 1px solid var(--line); border-radius: 18px; background: linear-gradient(180deg, #fafbf7, #fff); overflow-x: auto; }
        .chart-col { min-width: 46px; height: 100%; display: grid; grid-template-rows: 24px 1fr 20px; gap: 6px; align-items: end; justify-items: center; }
        .chart-value, .chart-label { color: var(--ink-soft); font-size: 11px; font-weight: 850; font-variant-numeric: tabular-nums; }
        .chart-track { width: 100%; height: 100%; display: flex; align-items: end; justify-content: center; border-radius: 12px; background: #eceee6; overflow: hidden; }
        .chart-bar { width: 100%; border-radius: 12px 12px 0 0; transition: height .35s cubic-bezier(.2,.7,.3,1); }
        .chart-average { position: absolute; left: 12px; right: 12px; height: 1px; background: rgba(18, 21, 15, .38); pointer-events: none; }
        .chart-average span { position: absolute; right: 0; bottom: 6px; border-radius: 999px; background: var(--ink); color: #fff; padding: 5px 8px; font-size: 11px; font-weight: 850; }
        .history-list { display: grid; gap: 8px; margin-top: 14px; }
        .history-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; border: 1px solid var(--line); border-radius: 14px; background: #fafbf7; padding: 10px 12px; }
        .history-row small { display: block; color: var(--ink-soft); font-size: 12px; margin-top: 2px; }
        .history-score { min-width: 44px; height: 38px; border-radius: 12px; color: #fff; display: grid; place-items: center; font-weight: 900; font-variant-numeric: tabular-nums; }
        .teams-card { margin-top: 18px; }
        .team-select { display: grid; grid-template-columns: repeat(auto-fit, minmax(146px, 1fr)); gap: 8px; margin-top: 4px; }
        .team-chip { border: 1px solid var(--line); border-radius: 12px; background: #fafbf7; color: var(--ink); padding: 10px 12px; cursor: pointer; text-align: left; font-size: 14px; font-weight: 800; transition: transform .15s, background .15s, border-color .15s, box-shadow .15s; }
        .team-chip:hover { transform: translateY(-1px); background: var(--surface); box-shadow: var(--shadow-sm); }
        .team-chip.active { background: var(--ink); border-color: var(--ink); color: #fff; box-shadow: var(--shadow-sm); }
        .team-chip small { display: block; margin-top: 3px; color: var(--ink-soft); font-size: 11.5px; font-weight: 700; }
        .team-chip.active small { color: rgba(255,255,255,.62); }
        .team-controls { display: grid; grid-template-columns: minmax(0, 260px) auto; gap: 12px; align-items: end; margin: 18px 0 22px; }
        .team-controls .input { margin-bottom: 0; }
        .team-controls button { height: 46px; padding-inline: 22px; }
        .team-board { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 20px; }
        .team-column { border: 1px solid var(--line); border-radius: 18px; background: #fafbf7; padding: 16px; }
        .team-column:first-child { border-top: 3px solid var(--ink); }
        .team-column:last-child { border-top: 3px solid var(--accent); }
        .team-column h3 { margin: 0; padding: 0; border: 0; font-size: 12px; letter-spacing: .12em; }
        .team-meta { color: var(--ink); font-size: 20px; font-weight: 850; letter-spacing: -.02em; margin: 4px 0 10px; }
        .team-player { display: flex; justify-content: space-between; align-items: center; gap: 10px; border-top: 1px solid #ebeee5; padding: 9px 0 0; margin-top: 9px; font-size: 15px; }
        .team-player small { display: block; color: var(--ink-soft); font-size: 11.5px; margin-top: 2px; }
        .team-player strong:last-child { font-variant-numeric: tabular-nums; }
        .check { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; display: flex; align-items: center; gap: 9px; background: #fafbf7; font-size: 14px; font-weight: 750; cursor: pointer; transition: border-color .15s, background .15s; }
        .check:hover { background: var(--surface); border-color: #d9ded1; }
        .check input { width: 17px; height: 17px; accent-color: var(--ink); }
        .checks { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); }
        @media (max-width: 980px) {
          main { padding: 18px 14px 40px; }
          .landing { min-height: calc(100vh - 58px); gap: 24px; }
          .landing-hero h1 { letter-spacing: -.04em; }
          .hero { align-items: flex-start; flex-direction: column; }
          .top-actions { width: 100%; justify-content: flex-start; }
          .app, .layout, .admin, .team-board, .team-controls, .player-layout { grid-template-columns: 1fr; }
          .sidebar { position: static; max-height: none; }
          .card-head { align-items: stretch; flex-direction: column; }
          .search-inline { max-width: none; }
          .new-rating { position: static; }
          .rank-card { grid-template-columns: 36px minmax(0, 1fr) 52px; padding: 12px; gap: 10px; }
          .rank-pos { width: 36px; height: 36px; border-radius: 12px; }
          .rank-total { min-width: 52px; height: 52px; border-radius: 16px; font-size: 20px; }
          .chart { height: 260px; padding-inline: 10px; }
          .card { padding: 18px; border-radius: 20px; }
          .rating { width: 76px; height: 76px; font-size: 28px; border-radius: 20px; }
          .skill-current, .rate-row { grid-template-columns: 1fr auto; gap: 4px 10px; }
          .skill-current .bar, .rate-row .stars { grid-column: 1 / -1; }
          .stars { justify-content: flex-start; }
          .stars button { font-size: 30px; padding: 4px 6px 4px 0; }
        }
      `}</style>

      {screen === "home" ? (
        <section className="landing">
          <div className="landing-hero">
            <p className="field-label">Skills amateur</p>
            <h1>Elegí tu grupo</h1>
            <p className="muted">Entrá al grupo para ver jugadores, ranking, perfiles y cargar nuevas clasificaciones.</p>
          </div>

          {syncError && <p className="error">Error de base de datos: {syncError}</p>}

          {invalidGroupLink && (
            <p className="warning">El grupo <strong>{invalidGroupLink}</strong> del link no existe o fue borrado. Elegi uno de la lista.</p>
          )}

          {groups.length > 0 && (
            <div>
              <label className="field-label" htmlFor="landing-group-search">Buscar grupo</label>
              <input className="input" id="landing-group-search" placeholder="Ej: MDS" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          )}

          {!hydrated && <p className="muted">Cargando datos desde MongoDB...</p>}

          {hydrated && !syncError && groups.length === 0 && (
            <div className="empty-state">
              <h2>Todavia no hay grupos</h2>
              <p className="muted">Abri <strong>Administrar grupos y jugadores</strong>, crea tu primer grupo y despues cargá los jugadores asignandolos a ese grupo.</p>
            </div>
          )}

          <div className="group-grid">
            {groups
              .filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()))
              .map((item) => {
                const playersCount = players.filter((player) => player.groups.includes(item.id)).length
                const evaluationsCount = evaluations.filter((evaluation) => evaluation.groupId === item.id).length

                return (
                  <button className="group-card" key={item.id} onClick={() => openGroup(item.id)} type="button">
                    <span>
                      <small>Grupo</small>
                      <strong>{item.name}</strong>
                    </span>
                    <small>{playersCount} jugadores · {evaluationsCount} clasificaciones</small>
                  </button>
                )
              })}
          </div>

          <details className="card admin-shell" open={hydrated && groups.length === 0}>
            <summary>Administrar grupos y jugadores</summary>
            <div className="admin">
              <div className="admin-panel">
                <h1>Grupos</h1>
                <label className="field-label" htmlFor="group-name">Nombre del grupo</label>
                <input className="input" id="group-name" placeholder="Ej: MDS" value={groupForm} onChange={(event) => setGroupForm(event.target.value)} />
                <button className="primary" onClick={saveGroup} type="button">{editingGroupId ? "Guardar grupo" : "Crear grupo"}</button>
                {editingGroupId && <button className="secondary" onClick={() => { setEditingGroupId(""); setGroupForm("") }} type="button">Cancelar edicion</button>}

                <div className="admin-list" style={{ marginTop: 16 }}>
                  {groups.map((item) => (
                    <div className="admin-row" key={item.id}>
                      <span><strong>{item.name}</strong><small>{players.filter((player) => player.groups.includes(item.id)).length} jugadores</small></span>
                      <span className="actions">
                        <button className="secondary" onClick={() => editGroup(item)} type="button">Editar</button>
                        <button className="danger" onClick={() => deleteGroup(item.id)} type="button">Borrar</button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="admin-panel">
                <h1>Jugadores</h1>
                <label className="field-label" htmlFor="player-name">Nombre y apellido</label>
                <input className="input" id="player-name" placeholder="Ej: MARTIN BARRIOS" value={playerForm.name} onChange={(event) => setPlayerForm((current) => ({ ...current, name: event.target.value }))} />
                <label className="field-label">Posiciones</label>
                <div className="checks">
                  {POSITIONS.map((position) => (
                    <label className="check" key={position}>
                      <input checked={playerForm.positions.includes(position)} onChange={() => togglePlayerPosition(position)} type="checkbox" />
                      {position}
                    </label>
                  ))}
                </div>

                <label className="field-label" style={{ marginTop: 14 }}>Asignar a grupos</label>
                <div className="checks">
                  {groups.map((item) => (
                    <label className="check" key={item.id}>
                      <input checked={playerForm.groups.includes(item.id)} onChange={() => togglePlayerGroup(item.id)} type="checkbox" />
                      {item.name}
                    </label>
                  ))}
                </div>

                <button className="primary" onClick={savePlayer} type="button">{editingPlayerId ? "Guardar jugador" : "Crear jugador"}</button>
                {editingPlayerId && <button className="secondary" onClick={() => { setEditingPlayerId(""); setPlayerForm(blankPlayerForm()) }} type="button">Cancelar edicion</button>}

                <div className="admin-list" style={{ marginTop: 16 }}>
                  {players.map((player) => (
                    <div className="admin-row" key={player.id}>
                      <span>
                        <strong>{player.name}</strong>
                        <small>{player.positions.join(", ") || "Sin posicion"} · {player.groups.map((id) => groups.find((item) => item.id === id)?.name).filter(Boolean).join(", ") || "Sin grupo"}</small>
                      </span>
                      <span className="actions">
                        <button className="secondary" onClick={() => editPlayer(player)} type="button">Editar</button>
                        <button className="danger" onClick={() => deletePlayer(player.id)} type="button">Borrar</button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </details>
        </section>
      ) : screen === "group" ? (
      <div className="shell">
        <header className="hero">
          <div>
            <p className="field-label">Grupo</p>
            <h1>{group?.name || "Grupo"}</h1>
            <p className="muted">Toca un jugador para ver su detalle y cargar una nueva clasificacion.</p>
          </div>
          <div className="top-actions">
            <button className="secondary" onClick={goHome} type="button">Cambiar grupo</button>
            <button className={`secondary ${copiedLink ? "ok" : ""}`} onClick={copyCurrentLink} type="button">
              {copiedLink ? "Link copiado" : "Copiar link"}
            </button>
            <div className="summary">
              <span>{groupPlayers.length} jugadores</span>
              <span>{ranking.filter((item) => item.rating > 0).length} rankeados</span>
              <span>{evaluations.filter((evaluation) => evaluation.groupId === groupId).length} clasificaciones</span>
            </div>
          </div>
        </header>

        {syncError && <p className="error" style={{ marginBottom: 18 }}>Error de base de datos: {syncError}</p>}

        <div className="card">
          <div className="card-head">
            <div>
              <p className="field-label">Ranking del grupo</p>
              <h2>Jugadores</h2>
            </div>
            <input className="input search-inline" placeholder="Buscar jugador..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>

          {groupPlayers.length === 0 ? (
            <p className="muted">Este grupo todavia no tiene jugadores. Agregalos desde el inicio, en Administrar grupos y jugadores.</p>
          ) : (
            <div className="rank-list">
              {ranking
                .filter((item) => item.player.name.toLowerCase().includes(search.trim().toLowerCase()))
                .map((item, index) => (
                  <button className="rank-card" key={item.player.id} onClick={() => openPlayer(item.player.id)} type="button">
                    <span className={`rank-pos ${index < 3 && item.rating > 0 ? "top" : ""}`}>{index + 1}</span>
                    <span className="rank-info">
                      <strong>{item.player.name}</strong>
                      <small>{item.player.positions.join(", ") || "Sin posicion"} · {item.count} {item.count === 1 ? "clasificacion" : "clasificaciones"}</small>
                    </span>
                    <span className="rank-total" style={{ background: ratingColor(item.rating) }}>{item.rating || "-"}</span>
                  </button>
                ))}
            </div>
          )}
        </div>

        <div className="card teams-card">
          <p className="field-label">Equipos random</p>
          <h2>Armar 2 equipos</h2>
          <p className="muted">Elegí cuántos jugadores querés por equipo, tildá quiénes van a jugar y generá equipos balanceados por rating y posiciones.</p>

          <div className="team-controls">
            <div>
              <label className="field-label" htmlFor="players-per-team">Jugadores por equipo</label>
              <select className="input" id="players-per-team" value={effectivePlayersPerTeam} onChange={(event) => setPlayersPerTeam(Number(event.target.value))} disabled={groupPlayers.length < 4}>
                {teamOptions.map((amount) => <option key={amount} value={amount}>{amount} por equipo</option>)}
              </select>
            </div>
            <button className="secondary dark" onClick={generateTeams} type="button" disabled={selectedTeamPlayers.length < effectivePlayersPerTeam * 2}>Generar equipos</button>
          </div>

          <p className="field-label">Quiénes juegan ({selectedTeamPlayers.length} seleccionados)</p>
          <div className="team-select">
            {groupPlayers.map((player) => {
              const rating = latestPlayerRating(player.id, evaluations)

              return (
                <button className={`team-chip ${selectedTeamPlayerIds.includes(player.id) ? "active" : ""}`} key={player.id} onClick={() => toggleTeamPlayer(player.id)} type="button">
                  {player.name}
                  <small>{player.positions.join(", ") || "Sin posicion"} · {rating}</small>
                </button>
              )
            })}
          </div>

          {generatedTeams ? (
            <div className="team-board">
              <div className="team-column">
                <h3>Equipo A</h3>
                <p className="team-meta">Total {generatedTeams.totalA} · Promedio {generatedTeams.averageA}</p>
                {generatedTeams.teamA.map((item) => (
                  <div className="team-player" key={item.player.id}>
                    <span><strong>{item.player.name}</strong><small>{item.player.positions.join(", ") || "Sin posicion"}</small></span>
                    <strong>{item.rating}</strong>
                  </div>
                ))}
              </div>

              <div className="team-column">
                <h3>Equipo B</h3>
                <p className="team-meta">Total {generatedTeams.totalB} · Promedio {generatedTeams.averageB}</p>
                {generatedTeams.teamB.map((item) => (
                  <div className="team-player" key={item.player.id}>
                    <span><strong>{item.player.name}</strong><small>{item.player.positions.join(", ") || "Sin posicion"}</small></span>
                    <strong>{item.rating}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="muted">{selectedTeamPlayers.length < effectivePlayersPerTeam * 2 ? `Seleccionaste ${selectedTeamPlayers.length}. Para ${effectivePlayersPerTeam} por equipo necesitás ${effectivePlayersPerTeam * 2}.` : "Todavía no generaste equipos."}</p>
          )}
        </div>
      </div>
      ) : (
      <div className="shell">
        <header className="hero">
          <div>
            <button className="back" onClick={backToGroup} type="button">&lt; {group?.name || "Volver"}</button>
            <h1>{selectedPlayer?.name || "Jugador"}</h1>
            <p className="muted">{selectedPlayer?.positions.join(", ") || "Sin posicion"}</p>
          </div>
          <div className="top-actions">
            <button className={`secondary ${copiedLink ? "ok" : ""}`} onClick={copyCurrentLink} type="button">
              {copiedLink ? "Link copiado" : "Copiar link"}
            </button>
            <div className="summary">
              <span>{classificationCount} clasificaciones</span>
              <span>Puesto {ranking.findIndex((item) => item.player.id === selectedPlayer?.id) + 1} de {ranking.length}</span>
            </div>
          </div>
        </header>

        {syncError && <p className="error" style={{ marginBottom: 18 }}>Error de base de datos: {syncError}</p>}

        <div className="player-layout">
          <div className="stack">
            <div className="card">
              <div className="profile-head">
                <div>
                  <p className="field-label">Puntaje total</p>
                  <h2>{currentRating || "-"}<span className="of-total">/100</span></h2>
                  <p className="muted">Promedio de {classificationCount} {classificationCount === 1 ? "clasificacion" : "clasificaciones"}</p>
                  <div className="pills">
                    {historyBest > 0 && <span className="pill">Mejor: {historyBest}</span>}
                    {historyWorst > 0 && <span className="pill">Peor: {historyWorst}</span>}
                    {latestEvaluation && <span className="pill">Ultima: {formatMonth(latestEvaluation.month)}</span>}
                  </div>
                </div>
                <div className="rating" style={{ background: ratingColor(currentRating) }}>{currentRating || "-"}</div>
              </div>

              <h3>Promedio por skill</h3>
              <div className="current">
                {averageScores ? SKILLS.map((skill) => (
                  <div className="skill-current" key={skill.id}>
                    <strong className="skill-name"><span>{skill.label}</span><small>{skill.weight}% del total</small></strong>
                    <div className="bar"><span style={{ width: `${((averageScores[skill.id] || 0) / 5) * 100}%` }} /></div>
                    <span>{averageScores[skill.id]}</span>
                  </div>
                )) : <p className="muted">Todavia no tiene clasificaciones guardadas.</p>}
              </div>
            </div>

            <div className="card">
              <p className="field-label">Historial</p>
              <h2>Comparacion de clasificaciones</h2>

              {playerHistory.length === 0 ? (
                <p className="muted">Guardá la primera clasificacion para ver el grafico.</p>
              ) : (
                <>
                  <div className="chart" role="img" aria-label="Grafico de barras con el total de cada clasificacion">
                    {playerHistory.map((item) => (
                      <div className="chart-col" key={item.evaluation.id} title={`#${item.index} · ${item.rating}/100 · ${item.groupName} ${formatMonth(item.evaluation.month)}`}>
                        <span className="chart-value">{item.rating}</span>
                        <div className="chart-track">
                          <div
                            className="chart-bar"
                            style={{ height: `${Math.max(item.rating, 2)}%`, background: ratingColor(item.rating) }}
                          />
                        </div>
                        <span className="chart-label">#{item.index}</span>
                      </div>
                    ))}
                    <div className="chart-average" style={{ bottom: `calc(${currentRating}% + 26px)` }}>
                      <span>Promedio {currentRating}</span>
                    </div>
                  </div>

                  <div className="history-list">
                    {[...playerHistory].reverse().map((item) => (
                      <div className="history-row" key={item.evaluation.id}>
                        <span>
                          <strong>#{item.index} · {formatMonth(item.evaluation.month)}</strong>
                          <small>{item.groupName} · {new Date(item.evaluation.updatedAt).toLocaleDateString("es-AR")}</small>
                        </span>
                        <span className="history-score" style={{ background: ratingColor(item.rating) }}>{item.rating}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card new-rating">
            <p className="field-label">Nueva clasificacion · {group?.name} · {formatMonth(month)}</p>
            <h2>Puntuar</h2>
            <p className="muted">Las estrellas parten de la última clasificación cargada. Al guardar se crea una nueva y se recalcula el promedio.</p>

            <div className="form" style={{ marginTop: 18 }}>
              {SKILLS.map((skill) => (
                <div className="rate-row" key={skill.id}>
                  <strong className="skill-name"><span>{skill.label}</span><small>{skill.weight}% del total</small></strong>
                  <div className="stars">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button className={value <= scores[skill.id] ? "on" : ""} key={value} onClick={() => setScores((current) => ({ ...current, [skill.id]: value }))} type="button" aria-label={`${value} estrellas`}>
                        ★
                      </button>
                    ))}
                  </div>
                  <span>{scores[skill.id]}</span>
                </div>
              ))}
            </div>
            <button className="primary" onClick={saveEvaluation} type="button">Guardar clasificacion · {formRating}/100</button>
            {savedMessage && <p className="saved">{savedMessage}</p>}
          </div>
        </div>
      </div>
      )}
    </main>
  )
}
