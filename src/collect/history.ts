import axios from "axios"
import { parse } from "node-html-parser";
import { OpggHistory } from "@/models/OpggHistory";
import { commonHeaders } from "@/common";
import { parseMatchOverview, parseMatchSummary } from "./match";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const collectHistory = async (
	server: string, 
	userName: string, 
	options?: {
		/**
		 * Update will be requested only if current data timestamp is older
		 * than provided date, or always if true, or never if false.
		 */
		update?: Date | boolean,
		/**
		 * Detail levels:
		 * * summary - standard information listed without expanding game item.
		 * * overview - summary data with overview tab after expanding game item (default).
		 * * full - all tabs after expanding game item.
		 * * extended - full details (unique to game) with all builds tabs (from all players).
		 */
		detailLevel?: 'summary' | 'overview' | 'full' | 'expanded',
	}
) => {
	// Prepare server var
	server = server.toLowerCase();
	if (!['eune', 'euw', 'na', 'lan', 'oce', 'ru', 'jp', 'br', 'tr', 'las', 'kr'].includes(server)) {
		throw new Error('Unknown server. Supported servers: EUNE, EUW, NA, LAN, OCE, RU, JP, BR, TR, LAS, KR.');
	}
	if (server == 'kr') {
		server = '';
	}
	else {
		server += '.';
	}

	// Default options
	if (!options) {
		options = {};
	}
	if (!options.detailLevel) {
		options.detailLevel = 'overview';
	}

	// Try to update if required
	// The `while` is used instead `if`, as there are 2 separate exits.
	while (options.update) {
		let summonerId; 
		console.debug(`Getting summonerId for update request`);
		{
			const { data } = await axios({
				method: 'GET',
				url: `https://${server}op.gg/summoner/userName=${userName}`,
				headers: Object.assign({
					'x-requested-with': 'XMLHttpRequest',
				}, commonHeaders), 
			});

			if (options.update !== true) {
				const document = parse(data);
				const timestamp = new Date(parseInt(document.querySelector('.LastUpdate span')!.getAttribute('data-datetime') || '') * 1000);
				if (+options.update < +timestamp) {
					console.debug(`Data is fresh enough, no update necessary (timestamp: ${timestamp.toJSON()})`);
					break;
				}
			}

			summonerId = parseInt(data.substring(data.indexOf('summonerId=') + 11, 30));
			console.debug(`summonerId: ${summonerId}`);
		}

		console.debug(`Requesting update and waiting as requested`);
		{
			const { data } = await axios({
				method: 'POST',
				url: 'https://na.op.gg/summoner/ajax/renew.json/',
				data: { summonerId },
				headers: commonHeaders,
			});
			await sleep(parseInt(data.delay));
		}

		console.debug(`Request update status and wait as requested till finished`);
		{
			while (true) {
				const { data } = await axios({
					method: 'POST',
					url: 'https://na.op.gg/summoner/ajax/renewStatus.json/',
					data: { summonerId }
				});
				const delay = parseInt(data.delay);

				if (!delay) {
					break;
				}
				await sleep(parseInt(data.delay));
			}
		}

		console.debug(`Update finished`);
		break;
	}

	// Consume main page
	console.debug(`Downloading main page`);
	const { data } = await axios({
		method: 'GET',
		url: `https://${server}op.gg/summoner/userName=${userName}`,
		headers: commonHeaders,
	});

	console.debug(`Parsing main page`);
	let document = parse(data);
	const summonerId = parseInt(document.querySelector('.GameListContainer')!.getAttribute('data-summoner-id') || '');
	let lastInfo = parseInt(document.querySelector('.GameListContainer')!.getAttribute('data-last-info') || '');

	// Prepare results object
	const result: OpggHistory = {
		updateTime: new Date(parseInt(document.querySelector('.LastUpdate span')!.getAttribute('data-datetime') || '') * 1000),
		summonerName: document.querySelector('.Name')!.innerText,
		summonerLevel: parseInt(document.querySelector('.Level')!.innerText),
		summary: {
			rankedTier: document.querySelector('.SummonerRatingMedium .TierRank')!.innerText,
			wins: parseInt(document.querySelector('.SummonerRatingMedium .WinLose .wins')?.innerText || '0'),
			loses: parseInt(document.querySelector('.SummonerRatingMedium .WinLose .losses')?.innerText || '0'),
		},
		matches: [],
	};

	while (true) {
		// Parse game matches from document
		switch (options.detailLevel) {
			case 'summary': {
				for (const gameItem of document.querySelectorAll('.GameItem')) {
					result.matches.push(parseMatchSummary(gameItem));
				}
				break;
			}
			case 'overview': {
				for (const gameItem of document.querySelectorAll('.GameItem')) {
					result.matches.push(await parseMatchOverview(gameItem, server));
				}
				break;
			}
			case 'full': {
				throw new Error('not-implemented');
			}
			case 'expanded': {
				throw new Error('not-implemented');
			}
		}

		// Request more
		console.debug(`Downloading next page`);
		const response = await axios({
			method: 'GET',
			url: `https://${server}op.gg/summoner/matches/ajax/averageAndList/startInfo=${lastInfo}&summonerId=${summonerId}`,
			headers: Object.assign({
				'x-requested-with': 'XMLHttpRequest',
			}, commonHeaders), 
			validateStatus: null,
		});
		if (response.status !== 200) {
			console.debug(`No more pages or error occurred, finished.`);
			break;
		}
		console.debug(`Parsing next page`);
		document = parse(response.data.html);
		lastInfo = response.data.lastInfo;
	}

	return result;
}