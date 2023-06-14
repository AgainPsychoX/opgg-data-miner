#!/usr/bin/env node

import fs from 'fs/promises';
import { Argument, Command, Option } from "commander";
import { collectHistory } from '@/collect/history';
import { delay, knownRegions, parseRegion, parseTimestamp, Region } from '@/common';
import { GameRawData, ParticipantRawData } from './models/Game';

// Global stuff
const program = new Command();
program
	.version('0.2.0')
	.description('Tool to scrap data from Op.GG service.')
	.option('-d, --debug', 'output extra debugging')
	// TODO: 
	// .option('--progress-bars', 'use progress bars where possible to indicate progress')
	.hook('preAction', (thisCommand, actionCommand) => {
		const options = thisCommand.opts();
		if (!options.debug) {
			// Ignore debug output if no debug flag specified
			console.debug = (..._: any[]) => {};
		}
	})
;

// History command
program
	.command('history')
	.addArgument(new Argument('<region>', 'region which on account is registered')
		.argParser(parseRegion)
	)
	.argument('<account>', 'account whom data is related')
	.description('collect match history data for selected account name at selected region')
	.option('-u, --update [maxMinutes]', 'request update before collecting data, optionally only if older than provided', '10')
	// TODO: 
	// .option('-o, --output [file]', 'file to where data should be outputted, with file extension defining format', 'data.json')
	.addOption(new Option('-a, --after <timestamp>', 'collects only matches younger than specified timestamp.')
		.argParser(parseTimestamp)
	)
	// .addOption(new Option('-b, --before <timestamp>', 'collects only matches older than specified timestamp.')
	// 	.argParser(parseTimestamp)
	// )
	.addOption(new Option('-n, --max-count <number>', 'limits max number of matches to be collected.')
		.argParser(parseInt)
	)
	// .addOption(
	// 	new Option('-q, --queue <queueType>', 'select queue type to collect data from')
	// 		.choices(['solo', 'flex', 'all'])
	// 		.default('solo')
	// )
	.action(async (region: Region | undefined, account: string, options: any, command: Command) => {
		if (!region) {
			console.error(`Unknown region. Supported regions: ${knownRegions.map(x => x.toUpperCase()).join(', ')}.`);
			return;
		}
		const games = await collectHistory(region, account, {
			update: options.update ? new Date(Date.now() - parseInt(options.update) * 60 * 1000) : false,
			maxCount: options.maxCount,
			since: options.after,
			cache: true,
		});
		await fs.writeFile('data.json', JSON.stringify(games));
		console.log('Done.');
	})
;

