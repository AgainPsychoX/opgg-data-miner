import assert from 'assert/strict';
import { parse, HTMLElement } from "node-html-parser";
import axios from 'axios';
import { MatchSummary, ParticipantMinimal, ParticipantSummarySelf } from "@/models/Summary";
import { TeamOverview } from '@/models/Overview';
import { commonHeaders } from "@/common";

const durationUnitToSeconds = {h: 3600, m: 60, s: 1};
type DurationUnit = keyof typeof durationUnitToSeconds;

const durationTextToSeconds = (str: string) => {
	return str.trim().toLowerCase().split(' ').map(part => {
		const unit = part[part.length - 1] as DurationUnit;
		return parseInt(part) * durationUnitToSeconds[unit];
	}).reduce((prev, curr) => prev + curr)
}
assert(durationTextToSeconds('1h 22m 38s') === 4958);

const multiKillStringToNumber = (str: string, kills?: number) => {
	return {double: 2, triple: 3, quadra: 4, penta: 5, undefined: (kills || 1) > 0 ? 1 : 0}
		[str.split(' ')[0]!.toLowerCase()] || 0;
}

const parseMultiKillBadge = (gameItem: HTMLElement, kills?: number) => {
	const element = gameItem.querySelector('.MultiKill > .Kill');
	if (!element) {
		return 0;
	}
	return multiKillStringToNumber(element.innerText.trim(), kills);
}

