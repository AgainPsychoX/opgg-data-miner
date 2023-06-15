import path from 'path'
import fs from 'fs/promises';
import { Argument, Command, Option } from "commander";
import { Region, canAccess, mapAndSetReplacer, parseRegion } from "@/common";
import { getDefaultCache } from "@/utils/cache";
import { collectHistory } from "@/collect/history";
import { ParticipantRawData, rankValue } from "@/models/Game";

const orderChoices = [
	'low', 'high', 'close', // lower, higher or close rank (compared to initial account)
	'recent-together',     // by most number of games played together in last 20 games (descending)
	'active', 'inactive', // by latest game or oldest games
	'connected',         // by number of cached games participated
	'random',
] as const;
type Order = typeof orderChoices[number];

interface SpiderState {
	region: Region;
	startAccount: string;
	startAccountRankValue: number;
	startTimestamp: Date;
	accountsPriorities: Map<string, number>;
	accountsVisited: Set<string>;
	gamesCount: number;
}

export function registerSpiderCommand(parent: Command) {
	const that = parent
		.command('spider')
		.addArgument(new Argument('[region]', `Region on which to collect the data, or 'continue' to continue from last state.`)
			.argParser(x => x === 'continue' ? x : parseRegion(x)))
		.argument('[account]', 'Account to start the data collection with.')
		.description('Crawls between and collects data from multiple accounts, starting with selected one for selected region.')
		// .option('-t, --time <duration>', 'stop collecting after specified time')
		// .option('-n, --number-of-matches <numberOfMatches>', 'stop collecting after selected number of matches')
		// .option('-r, --rank <minimalRank> [maxRank]', 'collect data only from selected ranks range')
		.addOption(new Option('--order <order>', 'Specifies order of choosing next accounts to collect.')
			.choices(orderChoices).default('random'))
		.action(async (region: Region | 'continue', account: string, options: any, command: Command) => {
			let loadedState: SpiderState | undefined;
			if (region == 'continue') {
				loadedState = await new Promise(r => loadSpiderState().then(r).catch(e => r(undefined)));
				if (loadedState) {
					region = loadedState.region;
					account = loadedState.startAccount;
					console.log(`Continuing spider action, region: ${region.toUpperCase()}`);
				}
				else {
					console.error(`Cannot continue as spider state is not found or corrupted. `);
					return;
				}
			}
			if (!region) {
				command.help();
				return;
			}
			if (!account) {
				switch (region) {
					case 'euw': account = 'Azzapp'; break; // who the fuck is Azzapp?
					default: {
						console.error(`No default account for the region, please specify an account`);
						return;
					}
				}
			}

			const cache = await getDefaultCache(region);

			// TODO: consider using priority queue?
			loadedState ||= {
				region,
				startAccount: account,
				startAccountRankValue: 0,
				startTimestamp: new Date(Date.now() - 10 * 60 * 1000),
				accountsPriorities: new Map(),
				accountsVisited: new Set(),
				gamesCount: 0,
			};
			const { startAccount, startTimestamp, accountsPriorities, accountsVisited } = loadedState;
			let { startAccountRankValue, gamesCount } = loadedState;

			/* Higher priority value means higher priority.
			 */
			let calculatePriority: (participant: ParticipantRawData) => Promise<number> = (p) => Promise.resolve(0);
			switch (options.order as Order) {
				case 'low':
					calculatePriority = p => Promise.resolve(-rankValue(p.tier_info));
					break;
				case 'high': 
					calculatePriority = p => Promise.resolve(rankValue(p.tier_info));
					break;
				case 'close': 
					calculatePriority = p => Promise.resolve(Math.abs(rankValue(p.tier_info) - startAccountRankValue));
					break;

				case 'active': 
					calculatePriority = async (p) => {
						const meta = await cache.getPlayerCacheMeta(p.summoner.name);
						return +(meta?.lastGameCreatedAt || 0);
					};
					break;
				case 'inactive':
					calculatePriority = async (p) => {
						const meta = await cache.getPlayerCacheMeta(p.summoner.name);
						return -(meta?.lastGameCreatedAt || 0);
					};
					break;

				case 'connected':
					calculatePriority = async (p) => {
						const meta = await cache.getPlayerCacheMeta(p.summoner.name);
						return -(meta?.lastGameCreatedAt || 0);
					};
					break;

				case 'random':
					calculatePriority = p => Promise.resolve(Math.random());
					break;
			}

			while (account) {
				console.log(`Accounts visited: ${accountsVisited.size} (of ${accountsPriorities.size} met) | Total games: ${gamesCount} | Next account: '${account}'`)

				const games = await collectHistory(region, account, { update: startTimestamp, cache });
				accountsVisited.add(account);
				gamesCount = cache._cachedGames.size;

				for (const game of games) {
					for (const participant of game.participants) {
						if (participant.summoner.name == startAccount) {
							startAccountRankValue = rankValue(participant.tier_info);
						}
						accountsPriorities.set(participant.summoner.name, await calculatePriority(participant));
					}
				}

				saveSpiderState({
					region,
					startTimestamp,
					startAccountRankValue,
					startAccount,
					accountsPriorities,
					accountsVisited,
					gamesCount,
				});

				// Look for next account
				account = '';
				let bestPriority = -Infinity;
				for (const [potentialNextAccount, priority] of accountsPriorities.entries()) {
					if (accountsVisited.has(potentialNextAccount)) {
						continue;
					}

					if (bestPriority < priority) {
						account = potentialNextAccount;
					}
				}
			}
		})
	;
	return that;
}

async function saveSpiderState(spiderState: SpiderState) {
	await fs.writeFile(path.join('spiderState.json'), JSON.stringify(spiderState, mapAndSetReplacer, '\t'), 'utf-8');
}

async function loadSpiderState(): Promise<SpiderState | undefined> {
	if (await canAccess('spiderState.json')) {
		const data = JSON.parse(await fs.readFile(path.join('spiderState.json'), 'utf-8'));
		data.startTimestamp = new Date(data.startTimestamp);
		return data as SpiderState;
	}
	return undefined;
}
