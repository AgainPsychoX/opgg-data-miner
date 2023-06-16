import path from 'path'
import fs from 'fs/promises';
import { Argument, Command, Option } from "commander";
import { Region, canAccess, mapAndSetReplacer, parseRegion } from "@/common";
import { getDefaultCache } from "@/utils/cache";
import { collectHistory } from "@/collect/history";

const orderChoices = [
	'low', 'high', 'close', // lower, higher or close rank (compared to initial account)
	'active', 'inactive',  // by latest game or oldest games
	'connected',          // by number of cached games participated
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
	options: {
		order: Order;
	};
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
					options.order = loadedState.options.order;
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
				options,
			};
			const { startAccount, startTimestamp, accountsPriorities, accountsVisited } = loadedState;
			let { startAccountRankValue, gamesCount } = loadedState;

			/* Higher priority value means higher priority.
			 */
			let calculatePriority: (account: string) => number = account => 0;
			switch (options.order as Order) {
				case 'low':
					calculatePriority = account => -cache.getPlayerCacheMeta(account)!.rankValue;
					break;
				case 'high': 
					calculatePriority = account => +cache.getPlayerCacheMeta(account)!.rankValue;
					break;
				case 'close': 
					calculatePriority = account => Math.abs(cache.getPlayerCacheMeta(account)!.rankValue - startAccountRankValue);	
					break;

				case 'active': 
					calculatePriority = account => {
						const meta = cache.getPlayerCacheMeta(account);
						return +(meta?.lastGameCreatedAt || 0);
					};
					break;
				case 'inactive':
					calculatePriority = account => {
						const meta = cache.getPlayerCacheMeta(account);
						return -(meta?.lastGameCreatedAt || 0);
					};
					break;

				case 'connected':
					calculatePriority = account => {
						const meta = cache.getPlayerCacheMeta(account);
						return -(meta?.lastGameCreatedAt || 0);
					};
					break;

				case 'random':
					calculatePriority = account => Math.random();
					break;
			}

			while (account) {
				console.log(`Accounts visited: ${accountsVisited.size} (of ${accountsPriorities.size} met) | Total games: ${gamesCount} | Next account: '${account}'`)

				const games = await collectHistory(region, account, { update: startTimestamp, cache });
				accountsVisited.add(account);
				gamesCount = cache._cachedGames.size;

				if (account == startAccount) {
					const meta = cache.getPlayerCacheMeta(account);
					if (!meta) throw new Error();
					startAccountRankValue = meta.rankValue;
				}

				for (const game of games) {
					for (const participant of game.participants) {
						accountsPriorities.set(participant.summoner.name, await calculatePriority(account));
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
					options,
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