const fixApostrophe = (str: string) => str.replace(/&#039;/g, "'");

export const parseMatchSummary = (gameItem: HTMLElement) => {
	const playersElement = gameItem.querySelector('.FollowPlayers')!;

	// Parse data about main player
	const kills = parseInt(gameItem.querySelector('.KDA > .KDA > .Kill')!.innerText);
	const participantSelf: ParticipantSummarySelf = {
		summonerId: parseInt(gameItem.getAttribute('data-summoner-id') || ''),
		summonerName: playersElement.querySelector('.Requester > .SummonerName > a')!.innerText,
		championName: fixApostrophe(gameItem.querySelector('.ChampionName > a')!.innerText.trim()),
		summonerSpells: [...gameItem.querySelectorAll('.SummonerSpell > .Spell > img')].map(i => (i.getAttribute('alt') || 'unknown')),
		runes: [...gameItem.querySelectorAll('.Runes > .Rune > img')].map(i => (i.getAttribute('alt') || 'unknown')),
		items: [...gameItem.querySelectorAll('.Items > .ItemList > .Item > img')].map(i => (i.getAttribute('alt') || 'unknown')),
		level: parseInt(gameItem.querySelector('.Stats > .Level')!.innerText.trim().substring(5)),
		creepScore: parseInt(gameItem.querySelector('.Stats > .CS > span')!.innerText),
		kills,
		deaths: parseInt(gameItem.querySelector('.KDA > .KDA > .Death')!.innerText),
		assists: parseInt(gameItem.querySelector('.KDA > .KDA > .Assist')!.innerText),
		killParticipationSummaryPercent: parseInt(gameItem.querySelector('.Stats > .CKRate')!.innerText.trim().substring(7)),
		controlWards: parseInt(gameItem.querySelector('.Items > .Trinket > .vision')?.innerText || '0'),
		maxMultiKill: parseMultiKillBadge(gameItem, kills),
		hasACE: gameItem.querySelector('.Badge > .ACE') !== null,
		basMVP: gameItem.querySelector('.Badge > .MVP') !== null,
	}

	// Parse data about teams
	const teamsElements = [...playersElement.querySelectorAll('.Team')];
	const teamElementToParticipants = (teamElement: HTMLElement) => {
		const summonersElements = [...(teamElement.querySelectorAll('.Summoner'))];
		return summonersElements.map(summoner => ({
			summonerName: summoner.querySelector('.SummonerName > a')!.innerText.trim(),
			championName: fixApostrophe(summoner.querySelector('.ChampionImage > div')!.innerText.trim()),
		}) as ParticipantMinimal)
	};
	const team0 = teamElementToParticipants(teamsElements[0]!);
	const team1 = teamElementToParticipants(teamsElements[1]!);

	// Find ally team and place main player extend dataset into team data
	const isTeam0Allies = !!(teamsElements[0]?.querySelector('.Requester'));
	const allies = isTeam0Allies ? team0 : team1;
	const index = allies.findIndex(p => p.summonerName == participantSelf.summonerName);
	if (index === -1) throw new Error('wtf');
	allies[index] = participantSelf;

	// Build and return result
	const result: MatchSummary = {
		gameId:     parseInt(gameItem.getAttribute('data-game-id') || ''),
		timestamp:  new Date(parseInt(gameItem.getAttribute('data-game-time') || '') * 1000),
		type:       gameItem.querySelector('.GameType')!.innerText.trim(),
		result:     gameItem.querySelector('.GameResult')!.innerText.trim(),
		duration:   durationTextToSeconds(gameItem.querySelector('.GameLength')!.innerText),
		tierAverage: gameItem.querySelector('.MMR > b')?.innerText?.trim(),
		redTeam: {
			victory: isTeam0Allies,
			participants: team0,
		},
		blueTeam: {
			victory: !isTeam0Allies,
			participants: team1,
		},
	}
	return result;
};


const keystoneRuneToRuneTreeMap: Record<string, string> = {
	"press the attack": "Precision",
	"lethal tempo": "Precision",
	"fleet footwork": "Precision",
	"conqueror": "Precision",
	"electrocute": "Domination",
	"predator": "Domination",
	"dark harvest": "Domination",
	"hail of blades": "Domination",
	"summon aery": "Sorcery",
	"arcane comet": "Sorcery",
	"phase rush": "Sorcery",
	"grasp of the undying": "Resolve",
	"aftershock": "Resolve",
	"guardian": "Resolve",
	"glacial augment": "Inspiration",
	"unsealed spellbook": "Inspiration",
	"first strike": "Inspiration",
} as const;
export const keystoneRuneToRuneTree = (key: string) => keystoneRuneToRuneTreeMap[key.toLowerCase()] || 'unknown';

const imgTitleHeaderToName = (img: HTMLElement) => {
	const title = img.getAttribute('title');
	if (!title) return 'unknown';
	const root = parse(title);
	return root.querySelector('b')!.innerText.trim();
}
const generateTeamOverview = (teamTable: HTMLElement, summary: HTMLElement | null) => {
	const victory = teamTable.classList.contains('Result-WIN');
	const rows = [...(teamTable.querySelectorAll('.Content > .Row'))];
	const result: TeamOverview = {
		victory,
		participants: rows.map(row => {
			const items = [...(row.querySelectorAll('.Items > .Item > img'))].map(img => {
				const title = img.getAttribute('title');
				if (!title) return {name: 'unknown', price: 0};
				const name = parse(title.substring(0, title.indexOf('</b>') + 4)).querySelector('b')!.innerText.trim();
				const costOffset = title.indexOf('Cost:');
				if (costOffset == -1) {
					return {name, price: 0};
				}
				const priceRoot = parse(title.substring(costOffset + 12));
				const price = parseInt(priceRoot.querySelector('span')!.innerText.trim());
				return {name, price};
			})
			const totalItemsPrice = items.reduce((prev, next) => prev + next.price, 0);
			const runes = [...row.querySelectorAll('.Rune > img')].map(img => {
				const title = img.getAttribute('title');
				if (!title) return 'unknown';
				const name = parse(title.substring(0, title.indexOf('</b>') + 4)).querySelector('b')!.innerText.trim();
				return name;
			});
			return {
				summonerName: row.querySelector('.SummonerName > a')!.innerText.trim(),
				rankedTier: row.querySelector('.Tier')!.innerText.trim(),
				
				championName: fixApostrophe(row.querySelector('.ChampionImage > a > .Image')!.innerText.trim()),
				summonerSpells: [...(row.querySelectorAll('.SummonerSpell > img'))].map(imgTitleHeaderToName),
				keystoneRune: runes[0]!,
				secondaryRuneTree: runes[1]!,
				primaryRuneTree: keystoneRuneToRuneTree(runes[0]!),
				items: items.map(i => i.name),
				totalItemsPrice,

				level: parseInt(row.querySelector('.ChampionImage > a > .Level')!.innerText),
				creepScore: parseInt(row.querySelector('.CS > .CS')!.innerText),
				creepScorePerMinute: parseInt(row.querySelector('.CS > .CSPerMinute')!.innerText),
				kills: parseInt(row.querySelector('.KDA > .KDA > .Kill')!.innerText),
				deaths: parseInt(row.querySelector('.KDA > .KDA > .Death')!.innerText),
				assists: parseInt(row.querySelector('.KDA > .KDA > .Assist')!.innerText),
				killParticipationSummaryPercent: parseInt(row.querySelector('.KDA > .KDA > .CKRate')!.innerText.trim().substring(1)),
				damage: parseInt(row.querySelector('.ChampionDamage')!.innerText.replace(/,/g,'')),
				controlWards: parseInt(row.querySelector('.Ward .SightWard')!.innerText),
				wardsPlaced: parseInt(row.querySelector('.Ward .Stats span:first-child')!.innerText),
				wardsKilled: parseInt(row.querySelector('.Ward .Stats span:last-child')!.innerText),

				opScore: parseFloat(row.querySelector('.OPScore.Cell > .Text')?.innerText || ''),
				hasACE: row.querySelector('.OPScore.Cell > .Badge')?.classList?.contains('ACE') || false,
				hasMVP: row.querySelector('.OPScore.Cell > .Badge')?.classList?.contains('MVP') || false,
			}
		}),
		barons: NaN,
		dragons: NaN,
		towers: NaN,
		totalKills: NaN,
		totalGold: NaN,
	}

	// Summary and OP score are not available on remakes, left numbers with NaNs.
	if (summary) {
		const objectives = summary.querySelectorAll(`.Team.Result-${victory ? 'WIN' : 'LOSE'} > .ObjectScore`);
		result.barons = parseInt(objectives[0]!.innerText);
		result.dragons = parseInt(objectives[1]!.innerText);
		result.towers = parseInt(objectives[2]!.innerText);
		result.totalKills = parseInt((summary.querySelector(`.summary-graph > .total--container:first-child > .graph--container > .${victory ? 'win' : 'lose'}--team`)!.getAttribute('style') || '').substring(5));
		result.totalGold = parseInt((summary.querySelector(`.summary-graph > .total--container:last-child > .graph--container > .${victory ? 'win' : 'lose'}--team`)!.getAttribute('style') || '').substring(5));
	}
	
	return result;
}

export const parseMatchOverview = async (gameItem: HTMLElement, server: string) => {
	const gameId = parseInt(gameItem.getAttribute('data-game-id') || '');
	const summonerId = parseInt(gameItem.getAttribute('data-summoner-id') || '');
	const gameTime = parseInt(gameItem.getAttribute('data-game-time') || '');

	const { data } = await axios({
		method: 'GET',
		url: `https://${server}op.gg/summoner/matches/ajax/detail/gameId=${gameId}&summonerId=${summonerId}&gameTime=${gameTime}`,
		headers: Object.assign({
			'x-requested-with': 'XMLHttpRequest',
		}, commonHeaders), 
	})
	const document = parse(data);
	const teamsTables = [...(document.querySelectorAll('.GameDetailTable'))];
	const summary = document.querySelector('.Summary');
	const isTeam0Blue = teamsTables[0]!.querySelector('.Header')!.innerText.toLowerCase().includes('blue');

	const result: MatchSummary = {
		gameId,
		timestamp:  new Date(gameTime * 1000),
		type:       gameItem.querySelector('.GameType')!.innerText.trim(),
		result:     gameItem.querySelector('.GameResult')!.innerText.trim(),
		duration:   durationTextToSeconds(gameItem.querySelector('.GameLength')!.innerText),
		tierAverage: gameItem.querySelector('.MMR > b')?.innerText?.trim(),
		redTeam: generateTeamOverview(isTeam0Blue ? teamsTables[1]! : teamsTables[0]!, summary),
		blueTeam: generateTeamOverview(isTeam0Blue ? teamsTables[0]! : teamsTables[1]!, summary),
	}
	return result;
}