// Analyze losers queue
program
	.command('analyze')
	.addArgument(new Argument('<region>', 'region which on account is registered')
		.argParser(parseRegion)
	)
	.argument('<account>', 'account whom data is related')
	.description('collect match history data for selected account name at selected region')
	.addOption(new Option('-a, --after <timestamp>', 'collects only matches younger than specified timestamp.')
		.argParser(parseTimestamp)
	)
	.addOption(new Option('-n, --max-count <number>', 'limits max number of matches to be collected.')
		.argParser(parseInt)
	)
	.action(async (region: Region | undefined, account: string, options: any, command: Command) => {
		if (!region) {
			console.error(`Unknown region. Supported regions: ${knownRegions.map(x => x.toUpperCase()).join(', ')}.`);
			return;
		}
		
		const mainAccountGames = await collectHistory(region, account, {
			update: new Date(Date.now() - 10 * 60 * 1000),
			maxCount: options.maxCount,
			since: options.after,
			cache: true,
		})
		if (mainAccountGames.length == 0) {
			console.warn('No games for the account!');
			return;
		}
		const mainAccountSummonerId = mainAccountGames[0]!.participants
			.find(p => p.summoner.name.toLowerCase() === account.toLowerCase())!
			.summoner.summoner_id;

		// Find how deep match history we need access for each player the main account came across
		const oldestGameDateToFetchByParticipant: Record<string, Date> = {};
		for (const game of mainAccountGames) {
			if (game.is_remake) continue;
			const createdAt = new Date(game.created_at);
			for (const participant of game.participants) {
				const summonerId = participant.summoner.summoner_id as string;
				if (summonerId == mainAccountSummonerId) {
					continue;
				}
				const name = participant.summoner.name as string;
				const oldest = oldestGameDateToFetchByParticipant[name];
				if (oldest) {
					if (oldest > createdAt) {
						oldestGameDateToFetchByParticipant[name] = createdAt;
					}
				}
				else {
					oldestGameDateToFetchByParticipant[name] = createdAt;
				}
			}
		}

		// Download other accounts data
		const accountsCount = Object.keys(oldestGameDateToFetchByParticipant).length;
		console.log(`There are ${accountsCount} accounts for which match history will be downloaded.`);
		let accountsDownloadedCount = 0;
		const otherAccountsGames: Record<string, GameRawData[]> = {};
		const timeBehindToConsider = 8 * 60 * 60 * 1000;
		for (const [name, oldestGameDate] of Object.entries(oldestGameDateToFetchByParticipant)) {
			const games = await collectHistory(region, name, {
				update: new Date(Date.now() - 10 * 60 * 1000),
				since: new Date(+oldestGameDate - timeBehindToConsider),
				cache: true,
			});
			otherAccountsGames[name] = games;
			console.log(`Downloaded: ${++accountsDownloadedCount} / ${accountsCount}`);
			await delay(1000); // let API rest so we don't get banned
		}

		// For each game on main account, include other participants stats.
		// Try to score how likely teammates/enemies selection by the system was favorable for the main account.
		// Calculate average favorability in losing and winning games.
		let i = 0;
		for (const game of mainAccountGames) {
			if (game.is_remake) continue;
			const createdAt = new Date(game.created_at);

			type ParticipantRawDataWithMood = ParticipantRawData & { mood_score: number };
			
			const ourParticipant = (game.participants as ParticipantRawDataWithMood[]).find(p => p.summoner.summoner_id === mainAccountSummonerId)!;

			for (const participant of game.participants as ParticipantRawDataWithMood[]) {
				const summonerId = participant.summoner.summoner_id as string;
				const name = participant.summoner.name as string;

				const games = (summonerId == mainAccountSummonerId) ? mainAccountGames : otherAccountsGames[name];
				if (!games || games.length == 0) {
					console.warn(`There was problem fetching games for '${name}'`);
					continue;
				}
				const gamesBefore = games.filter(g => (new Date(g.created_at) < createdAt && !g.is_remake));
				
				let playerScore = 0;
				for (let i = 0; i < gamesBefore.length; i++) {
					const gameBefore = gamesBefore[i]!;
					const participantInGameBefore = (gameBefore.participants as any[]).find(p => p.summoner.summoner_id === summonerId);
					
					let partialScore = 0;
					if (participantInGameBefore.stats.result === "WIN") partialScore += 10; // good mood
					partialScore += participantInGameBefore.stats.op_score; // well played
					partialScore *= Math.pow(0.5, i); // make older games less important
					playerScore += partialScore;
				}

				participant.mood_score = playerScore;
			}
			
			const avgAlly = (game.participants as any[])
				.filter(p => p.team_key === ourParticipant.team_key && p !== ourParticipant)
				.map(p => p.mood_score)
				.reduce((p, c) => p + c) / 5;
			const avgEnemy = (game.participants as any[])
				.filter(p => p.team_key !== ourParticipant.team_key)
				.map(p => p.mood_score).
				reduce((p, c) => p + c) / 5;
			console.log(`Game #${++i} at ${createdAt.toLocaleString()}. Result: ${ourParticipant.stats.result}. Our mood: ${ourParticipant.mood_score.toFixed(1)}, avg ally: ${avgAlly.toFixed(1)}, avg enemy: ${avgEnemy.toFixed(1)}`);
		}

		console.log('Done.');
	})
;
// TODO: spider
// program 
// 	.command('spider')
// 	.argument('<region>', 'region which on account is registered')
// 	.argument('[account]', 'starting account the data collection should start')
// 	.option('-t, --time <duration>', 'stop collecting after specified time')
// 	.option('-n, --number-of-matches <numberOfMatches>', 'stop collecting after selected number of matches')
// 	.option('-r, --rank <minimalRank> [maxRank]', 'collect data only from selected ranks range')
// ;

// Default command
program
	.argument('<url>', 'collect data from Op.GG URL endpoint')
	.action(args => {
		console.log(`Collecting by URL ${args.url}`)
		// TODO
	})
;

program.parseAsync(process.argv);
