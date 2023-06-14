import axios from "axios"
// import { OpggHistory } from "@/models/OpggHistory";
import { commonHeaders, Region } from "@/common";
import { Cache, getDefaultCache } from "@/utils/cache";
import { GameRawData } from "@/models/Game";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const dataBeginTag = '<script id="__NEXT_DATA__" type="application/json">';
const dataEndTag = '</script>';

export async function collectHistory(
	region: Region, 
	userName: string, 
	options?: {
		/**
		 * Update will be requested only if current data timestamp is older
		 * than provided date, or always if true, or never if false.
		 */
		update?: Date | boolean,
		gameType?: string,
		/**
		 * Limits fetched games to those created since given date. 
		 */
		since?: Date,
		/**
		 * Limit count of fetched games to given amount.
		 */
		maxCount?: number;
		/**
		 * Cache instance to use, or true to use default ones, or false (default) to prevent caching.
		 */
		cache?: Cache | boolean;
	},
): Promise<GameRawData[]> {
	// Default options
	if (!options) {
		options = {};
	}
	options.gameType ||= 'soloranked';

	console.debug(`Beginning to collect history for account '${userName}', region ${region.toUpperCase()}`);

	if (options.cache === true) {
		options.cache = await getDefaultCache(region);
	}
	let latestCachedGameDate = new Date(0); // default
	if (options.cache) {
		const meta = await options.cache.getPlayerCacheMeta(userName);
		if (meta) {
			if (meta.lastUpdatedAt) /* cached */ {
				if (options.update !== true) {
					if (!options.update) {
						console.debug(`Cached data found and updates are disabled, so return from cache.`);
						const games = await options.cache.getGamesForPlayer(userName);
						return games ? games : [];
					}
					if (+options.update < +meta.lastUpdatedAt) {
						console.debug(`Cached data is fresh enough, no requests necessary.`);
						const games = await options.cache.getGamesForPlayer(userName);
						return games ? games : [];
					}
				}
			}
			latestCachedGameDate = meta.lastGameCreatedAt;
		}
	}

	console.debug(`First request to get summonerId, last update timestamp, account stats and latest games, and some game-related assets.`);
	const { data: rawData } = await axios({
		method: 'GET',
		url: `https://www.op.gg/summoners/${region}/${encodeURIComponent(userName)}`,
		headers: commonHeaders,
	});
	const dataBeginTagOffset = rawData.indexOf(dataBeginTag);
	if (dataBeginTagOffset < 0) {
		throw new Error(`Couldn't find necessary data. Website changed again?`);
	}
	const dataEndTagOffset = rawData.indexOf(dataEndTag, dataBeginTagOffset);
	const data = JSON.parse(rawData.substring(dataBeginTagOffset + dataBeginTag.length, dataEndTagOffset));
	const summonerId = data.props.pageProps.data.summoner_id as string;

	// Fill region to player data
	data.props.pageProps.data.region = region;
	console.assert(data.props.pageProps.region == region);

	if (options.cache) {
		const purgeKeys = [
			'champions', 'championsById', 
			'runePagesById', 'runesById', 
			'spellsById', 
			'itemsById', 'seasons', 'seasonsById', 'regionSeasons'
		];
		for (const key of purgeKeys) {
			delete data.props.pageProps.data[key];
		}
		options.cache.putPlayerData(data.props.pageProps.data);
	}

	let wasUpdated = false;
	let updateRequestSent = false;
	// Try to update if required
	// The `while` is used instead `if`, as there are 2 separate exits.
	try {
		while (options.update) {
			if (options.update !== true) {
				const timestamp = new Date(data.props.pageProps.data.updated_at);
				if (+options.update < +timestamp) {
					console.debug(`Data is fresh enough, no update necessary (timestamp: ${timestamp.toJSON()})`);
					break;
				}
			}

			console.debug(`Requesting update and waiting as requested`);
			{
				const { data } = await axios({
					method: 'POST',
					url: `https://op.gg/api/v1.0/internal/bypass/summoners/${region}/${summonerId}/renewal`,
					headers: commonHeaders
				});
				updateRequestSent = true;
				if (!data.data.finish) {
					await sleep(data.data.delay);
				}
			}

			console.debug(`Request update status and wait as requested till finished`);
			{
				while (true) {
					const { data } = await axios({
						method: 'GET',
						url: `https://op.gg/api/v1.0/internal/bypass/summoners/${region}/${summonerId}/renewal-status`,
						headers: commonHeaders
					});

					if (data.data.finish || data.data.renewable_at) {
						console.debug(`Update finished. Last update at: ${new Date(data.data.last_updated_at).toJSON()}`);	
						break;
					}
					await sleep(data.data.delay);
				}
			}

			wasUpdated = true;
			break;
		}
	}
	catch (error: any) {
		if (updateRequestSent)
			console.warn(`Error updating the history before fetching, but the update request was sent.`);
		else
			console.warn(`Error updating the history before fetching, couldn't request the update.`);

		if (error.response) {
			console.warn(`Response status: ${error.response.status}, data: ${JSON.stringify(error.response.data)}`)
		}
		else if (error.request) {
			console.warn(`Request sent, but no response was received.`);
		}
		else {
			console.warn(error);
		}
	}

	let games: GameRawData[] = [];

	const gamesLimitPerRequest = 20;

	let endedAtParam;
	if (wasUpdated) {
		console.debug(`Requesting first games via API`);
		const { data } = await axios({
			method: 'GET',
			url: `https://op.gg/api/v1.0/internal/bypass/games/${region}/summoners/${summonerId}?&limit=${gamesLimitPerRequest}&hl=en_US&game_type=${options.gameType}`,
			headers: commonHeaders
		});
		endedAtParam = encodeURIComponent(data.meta.last_game_created_at);
		games.push(...data.data);
		console.debug(`Games count: ${games.length}`);
	}
	else {
		console.debug(`First games loaded from initial website load`);
		endedAtParam = encodeURIComponent(data.props.pageProps.games.meta.last_game_created_at);
		games.push(...data.props.pageProps.games.data);
		console.debug(`Games count: ${games.length}`);
	}

	while (true) {
		if (options.cache) {
			const anyAlreadyCachedGame = games.find(game => (+new Date(game.created_at) <= +latestCachedGameDate));
			if (anyAlreadyCachedGame) {
				break;
			}
		}
		
		console.debug(`Requesting next games via API`);
		const { data } = await axios({
			method: 'GET',
			url: `https://op.gg/api/v1.0/internal/bypass/games/${region}/summoners/${summonerId}?&ended_at=${endedAtParam}&limit=${gamesLimitPerRequest}&hl=en_US&game_type=${options.gameType}`,
			headers: commonHeaders
		});
		const moreGames = data.data as GameRawData[];

		if (options.cache) {
			for (const game of moreGames) {
				options.cache.putGame(game);
			}
		}

		games.push(...data.data);

		console.debug(`Games count: ${games.length}`);

		if (options.maxCount && options.maxCount <= games.length) {
			// Equal or more than enough games fetched
			break;
		}
		if (data.data.length < gamesLimitPerRequest) {
			// Fetched less games than cursor limit, there seem to be no more games
			break;
		}
		if (options.since && new Date(data.meta.last_game_created_at) <= options.since) {
			// Last game fetched precedes the given limiting date.
			break;
		}
		endedAtParam = encodeURIComponent(data.meta.last_game_created_at);
	}

	if (options.cache) {
		const gamesFromCache = await options.cache.getGamesForPlayer(userName);
		if (gamesFromCache) {
			const mapped = new Map(games.map(game => [game.id, game]));
			for (const game of gamesFromCache) {
				mapped.set(game.id, game);
			}
			games = [...mapped.values()];
		}
	}

	games.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

	if (options.maxCount && options.maxCount < games.length) {
		games.length = options.maxCount;
	}
	if (options.since) {
		const after = options.since;
		games = games.filter(g => (after <= new Date(g.created_at)));
	}

	// // Update raw data stuff as we want to return it for research proposes for now
	// data.props.pageProps.games.data = games;
	// data.props.pageProps.games.meta = {
	// 	first_game_created_at: games[0].created_at,
	// 	last_game_created_at: games[games.length - 1].created_at,
	// }

	console.debug(`Done collecting history. Games collected total: ${games.length}`);

	return games;
}
