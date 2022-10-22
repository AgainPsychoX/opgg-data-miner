import axios from "axios"
// import { OpggHistory } from "@/models/OpggHistory";
import { commonHeaders, Region } from "@/common";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const dataBeginTag = '<script id="__NEXT_DATA__" type="application/json">';
const dataEndTag = '</script>';

export const collectHistory = async (
	region: Region, 
	userName: string, 
	options?: {
		/**
		 * Update will be requested only if current data timestamp is older
		 * than provided date, or always if true, or never if false.
		 */
		update?: Date | boolean,
		gameType?: string,
	},
) => {
	// Default options
	if (!options) {
		options = {};
	}
	options.gameType ||= 'soloranked';

	console.debug(`First request to get summonerId, last update timestamp, account stats and latest games, and some game-related assets.`);
	const { data: rawData } = await axios({
		method: 'GET',
		url: `https://www.op.gg/summoners/${region}/${userName}`,
		headers: commonHeaders,
	});
	const dataBeginTagOffset = rawData.indexOf(dataBeginTag);
	if (dataBeginTagOffset < 0) {
		throw new Error(`Couldn't find necessary data. Website changed again?`);
	}
	const dataEndTagOffset = rawData.indexOf(dataEndTag, dataBeginTagOffset);
	const data = JSON.parse(rawData.substring(dataBeginTagOffset + dataBeginTag.length, dataEndTagOffset));
	const summonerId = data.props.pageProps.data.summoner_id as string;

	let wasUpdated = false;
	// Try to update if required
	// The `while` is used instead `if`, as there are 2 separate exits.
	while (options.update) {
		if (options.update !== true) {
			const timestamp = new Date(data.props.pageProps.data.update_at);
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
			if (!data.data.finish)
				await sleep(data.data.delay);
		}

		console.debug(`Request update status and wait as requested till finished`);
		{
			while (true) {
				const { data } = await axios({
					method: 'GET',
					url: `https://op.gg/api/v1.0/internal/bypass/summoners/${region}/${summonerId}/renewal-status`,
					headers: commonHeaders
				});

				if (data.data.finish) {
					console.debug(`Update finished. Last update at: ${new Date(data.data.last_updated_at).toJSON()}`);	
					break;
				}
				await sleep(data.data.delay);
			}
		}

		wasUpdated = true;
		break;
	}

	const games = [];

	const gamesLimitPerRequest = 20;

	let endedAtParam;
	if (wasUpdated && options.gameType == 'total') {
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
		console.debug(`Requesting next games via API`);
		const { data } = await axios({
			method: 'GET',
			url: `https://op.gg/api/v1.0/internal/bypass/games/${region}/summoners/${summonerId}?&ended_at=${endedAtParam}&limit=${gamesLimitPerRequest}&hl=en_US&game_type=${options.gameType}`,
			headers: commonHeaders
		});
		endedAtParam = encodeURIComponent(data.meta.last_game_created_at);
		games.push(...data.data);
		console.debug(`Games count: ${games.length}`);
		if (data.data.length < gamesLimitPerRequest) {
			break;
		}
	}

	games.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));

	// Update raw data stuff as we want to return it for research proposes for now
	data.props.pageProps.games.data = games;
	data.props.pageProps.games.meta = {
		first_game_created_at: games[0].created_at,
		last_game_created_at: games[games.length - 1].created_at,
	}

	return { games, data };
}
